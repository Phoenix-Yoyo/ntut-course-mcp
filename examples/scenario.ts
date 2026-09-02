// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function runScenario() {
    const transport = new StdioClientTransport({ command: "node", args: ["./dist/index.js"] });
    const client = new Client({ name: "scenario-runner", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);

    console.log("=== MISSION: AI Data Science Track Planner ===");
    const year = "112"; const sem = "1";

    // 1. Search for Artificial Intelligence courses
    console.log("\n1. Searching for core AI/Data Science courses...");
    const aiSearch = await client.callTool({
        name: "search_courses",
        arguments: { year, sem, keyword: "人工智慧", min_credit: 2 }
    });
    const aiCourses = JSON.parse(((aiSearch as any).content[0] as any).text).slice(0, 3);
    console.log(`Found top 3 AI courses: ${aiCourses.map((c:any) => c.name.zh).join(", ")}`);

    // 2. Compare the courses
    console.log("\n2. Comparing the courses...");
    const compareRes = await client.callTool({
        name: "compare_courses",
        arguments: { year, sem, course_codes: aiCourses.map((c:any) => c.code) }
    });
    console.log(JSON.parse(((compareRes as any).content[0] as any).text).map((c:any) => `${c.name} (${c.credit} cr) - Teacher: ${c.teachers} | Capacity: ${c.people}`));

    // 3. Check prerequisites
    console.log("\n3. Checking prerequisites to avoid traps...");
    const preqRes = await client.callTool({
        name: "check_prerequisites",
        arguments: { year, sem, course_codes: aiCourses.map((c:any) => c.code) }
    });
    console.log(JSON.parse(((preqRes as any).content[0] as any).text));

    // 4. Validate Schedule
    console.log("\n4. Validating the chosen schedule...");
    const valRes = await client.callTool({
        name: "validate_schedule",
        arguments: { year, sem, course_codes: aiCourses.map((c:any) => c.code) }
    });
    const scheduleStatus = JSON.parse(((valRes as any).content[0] as any).text);
    console.log(`Schedule is ${scheduleStatus.status}. Total Credits: ${scheduleStatus.totalCredits}`);
    if (scheduleStatus.conflicts.length > 0) {
        console.log(`Conflicts: ${scheduleStatus.conflicts.join(", ")}`);
    }

    // 5. Evaluate ECTS for Europe
    console.log("\n5. Evaluating for Master's Application (ECTS)...");
    const ectsRes = await client.callTool({
        name: "evaluate_ects_plan",
        arguments: {
            conversion_rate: 1.5,
            categories: { "Machine Learning / AI": aiCourses.map((c:any) => c.code) }
        }
    });
    console.log(`ECTS Grand Total: ${JSON.parse(((ectsRes as any).content[0] as any).text).Grand_Total_ECTS}`);

    process.exit(0);
}
runScenario().catch(console.error);
