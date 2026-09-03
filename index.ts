// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Yoyo

import { startServer } from "./src/server.js";

startServer().catch((err) => {
    console.error("Fatal error starting NTUT Course MCP Server:", err);
    process.exit(1);
});
