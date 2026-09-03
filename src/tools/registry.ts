// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import { ToolDefinition } from "../types/index.js";
import { createSuccessResponse, createErrorResponse } from "../utils/response.js";
import { McpError } from "../types/errors.js";

export class ToolRegistry {
    private tools = new Map<string, ToolDefinition>();

    /**
     * Register a new tool definition
     */
    public register(tool: ToolDefinition): this {
        if (this.tools.has(tool.name)) {
            console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
        }
        this.tools.set(tool.name, tool);
        return this;
    }

    /**
     * Register multiple tool definitions
     */
    public registerAll(tools: ToolDefinition[]): this {
        for (const tool of tools) {
            this.register(tool);
        }
        return this;
    }

    /**
     * Return all tools formatted for MCP ListToolsRequestSchema
     */
    public getToolList() {
        return Array.from(this.tools.values()).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
        }));
    }

    /**
     * Dispatches tool call to corresponding handler with structured error management.
     */
    public async execute(name: string, args: any) {
        const tool = this.tools.get(name);
        if (!tool) {
            return createErrorResponse(
                new McpError(
                    "TOOL_NOT_FOUND",
                    `未知工具：${name}。`,
                    `請確認調用的工具名稱是否正確。可用工具清單包括：${Array.from(this.tools.keys()).join(", ")}`
                )
            );
        }

        try {
            const result = await tool.handler(args || {});
            return createSuccessResponse(result);
        } catch (error: any) {
            return createErrorResponse(error);
        }
    }
}

export const defaultToolRegistry = new ToolRegistry();
