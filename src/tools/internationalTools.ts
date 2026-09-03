// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import * as fs from "fs";
import { ToolDefinition } from "../types/index.js";
import { defaultCourseService } from "../services/courseService.js";
import { ValidationError } from "../types/errors.js";
import { DATA_SOURCE_NOTICE } from "../utils/response.js";

export const internationalTools: ToolDefinition[] = [
    {
        name: "convert_grade_scale",
        description: "Convert Taiwan percentage grades (0-100) to GPA 4.3, GPA 4.0, and European ECTS letter grades (A-F).",
        inputSchema: {
            type: "object",
            properties: {
                score: { type: "number", description: "Numerical percentage score (0-100)" }
            },
            required: ["score"]
        },
        handler: async (args: any) => {
            const { score } = args;
            if (typeof score !== "number" || score < 0 || score > 100) {
                throw new ValidationError("score", "成績必須介於 0 到 100 之間。");
            }

            let gpa43 = 0,
                gpa40 = 0,
                ects = "F";

            if (score >= 90) {
                gpa43 = 4.3;
                gpa40 = 4.0;
                ects = "A";
            } else if (score >= 85) {
                gpa43 = 4.0;
                gpa40 = 4.0;
                ects = "A";
            } else if (score >= 80) {
                gpa43 = 3.7;
                gpa40 = 3.7;
                ects = "B";
            } else if (score >= 77) {
                gpa43 = 3.3;
                gpa40 = 3.3;
                ects = "C";
            } else if (score >= 73) {
                gpa43 = 3.0;
                gpa40 = 3.0;
                ects = "C";
            } else if (score >= 70) {
                gpa43 = 2.7;
                gpa40 = 2.7;
                ects = "D";
            } else if (score >= 67) {
                gpa43 = 2.3;
                gpa40 = 2.3;
                ects = "D";
            } else if (score >= 63) {
                gpa43 = 2.0;
                gpa40 = 2.0;
                ects = "E";
            } else if (score >= 60) {
                gpa43 = 1.7;
                gpa40 = 1.7;
                ects = "E";
            }

            return {
                score,
                gpa_4_3: gpa43,
                gpa_4_0: gpa40,
                ects_grade: ects,
                scale_info: "NTUT Official Grading Scale Conversion (Passing threshold: 60 for undergraduate, 70 for graduate)"
            };
        }
    },
    {
        name: "evaluate_ects_plan",
        description: "Audit ECTS study plan for overseas master's application, converting NTUT credits by custom ratio into European credits by domain.",
        inputSchema: {
            type: "object",
            properties: {
                conversion_rate: {
                    type: "number",
                    description: "Conversion ratio from TW credit to ECTS (e.g. 1.5, meaning 1 TW credit = 1.5 ECTS)"
                },
                categories: {
                    type: "object",
                    description: "Object mapping domain category names to arrays of course codes (e.g. {'Mathematics': ['310001', '310002']})"
                }
            },
            required: ["conversion_rate", "categories"]
        },
        handler: async (args: any) => {
            const { conversion_rate, categories } = args;
            if (typeof conversion_rate !== "number" || !categories || typeof categories !== "object") {
                throw new ValidationError("conversion_rate/categories", "請提供有效之 conversion_rate 數值與 categories 分類物件。");
            }

            const allCourses = await defaultCourseService.getAllCourses();
            const results: Record<string, any> = {};
            let grandTotalECTS = 0;

            for (const cat of Object.keys(categories)) {
                const codes = categories[cat];
                if (!Array.isArray(codes)) continue;

                let catTW = 0;
                const catCourses = [];

                for (const code of codes) {
                    const course = allCourses.find((c) => c.code === code);
                    if (course) {
                        const twCredits = parseFloat(course.credit) || 0;
                        catTW += twCredits;
                        catCourses.push({
                            code: course.code,
                            name: course.name.zh,
                            tw_credits: twCredits,
                            ects: Math.round(twCredits * conversion_rate * 100) / 100,
                            sem: course._yearSem
                        });
                    } else {
                        catCourses.push({ code, status: "NOT_FOUND", suggestion: "歷史資料庫中無此課號" });
                    }
                }

                const catECTS = Math.round(catTW * conversion_rate * 100) / 100;
                grandTotalECTS += catECTS;
                results[cat] = {
                    total_tw_credits: catTW,
                    total_ects: catECTS,
                    courses: catCourses
                };
            }

            results["Grand_Total_ECTS"] = Math.round(grandTotalECTS * 100) / 100;
            return results;
        }
    },
    {
        name: "export_markdown_appendix",
        description: "Export the evaluated ECTS plan to a markdown appendix document for study abroad applications.",
        inputSchema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Local destination file path (e.g. './ects_appendix.md')" },
                ects_plan_result: { type: "object", description: "Result object previously produced by evaluate_ects_plan" }
            },
            required: ["file_path", "ects_plan_result"]
        },
        handler: async (args: any) => {
            const { file_path, ects_plan_result } = args;
            if (!file_path || !ects_plan_result) {
                throw new ValidationError("file_path/ects_plan_result", "請提供匯出目標檔案路徑與 ECTS 計劃結果物件。");
            }

            let md = `# ECTS Study Plan Appendix\n\n`;
            md += `*Generated automatically by NTUT Course MCP Server*\n\n`;
            md += `## Grand Total ECTS: ${ects_plan_result.Grand_Total_ECTS || 0}\n\n`;

            for (const cat of Object.keys(ects_plan_result)) {
                if (cat === "Grand_Total_ECTS") continue;
                const data = ects_plan_result[cat];
                md += `### Category: ${cat}\n`;
                md += `- **Total ECTS**: ${data.total_ects}\n`;
                md += `- **Total NTUT Credits**: ${data.total_tw_credits}\n\n`;
                md += `| Course Code | Name | TW Credits | ECTS | Semester |\n`;
                md += `|---|---|---|---|---|\n`;

                for (const c of data.courses || []) {
                    if (c.status === "NOT_FOUND") {
                        md += `| ${c.code} | (Not Found) | 0 | 0 | - |\n`;
                    } else {
                        md += `| ${c.code} | ${c.name} | ${c.tw_credits} | ${c.ects} | ${c.sem || "-"} |\n`;
                    }
                }
                md += `\n`;
            }

            md += `---\n\n${DATA_SOURCE_NOTICE}\n`;
            fs.writeFileSync(file_path, md, "utf8");

            return {
                status: "SUCCESS",
                message: `成功將 ECTS 留學學分附錄報表匯出至 ${file_path}。`,
                destination: file_path
            };
        }
    }
];
