// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import axios, { AxiosError } from "axios";
import { UpstreamNetworkError, SemesterNotFoundError } from "../types/errors.js";

export const BASE_URL = "https://gnehs.github.io/ntut-course-crawler-node";

interface CacheEntry {
    timestamp: number;
    data: any;
}

export class ApiClient {
    private cache = new Map<string, CacheEntry>();
    private availableSemestersCache: string[] = [];
    private updateIntervalTimer: NodeJS.Timeout | null = null;
    private lastBackgroundUpdateStatus = {
        success: false,
        timestamp: 0,
        error: null as string | null
    };

    constructor() {
        // Start background updater
        this.backgroundUpdate().catch(() => {});
        this.updateIntervalTimer = setInterval(() => {
            this.backgroundUpdate().catch(() => {});
        }, 30 * 60 * 1000);
    }

    /**
     * Clear timer on shutdown
     */
    public destroy() {
        if (this.updateIntervalTimer) {
            clearInterval(this.updateIntervalTimer);
            this.updateIntervalTimer = null;
        }
    }

    /**
     * Fetch raw JSON from upstream endpoint with caching, timeouts, and structured error reporting.
     * @param path Relative path (e.g. "/112/1/main.json")
     * @param options { allow404?: boolean; maxRetries?: number }
     */
    public async fetchJson(path: string, options: { allow404?: boolean; maxRetries?: number } = {}): Promise<any> {
        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        const cached = this.cache.get(normalizedPath);
        if (cached) {
            return cached.data;
        }

        const maxRetries = options.maxRetries ?? 2;
        let lastError: any = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const url = `${BASE_URL}${normalizedPath}`;
                const res = await axios.get(url, {
                    timeout: 15000,
                    headers: {
                        "Cache-Control": "no-cache",
                        "Pragma": "no-cache",
                        "Expires": "0",
                        "User-Agent": "ntut-course-mcp/6.0.0"
                    }
                });

                this.cache.set(normalizedPath, {
                    timestamp: Date.now(),
                    data: res.data
                });

                return res.data;
            } catch (err: any) {
                lastError = err;
                if (axios.isAxiosError(err)) {
                    // 404 Not Found
                    if (err.response?.status === 404) {
                        if (options.allow404) {
                            return null;
                        }
                        // Check if this looks like a semester path
                        const match = normalizedPath.match(/^\/(\d+)\/([123])/);
                        if (match) {
                            throw new SemesterNotFoundError(match[1], match[2], this.availableSemestersCache);
                        }
                        return null;
                    }

                    // Retry only on network errors or 5xx
                    const status = err.response?.status;
                    const isRetryable = !status || status >= 500 || err.code === "ECONNABORTED";
                    if (!isRetryable || attempt === maxRetries) {
                        break;
                    }
                } else if (attempt === maxRetries) {
                    break;
                }

                // Short backoff before retry
                await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
            }
        }

        // Check if path is semester-related
        const match = normalizedPath.match(/^\/(\d+)\/([123])/);
        if (match && axios.isAxiosError(lastError) && lastError.response?.status === 404) {
            throw new SemesterNotFoundError(match[1], match[2], this.availableSemestersCache);
        }

        throw new UpstreamNetworkError(`${BASE_URL}${normalizedPath}`, lastError);
    }

    /**
     * Check if a specific path exists in cache
     */
    public getCached(path: string): any | null {
        const entry = this.cache.get(path);
        return entry ? entry.data : null;
    }

    /**
     * Get all currently available semesters registered in upstream crawler
     */
    public async getAvailableSemesters(): Promise<string[]> {
        if (this.availableSemestersCache.length > 0) {
            return this.availableSemestersCache;
        }

        try {
            const mainIndex = await this.fetchJson("/main.json", { maxRetries: 1 });
            if (mainIndex && typeof mainIndex === "object") {
                const list: string[] = [];
                const sortedYears = Object.keys(mainIndex).sort((a, b) => parseInt(b) - parseInt(a));
                for (const year of sortedYears) {
                    const sems = Array.isArray(mainIndex[year]) ? mainIndex[year] : [];
                    for (const sem of sems) {
                        list.push(`${year}/${sem}`);
                    }
                }
                this.availableSemestersCache = list;
                return list;
            }
        } catch {
            // Non-fatal, fallback to empty list
        }
        return this.availableSemestersCache;
    }

    /**
     * Background routine to update latest semesters and keep cache warm
     */
    public async backgroundUpdate(): Promise<boolean> {
        try {
            const res = await axios.get(`${BASE_URL}/main.json`, {
                timeout: 15000,
                headers: { "Cache-Control": "no-cache" }
            });
            this.cache.set("/main.json", { timestamp: Date.now(), data: res.data });

            const years = Object.keys(res.data).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
            if (years.length > 0) {
                const list: string[] = [];
                for (const y of years) {
                    for (const s of res.data[y] || []) list.push(`${y}/${s}`);
                }
                this.availableSemestersCache = list;

                const latestYear = years[0];
                const sems = res.data[latestYear] || [];
                const courseFiles = [
                    "main.json",
                    "進修部.json",
                    "研究所(日間部、進修部、週末碩士班).json"
                ];

                for (const sem of sems) {
                    await Promise.all(
                        courseFiles.map(async (file) => {
                            const coursePath = `/${latestYear}/${sem}/${file}`;
                            try {
                                const courseRes = await axios.get(`${BASE_URL}${coursePath}`, { timeout: 15000 });
                                this.cache.set(coursePath, { timestamp: Date.now(), data: courseRes.data });
                            } catch {
                                // Division file might not exist in older/special sem
                            }
                        })
                    );
                    const deptPath = `/${latestYear}/${sem}/department.json`;
                    try {
                        const deptRes = await axios.get(`${BASE_URL}${deptPath}`, { timeout: 15000 });
                        this.cache.set(deptPath, { timestamp: Date.now(), data: deptRes.data });
                    } catch {}
                }
            }

            this.lastBackgroundUpdateStatus = {
                success: true,
                timestamp: Date.now(),
                error: null
            };
            return true;
        } catch (e: any) {
            this.lastBackgroundUpdateStatus = {
                success: false,
                timestamp: Date.now(),
                error: e.message || String(e)
            };
            return false;
        }
    }

    /**
     * Diagnostic report of current cache entries and freshness
     */
    public getDataFreshnessReport(): Record<string, any> {
        const cacheEntries: Record<string, string> = {};
        for (const [key, value] of this.cache.entries()) {
            cacheEntries[key] = new Date(value.timestamp).toISOString();
        }

        return {
            total_cached_keys: this.cache.size,
            available_semesters: this.availableSemestersCache.slice(0, 10),
            last_background_sync: {
                success: this.lastBackgroundUpdateStatus.success,
                last_run: this.lastBackgroundUpdateStatus.timestamp
                    ? new Date(this.lastBackgroundUpdateStatus.timestamp).toISOString()
                    : "never",
                error: this.lastBackgroundUpdateStatus.error
            },
            cached_endpoints: cacheEntries
        };
    }
}

export const defaultApiClient = new ApiClient();
