// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';

interface PhotoPlate {
  id: string;
  frameNo: string;
  filename: string;
  camera: string;
  appliedProfile: string;
  selected: boolean;
  flagged?: boolean;
  thumbnail?: string;
  gradedThumbnail?: string;
  asShotTemp?: number;
  asShotTint?: number;
  asShotExposure?: number;
  crop?: any;
  tuning?: {
    exposure: number;
    contrast: number;
    lutIntensity: number;
    colorTemp: number;
    tint: number;
    clarity?: number;
    sharpness?: number;
  };
}

describe('暗房精修雙圖調色循環與狀態同步測試 (Darkroom Loop Verification)', () => {
  it('重現問題：當有 2 張圖片時，調色完回寫 gradedThumbnail 觸發連鎖更新死循環', () => {
    let effectTriggerCount = 0;
    let arrayMutationCount = 0;

    // 初始兩張相片
    let photoPlates: PhotoPlate[] = [
      {
        id: 'photo_1',
        frameNo: '01A',
        filename: 'TEST_01.CR2',
        camera: 'Canon EOS R5',
        appliedProfile: 'Profile_01_MatteShadow',
        selected: true,
        flagged: true,
        thumbnail: 'data:image/jpeg;base64,thumb1',
        asShotTemp: 5200,
        asShotExposure: 0.33,
        asShotTint: 1.0,
        tuning: undefined
      },
      {
        id: 'photo_2',
        frameNo: '02A',
        filename: 'TEST_02.CR2',
        camera: 'Sony A7R IV',
        appliedProfile: 'Profile_00_StandardNatural',
        selected: false,
        flagged: true,
        thumbnail: 'data:image/jpeg;base64,thumb2',
        asShotTemp: 4800,
        asShotExposure: -0.67,
        asShotTint: -1.0,
        tuning: undefined
      }
    ];

    let activePhoto: PhotoPlate | null = photoPlates[0];

    // 調色滑桿狀態 (目前在第一張相片調色完成)
    let exposure = 0.35;
    let contrast = 0.15;
    let colorTemp = 5600;
    let tint = 2.0;
    let lutIntensity = 0.9;
    let clarity = 0.0;
    let sharpness = 0.0;

    // 模擬 +page.svelte 中的 syncActivePhotoTuning (第 872-925 行)
    function syncActivePhotoTuning() {
      if (!activePhoto) return;

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

      const currentPlate = photoPlates.find(p => p.id === activePhoto!.id);
      const tuningMatches = 
        (!currentPlate?.tuning && !targetTuning) ||
        (currentPlate?.tuning && targetTuning &&
          currentPlate.tuning.exposure === targetTuning.exposure &&
          currentPlate.tuning.contrast === targetTuning.contrast &&
          currentPlate.tuning.lutIntensity === targetTuning.lutIntensity &&
          currentPlate.tuning.colorTemp === targetTuning.colorTemp &&
          currentPlate.tuning.tint === targetTuning.tint &&
          (currentPlate.tuning.clarity ?? 0) === (targetTuning.clarity ?? 0) &&
          (currentPlate.tuning.sharpness ?? 0) === (targetTuning.sharpness ?? 0)
        );

      const profileMatches = currentPlate?.appliedProfile === activePhoto.appliedProfile;
      const cropMatches = JSON.stringify(currentPlate?.crop) === JSON.stringify(activePhoto.crop);

      // 關鍵觸發點 1：在此直接修改 activePhoto.tuning
      activePhoto.tuning = targetTuning;

      if (tuningMatches && profileMatches && cropMatches) {
        return false;
      }

      // 關鍵觸發點 2：陣列重新替換
      photoPlates = photoPlates.map(p => p.id === activePhoto!.id ? { 
        ...p, 
        tuning: activePhoto!.tuning, 
        crop: activePhoto!.crop,
        appliedProfile: activePhoto!.appliedProfile
      } : p);

      arrayMutationCount++;
      return true;
    }

    // 模擬 processThumbnailQueue 回寫 (第 833-840 行)
    function processThumbnailQueueCallback(plateId: string, dataUrl: string) {
      photoPlates = photoPlates.map(p => p.id === plateId ? { ...p, gradedThumbnail: dataUrl } : p);
      if (activePhoto && activePhoto.id === plateId) {
        // 重新賦值 activePhoto 觸發 Svelte 5 $effect
        activePhoto = { ...activePhoto, gradedThumbnail: dataUrl };
        onEffectTrigger();
      }
    }

    // 模擬 Svelte 5 $effect (第 1046-1077 行)
    function onEffectTrigger() {
      effectTriggerCount++;
      if (effectTriggerCount > 50) {
        throw new Error('Maximum update depth exceeded: 偵測到 Svelte 5 響應式無限迴圈！');
      }
      // effect 內部執行 syncActivePhotoTuning
      const mutated = syncActivePhotoTuning();
      if (mutated) {
        // 若陣列產生變化，縮圖排程又再次回寫
        processThumbnailQueueCallback(activePhoto!.id, 'data:image/jpeg;base64,NEW_GRADED_' + effectTriggerCount);
      }
    }

    // 測試：調色完成，首次觸發 effect
    console.log('--- 測試開始：模擬調色完畢觸發首次響應式同步 ---');
    
    let caughtInfiniteLoop = false;
    try {
      onEffectTrigger();
    } catch (err: any) {
      console.log('捕獲無限迴圈例外:', err.message);
      caughtInfiniteLoop = true;
    }

    console.log(`總觸發 Effect 次數: ${effectTriggerCount}`);
    console.log(`總替換 photoPlates 陣列次數: ${arrayMutationCount}`);

    // 驗證問題所在：此架構確實會觸發無限連鎖遞迴
    expect(caughtInfiniteLoop).toBe(true);
    expect(effectTriggerCount).toBeGreaterThan(50);
  });

  it('分析問題核心：驗證修復條件 (加入 dirty check 與 activePhoto.tuning 深度相等保護)', () => {
    // 驗證若在 syncActivePhotoTuning 中做適當的防禦性保護，是否能消除死循環
    let effectTriggerCount = 0;
    let arrayMutationCount = 0;

    let photoPlates: PhotoPlate[] = [
      { id: 'photo_1', frameNo: '01A', filename: 'TEST_01.CR2', camera: 'Canon', appliedProfile: 'Profile_01', selected: true, tuning: undefined },
      { id: 'photo_2', frameNo: '02A', filename: 'TEST_02.CR2', camera: 'Sony', appliedProfile: 'Profile_00', selected: false, tuning: undefined }
    ];

    let activePhoto: PhotoPlate | null = photoPlates[0];
    let exposure = 0.35;
    let contrast = 0.15;
    let colorTemp = 5600;
    let tint = 2.0;
    let lutIntensity = 0.9;

    function safeSyncActivePhotoTuning() {
      if (!activePhoto) return false;

      const currentPlate = photoPlates.find(p => p.id === activePhoto!.id);
      if (!currentPlate) return false;

      // 只有在數值真正不同時才更新，且絕不直接在 effect 同步執行中無條件重賦值
      const t = currentPlate.tuning;
      const isSame = t &&
        t.exposure === exposure &&
        t.contrast === contrast &&
        t.colorTemp === colorTemp &&
        t.tint === tint &&
        t.lutIntensity === lutIntensity;

      if (isSame) {
        return false;
      }

      const nextTuning = { exposure, contrast, colorTemp, tint, lutIntensity };
      activePhoto.tuning = nextTuning;
      photoPlates = photoPlates.map(p => p.id === activePhoto!.id ? { ...p, tuning: nextTuning } : p);
      arrayMutationCount++;
      return true;
    }

    // 測試安全同步
    const updated = safeSyncActivePhotoTuning();
    expect(updated).toBe(true);
    expect(arrayMutationCount).toBe(1);

    // 第二次呼叫，數值未變，不再觸發陣列重新替換
    const secondCall = safeSyncActivePhotoTuning();
    expect(secondCall).toBe(false);
    expect(arrayMutationCount).toBe(1);
  });
});
