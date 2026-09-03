// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import { ToolDefinition } from "../types/index.js";
import { defaultCourseService } from "../services/courseService.js";
import { ValidationError, CourseNotFoundError } from "../types/errors.js";

export const courseSearchTools: ToolDefinition[] = [
    {
        name: "search_courses",
        description: "Search for NTUT courses with multi-dimensional filtering (keyword, department, schedule, credits, teacher, etc.).",
        inputSchema: {
            type: "object",
            properties: {
                year: { type: "string", description: "Academic year (Taiwan calendar, e.g. '112')" },
                sem: { type: "string", description: "Semester ('1' or '2')" },
                keyword: { type: "string", description: "Search keyword in course name, description, or code" },
                teacher: { type: "string", description: "Teacher name filter" },
                courseType: { type: "string", description: "'必修' or '選修'" },
                target_departments: { type: "array", items: { type: "string" }, description: "Target department names (e.g. ['資訊工程系'])" },
                target_classes: { type: "array", items: { type: "string" }, description: "Target class names (e.g. ['資工三'])" },
                graduate_only: { type: "boolean", description: "Filter for graduate-level courses only" },
                min_credit: { type: "number", description: "Minimum credits" },
                max_credit: { type: "number", description: "Maximum credits" },
                language: { type: "string", description: "Course language filter (e.g. '英語')" },
                free_time_slots: {
                    type: "object",
                    description: "Only include courses whose time slots fall within these available slots (e.g. {'mon':['1','2','3']})"
                },
                exclude_time_slots: {
                    type: "object",
                    description: "Exclude courses that collide with these busy time slots (e.g. {'wed':['5','6']})"
                }
            },
            required: ["year", "sem"]
        },
        handler: async (args: any) => {
            const {
                year,
                sem,
                keyword,
                teacher,
                courseType,
                target_departments,
                target_classes,
                graduate_only,
                min_credit,
                max_credit,
                language,
                free_time_slots,
                exclude_time_slots
            } = args;

            if (!year || !sem) {
                throw new ValidationError("year/sem", "學年 (year) 與學期 (sem) 為必填參數。");
            }

            const courses = await defaultCourseService.getSemesterCourses(year, sem);
            let results = courses;

            if (keyword) {
                const kw = keyword.toLowerCase();
                results = results.filter(
                    (c) =>
                        (c.name.zh && c.name.zh.toLowerCase().includes(kw)) ||
                        (c.name.en && c.name.en.toLowerCase().includes(kw)) ||
                        (c.description?.zh && c.description.zh.toLowerCase().includes(kw)) ||
                        c.code.includes(kw)
                );
            }

            if (teacher) {
                results = results.filter((c) => c.teacher.some((t) => t.name && t.name.includes(teacher)));
            }

            if (courseType) {
                results = results.filter((c) => c.courseType === courseType);
            }

            if (target_departments && target_departments.length > 0) {
                const deps = await defaultCourseService.getDepartments(year, sem);
                const validClassNames = new Set<string>();
                for (const dep of deps) {
                    if (target_departments.some((td: string) => dep.name.includes(td))) {
                        for (const cls of dep.class) validClassNames.add(cls.name);
                    }
                }
                results = results.filter((c) => c.class.some((cls) => validClassNames.has(cls.name)));
            }

            if (target_classes && target_classes.length > 0) {
                results = results.filter((c) =>
                    c.class.some((cls) => target_classes.some((tc: string) => cls.name.includes(tc)))
                );
            }

            if (graduate_only) {
                results = results.filter((c) =>
                    c.class.some((cls) => cls.name.includes("碩") || cls.name.includes("博") || cls.name.includes("研"))
                );
            }

            if (min_credit !== undefined) {
                results = results.filter((c) => parseFloat(c.credit) >= min_credit);
            }

            if (max_credit !== undefined) {
                results = results.filter((c) => parseFloat(c.credit) <= max_credit);
            }

            if (language) {
                results = results.filter((c) => c.language && c.language.includes(language));
            }

            if (free_time_slots) {
                results = results.filter((c) => {
                    for (const day of Object.keys(c.time)) {
                        const periods = c.time[day];
                        if (!periods || periods.length === 0) continue;
                        if (!free_time_slots[day] || !periods.every((p: string) => free_time_slots[day].includes(p))) {
                            return false;
                        }
                    }
                    return true;
                });
            }

            if (exclude_time_slots) {
                results = results.filter((c) => {
                    for (const day of Object.keys(exclude_time_slots)) {
                        if ((c.time[day] || []).some((p: string) => exclude_time_slots[day].includes(p))) {
                            return false;
                        }
                    }
                    return true;
                });
            }

            return results.slice(0, 100).map((c) => ({
                code: c.code,
                name: c.name,
                credit: c.credit,
                time: c.time,
                courseType: c.courseType,
                teacher: c.teacher,
                division: c._division
            }));
        }
    },
    {
        name: "get_course_details",
        description: "Get comprehensive details for a specific course code (syllabus, notes, schedule, classroom).",
        inputSchema: {
            type: "object",
            properties: {
                year: { type: "string" },
                sem: { type: "string" },
                course_code: { type: "string" }
            },
            required: ["year", "sem", "course_code"]
        },
        handler: async (args: any) => {
            const { year, sem, course_code } = args;
            if (!year || !sem || !course_code) {
                throw new ValidationError("year/sem/course_code", "學年、學期與課號為必填參數。");
            }
            const courses = await defaultCourseService.getSemesterCourses(year, sem);
            const course = courses.find((c) => c.code === course_code);
            if (!course) {
                throw new CourseNotFoundError([course_code], year, sem);
            }
            return course;
        }
    },
    {
        name: "compare_courses",
        description: "Side-by-side comparison of multiple courses (credits, teachers, schedules, student capacity, withdrawal rate).",
        inputSchema: {
            type: "object",
            properties: {
                year: { type: "string" },
                sem: { type: "string" },
                course_codes: { type: "array", items: { type: "string" } }
            },
            required: ["year", "sem", "course_codes"]
        },
        handler: async (args: any) => {
            const { year, sem, course_codes } = args;
            if (!year || !sem || !Array.isArray(course_codes) || course_codes.length === 0) {
                throw new ValidationError("course_codes", "請提供欲比較的課號清單陣列。");
            }

            const courses = await defaultCourseService.getSemesterCourses(year, sem);
            return course_codes.map((code: string) => {
                const c = courses.find((x) => x.code === code);
                if (!c) {
                    return {
                        code,
                        status: "NOT_FOUND",
                        message: `在 ${year}/${sem} 學期中查無課號 ${code}`
                    };
                }
                return {
                    code: c.code,
                    name: c.name.zh,
                    credit: c.credit,
                    hours: c.hours,
                    courseType: c.courseType,
                    teachers: c.teacher.map((t) => t.name).join(", "),
                    time: c.time,
                    people: `${c.people} (Withdraw: ${c.peopleWithdraw})`
                };
            });
        }
    },
    {
        name: "get_course_history",
        description: "Get historical offering and enrollment data across all recorded semesters by course name or teacher.",
        inputSchema: {
            type: "object",
            properties: {
                course_name: { type: "string", description: "Course name keyword or course code" },
                teacher: { type: "string", description: "Optional teacher name filter" }
            },
            required: ["course_name"]
        },
        handler: async (args: any) => {
            const { course_name, teacher } = args;
            if (!course_name) {
                throw new ValidationError("course_name", "請提供欲查詢的課程名稱關鍵字或代碼。");
            }

            const allCourses = await defaultCourseService.getAllCourses();
            const kw = course_name.toLowerCase();
            let matches = allCourses.filter(
                (c) =>
                    (c.name.zh && c.name.zh.toLowerCase().includes(kw)) ||
                    (c.name.en && c.name.en.toLowerCase().includes(kw)) ||
                    c.code.toLowerCase().includes(kw)
            );

            if (teacher) {
                matches = matches.filter((c) => c.teacher.some((t) => t.name.includes(teacher)));
            }

            return matches.map((m) => ({
                sem: m._yearSem,
                code: m.code,
                name: m.name.zh,
                teachers: m.teacher.map((t) => t.name).join(", "),
                people: m.people,
                peopleWithdraw: m.peopleWithdraw
            }));
        }
    }
];
