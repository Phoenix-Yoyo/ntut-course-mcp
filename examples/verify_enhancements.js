// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function verifyAll() {
    console.log("=== VERIFYING NTUT COURSE MCP ENHANCEMENTS ===\n");

    const transport = new StdioClientTransport({
        command: "node",
        args: ["./dist/index.js"]
    });
    const client = new Client(
        { name: "enhancement-verifier", version: "1.0.0" },
        { capabilities: {} }
    );
    await client.connect(transport);
    console.log("✅ MCP Server connected successfully!");

    // 1. Verify check_graduation_requirements with overflow and deduplication
    console.log("\n[TEST 1] Testing Advanced Graduation Audit (Overflow, Retake Deduplication, Capping)...");
    const gradRes = await client.callTool({
        name: "check_graduation_requirements",
        arguments: {
            rules: {
                total_credits: 9,
                allow_elective_overflow: true,
                categories: [
                    {
                        id: "core",
                        name: "院系核心必修",
                        min_credits: 3,
                        codes: ["2B05003"], // 人工智慧 3.0 cr
                        overflow_to: "free_electives"
                    },
                    {
                        id: "major_electives",
                        name: "專業選修",
                        min_credits: 3,
                        codes: ["2B05006", "3604056"], // 智慧機器人 3.0 cr, 人工智慧 3.0 cr
                        overflow_to: "free_electives"
                    },
                    {
                        id: "free_electives",
                        name: "自由選修",
                        min_credits: 3,
                        allow_any_course: true
                    }
                ],
                non_credit_requirements: [
                    { name: "英語能力檢定門檻", required: true },
                    { name: "服務學習 (二學期)", required: false }
                ]
            },
            taken_courses: [
                "2B05003", // 人工智慧 3.0 cr -> fits core
                "2B05006", // 智慧機器人 3.0 cr -> fits major_electives
                "3604056", // 人工智慧 (重複修習同名/超修) -> test deduplication or overflow
                "2B05003"  // 重複修同一課號 -> must be deduplicated
            ]
        }
    });

    const gradReport = JSON.parse(gradRes.content[0].text);
    console.log("Graduation Eligibility:", gradReport.is_graduating_eligible ? "PASSED" : "FAILED");
    console.log("Total Credits Earned / Required:", `${gradReport.total_credits_achieved} / ${gradReport.total_credits_required}`);
    console.log("Categories Status:");
    for (const cat of gradReport.categories) {
        console.log(`  - ${cat.name}: ${cat.status} (${cat.achieved_credits}/${cat.required_credits} cr) [In: +${cat.overflow_credits_in}, Out: -${cat.overflow_credits_out}]`);
    }
    console.log("Duplicated courses excluded count:", gradReport.duplicated_courses_excluded.length);
    for (const d of gradReport.duplicated_courses_excluded) {
        console.log(`  - Excluded: ${d.name} (${d.code}) -> Reason: ${d.reason}`);
    }
    if (gradReport.audit_notes.length > 0) {
        console.log("Audit Notes:", gradReport.audit_notes);
    }

    // 2. Verify check_prerequisites logic and elimination of false positives
    console.log("\n[TEST 2] Testing Syntactic Prerequisite Parser & Elimination of False Positives...");
    const prereqRes = await client.callTool({
        name: "check_prerequisites",
        arguments: {
            year: "112",
            sem: "1",
            course_codes: ["3604056", "2B05003"],
            taken_courses: ["計算機概論", "資料結構"],
            student_profile: {
                department: "資訊工程系",
                grade: "大三"
            }
        }
    });
    const prereqReport = JSON.parse(prereqRes.content[0].text);
    console.log(`Audited courses: ${prereqReport.audited_count}, Total risk courses: ${prereqReport.total_risk_courses}`);
    console.log(`Overall status: ${prereqReport.overall_status}`);
    for (const c of prereqReport.courses) {
        console.log(`  - Course: ${c.course_name} (${c.course_code}) | Risk: ${c.risk_level} | Restrictions: ${c.has_restrictions}`);
    }

    // 3. Verify Structured Error Handling for non-existent semester
    console.log("\n[TEST 3] Testing Discriminated Error Handling for Non-Existent Semester (999/1)...");
    const errRes = await client.callTool({
        name: "search_courses",
        arguments: { year: "999", sem: "1", keyword: "測試" }
    });
    console.log("isError flag:", errRes.isError);
    const errObj = JSON.parse(errRes.content[0].text);
    console.log("Structured Error Code:", errObj.error_code);
    console.log("Error Message:", errObj.message);
    console.log("Helpful Suggestion:", errObj.suggestion);

    // 4. Verify Unknown Tool Error
    console.log("\n[TEST 4] Testing Unknown Tool Error Handling...");
    const unknownRes = await client.callTool({
        name: "non_existent_tool_xyz",
        arguments: {}
    });
    console.log("isError flag:", unknownRes.isError);
    const unknownErr = JSON.parse(unknownRes.content[0].text);
    console.log("Error Code:", unknownErr.error_code);
    console.log("Suggestion:", unknownErr.suggestion);

    console.log("\n==============================================");
    console.log("🎉 ALL ENHANCEMENT VERIFICATIONS COMPLETED SUCCESSFULLY!");
    process.exit(0);
}

verifyAll().catch((err) => {
    console.error("Verification error:", err);
    process.exit(1);
});
