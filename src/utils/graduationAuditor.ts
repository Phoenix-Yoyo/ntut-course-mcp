// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import {
    Course,
    GraduationRulesInput,
    GraduationAuditReport,
    CategoryAuditResult,
    AppliedCourseRecord,
    GraduationCategoryRule
} from "../types/index.js";

interface CourseWithCredit {
    course: Course;
    credit: number;
    normName: string;
}

export class GraduationAuditor {
    /**
     * Audit a student's taken courses against comprehensive graduation rules.
     */
    public static audit(
        rules: GraduationRulesInput,
        takenCourseCodes: string[],
        allCoursesCatalog: Course[]
    ): GraduationAuditReport {
        const auditNotes: string[] = [];
        const allowOverflow = rules.allow_elective_overflow ?? true;

        // 1. Resolve taken courses from catalog
        const resolvedCourses: CourseWithCredit[] = [];
        const notFoundCodes: string[] = [];

        for (const code of takenCourseCodes) {
            const match = allCoursesCatalog.find((c) => c.code === code);
            if (match) {
                const credit = parseFloat(match.credit) || 0;
                resolvedCourses.push({
                    course: match,
                    credit,
                    normName: match.name?.zh?.replace(/\s+/g, "") || code
                });
            } else {
                notFoundCodes.push(code);
            }
        }

        if (notFoundCodes.length > 0) {
            auditNotes.push(`有 ${notFoundCodes.length} 門課程在歷史資料庫中查無詳細資料：${notFoundCodes.join(", ")}。已嘗試以代碼比對。`);
        }

        // 2. Deduplicate: exclude retakes of identical course names/codes
        const validCourses: CourseWithCredit[] = [];
        const seenCodes = new Set<string>();
        const seenNames = new Set<string>();
        const duplicatedExcluded: Array<{ code: string; name: string; credit: number; reason: string }> = [];

        for (const item of resolvedCourses) {
            // Zero-credit courses (e.g. Physical Education, Military Training) do not count towards total graduation credits
            if (item.credit === 0) {
                duplicatedExcluded.push({
                    code: item.course.code,
                    name: item.course.name.zh,
                    credit: 0,
                    reason: "0 學分課程（如體育、軍訓、服務學習），依規定不計入畢業總學分數。"
                });
                continue;
            }

            if (seenCodes.has(item.course.code)) {
                duplicatedExcluded.push({
                    code: item.course.code,
                    name: item.course.name.zh,
                    credit: item.credit,
                    reason: `重複修習相同課號 (${item.course.code})，依學則僅採計一次學分。`
                });
                continue;
            }

            if (seenNames.has(item.normName)) {
                duplicatedExcluded.push({
                    code: item.course.code,
                    name: item.course.name.zh,
                    credit: item.credit,
                    reason: `重複修習同名課程「${item.course.name.zh}」，依學則僅採計一次學分。`
                });
                continue;
            }

            seenCodes.add(item.course.code);
            seenNames.add(item.normName);
            validCourses.push(item);
        }

        // 3. Prepare categories data structure
        const categories: Array<GraduationCategoryRule & { id: string }> = rules.categories.map((cat, idx) => ({
            ...cat,
            id: cat.id || `cat_${idx + 1}`,
            priority: cat.priority ?? (idx + 1)
        }));

        // Sort categories by priority (lower number = higher precedence)
        categories.sort((a, b) => (a.priority || 0) - (b.priority || 0));

        const categoryResults = new Map<string, CategoryAuditResult>();
        for (const cat of categories) {
            categoryResults.set(cat.id, {
                category_id: cat.id,
                name: cat.name,
                required_credits: cat.min_credits,
                achieved_credits: 0,
                capped_credits: 0,
                status: "FAILED",
                shortfall: cat.min_credits,
                overflow_credits_out: 0,
                overflow_credits_in: 0,
                applied_courses: []
            });
        }

        const usedCourseCodes = new Set<string>();
        const cappedCourses: Array<{ code: string; name: string; credit: number; category: string; reason: string }> = [];

        // Helper to check category matching
        const matchesCategory = (item: CourseWithCredit, cat: GraduationCategoryRule): boolean => {
            const code = item.course.code;
            if (cat.exclude_codes && cat.exclude_codes.includes(code)) return false;
            if (cat.codes && cat.codes.includes(code)) return true;
            if (cat.course_names && cat.course_names.some((kw) => item.course.name.zh.includes(kw))) return true;
            if (cat.course_types && cat.course_types.includes(item.course.courseType)) return true;
            if (cat.departments && cat.departments.length > 0) {
                const courseClasses = item.course.class || [];
                if (courseClasses.some((c) => cat.departments!.some((d) => c.name.includes(d)))) return true;
            }
            if (cat.allow_any_course) return true;
            return false;
        };

        // 4. Multi-Stage Course Assignment
        // Stage 4.1: Strictly required courses (single-match or explicit codes)
        for (const item of validCourses) {
            const matchedCats = categories.filter((cat) => matchesCategory(item, cat));
            if (matchedCats.length === 1 && matchedCats[0].codes?.includes(item.course.code)) {
                const targetCat = matchedCats[0];
                const res = categoryResults.get(targetCat.id)!;
                res.achieved_credits += item.credit;
                res.applied_courses.push({
                    code: item.course.code,
                    name: item.course.name.zh,
                    credit: item.credit,
                    applied_to_category: targetCat.name,
                    is_overflow: false,
                    note: "指定核心必修認列"
                });
                usedCourseCodes.add(item.course.code);
            }
        }

        // Stage 4.2: Deficit-First Assignment for multi-match courses
        for (const item of validCourses) {
            if (usedCourseCodes.has(item.course.code)) continue;

            const matchedCats = categories.filter((cat) => matchesCategory(item, cat));
            if (matchedCats.length === 0) continue;

            // Prioritize category with positive shortfall (needs credits)
            const deficientCats = matchedCats.filter((cat) => {
                const res = categoryResults.get(cat.id)!;
                return res.achieved_credits < cat.min_credits;
            });

            const chosenCat = deficientCats.length > 0 ? deficientCats[0] : matchedCats[0];
            const res = categoryResults.get(chosenCat.id)!;

            // Check category maximum credit cap
            if (chosenCat.max_credits && res.achieved_credits + item.credit > chosenCat.max_credits) {
                const allowable = Math.max(0, chosenCat.max_credits - res.achieved_credits);
                if (allowable > 0) {
                    res.achieved_credits += allowable;
                    res.applied_courses.push({
                        code: item.course.code,
                        name: item.course.name.zh,
                        credit: allowable,
                        applied_to_category: chosenCat.name,
                        is_overflow: false,
                        note: `部分認列（達上限 ${chosenCat.max_credits} 學分）`
                    });
                }
                const excess = item.credit - allowable;
                cappedCourses.push({
                    code: item.course.code,
                    name: item.course.name.zh,
                    credit: excess,
                    category: chosenCat.name,
                    reason: `超過該類別採計上限 (${chosenCat.max_credits} 學分)，超出之 ${excess} 學分不計入。`
                });
                usedCourseCodes.add(item.course.code);
                continue;
            }

            res.achieved_credits += item.credit;
            res.applied_courses.push({
                code: item.course.code,
                name: item.course.name.zh,
                credit: item.credit,
                applied_to_category: chosenCat.name,
                is_overflow: false
            });
            usedCourseCodes.add(item.course.code);
        }

        // Stage 4.3: Excess Credit Overflow Handling
        // If a category exceeds min_credits, check if overflow_to or elective overflow is enabled
        if (allowOverflow) {
            const freeElectiveCat = categories.find((c) => c.allow_any_course || c.name.includes("自由選修") || c.name.includes("全校選修"));

            for (const cat of categories) {
                const res = categoryResults.get(cat.id)!;
                if (res.achieved_credits > cat.min_credits) {
                    const targetCatId = cat.overflow_to || (freeElectiveCat ? freeElectiveCat.id : undefined);
                    if (targetCatId && targetCatId !== cat.id) {
                        const targetRes = categoryResults.get(targetCatId);
                        if (targetRes) {
                            const excessCredits = res.achieved_credits - cat.min_credits;
                            res.overflow_credits_out += excessCredits;
                            res.achieved_credits = cat.min_credits; // Keep primary category at threshold

                            targetRes.achieved_credits += excessCredits;
                            targetRes.overflow_credits_in += excessCredits;
                            auditNotes.push(`類別「${cat.name}」超修 ${excessCredits} 學分，已依折抵規定自動溢出認列至「${targetRes.name}」。`);
                        }
                    }
                }
            }
        }

        // Stage 4.4: Process remaining unused courses (send to free electives if available)
        const unusedCourses: Array<{ code: string; name?: string; credit?: number; reason: string }> = [];
        const fallbackCat = categories.find((c) => c.allow_any_course || c.name.includes("自由選修"));

        for (const item of validCourses) {
            if (!usedCourseCodes.has(item.course.code)) {
                if (fallbackCat) {
                    const res = categoryResults.get(fallbackCat.id)!;
                    res.achieved_credits += item.credit;
                    res.applied_courses.push({
                        code: item.course.code,
                        name: item.course.name.zh,
                        credit: item.credit,
                        applied_to_category: fallbackCat.name,
                        is_overflow: true,
                        note: "未受特定限制，自動認列為自由選修"
                    });
                    usedCourseCodes.add(item.course.code);
                } else {
                    unusedCourses.push({
                        code: item.course.code,
                        name: item.course.name.zh,
                        credit: item.credit,
                        reason: "不符合現有任何設定之必選修分類規則，且無通用自由選修類別可認列。"
                    });
                }
            }
        }

        // Also add raw codes that were not found in database to unused
        for (const code of notFoundCodes) {
            unusedCourses.push({
                code,
                reason: "上游歷史課程資料庫查無此課號，無法解析學分與課名。"
            });
        }

        // 5. Final Calculation & Status Resolution
        let totalCreditsEarned = 0;
        const categoryReportList: CategoryAuditResult[] = [];
        let allCategoriesPassed = true;

        for (const cat of categories) {
            const res = categoryResults.get(cat.id)!;
            res.shortfall = Math.max(0, res.required_credits - res.achieved_credits);
            res.status = res.shortfall === 0 ? "PASSED" : "FAILED";
            if (res.status === "FAILED") {
                allCategoriesPassed = false;
            }
            totalCreditsEarned += res.achieved_credits;
            categoryReportList.push(res);
        }

        const totalShortfall = Math.max(0, rules.total_credits - totalCreditsEarned);
        const isEligible = allCategoriesPassed && totalShortfall === 0;

        // 6. Non-credit status
        const nonCreditStatus = rules.non_credit_requirements?.map((req) => ({
            name: req.name,
            status: (req.required ? "PENDING" : "PASSED") as "PASSED" | "PENDING"
        }));

        return {
            is_graduating_eligible: isEligible,
            total_credits_required: rules.total_credits,
            total_credits_achieved: totalCreditsEarned,
            total_credits_shortfall: totalShortfall,
            status: isEligible ? "PASSED" : "FAILED",
            categories: categoryReportList,
            duplicated_courses_excluded: duplicatedExcluded,
            capped_courses: cappedCourses,
            unused_courses: unusedCourses,
            non_credit_status: nonCreditStatus,
            audit_notes: auditNotes
        };
    }
}
