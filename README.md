> ⚠️ 實驗性 AI 協作原型：大部分程式實作由 AI 依開發者提供的需求與測試情境產生。

# NTUT Course MCP Server

<div align="center">
  <img src="https://img.shields.io/badge/Model_Context_Protocol-MCP-blue?style=for-the-badge" alt="MCP" />
  <img src="https://img.shields.io/badge/NTUT-Course-red?style=for-the-badge" alt="NTUT" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License" />
</div>

<br/>

> **⚠️ 資料來源聲明 (Data Source)**
> 本專案採用 MIT 授權。程式在執行時讀取 [ntut-course-crawler-node](https://github.com/gnehs/ntut-course-crawler-node) 發布的公開課程 JSON，資料不會被打包進本 repository 或 npm package；但查詢結果可能會由 MCP Server 回傳給使用者端。這些課程資料及其原始來源的著作權、資料庫權利、網站使用條款與個人資料規範不因本專案採用 MIT 而改變，使用者應自行確認並遵守適用規範。
>
> 本專案不包含 [北科課程好朋友 (ntut-course-web)](https://github.com/gnehs/ntut-course-web) 的前端原始碼，因此不將該 GPL-3.0 專案的授權宣稱延伸至本專案；此處的致謝與連結不代表複製或散布其程式碼。若未來直接複製、修改或散布該前端程式碼，必須另行遵守 GPL-3.0。

> **資料授權免責**：上游課程 JSON、課程文字、教師資訊、課綱與其他資料不屬於本專案 MIT 授權；MIT 僅適用於本專案自行創作的程式碼與文件。使用者不得僅依本專案的 MIT 聲明推定可以自由複製、散布、改作或商業使用上游資料。詳見 [DATA-DISCLAIMER.md](DATA-DISCLAIMER.md)。

這是一個專為「國立臺北科技大學 (NTUT)」學生與 AI 助理設計的 Model Context Protocol (MCP) Server。
主要目的是賦予 AI 查詢全校課程、安排不衝堂課表、計算留學學分 (ECTS) 以及檢驗畢業門檻的能力。

## 🙏 鳴謝與資料來源 (Acknowledgements)

本專案之所以能夠誕生，全賴開源社群與前人的無私貢獻。
在此特別致謝 **[gnehs (勝勝)](https://github.com/gnehs)** 及其開發的開源專案：

* **資料來源核心**：本 MCP Server 在執行時讀取 **[ntut-course-crawler-node](https://github.com/gnehs/ntut-course-crawler-node)** 發布的課程、系所與學程 JSON。該 crawler repository 目前標示為 MIT；本專案沒有複製其原始碼，僅引用其公開資料端點。
* **相關專案致謝**：感謝 **[北科課程好朋友](https://github.com/gnehs/ntut-course-web)** 的開源貢獻。該 repository 目前標示為 GPL-3.0，但其前端原始碼未包含於本專案。
* **開發理念**：我們致力於推廣開源社群規範，善用「北科課程好朋友」已妥善整理的靜態資料進行二次開發。

沒有開源社群每天穩定整理出的資料，就不會有這個能夠讓 AI 瞬間看懂幾萬筆課程的 MCP Server，再次感謝！

---

## 🌟 核心特色 (Features)

本 MCP Server 提供 18 個 Tools，涵蓋從選課防呆到出國交換的完整生命週期。課程查詢會合併日間部、進修部與研究所資料：

1. **`search_courses`**：支援多維度精準過濾（關鍵字、系所、班級、必選修、學分數、全英語授課）。內建「空堂/避開時段」功能，AI 能直接篩選出不衝堂的課程。
2. **`check_graduation_requirements`**：企業級畢業審核引擎，支援跨類別選修溢出（Overflow 折抵）、學分採計上限（Cap）、重複修習同名/同課號去重過濾、缺額優先最佳化分配與非學分門檻審查。
3. **`check_prerequisites`**：結構化先修語法解析引擎，能自動過濾假陽性（如「無先修」、「極限」、「基礎」），精準提取先修科目名單、AND/OR 邏輯與分數標準，並能直接比對學生修課歷史與系所年級限制。
4. **`compare_courses`**：將多門候選課程的學分、教師、容量與退選人數並排，供 AI 決策。
5. **`validate_schedule`**：排課驗證器。檢查衝堂，計算總學分數與上課時數。
6. **`evaluate_ects_plan`**：出國留學學分稽核器。自動將台灣學分轉換為 ECTS（例如 1:1.5），並加總領域門檻。
7. **`export_markdown_appendix`**：一鍵將 ECTS 稽核結果匯出成可再轉換為 PDF 的 Markdown 報表草稿。
8. **`export_schedule_ics`**：把驗證過的課表轉換為 Google Calendar / Outlook 可匯入的 `.ics` 檔。
9. **`convert_grade_scale`**：GPA 與 ECTS 等第轉換器。
10. **`check_course_restrictions`**：自動判定課程是否屬於「進修部」或「碩博層級」。
11. **`get_classroom_location`**：查詢教室與大樓，評估跑堂動線。
12. **`get_course_history`** / **`get_course_details`**：歷年修課人數與課程大綱原始檔查詢。
13. **`get_departments`** / **`get_programs`** / **`get_program_courses`**：系所與微學程清單查詢。
14. **`refresh_cache`** / **`get_data_freshness`**：即時快取控制與新鮮度檢查。

*(註：Server 啟動時會預先載入最新學期資料，並每 30 分鐘更新一次快取；可使用 `refresh_cache` 手動更新。)*

---

## 🚀 安裝與啟動 (Installation)

請確認你的電腦已經安裝 [Node.js](https://nodejs.org/) (建議 v18 以上)。

```bash
# 1. 複製專案
git clone https://github.com/<your-username>/ntut-course-mcp.git
cd ntut-course-mcp

# 2. 安裝依賴套件
npm install

# 3. 編譯 TypeScript
npm run build

# 4. 啟動 MCP Server
npm start
```

---

## 🛠️ 掛載到 AI 客戶端 (Integration)

### 1. Claude Desktop
請開啟 Claude Desktop 的設定檔：
* **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
* **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`

將以下內容加入 `mcpServers` 區塊：
```json
{
  "mcpServers": {
    "ntut-course": {
      "command": "node",
      "args": ["<專案根目錄>/dist/index.js"]
    }
  }
}
```
*(請將 `<專案根目錄>` 替換為此 repository 的絕對路徑。)*

*存檔後請完全重新啟動 Claude Desktop。*

### 2. Antigravity (AGY)
請先在終端機進入專案目錄，然後直接輸入：
```bash
agy mcp add ntut-course node <專案根目錄>/dist/index.js
```

---

## 💬 推薦的 AI 指令範例 (Example Prompts)

把這個 MCP 裝好後，你可以直接對 AI 下達複雜的學業指令：

> **留學學分審核情境：**
> 「這是我準備申請海外碩士的 Appendix 要求。請用 `evaluate_ects_plan` 幫我查核我這四年修過的課（代碼：3103021, 3004138... 等），以 1:1.5 的比例轉換成 ECTS，看看我的數學和資工領域有沒有達標？完成後請用 `export_markdown_appendix` 輸出成報表存到桌面上。」

> **研究所排課防呆情境：**
> 「我是資工所碩士生，星期三下午要 Meeting。請幫我規劃一套下學期 9 學分的課表。排好後請用 `validate_schedule` 驗證衝堂，並用 `check_prerequisites` 確保我沒有踩到擋修地雷，最後幫我用 `export_schedule_ics` 產出行事曆檔案。」

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

第三方套件授權與來源請參考 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)；資料權利與免責範圍請參考 [DATA-DISCLAIMER.md](DATA-DISCLAIMER.md)。本專案的 MIT 授權只適用於本專案自行創作的程式碼與文件，不取代第三方套件、上游資料或外部專案各自適用的條款。
