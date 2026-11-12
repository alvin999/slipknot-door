<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { type CameraMountInfo } from "$lib/services/ingestionService";
  import { KeyVaultService } from "$lib/services/keyVaultService";
  import KeyVaultModal from "$lib/components/KeyVaultModal.svelte";
  import HelpGuideModal from "$lib/components/HelpGuideModal.svelte";
  import QuickExportModal from "$lib/components/QuickExportModal.svelte";
  import KeyPromptModal from "$lib/components/KeyPromptModal.svelte";
  import TopNav from "$lib/components/navigation/TopNav.svelte";
  import MobileDrawerHandle from "$lib/components/navigation/MobileDrawerHandle.svelte";
  import MobileRetouchBar from "$lib/components/navigation/MobileRetouchBar.svelte";
  import MobileBottomNav from "$lib/components/navigation/MobileBottomNav.svelte";
  import PickedPreviewsRack from "$lib/components/catalog/PickedPreviewsRack.svelte";
  import { toastStore } from "$lib/stores/toastStore.svelte";
  import CatalogView from "$lib/components/views/CatalogView.svelte";
  import RetouchView from "$lib/components/views/RetouchView.svelte";
  import AiAssistPanel from "$lib/components/retouch/AiAssistPanel.svelte";
  import TuningPanel from "$lib/components/retouch/TuningPanel.svelte";
  import ProfilesView from "$lib/components/views/ProfilesView.svelte";
  import ExportView from "$lib/components/views/ExportView.svelte";
  import DevicesView from "$lib/components/views/DevicesView.svelte";
  import { photoLibrary } from "$lib/stores/photoLibrary.svelte";
  import { darkroomState } from "$lib/stores/darkroomState.svelte";
  import { aiPipeline } from "$lib/stores/aiPipeline.svelte";
  import { lutCatalog } from "$lib/stores/lutCatalog.svelte";
  import {
    exportState,
    type BatchExportOptions,
  } from "$lib/stores/exportState.svelte";
  import { thumbnailRenderService } from "$lib/services/thumbnailRenderService.svelte";
  import { type CustomLutRecord } from "$lib/services/customLutService";
  import { type ExportFormat } from "$lib/services/exportService";
  import { SessionService } from "$lib/services/sessionService";
  import {
    HSL_BAND_KEYS,
    cloneHslAdjustments,
    type AiScopePreferences,
  } from "$lib/types/photo";

  // Active module tabs
  type ModuleTab = "catalog" | "retouch" | "profiles" | "export" | "devices";
  let activeTab = $state<ModuleTab>("catalog"); // Default to catalog on fresh load for curatorial overview
  let retouchViewRef = $state<any>(null);

  // Mobile Bottom Drawer State (行動端抽屜狀態)
  type MobileDrawer = "none" | "ai" | "tuning";
  let activeMobileDrawer = $state<MobileDrawer>("none");
  let isMobileDrawerExpanded = $state<boolean>(false);

  // Key Vault & Help Modal State
  let isVaultOpen = $state<boolean>(false);
  let isHelpOpen = $state<boolean>(false);
  let isQuickExportOpen = $state<boolean>(false);
  let isKeyPromptModalOpen = $state<boolean>(false);
  let geminiKeyStatus = $state<{ exists: boolean; mode: string | null }>({
    exists: false,
    mode: null,
  });
  let groqKeyStatus = $state<{ exists: boolean; mode: string | null }>({
    exists: false,
    mode: null,
  });
  let hasKey = $state<boolean>(false);

  // Hardware & Photo Library State (由 photoLibrary Store 統一管理)
  type PhotoPlate = import("$lib/stores/photoLibrary.svelte").PhotoPlateItem;
  const photoPlates = $derived(photoLibrary.photoPlates);
  const activePhoto = $derived(photoLibrary.activePhoto);
  const isLoadingPhotos = $derived(photoLibrary.isLoadingPhotos);
  const currentDirectoryName = $derived(photoLibrary.currentDirectoryName);
  const cameraMounts = $derived(photoLibrary.cameraMounts);
  const isScanningMounts = $derived(photoLibrary.isScanningMounts);
  const latestExtractionMs = $derived(photoLibrary.latestExtractionMs);

  onMount(() => {
    refreshCameraMounts();
    refreshKeyStatus();

    photoLibrary.onCatalogLoaded = () => {
      activeTab = "catalog";
    };

    photoLibrary.onPhotoSelected = (plate) => {
      aiPipeline.loadFromPhoto(plate);
    };

    aiPipeline.onRequireApiKey = () => {
      isKeyPromptModalOpen = true;
    };

    aiPipeline.onNotice = (message) => {
      exportState.showNotice(message, 2500);
    };

    aiPipeline.onTriggerRender = () => {
      triggerWebglRender();
    };

    // 註冊離屏縮圖渲染完成後的狀態同步回呼
    thumbnailRenderService.onThumbnailRendered = (photoId, dataUrl) => {
      photoLibrary.photoPlates = photoLibrary.photoPlates.map((p) =>
        p.id === photoId ? { ...p, gradedThumbnail: dataUrl } : p,
      );
      if (
        photoLibrary.activePhoto &&
        photoLibrary.activePhoto.id === photoId &&
        photoLibrary.activePhoto.gradedThumbnail !== dataUrl
      ) {
        photoLibrary.activePhoto.gradedThumbnail = dataUrl;
      }
    };

    // 載入使用者自訂 3D LUT 並同步至 WebGL 著色器
    lutCatalog.loadCustomLuts().then(() => {
      thumbnailRenderService.syncCustomLuts();
    });

    // 背景熱插拔偵測：每 4 秒檢查一次外接相機與儲存裝置連線狀態
    const mountPollTimer = setInterval(() => {
      refreshCameraMounts();
    }, 4000);

    const handleFocus = () => {
      refreshCameraMounts();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(mountPollTimer);
      window.removeEventListener("focus", handleFocus);
    };
  });

  function refreshKeyStatus() {
    const sGemini = KeyVaultService.getKeyStatus("gemini");
    const sGroq = KeyVaultService.getKeyStatus("groq");
    hasKey = hasActiveApiKey();
    aiPipeline.reloadEngineSettings();
    geminiKeyStatus = {
      exists: hasKey,
      mode: aiPipeline.visionProvider === "ollama" ? "transparent" : sGemini.mode || sGroq.mode,
    };
    groqKeyStatus = { exists: sGroq.exists, mode: sGroq.mode };
  }

  function hasActiveApiKey(): boolean {
    return KeyVaultService.hasAnyConfiguredProvider(aiPipeline.visionProvider);
  }

  async function refreshCameraMounts() {
    await photoLibrary.refreshCameraMounts();
  }

  // 專業暗房光影與色彩參數由 darkroomState 作為單一真相來源
  type DiffMode = "off" | "split" | "sideBySide";

  function isDiffModeActive(mode: DiffMode): boolean {
    return darkroomState.isDiffModeActive(mode);
  }

  // AI 職責範圍偏好矩陣與推論狀態（由 aiPipeline Store 統一管理）
  const aiScope = $derived(aiPipeline.aiScope);
  const isAiScopeOpen = $derived(aiPipeline.isAiScopeOpen);
  const isAiAnalyzing = $derived(aiPipeline.isAiAnalyzing);
  const isBatchAiRunning = $derived(aiPipeline.isBatchAiRunning);
  const batchProgress = $derived(aiPipeline.batchProgress);
  const aiSuggestedScene = $derived(aiPipeline.aiSuggestedScene);
  const aiSceneTitle = $derived(aiPipeline.aiSceneTitle);
  const aiStyleInsight = $derived(aiPipeline.aiStyleInsight);
  const aiRecommendedMood = $derived(aiPipeline.aiRecommendedMood);
  const aiRecommendedProfile = $derived(aiPipeline.aiRecommendedProfile);
  const aiTerminalLogs = $derived(aiPipeline.aiTerminalLogs);
  const copiedLogNotice = $derived(aiPipeline.copiedLogNotice);
  const aiVisionTags = $derived(aiPipeline.aiVisionTags);

  function toggleAiScope(key: keyof AiScopePreferences) {
    aiPipeline.toggleAiScope(key);
  }

  function resetCropState() {
    darkroomState.resetCropState();
    syncCropToActivePhoto();
  }

  function syncCropToActivePhoto() {
    if (!activePhoto) return;
    const targetCrop = darkroomState.buildCropSnapshot();

    if (JSON.stringify(activePhoto.crop) === JSON.stringify(targetCrop)) {
      return;
    }

    activePhoto.crop = targetCrop;
    photoLibrary.photoPlates = photoLibrary.photoPlates.map((p) =>
      p.id === activePhoto!.id
        ? {
            ...p,
            crop: activePhoto!.crop,
          }
        : p,
    );
  }

  // AI 風格調色預覽狀態
  let previewHoverProfileId = $state<string | null>(null);

  // 3D LUT 典藏與自訂 LUT 清單（由 lutCatalog Store 統一管理）
  const profiles = lutCatalog.builtinProfiles;
  const userCustomLuts = $derived(lutCatalog.userCustomLuts);
  const allProfiles = $derived(lutCatalog.allProfiles);
  const allStyleGradingPresets = $derived(lutCatalog.allStyleGradingPresets);
  const stylePreviewThumbs = $derived(
    thumbnailRenderService.stylePreviewThumbs,
  );

  async function handleImportCustomLut(lut: CustomLutRecord) {
    await lutCatalog.importCustomLut(lut);
    thumbnailRenderService.syncCustomLuts();
    if (activePhoto?.thumbnail) {
      thumbnailRenderService.updateStylePreviewsForThumbnail(
        activePhoto.thumbnail,
        true,
      );
    }
  }

  async function handleDeleteCustomLut(id: string) {
    await lutCatalog.deleteCustomLut(id);
  }

  async function handleUpdateCustomLut(lut: CustomLutRecord) {
    await lutCatalog.updateCustomLut(lut);
    thumbnailRenderService.syncCustomLuts();
    if (activePhoto?.thumbnail) {
      thumbnailRenderService.updateStylePreviewsForThumbnail(
        activePhoto.thumbnail,
        true,
      );
    }
  }

  // Curatorial Queue: 若有標記挑圖 (flagged)，精修與匯出僅聚焦選取的相片；若無選取則全部顯示
  const activeQueue = $derived(photoLibrary.activeQueue);
  const flaggedCount = $derived(photoLibrary.flaggedCount);
  const flaggedPhotos = $derived(photoLibrary.flaggedPhotos);

  function togglePhotoFlag(photo: PhotoPlate, event?: MouseEvent) {
    photoLibrary.togglePhotoFlag(photo, event);
  }

  function clearAllFlags() {
    photoLibrary.clearAllFlags();
  }

  function handleFlagToggled() {
    photoLibrary.handleFlagToggled();
  }

  function selectPhoto(plate: PhotoPlate) {
    photoLibrary.selectPhoto(plate);
  }

  // 自動持久化相卷工作區進度至本機快取 (Session Auto-Persistence)
  $effect(() => {
    if (currentDirectoryName && photoPlates.length > 0) {
      SessionService.debouncedSaveSession(currentDirectoryName, photoPlates);
    }
  });

  // 保持 darkroomState 變更同步持久化到 activePhoto.tuning 與 activePhoto.crop
  $effect(() => {
    // 響應式追蹤 darkroomState 數值
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

    if (!isBatchAiRunning) {
      untrack(() => {
        syncActivePhotoTuning();
        syncCropToActivePhoto();
      });
    }
  });

  function openRetouchForPhoto(plate: PhotoPlate) {
    selectPhoto(plate);
    activeTab = "retouch";
    requestAnimationFrame(() => {
      triggerWebglRender();
    });
  }

  // 步驟二：前往批次導出頁面
  // 步驟一：一鍵進入精修頁面 (優先以當前焦點或選取相片作為首幀)
  function goToRetouch() {
    const target =
      activePhoto && activeQueue.some((p) => p.id === activePhoto?.id)
        ? activePhoto
        : activeQueue.length > 0
          ? activeQueue[0]
          : activePhoto;
    if (target) {
      selectPhoto(target);
    }
    activeTab = "retouch";
    requestAnimationFrame(() => {
      triggerWebglRender();
    });
  }

  function goToExport() {
    activeTab = "export";
  }

  // 返回膠卷目錄挑圖
  function goToCatalog() {
    activeTab = "catalog";
  }

  // 在精修佇列中循環切換上一張/下一張相片
  function selectAdjacentPhoto(delta: number) {
    photoLibrary.selectAdjacentPhoto(delta);
  }

  // 全域工作流程導航與精修鍵盤操作 (方案 A 流水線)
  function handleRetouchKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }

    // 全域叫出或關閉說明指南 (? 鍵)
    if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
      e.preventDefault();
      isHelpOpen = !isHelpOpen;
      return;
    }

    // 若說明、金庫或即時出圖視窗開啟，Esc 優先關閉浮層
    if (e.key === "Escape") {
      if (isQuickExportOpen) {
        e.preventDefault();
        isQuickExportOpen = false;
        return;
      }
      if (isHelpOpen) {
        e.preventDefault();
        isHelpOpen = false;
        return;
      }
      if (isVaultOpen) {
        e.preventDefault();
        isVaultOpen = false;
        return;
      }
    }

    if (activeTab === "retouch") {
      // 支援 Cmd/Ctrl + E 叫出單張即時出圖視窗
      if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        isQuickExportOpen = true;
        return;
      }

      // 支援 Ctrl/Cmd + Shift + C 複製調色
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === "c" || e.key === "C")
      ) {
        e.preventDefault();
        if (activePhoto) {
          darkroomState.copyCurrentTuning(activePhoto.appliedProfile);
          toastStore.show("已複製調色參數 (Ctrl+Shift+C) ✓", "success", 2000);
        }
        return;
      }

      // 支援 Ctrl/Cmd + Shift + V 貼上調色
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === "v" || e.key === "V")
      ) {
        e.preventDefault();
        const pasted = darkroomState.pasteCopiedTuning();
        if (pasted) {
          applyProfile(pasted.appliedProfile);
          toastStore.show(
            "已套用貼上調色參數 (Ctrl+Shift+V) ✓",
            "success",
            2000,
          );
        }
        return;
      }

      // 支援 P / F 鍵切換挑圖標記 (Pick / Flag)
      if (e.key === "p" || e.key === "P" || e.key === "f" || e.key === "F") {
        if (activePhoto) {
          e.preventDefault();
          togglePhotoFlag(activePhoto);
          toastStore.show(
            activePhoto.flagged ? "已標記為挑選底片 ★" : "已取消挑選標記",
            "info",
            1500,
          );
          return;
        }
      }

      // 支援 Shift + Delete / Shift + Backspace 鍵實體刪除磁碟底片檔案（移至資源回收筒 / 廢紙簍）
      if (e.shiftKey && (e.key === "Delete" || e.key === "Backspace")) {
        if (activePhoto) {
          e.preventDefault();
          handleDeletePhotoFromDisk(activePhoto);
          return;
        }
      }

      // 支援 Delete / Backspace 鍵從相卷排除相片 (Remove / Cull)
      if (e.key === "Delete" || e.key === "Backspace") {
        if (activePhoto) {
          e.preventDefault();
          handleRemovePhoto(activePhoto.id);
          return;
        }
      }

      if (e.key === "h" || e.key === "ArrowLeft") {
        e.preventDefault();
        selectAdjacentPhoto(-1);
      } else if (e.key === "l" || e.key === "ArrowRight") {
        e.preventDefault();
        selectAdjacentPhoto(1);
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        // 方案 1：按住 Space 顯示原始本相（避免按鍵長按自動重複 repeat 重複觸發）
        if (!e.repeat) {
          darkroomState.showABComparison = true;
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        goToExport();
      } else if (e.key === "Escape") {
        e.preventDefault();
        goToCatalog();
      }
    } else if (activeTab === "export") {
      // 方案 A 流水線 Step 3：按 Enter 直接觸發批次出圖，按 Esc 返回暗房精修
      if (e.key === "Enter") {
        e.preventDefault();
        if (!isExporting) {
          triggerExport();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        goToRetouch();
      }
    }
  }

  function handleRetouchKeyup(e: KeyboardEvent) {
    // 放開 Space 鍵時瞬間恢復調色本態
    if (e.key === " " || e.code === "Space") {
      if (darkroomState.showABComparison) {
        e.preventDefault();
        darkroomState.showABComparison = false;
      }
    }
  }

  function handleWindowBlur() {
    // 視窗失去焦點時安全復原比對狀態，避免放開事件遺失而卡在原圖
    darkroomState.showABComparison = false;
  }

  function applyProfile(profileId: string) {
    if (!activePhoto) return;
    activePhoto.appliedProfile = profileId;
    photoLibrary.photoPlates = photoLibrary.photoPlates.map((p) =>
      p.id === activePhoto!.id ? { ...p, appliedProfile: profileId } : p,
    );
    darkroomState.applyProfileDefaults(profileId);
    triggerWebglRender();
    enqueueThumbnailRender(activePhoto);
  }

  function applyProfileToAll(profileId: string) {
    photoLibrary.photoPlates.forEach((p) => {
      p.appliedProfile = profileId;
      enqueueThumbnailRender(p);
    });
    if (activePhoto) {
      applyProfile(profileId);
    }
  }

  function enqueueThumbnailRender(plate: PhotoPlate) {
    thumbnailRenderService.enqueueThumbnailRender(plate);
  }

  $effect(() => {
    thumbnailRenderService.updateStylePreviewsForThumbnail(
      activePhoto?.thumbnail,
    );
  });

  /**
   * 一鍵還原為相機原生拍攝參數（As Shot WB & Exposure）
   */
  function resetToAsShot() {
    if (!activePhoto) return;
    darkroomState.resetToAsShot(activePhoto as any);
    triggerWebglRender();
  }

  /**
   * 同步當前滑桿調色狀態至 activePhoto 與 photoPlates
   * 若所有滑桿為預設值且為標準風格，則判定為未調色 (tuning = undefined)
   * 包含 dirty check 保護，避免數值無變化時重複重建陣列造成反應式無窮迴圈
   */
  function syncActivePhotoTuning() {
    if (!activePhoto) return;

    const targetTuning = darkroomState.buildTuningSnapshot(activePhoto as any);
    const currentPlate = photoPlates.find((p) => p.id === activePhoto!.id);
    const hslMatches =
      !!currentPlate?.tuning &&
      !!targetTuning &&
      HSL_BAND_KEYS.every((k) => {
        const a = currentPlate.tuning!.hsl?.[k];
        const b = targetTuning.hsl?.[k];
        return (
          Math.abs((a?.hue ?? 0) - (b?.hue ?? 0)) < 0.001 &&
          Math.abs((a?.sat ?? 0) - (b?.sat ?? 0)) < 0.001 &&
          Math.abs((a?.lum ?? 0) - (b?.lum ?? 0)) < 0.001
        );
      });
    const tuningMatches =
      (!currentPlate?.tuning && !targetTuning) ||
      (hslMatches &&
        !!currentPlate?.tuning &&
        !!targetTuning &&
        Math.abs(currentPlate.tuning.exposure - targetTuning.exposure) <
          0.001 &&
        Math.abs(
          (currentPlate.tuning.highlights ?? 0) -
            (targetTuning.highlights ?? 0),
        ) < 0.001 &&
        Math.abs(currentPlate.tuning.contrast - targetTuning.contrast) <
          0.001 &&
        Math.abs(
          (currentPlate.tuning.shadows ?? 0) - (targetTuning.shadows ?? 0),
        ) < 0.001 &&
        Math.abs(
          (currentPlate.tuning.blacks ?? 0) - (targetTuning.blacks ?? 0),
        ) < 0.001 &&
        Math.abs(currentPlate.tuning.lutIntensity - targetTuning.lutIntensity) <
          0.001 &&
        Math.abs(currentPlate.tuning.colorTemp - targetTuning.colorTemp) < 1 &&
        Math.abs(currentPlate.tuning.tint - targetTuning.tint) < 0.001 &&
        Math.abs(
          (currentPlate.tuning.vibrance ?? 0) - (targetTuning.vibrance ?? 0),
        ) < 0.001 &&
        Math.abs(
          (currentPlate.tuning.clarity ?? 0) - (targetTuning.clarity ?? 0),
        ) < 0.001 &&
        Math.abs(
          (currentPlate.tuning.sharpness ?? 0) - (targetTuning.sharpness ?? 0),
        ) < 0.001 &&
        Math.abs(
          (currentPlate.tuning.colorDensity ?? 0) -
            (targetTuning.colorDensity ?? 0),
        ) < 0.001 &&
        Math.abs(
          (currentPlate.tuning.shadowHue ?? 200) -
            (targetTuning.shadowHue ?? 200),
        ) < 0.5 &&
        Math.abs(
          (currentPlate.tuning.shadowTintAmount ?? 0) -
            (targetTuning.shadowTintAmount ?? 0),
        ) < 0.001 &&
        Math.abs(
          (currentPlate.tuning.highlightHue ?? 40) -
            (targetTuning.highlightHue ?? 40),
        ) < 0.5 &&
        Math.abs(
          (currentPlate.tuning.highlightTintAmount ?? 0) -
            (targetTuning.highlightTintAmount ?? 0),
        ) < 0.001 &&
        Math.abs(
          (currentPlate.tuning.halation ?? 0) - (targetTuning.halation ?? 0),
        ) < 0.001 &&
        Math.abs(
          (currentPlate.tuning.grainAmount ?? 0.15) -
            (targetTuning.grainAmount ?? 0.15),
        ) < 0.001 &&
        Math.abs(
          (currentPlate.tuning.vignette ?? 0) - (targetTuning.vignette ?? 0),
        ) < 0.001 &&
        (currentPlate.tuning.monochrome ?? false) ===
          (targetTuning.monochrome ?? false));

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
      p.id === activePhoto!.id
        ? {
            ...p,
            tuning: targetTuning,
            crop: activePhoto!.crop,
            appliedProfile: activePhoto!.appliedProfile,
            aiDecision: activePhoto!.aiDecision,
            sceneTag: activePhoto!.sceneTag,
          }
        : p,
    );
  }

  // 判定目前焦點相片是否有 AI 基準可還原
  const hasAiBaseline = $derived(!!activePhoto?.aiTuningSnapshot);

  // 判定目前調色是否相較於 AI 基準已被使用者手動更動過
  const isModifiedFromAi = $derived.by(() =>
    darkroomState.isModifiedFromAi(activePhoto as any),
  );

  /**
   * 一鍵恢復為 AI 顯影基準參數 (Restore AI Tuning Baseline)
   * 當使用者在 AI 顯影後進行微調，但想要還原回 AI 最初調好狀態時呼叫
   */
  function restoreAiTuning() {
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

    triggerWebglRender();
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

    if (activePhoto) {
      activePhoto.appliedProfile = "Profile_00_StandardNatural";
      activePhoto.tuning = undefined;
      activePhoto.crop = undefined;
      activePhoto.gradedThumbnail = undefined;
      activePhoto.aiDecision = undefined;
      activePhoto.aiTuningSnapshot = undefined;
      activePhoto.sceneTag = "本機相簿幀";
      photoLibrary.photoPlates = photoLibrary.photoPlates.map((p) =>
        p.id === activePhoto!.id
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
    triggerWebglRender();
  }

  /**
   * 觸發暗房 WebGL 畫布重繪（委託 RetouchView 內部視圖）
   */
  function triggerWebglRender() {
    retouchViewRef?.triggerRender();
  }

  function setDiffMode(mode: DiffMode) {
    darkroomState.setDiffMode(mode);
    requestAnimationFrame(() => {
      triggerWebglRender();
    });
  }

  async function handleDeletePhotoFromDisk(photo: PhotoPlate) {
    await photoLibrary.handleDeletePhotoFromDisk(photo);
  }

  async function handleBatchDeletePhotosFromDisk(photos: PhotoPlate[]) {
    await photoLibrary.handleBatchDeletePhotosFromDisk(photos);
  }

  function handleRemovePhoto(photoId: string) {
    photoLibrary.handleRemovePhoto(photoId);
  }

  function handleBatchRemovePhotos(photoIds: string[]) {
    photoLibrary.handleBatchRemovePhotos(photoIds);
  }

  async function handlePickDirectory() {
    await photoLibrary.handlePickDirectory();
  }

  async function handleAppendDirectory() {
    await photoLibrary.handleAppendDirectory();
  }

  async function handleAppendFiles() {
    await photoLibrary.handleAppendFiles();
  }

  async function handleLoadDirectoryByPath(path: string) {
    await photoLibrary.handleLoadDirectoryByPath(path);
  }

  async function handleFilesDropped(dataTransfer: DataTransfer) {
    await photoLibrary.handleFilesDropped(dataTransfer);
  }

  async function handleLoadCameraMount(mount: CameraMountInfo) {
    await photoLibrary.handleLoadCameraMount(mount);
  }

  async function handleSelectMountOrDirectory() {
    await photoLibrary.handleSelectMountOrDirectory();
  }

  // AI 管線操作委派至 aiPipeline Store
  async function copyTerminalLogs() {
    await aiPipeline.copyTerminalLogs();
  }

  async function runAiAnalysis(targetPhoto?: PhotoPlate): Promise<boolean> {
    return aiPipeline.runAiAnalysis(targetPhoto);
  }

  async function quickAiCrop() {
    await aiPipeline.quickAiCrop();
  }

  async function quickAiHorizon() {
    await aiPipeline.quickAiHorizon();
  }

  async function quickAiWhiteBalance() {
    await aiPipeline.quickAiWhiteBalance();
  }

  async function quickAiTone() {
    await aiPipeline.quickAiTone();
  }

  async function quickAiProfile() {
    await aiPipeline.quickAiProfile();
  }

  function requestBatchAiAnalysis() {
    aiPipeline.requestBatchAiAnalysis();
  }

  function openVaultFromPrompt() {
    isKeyPromptModalOpen = false;
    isVaultOpen = true;
  }

  function cancelBatchAi() {
    aiPipeline.cancelBatchAi();
  }

  // Export Pipeline State (由 exportState Store 統一管理)
  const exportMode = $derived(exportState.exportMode);
  const exportProgress = $derived(exportState.exportProgress);
  const isExporting = $derived(exportState.isExporting);
  const exportNotice = $derived(exportState.exportNotice);

  async function handleSingleQuickExport(
    quickOptions:
      | "modeA"
      | "modeB"
      | {
          mode: "modeA" | "modeB";
          format: ExportFormat;
          quality: number;
          maxLongEdge: number | null;
        },
  ) {
    await exportState.handleSingleQuickExport(quickOptions);
  }

  async function triggerExport(
    subset?: PhotoPlate[],
    options?: BatchExportOptions,
  ) {
    await exportState.triggerExport(subset, options);
  }
</script>

<svelte:window
  onkeydown={handleRetouchKeydown}
  onkeyup={handleRetouchKeyup}
  onblur={handleWindowBlur}
/>

<div
  class="workspace-container"
  class:mobile-retouch-split={activeTab === "retouch" &&
    activeMobileDrawer !== "none"}
  class:mobile-drawer-expanded={activeTab === "retouch" &&
    activeMobileDrawer !== "none" &&
    isMobileDrawerExpanded}
>
  <!-- 去識別化 3D 膠卷風格濾鏡著色矩陣定義 (De-identified Film Emulation Matrices) -->
  <svg
    style="position: absolute; width: 0; height: 0; pointer-events: none; opacity: 0;"
    aria-hidden="true"
  >
    <defs>
      <!-- 1. 啞光微膠卷 (FILM_LOOK_01): 低黑階抬升、低飽和沉穩綠、柔和高反差 -->
      <filter id="filter-matte-shadow" color-interpolation-filters="sRGB">
        <feColorMatrix
          type="matrix"
          values="
          0.98  0.03  0.00  0  0.03
          0.02  0.96  0.02  0  0.03
          0.01  0.02  0.94  0  0.04
          0.00  0.00  0.00  1  0.00
        "
        />
        <feComponentTransfer>
          <feFuncR type="linear" slope="0.92" intercept="0.04" />
          <feFuncG type="linear" slope="0.92" intercept="0.04" />
          <feFuncB type="linear" slope="0.90" intercept="0.05" />
        </feComponentTransfer>
      </filter>

      <!-- 2. 冷青翡翠 (COLOR_GRADE_02): 陰影青綠冷調、高光暖金微溫、膠卷膚色隔離保護 -->
      <filter id="filter-teal-emerald" color-interpolation-filters="sRGB">
        <feColorMatrix
          type="matrix"
          values="
          0.88  0.08  0.00  0  -0.01
          0.02  1.04  0.04  0   0.02
          0.04  0.10  1.16  0   0.05
          0.00  0.00  0.00  1   0.00
        "
        />
        <feComponentTransfer>
          <feFuncR type="linear" slope="0.95" intercept="0.01" />
          <feFuncG type="linear" slope="1.00" intercept="0.02" />
          <feFuncB type="linear" slope="1.05" intercept="0.04" />
        </feComponentTransfer>
      </filter>

      <!-- 3. 溫潤人像 (PORTRAIT_03): 鎢絲燈光感暖調、洋紅微相移、高光柔和滾降 -->
      <filter id="filter-tungsten-soft" color-interpolation-filters="sRGB">
        <feColorMatrix
          type="matrix"
          values="
          1.14  0.02  0.00  0   0.03
          0.02  1.02  0.02  0   0.01
          0.00  0.02  0.86  0  -0.02
          0.00  0.00  0.00  1   0.00
        "
        />
      </filter>

      <!-- 4. 高反差單色 (MONO_SILVER_04): 經典紅橙濾鏡感黑白、暗部深邃銀鹽紀實 -->
      <filter id="filter-high-contrast-mono" color-interpolation-filters="sRGB">
        <feColorMatrix
          type="matrix"
          values="
          0.48  0.42  0.10  0  0
          0.48  0.42  0.10  0  0
          0.48  0.42  0.10  0  0
          0.00  0.00  0.00  1  0
        "
        />
        <feComponentTransfer>
          <feFuncR type="gamma" amplitude="1" exponent="1.25" offset="-0.02" />
          <feFuncG type="gamma" amplitude="1" exponent="1.25" offset="-0.02" />
          <feFuncB type="gamma" amplitude="1" exponent="1.25" offset="-0.02" />
        </feComponentTransfer>
      </filter>
    </defs>
  </svg>

  <!-- TOP HEADER / TELEMETRY STATUS BAR -->
  <TopNav
    {activeTab}
    {cameraMounts}
    {isScanningMounts}
    {latestExtractionMs}
    {flaggedCount}
    totalPhotos={photoPlates.length}
    activeQueueLength={activeQueue.length}
    {exportMode}
    {isExporting}
    {currentDirectoryName}
    onSelectMount={handleSelectMountOrDirectory}
    onPickDirectory={handlePickDirectory}
    onAppendDirectory={handleAppendDirectory}
    onAppendFiles={handleAppendFiles}
    onSelectRecentDirectory={(path) => handleLoadDirectoryByPath(path)}
    onLoadCameraMount={(mount) => handleLoadCameraMount(mount)}
    onGoToCatalog={goToCatalog}
    onGoToRetouch={goToRetouch}
    onGoToExport={goToExport}
    onGoToProfiles={() => (activeTab = "profiles")}
    onGoToDevices={() => (activeTab = "devices")}
    onOpenQuickExport={() => (isQuickExportOpen = true)}
    onTriggerExport={() => triggerExport()}
    onOpenHelp={() => (isHelpOpen = true)}
  />

  <!-- MAIN CURATORIAL WORKSPACE -->
  <main class="main-body">
    <!-- LEFT SIDEBAR: AI ASSISTANT PANEL (僅在暗房精修專屬呈現，其他頁面全幅展開) -->
    {#if activeTab === "retouch"}
      <aside
        class="left-sidebar hairline-r"
        class:drawer-open={activeMobileDrawer === "ai"}
      >
        <MobileDrawerHandle
          variant="split"
          {activeMobileDrawer}
          isExpanded={isMobileDrawerExpanded}
          onSelectDrawer={(drawer) => (activeMobileDrawer = drawer)}
          onToggleExpand={() =>
            (isMobileDrawerExpanded = !isMobileDrawerExpanded)}
          onClose={() => {
            activeMobileDrawer = "none";
            isMobileDrawerExpanded = false;
          }}
        />

        <!-- AI Scene Assistant (100% 垂直高度專屬呈現，免去冗長捲動) -->
        <AiAssistPanel
          styleGradingPresets={allStyleGradingPresets}
          {stylePreviewThumbs}
          {geminiKeyStatus}
          {activePhoto}
          photos={photoPlates}
          {hasAiBaseline}
          {isModifiedFromAi}
          onRestoreAiTuning={restoreAiTuning}
          {isAiAnalyzing}
          {isBatchAiRunning}
          {batchProgress}
          {aiTerminalLogs}
          {aiSceneTitle}
          {aiSuggestedScene}
          {aiRecommendedMood}
          {aiStyleInsight}
          aiCropRationale={darkroomState.aiCropRationale}
          {aiVisionTags}
          {aiScope}
          {isAiScopeOpen}
          {copiedLogNotice}
          onToggleAiScope={toggleAiScope}
          onToggleIsAiScopeOpen={() => {
            aiPipeline.toggleAiScopeOpen();
          }}
          onCopyTerminalLogs={copyTerminalLogs}
          onRunAiAnalysis={() => runAiAnalysis()}
          onRequestBatchAi={requestBatchAiAnalysis}
          onCancelBatchAi={cancelBatchAi}
          onOpenVault={() => (isVaultOpen = true)}
          onHoverProfile={(profileId) => {
            previewHoverProfileId = profileId;
            retouchViewRef?.triggerRender();
          }}
          onApplyProfile={(id) => applyProfile(id)}
        />
      </aside>
    {/if}

    <!-- CENTER STAGE: PHOTOGRAPHIC PLATE VIEWPORT -->
    <section class="center-stage">
      {#if activeTab === "catalog"}
        <!-- MODULE 1: CATALOG MATRIX (Phase 3 Virtual Grid) -->
        <CatalogView
          photos={photoPlates}
          {activePhoto}
          {isLoadingPhotos}
          hasApiKey={hasKey}
          onOpenVault={() => (isVaultOpen = true)}
          onSelectPhoto={(p) => selectPhoto(p)}
          onOpenRetouch={(p) => openRetouchForPhoto(p)}
          onGoToRetouch={goToRetouch}
          onPickDirectory={handlePickDirectory}
          onAppendDirectory={handleAppendDirectory}
          onAppendFiles={handleAppendFiles}
          onRemovePhoto={(p) => handleRemovePhoto(p.id)}
          onBatchRemovePhotos={(ids) => handleBatchRemovePhotos(ids)}
          onDeletePhotoFromDisk={(p) => handleDeletePhotoFromDisk(p)}
          onBatchDeletePhotosFromDisk={(photos) =>
            handleBatchDeletePhotosFromDisk(photos)}
          onRefreshMounts={refreshCameraMounts}
          onToggleFlag={handleFlagToggled}
          onFilesDropped={handleFilesDropped}
          {cameraMounts}
          onLoadCameraMount={(m) => handleLoadCameraMount(m)}
        />
      {:else if activeTab === "retouch"}
        <!-- MODULE 2: RETOUCH DARKROOM WORKBENCH -->
        <RetouchView
          bind:this={retouchViewRef}
          {activePhoto}
          photos={photoPlates}
          {activeQueue}
          {exportNotice}
          showABComparison={darkroomState.showABComparison}
          {previewHoverProfileId}
          hasApiKey={hasKey}
          {isAiAnalyzing}
          {isBatchAiRunning}
          {batchProgress}
          {aiSceneTitle}
          {aiTerminalLogs}
          {hasAiBaseline}
          {isModifiedFromAi}
          isMobileDrawerOpen={activeMobileDrawer !== "none"}
          onRestoreAiTuning={restoreAiTuning}
          onOpenAiDrawer={() => (activeMobileDrawer = "ai")}
          onOpenVault={() => (isVaultOpen = true)}
          onSelectPhoto={(p) => selectPhoto(p as any)}
          onOpenQuickExport={() => (isQuickExportOpen = true)}
          onGoToCatalog={goToCatalog}
          onPickDirectory={handlePickDirectory}
          onRefreshMounts={refreshCameraMounts}
          onResetCropState={resetCropState}
          onSyncCropToActivePhoto={syncCropToActivePhoto}
        />
      {:else if activeTab === "profiles"}
        <!-- MODULE 3: 3D LUT PROFILES VAULT -->
        <ProfilesView
          profiles={allProfiles}
          activeProfileId={activePhoto
            ? activePhoto.appliedProfile
            : "Profile_01_Fieldnote"}
          activePhotoTitle={activePhoto ? activePhoto.filename : "尚未選取相片"}
          onApplyProfile={(id) => applyProfile(id)}
          onApplyToAll={(id) => applyProfileToAll(id)}
          onImportCustomLut={handleImportCustomLut}
          onUpdateCustomLut={handleUpdateCustomLut}
          onDeleteCustomLut={handleDeleteCustomLut}
          onGoToRetouch={goToRetouch}
          onGoToCatalog={goToCatalog}
        />
      {:else if activeTab === "export"}
        <!-- MODULE 4: DUAL PIPELINE EXPORT DOCK (BOUND TO PHOTO PLATES WITH SCOPE SELECTOR) -->
        <ExportView
          photos={photoPlates}
          {activePhoto}
          {exportMode}
          {isExporting}
          {exportProgress}
          {exportNotice}
          {aiVisionTags}
          {aiSceneTitle}
          onSetExportMode={(m: "modeA" | "modeB") =>
            (exportState.exportMode = m)}
          onTriggerExport={(subset, options) =>
            triggerExport(subset as PhotoPlate[], options)}
          onGoToRetouch={goToRetouch}
          onGoToCatalog={goToCatalog}
        />
      {:else if activeTab === "devices"}
        <!-- MODULE 5: HARDWARE MOUNTS & STORAGE SETTINGS -->
        <DevicesView
          {cameraMounts}
          {isScanningMounts}
          {geminiKeyStatus}
          {groqKeyStatus}
          onRefreshMounts={refreshCameraMounts}
          onOpenVault={() => (isVaultOpen = true)}
          onLoadMount={(m: CameraMountInfo) => handleLoadCameraMount(m)}
          onPickDirectory={handlePickDirectory}
          onGoToCatalog={goToCatalog}
          onGoToRetouch={goToRetouch}
        />
      {/if}
    </section>

    {#if activeTab === "retouch" || (activeTab === "catalog" && flaggedCount > 0)}
      <!-- RIGHT SIDEBAR: RETOUCH COLOR DOCK OR CATALOG SELECTION RACK (僅在精修或有挑圖時滑出) -->
      <aside
        class="right-telemetry hairline-l"
        class:drawer-open={activeMobileDrawer === "tuning"}
      >
        <MobileDrawerHandle
          variant={activeTab === "retouch" ? "split" : "drag"}
          {activeMobileDrawer}
          isExpanded={isMobileDrawerExpanded}
          onSelectDrawer={(drawer) => (activeMobileDrawer = drawer)}
          onToggleExpand={activeTab === "retouch"
            ? () => (isMobileDrawerExpanded = !isMobileDrawerExpanded)
            : undefined}
          onClose={() => {
            activeMobileDrawer = "none";
            isMobileDrawerExpanded = false;
          }}
        />
        {#if activeTab === "retouch"}
          <TuningPanel
            profiles={allProfiles}
            styleGradingPresets={allStyleGradingPresets}
            {hasAiBaseline}
            {isModifiedFromAi}
            {activePhoto}
            activeProfileId={activePhoto?.appliedProfile}
            onRestoreAiTuning={restoreAiTuning}
            onQuickAiTone={quickAiTone}
            onQuickAiWhiteBalance={quickAiWhiteBalance}
            onResetToAsShot={resetToAsShot}
            onResetTuningParams={resetTuningParams}
            onQuickAiCrop={quickAiCrop}
            onQuickAiHorizon={quickAiHorizon}
            onQuickAiProfile={quickAiProfile}
            onApplyProfile={(id) => applyProfile(id)}
            onHoverProfile={(profileId) => {
              previewHoverProfileId = profileId;
              retouchViewRef?.triggerRender();
            }}
            onOpenQuickExport={() => (isQuickExportOpen = true)}
            onGoToExport={goToExport}
          />
        {:else if activeTab === "catalog"}
          <!-- CATALOG STAGE: 勾選的圖片預覽清單與前往精修導引 -->
          <PickedPreviewsRack
            {flaggedPhotos}
            activePhotoId={activePhoto?.id}
            totalPhotos={photoPlates.length}
            onSelectPhoto={(p) => selectPhoto(p)}
            onOpenRetouch={(p) => openRetouchForPhoto(p)}
            onToggleFlag={(p, e) => togglePhotoFlag(p, e)}
            onClearAllFlags={clearAllFlags}
            onGoToRetouch={goToRetouch}
          />
        {/if}
      </aside>
    {/if}
  </main>

  {#if activeMobileDrawer !== "none" && activeTab !== "retouch"}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="mobile-drawer-backdrop"
      onclick={() => (activeMobileDrawer = "none")}
    ></div>
  {/if}

  {#if activeTab === "retouch"}
    <MobileRetouchBar
      isHidden={activeMobileDrawer !== "none"}
      {isAiAnalyzing}
      {isBatchAiRunning}
      hasActivePhoto={Boolean(activePhoto)}
      hasCustomStylePrompt={Boolean(darkroomState.customStylePrompt.trim())}
      totalPhotos={photoPlates.length}
      {flaggedCount}
      {batchProgress}
      {activeMobileDrawer}
      onRunAiAnalysis={() => runAiAnalysis()}
      onCancelBatchAi={cancelBatchAi}
      onRequestBatchAi={requestBatchAiAnalysis}
      onToggleDrawer={(drawer) =>
        (activeMobileDrawer = activeMobileDrawer === drawer ? "none" : drawer)}
    />
  {/if}

  <MobileBottomNav
    {activeTab}
    {flaggedCount}
    isHidden={activeTab === "retouch" && activeMobileDrawer !== "none"}
    onSelectTab={(tab) => {
      activeTab = tab;
      activeMobileDrawer = "none";
      isMobileDrawerExpanded = false;
    }}
  />

  <!-- 未配置金鑰引導確認 Modal (API Key Required Prompt) -->
  <KeyPromptModal
    bind:isOpen={isKeyPromptModalOpen}
    onOpenVault={openVaultFromPrompt}
  />

  <!-- AI Key Vault Modal -->
  <KeyVaultModal bind:isOpen={isVaultOpen} onClose={refreshKeyStatus} />

  <!-- Curatorial Workflow & Keyboard Shortcuts Cheat Sheet Modal -->
  <HelpGuideModal
    bind:isOpen={isHelpOpen}
    onClose={() => (isHelpOpen = false)}
  />

  <!-- Single Photo Quick Export Modal (⌘E) -->
  <QuickExportModal
    bind:isOpen={isQuickExportOpen}
    photo={activePhoto}
    {exportMode}
    onClose={() => (isQuickExportOpen = false)}
    onExport={handleSingleQuickExport}
  />
</div>

<style>
  .workspace-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    width: 100vw;
    background-color: var(--canvas-base);
    color: var(--parchment-bright);
    overflow: hidden;
  }

  /* MAIN WORKSPACE LAYOUT */
  .main-body {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  /* LEFT SIDEBAR */
  .left-sidebar {
    width: var(--sidebar-width);
    background-color: var(--surface-panel);
    display: flex;
    flex-direction: column;
    padding: 0;
    flex-shrink: 0;
    /* 讓內部 AiAssistPanel 自行管理彈性捲動區與底部常駐執行列 */
    min-height: 0;
    overflow: hidden;
  }

  /* CENTER STAGE */
  .center-stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: var(--canvas-base);
    overflow: hidden;
    position: relative;
    min-height: 0;
    min-width: 0;
  }

  /* RIGHT TELEMETRY SIDEBAR */
  .right-telemetry {
    width: var(--telemetry-width);
    background-color: var(--surface-panel);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
    flex-shrink: 0;
  }

  /* 桌面端預設隱藏手機專屬抽屜遮罩 */
  .mobile-drawer-backdrop {
    display: none;
  }

  /* ── 行動端暗房佈局與抽屜動效 (Mobile Darkroom Responsive Layout & Bottom Sheet) ── */
  @media (max-width: 768px) {
    .left-sidebar,
    .right-telemetry {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100% !important;
      max-height: 72vh;
      z-index: 1000;
      background-color: var(--surface-panel);
      border-radius: 18px 18px 0 0;
      box-shadow: 0 -8px 36px rgba(0, 0, 0, 0.85);
      border-top: 1px solid var(--hairline-slate);
      transform: translateY(100%);
      transition:
        transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
        opacity 0.2s ease,
        visibility 0.28s;
      padding: 10px 14px 20px;
      display: flex;
      visibility: hidden;
      pointer-events: none;
      opacity: 0;
    }

    .left-sidebar.drawer-open,
    .right-telemetry.drawer-open {
      bottom: 50px;
      transform: translateY(0);
      visibility: visible;
      pointer-events: auto;
      opacity: 1;
    }

    /* 手機版精修分割視窗（上圖下控）：展開風格／微調時不遮蓋照片 */
    .workspace-container.mobile-retouch-split .main-body {
      flex-direction: column;
    }

    .workspace-container.mobile-retouch-split .center-stage {
      order: 1;
      flex: 1 1 0%;
      min-height: 0;
    }

    .workspace-container.mobile-retouch-split .left-sidebar:not(.drawer-open),
    .workspace-container.mobile-retouch-split
      .right-telemetry:not(.drawer-open) {
      display: none;
    }

    .workspace-container.mobile-retouch-split .left-sidebar.drawer-open,
    .workspace-container.mobile-retouch-split .right-telemetry.drawer-open {
      order: 2;
      position: static;
      transform: none;
      bottom: auto;
      flex: 0 0 46dvh;
      height: 46dvh;
      max-height: 46dvh;
      min-height: 0;
      width: 100% !important;
      border-radius: 14px 14px 0 0;
      padding: 0 12px calc(12px + env(safe-area-inset-bottom, 0px));
      box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.75);
      z-index: 20;
      transition:
        flex-basis 0.2s ease,
        height 0.2s ease,
        max-height 0.2s ease;
    }

    .workspace-container.mobile-retouch-split.mobile-drawer-expanded
      .left-sidebar.drawer-open,
    .workspace-container.mobile-retouch-split.mobile-drawer-expanded
      .right-telemetry.drawer-open {
      flex: 0 0 74dvh;
      height: 74dvh;
      max-height: 74dvh;
    }

    /* 抽屜全螢幕暗色遮罩 */
    .mobile-drawer-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(3px);
      z-index: 999;
    }
  }
</style>
