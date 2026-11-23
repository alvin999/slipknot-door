# AI Prompt 規範與目錄說明

## 【AI Prompt 中性化與客觀數據規範準則 (Prompt Neutrality Guidelines)】

所有位於 `src/lib/services/ai/prompts/` 內的 Prompt 構建器，均須嚴格遵守以下準則（特別是影像與調色相關通道）：

1. **保持客觀中立**：不使用情緒化形容詞（如 `punch`、`dreamy`、`extreme`、`harsh`、`poetic`）。
2. **避免固定數值區間**：不提供預設數字範例或固定範圍，由模型依據畫面光學動態自主推算。
3. **純物理控制通道**：僅提供數據型別、物理邊界、方向定義與 EXIF 參數。
4. **責任分離**：Schema 作為標準型別規格，由前置風格意向引導調色，回歸模型預訓練常識。

### 分階段中性 Prompt 構建原則（Vision / Color Grading）

1. **幾何與色彩解耦**：幾何空間（Stage 1）與光學色彩（Stage 2）完全解耦，防止 Attention 互相稀釋與直方圖因果倒置。
2. **動態通道裁切**：依據使用者指派之 `AiScopePreferences` 動態隱藏／關閉非目標通道，杜絕無謂參數漂移。
3. **語系一致**：使用者可讀欄位須透過 `getAiResponseLanguageInstruction()` 與 `i18nStore.locale` 與目前 UI 語系保持一致。

---

## 檔案職責

- `index.ts`：統一匯出所有 Prompt 建構函式與常數。
- `visionPrompts.ts`：影像幾何、色彩分級、單次全量顯影與雙圖閉環覆審（Critic）Prompt。
- `copywritingPrompt.ts`：社群文案與 IPTC 關鍵字生成 Prompt。
- `directoryPlanPrompt.ts`：數位資產管理 (DAM) 匯出目錄結構規劃 Prompt。
- `commonPrompts.ts`：共用輕量常數（如連線測試提示詞）。
