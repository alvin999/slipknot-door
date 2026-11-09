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
  import { WebglLutRenderer } from "$lib/services/webglLutRenderer";
  import { CustomLutService, type CustomLutRecord } from "$lib/services/customLutService";
  import { ExportService } from "$lib/services/exportService";
  import { STYLE_KEYWORD_ENTRIES } from "$lib/services/ai/styleDirectives";
  import type {
    StyleKeywordId,
    StylePresetKey,
    DirectoryPlanResult,
  } from "$lib/services/ai/types";
  import type {
    CropGeometry,
    AiScopePreferences,
    AiTuningSnapshot,
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
    CustomLutService.getAllCustomLuts().then((luts) => {
      userCustomLuts = luts;
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
    };
  }

  let photoPlates = $state<PhotoPlate[]>([]);
  let activePhoto = $state<PhotoPlate | null>(null);
  let isLoadingPhotos = $state<boolean>(false);
  let photoLoadToken = 0;
  let currentDirectoryName = $state<string>("");

  // Darkroom Tuning Sliders
  // Professional Darkroom Tonal & Color Parameters
  let exposure = $state<number>(0.0);
  let contrast = $state<number>(0.0);
  let highlights = $state<number>(0.0);
  let shadows = $state<number>(0.0);
  let fade = $state<number>(0.0);

  let colorTemp = $state<number>(5500);
  let tint = $state<number>(0.0);
  let saturation = $state<number>(0.0);
  let vibrance = $state<number>(0.0);

  let cyanSkyShift = $state<number>(0.0);
  let foliageEmerald = $state<number>(0.0);
  let lutIntensity = $state<number>(1.0);
  let clarity = $state<number>(0.0);
  let sharpness = $state<number>(0.0);
  let showABComparison = $state<boolean>(false);

  // 專業 Diff 視覺比對狀態 (Curatorial Diff Engine)
  type DiffMode = "off" | "split" | "sideBySide";
  let diffMode = $state<DiffMode>("off");
  let splitPosition = $state<number>(50); // 0% ~ 100% 簾幕分割線位置
  let isDraggingSplit = $state<boolean>(false);

  function isDiffModeActive(mode: DiffMode): boolean {
    return diffMode === mode;
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
              ...JSON.parse(localStorage.getItem(AI_SCOPE_STORAGE_KEY)!),
            };
          } catch {
            return {
              lutProfile: true,
              crop: true,
              keystone: true,
              tone: true,
              whiteBalance: true,
            };
          }
        })()
      : {
          lutProfile: true,
          crop: true,
          keystone: true,
          tone: true,
          whiteBalance: true,
        };

  let aiScope = $state<AiScopePreferences>(initialScope);
  let isAiScopeOpen = $state<boolean>(false); // 側邊欄 AI 職責勾選面板摺疊開關

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

  function applyAspectRatioPreset(ratio: CropRatioPreset) {
    cropAspectRatio = ratio;
    isCropMode = true; // 點擊比例時自動啟動裁切模式與構圖框

    if (ratio === "free") {
      syncCropToActivePhoto();
      return;
    }

    if (ratio === "original") {
      cropX = 0.0;
      cropY = 0.0;
      cropWidth = 1.0;
      cropHeight = 1.0;
      syncCropToActivePhoto();
      return;
    }

    // 計算照片原生寬高比 R_img
    let imgRatio = 1.5; // 預設 3:2
    if (
      sourceImgElement &&
      sourceImgElement.naturalWidth &&
      sourceImgElement.naturalHeight
    ) {
      imgRatio = sourceImgElement.naturalWidth / sourceImgElement.naturalHeight;
    } else if (
      canvasContainerRef &&
      canvasContainerRef.clientWidth &&
      canvasContainerRef.clientHeight
    ) {
      imgRatio =
        canvasContainerRef.clientWidth / canvasContainerRef.clientHeight;
    }

    // 目標長寬比 R_target
    let targetRatio = 1.0;
    if (ratio === "1:1") targetRatio = 1.0;
    else if (ratio === "4:5") targetRatio = 0.8;
    else if (ratio === "16:9") targetRatio = 16 / 9;
    else if (ratio === "9:16") targetRatio = 9 / 16;

    // r = targetRatio / imgRatio
    const r = targetRatio / imgRatio;

    if (r <= 1.0) {
      // 目標比原圖更窄 / 更高：高度佔滿 1.0，寬度縮減並水平置中
      cropHeight = 1.0;
      cropWidth = parseFloat(Math.max(0.1, Math.min(1.0, r)).toFixed(3));
      cropX = parseFloat(((1.0 - cropWidth) / 2).toFixed(3));
      cropY = 0.0;
    } else {
      // 目標比原圖更寬：寬度佔滿 1.0，高度縮減並垂直置中
      cropWidth = 1.0;
      cropHeight = parseFloat(Math.max(0.1, Math.min(1.0, 1.0 / r)).toFixed(3));
      cropX = 0.0;
      cropY = parseFloat(((1.0 - cropHeight) / 2).toFixed(3));
    }

    syncCropToActivePhoto();
  }

  let canvasContainerRef = $state<HTMLDivElement | null>(null);
  let isDraggingCrop = $state<string | null>(null); // 'move' | 'nw' | 'se' | 'ne' | 'sw'

  function handleSplitPointerDown(e: MouseEvent) {
    isDraggingSplit = true;
    updateSplitFromEvent(e);
  }

  function handleStagePointerMove(e: MouseEvent) {
    if (isDraggingSplit && canvasContainerRef) {
      updateSplitFromEvent(e);
    }
    if (isDraggingCrop && canvasContainerRef) {
      updateCropFromEvent(e);
    }
  }

  function handleStagePointerUp() {
    if (isDraggingCrop) {
      syncCropToActivePhoto();
    }
    isDraggingSplit = false;
    isDraggingCrop = null;
  }

  function updateSplitFromEvent(e: MouseEvent) {
    if (!canvasContainerRef) return;
    const rect = canvasContainerRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(3, Math.min(97, (x / rect.width) * 100));
    splitPosition = Math.round(pct);
  }

  function handleCropStart(handle: string, e: MouseEvent) {
    e.stopPropagation();
    isDraggingCrop = handle;
  }

  function updateCropFromEvent(e: MouseEvent) {
    if (!canvasContainerRef || !isDraggingCrop) return;
    const rect = canvasContainerRef.getBoundingClientRect();
    const curX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const curY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (isDraggingCrop === "move") {
      const halfW = cropWidth / 2;
      const halfH = cropHeight / 2;
      const newX = Math.max(0, Math.min(1 - cropWidth, curX - halfW));
      const newY = Math.max(0, Math.min(1 - cropHeight, curY - halfH));
      cropX = parseFloat(newX.toFixed(3));
      cropY = parseFloat(newY.toFixed(3));
    } else if (isDraggingCrop === "se") {
      cropWidth = parseFloat(
        Math.max(0.1, Math.min(1 - cropX, curX - cropX)).toFixed(3),
      );
      cropHeight = parseFloat(
        Math.max(0.1, Math.min(1 - cropY, curY - cropY)).toFixed(3),
      );
    } else if (isDraggingCrop === "nw") {
      const right = cropX + cropWidth;
      const bottom = cropY + cropHeight;
      cropX = parseFloat(Math.max(0, Math.min(right - 0.1, curX)).toFixed(3));
      cropY = parseFloat(Math.max(0, Math.min(bottom - 0.1, curY)).toFixed(3));
      cropWidth = parseFloat((right - cropX).toFixed(3));
      cropHeight = parseFloat((bottom - cropY).toFixed(3));
    }
  }

  // WebGL 2.0 3D LUT Hardware Engine State
  let webglCanvas = $state<HTMLCanvasElement | null>(null);
  let webglRenderer: WebglLutRenderer | null = null;
  let currentBoundCanvas: HTMLCanvasElement | null = null;
  let hasRenderedFirstFrame = $state<boolean>(false);
  let isWebglActive = $state<boolean>(false);
  let sourceImgElement = $state<HTMLImageElement | null>(null);
  let isExifSlateOpen = $state<boolean>(false);

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

  const styleGradingPresets: {
    key: StylePresetKey;
    badge: string;
    shortLabel: string;
    title: string;
    subtitle: string;
    accent: string;
    profileId?: string;
  }[] = [
    {
      key: "auto",
      badge: "AUTO_MATCH",
      shortLabel: "AI 自動配對",
      title: "AI 智慧配對 · 自動推薦 LUT",
      subtitle: "由 AI 依場景光影從 10 款典藏中自動選配最佳風格檔",
      accent: "#e29d52",
    },
    {
      key: "standard",
      badge: "NATURAL_00",
      shortLabel: "Standard",
      title: "Standard · 原色自然直出",
      subtitle: "零風格偏調 · 純淨光學原色 · 保留真實寬容度",
      accent: "#8e929b",
      profileId: "Profile_00_StandardNatural",
    },
    {
      key: "fieldnote",
      badge: "FIELD_01",
      shortLabel: "Fieldnote",
      title: "Fieldnote · 日常微負片",
      subtitle: "中性 C-41 街拍日常 · 長階調長 Toe · 復古清透 (.cube)",
      accent: "#5c7c8a",
      profileId: "Profile_01_Fieldnote",
    },
    {
      key: "heartland",
      badge: "HEART_02",
      shortLabel: "Heartland",
      title: "Heartland · 溫潤人像負片",
      subtitle: "專為健康膚色與暖光調校 · 溫潤通透不泛髒紅 (.cube)",
      accent: "#c97a5d",
      profileId: "Profile_02_Heartland",
    },
    {
      key: "meridian",
      badge: "MERIDIAN_03",
      shortLabel: "Meridian",
      title: "Meridian · 澄澈天光紀實",
      subtitle: "中性灰軸零漂移 · 純淨日光色彩 · 通透自然 (.cube)",
      accent: "#4a8fa8",
      profileId: "Profile_03_Meridian",
    },
    {
      key: "matinee",
      badge: "MATINEE_04",
      shortLabel: "Matinee",
      title: "Matinee · 放映電影拷貝",
      subtitle: "深沉具階調的黑階 · 內斂細膩色彩 · 故事感光影 (.cube)",
      accent: "#3d404d",
      profileId: "Profile_04_Matinee",
    },
    {
      key: "postcard",
      badge: "POSTCARD_05",
      shortLabel: "Postcard",
      title: "Postcard · 明信片正片純色",
      subtitle: "正片色彩提純 · 細膩微密度 · 鮮明不俗艷 (.cube)",
      accent: "#cf5c42",
      profileId: "Profile_05_Postcard",
    },
    {
      key: "skylight",
      badge: "SKYLIGHT_06",
      shortLabel: "Skylight",
      title: "Skylight · 天光重組高動態",
      subtitle: "開放暗部與壓縮高光 · 平衡大光比逆光 · 通透立體 (.cube)",
      accent: "#4f9da6",
      profileId: "Profile_06_Skylight",
    },
    {
      key: "night_market",
      badge: "NIGHT_07",
      shortLabel: "NightMarket",
      title: "NightMarket · 夜市微光金芒",
      subtitle: "夜間混光調校 · 鎢絲與鈉燈轉為純金 · 抗LED色階斷裂 (.cube)",
      accent: "#d9822b",
      profileId: "Profile_07_NightMarket",
    },
    {
      key: "dusk_tide",
      badge: "DUSK_08",
      shortLabel: "DuskTide",
      title: "DuskTide · 暮光藍調冷暖",
      subtitle: "黃昏藍調時刻 · 深青靛藍暗部與暖金燈火交融 (.cube)",
      accent: "#3f51b5",
      profileId: "Profile_08_DuskTide",
    },
    {
      key: "canopy",
      badge: "CANOPY_09",
      shortLabel: "Canopy",
      title: "Canopy · 森綠層次透光",
      subtitle: "綠色亮度分階 · 陰翳青綠與透光黃綠分離 · 鮮活綠意 (.cube)",
      accent: "#2e7d32",
      profileId: "Profile_09_Canopy",
    },
    {
      key: "lowsun",
      badge: "LOWSUN_10",
      shortLabel: "Lowsun",
      title: "Lowsun · 金暉斜陽逆光",
      subtitle: "金琥珀高光與冷調陰影 · 強烈逆光立體感 · 黃昏魔幻 (.cube)",
      accent: "#e67e22",
      profileId: "Profile_10_Lowsun",
    },
  ];

  // De-identified 3D LUT Profiles
  const profiles = [
    {
      id: "Profile_00_StandardNatural",
      title: "Standard · 原色自然直出",
      tone: "零風格偏調 · 純淨光學原色 · 保留真實寬容度",
      badge: "NATURAL_00",
      accent: "#8e929b",
      evDefault: 0.0,
      contrastDefault: 0.0,
      highlightsDefault: 0.0,
      shadowsDefault: 0.0,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.0,
      foliageDefault: 0.0,
      lutIntensityDefault: 1.0,
      clarityDefault: 0.0,
      sharpnessDefault: 0.0,
      recommendedScene: "精準微調 / 商業紀實 / 原色直出",
    },
    {
      id: "Profile_01_Fieldnote",
      title: "Fieldnote · 日常微負片",
      tone: "中性 C-41 街拍日常 · 長階調長 Toe · 復古清透",
      badge: "FIELD_01",
      accent: "#5c7c8a",
      evDefault: 0.0,
      contrastDefault: 0.0,
      highlightsDefault: 0.0,
      shadowsDefault: 0.1,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.0,
      foliageDefault: 0.0,
      lutIntensityDefault: 0.9,
      clarityDefault: 0.0,
      sharpnessDefault: 0.0,
      recommendedScene: "街拍人文 / 日常記事 / 雜誌隨行",
    },
    {
      id: "Profile_02_Heartland",
      title: "Heartland · 溫潤人像負片",
      tone: "專為健康膚色與室內暖光調校 · 溫潤通透不泛髒紅",
      badge: "HEART_02",
      accent: "#c97a5d",
      evDefault: 0.05,
      contrastDefault: -0.02,
      highlightsDefault: -0.05,
      shadowsDefault: 0.08,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.0,
      foliageDefault: 0.0,
      lutIntensityDefault: 0.85,
      clarityDefault: -0.05,
      sharpnessDefault: 0.0,
      recommendedScene: "溫馨人像 / 家庭合照 / 室內暖光",
    },
    {
      id: "Profile_03_Meridian",
      title: "Meridian · 澄澈天光紀實",
      tone: "中性灰軸零漂移 · 純淨日光色彩 · 澄澈通透自然",
      badge: "MERIDIAN_03",
      accent: "#4a8fa8",
      evDefault: 0.0,
      contrastDefault: 0.0,
      highlightsDefault: 0.0,
      shadowsDefault: 0.0,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.0,
      foliageDefault: 0.0,
      lutIntensityDefault: 1.0,
      clarityDefault: 0.0,
      sharpnessDefault: 0.0,
      recommendedScene: "晴天戶外 / 建築幾何 / 忠實紀實",
    },
    {
      id: "Profile_04_Matinee",
      title: "Matinee · 放映電影拷貝",
      tone: "深沉具階調的黑階 · 內斂細膩色彩 · 故事感光影",
      badge: "MATINEE_04",
      accent: "#3d404d",
      evDefault: 0.0,
      contrastDefault: 0.15,
      highlightsDefault: -0.1,
      shadowsDefault: -0.05,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.0,
      foliageDefault: 0.0,
      lutIntensityDefault: 0.85,
      clarityDefault: 0.1,
      sharpnessDefault: 0.1,
      recommendedScene: "戲劇張力 / 展演光影 / 電影氛圍",
    },
    {
      id: "Profile_05_Postcard",
      title: "Postcard · 明信片正片純色",
      tone: "正片色彩提純 · 細膩微密度 · 鮮明不俗艷",
      badge: "POSTCARD_05",
      accent: "#cf5c42",
      evDefault: 0.0,
      contrastDefault: 0.08,
      highlightsDefault: 0.0,
      shadowsDefault: 0.0,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.0,
      foliageDefault: 0.0,
      lutIntensityDefault: 0.85,
      clarityDefault: 0.05,
      sharpnessDefault: 0.05,
      recommendedScene: "旅行寫真 / 色彩鮮活 / 陽光戶外",
    },
    {
      id: "Profile_06_Skylight",
      title: "Skylight · 天光重組高動態",
      tone: "開放暗部與壓縮高光 · 平衡大光比逆光 · 通透立體",
      badge: "SKYLIGHT_06",
      accent: "#4f9da6",
      evDefault: 0.0,
      contrastDefault: -0.05,
      highlightsDefault: -0.15,
      shadowsDefault: 0.15,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.1,
      foliageDefault: 0.0,
      lutIntensityDefault: 0.9,
      clarityDefault: 0.0,
      sharpnessDefault: 0.0,
      recommendedScene: "大逆光風景 / 窗邊人像 / 高反差場景",
    },
    {
      id: "Profile_07_NightMarket",
      title: "NightMarket · 夜市微光金芒",
      tone: "夜間混光調校 · 鎢絲與鈉燈轉為純金 · 抗LED色階斷裂",
      badge: "NIGHT_07",
      accent: "#d9822b",
      evDefault: 0.05,
      contrastDefault: 0.05,
      highlightsDefault: -0.1,
      shadowsDefault: 0.05,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.0,
      foliageDefault: 0.0,
      lutIntensityDefault: 0.85,
      clarityDefault: 0.0,
      sharpnessDefault: 0.05,
      recommendedScene: "夜市小吃 / 街頭夜景 / 霓虹混光",
    },
    {
      id: "Profile_08_DuskTide",
      title: "DuskTide · 暮光藍調冷暖",
      tone: "黃昏藍調時刻 · 深青靛藍暗部與暖金燈火交融",
      badge: "DUSK_08",
      accent: "#3f51b5",
      evDefault: 0.0,
      contrastDefault: 0.1,
      highlightsDefault: -0.05,
      shadowsDefault: 0.0,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.2,
      foliageDefault: 0.0,
      lutIntensityDefault: 0.85,
      clarityDefault: 0.05,
      sharpnessDefault: 0.05,
      recommendedScene: "日落暮色 / 藍調Magic Hour / 碼頭河畔",
    },
    {
      id: "Profile_09_Canopy",
      title: "Canopy · 森綠層次透光",
      tone: "綠色亮度分階 · 陰翳青綠與透光黃綠分離 · 鮮活綠意",
      badge: "CANOPY_09",
      accent: "#2e7d32",
      evDefault: 0.0,
      contrastDefault: 0.05,
      highlightsDefault: 0.0,
      shadowsDefault: 0.05,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.0,
      foliageDefault: 0.3,
      lutIntensityDefault: 0.85,
      clarityDefault: 0.05,
      sharpnessDefault: 0.1,
      recommendedScene: "林道踏青 / 露營戶外 / 植栽花草",
    },
    {
      id: "Profile_10_Lowsun",
      title: "Lowsun · 金暉斜陽逆光",
      tone: "金琥珀高光與冷調陰影 · 強烈逆光立體感 · 黃昏魔幻",
      badge: "LOWSUN_10",
      accent: "#e67e22",
      evDefault: 0.0,
      contrastDefault: 0.12,
      highlightsDefault: -0.1,
      shadowsDefault: 0.0,
      fadeDefault: 0.0,
      cyanSkyDefault: -0.1,
      foliageDefault: 0.1,
      lutIntensityDefault: 0.85,
      clarityDefault: 0.05,
      sharpnessDefault: 0.05,
      recommendedScene: "斜陽夕照 / 金色逆光 / 剪影氛圍",
    },
  ];

  // 使用者自訂 3D LUT 清單與雙向渲染/AI 同步
  let userCustomLuts = $state<CustomLutRecord[]>([]);

  function syncCustomLutsToRenderers() {
    if (userCustomLuts.length === 0) return;
    webglRenderer?.registerCustomLuts(userCustomLuts);
    offscreenRenderer?.registerCustomLuts(userCustomLuts);
    stylePreviewRenderer?.registerCustomLuts(userCustomLuts);
  }

  async function handleImportCustomLut(lut: CustomLutRecord) {
    await CustomLutService.saveCustomLut(lut);
    userCustomLuts = await CustomLutService.getAllCustomLuts();
    syncCustomLutsToRenderers();
    if (activePhoto?.thumbnail) {
      generateStylePreviews(activePhoto.thumbnail);
    }
  }

  async function handleDeleteCustomLut(id: string) {
    await CustomLutService.deleteCustomLut(id);
    userCustomLuts = await CustomLutService.getAllCustomLuts();
  }

  async function handleUpdateCustomLut(lut: CustomLutRecord) {
    await CustomLutService.saveCustomLut(lut);
    userCustomLuts = await CustomLutService.getAllCustomLuts();
    syncCustomLutsToRenderers();
    if (activePhoto?.thumbnail) {
      generateStylePreviews(activePhoto.thumbnail);
    }
  }

  // 合併內建與自訂 LUT 供典藏庫與暗房選擇器使用
  const allProfiles = $derived([
    ...profiles,
    ...userCustomLuts.map((lut) => ({
      id: lut.id,
      title: lut.name,
      tone: lut.directiveDescription,
      badge: "CUSTOM",
      accent: lut.accent || "#bfa15f",
      evDefault: 0.0,
      contrastDefault: 0.0,
      highlightsDefault: 0.0,
      shadowsDefault: 0.0,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.0,
      foliageDefault: 0.0,
      lutIntensityDefault: lut.lutIntensityDefault ?? 0.85,
      clarityDefault: 0.0,
      sharpnessDefault: 0.0,
      recommendedScene: lut.recommendedScene || "使用者自訂風格",
      isCustom: true,
      rawCustomLut: lut,
    })),
  ]);

  const allStyleGradingPresets = $derived([
    ...styleGradingPresets,
    ...userCustomLuts.map((lut) => ({
      key: lut.id as any,
      badge: "CUSTOM",
      shortLabel: lut.name,
      title: `${lut.name} · 自訂風格`,
      subtitle: `${lut.directiveDescription} (.cube)`,
      accent: lut.accent || "#bfa15f",
      profileId: lut.id,
    })),
  ]);

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

      const isDefault =
        Math.abs(exposure - asShotExp) < 0.001 &&
        Math.abs(contrast - 0.0) < 0.001 &&
        Math.abs(shadows - 0.0) < 0.001 &&
        Math.abs(colorTemp - asShotTemp) < 1 &&
        Math.abs(tint - asShotTint) < 0.001 &&
        Math.abs(lutIntensity - 1.0) < 0.001 &&
        Math.abs(clarity - 0.0) < 0.001 &&
        Math.abs(sharpness - 0.0) < 0.001;

      const targetTuning = isDefault
        ? undefined
        : {
            exposure,
            contrast,
            shadows,
            lutIntensity,
            colorTemp,
            tint,
            clarity,
            sharpness,
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
    } else {
      exposure = plate.asShotExposure ?? 0.0;
      contrast = 0.0;
      shadows = 0.0;
      lutIntensity = 1.0;
      colorTemp = plate.asShotTemp ?? 5500;
      tint = plate.asShotTint ?? 0.0;
      clarity = 0.0;
      sharpness = 0.0;
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
    darkroomState.exposure = exposure;
    darkroomState.contrast = contrast;
    darkroomState.shadows = shadows;
    darkroomState.colorTemp = colorTemp;
    darkroomState.tint = tint;
    darkroomState.lutIntensity = lutIntensity;
    darkroomState.clarity = clarity;
    darkroomState.sharpness = sharpness;
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
    darkroomState.diffMode = diffMode;
    darkroomState.splitPosition = splitPosition;
    darkroomState.showABComparison = showABComparison;
  }

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

    // 同步至 +page.svelte 局部狀態供匯出與其他邏輯使用
    exposure = exp;
    contrast = con;
    shadows = shd;
    colorTemp = temp;
    tint = tnt;
    lutIntensity = lut;
    clarity = clr;
    sharpness = shp;

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
    diffMode = darkroomState.diffMode;
    splitPosition = darkroomState.splitPosition;
    showABComparison = darkroomState.showABComparison;

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
      retouchViewRef?.triggerRender();
    });
  }

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
    hasRenderedFirstFrame = false;
    lastBoundImageSrc = "";
    requestAnimationFrame(() => {
      if (
        webglCanvas &&
        (!webglRenderer || webglCanvas !== currentBoundCanvas)
      ) {
        currentBoundCanvas = webglCanvas;
        webglRenderer = new WebglLutRenderer();
        isWebglActive = webglRenderer.initialize(webglCanvas);
        if (userCustomLuts.length > 0) {
          webglRenderer.registerCustomLuts(userCustomLuts);
        }
      }
      triggerWebglRender();
    });
  }

  // 步驟二：前往批次導出頁面
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
          showABComparison = true;
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
      if (showABComparison || darkroomState.showABComparison) {
        e.preventDefault();
        showABComparison = false;
        darkroomState.showABComparison = false;
      }
    }
  }

  function handleWindowBlur() {
    // 視窗失去焦點時安全復原比對狀態，避免放開事件遺失而卡在原圖
    showABComparison = false;
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

      darkroomState.exposure = exposure;
      darkroomState.contrast = contrast;
      darkroomState.shadows = shadows;
      darkroomState.lutIntensity = lutIntensity;
      darkroomState.clarity = clarity;
      darkroomState.sharpness = sharpness;
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
      if (plate.appliedProfile === "Profile_00_StandardNatural") {
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

          offscreenRenderer.setImageSource(img);
          offscreenRenderer.setProfile(plate.appliedProfile);
          offscreenRenderer.render(
            {
              exposure: currentEv,
              contrast: currentContrast,
              colorTemp: currentTemp,
              tint: currentTint,
              shadowLift: currentShadows,
              lutIntensity: currentLut,
              bypassLut: false,
              clarity: currentClarity,
              sharpness: currentSharpness,
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
          contrast: decision.contrast ?? 0.0,
          colorTemp: decision.color_temp ?? 5500,
          tint: decision.tint ?? 0.0,
          shadowLift: decision.lift_shadows ?? 0.0,
          lutIntensity: decision.lut_intensity ?? 1.0,
          bypassLut: false,
          clarity: decision.clarity ?? 0.0,
          sharpness: decision.sharpness ?? 0.0,
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

    darkroomState.colorTemp = colorTemp;
    darkroomState.tint = tint;
    darkroomState.exposure = exposure;
    darkroomState.contrast = contrast;
    darkroomState.shadows = shadows;
    darkroomState.lutIntensity = lutIntensity;
    darkroomState.clarity = clarity;
    darkroomState.sharpness = sharpness;

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

    const isDefaultTuning =
      Math.abs(exposure - asShotExp) < 0.001 &&
      Math.abs(contrast - 0.0) < 0.001 &&
      Math.abs(shadows - 0.0) < 0.001 &&
      Math.abs(colorTemp - asShotTemp) < 1 &&
      Math.abs(tint - asShotTint) < 0.001 &&
      Math.abs(lutIntensity - 1.0) < 0.001 &&
      Math.abs(clarity - 0.0) < 0.001 &&
      Math.abs(sharpness - 0.0) < 0.001;

    const targetTuning = isDefaultTuning
      ? undefined
      : {
          exposure,
          contrast,
          shadows,
          lutIntensity,
          colorTemp,
          tint,
          clarity,
          sharpness,
        };

    const currentPlate = photoPlates.find((p) => p.id === activePhoto!.id);
    const tuningMatches =
      (!currentPlate?.tuning && !targetTuning) ||
      (!!currentPlate?.tuning &&
        !!targetTuning &&
        Math.abs(currentPlate.tuning.exposure - targetTuning.exposure) <
          0.001 &&
        Math.abs(currentPlate.tuning.contrast - targetTuning.contrast) <
          0.001 &&
        Math.abs(
          (currentPlate.tuning.shadows ?? 0) - (targetTuning.shadows ?? 0),
        ) < 0.001 &&
        Math.abs(currentPlate.tuning.lutIntensity - targetTuning.lutIntensity) <
          0.001 &&
        Math.abs(currentPlate.tuning.colorTemp - targetTuning.colorTemp) < 1 &&
        Math.abs(currentPlate.tuning.tint - targetTuning.tint) < 0.001 &&
        Math.abs(
          (currentPlate.tuning.clarity ?? 0) - (targetTuning.clarity ?? 0),
        ) < 0.001 &&
        Math.abs(
          (currentPlate.tuning.sharpness ?? 0) - (targetTuning.sharpness ?? 0),
        ) < 0.001);

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
    return (
      Math.abs(darkroomState.exposure - t.exposure) > 0.001 ||
      Math.abs(darkroomState.contrast - t.contrast) > 0.001 ||
      Math.abs(darkroomState.shadows - (t.shadows ?? 0.0)) > 0.001 ||
      Math.abs(darkroomState.colorTemp - t.colorTemp) > 1 ||
      Math.abs(darkroomState.tint - (t.tint ?? 0.0)) > 0.001 ||
      Math.abs(darkroomState.lutIntensity - t.lutIntensity) > 0.001 ||
      Math.abs(darkroomState.clarity - (t.clarity ?? 0.0)) > 0.001 ||
      Math.abs(darkroomState.sharpness - (t.sharpness ?? 0.0)) > 0.001 ||
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
        contrast: snapshot.tuning.contrast,
        shadows: snapshot.tuning.shadows ?? 0.0,
        lutIntensity: snapshot.tuning.lutIntensity,
        colorTemp: snapshot.tuning.colorTemp,
        tint: snapshot.tuning.tint ?? 0.0,
        clarity: snapshot.tuning.clarity ?? 0.0,
        sharpness: snapshot.tuning.sharpness ?? 0.0,
      },
      450,
    );

    clarity = snapshot.tuning.clarity ?? 0.0;
    darkroomState.clarity = clarity;
    sharpness = snapshot.tuning.sharpness ?? 0.0;
    darkroomState.sharpness = sharpness;

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

  let lastBoundImageSrc = "";

  function ensureImageTexture(): boolean {
    if (
      !webglRenderer ||
      !sourceImgElement ||
      !sourceImgElement.complete ||
      !sourceImgElement.naturalWidth
    ) {
      return false;
    }
    const currentSrc = sourceImgElement.currentSrc || sourceImgElement.src;
    if (lastBoundImageSrc !== currentSrc) {
      webglRenderer.setImageSource(sourceImgElement);
      lastBoundImageSrc = currentSrc;
    }
    return true;
  }

  /**
   * 觸發 WebGL 2.0 3D LUT 純淨色彩著色 (Pure 3D LUT Pipeline)
   */
  function triggerWebglRender() {
    if (!ensureImageTexture() || !webglRenderer || !sourceImgElement) {
      return;
    }

    const imgWidth = sourceImgElement.naturalWidth;
    const imgHeight = sourceImgElement.naturalHeight;

    if (showABComparison) {
      // 按住 Space A/B 比對：瞬間切回 100% 原始本相
      webglRenderer.render(
        {
          exposure: 0.0,
          contrast: 0.0,
          colorTemp: 5500,
          tint: 0.0,
          lutIntensity: 0.0,
          bypassLut: true,
        },
        imgWidth,
        imgHeight,
      );
      return;
    }

    const currentPid = previewHoverProfileId
      ? previewHoverProfileId
      : activePhoto
        ? activePhoto.appliedProfile
        : "Profile_00_StandardNatural";
    const isBypass = currentPid === "Profile_00_StandardNatural";

    webglRenderer.setProfile(currentPid);
    webglRenderer.render(
      {
        exposure,
        contrast,
        colorTemp,
        tint,
        shadowLift: shadows,
        lutIntensity,
        bypassLut: isBypass,
        clarity,
        sharpness,
      },
      imgWidth,
      imgHeight,
    );
    hasRenderedFirstFrame = true;
  }

  function onSourceImgLoaded() {
    lastBoundImageSrc = "";
    if (webglCanvas && (!webglRenderer || webglCanvas !== currentBoundCanvas)) {
      currentBoundCanvas = webglCanvas;
      webglRenderer = new WebglLutRenderer();
      isWebglActive = webglRenderer.initialize(webglCanvas);
      if (userCustomLuts.length > 0) {
        webglRenderer.registerCustomLuts(userCustomLuts);
      }
    }
    if (
      webglRenderer &&
      sourceImgElement &&
      sourceImgElement.naturalWidth > 0
    ) {
      ensureImageTexture();
      triggerWebglRender();
    }
  }

  function setDiffMode(mode: DiffMode) {
    diffMode = mode;
    // 雙聯並排或簾幕切換時，待 DOM 佈局更新後即刻重繪 WebGL 畫布
    requestAnimationFrame(() => {
      triggerWebglRender();
    });
  }

  // Svelte 5 響應式追蹤：調色滑桿、相片切換與比對模式切換時即時以 WebGL 60FPS 硬體著色
  $effect(() => {
    const _photoId = activePhoto?.id;
    const _thumb = activePhoto?.thumbnail;
    const _profile = activePhoto?.appliedProfile;
    const _exp = exposure;
    const _contrast = contrast;
    const _shadows = shadows;
    const _temp = colorTemp;
    const _tint = tint;
    const _lut = lutIntensity;
    const _clarity = clarity;
    const _sharpness = sharpness;
    const _ab = showABComparison;
    const _diff = diffMode;
    const canvas = webglCanvas;

    // 關鍵修復：每次 canvas DOM 實例重新掛載（如從目錄進入精修），立即為新 canvas 初始化 WebGL
    if (canvas && (!webglRenderer || canvas !== currentBoundCanvas)) {
      currentBoundCanvas = canvas;
      webglRenderer = new WebglLutRenderer();
      isWebglActive = webglRenderer.initialize(canvas);
      if (userCustomLuts.length > 0) {
        webglRenderer.registerCustomLuts(userCustomLuts);
      }
      lastBoundImageSrc = "";
    }

    // 批次執行中時，主畫布不需要高頻重繪與同步，避免凍結主執行緒
    if (isBatchAiRunning) return;

    if (
      isWebglActive &&
      sourceImgElement &&
      (sourceImgElement.complete || sourceImgElement.naturalWidth > 0)
    ) {
      ensureImageTexture();
      triggerWebglRender();
      untrack(() => {
        syncActivePhotoTuning();
      });
    }
  });

  async function loadPhotosFromItems(
    items: import("$lib/services/ingestionService").RawPhotoItem[],
    append = false,
  ) {
    if (items.length > 0) {
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
            directUrl = URL.createObjectURL(item.fileHandle);
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
        };
      });

      if (append) {
        photoPlates = [...photoPlates, ...loaded];
        if (!activePhoto && photoPlates.length > 0) {
          activePhoto = photoPlates[0];
          photoPlates[0].selected = true;
        }
        photoLibrary.photoPlates = photoPlates as any;
        toastStore.show(`已成功追加 ${loaded.length} 幀底片 ✓`, "success", 2500);
      } else {
        photoPlates = loaded;
        activePhoto = loaded[0];
        photoLibrary.photoPlates = loaded as any;
        photoLibrary.activePhoto = loaded[0] as any;
        activeTab = "catalog"; // Switch to catalog grid view immediately
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
          if (!photoPlates[plateIndex]?.thumbnail || isTauriEnv || item.fileHandle) {
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
                photoPlates[plateIndex].iso = preview.exif.iso || photoPlates[plateIndex].iso;
                photoPlates[plateIndex].shutter =
                  preview.exif.shutter_speed || photoPlates[plateIndex].shutter;
                photoPlates[plateIndex].aperture =
                  preview.exif.aperture || photoPlates[plateIndex].aperture;
                photoPlates[plateIndex].focalLength =
                  preview.exif.focal_length || photoPlates[plateIndex].focalLength;
                photoPlates[plateIndex].exposureBias = preview.exif.exposure_bias ?? 0.0;
                photoPlates[plateIndex].exposureProgram =
                  preview.exif.exposure_program || "標準自動";
                photoPlates[plateIndex].meteringMode =
                  preview.exif.metering_mode || "多重測光";
                photoPlates[plateIndex].colorSpace = preview.exif.color_space || "sRGB";
                photoPlates[plateIndex].flash = preview.exif.flash || "未擊發";
                photoPlates[plateIndex].asShotTemp = preview.exif.color_temp ?? 5500;
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
  interface RemovedPhotosSnapshot {
    items: PhotoPlate[];
    prevActiveId: string | null;
  }
  let lastRemovedSnapshot = $state<RemovedPhotosSnapshot | null>(null);

  function handleRemovePhoto(photoId: string) {
    handleBatchRemovePhotos([photoId]);
  }

  function handleBatchRemovePhotos(photoIds: string[]) {
    if (!photoIds || photoIds.length === 0) return;
    const idSet = new Set(photoIds);
    const toRemove = photoPlates.filter((p) => idSet.has(p.id));
    if (toRemove.length === 0) return;

    lastRemovedSnapshot = {
      items: toRemove,
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
      `已自相卷排除 ${toRemove.length} 幀底片`,
      "info",
      5000,
      {
        label: "復原 ↺",
        onClick: () => handleUndoRemove(),
      }
    );
  }

  function handleUndoRemove() {
    if (!lastRemovedSnapshot || lastRemovedSnapshot.items.length === 0) return;
    const restored = lastRemovedSnapshot.items;
    photoPlates = [...photoPlates, ...restored];
    photoLibrary.photoPlates = photoPlates as any;

    if (lastRemovedSnapshot.prevActiveId) {
      const found = photoPlates.find((p) => p.id === lastRemovedSnapshot!.prevActiveId);
      if (found) {
        activePhoto = found;
        found.selected = true;
        photoLibrary.activePhoto = found as any;
      }
    }

    toastStore.show(`已復原 ${restored.length} 幀底片 ✓`, "success", 2500);
    lastRemovedSnapshot = null;
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
        currentDirectoryName = IngestionService.currentDirectoryName || "相片資料夾";
        await loadPhotosFromItems(items, false);
      }
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
        toastStore.show(`已成功載入 ${items.length} 幀底片 ✓`, "success", 2500);
      }
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
      }
      await loadPhotosFromItems(items);
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
      contrast?: number;
      shadows?: number;
      lutIntensity?: number;
      colorTemp?: number;
      tint?: number;
      clarity?: number;
      sharpness?: number;
    },
    durationMs = 650,
  ) {
    const startExposure = exposure;
    const startContrast = contrast;
    const startShadows = shadows;
    const startLutIntensity = lutIntensity;
    const startColorTemp = colorTemp;
    const startTint = tint;
    const startClarity = clarity;
    const startSharpness = sharpness;

    const targetExposure = target.exposure ?? startExposure;
    const targetContrast = target.contrast ?? startContrast;
    const targetShadows = target.shadows ?? startShadows;
    const targetLutIntensity = target.lutIntensity ?? startLutIntensity;
    const targetColorTemp = target.colorTemp ?? startColorTemp;
    const targetTint = target.tint ?? startTint;
    const targetClarity = target.clarity ?? startClarity;
    const targetSharpness = target.sharpness ?? startSharpness;

    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1.0);
      // Ease-out cubic for realistic organic dial resistance
      const ease = 1 - Math.pow(1 - progress, 3);

      exposure = parseFloat(
        (startExposure + (targetExposure - startExposure) * ease).toFixed(2),
      );
      contrast = parseFloat(
        (startContrast + (targetContrast - startContrast) * ease).toFixed(2),
      );
      shadows = parseFloat(
        (startShadows + (targetShadows - startShadows) * ease).toFixed(2),
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
      clarity = parseFloat(
        (startClarity + (targetClarity - startClarity) * ease).toFixed(2),
      );
      sharpness = parseFloat(
        (startSharpness + (targetSharpness - startSharpness) * ease).toFixed(2),
      );

      // 同步動態調色至 darkroomState 以流暢驅動右側面板滑桿與 WebGL 著色
      darkroomState.exposure = exposure;
      darkroomState.contrast = contrast;
      darkroomState.shadows = shadows;
      darkroomState.lutIntensity = lutIntensity;
      darkroomState.colorTemp = colorTemp;
      darkroomState.tint = tint;
      darkroomState.clarity = clarity;
      darkroomState.sharpness = sharpness;

      if (progress < 1.0) {
        requestAnimationFrame(step);
      } else {
        if (activePhoto) {
          activePhoto.tuning = {
            exposure,
            contrast,
            shadows,
            lutIntensity,
            colorTemp,
            tint,
            clarity,
            sharpness,
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
          onLog: async (msg: string) => {
            await appendAiLog(msg, 15);
          },
          renderPreview: renderPass1PreviewForCritic,
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
          `> [AI_TONE] 光影與動態調校：\n  • 曝光補償: ${fmt(origEv, " EV")} → ${fmt(baseEv, " EV")}\n  • 對比度: ${fmt(origContrast)} → ${fmt(baseContrast)}\n  • 暗部抬升: ${fmt(origShadows)} → ${fmt(baseShadows)}\n  • 清晰度: ${fmt(origClarity)} → ${fmt(baseClarity)}\n  • 銳利度: ${fmt(origSharpness)} → ${fmt(baseSharpness)}`,
          15,
        );
      }
      if (applyLut) {
        await appendAiLog(
          `> [AI_LUT] 底片風格套用：${targetProfile} (濃度: ${origLut.toFixed(2)} → ${baseLut.toFixed(2)})`,
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
        contrast: baseContrast,
        shadows: baseShadows,
        lutIntensity: baseLut,
        colorTemp: baseTemp,
        tint: baseTint,
        clarity: baseClarity,
        sharpness: baseSharpness,
      };
      if (targetCrop) {
        photoToProcess.crop = targetCrop;
      }

      // 保存專屬 AI 基準快照供後續一鍵還原 (Restore AI Baseline)
      photoToProcess.aiTuningSnapshot = {
        appliedProfile: targetProfile,
        tuning: {
          exposure: baseEv,
          contrast: baseContrast,
          shadows: baseShadows,
          lutIntensity: baseLut,
          colorTemp: baseTemp,
          tint: baseTint,
          clarity: baseClarity,
          sharpness: baseSharpness,
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
            contrast?: number;
            shadows?: number;
            colorTemp?: number;
            tint?: number;
            lutIntensity?: number;
            clarity?: number;
            sharpness?: number;
          } = {};
          if (aiScope.tone) {
            targetAnim.exposure = baseEv;
            targetAnim.contrast = baseContrast;
            targetAnim.shadows = baseShadows;
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
          clarity = baseClarity;
          sharpness = baseSharpness;
          darkroomState.clarity = baseClarity;
          darkroomState.sharpness = baseSharpness;
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
          contrast = baseContrast;
          shadows = baseShadows;
          colorTemp = baseTemp;
          tint = baseTint;
          lutIntensity = baseLut;
          clarity = baseClarity;
          sharpness = baseSharpness;
          darkroomState.clarity = baseClarity;
          darkroomState.sharpness = baseSharpness;
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
          },
        },
      );
      animateAdjustmentValues(
        {
          exposure: decision.exposure_compensation,
          contrast: decision.contrast ?? contrast,
        },
        500,
      );
      shadows = decision.lift_shadows;
      darkroomState.shadows = shadows;
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
    if (activePhoto && webglRenderer) {
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

  async function handleSingleQuickExport(mode: "modeA" | "modeB") {
    if (!activePhoto) return;
    try {
      const quality = mode === "modeA" ? 0.95 : 1.0;
      const currentCrop = activePhoto.crop || (cropWidth < 1 || cropHeight < 1 || cropRotation !== 0 || flipH || flipV ? {
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
      } : undefined);

      const blob = await ExportService.renderPhotoToBlob({
        photo: {
          ...activePhoto,
          tuning: activePhoto.tuning || {
            exposure,
            contrast,
            shadows,
            colorTemp,
            tint,
            lutIntensity,
            clarity,
            sharpness,
          },
          crop: currentCrop,
        },
        quality,
        profileDefaults: allProfiles,
        customLuts: userCustomLuts,
      });

      if (blob) {
        const targetDir =
          typeof localStorage !== "undefined"
            ? localStorage.getItem("slipknot_export_target_dir") ||
              "./Exports"
            : "./Exports";
        const autoDateSubdir =
          typeof localStorage !== "undefined"
            ? localStorage.getItem("slipknot_export_date_subdir") !== "false"
            : true;
        const subDir = autoDateSubdir
          ? new Date().toISOString().slice(0, 10)
          : undefined;
        const baseName = activePhoto.filename.replace(/\.[^/.]+$/, "");
        const suffix = mode === "modeA" ? "_preview" : "_graded";
        const filename = `${baseName}${suffix}.jpg`;

        const saveResult = await ExportService.saveExportedPhoto({
          targetDir,
          subDir,
          filename,
          blob,
        });

        exportNotice = saveResult.savedPath
          ? `已即時匯出至 ${saveResult.savedPath}`
          : `已即時匯出 ${activePhoto.filename} (${mode === "modeA" ? "極速模式" : "滿血典藏"})`;
      }
    } catch {
      exportNotice = "即時匯出發生錯誤";
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
      exportNotice = "目前相簿為空，請先載入照片";
      setTimeout(() => {
        exportNotice = "";
      }, 2500);
      return;
    }

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
    exportNotice = `準備批次匯出 ${listToExport.length} 幀底片...`;

    let lastSavedPath = "";

    try {
      for (let i = 0; i < listToExport.length; i++) {
        const p = listToExport[i];
        exportProgress = Math.round(((i + 0.5) / listToExport.length) * 100);
        exportNotice = `正在渲染第 ${i + 1}/${listToExport.length} 幀: ${p.filename}...`;

        let blobToSave: Blob | null = null;
        const baseName = p.filename.replace(/\.[^/.]+$/, "");
        const filename = `${baseName}_graded.jpg`;

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

        // 渲染成片：依序以完整解析度、個別調色與幾何裁切算圖
        blobToSave = await ExportService.renderPhotoToBlob({
          photo: p,
          quality: exportMode === "modeA" ? 0.95 : 1.0,
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
            const rawFile: File = typeof (p.fileHandle as any).getFile === "function"
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
        ? `（智慧歸檔為 ${directoryPlan.folders.length} 個目錄）`
        : "";
      exportNotice =
        exportMode === "modeA"
          ? `已成功批次匯出 ${listToExport.length} 幀 (極速完成)${planNotice} 至 ${lastSavedPath || targetDir}`
          : `已成功批次儲存 ${listToExport.length} 幀 (典藏模式)${planNotice} 至 ${lastSavedPath || targetDir}`;
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

<div class="workspace-container">
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
          onToggleIsAiScopeOpen={() => (isAiScopeOpen = !isAiScopeOpen)}
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
          {showABComparison}
          {previewHoverProfileId}
          hasApiKey={hasKey}
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

  {#if activeMobileDrawer !== "none"}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="mobile-drawer-backdrop"
      onclick={() => (activeMobileDrawer = "none")}
    ></div>
  {/if}

  {#if activeTab === "retouch"}
    <!-- 行動端暗房操作工具列：固定置於底欄上方，絕不遮擋相片畫布與 EXIF 遙測資訊 -->
    <div class="mobile-retouch-action-bar hairline-t font-mono">
      <button
        type="button"
        class="retouch-action-pill"
        class:active={activeMobileDrawer === "ai"}
        onclick={() =>
          (activeMobileDrawer = activeMobileDrawer === "ai" ? "none" : "ai")}
      >
        <span class="material-symbols-outlined" style="font-size: 16px;"
          >auto_awesome</span
        >
        <span>AI 風格建議</span>
      </button>
      <button
        type="button"
        class="retouch-action-pill"
        class:active={activeMobileDrawer === "tuning"}
        onclick={() =>
          (activeMobileDrawer =
            activeMobileDrawer === "tuning" ? "none" : "tuning")}
      >
        <span class="material-symbols-outlined" style="font-size: 16px;"
          >tune</span
        >
        <span>參數微調</span>
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
    padding: 14px 10px;
    flex-shrink: 0;
    /* 內容（AI 面板展開後）超出視窗高度時可捲動，避免底部按鈕被裁掉 */
    min-height: 0;
    overflow-y: auto;
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

    /* 抽屜全螢幕暗色遮罩 */
    .mobile-drawer-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(3px);
      z-index: 999;
    }

    /* 行動端精修專屬操作固定工具列：置於底欄上方，絕不遮蔽相片畫布與 EXIF 遙測條 */
    .mobile-retouch-action-bar {
      display: flex;
      height: 44px;
      background-color: var(--surface-panel);
      align-items: center;
      justify-content: center;
      gap: 12px;
      z-index: 890;
      border-top: 1px solid var(--hairline-slate);
      flex-shrink: 0;
    }

    .retouch-action-pill {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--hairline-slate);
      border-radius: 20px;
      padding: 6px 16px;
      font-size: 12px;
      color: var(--parchment-bright);
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .retouch-action-pill.active {
      background: rgba(212, 163, 115, 0.15);
      border-color: var(--amber-highlight);
      color: var(--amber-highlight);
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
