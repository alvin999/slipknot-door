import { untrack } from "svelte";
import { thumbnailRenderService } from "$lib/services/thumbnailRenderService.svelte";
import { aiPipeline } from "$lib/stores/aiPipeline.svelte";
import { darkroomState } from "$lib/stores/darkroomState.svelte";
import {
  photoLibrary,
  type PhotoPlateItem,
} from "$lib/stores/photoLibrary.svelte";
import { toastStore } from "$lib/stores/toastStore.svelte";
import { workspaceUi } from "$lib/stores/workspaceUi.svelte";
import {
  HSL_BAND_KEYS,
  cloneHslAdjustments,
  type TuningParameters,
} from "$lib/types/photo";

type NumericTuningKey = {
  [K in keyof TuningParameters]-?: NonNullable<TuningParameters[K]> extends number
    ? K
    : never;
}[keyof TuningParameters];

const TUNING_COMPARE_SPECS: ReadonlyArray<{
  key: NumericTuningKey;
  fallback: number;
  tolerance: number;
}> = [
  { key: "exposure", fallback: 0, tolerance: 0.001 },
  { key: "highlights", fallback: 0, tolerance: 0.001 },
  { key: "contrast", fallback: 0, tolerance: 0.001 },
  { key: "shadows", fallback: 0, tolerance: 0.001 },
  { key: "blacks", fallback: 0, tolerance: 0.001 },
  { key: "lutIntensity", fallback: 0, tolerance: 0.001 },
  { key: "colorTemp", fallback: 0, tolerance: 1 },
  { key: "tint", fallback: 0, tolerance: 0.001 },
  { key: "vibrance", fallback: 0, tolerance: 0.001 },
  { key: "clarity", fallback: 0, tolerance: 0.001 },
  { key: "sharpness", fallback: 0, tolerance: 0.001 },
  { key: "colorDensity", fallback: 0, tolerance: 0.001 },
  { key: "shadowHue", fallback: 200, tolerance: 0.5 },
  { key: "shadowTintAmount", fallback: 0, tolerance: 0.001 },
  { key: "highlightHue", fallback: 40, tolerance: 0.5 },
  { key: "highlightTintAmount", fallback: 0, tolerance: 0.001 },
  { key: "halation", fallback: 0, tolerance: 0.001 },
  { key: "grainAmount", fallback: 0.15, tolerance: 0.001 },
  { key: "vignette", fallback: 0, tolerance: 0.001 },
];

function isTuningEqual(
  a: TuningParameters | undefined,
  b: TuningParameters | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;

  const hslMatches = HSL_BAND_KEYS.every((k) => {
    const bandA = a.hsl?.[k];
    const bandB = b.hsl?.[k];
    return (
      Math.abs((bandA?.hue ?? 0) - (bandB?.hue ?? 0)) < 0.001 &&
      Math.abs((bandA?.sat ?? 0) - (bandB?.sat ?? 0)) < 0.001 &&
      Math.abs((bandA?.lum ?? 0) - (bandB?.lum ?? 0)) < 0.001
    );
  });
  if (!hslMatches) return false;

  const numbersMatch = TUNING_COMPARE_SPECS.every(({ key, fallback, tolerance }) => {
    const valA = a[key] ?? fallback;
    const valB = b[key] ?? fallback;
    return Math.abs(valA - valB) < tolerance;
  });
  if (!numbersMatch) return false;

  return (a.monochrome ?? false) === (b.monochrome ?? false);
}

function createDarkroomSyncState() {
  // AI 風格調色預覽狀態
  let previewHoverProfileId = $state<string | null>(null);

  // 判定目前焦點相片是否有 AI 基準可還原
  const hasAiBaseline = $derived(!!photoLibrary.activePhoto?.aiTuningSnapshot);

  // 判定目前調色是否相較於 AI 基準已被使用者手動更動過
  const isModifiedFromAi = $derived.by(() =>
    darkroomState.isModifiedFromAi(photoLibrary.activePhoto as any),
  );

  function enqueueThumbnailRender(plate: PhotoPlateItem) {
    thumbnailRenderService.enqueueThumbnailRender(plate);
  }

  function syncCropToActivePhoto() {
    const activePhoto = photoLibrary.activePhoto;
    if (!activePhoto) return;
    const targetCrop = darkroomState.buildCropSnapshot();

    if (JSON.stringify(activePhoto.crop) === JSON.stringify(targetCrop)) {
      return;
    }

    activePhoto.crop = targetCrop;
    photoLibrary.photoPlates = photoLibrary.photoPlates.map((p) =>
      p.id === activePhoto.id
        ? {
            ...p,
            crop: activePhoto.crop,
          }
        : p,
    );
  }

  function resetCropState() {
    darkroomState.resetCropState();
    syncCropToActivePhoto();
  }

  /**
   * 同步當前滑桿調色狀態至 activePhoto 與 photoPlates
   * 若所有滑桿為預設值且為標準風格，則判定為未調色 (tuning = undefined)
   * 包含 dirty check 保護，避免數值無變化時重複重建陣列造成反應式無窮迴圈
   */
  function syncActivePhotoTuning() {
    const activePhoto = photoLibrary.activePhoto;
    if (!activePhoto) return;

    const targetTuning = darkroomState.buildTuningSnapshot(activePhoto as any);
    const currentPlate = photoLibrary.photoPlates.find(
      (p) => p.id === activePhoto.id,
    );

    const tuningMatches = isTuningEqual(currentPlate?.tuning, targetTuning);
    const profileMatches =
      currentPlate?.appliedProfile === activePhoto.appliedProfile;
    const cropMatches =
      JSON.stringify(currentPlate?.crop) === JSON.stringify(activePhoto.crop);
    const aiDecisionMatches =
      JSON.stringify(currentPlate?.aiDecision) ===
      JSON.stringify(activePhoto.aiDecision);
    const sceneTagMatches = currentPlate?.sceneTag === activePhoto.sceneTag;

    // 若底片屬性完全一致，短路返回，絕不重複指派 activePhoto 與 photoPlates 觸發連鎖效應
    if (
      tuningMatches &&
      profileMatches &&
      cropMatches &&
      aiDecisionMatches &&
      sceneTagMatches
    ) {
      return;
    }

    activePhoto.tuning = targetTuning;

    photoLibrary.photoPlates = photoLibrary.photoPlates.map((p) =>
      p.id === activePhoto.id
        ? {
            ...p,
            tuning: targetTuning,
            crop: activePhoto.crop,
            appliedProfile: activePhoto.appliedProfile,
            aiDecision: activePhoto.aiDecision,
            sceneTag: activePhoto.sceneTag,
          }
        : p,
    );
  }

  /**
   * 響應式追蹤 darkroomState 數值並同步持久化到 activePhoto.tuning 與 activePhoto.crop
   */
  function trackAndSync() {
    void darkroomState.exposure;
    void darkroomState.contrast;
    void darkroomState.shadows;
    void darkroomState.colorTemp;
    void darkroomState.tint;
    void darkroomState.lutIntensity;
    void darkroomState.clarity;
    void darkroomState.sharpness;
    void darkroomState.colorDensity;
    void darkroomState.shadowHue;
    void darkroomState.shadowTintAmount;
    void darkroomState.highlightHue;
    void darkroomState.highlightTintAmount;
    void darkroomState.halation;
    void darkroomState.grainAmount;
    void darkroomState.highlights;
    void darkroomState.blacks;
    void darkroomState.vibrance;
    void darkroomState.vignette;
    void darkroomState.monochrome;
    void cloneHslAdjustments(darkroomState.hsl);

    void darkroomState.cropX;
    void darkroomState.cropY;
    void darkroomState.cropWidth;
    void darkroomState.cropHeight;
    void darkroomState.cropRotation;
    void darkroomState.keystoneV;
    void darkroomState.keystoneH;
    void darkroomState.cropAspectRatio;
    void darkroomState.flipH;
    void darkroomState.flipV;
    void darkroomState.isCropMode;
    void darkroomState.aiCropRationale;

    if (!aiPipeline.isBatchAiRunning) {
      untrack(() => {
        syncActivePhotoTuning();
        syncCropToActivePhoto();
      });
    }
  }

  function applyProfile(profileId: string) {
    const activePhoto = photoLibrary.activePhoto;
    if (!activePhoto) return;
    activePhoto.appliedProfile = profileId;
    photoLibrary.photoPlates = photoLibrary.photoPlates.map((p) =>
      p.id === activePhoto.id ? { ...p, appliedProfile: profileId } : p,
    );
    darkroomState.applyProfileDefaults(profileId);
    workspaceUi.triggerWebglRender();
    enqueueThumbnailRender(activePhoto);
  }

  function applyProfileToAll(profileId: string) {
    photoLibrary.photoPlates.forEach((p) => {
      p.appliedProfile = profileId;
      enqueueThumbnailRender(p);
    });
    if (photoLibrary.activePhoto) {
      applyProfile(profileId);
    }
  }

  /**
   * 一鍵還原為相機原生拍攝參數（As Shot WB & Exposure）
   */
  function resetToAsShot() {
    const activePhoto = photoLibrary.activePhoto;
    if (!activePhoto) return;
    darkroomState.resetToAsShot(activePhoto as any);
    workspaceUi.triggerWebglRender();
  }

  /**
   * 一鍵恢復為 AI 顯影基準參數 (Restore AI Tuning Baseline)
   * 當使用者在 AI 顯影後進行微調，但想要還原回 AI 最初調好狀態時呼叫
   */
  function restoreAiTuning() {
    const activePhoto = photoLibrary.activePhoto;
    if (!activePhoto || !activePhoto.aiTuningSnapshot) return;
    const snapshot = activePhoto.aiTuningSnapshot;

    if (
      snapshot.appliedProfile &&
      snapshot.appliedProfile !== activePhoto.appliedProfile
    ) {
      applyProfile(snapshot.appliedProfile);
    }

    darkroomState.animateAdjustmentValues(
      {
        exposure: snapshot.tuning.exposure,
        highlights: snapshot.tuning.highlights ?? 0.0,
        contrast: snapshot.tuning.contrast,
        shadows: snapshot.tuning.shadows ?? 0.0,
        blacks: snapshot.tuning.blacks ?? 0.0,
        lutIntensity: snapshot.tuning.lutIntensity,
        colorTemp: snapshot.tuning.colorTemp,
        tint: snapshot.tuning.tint ?? 0.0,
        vibrance: snapshot.tuning.vibrance ?? 0.0,
        clarity: snapshot.tuning.clarity ?? 0.0,
        sharpness: snapshot.tuning.sharpness ?? 0.0,
        colorDensity: snapshot.tuning.colorDensity ?? 0.0,
        shadowHue: snapshot.tuning.shadowHue ?? 200,
        shadowTintAmount: snapshot.tuning.shadowTintAmount ?? 0.0,
        highlightHue: snapshot.tuning.highlightHue ?? 40,
        highlightTintAmount: snapshot.tuning.highlightTintAmount ?? 0.0,
        halation: snapshot.tuning.halation ?? 0.0,
        grainAmount: snapshot.tuning.grainAmount ?? 0.15,
        vignette: snapshot.tuning.vignette ?? 0.0,
        hsl: cloneHslAdjustments(snapshot.tuning.hsl),
      },
      450,
    );

    darkroomState.monochrome = snapshot.tuning.monochrome ?? false;
    darkroomState.hsl = cloneHslAdjustments(snapshot.tuning.hsl);

    if (snapshot.crop) {
      darkroomState.cropX = snapshot.crop.x;
      darkroomState.cropY = snapshot.crop.y;
      darkroomState.cropWidth = snapshot.crop.width;
      darkroomState.cropHeight = snapshot.crop.height;
      darkroomState.cropRotation = snapshot.crop.rotation;
      darkroomState.keystoneV = snapshot.crop.keystoneV ?? 0;
      darkroomState.keystoneH = snapshot.crop.keystoneH ?? 0;
      darkroomState.cropAspectRatio = snapshot.crop.aspectRatio;
      darkroomState.flipH = snapshot.crop.flipH;
      darkroomState.flipV = snapshot.crop.flipV;
    }

    activePhoto.tuning = { ...snapshot.tuning };
    if (snapshot.crop) activePhoto.crop = { ...snapshot.crop };
    activePhoto.appliedProfile = snapshot.appliedProfile;
    activePhoto.aiLatestBaseline = {
      ...snapshot,
      tuning: {
        ...snapshot.tuning,
        hsl: cloneHslAdjustments(snapshot.tuning.hsl),
      },
      crop: snapshot.crop ? { ...snapshot.crop } : undefined,
    };
    activePhoto.aiIterationHistory = [];
    aiPipeline.lockManualAdjustments = true;

    workspaceUi.triggerWebglRender();
    toastStore.show("已恢復為 AI 顯影基準調色 ✓", "success", 2500);
  }

  /**
   * 一鍵完全重設底片（恢復原廠未修原始狀態：清除所有調色、風格濾鏡與構圖裁切）
   * 執行後該照片即刻自「已調色」清單與匯出佇列中排除
   */
  function resetTuningParams() {
    darkroomState.resetTuningParams();
    darkroomState.resetCropState();
    resetCropState();
    aiPipeline.resetDecisionState();
    aiPipeline.iterativeFeedbackPrompt = "";
    aiPipeline.lockManualAdjustments = true;

    const activePhoto = photoLibrary.activePhoto;
    if (activePhoto) {
      activePhoto.appliedProfile = "Profile_00_StandardNatural";
      activePhoto.tuning = undefined;
      activePhoto.crop = undefined;
      activePhoto.gradedThumbnail = undefined;
      activePhoto.aiDecision = undefined;
      activePhoto.aiTuningSnapshot = undefined;
      activePhoto.aiLatestBaseline = undefined;
      activePhoto.aiIterationHistory = undefined;
      activePhoto.sceneTag = "本機相簿幀";
      photoLibrary.photoPlates = photoLibrary.photoPlates.map((p) =>
        p.id === activePhoto.id
          ? {
              ...p,
              tuning: undefined,
              crop: undefined,
              appliedProfile: "Profile_00_StandardNatural",
              gradedThumbnail: undefined,
              aiDecision: undefined,
              sceneTag: "本機相簿幀",
            }
          : p,
      );
    }
    workspaceUi.triggerWebglRender();
  }

  async function runIterativeAiRefinement(
    prompt?: string,
    forceLockManual?: boolean,
  ): Promise<boolean> {
    const ok = await aiPipeline.runIterativeRefinement(prompt, forceLockManual);
    if (ok) {
      workspaceUi.triggerWebglRender();
    }
    return ok;
  }

  return {
    get previewHoverProfileId() {
      return previewHoverProfileId;
    },
    set previewHoverProfileId(value: string | null) {
      previewHoverProfileId = value;
    },
    get hasAiBaseline() {
      return hasAiBaseline;
    },
    get isModifiedFromAi() {
      return isModifiedFromAi;
    },
    trackAndSync,
    resetCropState,
    syncCropToActivePhoto,
    syncActivePhotoTuning,
    applyProfile,
    applyProfileToAll,
    resetToAsShot,
    restoreAiTuning,
    resetTuningParams,
    runIterativeAiRefinement,
  };
}

export const darkroomSync = createDarkroomSyncState();
