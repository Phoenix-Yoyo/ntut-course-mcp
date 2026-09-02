import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import * as fs from "fs";

// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo


const BASE_URL = "https://gnehs.github.io/ntut-course-crawler-node";
const DATA_SOURCE_NOTICE = "\n\nData source: gnehs/ntut-course-crawler-node (https://github.com/gnehs/ntut-course-crawler-node), served from https://gnehs.github.io/ntut-course-crawler-node. The upstream course JSON and its contents are NOT licensed under this project's MIT License. Data is provided for reference; verify official information with NTUT. Users must independently confirm rights before saving, redistributing, modifying, publicly displaying, or commercially using the data.";

function dataResponse(text: string) {
    return { content: [{ type: "text" as const, text: `${text}${DATA_SOURCE_NOTICE}` }] };
}

const cache = new Map<string, { timestamp: number, data: any }>();
const COURSE_DATASETS = [
    { file: "main.json", division: "日間部" },
    { file: "進修部.json", division: "進修部" },
    { file: "研究所(日間部、進修部、週末碩士班).json", division: "研究所" },
] as const;

async function fetchJson(p: string) {
    if (cache.has(p)) return cache.get(p)!.data;
    try {
        const url = `${BASE_URL}${p}`;
        const res = await axios.get(url, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' } });
        cache.set(p, { timestamp: Date.now(), data: res.data });
        return res.data;
    } catch (e) {
        return null;
    }
}

/**
 * The upstream crawler publishes each academic division as a separate file.
 * `main.json` only contains day-division courses, so always combine the
 * available datasets before serving a semester's courses.
 */
async function fetchSemesterCourses(year: string, sem: string) {
    const datasets = await Promise.all(COURSE_DATASETS.map(async ({ file, division }) => {
        const courses = await fetchJson(`/${year}/${sem}/${file}`);
        return Array.isArray(courses)
            ? courses.map((course: any) => ({ ...course, _division: division }))
            : [];
    }));

    // Some graduate courses appear in more than one upstream division query.
    // A course offering has a stable upstream id, which is safer than its code
    // because one course code can have several sections.
    const seen = new Set<string>();
    return datasets.flat().filter((course: any) => {
        const key = course.id || `${course.code}:${course.name?.zh}:${JSON.stringify(course.time)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function fetchAllCourses() {
    const mainIndex = await fetchJson("/main.json");
    if (!mainIndex) return [];
    const allCourses: any[] = [];
    for (const year of Object.keys(mainIndex)) {
        for (const sem of mainIndex[year]) {
            const courses = await fetchSemesterCourses(year, String(sem));
            allCourses.push(...courses.map((c: any) => ({ ...c, _yearSem: `${year}/${sem}` })));
        }
    }
    return allCourses;
}

async function backgroundUpdate() {
    try {
        const res = await axios.get(`${BASE_URL}/main.json`, { headers: { 'Cache-Control': 'no-cache' } });
        cache.set("/main.json", { timestamp: Date.now(), data: res.data });
        const years = Object.keys(res.data).sort((a, b) => parseInt(b) - parseInt(a));
        if (years.length > 0) {
            const latestYear = years[0];
            for (const sem of res.data[latestYear]) {
                await Promise.all(COURSE_DATASETS.map(async ({ file }) => {
                    const coursePath = `/${latestYear}/${sem}/${file}`;
                    try {
                        const courseRes = await axios.get(`${BASE_URL}${coursePath}`);
                        cache.set(coursePath, { timestamp: Date.now(), data: courseRes.data });
                    } catch {
                        // An older semester may not have every division file.
                    }
                }));
                const deptPath = `/${latestYear}/${sem}/department.json`;
                const deptRes = await axios.get(`${BASE_URL}${deptPath}`);
                cache.set(deptPath, { timestamp: Date.now(), data: deptRes.data });
            }
        }
        return true;
    } catch (e) {
        return false;
    }
}
backgroundUpdate();
setInterval(backgroundUpdate, 30 * 60 * 1000);

const server = new Server({ name: "ntut-course-mcp", version: "6.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            { name: "refresh_cache", description: "Manually trigger background fetch.", inputSchema: { type: "object", properties: {} } },
            { name: "get_data_freshness", description: "Check data freshness timestamp.", inputSchema: { type: "object", properties: {} } },
            { name: "export_schedule_ics", description: "Export schedule to iCalendar format.", inputSchema: { type: "object", properties: { year: { type: "string" }, sem: { type: "string" }, course_codes: { type: "array", items: { type: "string" } } }, required: ["year", "sem", "course_codes"] } },
            { name: "convert_grade_scale", description: "Convert Taiwan 100-point grades to GPA/ECTS.", inputSchema: { type: "object", properties: { score: { type: "number" } }, required: ["score"] } },
            { name: "search_courses", description: "Search for NTUT courses.", inputSchema: { type: "object", properties: { year: { type: "string" }, sem: { type: "string" }, keyword: { type: "string" }, teacher: { type: "string" }, courseType: { type: "string" }, target_departments: { type: "array", items: { type: "string" } }, target_classes: { type: "array", items: { type: "string" } }, graduate_only: { type: "boolean" }, min_credit: { type: "number" }, max_credit: { type: "number" }, language: { type: "string" }, free_time_slots: { type: "object" }, exclude_time_slots: { type: "object" } }, required: ["year", "sem"] } },
            { name: "get_course_details", description: "Get comprehensive details for a specific course.", inputSchema: { type: "object", properties: { year: { type: "string" }, sem: { type: "string" }, course_code: { type: "string" } }, required: ["year", "sem", "course_code"] } },
            { name: "validate_schedule", description: "Validates a schedule (time conflicts, credits).", inputSchema: { type: "object", properties: { year: { type: "string" }, sem: { type: "string" }, course_codes: { type: "array", items: { type: "string" } }, custom_busy_slots: { type: "object", description: "e.g. {'wed':['3','4']}" } }, required: ["year", "sem", "course_codes"] } },
            { name: "evaluate_ects_plan", description: "Audit ECTS plan for overseas grad school.", inputSchema: { type: "object", properties: { conversion_rate: { type: "number" }, categories: { type: "object" } }, required: ["conversion_rate", "categories"] } },
            { name: "check_course_restrictions", description: "Check if course is extension/graduate.", inputSchema: { type: "object", properties: { course_codes: { type: "array", items: { type: "string" } } }, required: ["course_codes"] } },
            { name: "get_departments", description: "List departments.", inputSchema: { type: "object", properties: { year: { type: "string" }, sem: { type: "string" }, keyword: { type: "string" } }, required: ["year", "sem"] } },
            { name: "get_course_history", description: "Get historical offering data.", inputSchema: { type: "object", properties: { course_name: { type: "string" }, teacher: { type: "string" } }, required: ["course_name"] } },
            { name: "get_programs", description: "List micro-programs.", inputSchema: { type: "object", properties: { year: { type: "string" }, sem: { type: "string" } }, required: ["year", "sem"] } },
            { name: "get_program_courses", description: "Get courses in a micro-program.", inputSchema: { type: "object", properties: { year: { type: "string" }, sem: { type: "string" }, program_id: { type: "string" } }, required: ["year", "sem", "program_id"] } },
            // NEW TOOLS
            { name: "check_graduation_requirements", description: "Audit if a list of taken courses fulfills graduation rules.", inputSchema: { type: "object", properties: { rules: { type: "object", description: "Format: { total_credits: 128, categories: [{name: 'Core', min_credits: 50, codes: ['A','B']}] }" }, taken_courses: { type: "array", items: { type: "string" } } }, required: ["rules", "taken_courses"] } },
            { name: "compare_courses", description: "Side-by-side comparison of multiple courses.", inputSchema: { type: "object", properties: { year: { type: "string" }, sem: { type: "string" }, course_codes: { type: "array", items: { type: "string" } } }, required: ["year", "sem", "course_codes"] } },
            { name: "check_prerequisites", description: "Check course notes for prerequisite/restriction keywords.", inputSchema: { type: "object", properties: { year: { type: "string" }, sem: { type: "string" }, course_codes: { type: "array", items: { type: "string" } } }, required: ["year", "sem", "course_codes"] } },
            { name: "get_classroom_location", description: "Extract classroom info for specific courses.", inputSchema: { type: "object", properties: { year: { type: "string" }, sem: { type: "string" }, course_codes: { type: "array", items: { type: "string" } } }, required: ["year", "sem", "course_codes"] } },
            { name: "export_markdown_appendix", description: "Export the evaluated ECTS plan to a markdown file.", inputSchema: { type: "object", properties: { file_path: { type: "string" }, ects_plan_result: { type: "object" } }, required: ["file_path", "ects_plan_result"] } }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === "refresh_cache") {
            const success = await backgroundUpdate();
            return { content: [{ type: "text", text: success ? "Cache successfully refreshed from remote." : "Failed to refresh cache." }] };
        }

        if (name === "get_data_freshness") {
            const freshness: Record<string, string> = {};
            for (const [key, value] of cache.entries()) freshness[key] = new Date(value.timestamp).toISOString();
            return { content: [{ type: "text", text: JSON.stringify(freshness, null, 2) }] };
        }

        if (name === "convert_grade_scale") {
            const { score } = args as any;
            let gpa43 = 0, gpa40 = 0, ects = "F";
            if (score >= 90) { gpa43 = 4.3; gpa40 = 4.0; ects = "A"; }
            else if (score >= 85) { gpa43 = 4.0; gpa40 = 4.0; ects = "A"; }
            else if (score >= 80) { gpa43 = 3.7; gpa40 = 3.7; ects = "B"; }
            else if (score >= 77) { gpa43 = 3.3; gpa40 = 3.3; ects = "C"; }
            else if (score >= 73) { gpa43 = 3.0; gpa40 = 3.0; ects = "C"; }
            else if (score >= 70) { gpa43 = 2.7; gpa40 = 2.7; ects = "D"; }
            else if (score >= 67) { gpa43 = 2.3; gpa40 = 2.3; ects = "D"; }
            else if (score >= 63) { gpa43 = 2.0; gpa40 = 2.0; ects = "E"; }
            else if (score >= 60) { gpa43 = 1.7; gpa40 = 1.7; ects = "E"; }
            return { content: [{ type: "text", text: JSON.stringify({ score, gpa_4_3: gpa43, gpa_4_0: gpa40, ects_grade: ects }, null, 2) }] };
        }

        if (name === "export_schedule_ics") {
            const { year, sem, course_codes } = args as any;
            const courses = await fetchSemesterCourses(year, sem);
            if (!courses) return { content: [{ type: "text", text: "Data not found." }] };
            const PERIOD_TIMES: Record<string, {s: string, e: string}> = { "1": { s: "081000", e: "090000" }, "2": { s: "091000", e: "100000" }, "3": { s: "101000", e: "110000" }, "4": { s: "111000", e: "120000" }, "Z": { s: "121000", e: "130000" }, "5": { s: "131000", e: "140000" }, "6": { s: "141000", e: "150000" }, "7": { s: "151000", e: "160000" }, "8": { s: "161000", e: "170000" }, "9": { s: "171000", e: "180000" }, "A": { s: "183000", e: "192000" }, "B": { s: "192000", e: "201000" }, "C": { s: "202000", e: "211000" }, "D": { s: "211000", e: "220000" } };
            const DAY_MAP: Record<string, string> = { "sun": "SU", "mon": "MO", "tue": "TU", "wed": "WE", "thu": "TH", "fri": "FR", "sat": "SA" };
            const now = new Date();
            let startDateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
            const baseYear = parseInt(year, 10);
            if (!isNaN(baseYear)) {
                let expectedStartYear = sem === "1" ? baseYear + 1911 : baseYear + 1912;
                let expectedStartMonth = sem === "1" ? 9 : sem === "2" ? 2 : 7;
                
                // Approximate fallback
                startDateStr = sem === "1" ? `${expectedStartYear}0901` : sem === "2" ? `${expectedStartYear}0201` : `${expectedStartYear}0701`;
                
                try {
                    const cal = await fetchJson("/calendar.json");
                    if (cal && Array.isArray(cal)) {
                        const startEvents = cal.filter((e: any) => e.summary && (e.summary.includes("開學") || e.summary.includes("正式上課")));
                        const matchedEvent = startEvents.find((e: any) => {
                            const d = new Date(e.start);
                            return d.getFullYear() === expectedStartYear && Math.abs((d.getMonth() + 1) - expectedStartMonth) <= 1;
                        });
                        if (matchedEvent) {
                            const d = new Date(matchedEvent.start);
                            const yyyy = d.getFullYear();
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const dd = String(d.getDate()).padStart(2, '0');
                            startDateStr = `${yyyy}${mm}${dd}`;
                        }
                    }
                } catch (e) {
                    // Ignore calendar fetch error, keep fallback
                }
            }

            let ics = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//NTUT Course MCP//EN\nX-WR-CALDESC:NTUT course data is not licensed under this project's MIT License; verify official information with NTUT.\nURL:https://github.com/gnehs/ntut-course-crawler-node\n";
            for (const code of course_codes) {
                const c = courses.find((x: any) => x.code === code);
                if (!c) continue;
                for (const day of Object.keys(c.time)) {
                    const periods = c.time[day];
                    if (!periods || periods.length === 0) continue;
                    for(const p of periods) {
                         const pt = PERIOD_TIMES[p];
                         if (!pt) continue;
                         ics += `BEGIN:VEVENT\nUID:${c.code}-${day}-${p}@ntut\nSUMMARY:${c.name.zh}\nRRULE:FREQ=WEEKLY;BYDAY=${DAY_MAP[day]}\nDTSTART:${startDateStr}T${pt.s}\nDTEND:${startDateStr}T${pt.e}\nLOCATION:${c.classroom.map((cr:any)=>cr.name).join(", ")}\nEND:VEVENT\n`;
                    }
                }
            }
            ics += "END:VCALENDAR";
            return { content: [{ type: "text", text: ics }] };
        }

        if (name === "search_courses") {
            const { year, sem, keyword, teacher, courseType, target_departments, target_classes, graduate_only, min_credit, max_credit, language, free_time_slots, exclude_time_slots } = args as any;
            const courses = await fetchSemesterCourses(year, sem);
            if (!courses) return { content: [{ type: "text", text: "Data not found." }] };
            let results = courses;
            if (keyword) {
                const kw = keyword.toLowerCase();
                results = results.filter((c: any) => (c.name.zh && c.name.zh.toLowerCase().includes(kw)) || (c.name.en && c.name.en.toLowerCase().includes(kw)) || (c.description?.zh && c.description.zh.toLowerCase().includes(kw)) || c.code.includes(kw));
            }
            if (teacher) results = results.filter((c: any) => c.teacher.some((t: any) => t.name.includes(teacher)));
            if (courseType) results = results.filter((c: any) => c.courseType === courseType);
            if (target_departments && target_departments.length > 0) {
                const deps = await fetchJson(`/${year}/${sem}/department.json`);
                if (deps) {
                    const validClassNames = new Set<string>();
                    for (const dep of deps) {
                        if (target_departments.some((td: string) => dep.name.includes(td))) {
                            for (const cls of dep.class) validClassNames.add(cls.name);
                        }
                    }
                    results = results.filter((c: any) => c.class.some((cls: any) => validClassNames.has(cls.name)));
                }
            }
            if (target_classes && target_classes.length > 0) {
                results = results.filter((c: any) => c.class.some((cls: any) => target_classes.some((tc: string) => cls.name.includes(tc))));
            }
            if (graduate_only) {
                results = results.filter((c: any) => c.class.some((cls: any) => cls.name.includes("碩") || cls.name.includes("博") || cls.name.includes("研")));
            }
            if (min_credit !== undefined) results = results.filter((c: any) => parseFloat(c.credit) >= min_credit);
            if (max_credit !== undefined) results = results.filter((c: any) => parseFloat(c.credit) <= max_credit);
            if (language) results = results.filter((c: any) => c.language && c.language.includes(language));

            if (free_time_slots) {
                results = results.filter((c: any) => {
                    for (const day of Object.keys(c.time)) {
                        const periods = c.time[day];
                        if (!periods || periods.length === 0) continue;
                        if (!free_time_slots[day] || !periods.every((p: string) => free_time_slots[day].includes(p))) return false;
                    }
                    return true;
                });
            }
            if (exclude_time_slots) {
                results = results.filter((c: any) => {
                    for (const day of Object.keys(exclude_time_slots)) {
                        if ((c.time[day] || []).some((p: string) => exclude_time_slots[day].includes(p))) return false;
                    }
                    return true;
                });
            }
            return dataResponse(JSON.stringify(results.slice(0, 100).map((c: any) => ({ code: c.code, name: c.name, credit: c.credit, time: c.time, courseType: c.courseType, teacher: c.teacher, division: c._division })), null, 2));
        }

        if (name === "get_course_details") {
            const { year, sem, course_code } = args as any;
            const courses = await fetchSemesterCourses(year, sem);
            if (!courses) return { content: [{ type: "text", text: "Data not found." }] };
            const course = courses.find((c: any) => c.code === course_code);
            return dataResponse(course ? JSON.stringify(course, null, 2) : `Course ${course_code} not found.`);
        }

        if (name === "validate_schedule") {
            const { year, sem, course_codes, custom_busy_slots } = args as any;
            const courses = await fetchSemesterCourses(year, sem);
            if (!courses) return { content: [{ type: "text", text: "Data not found." }] };

            const schedule = []; let totalCredits = 0; let totalHours = 0;
            const notFound = []; const conflicts: string[] = [];
            const timeMap: Record<string, Record<string, string>> = {};
            // Add custom busy slots to timeMap
            if (custom_busy_slots) {
                for (const day of Object.keys(custom_busy_slots)) {
                    if (!timeMap[day]) timeMap[day] = {};
                    for (const period of custom_busy_slots[day]) timeMap[day][period] = "USER_BUSY_SLOT";
                }
            }

            for (const code of course_codes) {
                const c = courses.find((x: any) => x.code === code);
                if (!c) { notFound.push(code); continue; }
                schedule.push({ code: c.code, name: c.name.zh, credit: c.credit, time: c.time });
                totalCredits += parseFloat(c.credit) || 0; totalHours += parseFloat(c.hours) || 0;

                for (const day of Object.keys(c.time)) {
                    if (!timeMap[day]) timeMap[day] = {};
                    for (const period of c.time[day]) {
                        if (timeMap[day][period]) conflicts.push(`Conflict on ${day} period ${period} between ${timeMap[day][period]} and ${c.code}`);
                        else timeMap[day][period] = c.code;
                    }
                }
            }
            return dataResponse(JSON.stringify({ status: conflicts.length === 0 && notFound.length === 0 ? "VALID" : "INVALID", totalCredits, totalHours, conflicts, notFound, schedule }, null, 2));
        }

        if (name === "evaluate_ects_plan") {
            const { conversion_rate, categories } = args as any;
            const allCoursesCache = await fetchAllCourses();
            const results: any = {};
            let grandTotalECTS = 0;

            for (const cat of Object.keys(categories)) {
                const codes = categories[cat];
                let catTW = 0; const catCourses = [];
                for (const code of codes) {
                    const course = allCoursesCache.find((c: any) => c.code === code);
                    if (course) {
                        const twCredits = parseFloat(course.credit) || 0;
                        catTW += twCredits;
                        catCourses.push({ code: course.code, name: course.name.zh, tw_credits: twCredits, ects: twCredits * conversion_rate, sem: course._yearSem });
                    } else {
                        catCourses.push({ code, status: "NOT_FOUND" });
                    }
                }
                const catECTS = catTW * conversion_rate;
                grandTotalECTS += catECTS;
                results[cat] = { total_tw_credits: catTW, total_ects: catECTS, courses: catCourses };
            }
            results["Grand_Total_ECTS"] = grandTotalECTS;
            return dataResponse(JSON.stringify(results, null, 2));
        }

        if (name === "check_course_restrictions") {
            const { course_codes } = args as any;
            const allCoursesCache = await fetchAllCourses();
            const results = [];
            for (const code of course_codes) {
                const course = allCoursesCache.find((c: any) => c.code === code);
                if (course) {
                    const isExt = course._division === "進修部" || course.class.some((cls: any) => cls.name.includes("進修") || cls.name.includes("夜"));
                    const isGrad = course.class.some((cls: any) => cls.name.includes("碩") || cls.name.includes("博") || cls.name.includes("研"));
                    results.push({ code, name: course.name.zh, year_sem: course._yearSem, division: course._division, is_extension_division: isExt, is_graduate_level: isGrad, classes: course.class.map((cls: any) => cls.name).join(", ") });
                }
            }
            const uniqueResults = Array.from(new Map(results.map(item => [item.code, item])).values());
            return dataResponse(JSON.stringify(uniqueResults, null, 2));
        }

        if (name === "get_departments") {
            const { year, sem, keyword } = args as any;
            const deps = await fetchJson(`/${year}/${sem}/department.json`);
            if (!deps) return { content: [{ type: "text", text: "Department data not found." }] };
            let results = deps;
            if (keyword) results = results.filter((d: any) => d.name.includes(keyword) || d.category.includes(keyword));
            return dataResponse(JSON.stringify(results, null, 2));
        }

        if (name === "get_course_history") {
            const { course_name, teacher } = args as any;
            const allCoursesCache = await fetchAllCourses();
            const kw = course_name.toLowerCase();
            let matches = allCoursesCache.filter((c: any) => (c.name.zh && c.name.zh.toLowerCase().includes(kw)) || c.code.toLowerCase().includes(kw));
            if (teacher) matches = matches.filter((c: any) => c.teacher.some((t: any) => t.name.includes(teacher)));
            const history = matches.map(m => ({ sem: m._yearSem, code: m.code, name: m.name.zh, teachers: m.teacher.map((t: any) => t.name).join(", "), people: m.people, peopleWithdraw: m.peopleWithdraw }));
            return dataResponse(JSON.stringify(history, null, 2));
        }

        if (name === "get_programs") {
            const { year, sem } = args as any;
            const programs = await fetchJson(`/${year}/${sem}/mprogram.json`);
            if (!programs) return { content: [{ type: "text", text: "No program data found." }] };
            return dataResponse(JSON.stringify(programs.map((p: any) => ({ id: p.id, name: p.name, course_count: p.course?.length || 0 })), null, 2));
        }

        if (name === "get_program_courses") {
            const { year, sem, program_id } = args as any;
            const programs = await fetchJson(`/${year}/${sem}/mprogram.json`);
            const courses = await fetchSemesterCourses(year, sem);
            if (!programs || !courses) return { content: [{ type: "text", text: "Data not found." }] };
            const program = programs.find((p: any) => p.id === program_id || p.name.includes(program_id));
            if (!program) return { content: [{ type: "text", text: `Program not found.` }] };
            const ids = new Set(program.course);
            return dataResponse(JSON.stringify({ program_name: program.name, courses: courses.filter((c: any) => ids.has(c.id)).map((c: any) => ({ code: c.code, name: c.name.zh, credit: c.credit, time: c.time })) }, null, 2));
        }

        // --- NEW TOOLS ---

        if (name === "check_graduation_requirements") {
            const { rules, taken_courses } = args as any;
            const allCoursesCache = await fetchAllCourses();
            let total_taken_credits = 0;
            const report: any = { categories: [] };
            const used_courses = new Set<string>();

            for (const cat of rules.categories) {
                let cat_credits = 0;
                const courses = [];
                for (const code of taken_courses) {
                    // if course is specifically required in this category
                    if (cat.codes && cat.codes.includes(code)) {
                        if (!used_courses.has(code)) {
                            const course = allCoursesCache.find((c: any) => c.code === code);
                            if (course) {
                                cat_credits += parseFloat(course.credit) || 0;
                                total_taken_credits += parseFloat(course.credit) || 0;
                                courses.push({ code, name: course.name.zh, credit: course.credit });
                                used_courses.add(code);
                            }
                        }
                    }
                }
                report.categories.push({
                    name: cat.name,
                    required_credits: cat.min_credits,
                    achieved_credits: cat_credits,
                    status: cat_credits >= cat.min_credits ? "PASSED" : "FAILED",
                    shortfall: Math.max(0, cat.min_credits - cat_credits),
                    applied_courses: courses
                });
            }
            // Unused courses go to electives if rules allow, simplified here
            const unused = taken_courses.filter((c: string) => !used_courses.has(c)).map((code: string) => {
                const course = allCoursesCache.find((c: any) => c.code === code);
                if (course) {
                    total_taken_credits += parseFloat(course.credit) || 0;
                    return { code, name: course.name.zh, credit: course.credit };
                }
                return { code, status: "NOT_FOUND" };
            });

            report.total_credits_required = rules.total_credits;
            report.total_credits_achieved = total_taken_credits;
            report.total_status = total_taken_credits >= rules.total_credits ? "PASSED" : "FAILED";
            report.unused_courses = unused;

            return dataResponse(JSON.stringify(report, null, 2));
        }

        if (name === "compare_courses") {
            const { year, sem, course_codes } = args as any;
            const courses = await fetchSemesterCourses(year, sem);
            if (!courses) return { content: [{ type: "text", text: "Data not found." }] };
            const res = course_codes.map((code: string) => {
                const c = courses.find((x: any) => x.code === code);
                if (!c) return { code, status: "NOT_FOUND" };
                return {
                    code: c.code, name: c.name.zh,
                    credit: c.credit, hours: c.hours,
                    courseType: c.courseType,
                    teachers: c.teacher.map((t:any)=>t.name).join(", "),
                    time: c.time,
                    people: `${c.people} (Withdraw: ${c.peopleWithdraw})`
                };
            });
            return dataResponse(JSON.stringify(res, null, 2));
        }

        if (name === "check_prerequisites") {
            const { year, sem, course_codes } = args as any;
            const courses = await fetchSemesterCourses(year, sem);
            if (!courses) return { content: [{ type: "text", text: "Data not found." }] };
            const warnings = [];
            const keywords = ["先修", "擋修", "限", "基礎", "prerequisite"];
            for (const code of course_codes) {
                const c = courses.find((x: any) => x.code === code);
                if (!c) continue;
                const textToSearch = `${c.name.zh} ${c.notes} ${c.description?.zh || ""}`;
                for (const kw of keywords) {
                    if (textToSearch.includes(kw)) {
                        warnings.push({ code, name: c.name.zh, keyword_found: kw, notes: c.notes });
                        break;
                    }
                }
            }
            return dataResponse(JSON.stringify({ warnings_found: warnings.length, details: warnings }, null, 2));
        }

        if (name === "get_classroom_location") {
            const { year, sem, course_codes } = args as any;
            const courses = await fetchSemesterCourses(year, sem);
            if (!courses) return { content: [{ type: "text", text: "Data not found." }] };
            const res = course_codes.map((code: string) => {
                const c = courses.find((x: any) => x.code === code);
                if (!c) return { code, status: "NOT_FOUND" };
                return { code, name: c.name.zh, classrooms: c.classroom.map((cr:any)=>`${cr.name} (${cr.room})`) };
            });
            return dataResponse(JSON.stringify(res, null, 2));
        }

        if (name === "export_markdown_appendix") {
            const { file_path, ects_plan_result } = args as any;
            let md = `# ECTS Study Plan Appendix\n\n`;
            md += `*Generated automatically by NTUT Course MCP*\n\n`;
            md += `## Grand Total ECTS: ${ects_plan_result.Grand_Total_ECTS}\n\n`;
            for (const cat of Object.keys(ects_plan_result)) {
                if (cat === "Grand_Total_ECTS") continue;
                const data = ects_plan_result[cat];
                md += `### Category: ${cat}\n`;
                md += `- **Total ECTS**: ${data.total_ects}\n`;
                md += `- **Total NTUT Credits**: ${data.total_tw_credits}\n\n`;
                md += `| Course Code | Name | TW Credits | ECTS | Semester |\n`;
                md += `|---|---|---|---|---|\n`;
                for (const c of data.courses) {
                    if (c.status === "NOT_FOUND") {
                        md += `| ${c.code} | (Not Found) | 0 | 0 | - |\n`;
                    } else {
                        md += `| ${c.code} | ${c.name} | ${c.tw_credits} | ${c.ects} | ${c.sem} |\n`;
                    }
                }
                md += `\n`;
            }
            md += `---\n\n${DATA_SOURCE_NOTICE.trim()}\n`;
            fs.writeFileSync(file_path, md, "utf8");
            return { content: [{ type: "text", text: `Successfully exported markdown appendix to ${file_path}` }] };
        }

        return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Error executing ${name}: ${error.message}` }] };
    }
});

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
