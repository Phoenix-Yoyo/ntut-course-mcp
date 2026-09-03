// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { defaultToolRegistry } from "./tools/registry.js";
import { cacheTools } from "./tools/cacheTools.js";
import { courseSearchTools } from "./tools/courseSearchTools.js";
import { scheduleTools } from "./tools/scheduleTools.js";
import { academicAuditTools } from "./tools/academicAuditTools.js";
import { internationalTools } from "./tools/internationalTools.js";
import { departmentTools } from "./tools/departmentTools.js";

export function createServer(): Server {
    const server = new Server(
        {
            name: "ntut-course-mcp",
            version: "6.0.0"
        },
        {
            capabilities: {
                tools: {}
            }
        }
    );

    // Register all modular tool categories
    defaultToolRegistry
        .registerAll(cacheTools)
        .registerAll(courseSearchTools)
        .registerAll(scheduleTools)
        .registerAll(academicAuditTools)
        .registerAll(internationalTools)
        .registerAll(departmentTools);

    // MCP Handler: List Tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: defaultToolRegistry.getToolList()
        };
    });

    // MCP Handler: Call Tool
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        return defaultToolRegistry.execute(name, args);
    });

    return server;
}

export async function startServer() {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return server;
}
