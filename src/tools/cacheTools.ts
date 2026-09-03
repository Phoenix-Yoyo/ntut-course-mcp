// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import { ToolDefinition } from "../types/index.js";
import { defaultApiClient } from "../services/apiClient.js";

export const cacheTools: ToolDefinition[] = [
    {
        name: "refresh_cache",
        description: "Manually trigger background fetch and refresh cached semesters from remote upstream crawler.",
        inputSchema: {
            type: "object",
            properties: {}
        },
        handler: async () => {
            const success = await defaultApiClient.backgroundUpdate();
            return {
                status: success ? "SUCCESS" : "FAILED",
                message: success
                    ? "遠端課程與系所資料快取已成功刷新。"
                    : "刷新快取失敗，請確認遠端網路連線或 GitHub Pages 服務狀態。"
            };
        }
    },
    {
        name: "get_data_freshness",
        description: "Check data freshness timestamps, available semesters, and cached endpoint status.",
        inputSchema: {
            type: "object",
            properties: {}
        },
        handler: async () => {
            return defaultApiClient.getDataFreshnessReport();
        }
    }
];
