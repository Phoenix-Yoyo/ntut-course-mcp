// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

/**
 * Base structured error for NTUT Course MCP Server.
 */
export class McpError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly suggestion?: string,
        public readonly details?: Record<string, any>
    ) {
        super(message);
        this.name = "McpError";
    }

    toResponseObject() {
        return {
            success: false,
            error_code: this.code,
            message: this.message,
            suggestion: this.suggestion || null,
            details: this.details || null
        };
    }
}

/**
 * Thrown when upstream crawler endpoint cannot be reached or times out.
 */
export class UpstreamNetworkError extends McpError {
    constructor(url: string, underlyingError?: any) {
        const isTimeout = underlyingError?.code === "ECONNABORTED" || underlyingError?.message?.includes("timeout");
        const status = underlyingError?.response?.status;
        const msg = isTimeout
            ? `連線至上游課程資料庫逾時 (${url})。`
            : status
            ? `上游課程資料庫回應 HTTP ${status} 錯誤 (${url})。`
            : `無法連線至上游課程資料庫 (${url})：${underlyingError?.message || "網路連線中斷"}`;

        super(
            "UPSTREAM_NETWORK_ERROR",
            msg,
            "請檢查本機網路連線，或稍後再試。若上游 GitHub Pages 維護中，可使用已有快取之學期資料。",
            { url, http_status: status, error_code: underlyingError?.code }
        );
    }
}

/**
 * Thrown when a queried academic semester is not found in the upstream database.
 */
export class SemesterNotFoundError extends McpError {
    constructor(year: string, sem: string, availableSemesters?: string[]) {
        const semList = availableSemesters && availableSemesters.length > 0
            ? availableSemesters.slice(0, 8).join(", ")
            : "請先調用 get_data_freshness 或 refresh_cache 檢查";

        super(
            "SEMESTER_NOT_FOUND",
            `查無 ${year} 學年度第 ${sem} 學期的課程資料庫。`,
            `該學期課程可能尚未開放或資料尚未爬取。目前可查詢之最新學期包含：${semList}。請確認學年 (如 '112') 與學期 (如 '1' 或 '2') 是否正確。`,
            { queried_year: year, queried_sem: sem, available_semesters: availableSemesters }
        );
    }
}

/**
 * Thrown when one or more course codes are not found.
 */
export class CourseNotFoundError extends McpError {
    constructor(codes: string[], year?: string, sem?: string) {
        const scope = year && sem ? `在 ${year}/${sem} 學期中` : "在歷史資料庫中";
        super(
            "COURSE_NOT_FOUND",
            `${scope}查無下列課程代碼：${codes.join(", ")}。`,
            "請確認課號是否正確（例如 6 碼數字代碼如 '318274'），或使用 search_courses 透過課程名稱關鍵字重新搜尋。",
            { missing_codes: codes, year, sem }
        );
    }
}

/**
 * Thrown when department data or specific department cannot be located.
 */
export class DepartmentNotFoundError extends McpError {
    constructor(keyword?: string, year?: string, sem?: string) {
        const msg = keyword
            ? `在 ${year || ""}/${sem || ""} 查無符合關鍵字「${keyword}」的系所。`
            : `在 ${year || ""}/${sem || ""} 查無系所清單資料。`;
        super(
            "DEPARTMENT_NOT_FOUND",
            msg,
            "請使用 get_departments 工具不帶 keyword 參數以獲取全校完整系所清單，或確認學期資料已發布。",
            { keyword, year, sem }
        );
    }
}

/**
 * Thrown when micro-program data cannot be located.
 */
export class ProgramNotFoundError extends McpError {
    constructor(programId?: string, year?: string, sem?: string) {
        const msg = programId
            ? `在 ${year || ""}/${sem || ""} 查無識別碼或名稱為「${programId}」的微學程。`
            : `在 ${year || ""}/${sem || ""} 查無微學程清單。`;
        super(
            "PROGRAM_NOT_FOUND",
            msg,
            "請先使用 get_programs 查詢該學期所有開放之微學程 ID 與名稱清單。",
            { program_id: programId, year, sem }
        );
    }
}

/**
 * Thrown when tool input validation fails.
 */
export class ValidationError extends McpError {
    constructor(paramName: string, reason: string) {
        super(
            "INVALID_PARAMETER",
            `參數「${paramName}」無效：${reason}`,
            "請檢查輸入參數之資料型態與格式限制後重新嘗試。",
            { parameter: paramName, reason }
        );
    }
}
