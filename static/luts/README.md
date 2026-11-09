# 3D LUT (`.cube`) 色彩科學與風格維護指南

本目錄（`static/luts/`）存放供 WebGL 2.0 硬體著色器（[`webglLutRenderer.ts`](../../src/lib/services/webglLutRenderer.ts)）即時載入的標準 33×33×33 Adobe `.cube` 3D 色彩查找表。

前端介面遵循**去識別化（De-identified, Zero Brand Trademarks）**原則，以光學與顯影特性命名；底層 AI 提示詞定義於 [`styleDirectives.ts`](../../src/lib/services/ai/styleDirectives.ts)。

---

## 一、 色彩科學核心：OKLab 參數化數學生成

相較於傳統商業 LUT 粗暴的取樣或曲線擬合（往往造成膚色發黑、暗部結塊或過曝爆色），本目錄全面採用來自開源專案 [t0saki/lumix-original-looks](https://github.com/t0saki/lumix-original-looks) 的 10 款專用 LUT：

* **純數學 Oklab 空間生成**：在感知均勻色彩空間中運算，飽和度提升時色相不偏移，徹底消除色階斷裂（Posterization）。
* **標準相機直出基底 (Standard Photo Style + sRGB Base)**：與相機 RAW 內嵌預覽及 JPEG 基準 100% 吻合，無須複雜的色彩空間轉換。
* **物理底片階調**：內建長暗部 Toe（暗部透氣不死黑）與平滑高光滾降（Highlight Roll-off），搭配 WebGL Shader 的軟滾降與微米銀鹽微粒，達成高級直出質感。

---

## 二、 10 款主力風格對照表 (`Profile_01` ~ `Profile_10`)

| 序號與代號 (Badge) | 系統 Profile ID | UI 去識別化名稱 | 對應 `.cube` 檔名 | 核心光學色彩科學與場景設計 |
| :--- | :--- | :--- | :--- | :--- |
| **`FIELD_01`** | `Profile_01_Fieldnote` | **Fieldnote · 日常微負片** | `Fieldnote.cube` | **C-41 日常人文負片**：長階調長 Toe、板岩青暗部 + 稻草金高光，色彩克制耐看。 |
| **`HEART_02`** | `Profile_02_Heartland` | **Heartland · 溫潤人像負片** | `Heartland.cube` | **人像與室內暖光專用**：針對健康膚色保護調校，鎢絲燈光感，暗部不泛紅。 |
| **`MERIDIAN_03`** | `Profile_03_Meridian` | **Meridian · 澄澈天光紀實** | `Meridian.cube` | **真實日光紀實**：中性灰軸（Gray Axis）零漂移，忠實呈現晴空澄澈光學本相。 |
| **`MATINEE_04`** | `Profile_04_Matinee` | **Matinee · 放映電影拷貝** | `Matinee.cube` | **電影放映拷貝感 (Cinema Print Density)**：黑位深沉具階調、內斂細膩色彩。 |
| **`POSTCARD_05`** | `Profile_05_Postcard` | **Postcard · 明信片正片純色** | `Postcard.cube` | **正片色彩提純**：提高微密度與純淨度而非單純拉高飽和度，鮮活明媚。 |
| **`SKYLIGHT_06`** | `Profile_06_Skylight` | **Skylight · 天光重組高動態** | `Skylight.cube` | **光比重構**：開放暗部（Open Shadows）搭配壓縮高光，拯救大光比與逆光場景。 |
| **`NIGHT_07`** | `Profile_07_NightMarket` | **NightMarket · 夜市微光金芒** | `NightMarket.cube` | **夜間混光校準**：鎢絲燈與鈉燈拉向乾淨琥珀金，內建抗 LED 色階斷裂機制。 |
| **`DUSK_08`** | `Profile_08_DuskTide` | **DuskTide · 暮光藍調冷暖** | `DuskTide.cube` | **黃昏藍調時刻 (Blue Hour)**：深青靛藍陰影對比暖金燈火，冷暖交融。 |
| **`CANOPY_09`** | `Profile_09_Canopy` | **Canopy · 森綠層次透光** | `Canopy.cube` | **綠色層次分離**：陰翳青綠與透光黃綠分離，重現林蔭自然生機。 |
| **`LOWSUN_10`** | `Profile_10_Lowsun` | **Lowsun · 金暉斜陽逆光** | `Lowsun.cube` | **金色時刻 (Golden Hour)**：金琥珀高光對抗冷調藍陰影，立體感強烈。 |

---

## 三、 開源致謝與授權 (Acknowledgements & License)

* **專案來源**：[t0saki/lumix-original-looks](https://github.com/t0saki/lumix-original-looks)
* **設計作者**：Claude (Anthropic) in collaboration with t0saki
* **授權模式**：Open Source Community Distribution
* **用途說明**：本專案採用其 33-point `.cube` 檔案作為即時暗房調色與 AI 影像風格之物理標準。
