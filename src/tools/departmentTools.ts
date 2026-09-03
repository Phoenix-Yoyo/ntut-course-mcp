// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import { ToolDefinition } from "../types/index.js";
import { defaultCourseService } from "../services/courseService.js";
import { ValidationError } from "../types/errors.js";

export const departmentTools: ToolDefinition[] = [
    {
        name: "get_departments",
        description: "List academic departments, colleges, and corresponding class divisions for a semester.",
        inputSchema: {
            type: "object",
            properties: {
                year: { type: "string" },
                sem: { type: "string" },
                keyword: { type: "string", description: "Optional filter keyword (e.g. '電資', '資工')" }
            },
            required: ["year", "sem"]
        },
        handler: async (args: any) => {
            const { year, sem, keyword } = args;
            if (!year || !sem) {
                throw new ValidationError("year/sem", "請提供學年 (year) 與學期 (sem)。");
            }
            return defaultCourseService.getDepartments(year, sem, keyword);
        }
    },
    {
        name: "get_programs",
        description: "List all available interdisciplinary micro-programs (跨領域微學程) for a semester.",
        inputSchema: {
            type: "object",
            properties: {
                year: { type: "string" },
                sem: { type: "string" }
            },
            required: ["year", "sem"]
        },
        handler: async (args: any) => {
            const { year, sem } = args;
            if (!year || !sem) {
                throw new ValidationError("year/sem", "請提供學年 (year) 與學期 (sem)。");
            }

            const programs = await defaultCourseService.getPrograms(year, sem);
            return programs.map((p) => ({
                id: p.id,
                name: p.name,
                course_count: p.course?.length || 0
            }));
        }
    },
    {
        name: "get_program_courses",
        description: "Get all curriculum courses designated within a specific micro-program.",
        inputSchema: {
            type: "object",
            properties: {
                year: { type: "string" },
                sem: { type: "string" },
                program_id: { type: "string", description: "Program ID or program name keyword" }
            },
            required: ["year", "sem", "program_id"]
        },
        handler: async (args: any) => {
            const { year, sem, program_id } = args;
            if (!year || !sem || !program_id) {
                throw new ValidationError("year/sem/program_id", "請提供學年、學期與微學程代碼或名稱。");
            }

            return defaultCourseService.getProgramCourses(year, sem, program_id);
        }
    }
];
