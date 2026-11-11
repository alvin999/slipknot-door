<script lang="ts">
  import { onMount, untrack } from "svelte";
  import {
    IngestionService,
    type CameraMountInfo,
  } from "$lib/services/ingestionService";
  import { KeyVaultService } from "$lib/services/keyVaultService";
  import {
    AiSceneService,
    type AiSceneDecision,
  } from "$lib/services/aiSceneService";
  import KeyVaultModal from "$lib/components/KeyVaultModal.svelte";
  import HelpGuideModal from "$lib/components/HelpGuideModal.svelte";
  import QuickExportModal from "$lib/components/QuickExportModal.svelte";
  import KeyPromptModal from "$lib/components/KeyPromptModal.svelte";
  import TopNav from "$lib/components/navigation/TopNav.svelte";
  import WorkflowSidebar from "$lib/components/navigation/WorkflowSidebar.svelte";
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
  import { WebglLutRenderer } from "$lib/services/webglLutRenderer";
  import { type CustomLutRecord } from "$lib/services/customLutService";
  import {
    ExportService,
    getExportExtension,
    type ExportFormat,
  } from "$lib/services/exportService";
  import { SessionService } from "$lib/services/sessionService";
  import { STYLE_KEYWORD_ENTRIES } from "$lib/services/ai/styleDirectives";
  import type {
    StyleKeywordId,
    StylePresetKey,
    DirectoryPlanResult,
  } from "$lib/services/ai/types";
  import {
    HSL_BAND_KEYS,
    cloneHslAdjustments,
    createDefaultHslAdjustments,
    type CropGeometry,
    type AiScopePreferences,
    type AiTuningSnapshot,
    type HslAdjustments,
  } from "$lib/types/photo";

  // Active module tabs
  type ModuleTab = "catalog" | "retouch" | "profiles" | "export" | "devices";
  let activeTab = $state<ModuleTab>("catalog"); // Default to catalog on fresh load for curatorial overview
  let retouchViewRef = $state<any>(null);

  // Mobile Bottom Drawer State (行動端抽屜狀態)
  type MobileDrawer = "none" | "ai" | "tuning";
  let activeMobileDrawer = $state<MobileDrawer>("none");

  // Key Vault & Help Modal State
  let isVaultOpen = $state<boolean>(false);
  let isHelpOpen = $state<boolean>(false);
  let isQuickExportOpen = $state<boolean>(false);
  let isKeyPromptModalOpen = $state<boolean>(false);
  let geminiKeyStatus = $state<{ exists: boolean; mode: string | null }>({
    exists: false,
    mode: null,
  });
  let hasKey = $state<boolean>(false);

  // Hardware Ingestion State
  let cameraMounts = $state<CameraMountInfo[]>([]);
  let isScanningMounts = $state<boolean>(false);
  let latestExtractionMs = $state<number>(18);

  onMount(() => {
    refreshCameraMounts();
    refreshKeyStatus();

    // 載入使用者自訂 3D LUT 並同步至 WebGL 著色器
    lutCatalog.loadCustomLuts().then(() => {
      syncCustomLutsToRenderers();
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
    const s = KeyVaultService.getKeyStatus("gemini");
    geminiKeyStatus = { exists: s.exists, mode: s.mode };
    hasKey = hasActiveApiKey();
  }

  function hasActiveApiKey(): boolean {
    const gemini = KeyVaultService.getKeyStatus("gemini");
    const groq = KeyVaultService.getKeyStatus("groq");
    return gemini.exists || groq.exists;
  }

  async function refreshCameraMounts() {
    isScanningMounts = true;
    try {
      cameraMounts = await IngestionService.detectMounts();
    } finally {
      isScanningMounts = false;
    }
  }

  // Photographic Plate Interface
  interface PhotoPlate {
    id: string;
    frameNo: string;
    filename: string;
    camera: string;
    lens: string;
    iso: number;
    shutter: string;
    aperture: string;
    focalLength: string;
    thumbnail: string;
    sceneTag: string;
    selected: boolean;
    flagged?: boolean;
    appliedProfile: string;
    fileHandle?: File;
    filePath?: string;
    gradedThumbnail?: string;
    exposureBias?: number;
    exposureProgram?: string;
    meteringMode?: string;
    colorSpace?: string;
    flash?: string;
    asShotTemp?: number;
    asShotTint?: number;
    asShotExposure?: number;
    crop?: CropGeometry;
    aiDecision?: AiSceneDecision;
    aiTuningSnapshot?: AiTuningSnapshot;
    tuning?: {
      exposure: number;
      contrast: number;
      shadows?: number;
      lutIntensity: number;
      colorTemp: number;
      tint: number;
      clarity?: number;
      sharpness?: number;
      colorDensity?: number;
      shadowHue?: number;
      shadowTintAmount?: number;
      highlightHue?: number;
      highlightTintAmount?: number;
      halation?: number;
      grainAmount?: number;
      highlights?: number;
      blacks?: number;
      vibrance?: number;
      vignette?: number;
      monochrome?: boolean;
      hsl?: HslAdjustments;
    };
  }

  let photoPlates = $state<PhotoPlate[]>([]);
  let activePhoto = $state<PhotoPlate | null>(null);
  let isLoadingPhotos = $state<boolean>(false);
  let photoLoadToken = 0;
  let currentDirectoryName = $state<string>("");

  // Darkroom Tuning Sliders
  // Professional Darkroom Tonal & Color Parameters
  // 專業暗房光影與色彩參數 (與 darkroomState 保持單一真相來源)
  let exposure = $state<number>(0.0);
  let contrast = $state<number>(0.0);
  let shadows = $state<number>(0.0);
  let colorTemp = $state<number>(5500);
  let tint = $state<number>(0.0);
  let lutIntensity = $state<number>(1.0);
  let clarity = $state<number>(0.0);
  let sharpness = $state<number>(0.0);
  let colorDensity = $state<number>(0.0);
  let shadowHue = $state<number>(200);
  let shadowTintAmount = $state<number>(0.0);
  let highlightHue = $state<number>(40);
  let highlightTintAmount = $state<number>(0.0);
  let halation = $state<number>(0.0);
  let grainAmount = $state<number>(0.15);
  let highlights = $state<number>(0.0);
  let blacks = $state<number>(0.0);
  let vibrance = $state<number>(0.0);
  let vignette = $state<number>(0.0);
  let monochrome = $state<boolean>(false);
  let hsl = $state<HslAdjustments>(createDefaultHslAdjustments());

  // 專業 Diff 視覺比對狀態 (由 darkroomState 作為單一真相來源)
  type DiffMode = "off" | "split" | "sideBySide";

  function isDiffModeActive(mode: DiffMode): boolean {
    return darkroomState.isDiffModeActive(mode);
  }

  // AI 職責範圍偏好矩陣 (AI Scope Matrix)
  const AI_SCOPE_STORAGE_KEY = "slipknot_ai_scope_prefs";
  const initialScope: AiScopePreferences =
    typeof localStorage !== "undefined" &&
    localStorage.getItem(AI_SCOPE_STORAGE_KEY)
      ? (() => {
          try {
            return {
              lutProfile: true,
              crop: true,
              keystone: true,
              tone: true,
              whiteBalance: true,
              filmPhysics: true,
              ...JSON.parse(localStorage.getItem(AI_SCOPE_STORAGE_KEY)!),
            };
          } catch {
            return {
              lutProfile: true,
              crop: true,
              keystone: true,
              tone: true,
              whiteBalance: true,
              filmPhysics: true,
            };
          }
        })()
      : {
          lutProfile: true,
          crop: true,
          keystone: true,
          tone: true,
          whiteBalance: true,
          filmPhysics: true,
        };

  let aiScope = $state<AiScopePreferences>(initialScope);
  let isAiScopeOpen = $state<boolean>(aiPipeline.isAiScopeOpen); // 側邊欄 AI 職責勾選面板摺疊開關

  function saveAiScope() {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(AI_SCOPE_STORAGE_KEY, JSON.stringify(aiScope));
    }
  }

  function toggleAiScope(key: keyof AiScopePreferences) {
    aiScope[key] = !aiScope[key];
    saveAiScope();
  }

  // 幾何構圖與裁切狀態 (Crop & Geometry State)
  let isCropMode = $state<boolean>(false);
  let cropX = $state<number>(0.0); // 0.0 ~ 1.0 (左上角 X 比例)
  let cropY = $state<number>(0.0); // 0.0 ~ 1.0 (左上角 Y 比例)
  let cropWidth = $state<number>(1.0); // 0.0 ~ 1.0 (寬度比例)
  let cropHeight = $state<number>(1.0); // 0.0 ~ 1.0 (高度比例)
  let cropRotation = $state<number>(0.0); // -45 ~ +45 度 (水平校正)
  let keystoneV = $state<number>(0.0); // -45 ~ +45 度 (垂直透視梯形)
  let keystoneH = $state<number>(0.0); // -45 ~ +45 度 (水平透視梯形)
  let cropAspectRatio = $state<
    "original" | "1:1" | "4:5" | "16:9" | "9:16" | "free"
  >("original");
  let flipH = $state<boolean>(false);
  let flipV = $state<boolean>(false);
  let aiCropRationale = $state<string>(""); // AI 建議裁切說明

  function resetCropState() {
    cropX = 0.0;
    cropY = 0.0;
    cropWidth = 1.0;
    cropHeight = 1.0;
    cropRotation = 0.0;
    keystoneV = 0.0;
    keystoneH = 0.0;
    cropAspectRatio = "original";
    flipH = false;
    flipV = false;
    aiCropRationale = "";
    syncCropToActivePhoto();
  }

  type CropRatioPreset = "original" | "1:1" | "4:5" | "16:9" | "9:16" | "free";

  function syncCropToActivePhoto() {
    if (!activePhoto) return;
    const isDefaultCrop =
      cropX === 0.0 &&
      cropY === 0.0 &&
      cropWidth === 1.0 &&
      cropHeight === 1.0 &&
      cropRotation === 0.0;

    const targetCrop = isDefaultCrop
      ? undefined
      : {
          x: cropX,
          y: cropY,
          width: cropWidth,
          height: cropHeight,
          rotation: cropRotation,
          keystoneV,
          keystoneH,
          aspectRatio: cropAspectRatio,
          flipH,
          flipV,
          rationale: aiCropRationale,
        };

    if (JSON.stringify(activePhoto.crop) === JSON.stringify(targetCrop)) {
      return;
    }

    activePhoto.crop = targetCrop;
    photoPlates = photoPlates.map((p) =>
      p.id === activePhoto!.id
        ? {
            ...p,
            crop: activePhoto!.crop,
          }
        : p,
    );
  }

  // 裁切長寬比由 darkroomState.applyAspectRatioPreset() 統一管理

  // Dedicated Offscreen WebGL Renderer for Catalog Thumbnails
  let offscreenCanvas: HTMLCanvasElement | null = null;
  let offscreenRenderer: WebglLutRenderer | null = null;
  const thumbnailRenderQueue: PhotoPlate[] = [];
  let isProcessingQueue = false;
  let sliderThumbnailTimer: ReturnType<typeof setTimeout> | null = null;

  // AI 風格調色狀態 (Neural Bespoke Style Grading)
  let activeStylePreset = $state<StylePresetKey>("auto"); // 每次載入預設為 AI 自動配對
  let previewHoverProfileId = $state<string | null>(null);

  // 調色意境關鍵字與自訂 Prompt 狀態 (Vibe Keyword Chips & Custom Prompt)
  let selectedStyleKeywords = $state<StyleKeywordId[]>([]);
  let customStylePrompt = $state<string>("");

  function toggleStyleKeyword(id: StyleKeywordId) {
    if (selectedStyleKeywords.includes(id)) {
      selectedStyleKeywords = selectedStyleKeywords.filter((k) => k !== id);
    } else {
      selectedStyleKeywords = [...selectedStyleKeywords, id];
    }
  }

  function clearStyleKeywords() {
    selectedStyleKeywords = [];
    customStylePrompt = "";
  }

  // 3D LUT 典藏與自訂 LUT 清單（由 lutCatalog Store 統一管理）
  const profiles = lutCatalog.builtinProfiles;
  const userCustomLuts = $derived(lutCatalog.userCustomLuts);
  const allProfiles = $derived(lutCatalog.allProfiles);
  const allStyleGradingPresets = $derived(lutCatalog.allStyleGradingPresets);

  function syncCustomLutsToRenderers() {
    if (userCustomLuts.length === 0) return;
    offscreenRenderer?.registerCustomLuts(userCustomLuts);
    stylePreviewRenderer?.registerCustomLuts(userCustomLuts);
  }

  async function handleImportCustomLut(lut: CustomLutRecord) {
    await lutCatalog.importCustomLut(lut);
    syncCustomLutsToRenderers();
    if (activePhoto?.thumbnail) {
      generateStylePreviews(activePhoto.thumbnail);
    }
  }

  async function handleDeleteCustomLut(id: string) {
    await lutCatalog.deleteCustomLut(id);
  }

  async function handleUpdateCustomLut(lut: CustomLutRecord) {
    await lutCatalog.updateCustomLut(lut);
    syncCustomLutsToRenderers();
    if (activePhoto?.thumbnail) {
      generateStylePreviews(activePhoto.thumbnail);
    }
  }

  // AI Inference State
  let isAiAnalyzing = $state<boolean>(false);
  let isBatchAiRunning = $state<boolean>(false);
  let cancelBatchRequested = $state<boolean>(false);
  let batchAbortController: AbortController | null = null;
  let batchProgress = $state<{
    current: number;
    total: number;
    countdown: number;
  } | null>(null);
  let aiSuggestedScene = $state<string>("等待判讀");
  let aiSceneTitle = $state<string>("");
  let aiStyleInsight = $state<string>("");
  let aiRecommendedMood = $state<string>("");
  let aiRecommendedProfile = $state<string>("");
  let aiTerminalLogs = $state<string[]>([]);

  // AI 混合雙軌：Gemini 視覺標籤 + Groq 極速社群文案與 IPTC
  let aiVisionTags = $state<string[]>([]);
  let userSocialPrompt = $state<string>("");
  let aiSocialCaption = $state<string>("");
  let aiSocialHashtags = $state<string[]>([]);
  let aiIptcKeywords = $state<string[]>([]);
  let isGeneratingCopy = $state<boolean>(false);
  let copyNotice = $state<string>("");

  // Curatorial Queue: 若有標記挑圖 (flagged)，精修與匯出僅聚焦選取的相片；若無選取則全部顯示
  let activeQueue = $derived<PhotoPlate[]>(
    photoPlates.filter((p) => p.flagged).length > 0
      ? photoPlates.filter((p) => p.flagged)
      : photoPlates,
  );

  let flaggedCount = $derived<number>(
    photoPlates.filter((p) => p.flagged).length,
  );

  let flaggedPhotos = $derived<PhotoPlate[]>(
    photoPlates.filter((p) => p.flagged),
  );

  function togglePhotoFlag(photo: PhotoPlate, event?: MouseEvent) {
    if (event) event.stopPropagation();
    photo.flagged = !photo.flagged;
    photoPlates = [...photoPlates];
  }

  function clearAllFlags() {
    photoPlates.forEach((p) => (p.flagged = false));
    photoPlates = [...photoPlates];
  }

  function handleFlagToggled() {
    photoPlates = [...photoPlates];
  }

  function selectPhoto(plate: PhotoPlate) {
    // 記憶前一張相片的自訂調色與裁切狀態（僅在有實質調整且與原儲存不同時寫入）
    if (activePhoto && activePhoto.id !== plate.id) {
      const currentPlate = photoPlates.find((p) => p.id === activePhoto!.id);

      const asShotTemp = activePhoto.asShotTemp ?? 5500;
      const asShotExp = activePhoto.asShotExposure ?? 0.0;
      const asShotTint = activePhoto.asShotTint ?? 0.0;

      const isDefaultHsl = HSL_BAND_KEYS.every(
        (k) =>
          Math.abs(hsl[k].hue) < 0.001 &&
          Math.abs(hsl[k].sat) < 0.001 &&
          Math.abs(hsl[k].lum) < 0.001,
      );
      const isDefault =
        isDefaultHsl &&
        !monochrome &&
        Math.abs(exposure - asShotExp) < 0.001 &&
        Math.abs(highlights - 0.0) < 0.001 &&
        Math.abs(contrast - 0.0) < 0.001 &&
        Math.abs(shadows - 0.0) < 0.001 &&
        Math.abs(blacks - 0.0) < 0.001 &&
        Math.abs(colorTemp - asShotTemp) < 1 &&
        Math.abs(tint - asShotTint) < 0.001 &&
        Math.abs(vibrance - 0.0) < 0.001 &&
        Math.abs(lutIntensity - 1.0) < 0.001 &&
        Math.abs(clarity - 0.0) < 0.001 &&
        Math.abs(sharpness - 0.0) < 0.001 &&
        Math.abs(colorDensity - 0.0) < 0.001 &&
        Math.abs(shadowTintAmount - 0.0) < 0.001 &&
        Math.abs(highlightTintAmount - 0.0) < 0.001 &&
        Math.abs(halation - 0.0) < 0.001 &&
        Math.abs(grainAmount - 0.15) < 0.001 &&
        Math.abs(vignette - 0.0) < 0.001;

      const targetTuning = isDefault
        ? undefined
        : {
            exposure,
            highlights,
            contrast,
            shadows,
            blacks,
            lutIntensity,
            colorTemp,
            tint,
            vibrance,
            clarity,
            sharpness,
            colorDensity,
            shadowHue,
            shadowTintAmount,
            highlightHue,
            highlightTintAmount,
            halation,
            grainAmount,
            vignette,
            monochrome,
            hsl: cloneHslAdjustments(hsl),
          };

      const isDefaultCrop =
        cropX === 0.0 &&
        cropY === 0.0 &&
        cropWidth === 1.0 &&
        cropHeight === 1.0 &&
        cropRotation === 0.0 &&
        keystoneV === 0 &&
        keystoneH === 0 &&
        !flipH &&
        !flipV;

      const targetCrop = isDefaultCrop
        ? undefined
        : {
            x: cropX,
            y: cropY,
            width: cropWidth,
            height: cropHeight,
            rotation: cropRotation,
            keystoneV,
            keystoneH,
            aspectRatio: cropAspectRatio,
            flipH,
            flipV,
            rationale: aiCropRationale,
          };

      const tuningChanged =
        JSON.stringify(currentPlate?.tuning) !== JSON.stringify(targetTuning);
      const cropChanged =
        JSON.stringify(currentPlate?.crop) !== JSON.stringify(targetCrop);

      if (tuningChanged) {
        activePhoto.tuning = targetTuning;
      }
      if (cropChanged) {
        activePhoto.crop = targetCrop;
      }

      if (tuningChanged || cropChanged) {
        photoPlates = photoPlates.map((p) =>
          p.id === activePhoto!.id
            ? { ...p, tuning: activePhoto!.tuning, crop: activePhoto!.crop }
            : p,
        );
      }
    }

    activePhoto = plate;
    photoPlates.forEach((p) => (p.selected = p.id === plate.id));

    // 載入當前選中相片的專屬調色或拍攝原生值 (As Shot)
    if (plate.tuning) {
      exposure = plate.tuning.exposure;
      contrast = plate.tuning.contrast;
      shadows = plate.tuning.shadows ?? 0;
      lutIntensity = plate.tuning.lutIntensity;
      colorTemp = plate.tuning.colorTemp;
      tint = plate.tuning.tint ?? 0;
      clarity = plate.tuning.clarity ?? 0;
      sharpness = plate.tuning.sharpness ?? 0;
      colorDensity = plate.tuning.colorDensity ?? 0;
      shadowHue = plate.tuning.shadowHue ?? 200;
      shadowTintAmount = plate.tuning.shadowTintAmount ?? 0;
      highlightHue = plate.tuning.highlightHue ?? 40;
      highlightTintAmount = plate.tuning.highlightTintAmount ?? 0;
      halation = plate.tuning.halation ?? 0;
      grainAmount = plate.tuning.grainAmount ?? 0.15;
      highlights = plate.tuning.highlights ?? 0;
      blacks = plate.tuning.blacks ?? 0;
      vibrance = plate.tuning.vibrance ?? 0;
      vignette = plate.tuning.vignette ?? 0;
      monochrome = plate.tuning.monochrome ?? false;
      hsl = cloneHslAdjustments(plate.tuning.hsl);
    } else {
      exposure = plate.asShotExposure ?? 0.0;
      contrast = 0.0;
      shadows = 0.0;
      lutIntensity = 1.0;
      colorTemp = plate.asShotTemp ?? 5500;
      tint = plate.asShotTint ?? 0.0;
      clarity = 0.0;
      sharpness = 0.0;
      colorDensity = 0.0;
      shadowHue = 200;
      shadowTintAmount = 0.0;
      highlightHue = 40;
      highlightTintAmount = 0.0;
      halation = 0.0;
      grainAmount = 0.15;
      highlights = 0.0;
      blacks = 0.0;
      vibrance = 0.0;
      vignette = 0.0;
      monochrome = false;
      hsl = createDefaultHslAdjustments();
    }

    // 載入當前選中相片的專屬裁切或重設為全幅
    if (plate.crop) {
      cropX = plate.crop.x;
      cropY = plate.crop.y;
      cropWidth = plate.crop.width;
      cropHeight = plate.crop.height;
      cropRotation = plate.crop.rotation;
      keystoneV = plate.crop.keystoneV ?? 0;
      keystoneH = plate.crop.keystoneH ?? 0;
      cropAspectRatio = plate.crop.aspectRatio;
      flipH = plate.crop.flipH;
      flipV = plate.crop.flipV;
    } else {
      resetCropState();
    }

    // 載入當前選中相片的專屬 AI 決策與場景 Label (若尚未分析則顯示初始狀態)
    if (plate.aiDecision) {
      aiSuggestedScene = `${plate.aiDecision.scene_type} (視覺即時判讀)`;
      aiSceneTitle =
        plate.aiDecision.scene_title || plate.aiDecision.scene_type;
      aiStyleInsight = plate.aiDecision.style_insight || "";
      aiRecommendedMood = plate.aiDecision.recommended_mood || "";
      aiRecommendedProfile =
        plate.aiDecision.recommended_profile || plate.appliedProfile;
      aiCropRationale = plate.aiDecision.crop_rationale || "";
      aiVisionTags = plate.aiDecision.tags || [];
    } else {
      aiSuggestedScene = "尚未分析";
      aiSceneTitle =
        plate.sceneTag && plate.sceneTag !== "本機相簿幀" ? plate.sceneTag : "";
      aiStyleInsight = "";
      aiRecommendedMood = "";
      aiRecommendedProfile =
        plate.appliedProfile || "Profile_00_StandardNatural";
      aiCropRationale = "";
      aiVisionTags = [];
    }

    // 雙向同步至全域領域 Store
    photoLibrary.activePhoto = plate as any;
    photoLibrary.photoPlates = photoPlates as any;
    darkroomState.loadFromPhoto(plate as any);
  }

  // 自動持久化相卷工作區進度至本機快取 (Session Auto-Persistence)
  $effect(() => {
    if (currentDirectoryName && photoPlates.length > 0) {
      SessionService.debouncedSaveSession(currentDirectoryName, photoPlates);
    }
  });

  // 保持 darkroomState 與主頁面狀態雙向同步，並持久化到 activePhoto.tuning
  $effect(() => {
    // 響應式追蹤 darkroomState 數值
    const exp = darkroomState.exposure;
    const con = darkroomState.contrast;
    const shd = darkroomState.shadows;
    const temp = darkroomState.colorTemp;
    const tnt = darkroomState.tint;
    const lut = darkroomState.lutIntensity;
    const clr = darkroomState.clarity;
    const shp = darkroomState.sharpness;
    const den = darkroomState.colorDensity;
    const shH = darkroomState.shadowHue;
    const shA = darkroomState.shadowTintAmount;
    const hiH = darkroomState.highlightHue;
    const hiA = darkroomState.highlightTintAmount;
    const hal = darkroomState.halation;
    const grn = darkroomState.grainAmount;
    const hi = darkroomState.highlights;
    const blk = darkroomState.blacks;
    const vib = darkroomState.vibrance;
    const vig = darkroomState.vignette;
    const mono = darkroomState.monochrome;
    const hslClone = cloneHslAdjustments(darkroomState.hsl);

    // 同步至 +page.svelte 局部狀態供匯出與其他邏輯使用
    exposure = exp;
    highlights = hi;
    contrast = con;
    shadows = shd;
    blacks = blk;
    colorTemp = temp;
    tint = tnt;
    vibrance = vib;
    lutIntensity = lut;
    clarity = clr;
    sharpness = shp;
    colorDensity = den;
    shadowHue = shH;
    shadowTintAmount = shA;
    highlightHue = hiH;
    highlightTintAmount = hiA;
    halation = hal;
    grainAmount = grn;
    vignette = vig;
    monochrome = mono;
    hsl = hslClone;

    cropX = darkroomState.cropX;
    cropY = darkroomState.cropY;
    cropWidth = darkroomState.cropWidth;
    cropHeight = darkroomState.cropHeight;
    cropRotation = darkroomState.cropRotation;
    keystoneV = darkroomState.keystoneV;
    keystoneH = darkroomState.keystoneH;
    cropAspectRatio = darkroomState.cropAspectRatio;
    flipH = darkroomState.flipH;
    flipV = darkroomState.flipV;
    isCropMode = darkroomState.isCropMode;
    aiCropRationale = darkroomState.aiCropRationale;

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
    if (activeQueue.length === 0) return;
    const currentIndex = activeQueue.findIndex((p) => p.id === activePhoto?.id);
    let nextIndex = currentIndex + delta;
    if (nextIndex < 0) nextIndex = activeQueue.length - 1;
    if (nextIndex >= activeQueue.length) nextIndex = 0;
    selectPhoto(activeQueue[nextIndex]);
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
    if (photoLibrary.activePhoto) {
      photoLibrary.activePhoto.appliedProfile = profileId;
    }
    photoPlates = photoPlates.map((p) =>
      p.id === activePhoto!.id ? { ...p, appliedProfile: profileId } : p,
    );
    const found = allProfiles.find((p) => p.id === profileId);
    if (found) {
      exposure = found.evDefault;
      contrast = found.contrastDefault || 0.0;
      shadows = found.shadowsDefault ?? 0.0;
      lutIntensity = found.lutIntensityDefault;
      clarity = found.clarityDefault ?? 0.0;
      sharpness = found.sharpnessDefault ?? 0.0;
      colorDensity = 0.0;
      shadowHue = 200;
      shadowTintAmount = 0.0;
      highlightHue = 40;
      highlightTintAmount = 0.0;
      halation = 0.0;
      grainAmount = 0.15;
      highlights = found.highlightsDefault ?? 0.0;
      blacks = 0.0;
      vibrance = 0.0;
      vignette = 0.0;
      hsl = createDefaultHslAdjustments();

      darkroomState.exposure = exposure;
      darkroomState.highlights = highlights;
      darkroomState.contrast = contrast;
      darkroomState.shadows = shadows;
      darkroomState.blacks = blacks;
      darkroomState.lutIntensity = lutIntensity;
      darkroomState.vibrance = vibrance;
      darkroomState.clarity = clarity;
      darkroomState.sharpness = sharpness;
      darkroomState.colorDensity = colorDensity;
      darkroomState.shadowHue = shadowHue;
      darkroomState.shadowTintAmount = shadowTintAmount;
      darkroomState.highlightHue = highlightHue;
      darkroomState.highlightTintAmount = highlightTintAmount;
      darkroomState.halation = halation;
      darkroomState.grainAmount = grainAmount;
      darkroomState.vignette = vignette;
      darkroomState.hsl = cloneHslAdjustments(hsl);
    }
    triggerWebglRender();
    enqueueThumbnailRender(activePhoto);
  }

  function applyProfileToAll(profileId: string) {
    photoPlates.forEach((p) => {
      p.appliedProfile = profileId;
      enqueueThumbnailRender(p);
    });
    if (activePhoto) {
      applyProfile(profileId);
    }
  }

  /**
   * 離屏 WebGL 縮圖批次渲染管線 (方案 B)
   */
  function ensureOffscreenRenderer(): boolean {
    if (offscreenRenderer) return true;
    if (typeof document === "undefined") return false;
    offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = 400;
    offscreenCanvas.height = 300;
    offscreenRenderer = new WebglLutRenderer();
    const ok = offscreenRenderer.initialize(offscreenCanvas);
    if (ok && userCustomLuts.length > 0) {
      offscreenRenderer.registerCustomLuts(userCustomLuts);
    }
    return ok;
  }

  function enqueueThumbnailRender(plate: PhotoPlate) {
    if (!thumbnailRenderQueue.some((p) => p.id === plate.id)) {
      thumbnailRenderQueue.push(plate);
    }
    if (!isProcessingQueue) {
      processThumbnailQueue();
    }
  }

  // 風格卡片小預覽：以當前相片縮圖套用各風格 LUT 後的結果（獨立小型渲染器，避免干擾縮圖佇列）
  let stylePreviewThumbs = $state<Record<string, string>>({});
  let stylePreviewCanvas: HTMLCanvasElement | null = null;
  let stylePreviewRenderer: WebglLutRenderer | null = null;
  let stylePreviewToken = 0;
  let lastStylePreviewSource = "";

  async function generateStylePreviews(thumbnail: string) {
    const token = ++stylePreviewToken;
    if (typeof document === "undefined" || !thumbnail) return;
    if (!stylePreviewRenderer) {
      stylePreviewCanvas = document.createElement("canvas");
      stylePreviewCanvas.width = 160;
      stylePreviewCanvas.height = 107;
      const r = new WebglLutRenderer();
      if (!r.initialize(stylePreviewCanvas)) return;
      if (userCustomLuts.length > 0) {
        r.registerCustomLuts(userCustomLuts);
      }
      stylePreviewRenderer = r;
    }
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
        img.src = thumbnail;
      });
      const next: Record<string, string> = {};
      for (const preset of allStyleGradingPresets) {
        if (token !== stylePreviewToken) return; // 已切換相片，放棄過期結果
        if (!preset.profileId) continue;
        if (preset.profileId === "Profile_00_StandardNatural") {
          next[preset.key] = thumbnail;
          continue;
        }
        const prof = allProfiles.find((p) => p.id === preset.profileId);
        stylePreviewRenderer.setImageSource(img);
        stylePreviewRenderer.setProfile(preset.profileId);
        stylePreviewRenderer.render(
          {
            exposure: prof?.evDefault ?? 0,
            contrast: prof?.contrastDefault ?? 0,
            colorTemp: 5500,
            tint: 0,
            shadowLift: prof?.shadowsDefault ?? 0,
            lutIntensity: prof?.lutIntensityDefault ?? 1,
            bypassLut: false,
            clarity: 0,
            sharpness: 0,
          },
          160,
          107,
        );
        const url = stylePreviewRenderer.exportDataUrl("image/jpeg", 0.7);
        if (url) next[preset.key] = url;
        // 讓出主執行緒，避免卡住 UI
        await new Promise((r) => setTimeout(r, 0));
      }
      if (token === stylePreviewToken) stylePreviewThumbs = next;
    } catch (err) {
      console.warn("[StylePreview] 風格預覽生成失敗:", err);
    }
  }

  $effect(() => {
    const thumb = activePhoto?.thumbnail;
    if (thumb) {
      if (thumb !== lastStylePreviewSource) {
        lastStylePreviewSource = thumb;
        generateStylePreviews(thumb);
      }
    } else {
      lastStylePreviewSource = "";
      stylePreviewToken++;
      stylePreviewThumbs = {};
    }
  });

  async function processThumbnailQueue() {
    if (thumbnailRenderQueue.length === 0) {
      isProcessingQueue = false;
      return;
    }
    isProcessingQueue = true;

    if (!ensureOffscreenRenderer() || !offscreenRenderer) {
      isProcessingQueue = false;
      return;
    }

    const plate = thumbnailRenderQueue.shift();
    if (plate && plate.thumbnail) {
      if (
        plate.appliedProfile === "Profile_00_StandardNatural" &&
        !plate.tuning
      ) {
        if (plate.gradedThumbnail !== undefined) {
          plate.gradedThumbnail = undefined;
          photoPlates = photoPlates.map((p) =>
            p.id === plate.id ? { ...p, gradedThumbnail: undefined } : p,
          );
        }
        if (
          activePhoto &&
          activePhoto.id === plate.id &&
          activePhoto.gradedThumbnail !== undefined
        ) {
          activePhoto.gradedThumbnail = undefined;
        }
      } else {
        try {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = (e) => reject(e);
            img.src = plate.thumbnail;
          });

          const isCurrentActive = activePhoto && activePhoto.id === plate.id;
          const found = profiles.find((p) => p.id === plate.appliedProfile);
          const currentEv = isCurrentActive
            ? exposure
            : (plate.tuning?.exposure ??
              (found ? found.evDefault : (plate.asShotExposure ?? 0.0)));
          const currentContrast = isCurrentActive
            ? contrast
            : (plate.tuning?.contrast ??
              (found ? found.contrastDefault || 0.0 : 0.0));
          const currentTemp = isCurrentActive
            ? colorTemp
            : (plate.tuning?.colorTemp ?? plate.asShotTemp ?? 5500);
          const currentTint = isCurrentActive
            ? tint
            : (plate.tuning?.tint ?? plate.asShotTint ?? 0.0);
          const currentLut = isCurrentActive
            ? lutIntensity
            : (plate.tuning?.lutIntensity ??
              (found ? found.lutIntensityDefault : 1.0));
          const currentShadows = isCurrentActive
            ? shadows
            : (plate.tuning?.shadows ??
              (found ? (found.shadowsDefault ?? 0.0) : 0.0));
          const currentClarity = isCurrentActive
            ? clarity
            : (plate.tuning?.clarity ??
              (found ? (found.clarityDefault ?? 0.0) : 0.0));
          const currentSharpness = isCurrentActive
            ? sharpness
            : (plate.tuning?.sharpness ??
              (found ? (found.sharpnessDefault ?? 0.0) : 0.0));
          const currentColorDensity = isCurrentActive
            ? colorDensity
            : (plate.tuning?.colorDensity ?? 0.0);
          const currentShadowHue = isCurrentActive
            ? shadowHue
            : (plate.tuning?.shadowHue ?? 200);
          const currentShadowTintAmount = isCurrentActive
            ? shadowTintAmount
            : (plate.tuning?.shadowTintAmount ?? 0.0);
          const currentHighlightHue = isCurrentActive
            ? highlightHue
            : (plate.tuning?.highlightHue ?? 40);
          const currentHighlightTintAmount = isCurrentActive
            ? highlightTintAmount
            : (plate.tuning?.highlightTintAmount ?? 0.0);
          const currentHalation = isCurrentActive
            ? halation
            : (plate.tuning?.halation ?? 0.0);
          const currentGrainAmount = isCurrentActive
            ? grainAmount
            : (plate.tuning?.grainAmount ?? 0.15);
          const currentHighlights = isCurrentActive
            ? highlights
            : (plate.tuning?.highlights ??
              (found ? (found.highlightsDefault ?? 0.0) : 0.0));
          const currentBlacks = isCurrentActive
            ? blacks
            : (plate.tuning?.blacks ?? 0.0);
          const currentVibrance = isCurrentActive
            ? vibrance
            : (plate.tuning?.vibrance ?? 0.0);
          const currentVignette = isCurrentActive
            ? vignette
            : (plate.tuning?.vignette ?? 0.0);
          const currentMonochrome = isCurrentActive
            ? monochrome
            : (plate.tuning?.monochrome ?? false);
          const currentHsl = isCurrentActive ? hsl : plate.tuning?.hsl;

          offscreenRenderer.setImageSource(img);
          offscreenRenderer.setProfile(plate.appliedProfile);
          offscreenRenderer.render(
            {
              exposure: currentEv,
              highlights: currentHighlights,
              contrast: currentContrast,
              blacks: currentBlacks,
              colorTemp: currentTemp,
              tint: currentTint,
              vibrance: currentVibrance,
              shadowLift: currentShadows,
              lutIntensity: currentLut,
              bypassLut: plate.appliedProfile === "Profile_00_StandardNatural",
              clarity: currentClarity,
              sharpness: currentSharpness,
              colorDensity: currentColorDensity,
              shadowHue: currentShadowHue,
              shadowTintAmount: currentShadowTintAmount,
              highlightHue: currentHighlightHue,
              highlightTintAmount: currentHighlightTintAmount,
              halation: currentHalation,
              grainAmount: currentGrainAmount,
              vignette: currentVignette,
              monochrome: currentMonochrome,
              hsl: currentHsl,
            },
            img.naturalWidth || 400,
            img.naturalHeight || 300,
          );

          const dataUrl = offscreenRenderer.exportDataUrl("image/jpeg", 0.85);
          if (dataUrl && plate.gradedThumbnail !== dataUrl) {
            plate.gradedThumbnail = dataUrl;
            photoPlates = photoPlates.map((p) =>
              p.id === plate.id ? { ...p, gradedThumbnail: dataUrl } : p,
            );
            if (
              activePhoto &&
              activePhoto.id === plate.id &&
              activePhoto.gradedThumbnail !== dataUrl
            ) {
              activePhoto.gradedThumbnail = dataUrl;
            }
          }
        } catch (err) {
          console.warn("[ThumbnailRenderer] 縮圖渲染略過或失敗:", err);
        }
      }
    }

    // 稍微延遲讓出主執行緒，確保 60FPS 流暢（批次時拉長間隔防止吃滿 GPU 與 CPU 資源）
    const queueInterval = isBatchAiRunning ? 100 : 25;
    setTimeout(processThumbnailQueue, queueInterval);
  }

  /**
   * 雙圖閉環覆審專用：以 Pass 1 決策參數極速渲染 1024px 預覽縮圖供 AI 覆審比對
   */
  async function renderPass1PreviewForCritic(
    previewSrc: string,
    decision: any,
    targetMonochrome = false,
  ): Promise<string | null> {
    if (!ensureOffscreenRenderer() || !offscreenRenderer) return null;
    try {
      // 確保格式為有效之圖片 URI
      let safeSrc = previewSrc;
      if (
        !safeSrc.startsWith("data:") &&
        !safeSrc.startsWith("blob:") &&
        !safeSrc.startsWith("http") &&
        !safeSrc.startsWith("asset:")
      ) {
        safeSrc = `data:image/jpeg;base64,${safeSrc}`;
      }

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          img.onload = null;
          img.onerror = null;
          if (img.naturalWidth > 0) {
            resolve();
          } else {
            reject(new Error("覆審縮圖載入逾時 (>3s)"));
          }
        }, 3000);

        img.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        img.onerror = (e) => {
          clearTimeout(timer);
          reject(e);
        };
        img.src = safeSrc;

        // 若圖片已在快取完成解碼，立即推進
        if (img.complete && img.naturalWidth > 0) {
          clearTimeout(timer);
          resolve();
        }
      });

      const forcedProfileId =
        activeStylePreset !== "auto"
          ? allStyleGradingPresets.find((sp) => sp.key === activeStylePreset)
              ?.profileId
          : undefined;
      const targetProf =
        forcedProfileId ||
        decision.recommended_profile ||
        "Profile_00_StandardNatural";

      const maxDim = 1024;
      let targetW = img.naturalWidth || 400;
      let targetH = img.naturalHeight || 300;
      if (targetW > maxDim || targetH > maxDim) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * maxDim) / targetW);
          targetW = maxDim;
        } else {
          targetW = Math.round((targetW * maxDim) / targetH);
          targetH = maxDim;
        }
      }

      offscreenRenderer.setImageSource(img);
      offscreenRenderer.setProfile(targetProf);
      offscreenRenderer.render(
        {
          exposure: decision.exposure_compensation ?? 0.0,
          highlights: decision.highlights ?? 0.0,
          contrast: decision.contrast ?? 0.0,
          blacks: decision.blacks ?? 0.0,
          colorTemp: decision.color_temp ?? 5500,
          tint: decision.tint ?? 0.0,
          vibrance: decision.vibrance ?? 0.0,
          shadowLift: decision.lift_shadows ?? 0.0,
          lutIntensity: decision.lut_intensity ?? 1.0,
          bypassLut: targetProf === "Profile_00_StandardNatural",
          clarity: decision.clarity ?? 0.0,
          sharpness: decision.sharpness ?? 0.0,
          colorDensity: decision.color_density ?? 0.0,
          shadowHue: decision.shadow_hue ?? 200,
          shadowTintAmount: decision.shadow_tint_amount ?? 0.0,
          highlightHue: decision.highlight_hue ?? 40,
          highlightTintAmount: decision.highlight_tint_amount ?? 0.0,
          halation: decision.halation ?? 0.0,
          grainAmount: decision.grain_amount ?? 0.15,
          vignette: decision.vignette ?? 0.0,
          monochrome: targetMonochrome,
          hsl: decision.hsl,
        },
        targetW,
        targetH,
      );

      return offscreenRenderer.exportDataUrl("image/jpeg", 0.8);
    } catch (err) {
      console.warn("[Pass1CriticRenderer] 預覽生成失敗:", err);
      return null;
    }
  }

  /**
   * 一鍵還原為相機原生拍攝參數（As Shot WB & Exposure）
   */
  function resetToAsShot() {
    if (!activePhoto) return;
    colorTemp = activePhoto.asShotTemp ?? 5500;
    tint = activePhoto.asShotTint ?? 0.0;
    exposure = activePhoto.asShotExposure ?? 0.0;
    contrast = 0.0;
    shadows = 0.0;
    lutIntensity = 1.0;
    clarity = 0.0;
    sharpness = 0.0;
    colorDensity = 0.0;
    shadowHue = 200;
    shadowTintAmount = 0.0;
    highlightHue = 40;
    highlightTintAmount = 0.0;
    halation = 0.0;
    grainAmount = 0.15;
    highlights = 0.0;
    blacks = 0.0;
    vibrance = 0.0;
    vignette = 0.0;
    monochrome = false;
    hsl = createDefaultHslAdjustments();

    darkroomState.colorTemp = colorTemp;
    darkroomState.tint = tint;
    darkroomState.exposure = exposure;
    darkroomState.highlights = highlights;
    darkroomState.contrast = contrast;
    darkroomState.shadows = shadows;
    darkroomState.blacks = blacks;
    darkroomState.vibrance = vibrance;
    darkroomState.lutIntensity = lutIntensity;
    darkroomState.clarity = clarity;
    darkroomState.sharpness = sharpness;
    darkroomState.colorDensity = colorDensity;
    darkroomState.shadowHue = shadowHue;
    darkroomState.shadowTintAmount = shadowTintAmount;
    darkroomState.highlightHue = highlightHue;
    darkroomState.highlightTintAmount = highlightTintAmount;
    darkroomState.halation = halation;
    darkroomState.grainAmount = grainAmount;
    darkroomState.vignette = vignette;
    darkroomState.monochrome = monochrome;
    darkroomState.hsl = cloneHslAdjustments(hsl);

    triggerWebglRender();
  }

  /**
   * 同步當前滑桿調色狀態至 activePhoto 與 photoPlates
   * 若所有滑桿為預設值且為標準風格，則判定為未調色 (tuning = undefined)
   * 包含 dirty check 保護，避免數值無變化時重複重建陣列造成反應式無窮迴圈
   */
  function syncActivePhotoTuning() {
    if (!activePhoto) return;

    const asShotTemp = activePhoto.asShotTemp ?? 5500;
    const asShotExp = activePhoto.asShotExposure ?? 0.0;
    const asShotTint = activePhoto.asShotTint ?? 0.0;

    const isDefaultHsl = HSL_BAND_KEYS.every(
      (k) =>
        Math.abs(hsl[k].hue) < 0.001 &&
        Math.abs(hsl[k].sat) < 0.001 &&
        Math.abs(hsl[k].lum) < 0.001,
    );

    const isDefaultTuning =
      isDefaultHsl &&
      !monochrome &&
      Math.abs(exposure - asShotExp) < 0.001 &&
      Math.abs(highlights - 0.0) < 0.001 &&
      Math.abs(contrast - 0.0) < 0.001 &&
      Math.abs(shadows - 0.0) < 0.001 &&
      Math.abs(blacks - 0.0) < 0.001 &&
      Math.abs(colorTemp - asShotTemp) < 1 &&
      Math.abs(tint - asShotTint) < 0.001 &&
      Math.abs(vibrance - 0.0) < 0.001 &&
      Math.abs(lutIntensity - 1.0) < 0.001 &&
      Math.abs(clarity - 0.0) < 0.001 &&
      Math.abs(sharpness - 0.0) < 0.001 &&
      Math.abs(colorDensity - 0.0) < 0.001 &&
      Math.abs(shadowTintAmount - 0.0) < 0.001 &&
      Math.abs(highlightTintAmount - 0.0) < 0.001 &&
      Math.abs(halation - 0.0) < 0.001 &&
      Math.abs(grainAmount - 0.15) < 0.001 &&
      Math.abs(vignette - 0.0) < 0.001;

    const targetTuning = isDefaultTuning
      ? undefined
      : {
          exposure,
          highlights,
          contrast,
          shadows,
          blacks,
          lutIntensity,
          colorTemp,
          tint,
          vibrance,
          clarity,
          sharpness,
          colorDensity,
          shadowHue,
          shadowTintAmount,
          highlightHue,
          highlightTintAmount,
          halation,
          grainAmount,
          vignette,
          monochrome,
          hsl: cloneHslAdjustments(hsl),
        };

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

    photoPlates = photoPlates.map((p) =>
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
  const isModifiedFromAi = $derived.by(() => {
    if (!activePhoto?.aiTuningSnapshot) return false;
    const snap = activePhoto.aiTuningSnapshot;
    const t = snap.tuning;
    const hslModified = HSL_BAND_KEYS.some((k) => {
      const a = darkroomState.hsl?.[k];
      const b = t.hsl?.[k];
      return (
        Math.abs((a?.hue ?? 0) - (b?.hue ?? 0)) > 0.001 ||
        Math.abs((a?.sat ?? 0) - (b?.sat ?? 0)) > 0.001 ||
        Math.abs((a?.lum ?? 0) - (b?.lum ?? 0)) > 0.001
      );
    });
    return (
      hslModified ||
      darkroomState.monochrome !== (t.monochrome ?? false) ||
      Math.abs(darkroomState.exposure - t.exposure) > 0.001 ||
      Math.abs(darkroomState.highlights - (t.highlights ?? 0.0)) > 0.001 ||
      Math.abs(darkroomState.contrast - t.contrast) > 0.001 ||
      Math.abs(darkroomState.shadows - (t.shadows ?? 0.0)) > 0.001 ||
      Math.abs(darkroomState.blacks - (t.blacks ?? 0.0)) > 0.001 ||
      Math.abs(darkroomState.colorTemp - t.colorTemp) > 1 ||
      Math.abs(darkroomState.tint - (t.tint ?? 0.0)) > 0.001 ||
      Math.abs(darkroomState.vibrance - (t.vibrance ?? 0.0)) > 0.001 ||
      Math.abs(darkroomState.lutIntensity - t.lutIntensity) > 0.001 ||
      Math.abs(darkroomState.clarity - (t.clarity ?? 0.0)) > 0.001 ||
      Math.abs(darkroomState.sharpness - (t.sharpness ?? 0.0)) > 0.001 ||
      Math.abs(darkroomState.colorDensity - (t.colorDensity ?? 0.0)) > 0.001 ||
      Math.abs(darkroomState.shadowHue - (t.shadowHue ?? 200)) > 0.5 ||
      Math.abs(darkroomState.shadowTintAmount - (t.shadowTintAmount ?? 0.0)) >
        0.001 ||
      Math.abs(darkroomState.highlightHue - (t.highlightHue ?? 40)) > 0.5 ||
      Math.abs(
        darkroomState.highlightTintAmount - (t.highlightTintAmount ?? 0.0),
      ) > 0.001 ||
      Math.abs(darkroomState.halation - (t.halation ?? 0.0)) > 0.001 ||
      Math.abs(darkroomState.grainAmount - (t.grainAmount ?? 0.15)) > 0.001 ||
      Math.abs(darkroomState.vignette - (t.vignette ?? 0.0)) > 0.001 ||
      activePhoto.appliedProfile !== snap.appliedProfile
    );
  });

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

    animateAdjustmentValues(
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

    highlights = snapshot.tuning.highlights ?? 0.0;
    darkroomState.highlights = highlights;
    blacks = snapshot.tuning.blacks ?? 0.0;
    darkroomState.blacks = blacks;
    vibrance = snapshot.tuning.vibrance ?? 0.0;
    darkroomState.vibrance = vibrance;
    clarity = snapshot.tuning.clarity ?? 0.0;
    darkroomState.clarity = clarity;
    sharpness = snapshot.tuning.sharpness ?? 0.0;
    darkroomState.sharpness = sharpness;
    colorDensity = snapshot.tuning.colorDensity ?? 0.0;
    darkroomState.colorDensity = colorDensity;
    shadowHue = snapshot.tuning.shadowHue ?? 200;
    darkroomState.shadowHue = shadowHue;
    shadowTintAmount = snapshot.tuning.shadowTintAmount ?? 0.0;
    darkroomState.shadowTintAmount = shadowTintAmount;
    highlightHue = snapshot.tuning.highlightHue ?? 40;
    darkroomState.highlightHue = highlightHue;
    highlightTintAmount = snapshot.tuning.highlightTintAmount ?? 0.0;
    darkroomState.highlightTintAmount = highlightTintAmount;
    halation = snapshot.tuning.halation ?? 0.0;
    darkroomState.halation = halation;
    grainAmount = snapshot.tuning.grainAmount ?? 0.15;
    darkroomState.grainAmount = grainAmount;
    vignette = snapshot.tuning.vignette ?? 0.0;
    darkroomState.vignette = vignette;
    monochrome = snapshot.tuning.monochrome ?? false;
    darkroomState.monochrome = monochrome;
    hsl = cloneHslAdjustments(snapshot.tuning.hsl);
    darkroomState.hsl = cloneHslAdjustments(hsl);

    if (snapshot.crop) {
      cropX = snapshot.crop.x;
      cropY = snapshot.crop.y;
      cropWidth = snapshot.crop.width;
      cropHeight = snapshot.crop.height;
      cropRotation = snapshot.crop.rotation;
      keystoneV = snapshot.crop.keystoneV ?? 0;
      keystoneH = snapshot.crop.keystoneH ?? 0;
      cropAspectRatio = snapshot.crop.aspectRatio;
      flipH = snapshot.crop.flipH;
      flipV = snapshot.crop.flipV;

      darkroomState.cropX = cropX;
      darkroomState.cropY = cropY;
      darkroomState.cropWidth = cropWidth;
      darkroomState.cropHeight = cropHeight;
      darkroomState.cropRotation = cropRotation;
      darkroomState.keystoneV = keystoneV;
      darkroomState.keystoneH = keystoneH;
      darkroomState.cropAspectRatio = cropAspectRatio;
      darkroomState.flipH = flipH;
      darkroomState.flipV = flipV;
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
    exposure = 0.0;
    contrast = 0.0;
    shadows = 0.0;
    colorTemp = 5500;
    tint = 0.0;
    lutIntensity = 1.0;
    clarity = 0.0;
    sharpness = 0.0;
    colorDensity = 0.0;
    shadowHue = 200;
    shadowTintAmount = 0.0;
    highlightHue = 40;
    highlightTintAmount = 0.0;
    halation = 0.0;
    grainAmount = 0.15;
    highlights = 0.0;
    blacks = 0.0;
    vibrance = 0.0;
    vignette = 0.0;
    monochrome = false;
    hsl = createDefaultHslAdjustments();
    darkroomState.resetTuningParams();
    darkroomState.resetCropState();
    resetCropState();

    aiCropRationale = "";
    aiSuggestedScene = "尚未分析";
    aiSceneTitle = "";
    aiStyleInsight = "";
    aiRecommendedMood = "";
    aiRecommendedProfile = "Profile_00_StandardNatural";
    aiVisionTags = [];

    if (activePhoto) {
      activePhoto.appliedProfile = "Profile_00_StandardNatural";
      activePhoto.tuning = undefined;
      activePhoto.crop = undefined;
      activePhoto.gradedThumbnail = undefined;
      activePhoto.aiDecision = undefined;
      activePhoto.aiTuningSnapshot = undefined;
      activePhoto.sceneTag = "本機相簿幀";
      photoPlates = photoPlates.map((p) =>
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

  async function loadPhotosFromItems(
    items: import("$lib/services/ingestionService").RawPhotoItem[],
    append = false,
  ) {
    if (items.length > 0) {
      if (!append) {
        // 清理前一個相卷所佔用的 Blob URL，防止記憶體洩漏
        IngestionService.revokeAllBlobUrls();
      }
      const isTauriEnv = IngestionService.isTauri();

      // 追加模式下，過濾掉已存在於目前相卷中的相片（以檔名比對）
      let itemsToLoad = items;
      if (append && photoPlates.length > 0) {
        const existingNames = new Set(photoPlates.map((p) => p.filename));
        itemsToLoad = items.filter((item) => !existingNames.has(item.filename));
        if (itemsToLoad.length === 0) {
          toastStore.show("所選相片均已在相卷中，未有新增相片", "info", 2500);
          return;
        }
      }

      const startIndex = append ? photoPlates.length : 0;
      // Step 1: Instant zero-latency initialization (< 5ms) for all frames
      const loaded: PhotoPlate[] = itemsToLoad.map((item, i) => {
        let directUrl = "";
        if (item.fileHandle) {
          if (item.extension === "jpg" || item.extension === "jpeg") {
            directUrl = IngestionService.createTrackedBlobUrl(item.fileHandle);
          }
        } else if (!isTauriEnv && item.file_path) {
          directUrl = `/api/extract-preview?path=${encodeURIComponent(item.file_path)}`;
        }
        const frameIdx = startIndex + i + 1;
        return {
          id: `photo_${frameIdx}_${Date.now()}`,
          frameNo: item.frame_no || `${String(frameIdx).padStart(2, "0")}A`,
          filename: item.filename,
          camera: `${item.extension.toUpperCase()} 底片`,
          lens: "標準光學鏡頭",
          iso: 100,
          shutter: "--",
          aperture: "--",
          focalLength: "--",
          thumbnail: directUrl,
          sceneTag: "本機相簿幀",
          selected: !append && i === 0,
          appliedProfile: "Profile_00_StandardNatural",
          fileHandle: item.fileHandle,
          filePath: item.file_path,
        };
      });

      if (append) {
        photoPlates = [...photoPlates, ...loaded];
        if (!activePhoto && photoPlates.length > 0) {
          activePhoto = photoPlates[0];
          photoPlates[0].selected = true;
        }
        photoLibrary.photoPlates = photoPlates as any;
        toastStore.show(
          `已成功追加 ${loaded.length} 幀底片 ✓`,
          "success",
          2500,
        );
      } else {
        const restoredCount = SessionService.restoreSession(
          currentDirectoryName,
          loaded,
        );
        photoPlates = loaded;
        activePhoto = loaded[0];
        photoLibrary.photoPlates = loaded as any;
        photoLibrary.activePhoto = loaded[0] as any;
        activeTab = "catalog"; // Switch to catalog grid view immediately
        if (restoredCount > 0) {
          toastStore.show(
            `已自動恢復 ${restoredCount} 幀底片的挑圖與調色進度 ✓`,
            "info",
            3500,
          );
        }
      }

      // Step 2: Progressive enhancement for EXIF and thumbnails with controlled concurrency worker pool
      // Limits simultaneous I/O to avoid blocking system or network FUSE pipelines while keeping UI responsive
      const currentToken = ++photoLoadToken;
      const CONCURRENCY = 3;
      let nextIndex = 0;

      const runWorker = async () => {
        while (nextIndex < itemsToLoad.length) {
          if (currentToken !== photoLoadToken) return;
          const i = nextIndex++;
          const item = itemsToLoad[i];
          const plateIndex = startIndex + i;
          if (
            !photoPlates[plateIndex]?.thumbnail ||
            isTauriEnv ||
            item.fileHandle
          ) {
            try {
              const preview = await IngestionService.extractPreview(
                item.file_path,
                item.fileHandle,
              );
              if (currentToken !== photoLoadToken) return;
              if (photoPlates[plateIndex]) {
                if (preview.blob_url || preview.jpeg_base64) {
                  photoPlates[plateIndex].thumbnail =
                    preview.blob_url ||
                    `data:image/jpeg;base64,${preview.jpeg_base64}`;
                  if (
                    photoPlates[plateIndex].appliedProfile &&
                    photoPlates[plateIndex].appliedProfile !==
                      "Profile_00_StandardNatural"
                  ) {
                    enqueueThumbnailRender(photoPlates[plateIndex]);
                  }
                }
                photoPlates[plateIndex].camera =
                  preview.exif.camera_model || photoPlates[plateIndex].camera;
                photoPlates[plateIndex].lens =
                  preview.exif.lens_model || photoPlates[plateIndex].lens;
                photoPlates[plateIndex].iso =
                  preview.exif.iso || photoPlates[plateIndex].iso;
                photoPlates[plateIndex].shutter =
                  preview.exif.shutter_speed || photoPlates[plateIndex].shutter;
                photoPlates[plateIndex].aperture =
                  preview.exif.aperture || photoPlates[plateIndex].aperture;
                photoPlates[plateIndex].focalLength =
                  preview.exif.focal_length ||
                  photoPlates[plateIndex].focalLength;
                photoPlates[plateIndex].exposureBias =
                  preview.exif.exposure_bias ?? 0.0;
                photoPlates[plateIndex].exposureProgram =
                  preview.exif.exposure_program || "標準自動";
                photoPlates[plateIndex].meteringMode =
                  preview.exif.metering_mode || "多重測光";
                photoPlates[plateIndex].colorSpace =
                  preview.exif.color_space || "sRGB";
                photoPlates[plateIndex].flash = preview.exif.flash || "未擊發";
                photoPlates[plateIndex].asShotTemp =
                  preview.exif.color_temp ?? 5500;
                photoPlates[plateIndex].asShotTint = preview.exif.tint ?? 0;
                photoPlates[plateIndex].asShotExposure =
                  preview.exif.exposure_bias ?? 0.0;
                latestExtractionMs = preview.extraction_time_ms || 18;

                // 若剛好是當前活躍檢視相片，且尚未調整過，立即同步載入相機拍攝原值
                if (
                  activePhoto &&
                  activePhoto.id === photoPlates[plateIndex].id &&
                  !activePhoto.tuning
                ) {
                  activePhoto = { ...photoPlates[plateIndex] };
                  colorTemp = photoPlates[plateIndex].asShotTemp ?? 5500;
                  tint = photoPlates[plateIndex].asShotTint ?? 0.0;
                  exposure = photoPlates[plateIndex].asShotExposure ?? 0.0;
                }
              }
            } catch (err) {
              console.warn(`[+page] 解析相片預覽失敗 (${item.filename}):`, err);
            }
          }
        }
      };

      const workerCount = Math.min(itemsToLoad.length, CONCURRENCY);
      for (let w = 0; w < workerCount; w++) {
        runWorker();
      }
    }
  }

  // ── 相片工作區排除與復原機制 (Photo Workspace Removal & Undo) ──
  interface RemovedPhotoItemSnapshot {
    photo: PhotoPlate;
    originalIndex: number; // 記錄排除前在相卷中的原始索引位置
  }
  interface RemovedPhotosSnapshot {
    items: RemovedPhotoItemSnapshot[];
    prevActiveId: string | null;
  }
  let lastRemovedSnapshot = $state<RemovedPhotosSnapshot | null>(null);

  async function handleDeletePhotoFromDisk(photo: PhotoPlate) {
    await handleBatchDeletePhotosFromDisk([photo]);
  }

  async function handleBatchDeletePhotosFromDisk(photos: PhotoPlate[]) {
    if (!photos || photos.length === 0) return;

    const count = photos.length;
    const names =
      photos
        .slice(0, 3)
        .map((p) => p.filename)
        .join("、") + (count > 3 ? ` 等共 ${count} 幀` : "");

    let confirmed = false;
    if (IngestionService.isTauri()) {
      try {
        const { confirm } = await import("@tauri-apps/plugin-dialog");
        confirmed = await confirm(
          `確定要將以下底片自電腦磁碟刪除（移至資源回收筒 / 廢紙簍）嗎？\n\n${names}\n\n此操作將從磁碟移除檔案！`,
          {
            title: "磁碟實體刪除確認",
            kind: "warning",
            okLabel: "移至回收筒",
            cancelLabel: "取消",
          },
        );
      } catch (err) {
        console.warn(
          "Tauri confirm dialog failed, fallback to window.confirm:",
          err,
        );
        confirmed = window.confirm(
          `⚠️ 【磁碟實體刪除確認】\n\n確定要將以下底片自電腦磁碟刪除（移至資源回收筒 / 廢紙簍）嗎？\n\n${names}\n\n此操作將從磁碟移除檔案！`,
        );
      }
    } else {
      confirmed = window.confirm(
        `⚠️ 【磁碟實體刪除確認】\n\n確定要將以下底片自電腦磁碟刪除（移至資源回收筒 / 廢紙簍）嗎？\n\n${names}\n\n此操作將從磁碟移除檔案！`,
      );
    }
    if (!confirmed) return;

    let deletedCount = 0;
    let failedCount = 0;

    for (const p of photos) {
      if (p.filePath) {
        try {
          await IngestionService.deleteDiskFile(p.filePath);
          deletedCount++;
        } catch (err) {
          console.error(`刪除磁碟檔案失敗 (${p.filePath}):`, err);
          failedCount++;
        }
      } else {
        failedCount++;
      }
    }

    // 磁碟刪除成功後，直接自相卷清單移除（切勿呼叫 handleBatchRemovePhotos，以避免產生復原棧與排除提示）
    const idSet = new Set(photos.map((p) => p.id));
    let nextActive: PhotoPlate | null = activePhoto;
    if (activePhoto && idSet.has(activePhoto.id)) {
      const remaining = photoPlates.filter((p) => !idSet.has(p.id));
      if (remaining.length > 0) {
        const curIndex = photoPlates.findIndex((p) => p.id === activePhoto!.id);
        const nextIndex = Math.min(curIndex, remaining.length - 1);
        nextActive = remaining[Math.max(0, nextIndex)];
        nextActive.selected = true;
      } else {
        nextActive = null;
      }
    }
    photoPlates = photoPlates.filter((p) => !idSet.has(p.id));
    activePhoto = nextActive;
    photoLibrary.photoPlates = photoPlates as any;
    photoLibrary.activePhoto = activePhoto as any;

    if (deletedCount > 0) {
      toastStore.show(
        `已將 ${deletedCount} 幀底片移入資源回收筒 / 廢紙簍 🗑️`,
        "success",
        3500,
      );
    }
    if (failedCount > 0) {
      toastStore.show(
        `${failedCount} 幀底片無實體磁碟路徑或刪除失敗`,
        "error",
        4000,
      );
    }
  }

  function handleRemovePhoto(photoId: string) {
    handleBatchRemovePhotos([photoId]);
  }

  function handleBatchRemovePhotos(photoIds: string[]) {
    if (!photoIds || photoIds.length === 0) return;
    const idSet = new Set(photoIds);

    // 依序記錄被排除相片及其原始索引位置，以便復原時精準插回原序
    const toRemoveWithIndex: RemovedPhotoItemSnapshot[] = [];
    photoPlates.forEach((p, idx) => {
      if (idSet.has(p.id)) {
        toRemoveWithIndex.push({ photo: p, originalIndex: idx });
      }
    });
    if (toRemoveWithIndex.length === 0) return;

    lastRemovedSnapshot = {
      items: toRemoveWithIndex,
      prevActiveId: activePhoto?.id || null,
    };

    // 若作用中相片被移除，自動聚焦至下一張相鄰底片
    let nextActive: PhotoPlate | null = activePhoto;
    if (activePhoto && idSet.has(activePhoto.id)) {
      const remaining = photoPlates.filter((p) => !idSet.has(p.id));
      if (remaining.length > 0) {
        const curIndex = photoPlates.findIndex((p) => p.id === activePhoto!.id);
        const nextIndex = Math.min(curIndex, remaining.length - 1);
        nextActive = remaining[Math.max(0, nextIndex)];
        nextActive.selected = true;
      } else {
        nextActive = null;
      }
    }

    photoPlates = photoPlates.filter((p) => !idSet.has(p.id));
    activePhoto = nextActive;
    photoLibrary.photoPlates = photoPlates as any;
    photoLibrary.activePhoto = activePhoto as any;

    toastStore.show(
      `已自相卷排除 ${toRemoveWithIndex.length} 幀底片`,
      "info",
      5000,
      {
        label: "復原 ↺",
        onClick: () => handleUndoRemove(),
      },
    );
  }

  function handleUndoRemove() {
    if (!lastRemovedSnapshot || lastRemovedSnapshot.items.length === 0) return;
    const restoredItems = lastRemovedSnapshot.items;

    // 依原始索引升冪排序，並依序精準插回相卷原始位置（保持載入順序不變）
    const nextPlates = [...photoPlates];
    const sorted = [...restoredItems].sort(
      (a, b) => a.originalIndex - b.originalIndex,
    );
    for (const item of sorted) {
      const insertAt = Math.min(
        Math.max(0, item.originalIndex),
        nextPlates.length,
      );
      nextPlates.splice(insertAt, 0, item.photo);
    }

    photoPlates = nextPlates;
    photoLibrary.photoPlates = photoPlates as any;

    if (lastRemovedSnapshot.prevActiveId) {
      const found = photoPlates.find(
        (p) => p.id === lastRemovedSnapshot!.prevActiveId,
      );
      if (found) {
        activePhoto = found;
        found.selected = true;
        photoLibrary.activePhoto = found as any;
      }
    }

    toastStore.show(
      `已原位復原 ${restoredItems.length} 幀底片 ✓`,
      "success",
      2500,
    );
    lastRemovedSnapshot = null;
  }

  // Ingestion 反饋通知輔助函式：讓使用者清楚了解載入結果或未支援原因
  function notifyIngestionResult(
    loadedCount: number,
    actionName: string = "相片",
  ) {
    const summary = IngestionService.lastSummary;
    const skipped = summary?.skippedCount || 0;
    const skippedExts = summary?.skippedExtensions || [];
    const extsText =
      skippedExts.length > 0
        ? `（如 ${skippedExts
            .slice(0, 3)
            .map((e) => "." + e.toUpperCase())
            .join(", ")}${skippedExts.length > 3 ? " 等" : ""}）`
        : "";

    if (loadedCount > 0) {
      if (skipped > 0) {
        toastStore.show(
          `已成功載入 ${loadedCount} 幀底片（已略過 ${skipped} 個不支援或非影像檔案${extsText}）`,
          "info",
          4000,
        );
      } else {
        toastStore.show(`已成功載入 ${loadedCount} 幀底片 ✓`, "success", 2500);
      }
    } else {
      // 未讀到任何相片
      if (skipped > 0) {
        toastStore.show(
          `未在此${actionName}中找到支援的底片格式（已略過 ${skipped} 個不相容檔案${extsText}）。支援各大廠相機 RAW 及主流影像。`,
          "warning",
          5000,
        );
      } else {
        toastStore.show(
          `未找到相片檔案。請確認目錄或檔案是否包含支援的相機 RAW 或影像。`,
          "warning",
          4000,
        );
      }
    }
  }

  // Open directory and load real photos (Replace)
  async function handlePickDirectory() {
    isLoadingPhotos = true;
    try {
      const items = await IngestionService.pickWebDirectory();
      if (items.length > 0) {
        currentDirectoryName =
          IngestionService.currentDirectoryName || "相片資料夾";
        await loadPhotosFromItems(items, false);
      }
      notifyIngestionResult(items.length, "目錄");
    } finally {
      isLoadingPhotos = false;
    }
  }

  // Append directory to existing catalog
  async function handleAppendDirectory() {
    isLoadingPhotos = true;
    try {
      const items = await IngestionService.pickWebDirectory();
      if (items.length > 0) {
        await loadPhotosFromItems(items, true);
      }
      notifyIngestionResult(items.length, "目錄");
    } finally {
      isLoadingPhotos = false;
    }
  }

  // Append individual files to existing catalog
  async function handleAppendFiles() {
    isLoadingPhotos = true;
    try {
      const items = await IngestionService.pickWebFiles();
      if (items.length > 0) {
        await loadPhotosFromItems(items, true);
      }
      notifyIngestionResult(items.length, "選取項目");
    } finally {
      isLoadingPhotos = false;
    }
  }

  // Load directory directly by path (from recent directories list)
  async function handleLoadDirectoryByPath(path: string) {
    if (!path) return;
    isLoadingPhotos = true;
    try {
      const items = await IngestionService.scanDirectory(path);
      if (items.length > 0) {
        currentDirectoryName =
          IngestionService.currentDirectoryName || "相片資料夾";
        await loadPhotosFromItems(items, false);
      }
      notifyIngestionResult(items.length, "目錄");
    } finally {
      isLoadingPhotos = false;
    }
  }

  // Handle Drag & Drop files or directories from OS Desktop / Explorer
  async function handleFilesDropped(dataTransfer: DataTransfer) {
    isLoadingPhotos = true;
    try {
      const items = await IngestionService.processDataTransfer(dataTransfer);
      if (items.length > 0) {
        currentDirectoryName =
          IngestionService.currentDirectoryName || "拖放相片集";
        await loadPhotosFromItems(items);
      }
      notifyIngestionResult(items.length, "拖放內容");
    } catch (err) {
      console.warn("Drag and drop ingestion failed:", err);
      toastStore.show("載入相片失敗，請重試", "error", 3000);
    } finally {
      isLoadingPhotos = false;
    }
  }

  // Load photos directly from camera mount
  async function handleLoadCameraMount(mount: CameraMountInfo) {
    const targetPath = mount.dcim_path || mount.mount_path;
    isLoadingPhotos = true;
    try {
      const items = await IngestionService.scanDirectory(targetPath);
      if (items.length > 0) {
        currentDirectoryName =
          mount.volume_name ||
          IngestionService.currentDirectoryName ||
          "相機外接裝置";
        await loadPhotosFromItems(items);
      }
      notifyIngestionResult(items.length, "相機裝置");
    } finally {
      isLoadingPhotos = false;
    }
  }

  // 智慧處理：頂部全域目錄與相機切換
  async function handleSelectMountOrDirectory() {
    if (cameraMounts.length > 0) {
      const camera = cameraMounts[0];
      if (photoPlates.length > 0) {
        const confirmLoad = window.confirm(
          `【偵測到外接相機連線】\n相機名稱：${camera.volume_name}\n可載入底片：${camera.file_count} 幀 RAW\n\n點擊「確定」載入此相機相卷\n點擊「取消」瀏覽挑選其他本機目錄`,
        );
        if (confirmLoad) {
          await handleLoadCameraMount(camera);
          return;
        } else {
          await handlePickDirectory();
          return;
        }
      } else {
        await handleLoadCameraMount(camera);
        return;
      }
    }
    await handlePickDirectory();
  }

  // AI Adjustment Slider Organic Tween Animation (AI 手動推拉滑桿感)
  function animateAdjustmentValues(
    target: {
      exposure?: number;
      highlights?: number;
      contrast?: number;
      shadows?: number;
      blacks?: number;
      lutIntensity?: number;
      colorTemp?: number;
      tint?: number;
      vibrance?: number;
      clarity?: number;
      sharpness?: number;
      colorDensity?: number;
      shadowHue?: number;
      shadowTintAmount?: number;
      highlightHue?: number;
      highlightTintAmount?: number;
      halation?: number;
      grainAmount?: number;
      vignette?: number;
      hsl?: HslAdjustments;
    },
    durationMs = 650,
  ) {
    const startExposure = exposure;
    const startHighlights = highlights;
    const startContrast = contrast;
    const startShadows = shadows;
    const startBlacks = blacks;
    const startLutIntensity = lutIntensity;
    const startColorTemp = colorTemp;
    const startTint = tint;
    const startVibrance = vibrance;
    const startClarity = clarity;
    const startSharpness = sharpness;
    const startColorDensity = colorDensity;
    const startShadowHue = shadowHue;
    const startShadowTintAmount = shadowTintAmount;
    const startHighlightHue = highlightHue;
    const startHighlightTintAmount = highlightTintAmount;
    const startHalation = halation;
    const startGrainAmount = grainAmount;
    const startVignette = vignette;

    const targetExposure = target.exposure ?? startExposure;
    const targetHighlights = target.highlights ?? startHighlights;
    const targetContrast = target.contrast ?? startContrast;
    const targetShadows = target.shadows ?? startShadows;
    const targetBlacks = target.blacks ?? startBlacks;
    const targetLutIntensity = target.lutIntensity ?? startLutIntensity;
    const targetColorTemp = target.colorTemp ?? startColorTemp;
    const targetTint = target.tint ?? startTint;
    const targetVibrance = target.vibrance ?? startVibrance;
    const targetClarity = target.clarity ?? startClarity;
    const targetSharpness = target.sharpness ?? startSharpness;
    const targetColorDensity = target.colorDensity ?? startColorDensity;
    const targetShadowHue = target.shadowHue ?? startShadowHue;
    const targetShadowTintAmount =
      target.shadowTintAmount ?? startShadowTintAmount;
    const targetHighlightHue = target.highlightHue ?? startHighlightHue;
    const targetHighlightTintAmount =
      target.highlightTintAmount ?? startHighlightTintAmount;
    const targetHalation = target.halation ?? startHalation;
    const targetGrainAmount = target.grainAmount ?? startGrainAmount;
    const targetVignette = target.vignette ?? startVignette;

    if (target.hsl) {
      hsl = cloneHslAdjustments(target.hsl);
      darkroomState.hsl = cloneHslAdjustments(target.hsl);
    }

    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1.0);
      // Ease-out cubic for realistic organic dial resistance
      const ease = 1 - Math.pow(1 - progress, 3);

      exposure = parseFloat(
        (startExposure + (targetExposure - startExposure) * ease).toFixed(2),
      );
      highlights = parseFloat(
        (startHighlights + (targetHighlights - startHighlights) * ease).toFixed(
          2,
        ),
      );
      contrast = parseFloat(
        (startContrast + (targetContrast - startContrast) * ease).toFixed(2),
      );
      shadows = parseFloat(
        (startShadows + (targetShadows - startShadows) * ease).toFixed(2),
      );
      blacks = parseFloat(
        (startBlacks + (targetBlacks - startBlacks) * ease).toFixed(2),
      );
      lutIntensity = parseFloat(
        (
          startLutIntensity +
          (targetLutIntensity - startLutIntensity) * ease
        ).toFixed(2),
      );
      colorTemp = Math.round(
        startColorTemp + (targetColorTemp - startColorTemp) * ease,
      );
      tint = parseFloat(
        (startTint + (targetTint - startTint) * ease).toFixed(1),
      );
      vibrance = parseFloat(
        (startVibrance + (targetVibrance - startVibrance) * ease).toFixed(2),
      );
      clarity = parseFloat(
        (startClarity + (targetClarity - startClarity) * ease).toFixed(2),
      );
      sharpness = parseFloat(
        (startSharpness + (targetSharpness - startSharpness) * ease).toFixed(2),
      );
      colorDensity = parseFloat(
        (
          startColorDensity +
          (targetColorDensity - startColorDensity) * ease
        ).toFixed(2),
      );
      shadowHue = Math.round(
        startShadowHue + (targetShadowHue - startShadowHue) * ease,
      );
      shadowTintAmount = parseFloat(
        (
          startShadowTintAmount +
          (targetShadowTintAmount - startShadowTintAmount) * ease
        ).toFixed(2),
      );
      highlightHue = Math.round(
        startHighlightHue + (targetHighlightHue - startHighlightHue) * ease,
      );
      highlightTintAmount = parseFloat(
        (
          startHighlightTintAmount +
          (targetHighlightTintAmount - startHighlightTintAmount) * ease
        ).toFixed(2),
      );
      halation = parseFloat(
        (startHalation + (targetHalation - startHalation) * ease).toFixed(2),
      );
      grainAmount = parseFloat(
        (
          startGrainAmount +
          (targetGrainAmount - startGrainAmount) * ease
        ).toFixed(2),
      );
      vignette = parseFloat(
        (startVignette + (targetVignette - startVignette) * ease).toFixed(2),
      );

      // 同步動態調色至 darkroomState 以流暢驅動右側面板滑桿與 WebGL 著色
      darkroomState.exposure = exposure;
      darkroomState.highlights = highlights;
      darkroomState.contrast = contrast;
      darkroomState.shadows = shadows;
      darkroomState.blacks = blacks;
      darkroomState.lutIntensity = lutIntensity;
      darkroomState.colorTemp = colorTemp;
      darkroomState.tint = tint;
      darkroomState.vibrance = vibrance;
      darkroomState.clarity = clarity;
      darkroomState.sharpness = sharpness;
      darkroomState.colorDensity = colorDensity;
      darkroomState.shadowHue = shadowHue;
      darkroomState.shadowTintAmount = shadowTintAmount;
      darkroomState.highlightHue = highlightHue;
      darkroomState.highlightTintAmount = highlightTintAmount;
      darkroomState.halation = halation;
      darkroomState.grainAmount = grainAmount;
      darkroomState.vignette = vignette;

      if (progress < 1.0) {
        requestAnimationFrame(step);
      } else {
        if (activePhoto) {
          activePhoto.tuning = {
            exposure,
            highlights,
            contrast,
            shadows,
            blacks,
            lutIntensity,
            colorTemp,
            tint,
            vibrance,
            clarity,
            sharpness,
            colorDensity,
            shadowHue,
            shadowTintAmount,
            highlightHue,
            highlightTintAmount,
            halation,
            grainAmount,
            vignette,
            monochrome,
            hsl: cloneHslAdjustments(hsl),
          };
          photoPlates = photoPlates.map((p) =>
            p.id === activePhoto!.id
              ? { ...p, tuning: activePhoto!.tuning }
              : p,
          );
        }
      }
    }
    requestAnimationFrame(step);
  }

  let terminalBodyElement = $state<HTMLDivElement | null>(null);
  let copiedLogNotice = $state<boolean>(false);

  async function copyTerminalLogs() {
    if (aiTerminalLogs.length === 0) return;
    const fullLog = aiTerminalLogs.join("\n");
    try {
      await navigator.clipboard.writeText(fullLog);
      copiedLogNotice = true;
      setTimeout(() => {
        copiedLogNotice = false;
      }, 2000);
    } catch {
      // pass
    }
  }

  async function appendAiLog(msg: string, delayMs = 50) {
    aiTerminalLogs = [...aiTerminalLogs.slice(-35), msg];
    aiPipeline.aiTerminalLogs = aiTerminalLogs;
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => {
        if (terminalBodyElement) {
          terminalBodyElement.scrollTop = terminalBodyElement.scrollHeight;
        }
      });
    }
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Authentic AI Scene Analysis & Organic Parameter Tuning
  // 支援單幀互動模式（含滑桿動畫與畫布更新）與高速批次背景顯影（純資料更新，零主執行緒凍結）
  async function runAiAnalysis(targetPhoto?: PhotoPlate): Promise<boolean> {
    const photoToProcess = targetPhoto || activePhoto;
    if (!photoToProcess) {
      exportNotice = "請先載入相片以進行 AI 顯影調色";
      setTimeout(() => {
        exportNotice = "";
      }, 2500);
      return false;
    }

    const isCurrentActive = activePhoto && activePhoto.id === photoToProcess.id;

    // 僅在非批次模式且相片不同時，才切換全局焦點相片
    if (!isBatchAiRunning && !isCurrentActive) {
      selectPhoto(photoToProcess);
    }

    if (!hasActiveApiKey()) {
      isKeyPromptModalOpen = true;
      return false;
    }

    isAiAnalyzing = true;
    if (!isBatchAiRunning) {
      aiTerminalLogs = [];
    }
    await appendAiLog(
      `> [OPTICAL_SCAN] 掃描 ${photoToProcess.filename} 影格光學數據...`,
      20,
    );
    await appendAiLog(
      `> [EXIF] ISO ${photoToProcess.iso} · ${photoToProcess.aperture} · ${photoToProcess.shutter} · ${photoToProcess.focalLength}`,
      20,
    );
    const activeModelInfo = AiSceneService.getActiveModelInfo();
    await appendAiLog(
      `> [STREAM] 傳輸 1024px 縮圖至 ${activeModelInfo.provider === "gemini" ? "Google Gemini" : "Groq Vision"} (${activeModelInfo.modelId})...`,
      40,
    );
    const activeDirectives = darkroomState.getActiveDirectives();
    const userPrompt = darkroomState.customStylePrompt.trim();
    const combinedPromptParts = [...activeDirectives];
    if (userPrompt) {
      combinedPromptParts.push(userPrompt);
    }
    const finalStylePrompt = combinedPromptParts.join("; ");

    if (darkroomState.selectedStyleKeywords.length > 0 || userPrompt) {
      const kwLabels = darkroomState.selectedStyleKeywords
        .map(
          (id) =>
            STYLE_KEYWORD_ENTRIES.find((k) => k.id === id)?.shortTag || id,
        )
        .concat(userPrompt ? [userPrompt] : []);
      await appendAiLog(
        `> [STYLE_PROMPT] 注入調色關鍵字：${kwLabels.join(" + ")}`,
        20,
      );
    }

    const targetMonochrome =
      isCurrentActive || !isBatchAiRunning
        ? darkroomState.monochrome
        : (photoToProcess.tuning?.monochrome ?? false);

    try {
      const decision = await AiSceneService.analyzeScene(
        photoToProcess.thumbnail,
        {
          cameraModel: photoToProcess.camera,
          lensModel: photoToProcess.lens,
          iso: photoToProcess.iso,
          shutterSpeed: photoToProcess.shutter,
          apertureValue: photoToProcess.aperture,
          focalLength: photoToProcess.focalLength,
        },
        {
          signal: batchAbortController?.signal,
          stylePreset: activeStylePreset,
          styleKeywords: darkroomState.selectedStyleKeywords,
          customStylePrompt: finalStylePrompt || undefined,
          customLuts: userCustomLuts,
          monochrome: targetMonochrome,
          onLog: async (msg: string) => {
            await appendAiLog(msg, 15);
          },
          renderPreview: (src, dec) =>
            renderPass1PreviewForCritic(src, dec, targetMonochrome),
          scope: aiScope,
        },
      );

      // 使用者指定風格（非自動配對）時，強制套用對應 3D LUT，並確保足夠的 LUT 強度
      const forcedProfileId =
        activeStylePreset !== "auto"
          ? allStyleGradingPresets.find((sp) => sp.key === activeStylePreset)
              ?.profileId
          : undefined;
      if (forcedProfileId) {
        decision.recommended_profile = forcedProfileId;
      }
      const applyLut = aiScope.lutProfile || !!forcedProfileId;

      // 若為焦點相片或單幀模式，同步頂部與面板 AI 決策狀態
      if (isCurrentActive || !isBatchAiRunning) {
        aiSuggestedScene = `${decision.scene_type} (視覺即時判讀)`;
        aiSceneTitle = decision.scene_title || decision.scene_type;
        aiStyleInsight = decision.style_insight || "";
        aiRecommendedMood = decision.recommended_mood || "";
        aiRecommendedProfile = decision.recommended_profile;
        aiCropRationale = decision.crop_rationale || "";
        aiVisionTags = decision.tags || [];

        // 若有視覺標籤，自動預熱 Groq 文案生成（秒回體驗）
        if (aiVisionTags.length > 0 && !isBatchAiRunning) {
          triggerGroqCopywriting();
        }
      }

      await appendAiLog(`> [AUTOTUNE] 依據 AI 職責勾選開始套用參數...`, 20);

      // 計算目標參數值
      const foundProfile = profiles.find(
        (pr) => pr.id === decision.recommended_profile,
      );
      const targetProfile = applyLut
        ? decision.recommended_profile
        : photoToProcess.appliedProfile;

      const baseEv = aiScope.tone
        ? decision.exposure_compensation
        : (photoToProcess.tuning?.exposure ??
          (foundProfile
            ? foundProfile.evDefault
            : (photoToProcess.asShotExposure ?? 0.0)));
      const baseContrast = aiScope.tone
        ? (decision.contrast ?? 0.0)
        : (photoToProcess.tuning?.contrast ?? 0.0);
      const baseShadows = aiScope.tone
        ? (decision.lift_shadows ?? 0.0)
        : (photoToProcess.tuning?.shadows ??
          (foundProfile ? (foundProfile.shadowsDefault ?? 0.0) : 0.0));
      const baseTemp = aiScope.whiteBalance
        ? (decision.color_temp ?? 5500)
        : (photoToProcess.tuning?.colorTemp ??
          photoToProcess.asShotTemp ??
          5500);
      const baseTint = aiScope.whiteBalance
        ? (decision.tint ?? 0.0)
        : (photoToProcess.tuning?.tint ?? photoToProcess.asShotTint ?? 0.0);
      const baseLut = applyLut
        ? decision.lut_intensity
        : (photoToProcess.tuning?.lutIntensity ??
          (foundProfile ? foundProfile.lutIntensityDefault : 1.0));
      const baseClarity = aiScope.tone
        ? (decision.clarity ?? 0.0)
        : (photoToProcess.tuning?.clarity ?? 0.0);
      const baseSharpness = aiScope.tone
        ? (decision.sharpness ?? 0.0)
        : (photoToProcess.tuning?.sharpness ?? 0.0);
      const applyFilmPhysics = aiScope.filmPhysics !== false;
      const baseColorDensity = applyFilmPhysics
        ? (decision.color_density ?? 0.0)
        : (photoToProcess.tuning?.colorDensity ?? 0.0);
      const baseShadowHue = applyFilmPhysics
        ? (decision.shadow_hue ?? 200)
        : (photoToProcess.tuning?.shadowHue ?? 200);
      const baseShadowTintAmount = applyFilmPhysics
        ? (decision.shadow_tint_amount ?? 0.0)
        : (photoToProcess.tuning?.shadowTintAmount ?? 0.0);
      const baseHighlightHue = applyFilmPhysics
        ? (decision.highlight_hue ?? 40)
        : (photoToProcess.tuning?.highlightHue ?? 40);
      const baseHighlightTintAmount = applyFilmPhysics
        ? (decision.highlight_tint_amount ?? 0.0)
        : (photoToProcess.tuning?.highlightTintAmount ?? 0.0);
      const baseHalation = applyFilmPhysics
        ? (decision.halation ?? 0.0)
        : (photoToProcess.tuning?.halation ?? 0.0);
      const baseGrainAmount = applyFilmPhysics
        ? (decision.grain_amount ?? 0.15)
        : (photoToProcess.tuning?.grainAmount ?? 0.15);
      const baseHighlights = aiScope.tone
        ? (decision.highlights ?? 0.0)
        : (photoToProcess.tuning?.highlights ?? 0.0);
      const baseBlacks = aiScope.tone
        ? (decision.blacks ?? 0.0)
        : (photoToProcess.tuning?.blacks ?? 0.0);
      const baseVibrance = applyFilmPhysics
        ? (decision.vibrance ?? 0.0)
        : (photoToProcess.tuning?.vibrance ?? 0.0);
      const baseVignette = applyFilmPhysics
        ? (decision.vignette ?? 0.0)
        : (photoToProcess.tuning?.vignette ?? 0.0);
      const baseHsl = applyFilmPhysics
        ? cloneHslAdjustments(decision.hsl)
        : cloneHslAdjustments(photoToProcess.tuning?.hsl);
      // 黑白模式完全由使用者獨立切換，AI 僅調光影與 6 段光學濾鏡權重，不擅自更改輸出模式
      const baseMonochrome = targetMonochrome;

      const origEv =
        photoToProcess.tuning?.exposure ?? photoToProcess.asShotExposure ?? 0.0;
      const origContrast = photoToProcess.tuning?.contrast ?? 0.0;
      const origShadows =
        photoToProcess.tuning?.shadows ??
        (foundProfile ? (foundProfile.shadowsDefault ?? 0.0) : 0.0);
      const origClarity = photoToProcess.tuning?.clarity ?? 0.0;
      const origSharpness = photoToProcess.tuning?.sharpness ?? 0.0;
      const origTemp =
        photoToProcess.tuning?.colorTemp ?? photoToProcess.asShotTemp ?? 5500;
      const origTint =
        photoToProcess.tuning?.tint ?? photoToProcess.asShotTint ?? 0.0;
      const origLut =
        photoToProcess.tuning?.lutIntensity ??
        (foundProfile ? foundProfile.lutIntensityDefault : 1.0);

      const fmt = (v: number, unit = "", sign = true, decimals = 2) => {
        const s = sign && v > 0 ? "+" : "";
        return `${s}${v.toFixed(decimals)}${unit}`;
      };

      if (aiScope.whiteBalance) {
        await appendAiLog(
          `> [AI_WB] 白平衡調校：\n  • 色溫: ${origTemp}K → ${baseTemp}K\n  • 色調 (Tint): ${fmt(origTint, "", true, 1)} → ${fmt(baseTint, "", true, 1)}`,
          15,
        );
      }
      if (aiScope.tone) {
        await appendAiLog(
          `> [AI_TONE] 光影與動態調校：\n  • 曝光補償: ${fmt(origEv, " EV")} → ${fmt(baseEv, " EV")} | 高光抑揚: ${fmt(baseHighlights)}\n  • 對比度: ${fmt(origContrast)} → ${fmt(baseContrast)} | 暗部: ${fmt(origShadows)} → ${fmt(baseShadows)} | 黑階: ${fmt(baseBlacks)}\n  • 清晰度: ${fmt(origClarity)} → ${fmt(baseClarity)} | 銳利度: ${fmt(origSharpness)} → ${fmt(baseSharpness)}`,
          15,
        );
      }
      if (applyLut) {
        await appendAiLog(
          `> [AI_LUT] 底片風格套用：${targetProfile} (濃度: ${origLut.toFixed(2)} → ${baseLut.toFixed(2)})`,
          15,
        );
      }
      if (applyFilmPhysics) {
        await appendAiLog(
          `> [AI_TONING] 分區調色與底片質感：\n  • 自然飽和度: ${fmt(baseVibrance)} | 減色密度: ${fmt(baseColorDensity)} | 暗角: ${fmt(baseVignette)} | Halation: ${baseHalation.toFixed(2)} | 微粒: ${baseGrainAmount.toFixed(2)}\n  • 分區色調: 暗部 ${Math.round(baseShadowHue)}° (${baseShadowTintAmount.toFixed(2)}) | 亮部 ${Math.round(baseHighlightHue)}° (${baseHighlightTintAmount.toFixed(2)})`,
          15,
        );
      }

      // 構圖與智慧裁切計算
      let targetCrop = photoToProcess.crop;
      // AI 回傳整幅畫面 (或缺漏時的預設值) 代表構圖已佳、無需裁切，不可誤報為「已套用」
      const isFullFrameCrop = (b: number[]) =>
        b[0] <= 0.01 && b[1] <= 0.01 && b[2] >= 0.99 && b[3] >= 0.99;
      if (
        aiScope.crop &&
        (!decision.crop_box || isFullFrameCrop(decision.crop_box))
      ) {
        await appendAiLog(
          `> [AI_CROP] AI 判斷構圖已佳，未進行裁切（保留原始構圖）`,
          15,
        );
      }
      if (
        aiScope.crop &&
        decision.crop_box &&
        !isFullFrameCrop(decision.crop_box)
      ) {
        targetCrop = {
          x: decision.crop_box[1],
          y: decision.crop_box[0],
          width: decision.crop_box[3] - decision.crop_box[1],
          height: decision.crop_box[2] - decision.crop_box[0],
          rotation:
            aiScope.keystone && typeof decision.rotation_deg === "number"
              ? decision.rotation_deg
              : (photoToProcess.crop?.rotation ?? 0),
          keystoneV:
            aiScope.keystone && typeof decision.keystone_v === "number"
              ? decision.keystone_v
              : (photoToProcess.crop?.keystoneV ?? 0),
          keystoneH: photoToProcess.crop?.keystoneH ?? 0,
          aspectRatio:
            decision.aspect_ratio &&
            ["original", "1:1", "4:5", "16:9", "9:16", "free"].includes(
              decision.aspect_ratio,
            )
              ? (decision.aspect_ratio as any)
              : (photoToProcess.crop?.aspectRatio ?? "original"),
          flipH: photoToProcess.crop?.flipH ?? false,
          flipV: photoToProcess.crop?.flipV ?? false,
        };
        await appendAiLog(
          `> [AI_CROP] 智慧構圖裁切已套用：${decision.crop_rationale || "黃金三分點重心"}`,
          15,
        );
      } else if (
        aiScope.keystone &&
        (typeof decision.rotation_deg === "number" ||
          typeof decision.keystone_v === "number")
      ) {
        targetCrop = {
          x: photoToProcess.crop?.x ?? 0,
          y: photoToProcess.crop?.y ?? 0,
          width: photoToProcess.crop?.width ?? 1,
          height: photoToProcess.crop?.height ?? 1,
          rotation:
            typeof decision.rotation_deg === "number"
              ? decision.rotation_deg
              : (photoToProcess.crop?.rotation ?? 0),
          keystoneV:
            typeof decision.keystone_v === "number"
              ? decision.keystone_v
              : (photoToProcess.crop?.keystoneV ?? 0),
          keystoneH: photoToProcess.crop?.keystoneH ?? 0,
          aspectRatio: photoToProcess.crop?.aspectRatio ?? "original",
          flipH: photoToProcess.crop?.flipH ?? false,
          flipV: photoToProcess.crop?.flipV ?? false,
        };
        await appendAiLog(
          `> [AI_LEVEL] 地平線與垂直透視已校正 (${(targetCrop.rotation || 0).toFixed(1)}°)`,
          15,
        );
      }

      // 靜態寫入目標底片資料實體（保存專屬 AI 決策與場景標籤）
      photoToProcess.appliedProfile = targetProfile;
      photoToProcess.aiDecision = decision;
      photoToProcess.sceneTag = decision.scene_title || decision.scene_type;
      photoToProcess.tuning = {
        exposure: baseEv,
        highlights: baseHighlights,
        contrast: baseContrast,
        shadows: baseShadows,
        blacks: baseBlacks,
        lutIntensity: baseLut,
        colorTemp: baseTemp,
        tint: baseTint,
        vibrance: baseVibrance,
        clarity: baseClarity,
        sharpness: baseSharpness,
        colorDensity: baseColorDensity,
        shadowHue: baseShadowHue,
        shadowTintAmount: baseShadowTintAmount,
        highlightHue: baseHighlightHue,
        highlightTintAmount: baseHighlightTintAmount,
        halation: baseHalation,
        grainAmount: baseGrainAmount,
        vignette: baseVignette,
        monochrome: baseMonochrome,
        hsl: cloneHslAdjustments(baseHsl),
      };
      if (targetCrop) {
        photoToProcess.crop = targetCrop;
      }

      // 保存專屬 AI 基準快照供後續一鍵還原 (Restore AI Baseline)
      photoToProcess.aiTuningSnapshot = {
        appliedProfile: targetProfile,
        tuning: {
          exposure: baseEv,
          highlights: baseHighlights,
          contrast: baseContrast,
          shadows: baseShadows,
          blacks: baseBlacks,
          lutIntensity: baseLut,
          colorTemp: baseTemp,
          tint: baseTint,
          vibrance: baseVibrance,
          clarity: baseClarity,
          sharpness: baseSharpness,
          colorDensity: baseColorDensity,
          shadowHue: baseShadowHue,
          shadowTintAmount: baseShadowTintAmount,
          highlightHue: baseHighlightHue,
          highlightTintAmount: baseHighlightTintAmount,
          halation: baseHalation,
          grainAmount: baseGrainAmount,
          vignette: baseVignette,
          monochrome: baseMonochrome,
          hsl: cloneHslAdjustments(baseHsl),
        },
        crop: targetCrop ? { ...targetCrop } : undefined,
        appliedScope: { ...aiScope },
        appliedAt: Date.now(),
      };

      // 若目前為聚焦相片且為手動單幀觸發，更新全域滑桿與動態動畫
      if (isCurrentActive) {
        if (!isBatchAiRunning) {
          applyProfile(targetProfile);
          const targetAnim: {
            exposure?: number;
            highlights?: number;
            contrast?: number;
            shadows?: number;
            blacks?: number;
            colorTemp?: number;
            tint?: number;
            vibrance?: number;
            lutIntensity?: number;
            clarity?: number;
            sharpness?: number;
            colorDensity?: number;
            shadowHue?: number;
            shadowTintAmount?: number;
            highlightHue?: number;
            highlightTintAmount?: number;
            halation?: number;
            grainAmount?: number;
            vignette?: number;
            hsl?: HslAdjustments;
          } = {};
          if (aiScope.tone) {
            targetAnim.exposure = baseEv;
            targetAnim.highlights = baseHighlights;
            targetAnim.contrast = baseContrast;
            targetAnim.shadows = baseShadows;
            targetAnim.blacks = baseBlacks;
            targetAnim.clarity = baseClarity;
            targetAnim.sharpness = baseSharpness;
          }
          if (aiScope.whiteBalance) {
            targetAnim.colorTemp = baseTemp;
            targetAnim.tint = baseTint;
          }
          if (applyLut) {
            targetAnim.lutIntensity = baseLut;
          }
          if (applyFilmPhysics) {
            targetAnim.vibrance = baseVibrance;
            targetAnim.colorDensity = baseColorDensity;
            targetAnim.shadowHue = baseShadowHue;
            targetAnim.shadowTintAmount = baseShadowTintAmount;
            targetAnim.highlightHue = baseHighlightHue;
            targetAnim.highlightTintAmount = baseHighlightTintAmount;
            targetAnim.halation = baseHalation;
            targetAnim.grainAmount = baseGrainAmount;
            targetAnim.vignette = baseVignette;
            targetAnim.hsl = cloneHslAdjustments(baseHsl);
          }
          highlights = baseHighlights;
          blacks = baseBlacks;
          clarity = baseClarity;
          sharpness = baseSharpness;
          monochrome = baseMonochrome;
          darkroomState.highlights = baseHighlights;
          darkroomState.blacks = baseBlacks;
          darkroomState.clarity = baseClarity;
          darkroomState.sharpness = baseSharpness;
          darkroomState.monochrome = baseMonochrome;
          if (applyFilmPhysics) {
            vibrance = baseVibrance;
            colorDensity = baseColorDensity;
            shadowHue = baseShadowHue;
            shadowTintAmount = baseShadowTintAmount;
            highlightHue = baseHighlightHue;
            highlightTintAmount = baseHighlightTintAmount;
            halation = baseHalation;
            grainAmount = baseGrainAmount;
            vignette = baseVignette;
            hsl = cloneHslAdjustments(baseHsl);
            darkroomState.vibrance = baseVibrance;
            darkroomState.colorDensity = baseColorDensity;
            darkroomState.shadowHue = baseShadowHue;
            darkroomState.shadowTintAmount = baseShadowTintAmount;
            darkroomState.highlightHue = baseHighlightHue;
            darkroomState.highlightTintAmount = baseHighlightTintAmount;
            darkroomState.halation = baseHalation;
            darkroomState.grainAmount = baseGrainAmount;
            darkroomState.vignette = baseVignette;
            darkroomState.hsl = cloneHslAdjustments(baseHsl);
          }
          if (Object.keys(targetAnim).length > 0) {
            animateAdjustmentValues(targetAnim, 650);
          }
          if (targetCrop) {
            cropX = targetCrop.x;
            cropY = targetCrop.y;
            cropWidth = targetCrop.width;
            cropHeight = targetCrop.height;
            cropRotation = targetCrop.rotation;
            keystoneV = targetCrop.keystoneV ?? 0;
            keystoneH = targetCrop.keystoneH ?? 0;
            cropAspectRatio = targetCrop.aspectRatio;
            flipH = targetCrop.flipH;
            flipV = targetCrop.flipV;
          }
        } else {
          // 批次模式中直接更新全域狀態，絕不觸發高頻動畫或重繪風暴
          exposure = baseEv;
          highlights = baseHighlights;
          contrast = baseContrast;
          shadows = baseShadows;
          blacks = baseBlacks;
          colorTemp = baseTemp;
          tint = baseTint;
          vibrance = baseVibrance;
          lutIntensity = baseLut;
          clarity = baseClarity;
          sharpness = baseSharpness;
          colorDensity = baseColorDensity;
          shadowHue = baseShadowHue;
          shadowTintAmount = baseShadowTintAmount;
          highlightHue = baseHighlightHue;
          highlightTintAmount = baseHighlightTintAmount;
          halation = baseHalation;
          grainAmount = baseGrainAmount;
          vignette = baseVignette;
          monochrome = baseMonochrome;
          hsl = cloneHslAdjustments(baseHsl);
          darkroomState.highlights = baseHighlights;
          darkroomState.blacks = baseBlacks;
          darkroomState.vibrance = baseVibrance;
          darkroomState.clarity = baseClarity;
          darkroomState.sharpness = baseSharpness;
          darkroomState.colorDensity = baseColorDensity;
          darkroomState.shadowHue = baseShadowHue;
          darkroomState.shadowTintAmount = baseShadowTintAmount;
          darkroomState.highlightHue = baseHighlightHue;
          darkroomState.highlightTintAmount = baseHighlightTintAmount;
          darkroomState.halation = baseHalation;
          darkroomState.grainAmount = baseGrainAmount;
          darkroomState.vignette = baseVignette;
          darkroomState.monochrome = baseMonochrome;
          darkroomState.hsl = cloneHslAdjustments(baseHsl);
          if (targetCrop) {
            cropX = targetCrop.x;
            cropY = targetCrop.y;
            cropWidth = targetCrop.width;
            cropHeight = targetCrop.height;
            cropRotation = targetCrop.rotation;
            keystoneV = targetCrop.keystoneV ?? 0;
            keystoneH = targetCrop.keystoneH ?? 0;
            cropAspectRatio = targetCrop.aspectRatio;
            flipH = targetCrop.flipH;
            flipV = targetCrop.flipV;
          }
        }
      }

      // 更新陣列中該相片，並排程非同步離屏縮圖渲染
      photoPlates = photoPlates.map((p) =>
        p.id === photoToProcess.id ? { ...photoToProcess } : p,
      );
      if (activePhoto && activePhoto.id === photoToProcess.id) {
        activePhoto = { ...photoToProcess };
      }
      enqueueThumbnailRender(photoToProcess);

      await appendAiLog(`> [SUCCESS] 顯影調校完成 ✓`, 10);
      if (!isBatchAiRunning) {
        toastStore.show(
          `【${decision.scene_title || decision.scene_type}】AI 顯影調校完成 ✓`,
          "success",
        );
      }
      return true;
    } catch (err: any) {
      if (
        cancelBatchRequested ||
        err?.message?.includes("手動中止") ||
        err?.name === "AbortError"
      ) {
        await appendAiLog(`> [BATCH_ABORT] 使用者已手動停止顯影程序。`, 10);
        return false;
      }
      console.error("AI Analysis failed:", err);
      await appendAiLog(
        `> [ERROR] 顯影推估異常：${err.message || "未知錯誤"}`,
        20,
      );
      toastStore.show(
        `AI 顯影失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
      return false;
    } finally {
      isAiAnalyzing = false;
    }
  }

  // 獨立快捷操作：一鍵 AI 智慧裁切
  async function quickAiCrop() {
    if (!activePhoto || isAiAnalyzing) return;
    isAiAnalyzing = true;
    await appendAiLog(
      `> [AI_CROP_SOLO] 正在分析 ${activePhoto.filename} 構圖重心與邊界...`,
    );
    try {
      const decision = await AiSceneService.analyzeScene(
        activePhoto.thumbnail,
        {
          cameraModel: activePhoto.camera,
          lensModel: activePhoto.lens,
          iso: activePhoto.iso,
          shutterSpeed: activePhoto.shutter,
          apertureValue: activePhoto.aperture,
          focalLength: activePhoto.focalLength,
        },
        {
          scope: {
            crop: true,
            keystone: true,
            tone: false,
            whiteBalance: false,
            lutProfile: false,
          },
        },
      );
      if (decision.crop_box) {
        cropY = decision.crop_box[0];
        cropX = decision.crop_box[1];
        cropHeight = decision.crop_box[2] - decision.crop_box[0];
        cropWidth = decision.crop_box[3] - decision.crop_box[1];
        darkroomState.cropY = cropY;
        darkroomState.cropX = cropX;
        darkroomState.cropHeight = cropHeight;
        darkroomState.cropWidth = cropWidth;
      }
      if (typeof decision.rotation_deg === "number") {
        cropRotation = decision.rotation_deg;
        darkroomState.cropRotation = cropRotation;
      }
      if (
        decision.aspect_ratio &&
        ["original", "1:1", "4:5", "16:9", "9:16", "free"].includes(
          decision.aspect_ratio,
        )
      ) {
        cropAspectRatio = decision.aspect_ratio as any;
        darkroomState.cropAspectRatio = cropAspectRatio;
      }
      aiCropRationale = decision.crop_rationale || "已套用 AI 建議構圖比例。";
      darkroomState.aiCropRationale = aiCropRationale;
      isCropMode = true; // 自動開啟裁切框供檢視
      darkroomState.isCropMode = true;
      await appendAiLog(`> [SUCCESS] 智慧裁切已套用：${aiCropRationale} ✓`);
      toastStore.show(`智慧構圖已套用：${aiCropRationale} ✓`, "success");
    } catch (err: any) {
      await appendAiLog(`> [ERROR] 裁切分析失敗：${err.message}`);
      toastStore.show(
        `AI 裁切失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
    } finally {
      isAiAnalyzing = false;
    }
  }

  // 獨立快捷操作：一鍵 AI 拉平水平 / 梯形
  async function quickAiHorizon() {
    if (!activePhoto || isAiAnalyzing) return;
    isAiAnalyzing = true;
    await appendAiLog(`> [AI_HORIZON_SOLO] 正在偵測地平線傾角與垂直透視...`);
    try {
      const decision = await AiSceneService.analyzeScene(
        activePhoto.thumbnail,
        {
          cameraModel: activePhoto.camera,
          lensModel: activePhoto.lens,
          iso: activePhoto.iso,
          shutterSpeed: activePhoto.shutter,
          apertureValue: activePhoto.aperture,
          focalLength: activePhoto.focalLength,
        },
        {
          scope: {
            crop: false,
            keystone: true,
            tone: false,
            whiteBalance: false,
            lutProfile: false,
          },
        },
      );
      cropRotation =
        typeof decision.rotation_deg === "number" ? decision.rotation_deg : 0.0;
      keystoneV =
        typeof decision.keystone_v === "number" ? decision.keystone_v : 0.0;
      darkroomState.cropRotation = cropRotation;
      darkroomState.keystoneV = keystoneV;
      await appendAiLog(
        `> [SUCCESS] 地平線校正 ${cropRotation.toFixed(1)}°，垂直梯形 ${keystoneV.toFixed(1)}° ✓`,
      );
      toastStore.show(
        `地平線校正 ${cropRotation.toFixed(1)}°，垂直梯形 ${keystoneV.toFixed(1)}° ✓`,
        "success",
      );
    } catch (err: any) {
      await appendAiLog(`> [ERROR] 水平偵測失敗：${err.message}`);
      toastStore.show(
        `水平偵測失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
    } finally {
      isAiAnalyzing = false;
    }
  }

  // 獨立快捷操作：一鍵 AI 自動白平衡 (Kelvin & Tint)
  async function quickAiWhiteBalance() {
    if (!activePhoto || isAiAnalyzing) return;
    isAiAnalyzing = true;
    await appendAiLog(`> [AI_WB_SOLO] 計算場景色溫與色彩中性灰...`);
    try {
      const decision = await AiSceneService.analyzeScene(
        activePhoto.thumbnail,
        {
          cameraModel: activePhoto.camera,
          lensModel: activePhoto.lens,
          iso: activePhoto.iso,
          shutterSpeed: activePhoto.shutter,
          apertureValue: activePhoto.aperture,
          focalLength: activePhoto.focalLength,
        },
        {
          scope: {
            crop: false,
            keystone: false,
            tone: false,
            whiteBalance: true,
            lutProfile: false,
            filmPhysics: false,
          },
        },
      );
      animateAdjustmentValues(
        {
          colorTemp: decision.color_temp ?? colorTemp,
          tint: decision.tint ?? tint,
        },
        500,
      );
      await appendAiLog(
        `> [SUCCESS] 自動白平衡已套用 (${decision.color_temp}K, Tint: ${decision.tint}) ✓`,
      );
      toastStore.show(
        `自動白平衡已套用 (${decision.color_temp}K, Tint: ${decision.tint}) ✓`,
        "success",
      );
    } catch (err: any) {
      await appendAiLog(`> [ERROR] 白平衡失敗：${err.message}`);
      toastStore.show(
        `白平衡失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
    } finally {
      isAiAnalyzing = false;
    }
  }

  // 獨立快捷操作：一鍵 AI 自動光比 (曝光/對比/陰影)
  async function quickAiTone() {
    if (!activePhoto || isAiAnalyzing) return;
    isAiAnalyzing = true;
    await appendAiLog(`> [AI_TONE_SOLO] 分析曝光分佈與動態範圍...`);
    try {
      const decision = await AiSceneService.analyzeScene(
        activePhoto.thumbnail,
        {
          cameraModel: activePhoto.camera,
          lensModel: activePhoto.lens,
          iso: activePhoto.iso,
          shutterSpeed: activePhoto.shutter,
          apertureValue: activePhoto.aperture,
          focalLength: activePhoto.focalLength,
        },
        {
          scope: {
            crop: false,
            keystone: false,
            tone: true,
            whiteBalance: false,
            lutProfile: false,
            filmPhysics: false,
          },
        },
      );
      animateAdjustmentValues(
        {
          exposure: decision.exposure_compensation,
          highlights: decision.highlights ?? highlights,
          contrast: decision.contrast ?? contrast,
          blacks: decision.blacks ?? blacks,
        },
        500,
      );
      shadows = decision.lift_shadows;
      darkroomState.shadows = shadows;
      if (typeof decision.highlights === "number") {
        highlights = decision.highlights;
        darkroomState.highlights = highlights;
      }
      if (typeof decision.blacks === "number") {
        blacks = decision.blacks;
        darkroomState.blacks = blacks;
      }
      if (typeof decision.clarity === "number") {
        clarity = decision.clarity;
        darkroomState.clarity = clarity;
      }
      if (typeof decision.sharpness === "number") {
        sharpness = decision.sharpness;
        darkroomState.sharpness = sharpness;
      }
      await appendAiLog(
        `> [SUCCESS] 自動光比已套用 (EV: ${decision.exposure_compensation > 0 ? "+" : ""}${decision.exposure_compensation}) ✓`,
      );
      toastStore.show(
        `自動光比已套用 (EV: ${decision.exposure_compensation > 0 ? "+" : ""}${decision.exposure_compensation}) ✓`,
        "success",
      );
    } catch (err: any) {
      await appendAiLog(`> [ERROR] 光比失敗：${err.message}`);
      toastStore.show(
        `光比分析失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
    } finally {
      isAiAnalyzing = false;
    }
  }

  // 獨立快捷操作：一鍵 AI 推薦風格
  async function quickAiProfile() {
    if (!activePhoto || isAiAnalyzing) return;
    isAiAnalyzing = true;
    await appendAiLog(`> [AI_PROFILE_SOLO] 匹配底片情緒風格範本...`);
    try {
      const decision = await AiSceneService.analyzeScene(
        activePhoto.thumbnail,
        {
          cameraModel: activePhoto.camera,
          lensModel: activePhoto.lens,
          iso: activePhoto.iso,
          shutterSpeed: activePhoto.shutter,
          apertureValue: activePhoto.aperture,
          focalLength: activePhoto.focalLength,
        },
        {
          scope: {
            crop: false,
            keystone: false,
            tone: false,
            whiteBalance: false,
            lutProfile: true,
            filmPhysics: false,
          },
          stylePreset: activeStylePreset,
        },
      );
      applyProfile(decision.recommended_profile);
      animateAdjustmentValues(
        {
          lutIntensity: decision.lut_intensity,
        },
        400,
      );
      await appendAiLog(
        `> [SUCCESS] 已推薦套用：${decision.recommended_profile} ✓`,
      );
      toastStore.show(
        `已推薦套用風格：${decision.recommended_profile} ✓`,
        "success",
      );
    } catch (err: any) {
      await appendAiLog(`> [ERROR] 風格推薦失敗：${err.message}`);
      toastStore.show(
        `風格推薦失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
    } finally {
      isAiAnalyzing = false;
    }
  }

  // 觸發 Groq 極速社群文案與 IPTC 標籤生成
  async function triggerGroqCopywriting() {
    if (!activePhoto) return;
    isGeneratingCopy = true;
    try {
      const res = await AiSceneService.generateGroqCopywriting({
        tags: aiVisionTags.length > 0 ? aiVisionTags : ["底片攝影", "街頭光影"],
        sceneTitle: aiSceneTitle || "底片光影顯影",
        userPrompt: userSocialPrompt,
        cameraModel: activePhoto.camera,
        lensModel: activePhoto.lens,
        exifOptical: `${activePhoto.shutter} · ${activePhoto.aperture} · ISO ${activePhoto.iso}`,
      });
      aiSocialCaption = res.caption;
      aiSocialHashtags = res.hashtags;
      aiIptcKeywords = res.iptcKeywords;
      toastStore.show("AI 社群文案與標籤已生成 ✓", "success", 2500);
    } catch (err: any) {
      console.error("Groq copywriting error:", err);
      toastStore.show(
        `文案生成失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
    } finally {
      isGeneratingCopy = false;
    }
  }

  // 一鍵複製社群文案至剪貼簿
  async function copySocialContent() {
    if (!aiSocialCaption) return;
    const fullText = `${aiSocialCaption}\n\n${aiSocialHashtags.join(" ")}`;
    try {
      await navigator.clipboard.writeText(fullText);
      copyNotice = "文案已複製 ✓";
      toastStore.show("社群文案與標籤已複製至剪貼簿 ✓", "success", 2500);
      setTimeout(() => {
        copyNotice = "";
      }, 2500);
    } catch {
      copyNotice = "複製失敗";
      toastStore.show("文案複製失敗", "error", 3000);
      setTimeout(() => {
        copyNotice = "";
      }, 2000);
    }
  }

  // 啟動 AI 批次顯影（Pre-flight 檢查金鑰，未配置時彈出對話框詢問）
  function requestBatchAiAnalysis() {
    const targetList = flaggedPhotos.length > 0 ? flaggedPhotos : photoPlates;
    if (targetList.length === 0) {
      exportNotice = "目前相簿無相片可供 AI 批次顯影";
      setTimeout(() => {
        exportNotice = "";
      }, 2500);
      return;
    }

    if (!hasActiveApiKey()) {
      isKeyPromptModalOpen = true;
    } else {
      runBatchAiAnalysis();
    }
  }

  function openVaultFromPrompt() {
    isKeyPromptModalOpen = false;
    isVaultOpen = true;
  }

  // AI 批次顯影調色（含 4.2s 速率保護與取消中斷）
  async function runBatchAiAnalysis() {
    const targetList =
      flaggedPhotos.length > 0 ? [...flaggedPhotos] : [...photoPlates];
    if (targetList.length === 0) {
      exportNotice = "目前相簿無相片可供 AI 批次顯影";
      setTimeout(() => {
        exportNotice = "";
      }, 2500);
      return;
    }

    if (!hasActiveApiKey()) {
      isKeyPromptModalOpen = true;
      return;
    }

    isBatchAiRunning = true;
    cancelBatchRequested = false;
    batchAbortController = new AbortController();
    aiTerminalLogs = [];
    await appendAiLog(
      `> [BATCH_START] 啟動 AI 批次顯影調色，共 ${targetList.length} 張相片...`,
      20,
    );

    const activeModelInfo = AiSceneService.getActiveModelInfo();
    await appendAiLog(
      `> [CLOUD_AI] 已偵測到有效金鑰，啟動視覺多模態雲端推論 [${activeModelInfo.provider.toUpperCase()} · ${activeModelInfo.modelId}]`,
      20,
    );
    await appendAiLog(
      `> [RATE_LIMIT] 啟用雲端 API 速率保護 (間隔 4.2 秒防超限冷卻)`,
      20,
    );

    for (let i = 0; i < targetList.length; i++) {
      if (cancelBatchRequested) {
        await appendAiLog(`> [BATCH_ABORT] 使用者已手動中止批次顯影程序。`, 10);
        break;
      }

      const p = targetList[i];
      batchProgress = {
        current: i + 1,
        total: targetList.length,
        countdown: 0,
      };
      await appendAiLog(`----------------------------------------`, 10);
      await appendAiLog(
        `> [BATCH ${i + 1}/${targetList.length}] 正在顯影：${p.filename}`,
        20,
      );

      // 讓出微任務讓瀏覽器 DOM 渲染與事件處理器有空隙運作
      await new Promise((r) => setTimeout(r, 16));

      await runAiAnalysis(p);

      if (cancelBatchRequested) {
        await appendAiLog(`> [BATCH_ABORT] 使用者已手動中止批次顯影程序。`, 10);
        break;
      }

      // 每張相片之間進行 4.2 秒速率保護等待，避免超過雲端 API 速率限制
      if (i < targetList.length - 1 && !cancelBatchRequested) {
        for (let cd = 4; cd > 0; cd--) {
          if (cancelBatchRequested) break;
          batchProgress.countdown = cd;
          await new Promise((r) => setTimeout(r, 1000));
        }
        if (batchProgress) batchProgress.countdown = 0;
      }
    }

    if (!cancelBatchRequested) {
      await appendAiLog(
        `> [BATCH_COMPLETE] 全部 ${targetList.length} 張相片批次顯影完成！🎉`,
        10,
      );
    }

    isBatchAiRunning = false;
    batchProgress = null;
    cancelBatchRequested = false;
    batchAbortController = null;

    // 批次完成後，若當前焦點底片有被處理，重繪畫布一次
    if (activePhoto) {
      requestAnimationFrame(() => {
        triggerWebglRender();
      });
    }
  }

  function cancelBatchAi() {
    cancelBatchRequested = true;
    if (batchAbortController) {
      batchAbortController.abort();
    }
    appendAiLog(
      "> [BATCH_INTERRUPT] 已收到停止指令，正在立即中止批次顯影...",
      0,
    );
  }

  // Export Pipeline State
  let exportMode = $state<"modeA" | "modeB">("modeA");
  let exportProgress = $state<number>(100);
  let isExporting = $state<boolean>(false);
  let exportNotice = $state<string>("");

  // Single photo export
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
    if (!activePhoto) return;
    try {
      const resolvedOpts =
        typeof quickOptions === "string"
          ? {
              mode: quickOptions,
              format: "jpeg" as ExportFormat,
              quality: quickOptions === "modeA" ? 0.95 : 1.0,
              maxLongEdge: null as number | null,
            }
          : quickOptions;
      const format = resolvedOpts.format;
      const quality = resolvedOpts.quality;
      const maxLongEdge = resolvedOpts.maxLongEdge;
      const currentCrop =
        activePhoto.crop ||
        (cropWidth < 1 || cropHeight < 1 || cropRotation !== 0 || flipH || flipV
          ? {
              x: cropX,
              y: cropY,
              width: cropWidth,
              height: cropHeight,
              rotation: cropRotation,
              keystoneV,
              keystoneH,
              aspectRatio: cropAspectRatio,
              flipH,
              flipV,
            }
          : undefined);

      const blob = await ExportService.renderPhotoToBlob({
        photo: {
          ...activePhoto,
          tuning: activePhoto.tuning || {
            exposure,
            highlights,
            contrast,
            shadows,
            blacks,
            colorTemp,
            tint,
            vibrance,
            lutIntensity,
            clarity,
            sharpness,
            colorDensity,
            shadowHue,
            shadowTintAmount,
            highlightHue,
            highlightTintAmount,
            halation,
            grainAmount,
            vignette,
            monochrome,
            hsl: cloneHslAdjustments(hsl),
          },
          crop: currentCrop,
        },
        format,
        quality,
        maxLongEdge,
        profileDefaults: allProfiles,
        customLuts: userCustomLuts,
      });

      if (blob) {
        const targetDir =
          typeof localStorage !== "undefined"
            ? localStorage.getItem("slipknot_export_target_dir") || "./Exports"
            : "./Exports";
        const autoDateSubdir =
          typeof localStorage !== "undefined"
            ? localStorage.getItem("slipknot_export_date_subdir") !== "false"
            : true;
        const subDir = autoDateSubdir
          ? new Date().toISOString().slice(0, 10)
          : undefined;
        const baseName = activePhoto.filename.replace(/\.[^/.]+$/, "");
        const ext = getExportExtension(format);
        const filename = `${baseName}_graded.${ext}`;

        const saveResult = await ExportService.saveExportedPhoto({
          targetDir,
          subDir,
          filename,
          blob,
        });

        exportNotice = saveResult.savedPath
          ? `已快速匯出至 ${saveResult.savedPath}`
          : `已快速匯出 ${filename}`;
      }
    } catch {
      exportNotice = "快速匯出發生錯誤";
    } finally {
      setTimeout(() => {
        exportNotice = "";
      }, 3500);
    }
  }

  async function triggerExport(
    subset?: PhotoPlate[],
    options?: {
      targetDir: string;
      autoDateSubdir: boolean;
      backupRawFiles: boolean;
      directoryPlan?: DirectoryPlanResult | null;
      format?: ExportFormat;
      quality?: number;
      maxLongEdge?: number | null;
      colorSpace?: "sRGB" | "DisplayP3" | "ProPhotoRGB";
      preserveExif?: boolean;
    },
  ) {
    const listToExport =
      subset && subset.length > 0
        ? subset
        : activeQueue.length > 0
          ? activeQueue
          : activePhoto
            ? [activePhoto]
            : [];

    if (listToExport.length === 0) {
      exportNotice = "目前相簿為空，請先載入相片";
      setTimeout(() => {
        exportNotice = "";
      }, 2500);
      return;
    }

    const exportFormat: ExportFormat =
      options?.format ??
      ((typeof localStorage !== "undefined"
        ? (localStorage.getItem("slipknot_export_format") as ExportFormat)
        : null) ||
        "jpeg");
    const exportQuality =
      options?.quality ??
      (typeof localStorage !== "undefined" &&
      localStorage.getItem("slipknot_export_quality")
        ? Number(localStorage.getItem("slipknot_export_quality"))
        : exportMode === "modeA"
          ? 0.95
          : 1.0);
    const maxLongEdge = options?.maxLongEdge ?? null;
    const ext = getExportExtension(exportFormat);

    const targetDir =
      options?.targetDir ||
      (typeof localStorage !== "undefined"
        ? localStorage.getItem("slipknot_export_target_dir") || "./Exports"
        : "./Exports");
    const autoDateSubdir =
      options !== undefined
        ? options.autoDateSubdir
        : typeof localStorage !== "undefined"
          ? localStorage.getItem("slipknot_export_date_subdir") !== "false"
          : true;
    const dateSubDir = autoDateSubdir
      ? new Date().toISOString().slice(0, 10)
      : undefined;

    const directoryPlan = options?.directoryPlan;
    const photoSubPathMap = new Map<string, string>();
    if (directoryPlan && directoryPlan.folders) {
      for (const folder of directoryPlan.folders) {
        for (const pid of folder.photoIds) {
          photoSubPathMap.set(pid, folder.subPath);
        }
      }
    }

    isExporting = true;
    exportProgress = 5;
    exportNotice = `準備匯出 ${listToExport.length} 張相片...`;

    let lastSavedPath = "";

    try {
      for (let i = 0; i < listToExport.length; i++) {
        const p = listToExport[i];
        exportProgress = Math.round(((i + 0.5) / listToExport.length) * 100);
        exportNotice = `正在處理第 ${i + 1}/${listToExport.length} 張：${p.filename}...`;

        let blobToSave: Blob | null = null;
        const baseName = p.filename.replace(/\.[^/.]+$/, "");
        const filename = `${baseName}_graded.${ext}`;

        // 計算該照片實際的目標子路徑 (結合日期子目錄與智慧規劃目錄)
        const itemPlanSubPath = photoSubPathMap.get(p.id);
        let actualSubDir: string | undefined = undefined;
        if (dateSubDir && itemPlanSubPath) {
          actualSubDir = `${dateSubDir}/${itemPlanSubPath}`;
        } else if (itemPlanSubPath) {
          actualSubDir = itemPlanSubPath;
        } else if (dateSubDir) {
          actualSubDir = dateSubDir;
        }

        // 渲染成片：依序以設定格式、畫質、尺寸與個別調色裁切算圖
        blobToSave = await ExportService.renderPhotoToBlob({
          photo: p,
          format: exportFormat,
          quality: exportQuality,
          maxLongEdge,
          profileDefaults: allProfiles,
          customLuts: userCustomLuts,
        });

        if (blobToSave) {
          const saveResult = await ExportService.saveExportedPhoto({
            targetDir,
            subDir: actualSubDir,
            filename,
            blob: blobToSave,
          });
          if (saveResult.savedPath) {
            lastSavedPath = saveResult.savedPath;
          }
        }

        // 原始 RAW 備份處理
        if (options?.backupRawFiles && p.fileHandle) {
          try {
            const rawFile: File =
              typeof (p.fileHandle as any).getFile === "function"
                ? await (p.fileHandle as any).getFile()
                : p.fileHandle;
            const rawSubPath = directoryPlan?.rawBackupSubPath || "Raw_Backup";
            const actualRawSubDir = dateSubDir
              ? `${dateSubDir}/${rawSubPath}`
              : rawSubPath;
            await ExportService.saveExportedPhoto({
              targetDir,
              subDir: actualRawSubDir,
              filename: rawFile.name || p.filename,
              blob: rawFile,
            });
          } catch (rawErr) {
            console.warn("備份原始 RAW 檔失敗:", rawErr);
          }
        }

        await new Promise((r) => setTimeout(r, 60));
      }

      exportProgress = 100;
      const planNotice = directoryPlan
        ? `（已自動分類為 ${directoryPlan.folders.length} 個資料夾）`
        : "";
      exportNotice = `已完成匯出 ${listToExport.length} 張相片${planNotice} 至 ${lastSavedPath || targetDir}`;
    } catch {
      exportNotice = "匯出發生錯誤";
    } finally {
      isExporting = false;
      setTimeout(() => {
        exportNotice = "";
      }, 4000);
    }
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
        <!-- 行動端抽屜收合把手 (Mobile Drawer Handle) -->
        <div class="mobile-drawer-handle-bar split-header">
          <div class="mobile-drawer-switch-group font-mono">
            <button
              type="button"
              class="drawer-switch-pill"
              class:active={activeMobileDrawer === "ai"}
              onclick={() => (activeMobileDrawer = "ai")}
            >
              <span class="material-symbols-outlined" style="font-size: 13px;"
                >palette</span
              >
              <span>風格</span>
            </button>
            <button
              type="button"
              class="drawer-switch-pill"
              class:active={activeMobileDrawer === "tuning"}
              onclick={() => (activeMobileDrawer = "tuning")}
            >
              <span class="material-symbols-outlined" style="font-size: 13px;"
                >tune</span
              >
              <span>微調</span>
            </button>
          </div>
          <button
            type="button"
            class="drawer-close-btn font-mono"
            onclick={() => (activeMobileDrawer = "none")}
          >
            <span>收合</span>
            <span class="material-symbols-outlined" style="font-size: 15px;"
              >keyboard_arrow_down</span
            >
          </button>
        </div>

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
          {aiCropRationale}
          {aiVisionTags}
          {aiScope}
          {isAiScopeOpen}
          {copiedLogNotice}
          onToggleAiScope={toggleAiScope}
          onToggleIsAiScopeOpen={() => {
            isAiScopeOpen = aiPipeline.toggleAiScopeOpen();
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
          onSetExportMode={(m: "modeA" | "modeB") => (exportMode = m)}
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
        <!-- 行動端抽屜收合把手 (Mobile Drawer Handle) -->
        {#if activeTab === "retouch"}
          <div class="mobile-drawer-handle-bar split-header">
            <div class="mobile-drawer-switch-group font-mono">
              <button
                type="button"
                class="drawer-switch-pill"
                class:active={activeMobileDrawer === "ai"}
                onclick={() => (activeMobileDrawer = "ai")}
              >
                <span class="material-symbols-outlined" style="font-size: 13px;"
                  >palette</span
                >
                <span>風格</span>
              </button>
              <button
                type="button"
                class="drawer-switch-pill"
                class:active={activeMobileDrawer === "tuning"}
                onclick={() => (activeMobileDrawer = "tuning")}
              >
                <span class="material-symbols-outlined" style="font-size: 13px;"
                  >tune</span
                >
                <span>微調</span>
              </button>
            </div>
            <button
              type="button"
              class="drawer-close-btn font-mono"
              onclick={() => (activeMobileDrawer = "none")}
            >
              <span>收合</span>
              <span class="material-symbols-outlined" style="font-size: 15px;"
                >keyboard_arrow_down</span
              >
            </button>
          </div>
        {:else}
          <div class="mobile-drawer-handle-bar">
            <div class="drawer-drag-pill"></div>
            <button
              type="button"
              class="drawer-close-btn font-mono"
              onclick={() => (activeMobileDrawer = "none")}
            >
              <span>收合面板</span>
              <span class="material-symbols-outlined" style="font-size: 14px;"
                >keyboard_arrow_down</span
              >
            </button>
          </div>
        {/if}
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
    <!-- 行動端暗房操作工具列：不開面板即可直接執行單張一鍵 AI 與批次 AI，並保留風格/微調抽屜入口 -->
    <div class="mobile-retouch-action-bar hairline-t font-mono">
      <button
        type="button"
        class="retouch-action-pill primary-ai"
        onclick={() => runAiAnalysis()}
        disabled={isAiAnalyzing || isBatchAiRunning || !activePhoto}
        title="不開面板直接以目前設定執行一鍵 AI 顯影"
      >
        <span
          class="material-symbols-outlined"
          class:spin={isAiAnalyzing && !isBatchAiRunning}
          style="font-size: 16px;"
        >
          {isAiAnalyzing && !isBatchAiRunning
            ? "progress_activity"
            : "auto_awesome"}
        </span>
        <span>
          {isAiAnalyzing && !isBatchAiRunning
            ? "顯影中..."
            : darkroomState.customStylePrompt.trim()
              ? "依意境 AI"
              : "一鍵 AI"}
        </span>
      </button>

      {#if photoPlates.length > 1}
        {#if isBatchAiRunning}
          <button
            type="button"
            class="retouch-action-pill danger-stop"
            onclick={cancelBatchAi}
            title="立即中止 AI 批次顯影"
          >
            <span class="material-symbols-outlined" style="font-size: 15px;"
              >stop_circle</span
            >
            <span
              >停止 ({batchProgress?.current || 1}/{batchProgress?.total ||
                photoPlates.length})</span
            >
          </button>
        {:else}
          <button
            type="button"
            class="retouch-action-pill secondary-batch"
            onclick={requestBatchAiAnalysis}
            disabled={isAiAnalyzing}
            title="以預設或當前風格進行 AI 批次調色"
          >
            <span class="material-symbols-outlined" style="font-size: 15px;"
              >auto_mode</span
            >
            <span
              >批次 ({flaggedCount > 0
                ? flaggedCount
                : photoPlates.length})</span
            >
          </button>
        {/if}
      {/if}

      <button
        type="button"
        class="retouch-action-pill compact"
        class:active={activeMobileDrawer === "ai"}
        onclick={() =>
          (activeMobileDrawer = activeMobileDrawer === "ai" ? "none" : "ai")}
        title="展開 AI 風格與意境關鍵字設定面板"
      >
        <span class="material-symbols-outlined" style="font-size: 15px;"
          >palette</span
        >
        <span>風格</span>
      </button>

      <button
        type="button"
        class="retouch-action-pill compact"
        class:active={activeMobileDrawer === "tuning"}
        onclick={() =>
          (activeMobileDrawer =
            activeMobileDrawer === "tuning" ? "none" : "tuning")}
        title="展開光影與色彩參數微調面板"
      >
        <span class="material-symbols-outlined" style="font-size: 15px;"
          >tune</span
        >
        <span>微調</span>
      </button>
    </div>
  {/if}

  <!-- 行動端底部導航列 (Mobile Bottom Navigation Bar) -->
  <nav class="mobile-bottom-nav hairline-t font-mono">
    <button
      type="button"
      class="mobile-nav-item"
      class:active={activeTab === "catalog"}
      onclick={() => {
        activeTab = "catalog";
        activeMobileDrawer = "none";
      }}
    >
      <span class="material-symbols-outlined">grid_view</span>
      <span class="nav-text">挑圖</span>
      {#if flaggedCount > 0}
        <span class="nav-badge">{flaggedCount}</span>
      {/if}
    </button>
    <button
      type="button"
      class="mobile-nav-item"
      class:active={activeTab === "retouch"}
      onclick={() => {
        activeTab = "retouch";
        activeMobileDrawer = "none";
      }}
    >
      <span class="material-symbols-outlined">photo_filter</span>
      <span class="nav-text">精修</span>
    </button>
    <button
      type="button"
      class="mobile-nav-item"
      class:active={activeTab === "export"}
      onclick={() => {
        activeTab = "export";
        activeMobileDrawer = "none";
      }}
    >
      <span class="material-symbols-outlined">ios_share</span>
      <span class="nav-text">導出/分享</span>
    </button>
    <button
      type="button"
      class="mobile-nav-item"
      class:active={activeTab === "profiles"}
      onclick={() => {
        activeTab = "profiles";
        activeMobileDrawer = "none";
      }}
    >
      <span class="material-symbols-outlined">palette</span>
      <span class="nav-text">風格庫</span>
    </button>
    <button
      type="button"
      class="mobile-nav-item"
      class:active={activeTab === "devices"}
      onclick={() => {
        activeTab = "devices";
        activeMobileDrawer = "none";
      }}
    >
      <span class="material-symbols-outlined">settings</span>
      <span class="nav-text">設定</span>
    </button>
  </nav>

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

  /* 桌面端預設隱藏手機專屬抽屜與底欄元件 */
  .mobile-drawer-handle-bar,
  .mobile-retouch-action-bar,
  .mobile-bottom-nav,
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

    /* 行動端抽屜收合把手 */
    .mobile-drawer-handle-bar {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-bottom: 8px;
      margin-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      position: sticky;
      top: 0;
      background-color: var(--surface-panel);
      z-index: 10;
    }

    .drawer-drag-pill {
      width: 36px;
      height: 4px;
      background-color: rgba(255, 255, 255, 0.25);
      border-radius: 2px;
      margin-bottom: 6px;
    }

    .drawer-close-btn {
      background: none;
      border: none;
      color: var(--parchment-dim);
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .drawer-close-btn:hover {
      color: var(--amber-highlight);
    }

    /* 手機版精修分割視窗（上圖下控）：展開風格／微調時不遮蓋照片，並暫時隱藏底部工具列 */
    .mobile-drawer-handle-bar.split-header {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0 6px;
      margin-bottom: 6px;
    }

    .mobile-drawer-switch-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .drawer-switch-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 14px;
      border: 1px solid var(--hairline-slate);
      background: rgba(255, 255, 255, 0.04);
      color: var(--parchment-dim);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .drawer-switch-pill.active {
      background: rgba(212, 163, 115, 0.16);
      border-color: var(--amber-highlight);
      color: var(--amber-highlight);
      font-weight: 600;
    }

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
    }

    .workspace-container.mobile-retouch-split .mobile-retouch-action-bar,
    .workspace-container.mobile-retouch-split .mobile-bottom-nav {
      display: none;
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

    /* 行動端精修專屬操作固定工具列：置於底欄上方，提供一鍵 AI 與批次 AI 直接執行 */
    .mobile-retouch-action-bar {
      display: flex;
      height: 48px;
      background-color: var(--surface-panel);
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 8px;
      z-index: 890;
      border-top: 1px solid var(--hairline-slate);
      flex-shrink: 0;
    }

    .retouch-action-pill {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--hairline-slate);
      border-radius: 20px;
      padding: 6px 12px;
      font-size: 11.5px;
      color: var(--parchment-bright);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .retouch-action-pill:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .retouch-action-pill.primary-ai {
      flex: 1.25;
      background: linear-gradient(
        135deg,
        rgba(226, 157, 82, 0.24),
        rgba(212, 163, 115, 0.12)
      );
      border-color: rgba(226, 157, 82, 0.65);
      color: var(--amber-highlight);
      font-weight: 600;
    }

    .retouch-action-pill.secondary-batch {
      flex: 1;
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.18);
    }

    .retouch-action-pill.danger-stop {
      flex: 1.1;
      background: rgba(239, 68, 68, 0.16);
      border-color: rgba(239, 68, 68, 0.55);
      color: #fca5a5;
      font-weight: 600;
    }

    .retouch-action-pill.compact {
      padding: 6px 10px;
    }

    .retouch-action-pill.active {
      background: rgba(212, 163, 115, 0.15);
      border-color: var(--amber-highlight);
      color: var(--amber-highlight);
    }

    .retouch-action-pill .spin {
      animation: mobile-btn-spin 1.1s linear infinite;
    }

    @keyframes mobile-btn-spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    /* 行動端底部導航列 */
    .mobile-bottom-nav {
      display: flex;
      height: 52px;
      background-color: var(--surface-panel);
      z-index: 900;
      align-items: center;
      justify-content: space-around;
      padding: 0 6px;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      flex-shrink: 0;
    }

    .mobile-nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: var(--parchment-dim);
      padding: 4px 10px;
      cursor: pointer;
      position: relative;
      font-size: 10px;
      gap: 2px;
      transition: color 0.15s ease;
    }

    .mobile-nav-item .material-symbols-outlined {
      font-size: 20px;
    }

    .mobile-nav-item.active {
      color: var(--amber-highlight);
    }

    .nav-badge {
      position: absolute;
      top: 2px;
      right: 6px;
      background-color: var(--amber-highlight);
      color: #121316;
      font-size: 9px;
      font-weight: 700;
      padding: 0 4px;
      border-radius: 8px;
    }
  }
</style>
