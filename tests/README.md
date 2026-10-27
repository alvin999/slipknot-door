# 暗房精修調色迴圈防禦與真實測試說明

本測試套件專門用於防禦並驗證「暗房精修（Module 2: Retouch）」在雙圖或多圖調色時的狀態反應式無窮迴圈問題。

---

## 🚀 執行測試指令

在專案根目錄執行以下指令：

```bash
npm run test:darkroom
```

或直接使用 Node.js 執行：

```bash
node ./tests/verify-darkroom-loop.mjs
```

---

## 🔍 涵蓋之測試情境

1. **情境 1：原生 EXIF 載入與未調色相片切換**
   - 驗證當載入帶有原生拍攝色溫（如 5200K）或曝光值的相片時，系統精準識別為原生狀態，**不會**將其誤判為「使用者已自訂調色」，零多餘陣列重建。
2. **情境 2：使用者拉動調色滑桿**
   - 驗證滑桿變更時，精準觸發 1 次調色儲存與 1 次縮圖佇列更新，透過 `untrack` 與屬性髒檢查徹底斬斷 Svelte 5 的微任務反覆排程。
3. **情境 3：雙圖（或多圖）焦點切換**
   - 驗證相片 1 與相片 2 互相切換時，底片膠卷（Filmstrip）使用 `(plate.id)` keyed each，避免 DOM 節點反覆銷毀重掛，確保切換毫秒級流暢。

---

## 🛡️ 核心防禦點摘要

1. **`untrack` 隔離**：在 `+page.svelte` 的 `$effect` 內部，將 `syncActivePhotoTuning()` 使用 `untrack(() => ...)` 包裹，避免 Svelte 5 響應式追蹤代理物件屬性寫入而陷入遞迴。
2. **短路先於賦值**：`syncActivePhotoTuning()` 在 Dirty Check 比對通過前，絕不預先指派 `activePhoto.tuning`，維持 Proxy 乾淨狀態。
3. **原地屬性更新**：縮圖產生完畢後，就地更新 `gradedThumbnail`，不使用物件展開重建 `activePhoto` 參照。
4. **膠卷 Key 追蹤**：Filmstrip 採用 `{#each activeQueue as plate (plate.id)}`，防範主執行緒凍結。
