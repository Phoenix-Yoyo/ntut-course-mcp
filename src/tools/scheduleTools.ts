// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import { ToolDefinition } from "../types/index.js";
import { defaultCourseService } from "../services/courseService.js";
import { defaultApiClient } from "../services/apiClient.js";
import { ValidationError } from "../types/errors.js";

const PERIOD_TIMES: Record<string, { s: string; e: string }> = {
    "1": { s: "081000", e: "090000" },
    "2": { s: "091000", e: "100000" },
    "3": { s: "101000", e: "110000" },
    "4": { s: "111000", e: "120000" },
    "Z": { s: "121000", e: "130000" },
    "5": { s: "131000", e: "140000" },
    "6": { s: "141000", e: "150000" },
    "7": { s: "151000", e: "160000" },
    "8": { s: "161000", e: "170000" },
    "9": { s: "171000", e: "180000" },
    "A": { s: "183000", e: "192000" },
    "B": { s: "192000", e: "201000" },
    "C": { s: "202000", e: "211000" },
    "D": { s: "211000", e: "220000" }
};

const DAY_MAP: Record<string, string> = {
    sun: "SU",
    mon: "MO",
    tue: "TU",
    wed: "WE",
    thu: "TH",
    fri: "FR",
    sat: "SA"
};

export const scheduleTools: ToolDefinition[] = [
    {
        name: "validate_schedule",
        description: "Validates a schedule (checks time conflicts against courses and custom busy slots, computes credits and hours).",
        inputSchema: {
            type: "object",
            properties: {
                year: { type: "string" },
                sem: { type: "string" },
                course_codes: { type: "array", items: { type: "string" } },
                custom_busy_slots: {
                    type: "object",
                    description: "User busy times to check against, e.g. {'wed':['3','4'], 'fri':['5']}"
                }
            },
            required: ["year", "sem", "course_codes"]
        },
        handler: async (args: any) => {
            const { year, sem, course_codes, custom_busy_slots } = args;
            if (!year || !sem || !Array.isArray(course_codes)) {
                throw new ValidationError("year/sem/course_codes", "請輸入完整的學年、學期與選課代碼陣列。");
            }

            const courses = await defaultCourseService.getSemesterCourses(year, sem);
            const schedule: any[] = [];
            let totalCredits = 0;
            let totalHours = 0;
            const notFound: string[] = [];
            const conflicts: string[] = [];
            const timeMap: Record<string, Record<string, string>> = {};

            // Register custom busy slots
            if (custom_busy_slots && typeof custom_busy_slots === "object") {
                for (const day of Object.keys(custom_busy_slots)) {
                    if (!timeMap[day]) timeMap[day] = {};
                    for (const period of custom_busy_slots[day] || []) {
                        timeMap[day][period] = "自訂忙碌時段 (USER_BUSY_SLOT)";
                    }
                }
            }

            for (const code of course_codes) {
                const c = courses.find((x) => x.code === code);
                if (!c) {
                    notFound.push(code);
                    continue;
                }

                schedule.push({
                    code: c.code,
                    name: c.name.zh,
                    credit: c.credit,
                    hours: c.hours,
                    time: c.time
                });

                totalCredits += parseFloat(c.credit) || 0;
                totalHours += parseFloat(c.hours) || 0;

                for (const day of Object.keys(c.time || {})) {
                    if (!timeMap[day]) timeMap[day] = {};
                    for (const period of c.time[day] || []) {
                        if (timeMap[day][period]) {
                            conflicts.push(
                                `星期${day.toUpperCase()} 第 ${period} 節衝突：${timeMap[day][period]} 與 ${c.name.zh} (${c.code})`
                            );
                        } else {
                            timeMap[day][period] = `${c.name.zh} (${c.code})`;
                        }
                    }
                }
            }

            const isValid = conflicts.length === 0 && notFound.length === 0;
            return {
                status: isValid ? "VALID" : "INVALID",
                is_conflict_free: conflicts.length === 0,
                totalCredits,
                totalHours,
                conflicts,
                notFound,
                schedule
            };
        }
    },
    {
        name: "export_schedule_ics",
        description: "Export schedule to standard iCalendar (.ics) format compatible with Google Calendar and Apple Calendar.",
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
            if (!year || !sem || !Array.isArray(course_codes)) {
                throw new ValidationError("year/sem/course_codes", "請提供欲匯出行事曆之學年、學期與課號陣列。");
            }

            const courses = await defaultCourseService.getSemesterCourses(year, sem);
            const now = new Date();
            let startDateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
                now.getDate()
            ).padStart(2, "0")}`;

            const baseYear = parseInt(year, 10);
            if (!isNaN(baseYear)) {
                const expectedStartYear = sem === "1" ? baseYear + 1911 : baseYear + 1912;
                const expectedStartMonth = sem === "1" ? 9 : sem === "2" ? 2 : 7;
                startDateStr =
                    sem === "1"
                        ? `${expectedStartYear}0901`
                        : sem === "2"
                        ? `${expectedStartYear}0201`
                        : `${expectedStartYear}0701`;

                try {
                    const cal = await defaultApiClient.fetchJson("/calendar.json", { allow404: true });
                    if (cal && Array.isArray(cal)) {
                        const startEvents = cal.filter(
                            (e: any) => e.summary && (e.summary.includes("開學") || e.summary.includes("正式上課"))
                        );
                        const matchedEvent = startEvents.find((e: any) => {
                            const d = new Date(e.start);
                            return (
                                d.getFullYear() === expectedStartYear &&
                                Math.abs(d.getMonth() + 1 - expectedStartMonth) <= 1
                            );
                        });
                        if (matchedEvent) {
                            const d = new Date(matchedEvent.start);
                            startDateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
                                d.getDate()
                            ).padStart(2, "0")}`;
                        }
                    }
                } catch {
                    // Fallback to approximated date
                }
            }

            let ics =
                "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//NTUT Course MCP//EN\n" +
                "X-WR-CALDESC:NTUT course data is not licensed under this project's MIT License; verify official information with NTUT.\n" +
                "URL:https://github.com/gnehs/ntut-course-crawler-node\n";

            for (const code of course_codes) {
                const c = courses.find((x) => x.code === code);
                if (!c) continue;

                for (const day of Object.keys(c.time || {})) {
                    const periods = c.time[day];
                    if (!periods || periods.length === 0) continue;
                    const byDay = DAY_MAP[day] || "MO";

                    for (const p of periods) {
                        const pt = PERIOD_TIMES[p];
                        if (!pt) continue;
                        const locations = (c.classroom || []).map((cr: any) => cr.name).join(", ");
                        ics +=
                            `BEGIN:VEVENT\n` +
                            `UID:${c.code}-${day}-${p}@ntut\n` +
                            `SUMMARY:${c.name.zh}\n` +
                            `RRULE:FREQ=WEEKLY;BYDAY=${byDay}\n` +
                            `DTSTART:${startDateStr}T${pt.s}\n` +
                            `DTEND:${startDateStr}T${pt.e}\n` +
                            `LOCATION:${locations}\n` +
                            `END:VEVENT\n`;
                    }
                }
            }

            ics += "END:VCALENDAR";
            return ics;
        }
    },
    {
        name: "get_classroom_location",
        description: "Extract classroom and building information for specific courses.",
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
            if (!year || !sem || !Array.isArray(course_codes)) {
                throw new ValidationError("year/sem/course_codes", "請提供學年、學期與欲查詢的課號清單。");
            }

            const courses = await defaultCourseService.getSemesterCourses(year, sem);
            return course_codes.map((code: string) => {
                const c = courses.find((x) => x.code === code);
                if (!c) {
                    return {
                        code,
                        status: "NOT_FOUND",
                        message: `在 ${year}/${sem} 查無此課號`
                    };
                }
                return {
                    code: c.code,
                    name: c.name.zh,
                    classrooms: (c.classroom || []).map((cr: any) => `${cr.name} (${cr.room || "無特定教室編號"})`)
                };
            });
        }
    }
];
