# 大相無形 / Slipknotting on Heaven's Door

> *“It's gettin' dark, too dark for me to see / I can't shoot them anymore.”*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Desktop & Mobile](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows%20%7C%20Android%20%7C%20iOS-6082b6.svg)](#)
[![Core: Tauri v2 + Rust](https://img.shields.io/badge/Core-Tauri%20v2%20%2B%20Rust-d4a373.svg)](#)
[![Design: Alexandria Darkroom](https://img.shields.io/badge/Design-Alexandria%20Darkroom-4b6b94.svg)](#)

**跨平台 AI 智慧暗房**——專為省去繁瑣後製流程打造的本機優先（Local-first）RAW 相片工作站。
將「匯入 ➔ 挑圖 ➔ 調色 ➔ 歸檔」濃縮成最直覺的 3 個步驟：

| 步驟 | 核心體驗 | 解決什麼痛點 |
| :--- | :--- | :--- |
| **1. 秒開挑圖** | 插卡即看、極速連選 | 免去漫長 RAW 轉檔等待，直接秒開全尺寸預覽；電腦鍵盤與手機觸控滑刷皆可快速篩片。 |
| **2. AI 智慧顯影** | 一鍵構圖與物理底片調色 | 自動完成水平拉平、構圖裁切、白平衡與光影校正，並從內建 **OKLab 3D LUT** 推薦最適合的色調（支援即時對比與批次調色）。 |
| **3. 智慧匯出歸檔** | 自動分類 + 社群文案 | 依場景或風格自動建立歸檔子資料夾、同步備份原始 RAW，並可一鍵生成社群貼文與 Hashtags。 |

---

## 命名緣由

本專案旨在解決現代數位攝影最耗神的環節：拍得再俐落，後續漫長的匯入與調色拉桿卻常把熱情消磨殆盡。中英文名稱分別從東方哲學與搖滾反骨的角度，定義了這套工具的精神：

* **中文名「大相無形」**  
  語出《道德經》「大象無形」，借「象」為相片與世間萬相之「相」。最好的暗房工具應退居幕後——使用者不該被臃腫的選單與參數束縛，而是抽離品牌濾鏡話術，回歸純粹光影與構圖的本相。
* **英文代號 `Slipknotting on Heaven's Door`**  
  改寫自 Bob Dylan 經典名曲《Knockin' on Heaven's Door》，並融入重金屬樂團 Slipknot 的雙關：
  * **"Too dark to see / Can't shoot them anymore"**：呼應傳統未顯影 RAW 檔的一片死黑，以及被冗長修圖折磨到「再也不想按快門」的攝影倦怠。
  * **從 Knockin' 到 Slipknotting（活結）**：活結是一拉即解的繩結。我們不再規矩地在門外輕聲叩門，而是以輕量 AI 與本機即時渲染，一拉解開繁瑣暗房的束縛，直通成片。

> **「底層以活結破開繁瑣暗房，表層以無形之姿洞悉萬相。」**

---

## 支援格式

相容主流相機 RAW 負片與標準影像格式（同時支援載入自訂 Adobe / DaVinci Resolve `.cube` 3D LUT）：

| 類別 | 支援副檔名 |
| :--- | :--- |
| **Sony / Canon / Nikon** | `.ARW`, `.SRF`, `.SR2` / `.CR2`, `.CR3`, `.CRW` / `.NEF`, `.NRW` |
| **Fujifilm / Panasonic / OM** | `.RAF` / `.RW2` / `.ORF` |
| **Pentax / Leica / Sigma / Samsung** | `.PEF`, `.PTX` / `.RWL` / `.X3F` / `.SRW` |
| **中片幅 (Hasselblad / Phase One)** | `.3FR`, `.FFF` / `.IIQ` |
| **開放標準與一般影像** | `.DNG`, `.JPG`, `.JPEG`, `.PNG`, `.WEBP` |

---

## 3D LUT 色彩科學與開源致謝

本專案捨棄廠牌商業濾鏡命名，內建 `Standard` 原色直出與 **10 款基於 OKLab 感知均勻色彩空間** 數學生成的 33×33×33 `.cube` 3D LUT（來源專案：[t0saki/lumix-original-looks](https://github.com/t0saki/lumix-original-looks)）。

* **Long Toe 長暗部漸進**：暗部細節透氣、不死黑結塊。
* **Highlight Compression 高光軟滾降**：亮部過渡柔和，防止色斑硬切與色階斷裂。
* **完整色彩規格與維護細節**：請參閱 [`static/luts/README.md`](static/luts/README.md)。

<details>
<summary>展開查看 11 款內建去識別化風格對照表（Profile_00 ~ Profile_10）</summary>

| 代號 | 名稱 | `.cube` 檔案 | 光學特性與適用場景 |
| :--- | :--- | :--- | :--- |
| `NATURAL_00` | **Standard · 原色自然直出** | *(Bypass)* | 零風格偏調，保留相機原生寬容度。 |
| `FIELD_01` | **Fieldnote · 日常微負片** | `Fieldnote.cube` | C-41 日常人文負片，板岩青暗部配稻草金高光。 |
| `HEART_02` | **Heartland · 溫潤人像負片** | `Heartland.cube` | 人像與室內暖光專用，保護膚色、通透不泛紅。 |
| `MERIDIAN_03` | **Meridian · 澄澈天光紀實** | `Meridian.cube` | 中性灰軸零漂移，適合晴空戶外與建築紀實。 |
| `MATINEE_04` | **Matinee · 放映電影拷貝** | `Matinee.cube` | 電影放映拷貝密度，黑位深沉、具故事感。 |
| `POSTCARD_05` | **Postcard · 明信片正片純色** | `Postcard.cube` | 反轉正片色彩提純與微密度強化，鮮明通透。 |
| `SKYLIGHT_06` | **Skylight · 天光重組高動態** | `Skylight.cube` | 開放暗部搭配壓縮高光，拯救大光比與逆光。 |
| `NIGHT_07` | **NightMarket · 夜市微光金芒** | `NightMarket.cube` | 夜間混光校準，鎢絲/鈉燈轉琥珀金並抗 LED 斷階。 |
| `DUSK_08` | **DuskTide · 暮光藍調冷暖** | `DuskTide.cube` | 黃昏藍調時刻，深青靛藍陰影對比暖金燈火。 |
| `CANOPY_09` | **Canopy · 森綠層次透光** | `Canopy.cube` | 陰翳青綠與透光黃綠分離，適合林蔭自然風景。 |
| `LOWSUN_10` | **Lowsun · 金暉斜陽逆光** | `Lowsun.cube` | 金色時刻專用，金琥珀高光對比冷調藍陰影。 |

</details>

---

## 快速開始

```bash
# 1. 安裝相依套件
npm install

# 2. 啟動 Web 前端開發伺服器
npm run dev

# 3. 啟動 Tauri 桌面端原生應用
npm run tauri dev

# 4. 執行型別與語法檢查 / 暗房閉環驗證
npm run check
npm run test:darkroom
```
