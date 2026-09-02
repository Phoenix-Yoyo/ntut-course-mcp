// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function run() {
    const transport = new StdioClientTransport({
        command: "node",
        args: ["./dist/index.js"]
    });
    const client = new Client(
        { name: "test-client", version: "1.0.0" },
        { capabilities: {} }
    );
    await client.connect(transport);

    console.log("✅ MCP Server connected successfully!");

    console.log("\n1️⃣ Listing tools...");
    const tools = await client.listTools();
    console.log(`Found ${tools.tools.length} tools:`, tools.tools.map(t => t.name).join(", "));

    console.log("\n2️⃣ Testing search_courses (Searching for '人工智慧' in 112/1)...");
    const result = await client.callTool({
        name: "search_courses",
        arguments: { year: "112", sem: "1", keyword: "人工智慧" }
    });

    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    console.log(`Found ${parsed.length} courses!`);
    if (parsed.length > 0) {
        console.log(`Preview of first course: ${parsed[0].name.zh} (${parsed[0].code}) - ${parsed[0].credit} credits`);
    }

    console.log("\n3️⃣ Testing validate_schedule...");
    const valResult = await client.callTool({
        name: "validate_schedule",
        arguments: { year: "112", sem: "1", course_codes: parsed.length > 0 ? [parsed[0].code] : [] }
    });
    console.log("Validate Result:\n", valResult.content[0].text);

    console.log("\n4️⃣ Testing evaluate_ects_plan...");
    const ectsResult = await client.callTool({
        name: "evaluate_ects_plan",
        arguments: { conversion_rate: 1.5, categories: { "Computer Science": ["318274"] } }
    });
    console.log("ECTS Plan Result:\n", ectsResult.content[0].text);

    console.log("\n🎉 All tests passed successfully!");
    process.exit(0);
}
run().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
