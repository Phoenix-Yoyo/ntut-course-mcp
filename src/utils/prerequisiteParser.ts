// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import {
    Course,
    CoursePrerequisiteAudit,
    ParsedPrerequisiteItem,
    PrerequisiteType
} from "../types/index.js";

interface StudentProfile {
    department?: string;
    grade?: string;
    division?: string;
}

export class PrerequisiteParser {
    // False positive phrases that should NEVER trigger prerequisite warnings
    private static readonly FALSE_POSITIVE_PATTERNS = [
        /無(?:特別|特殊)?(?:先修|擋修|限制)/i,
        /不(?:限|限制)(?:系所|科系|年級|對象|身分)/i,
        /不擋修/i,
        /不需先修/i,
        /免先修/i,
        /極限運動/i,
        /有限元素/i,
        /極限理論/i,
        /名額限制/i,
        /選課人數上限/i,
        /人數上限/i
    ];

    /**
     * Audit prerequisites and restrictions for a course.
     * @param course Course object
     * @param takenCourses Optional list of courses already completed by student (codes or names)
     * @param studentProfile Optional student background
     */
    public static auditCourse(
        course: Course,
        takenCourses: string[] = [],
        studentProfile?: StudentProfile
    ): CoursePrerequisiteAudit {
        const textToAnalyze = [
            course.notes || "",
            course.description?.zh || "",
            course.description?.en || ""
        ].join("\n");

        const parsedRules = this.parseRules(textToAnalyze);
        const unmetRequirements: string[] = [];
        let hasHighRisk = false;
        let hasMediumRisk = false;
        let hasLowRisk = false;

        const normalizedTaken = new Set(
            takenCourses.map((c) => this.normalizeCourseName(c))
        );

        for (const rule of parsedRules) {
            // Audit against taken courses if rule specifies course candidates
            if (rule.course_candidates && rule.course_candidates.length > 0) {
                if (takenCourses.length === 0) {
                    rule.is_satisfied = undefined;
                    rule.satisfaction_reason = "尚未提供已修課程清單，無法自動驗證先修是否達成。";
                    if (rule.type === "HARD_PREREQUISITE") hasMediumRisk = true;
                    if (rule.type === "RECOMMENDED_BACKGROUND") hasLowRisk = true;
                } else {
                    const matchedCandidates = rule.course_candidates.filter((candidate) => {
                        const normCandidate = this.normalizeCourseName(candidate);
                        for (const taken of normalizedTaken) {
                            if (taken.includes(normCandidate) || normCandidate.includes(taken)) {
                                return true;
                            }
                        }
                        return false;
                    });

                    const isOr = rule.logic_operator === "OR";
                    const isPassed = isOr
                        ? matchedCandidates.length > 0
                        : matchedCandidates.length === rule.course_candidates.length;

                    rule.is_satisfied = isPassed;
                    if (isPassed) {
                        rule.satisfaction_reason = `已滿足先修條件 (已修習: ${matchedCandidates.join(", ")})`;
                    } else {
                        const missing = isOr
                            ? rule.course_candidates.join(" 或 ")
                            : rule.course_candidates
                                  .filter((c) => !matchedCandidates.includes(c))
                                  .join(", ");
                        rule.satisfaction_reason = `未滿足先修條件：缺漏【${missing}】`;

                        if (rule.type === "HARD_PREREQUISITE") {
                            unmetRequirements.push(`未滿足先修科目要求：需修畢【${missing}】`);
                            hasHighRisk = true;
                        } else {
                            hasLowRisk = true;
                        }
                    }
                }
            }

            // Audit department restrictions
            if (rule.type === "DEPARTMENT_RESTRICTION" && studentProfile?.department) {
                const target = rule.target_restriction || "";
                const isStudentDept =
                    studentProfile.department.includes(target) ||
                    target.includes(studentProfile.department);

                if (rule.raw_clause.includes("非") || rule.raw_clause.includes("請勿選修")) {
                    if (isStudentDept) {
                        rule.is_satisfied = false;
                        rule.satisfaction_reason = `身分不符：該課程排除 ${target} 學生。`;
                        unmetRequirements.push(rule.satisfaction_reason);
                        hasHighRisk = true;
                    } else {
                        rule.is_satisfied = true;
                    }
                } else {
                    if (!isStudentDept) {
                        rule.is_satisfied = false;
                        rule.satisfaction_reason = `身分不符：該課程限定【${target}】，學生所屬系所為【${studentProfile.department}】`;
                        unmetRequirements.push(rule.satisfaction_reason);
                        hasHighRisk = true;
                    } else {
                        rule.is_satisfied = true;
                    }
                }
            }

            // Audit grade/division restrictions
            if (rule.type === "GRADE_RESTRICTION" && studentProfile?.grade) {
                if (rule.raw_clause.includes("大三以上") && studentProfile.grade.includes("大一")) {
                    rule.is_satisfied = false;
                    rule.satisfaction_reason = "年級不符：此課程限大三以上修習。";
                    unmetRequirements.push(rule.satisfaction_reason);
                    hasHighRisk = true;
                }
            }

            if (rule.type === "ENROLLMENT_RESTRICTION") {
                hasMediumRisk = true;
            }
        }

        const riskLevel: "HIGH" | "MEDIUM" | "LOW" | "NONE" = hasHighRisk
            ? "HIGH"
            : hasMediumRisk
            ? "MEDIUM"
            : hasLowRisk
            ? "LOW"
            : "NONE";

        return {
            course_code: course.code,
            course_name: course.name.zh,
            department_classes: course.class?.map((c) => c.name),
            has_restrictions: parsedRules.length > 0,
            risk_level: riskLevel,
            parsed_rules: parsedRules,
            unmet_requirements: unmetRequirements,
            raw_notes: course.notes || undefined,
            raw_description: course.description?.zh || undefined
        };
    }

    /**
     * Parse structured rules from text clauses
     */
    private static parseRules(text: string): ParsedPrerequisiteItem[] {
        if (!text || text.trim().length === 0) {
            return [];
        }

        // Check if entire text declares no restrictions
        for (const fp of this.FALSE_POSITIVE_PATTERNS) {
            if (fp.test(text) && !/(?:但|惟|唯|除了)/.test(text)) {
                // If it's a clear exemption with no sub-clauses, return empty
                if (text.length < 30) return [];
            }
        }

        // Split text into meaningful clauses
        const rawClauses = text
            .split(/[\r\n；;。]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        const rules: ParsedPrerequisiteItem[] = [];

        for (const clause of rawClauses) {
            // Check false positive per clause
            let isFalsePositive = false;
            for (const fp of this.FALSE_POSITIVE_PATTERNS) {
                if (fp.test(clause)) {
                    isFalsePositive = true;
                    break;
                }
            }
            if (isFalsePositive) continue;

            // 1. HARD PREREQUISITE (先修 / 擋修)
            const hardPrereqMatch =
                clause.match(/(?:先修科目|先修課程|先修條件|需先修|須先修|應先修|先修|修過|修畢)[:：\s]*([^\n;。]+)/) ||
                clause.match(/(?:未修過|未修習|未通過)([^，,。\n;；]+)(?:者不得選修|擋修|不予選修|不得選修)/) ||
                clause.match(/Prerequisite[s]?[:：\s]*([^\n;。]+)/i);

            if (hardPrereqMatch) {
                const targetText = hardPrereqMatch[1] || hardPrereqMatch[0];
                const candidates = this.extractCourseNames(targetText);
                const isOr = targetText.includes("或") || targetText.includes("or") || targetText.includes("擇一");
                const minScoreMatch = clause.match(/(\d+)分以上|及格/);

                rules.push({
                    type: "HARD_PREREQUISITE",
                    raw_clause: clause,
                    course_candidates: candidates.length > 0 ? candidates : undefined,
                    logic_operator: isOr ? "OR" : "AND",
                    minimum_score: minScoreMatch ? minScoreMatch[0] : undefined,
                    description: `強制先修規定：需修過 ${candidates.join(isOr ? " 或 " : " 且 ")}${
                        minScoreMatch ? `（標準: ${minScoreMatch[0]}）` : ""
                    }`
                });
                continue;
            }

            // 2. RECOMMENDED BACKGROUND (建議先修 / 建議具備基礎)
            const recMatch = clause.match(/(?:建議先修|建議具備|修過.*為佳|修過.*佳|具備.*基礎為佳)[:：\s]*([^\n;。]+)/);
            if (recMatch) {
                const candidates = this.extractCourseNames(recMatch[1] || clause);
                rules.push({
                    type: "RECOMMENDED_BACKGROUND",
                    raw_clause: clause,
                    course_candidates: candidates,
                    description: `建議先修背景：建議具備 ${candidates.join("、")} 基礎`
                });
                continue;
            }

            // 3. CO-REQUISITE (同時修習 / 須併選)
            const coMatch = clause.match(/(?:需同時修習|須併選|併選|同時修習|須同時選修)[:：\s]*([^\n;。]+)/);
            if (coMatch) {
                const candidates = this.extractCourseNames(coMatch[1]);
                rules.push({
                    type: "CO_REQUISITE",
                    raw_clause: clause,
                    course_candidates: candidates,
                    description: `併修規定：需同時修習 ${candidates.join(" 與 ")}`
                });
                continue;
            }

            // 4. DEPARTMENT RESTRICTION (系所限制)
            const deptMatch =
                clause.match(/(?:限|僅限|只開放)([^，,。\n;；]*(?:系|所|學院|學程|專班))(?:學生)?(?:選修|修習)?/) ||
                clause.match(/(?:非|不開放)([^，,。\n;；]*(?:系|所))(?:學生)?(?:請勿|不得)選修/) ||
                clause.match(/(限本系|限本系生|非本系請勿選修|外系生請勿選修)/);

            if (deptMatch) {
                rules.push({
                    type: "DEPARTMENT_RESTRICTION",
                    raw_clause: clause,
                    target_restriction: deptMatch[1],
                    description: `系所選課限制：${deptMatch[0]}`
                });
                continue;
            }

            // 5. GRADE RESTRICTION (年級限制)
            const gradeMatch =
                clause.match(/(?:限|僅限)?(大[一二三四]|碩[一二三]|博[一二三]|大[三四]以上|大學部|研究所|碩士班|博士班)(?:學生)?(?:選修|修讀)?/) ||
                clause.match(/(大學部不得選修|研究所不得選修|碩士班不得選修)/);

            if (gradeMatch) {
                rules.push({
                    type: "GRADE_RESTRICTION",
                    raw_clause: clause,
                    target_restriction: gradeMatch[1] || gradeMatch[0],
                    description: `年級/學制選課限制：${gradeMatch[0]}`
                });
                continue;
            }

            // 6. ENROLLMENT RESTRICTION (加簽 / 授權碼)
            if (/(?:授權碼|人工加簽|不接受加簽|第一週未到視同放棄)/.test(clause)) {
                rules.push({
                    type: "ENROLLMENT_RESTRICTION",
                    raw_clause: clause,
                    description: `加簽與名額規則：${clause}`
                });
                continue;
            }

            // 7. EXPLICIT "擋修" GENERAL CLAUSE
            if (clause.includes("擋修") || clause.includes("先修")) {
                rules.push({
                    type: "GENERAL_NOTE",
                    raw_clause: clause,
                    description: `選課注意事項：${clause}`
                });
            }
        }

        return rules;
    }

    /**
     * Extract clean course names from raw text string
     */
    private static extractCourseNames(text: string): string[] {
        const names: string[] = [];

        // Match bracketed names: 【微積分(一)】 or [計算機概論] or 「資料結構」
        const bracketMatches = text.matchAll(/[【\[「『]([^】\]」』]+)[】\]」』]/g);
        for (const m of bracketMatches) {
            names.push(m[1].trim());
        }

        if (names.length > 0) {
            return names;
        }

        // If no brackets, split by commas, "或", "及", "與"
        const cleaned = text
            .replace(/科目|課程|學分|等|始得選修|始可選修|不得選修|始能修習/g, "")
            .trim();

        const parts = cleaned.split(/[、,，/或及與]|(?:\s+and\s+)|\s+or\s+/i);
        for (const p of parts) {
            const clean = p.trim().replace(/^[:：\s]+/, "");
            if (clean.length >= 2 && clean.length <= 25 && !/(?:學生|規定|條件|原則)/.test(clean)) {
                names.push(clean);
            }
        }

        return names;
    }

    private static normalizeCourseName(name: string): string {
        return name
            .replace(/[()（）\s_-]/g, "")
            .replace(/一/g, "1")
            .replace(/二/g, "2")
            .replace(/三/g, "3")
            .toLowerCase();
    }
}
