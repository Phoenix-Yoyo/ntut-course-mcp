// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

export interface CourseTeacher {
    name: string;
    id?: string;
}

export interface CourseClassroom {
    name: string;
    room?: string;
}

export interface CourseClass {
    name: string;
    id?: string;
}

export interface Course {
    id: string;
    code: string;
    name: {
        zh: string;
        en?: string;
    };
    credit: string;
    hours: string;
    courseType: string; // e.g. "必修", "選修"
    teacher: CourseTeacher[];
    time: Record<string, string[]>; // e.g. { "mon": ["1", "2"] }
    classroom: CourseClassroom[];
    people: number | string;
    peopleWithdraw: number | string;
    class: CourseClass[];
    notes: string;
    description?: {
        zh?: string;
        en?: string;
    };
    language?: string;
    _division?: string;
    _yearSem?: string;
}

export interface DepartmentClass {
    id: string;
    name: string;
}

export interface Department {
    id: string;
    name: string;
    category: string;
    class: DepartmentClass[];
}

export interface MicroProgram {
    id: string;
    name: string;
    course?: string[];
}

export interface AcademicCalendarEvent {
    summary: string;
    start: string;
    end?: string;
}

// Prerequisites Types
export type PrerequisiteType =
    | "HARD_PREREQUISITE"
    | "RECOMMENDED_BACKGROUND"
    | "CO_REQUISITE"
    | "DEPARTMENT_RESTRICTION"
    | "GRADE_RESTRICTION"
    | "DIVISION_RESTRICTION"
    | "ENROLLMENT_RESTRICTION"
    | "GENERAL_NOTE";

export interface ParsedPrerequisiteItem {
    type: PrerequisiteType;
    raw_clause: string;
    course_candidates?: string[];
    logic_operator?: "AND" | "OR";
    minimum_score?: number | string;
    target_restriction?: string;
    description: string;
    is_satisfied?: boolean;
    satisfaction_reason?: string;
}

export interface CoursePrerequisiteAudit {
    course_code: string;
    course_name: string;
    department_classes?: string[];
    has_restrictions: boolean;
    risk_level: "HIGH" | "MEDIUM" | "LOW" | "NONE";
    parsed_rules: ParsedPrerequisiteItem[];
    unmet_requirements: string[];
    raw_notes?: string;
    raw_description?: string;
}

// Graduation Audit Types
export interface GraduationCategoryRule {
    id?: string;
    name: string;
    min_credits: number;
    max_credits?: number; // Maximum credits accepted for this category (e.g. max 15 for outside dept)
    codes?: string[]; // Specific course codes accepted
    course_names?: string[]; // Keywords or exact names
    course_types?: string[]; // e.g. ["必修", "選修"]
    departments?: string[]; // Target department filters
    exclude_codes?: string[]; // Specifically exclude certain codes
    overflow_to?: string; // Target category id or name to transfer excess credits
    allow_any_course?: boolean; // For free electives
    priority?: number; // Priority for greedy bipartite matching (lower number = higher priority)
}

export interface GraduationRulesInput {
    total_credits: number;
    categories: GraduationCategoryRule[];
    allow_elective_overflow?: boolean; // Default true
    outside_dept_credit_cap?: number; // Optional cap for outside-department courses
    non_credit_requirements?: Array<{ name: string; required: boolean }>;
}

export interface AppliedCourseRecord {
    code: string;
    name: string;
    credit: number;
    applied_to_category: string;
    is_overflow: boolean;
    original_category?: string;
    note?: string;
}

export interface CategoryAuditResult {
    category_id: string;
    name: string;
    required_credits: number;
    achieved_credits: number;
    capped_credits?: number;
    status: "PASSED" | "FAILED";
    shortfall: number;
    overflow_credits_out: number;
    overflow_credits_in: number;
    applied_courses: AppliedCourseRecord[];
}

export interface GraduationAuditReport {
    is_graduating_eligible: boolean;
    total_credits_required: number;
    total_credits_achieved: number;
    total_credits_shortfall: number;
    status: "PASSED" | "FAILED";
    categories: CategoryAuditResult[];
    duplicated_courses_excluded: Array<{ code: string; name: string; credit: number; reason: string }>;
    capped_courses: Array<{ code: string; name: string; credit: number; category: string; reason: string }>;
    unused_courses: Array<{ code: string; name?: string; credit?: number; reason: string }>;
    non_credit_status?: Array<{ name: string; status: "PASSED" | "PENDING" }>;
    audit_notes: string[];
}

// Tool Definition & Context
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    handler: (args: any) => Promise<any>;
}
