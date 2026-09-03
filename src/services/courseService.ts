// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import { ApiClient, defaultApiClient } from "./apiClient.js";
import { Course, Department, MicroProgram } from "../types/index.js";
import {
    SemesterNotFoundError,
    DepartmentNotFoundError,
    ProgramNotFoundError,
    CourseNotFoundError
} from "../types/errors.js";

const COURSE_DATASETS = [
    { file: "main.json", division: "日間部" },
    { file: "進修部.json", division: "進修部" },
    { file: "研究所(日間部、進修部、週末碩士班).json", division: "研究所" }
] as const;

export class CourseService {
    private apiClient: ApiClient;
    private allCoursesCache: { timestamp: number; courses: Course[] } | null = null;
    private readonly ALL_COURSES_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

    constructor(apiClient: ApiClient = defaultApiClient) {
        this.apiClient = apiClient;
    }

    /**
     * Fetch all division courses for a semester and merge them with deduplication.
     */
    public async getSemesterCourses(year: string, sem: string): Promise<Course[]> {
        let anyDatasetFound = false;
        const availableSems = await this.apiClient.getAvailableSemesters();

        const datasets = await Promise.all(
            COURSE_DATASETS.map(async ({ file, division }) => {
                const coursePath = `/${year}/${sem}/${file}`;
                try {
                    const courses = await this.apiClient.fetchJson(coursePath, { allow404: true });
                    if (Array.isArray(courses) && courses.length > 0) {
                        anyDatasetFound = true;
                        return courses.map((course: any) => ({
                            ...course,
                            _division: division,
                            _yearSem: `${year}/${sem}`
                        }));
                    }
                } catch (err) {
                    if (err instanceof SemesterNotFoundError) throw err;
                }
                return [];
            })
        );

        if (!anyDatasetFound) {
            throw new SemesterNotFoundError(year, sem, availableSems);
        }

        const seen = new Set<string>();
        const mergedCourses: Course[] = [];

        for (const course of datasets.flat()) {
            const key = course.id || `${course.code}:${course.name?.zh}:${JSON.stringify(course.time)}`;
            if (!seen.has(key)) {
                seen.add(key);
                mergedCourses.push(course);
            }
        }

        return mergedCourses;
    }

    /**
     * Fetch all historical courses across all indexed semesters.
     * Cached with a TTL to prevent repeated heavy network calls.
     */
    public async getAllCourses(): Promise<Course[]> {
        if (
            this.allCoursesCache &&
            Date.now() - this.allCoursesCache.timestamp < this.ALL_COURSES_CACHE_TTL
        ) {
            return this.allCoursesCache.courses;
        }

        const mainIndex = await this.apiClient.fetchJson("/main.json");
        if (!mainIndex || typeof mainIndex !== "object") {
            return [];
        }

        const allCourses: Course[] = [];
        const sortedYears = Object.keys(mainIndex).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));

        for (const year of sortedYears) {
            const sems = Array.isArray(mainIndex[year]) ? mainIndex[year] : [];
            for (const sem of sems) {
                try {
                    const courses = await this.getSemesterCourses(year, String(sem));
                    allCourses.push(...courses);
                } catch {
                    // Ignore missing division or semester in historical scan
                }
            }
        }

        this.allCoursesCache = {
            timestamp: Date.now(),
            courses: allCourses
        };

        return allCourses;
    }

    /**
     * Look up specific courses by code across semester or history
     */
    public async findCourse(code: string, year?: string, sem?: string): Promise<Course | undefined> {
        if (year && sem) {
            const courses = await this.getSemesterCourses(year, sem);
            return courses.find((c) => c.code === code);
        }
        const allCourses = await this.getAllCourses();
        return allCourses.find((c) => c.code === code);
    }

    /**
     * Get department hierarchy for a semester
     */
    public async getDepartments(year: string, sem: string, keyword?: string): Promise<Department[]> {
        const deptPath = `/${year}/${sem}/department.json`;
        const deps = await this.apiClient.fetchJson(deptPath, { allow404: true });

        if (!deps || !Array.isArray(deps)) {
            const availableSems = await this.apiClient.getAvailableSemesters();
            throw new SemesterNotFoundError(year, sem, availableSems);
        }

        if (!keyword) {
            return deps;
        }

        const kw = keyword.toLowerCase();
        const filtered = deps.filter(
            (d: any) =>
                (d.name && d.name.toLowerCase().includes(kw)) ||
                (d.category && d.category.toLowerCase().includes(kw)) ||
                (d.class && d.class.some((c: any) => c.name && c.name.toLowerCase().includes(kw)))
        );

        if (filtered.length === 0) {
            throw new DepartmentNotFoundError(keyword, year, sem);
        }

        return filtered;
    }

    /**
     * Get micro-programs for a semester
     */
    public async getPrograms(year: string, sem: string): Promise<MicroProgram[]> {
        const programPath = `/${year}/${sem}/mprogram.json`;
        const programs = await this.apiClient.fetchJson(programPath, { allow404: true });

        if (!programs || !Array.isArray(programs)) {
            const availableSems = await this.apiClient.getAvailableSemesters();
            throw new ProgramNotFoundError(undefined, year, sem);
        }

        return programs;
    }

    /**
     * Get courses for a specific micro-program
     */
    public async getProgramCourses(
        year: string,
        sem: string,
        programIdOrName: string
    ): Promise<{ program_name: string; courses: Partial<Course>[] }> {
        const programs = await this.getPrograms(year, sem);
        const program = programs.find(
            (p) => p.id === programIdOrName || (p.name && p.name.includes(programIdOrName))
        );

        if (!program) {
            throw new ProgramNotFoundError(programIdOrName, year, sem);
        }

        const courses = await this.getSemesterCourses(year, sem);
        const courseIds = new Set(program.course || []);
        const matched = courses.filter((c) => courseIds.has(c.id));

        return {
            program_name: program.name,
            courses: matched.map((c) => ({
                code: c.code,
                name: c.name,
                credit: c.credit,
                time: c.time,
                teacher: c.teacher
            }))
        };
    }
}

export const defaultCourseService = new CourseService();
