// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import { ToolDefinition } from "../types/index.js";
import { defaultCourseService } from "../services/courseService.js";
import { GraduationAuditor } from "../utils/graduationAuditor.js";
import { PrerequisiteParser } from "../utils/prerequisiteParser.js";
import { ValidationError } from "../types/errors.js";

export const academicAuditTools: ToolDefinition[] = [
    {
        name: "check_graduation_requirements",
        description: "Comprehensive graduation requirement audit supporting cross-category elective overflow, category caps, duplicate retake filtering, and priority matching.",
        inputSchema: {
            type: "object",
            properties: {
                rules: {
                    type: "object",
                    description: "Graduation rules specification: { total_credits: 128, categories: [{ id: 'core', name: '校定必修', min_credits: 28, codes: ['310001', '310002'], overflow_to: 'free_electives' }], allow_elective_overflow: true }",
                    properties: {
                        total_credits: { type: "number" },
                        categories: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "string" },
                                    name: { type: "string" },
                                    min_credits: { type: "number" },
                                    max_credits: { type: "number", description: "Cap on accepted credits for this category" },
                                    codes: { type: "array", items: { type: "string" } },
                                    course_names: { type: "array", items: { type: "string" } },
                                    course_types: { type: "array", items: { type: "string" } },
                                    departments: { type: "array", items: { type: "string" } },
                                    overflow_to: { type: "string", description: "Target category id or name to transfer excess credits" },
                                    allow_any_course: { type: "boolean", description: "Accept any remaining elective course" },
                                    priority: { type: "number" }
                                },
                                required: ["name", "min_credits"]
                            }
                        },
                        allow_elective_overflow: { type: "boolean", default: true },
                        non_credit_requirements: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    required: { type: "boolean" }
                                }
                            }
                        }
                    },
                    required: ["total_credits", "categories"]
                },
                taken_courses: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of completed course codes (e.g. ['318274', '3103021'])"
                }
            },
            required: ["rules", "taken_courses"]
        },
        handler: async (args: any) => {
            const { rules, taken_courses } = args;
            if (!rules || !Array.isArray(rules.categories) || !Array.isArray(taken_courses)) {
                throw new ValidationError("rules/taken_courses", "請提供完整的 rules 規格物件與 taken_courses 陣列。");
            }

            const allCourses = await defaultCourseService.getAllCourses();
            return GraduationAuditor.audit(rules, taken_courses, allCourses);
        }
    },
    {
        name: "check_prerequisites",
        description: "Parse course prerequisites and restrictions via structured syntactic analysis. Checks against student taken courses and department/grade profile, avoiding false positives.",
        inputSchema: {
            type: "object",
            properties: {
                year: { type: "string", description: "Academic year (e.g. '112')" },
                sem: { type: "string", description: "Semester ('1' or '2')" },
                course_codes: {
                    type: "array",
                    items: { type: "string" },
                    description: "Target course codes to inspect"
                },
                taken_courses: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional: student completed course codes or names to audit prerequisite fulfillment"
                },
                student_profile: {
                    type: "object",
                    description: "Optional: student profile for enrollment restriction check",
                    properties: {
                        department: { type: "string", description: "e.g. '資訊工程系'" },
                        grade: { type: "string", description: "e.g. '大二', '大三', '碩一'" },
                        division: { type: "string", description: "e.g. '日間部', '進修部'" }
                    }
                }
            },
            required: ["year", "sem", "course_codes"]
        },
        handler: async (args: any) => {
            const { year, sem, course_codes, taken_courses, student_profile } = args;
            if (!year || !sem || !Array.isArray(course_codes)) {
                throw new ValidationError("year/sem/course_codes", "請提供學年、學期與課號清單。");
            }

            const courses = await defaultCourseService.getSemesterCourses(year, sem);
            const audits = [];
            let totalWarnings = 0;

            for (const code of course_codes) {
                const c = courses.find((x) => x.code === code);
                if (!c) {
                    audits.push({
                        course_code: code,
                        course_name: "查無此課程",
                        has_restrictions: false,
                        risk_level: "HIGH" as const,
                        parsed_rules: [],
                        unmet_requirements: [`在 ${year}/${sem} 學期中查無課號 ${code}`]
                    });
                    totalWarnings++;
                    continue;
                }

                const audit = PrerequisiteParser.auditCourse(c, taken_courses || [], student_profile);
                if (audit.risk_level !== "NONE") {
                    totalWarnings++;
                }
                audits.push(audit);
            }

            return {
                audited_count: audits.length,
                total_risk_courses: totalWarnings,
                overall_status: totalWarnings === 0 ? "PASSED_NO_RESTRICTIONS" : "RESTRICTIONS_DETECTED",
                courses: audits
            };
        }
    },
    {
        name: "check_course_restrictions",
        description: "Check if courses belong to extension division (進修部) or graduate level (碩博班), alerting daytime undergraduate students.",
        inputSchema: {
            type: "object",
            properties: {
                course_codes: { type: "array", items: { type: "string" } }
            },
            required: ["course_codes"]
        },
        handler: async (args: any) => {
            const { course_codes } = args;
            if (!Array.isArray(course_codes) || course_codes.length === 0) {
                throw new ValidationError("course_codes", "請提供欲檢查的課號陣列。");
            }

            const allCourses = await defaultCourseService.getAllCourses();
            const results = [];

            for (const code of course_codes) {
                const course = allCourses.find((c) => c.code === code);
                if (course) {
                    const isExt =
                        course._division === "進修部" ||
                        course.class.some((cls) => cls.name.includes("進修") || cls.name.includes("夜"));
                    const isGrad = course.class.some(
                        (cls) => cls.name.includes("碩") || cls.name.includes("博") || cls.name.includes("研")
                    );
                    results.push({
                        code,
                        name: course.name.zh,
                        year_sem: course._yearSem,
                        division: course._division,
                        is_extension_division: isExt,
                        is_graduate_level: isGrad,
                        classes: course.class.map((cls) => cls.name).join(", ")
                    });
                }
            }

            // Deduplicate results by code
            return Array.from(new Map(results.map((item) => [item.code, item])).values());
        }
    }
];
