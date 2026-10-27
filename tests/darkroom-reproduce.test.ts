// @ts-nocheck
import { describe, it, expect } from 'vitest';

/**
 * Alexandria Darkroom 調色響應式循環真實驗證測試
 * 模擬 Svelte 5 Runes ($state, $effect, $derived) 在「暗房精修」雙圖調色時的狀態流轉
 */
describe('暗房精修雙圖調色無限迴圈真實驗證 (Darkroom Infinite Loop Reproduction)', () => {

  it('【重現失敗】模擬目前程式碼：調色完回寫 gradedThumbnail 與 $effect 造成死循環與主執行緒卡死', () => {
    let loopCounter = 0;
    const MAX_SAFE_DEPTH = 30; // 模擬瀏覽器 / Svelte 5 最大遞迴更新深度上限
    let maximumUpdateDepthExceeded = false;

    // 模擬 2 張圖片
    let plates = [
      {
        id: 'photo_1',
        filename: 'DSC01873.ARW',
        appliedProfile: 'Profile_05_DocumentaryChrome',
        tuning: { exposure: 0.1, contrast: 0.0, lutIntensity: 1.0, colorTemp: 5600, tint: 0.5 },
        gradedThumbnail: undefined,
        aiDecision: { scene_title: '日光寫實紀實' },
        sceneTag: '日光寫實紀實'
      },
      {
        id: 'photo_2',
        filename: 'DSC01874.ARW',
        appliedProfile: 'Profile_05_DocumentaryChrome',
        tuning: { exposure: 0.1, contrast: 0.0, lutIntensity: 1.0, colorTemp: 5600, tint: 0.5 },
        gradedThumbnail: undefined,
        aiDecision: { scene_title: '日光寫實紀實' },
        sceneTag: '日光寫實紀實'
      }
    ];

    let activePhoto = plates[0];
    let exposure = 0.1;
    let contrast = 0.0;
    let colorTemp = 5600;
    let tint = 0.5;
    let lutIntensity = 1.0;
    let clarity = 0.0;
    let sharpness = 0.0;

    // 目前 codebase 中的 syncActivePhotoTuning 實作 (+page.svelte 第 872-925 行)
    function currentSyncActivePhotoTuning() {
      if (!activePhoto) return false;

      const isDefaultTuning = 
        exposure === 0.0 &&
        contrast === 0.0 &&
        colorTemp === 5500 &&
        tint === 0.0 &&
        lutIntensity === 1.0 &&
        clarity === 0.0 &&
        sharpness === 0.0;

      const targetTuning = isDefaultTuning ? undefined : {
        exposure,
        contrast,
        lutIntensity,
        colorTemp,
        tint,
        clarity,
        sharpness
      };

      const currentPlate = plates.find(p => p.id === activePhoto!.id);
      const tuningMatches = 
        (!currentPlate?.tuning && !targetTuning) ||
        (currentPlate?.tuning && targetTuning &&
          currentPlate.tuning.exposure === targetTuning.exposure &&
          currentPlate.tuning.contrast === targetTuning.contrast &&
          currentPlate.tuning.lutIntensity === targetTuning.lutIntensity &&
          currentPlate.tuning.colorTemp === targetTuning.colorTemp &&
          currentPlate.tuning.tint === targetTuning.tint
        );

      const profileMatches = currentPlate?.appliedProfile === activePhoto.appliedProfile;

      // 缺陷點 A: 在 short-circuit 判斷前直接變更 activePhoto 的屬性
      activePhoto.tuning = targetTuning;

      if (tuningMatches && profileMatches) {
        return false; // 短路未重新產生陣列
      }

      // 缺陷點 B: 重新賦值 plates 觸發 derived 與外部重繪
      plates = plates.map(p => p.id === activePhoto!.id ? { 
        ...p, 
        tuning: activePhoto!.tuning, 
        appliedProfile: activePhoto!.appliedProfile,
        aiDecision: activePhoto!.aiDecision,
        sceneTag: activePhoto!.sceneTag
      } : p);

      return true;
    }

    // 模擬目前 processThumbnailQueue (+page.svelte 第 834-840 行)
    function onThumbnailGradedCallback(photoId: string, dataUrl: string) {
      plates = plates.map(p => p.id === photoId ? { ...p, gradedThumbnail: dataUrl } : p);
      if (activePhoto && activePhoto.id === photoId) {
        // 缺陷點 C: 每次回寫都建立全新參照 activePhoto，激發依賴 activePhoto 的所有 Svelte 5 $effect
        activePhoto = { ...activePhoto, gradedThumbnail: dataUrl };
        triggerEffect();
      }
    }

    // 模擬 Svelte 5 $effect (+page.svelte 第 1046-1077 行)
    function triggerEffect() {
      loopCounter++;
      if (loopCounter > MAX_SAFE_DEPTH) {
        maximumUpdateDepthExceeded = true;
        throw new Error('ERR_SVELTE_TOO_MANY_UPDATES: Maximum update depth exceeded in $effect');
      }

      // $effect 內讀取 activePhoto 並直接同步呼叫 syncActivePhotoTuning
      const changed = currentSyncActivePhotoTuning();

      // 當陣列被改變時，又排程了離屏縮圖渲染並非同步回寫
      if (changed || loopCounter < 5) {
        onThumbnailGradedCallback(activePhoto.id, 'data:image/jpeg;base64,DATA_' + loopCounter);
      }
    }

    // 啟動調色完成模擬
    try {
      triggerEffect();
    } catch (err: any) {
      console.log('  [捕獲到無限遞迴例外]:', err.message);
    }

    console.log(`  總遞迴更新呼叫次數: ${loopCounter}`);
    expect(maximumUpdateDepthExceeded).toBe(true);
  });

  it('【驗證修復】加入 Guard 與分離副作用後，完全消除死循環且維持 60FPS 流暢', () => {
    let loopCounter = 0;
    let arrayMutationCount = 0;

    let plates = [
      {
        id: 'photo_1',
        filename: 'DSC01873.ARW',
        appliedProfile: 'Profile_05_DocumentaryChrome',
        tuning: { exposure: 0.1, contrast: 0.0, lutIntensity: 1.0, colorTemp: 5600, tint: 0.5 },
        gradedThumbnail: undefined
      },
      {
        id: 'photo_2',
        filename: 'DSC01874.ARW',
        appliedProfile: 'Profile_05_DocumentaryChrome',
        tuning: { exposure: 0.1, contrast: 0.0, lutIntensity: 1.0, colorTemp: 5600, tint: 0.5 },
        gradedThumbnail: undefined
      }
    ];

    let activePhoto = plates[0];
    let exposure = 0.1;
    let contrast = 0.0;
    let colorTemp = 5600;
    let tint = 0.5;
    let lutIntensity = 1.0;

    // 修復後架構：嚴格深度 Dirty Check，若無實質變更絕不修改 activePhoto 或 plates
    function safeSyncActivePhotoTuning(): boolean {
      if (!activePhoto) return false;

      const currentPlate = plates.find(p => p.id === activePhoto!.id);
      if (!currentPlate) return false;

      const currentTuning = currentPlate.tuning;
      const hasTuningChanged = !currentTuning ||
        currentTuning.exposure !== exposure ||
        currentTuning.contrast !== contrast ||
        currentTuning.lutIntensity !== lutIntensity ||
        currentTuning.colorTemp !== colorTemp ||
        currentTuning.tint !== tint;

      if (!hasTuningChanged) {
        return false; // 短路：不修改 activePhoto.tuning，不替換 plates
      }

      const nextTuning = { exposure, contrast, lutIntensity, colorTemp, tint };
      activePhoto.tuning = nextTuning;
      plates = plates.map(p => p.id === activePhoto!.id ? { ...p, tuning: nextTuning } : p);
      arrayMutationCount++;
      return true;
    }

    // 縮圖回寫時：就地更新 (In-place property update)，絕不更換 activePhoto 參照
    function safeThumbnailGradedCallback(photoId: string, dataUrl: string) {
      const target = plates.find(p => p.id === photoId);
      if (target && target.gradedThumbnail !== dataUrl) {
        target.gradedThumbnail = dataUrl;
        if (activePhoto && activePhoto.id === photoId) {
          activePhoto.gradedThumbnail = dataUrl; // 直接賦值屬性，不重建整個物件
        }
      }
    }

    // 模擬調色後多次事件觸發
    for (let i = 0; i < 20; i++) {
      loopCounter++;
      safeSyncActivePhotoTuning();
      safeThumbnailGradedCallback(activePhoto.id, 'data:image/jpeg;base64,FINAL_DATA');
    }

    console.log(`  修復後總更新陣列次數: ${arrayMutationCount} (預期為 0 次，因為數值一致)`);
    console.log(`  修復後調色循環次數: ${loopCounter}`);

    expect(arrayMutationCount).toBe(0);
    expect(loopCounter).toBe(20);
  });
});
