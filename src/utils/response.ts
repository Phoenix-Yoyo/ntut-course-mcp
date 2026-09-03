// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import { McpError } from "../types/errors.js";

export const DATA_SOURCE_NOTICE = "Data source: gnehs/ntut-course-crawler-node (https://github.com/gnehs/ntut-course-crawler-node), served from https://gnehs.github.io/ntut-course-crawler-node. The upstream course JSON and its contents are NOT licensed under this project's MIT License. Data is provided for reference; verify official information with NTUT. Users must independently confirm rights before saving, redistributing, modifying, publicly displaying, or commercially using the data.";

/**
 * Creates standard MCP tool success response.
 * Returns data in the primary content block and attribution notice in a secondary block.
 * This preserves clean JSON parsing for content[0].text while complying with licensing notice requirements.
 */
export function createSuccessResponse(data: any) {
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return {
        content: [
            { type: "text" as const, text },
            { type: "text" as const, text: `\n\n---\n${DATA_SOURCE_NOTICE}` }
        ]
    };
}

/**
 * Creates standard MCP tool error response with structured diagnostic fields.
 */
export function createErrorResponse(error: unknown) {
    if (error instanceof McpError) {
        return {
            isError: true,
            content: [
                {
                    type: "text" as const,
                    text: JSON.stringify(error.toResponseObject(), null, 2)
                }
            ]
        };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
        isError: true,
        content: [
            {
                type: "text" as const,
                text: JSON.stringify({
                    success: false,
                    error_code: "INTERNAL_ERROR",
                    message,
                    suggestion: "請檢查傳入參數是否正確，或確認遠端網路連線後重試。"
                }, null, 2)
            }
        ]
    };
}
