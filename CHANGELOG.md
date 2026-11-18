# 更新日誌 (Changelog)

本專案遵循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/) 格式，並採用 [語意化版本 (Semantic Versioning)](https://semver.org/lang/zh-TW/) 規範。

---

## [0.1.0] - 2026-11-18

### 🚀 首個正式公開預覽版（Initial Public Release）

**大相無形（Slipknotting on Heaven's Door）** 是一款專為省去繁瑣後製流程打造的本機優先（Local-first）RAW 相片工作站。底層以活結破開繁瑣暗房，表層以無形之姿洞悉萬相。

---

### ✨ 核心亮點 (Highlights)

* **3 步極簡工作流程**：
  1. **秒開挑圖 (Instant Culling)**：跳過漫長 RAW 轉檔等待，秒開全尺寸預覽，支援電腦鍵盤快捷鍵極速連選與手機觸控滑刷。
  2. **AI 智慧顯影 (AI Darkroom & Grading)**：一鍵構圖水平拉平、幾何校正、自動白平衡與物理底片調色，並支援原圖即時快速對比（Split-view / Press to Compare）。
  3. **智慧匯出歸檔 (Smart Export & Copywriting)**：依場景或風格自動建立分類歸檔資料夾、同步備份原始 RAW 檔，並一鍵生成社群貼文文案與精選 Hashtags。
* **OKLab 3D LUT 色彩科學 (OKLab Color Science)**：
  * 捨棄商業行銷濾鏡命名，內建 `Standard` 原色自然直出與 **10 款基於 OKLab 感知均勻色彩空間** 數學生成之 33×33×33 `.cube` 3D 查表檔。
  * **長暗部漸進 (Long Toe)**：暗部階調透氣不結塊。
  * **高光軟滾降 (Highlight Compression)**：亮部過渡柔和自然，杜絕高光色斑硬切與色階斷層。
  * 支援手動載入自訂 `.cube` 3D LUT 並即時渲染預覽。
* **統一 AI 模型樞紐 (Unified AI Model Hub)**：
  * 支援主流雲端與本機推論引擎：**OpenAI**、**Anthropic Claude**、**OpenRouter** 與本機 **Ollama**。
  * **雙階段管線 (Two-pass Architecture)**：
    * Pass 1：場景語意與直方圖物理光影分析，輸出無損調色參數建議。
    * Pass 2（可選）：專業審美批評者（Critic）模型，針對高光死白、陰影偏色與膚色保護進行覆核修正。
  * 支援精細控制：單獨任務溫度（Temperature）、微調影響力強度（Tuning Strength）、多輪對話式調色（Co-pilot）與細部 AI 介入範疇。
* **現代化響應式 UI (Alexandria Darkroom Design)**：
  * 沉浸式暗房界面，完美自適應桌面端寬螢幕佈局與行動端抽屜式滑動操控。
  * 支援漸進式網頁應用（PWA）與輕量 Service Worker，行動裝置免安裝即可直接加入主畫面體驗。
* **完整國際化多語系支援 (i18n)**：
  * 完整支援繁體中文（zh-TW，台灣用語標準）、英文（en）與日文（ja）全介面切換。
  * AI 提示詞（Prompt）輸出語言與介面語系即時同步，並內建自動化語系對齊校驗工具。

---

### 🛠️ 效能與架構重構 (Performance & Architecture)

* **Svelte 5 Runes 全面改寫**：以深度響應式架構重構暗房狀態機，徹底消除狀態循環相依造成的乒乓死循環問題。
* **模組化狀態架構**：將巨石狀態解耦為單一職責 Store：
  * `photoLibrary`：相片庫存儲、讀取、檔案拖曳與 Undo/Redo 歷史紀錄。
  * `darkroomState`：暗房調色參數、幾何裁切與歷史狀態。
  * `aiPipeline`：AI 批次控制器、模型設定與推論流程。
  * `lutCatalog`：3D LUT 查表載入與自訂 LUT 快取。
  * `exportState`：智慧歸檔、格式轉換與社群文案生成。
* **離屏縮圖渲染佇列 (Offscreen Thumbnail Queue)**：採用非同步排程平滑更新縮圖，確保大量 RAW 載入時主執行緒操作依然順暢無延遲。

---

### 🧪 驗證與測試 (Verification)

* 包含完整的 i18n 鍵值對稱檢查腳本 (`npm run check:i18n`)。
* 包含暗房調色狀態迴圈回歸測試 (`npm run test:darkroom`)。
* 通過 TypeScript 與 Svelte-Check 零警告、零錯誤驗證。
