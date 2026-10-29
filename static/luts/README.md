# 3D LUT (`.cube`) 檔案來源與維護指南

本目錄（`static/luts/`）存放供 WebGL 2.0 硬體著色器（[`webglLutRenderer.ts`](../../src/lib/services/webglLutRenderer.ts)）即時載入的標準 32×32×32 Adobe `.cube` 3D 色彩查找表。

前端介面遵循**去識別化（De-identified, Zero Brand Trademarks）**原則，以光學與顯影特性命名；底層 AI 提示詞定義於 [`styleDirectives.ts`](../../src/lib/services/ai/styleDirectives.ts)。本文件記錄每個 `.cube` 檔案的真實底片/相機色彩科學來源、轉換方式與後續增刪修改流程，方便未來維護與替換。

---

## 一、 現有 `.cube` 檔案與去識別化風格對照表

### 1. 已綁定至 UI 選單的 10 款主力風格 (`Profile_01` ~ `Profile_10`)

| 序號与代號 (Badge) | 系統 Profile ID | UI 去識別化名稱 | 對應 `.cube` 檔名 | 真實色彩科學 / 底片原型 | 上游開源專案與原始路徑 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`FILM_LOOK_01`** | `Profile_01_MatteShadow` | **MatteShadow · 啞光微膠卷** | `fuji_eterna.cube` | **Fujifilm Eterna** (電影負片模擬) | [`abpy/FujifilmCameraProfiles`](https://github.com/abpy/FujifilmCameraProfiles)<br>`cube lut/eterna_sRGB.cube` |
| **`COLOR_GRADE_02`** | `Profile_02_TealEmerald` | **TealEmerald · 經典冷青** | `teal_emerald.cube` | **Sony Creative Look `FL`** 風格自訂曲線<br>*(高光純淨不泛黃、青碧色天空、草木去黃沉穩、暗部冷青抬升)* | 專案內建光學公式烘焙（參見 [`webglLutRenderer.ts`](../../src/lib/services/webglLutRenderer.ts) 之 `generateTealEmeraldLut` 邏輯） |
| **`PORTRAIT_03`** | `Profile_03_TungstenSoft` | **TungstenSoft · 溫潤人像** | `kodak_portra_160.cube` | **Kodak Portra 160** (專業人像彩色負片) | [`cedeber/hald-clut`](https://github.com/cedeber/hald-clut)<br>`HaldCLUT/Film Simulation/Color/Kodak/Kodak Portra 160 2.png` |
| **`MONO_SILVER_04`** | `Profile_04_HighContrastMono` | **HighContrastMono · 高反差單色** | `kodak_trix_400.cube` | **Kodak Tri-X 400** (經典紀實高反差黑白負片) | [`cedeber/hald-clut`](https://github.com/cedeber/hald-clut)<br>`HaldCLUT/Film Simulation/Black and White/Kodak/Kodak TRI-X 400 2.png` |
| **`CHROME_DOC_05`** | `Profile_05_DocumentaryChrome` | **DocumentaryChrome · 典藏冷印紀實** | `fuji_classic_chrome.cube` | **Fujifilm Classic Chrome** (經典紀實正片感) | [`abpy/FujifilmCameraProfiles`](https://github.com/abpy/FujifilmCameraProfiles)<br>`cube lut/classic chrome_sRGB.cube` |
| **`COLOR_NEG_06`** | `Profile_06_ClassicNeg` | **ClassicNeg · 經典人文彩色負片** | `fuji_classic_neg.cube` | **Fujifilm Classic Neg.** (Superia 系街拍負片) | [`abpy/FujifilmCameraProfiles`](https://github.com/abpy/FujifilmCameraProfiles)<br>`cube lut/classic neg_sRGB.cube` |
| **`VELVET_07`** | `Profile_07_VelvetSlide` | **VelvetSlide · 絲絨濃彩反轉片** | `fuji_velvia.cube` | **Fujifilm Velvia** (高飽和度風景正片) | [`abpy/FujifilmCameraProfiles`](https://github.com/abpy/FujifilmCameraProfiles)<br>`cube lut/velvia_sRGB.cube` |
| **`SOFT_TONE_08`** | `Profile_08_WarmAstia` | **SoftAstia · 柔順自然正片** | `fuji_astia.cube` | **Fujifilm Astia** (柔和膚色人像反轉片) | [`abpy/FujifilmCameraProfiles`](https://github.com/abpy/FujifilmCameraProfiles)<br>`cube lut/astia_sRGB.cube` |
| **`AMBER_NEG_09`** | `Profile_09_NostalgicNeg` | **NostalgicNeg · 懷舊琥珀暖調** | `fuji_nostalgic_neg.cube` | **Fujifilm Nostalgic Neg.** (American New Color 琥珀暖調) | [`abpy/FujifilmCameraProfiles`](https://github.com/abpy/FujifilmCameraProfiles)<br>`cube lut/nostalgic neg_sRGB.cube` |
| **`ACROS_SILVER_10`** | `Profile_10_PlatinumAcros` | **PlatinumAcros · 鉑金黑白微反差** | `fuji_acros.cube` | **Fujifilm Neopan Acros 100** (超細膩銀鹽黑白) | [`cedeber/hald-clut`](https://github.com/cedeber/hald-clut)<br>`HaldCLUT/Fujifilm XTrans III/Fuji XTrans III - Acros.png` |

---

### 2. 目錄內備用之未掛載 `.cube` 檔案（可供未來替換或擴充 `Profile_11+`）

本目錄下另預存了 3 款已下載完成的 sRGB `.cube` 檔案，目前尚未綁定至 UI 選單，隨時可於 [`webglLutRenderer.ts`](../../src/lib/services/webglLutRenderer.ts) 中替換或新增：

| 檔名 (`static/luts/`) | 真實色彩科學 / 底片原型 | 色彩特性說明 | 上游來源 |
| :--- | :--- | :--- | :--- |
| `fuji_provia.cube` | **Fujifilm Provia (Standard)** | 標準反轉片，色彩自然均衡、微反差通透 | `abpy/FujifilmCameraProfiles` (`cube lut/provia_sRGB.cube`) |
| `fuji_reala_ace.cube` | **Fujifilm Reala Ace** | 現代寫實負片，高光與陰影反差沉穩、膚色還原極為真實 | `abpy/FujifilmCameraProfiles` (`cube lut/reala ace_sRGB.cube`) |
| `fuji_bleach_bypass.cube` | **Fujifilm Bleach Bypass (Eterna 跳漂)** | 銀留殘留處理感，極高反差、超低彩度、冷峻金屬硬派感 | `abpy/FujifilmCameraProfiles` (`cube lut/bleach bypass_sRGB.cube`) |

---

## 二、 如何從 `cedeber/hald-clut` 轉換新的 HaldCLUT PNG 為 `.cube`？

專案根目錄下的 [`scripts/hald_to_cube.mjs`](../../scripts/hald_to_cube.mjs) 提供了完整的 **HaldCLUT (`.png`) ➔ 3D Trilinear 三線性重取樣 ➔ Adobe `.cube` (`LUT_3D_SIZE 32`)** 轉換器。

### 單檔轉換範例（Node.js）：

```javascript
import fs from 'fs';
import { haldClutToCube } from './scripts/hald_to_cube.mjs';

// 1. 讀取從 cedeber/hald-clut 下載的 HaldCLUT .png 圖片
const pngBuffer = fs.readFileSync('path/to/HaldCLUT_Image.png');

// 2. 透過三線性插值轉換為 32x32x32 的 .cube 字串 (檔案大小約 768 KB)
const cubeString = haldClutToCube(pngBuffer, 32, 'Custom Look Title');

// 3. 寫入 static/luts/ 目錄
fs.writeFileSync('static/luts/my_new_style.cube', cubeString, 'utf-8');
```

---

## 三、 後續替換或新增 LUT 的修改清單（Checklist）

若您日後想要替換某個風格的 `.cube` 檔案，或新增第 11 款風格，請依序檢查以下 4 個位置：

1. **實體檔案 (`static/luts/*.cube`)**：
   - 將新的 `.cube` 檔案放入 `static/luts/`。請確保色彩空間為 **sRGB**，網格尺寸建議為 `LUT_3D_SIZE 32` 或 `33`（WebGL 著色器的 `u_lutSize` 會自動適配 17 / 32 / 33 / 64 / 65 等任意階數）。
2. **WebGL 3D 紋理載入器 ([`src/lib/services/webglLutRenderer.ts`](../../src/lib/services/webglLutRenderer.ts))**：
   - 在 `preloadBuiltinLuts()` 方法中修改或新增 `this.loadCubeFileIfAvailable('Profile_XX_Name', '/luts/your_file.cube');`。
3. **AI 風格目標指令 ([`src/lib/services/ai/styleDirectives.ts`](../../src/lib/services/ai/styleDirectives.ts) & [`src/lib/services/ai/types.ts`](../../src/lib/services/ai/types.ts))**：
   - 在 `StylePresetKey` 與 `DIRECTIVES` 字典中對應更新該 `.cube` 的底片特性英文描述，讓 Gemini / Groq 模型在微調曝光、色溫與對比度時能精準配合該 LUT 的濃淡特性。
4. **前端選單與風格定義 ([`src/routes/+page.svelte`](../../src/routes/+page.svelte) & [`src/lib/types/profile.ts`](../../src/lib/types/profile.ts))**：
   - 更新 `styleGradingPresets`、`profiles` 與 `presetToProfileMap`，設定去識別化名稱、Badge 代號、代表色（`accent`）與預設光學微調值。

---

## 四、 開源授權聲明 (Licenses)

1. **[`cedeber/hald-clut`](https://github.com/cedeber/hald-clut)**（包含 RawTherapee Film Simulation Collection 與 Stuart Sowerby 之 Fuji XTrans III HaldCLUTs）
   - 授權條款：**GPL-3.0 License** / **CC BY-SA**
2. **[`abpy/FujifilmCameraProfiles`](https://github.com/abpy/FujifilmCameraProfiles)**
   - 授權條款：**CC BY-NC-SA 4.0**

