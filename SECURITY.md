# Security Policy / 資安政策

**繁體中文** | [English](SECURITY.en.md) | [日本語](SECURITY.ja.md)

## 隱私與資安設計原則 (Privacy & Security Architecture)

**大相無形 (Slipknotting on Heaven's Door)** 是一款 Local-first 的相片暗房與 AI 輔助策展工具：

- **影像與檔案本機處理**：RAW / JPEG 相片於本機瀏覽器（WebGL2 / Canvas）或 Tauri 桌面端處理，僅在您主動觸發 AI 視覺分析時，將壓縮後的預覽圖傳送至您所指定的 AI 供應商端點。
- **自備金鑰 (BYOK)**：本專案不代管任何雲端後端或資料庫；API 金鑰僅存放於您的本機環境，建議於保險庫中選用「主密碼加密（PBKDF2 + AES-GCM）」模式。

## 支援版本 (Supported Versions)

| 版本 | 支援安全更新 |
| :--- | :--- |
| 最新正式版 (`main` / latest `v*` release) | 是 |
| 舊版釋出 | 否，請升級至最新版本 |

## 通報安全漏洞 (Reporting a Vulnerability)

如果您在本專案中發現任何潛在的安全漏洞（包含但不限於 XSS、Tauri IPC 權限越界、路徑遍歷、依賴套件高風險 CVE），**請勿直接建立公開 Issue**。

請透過以下私密管道通報：

1. **GitHub Private Vulnerability Reporting（建議）**：
   前往本專案 GitHub 頁面的 **Security → Advisories → Report a vulnerability** 提交報告。
2. **通報內容建議包含**：
   - 漏洞類型與受影響的檔案／元件（如網頁版或 Tauri 桌面版）
   - 重現步驟或最小驗證概念（PoC）
   - 預估影響範圍與建議修補方向（若有）

我們會在收到通報後盡快確認並評估修補時程，於修復發佈後公開致謝（若通報者同意）。
