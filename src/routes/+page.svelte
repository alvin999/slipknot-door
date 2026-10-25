<script lang="ts">
  import { onMount } from 'svelte';
  import { IngestionService, type CameraMountInfo } from '$lib/services/ingestionService';
  import { KeyVaultService } from '$lib/services/keyVaultService';
  import { AiSceneService } from '$lib/services/aiSceneService';
  import KeyVaultModal from '$lib/components/KeyVaultModal.svelte';
  import CatalogView from '$lib/components/views/CatalogView.svelte';
  import ProfilesView from '$lib/components/views/ProfilesView.svelte';
  import ExportView from '$lib/components/views/ExportView.svelte';
  import DevicesView from '$lib/components/views/DevicesView.svelte';
  import { WebglLutRenderer } from '$lib/services/webglLutRenderer';
  import type { CropGeometry, AiScopePreferences } from '$lib/types/photo';

  // Active module tabs
  type ModuleTab = 'catalog' | 'retouch' | 'profiles' | 'export' | 'devices';
  let activeTab = $state<ModuleTab>('catalog'); // Default to catalog on fresh load for curatorial overview

  // Key Vault State
  let isVaultOpen = $state<boolean>(false);
  let geminiKeyStatus = $state<{ exists: boolean; mode: string | null }>({ exists: false, mode: null });

  // Hardware Ingestion State
  let cameraMounts = $state<CameraMountInfo[]>([]);
  let isScanningMounts = $state<boolean>(false);
  let latestExtractionMs = $state<number>(18);

  onMount(async () => {
    await refreshCameraMounts();
    refreshKeyStatus();
  });

  function refreshKeyStatus() {
    const s = KeyVaultService.getKeyStatus('gemini');
    geminiKeyStatus = { exists: s.exists, mode: s.mode };
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

  let photoPlates = $state<PhotoPlate[]>([]);
  let activePhoto = $state<PhotoPlate | null>(null);
  let isLoadingPhotos = $state<boolean>(false);

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
  type DiffMode = 'off' | 'split' | 'sideBySide';
  let diffMode = $state<DiffMode>('off');
  let splitPosition = $state<number>(50); // 0% ~ 100% 簾幕分割線位置
  let isDraggingSplit = $state<boolean>(false);

  function isDiffModeActive(mode: DiffMode): boolean {
    return diffMode === mode;
  }

  // AI 職責範圍偏好矩陣 (AI Scope Matrix)
  const AI_SCOPE_STORAGE_KEY = 'slipknot_ai_scope_prefs';
  const initialScope: AiScopePreferences = typeof localStorage !== 'undefined' && localStorage.getItem(AI_SCOPE_STORAGE_KEY)
    ? (() => {
        try {
          return {
            lutProfile: true,
            crop: true,
            keystone: true,
            tone: true,
            whiteBalance: true,
            ...JSON.parse(localStorage.getItem(AI_SCOPE_STORAGE_KEY)!)
          };
        } catch {
          return { lutProfile: true, crop: true, keystone: true, tone: true, whiteBalance: true };
        }
      })()
    : { lutProfile: true, crop: true, keystone: true, tone: true, whiteBalance: true };

  let aiScope = $state<AiScopePreferences>(initialScope);
  let isAiScopeOpen = $state<boolean>(false); // 側邊欄 AI 職責勾選面板摺疊開關

  function saveAiScope() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AI_SCOPE_STORAGE_KEY, JSON.stringify(aiScope));
    }
  }

  function toggleAiScope(key: keyof AiScopePreferences) {
    aiScope[key] = !aiScope[key];
    saveAiScope();
  }

  // 幾何構圖與裁切狀態 (Crop & Geometry State)
  let isCropMode = $state<boolean>(false);
  let cropX = $state<number>(0.0);         // 0.0 ~ 1.0 (左上角 X 比例)
  let cropY = $state<number>(0.0);         // 0.0 ~ 1.0 (左上角 Y 比例)
  let cropWidth = $state<number>(1.0);     // 0.0 ~ 1.0 (寬度比例)
  let cropHeight = $state<number>(1.0);    // 0.0 ~ 1.0 (高度比例)
  let cropRotation = $state<number>(0.0);  // -45 ~ +45 度 (水平校正)
  let keystoneV = $state<number>(0.0);     // -45 ~ +45 度 (垂直透視梯形)
  let keystoneH = $state<number>(0.0);     // -45 ~ +45 度 (水平透視梯形)
  let cropAspectRatio = $state<'original' | '1:1' | '4:5' | '16:9' | '9:16' | 'free'>('original');
  let flipH = $state<boolean>(false);
  let flipV = $state<boolean>(false);
  let aiCropRationale = $state<string>(''); // AI 建議裁切說明

  function resetCropState() {
    cropX = 0.0;
    cropY = 0.0;
    cropWidth = 1.0;
    cropHeight = 1.0;
    cropRotation = 0.0;
    keystoneV = 0.0;
    keystoneH = 0.0;
    cropAspectRatio = 'original';
    flipH = false;
    flipV = false;
    aiCropRationale = '';
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

    if (isDraggingCrop === 'move') {
      const halfW = cropWidth / 2;
      const halfH = cropHeight / 2;
      const newX = Math.max(0, Math.min(1 - cropWidth, curX - halfW));
      const newY = Math.max(0, Math.min(1 - cropHeight, curY - halfH));
      cropX = parseFloat(newX.toFixed(3));
      cropY = parseFloat(newY.toFixed(3));
    } else if (isDraggingCrop === 'se') {
      cropWidth = parseFloat(Math.max(0.1, Math.min(1 - cropX, curX - cropX)).toFixed(3));
      cropHeight = parseFloat(Math.max(0.1, Math.min(1 - cropY, curY - cropY)).toFixed(3));
    } else if (isDraggingCrop === 'nw') {
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
  let isWebglActive = $state<boolean>(false);
  let sourceImgElement = $state<HTMLImageElement | null>(null);

  // Dedicated Offscreen WebGL Renderer for Catalog Thumbnails
  let offscreenCanvas: HTMLCanvasElement | null = null;
  let offscreenRenderer: WebglLutRenderer | null = null;
  const thumbnailRenderQueue: PhotoPlate[] = [];
  let isProcessingQueue = false;
  let sliderThumbnailTimer: ReturnType<typeof setTimeout> | null = null;

  // De-identified 3D LUT Profiles
  const profiles = [
    {
      id: 'Profile_00_StandardNatural',
      title: 'Standard · 原色自然直出',
      tone: '零風格偏調 · 純淨光學原色 · 保留真實寬容度',
      badge: 'NATURAL_00',
      accent: '#8e929b',
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
      recommendedScene: '精準微調 / 商業紀實 / 原色直出'
    },
    {
      id: 'Profile_01_MatteShadow',
      title: 'MatteShadow · 啞光微膠卷',
      tone: '低黑階抬升 · 低飽和沉穩綠 · 柔和高反差',
      badge: 'FILM_LOOK_01',
      accent: '#6082b6',
      evDefault: 0.05,
      contrastDefault: 0.08,
      highlightsDefault: -0.10,
      shadowsDefault: 0.10,
      fadeDefault: 0.08,
      cyanSkyDefault: 0.20,
      foliageDefault: 0.40,
      lutIntensityDefault: 0.85,
      clarityDefault: -0.05,
      sharpnessDefault: 0.10,
      recommendedScene: '街拍 / 夜間微光'
    },
    {
      id: 'Profile_02_TealEmerald',
      title: 'TealEmerald · 經典冷青',
      tone: '陰影注入藍青色 · 高光溫潤偏暖金 · 膚色隔離保護',
      badge: 'COLOR_GRADE_02',
      accent: '#3aa8a8',
      evDefault: 0.0,
      contrastDefault: 0.15,
      highlightsDefault: -0.20,
      shadowsDefault: -0.05,
      fadeDefault: 0.04,
      cyanSkyDefault: 0.85,
      foliageDefault: 0.70,
      lutIntensityDefault: 1.0,
      clarityDefault: -0.15,
      sharpnessDefault: 0.05,
      recommendedScene: '晴空戶外 / 日系街拍 / 紀實人文'
    },
    {
      id: 'Profile_03_TungstenSoft',
      title: 'TungstenSoft · 溫潤人像',
      tone: '鎢絲燈光感 · 洋紅微量相移 · 高光滾降過渡',
      badge: 'PORTRAIT_03',
      accent: '#d4a373',
      evDefault: 0.1,
      contrastDefault: -0.05,
      highlightsDefault: -0.15,
      shadowsDefault: 0.15,
      fadeDefault: 0.02,
      cyanSkyDefault: 0.0,
      foliageDefault: 0.0,
      lutIntensityDefault: 0.80,
      clarityDefault: -0.20,
      sharpnessDefault: 0.0,
      recommendedScene: '室內溫潤人像 / 靜物'
    },
    {
      id: 'Profile_04_HighContrastMono',
      title: 'HighContrastMono · 高反差單色',
      tone: '紅橙濾鏡感 · 暗部深邃沈穩 · 經典銀鹽紀實',
      badge: 'MONO_SILVER_04',
      accent: '#e8e4dc',
      evDefault: 0.0,
      contrastDefault: 0.35,
      highlightsDefault: -0.10,
      shadowsDefault: -0.15,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.0,
      foliageDefault: 0.0,
      lutIntensityDefault: 1.0,
      clarityDefault: 0.25,
      sharpnessDefault: 0.25,
      recommendedScene: '建築幾何 / 經典黑白街頭'
    },
    {
      id: 'Profile_05_DocumentaryChrome',
      title: 'DocumentaryChrome · 典藏冷印紀實',
      tone: '低彩度收斂 · 深邃硬調階調 · 沉鬱冷調印相',
      badge: 'CHROME_DOC_05',
      accent: '#7a8b99',
      evDefault: 0.0,
      contrastDefault: 0.20,
      highlightsDefault: -0.15,
      shadowsDefault: -0.10,
      fadeDefault: 0.0,
      cyanSkyDefault: 0.35,
      foliageDefault: -0.20,
      lutIntensityDefault: 0.90,
      clarityDefault: 0.10,
      sharpnessDefault: 0.15,
      recommendedScene: '人文紀實 / 街拍報導 / 展演幕後'
    }
  ];

  // AI Inference State
  let isAiAnalyzing = $state<boolean>(false);
  let isBatchAiRunning = $state<boolean>(false);
  let cancelBatchRequested = $state<boolean>(false);
  let batchProgress = $state<{ current: number; total: number; countdown: number } | null>(null);
  let aiConfidence = $state<number>(0.0);
  let aiSuggestedScene = $state<string>('等待判讀');
  let aiSceneTitle = $state<string>('');
  let aiStyleInsight = $state<string>('');
  let aiRecommendedMood = $state<string>('');
  let aiRecommendedProfile = $state<string>('');
  let aiTerminalLogs = $state<string[]>([]);

  // AI 混合雙軌：Gemini 視覺標籤 + Groq 極速社群文案與 IPTC
  let aiVisionTags = $state<string[]>([]);
  let userSocialPrompt = $state<string>('');
  let aiSocialCaption = $state<string>('');
  let aiSocialHashtags = $state<string[]>([]);
  let aiIptcKeywords = $state<string[]>([]);
  let isGeneratingCopy = $state<boolean>(false);
  let copyNotice = $state<string>('');

  // Curatorial Queue: 若有標記挑圖 (flagged)，精修與匯出僅聚焦選取的相片；若無選取則全部顯示
  let activeQueue = $derived<PhotoPlate[]>(
    photoPlates.filter(p => p.flagged).length > 0
      ? photoPlates.filter(p => p.flagged)
      : photoPlates
  );

  let flaggedCount = $derived<number>(
    photoPlates.filter(p => p.flagged).length
  );

  let flaggedPhotos = $derived<PhotoPlate[]>(
    photoPlates.filter(p => p.flagged)
  );

  function togglePhotoFlag(photo: PhotoPlate, event?: MouseEvent) {
    if (event) event.stopPropagation();
    photo.flagged = !photo.flagged;
    photoPlates = [...photoPlates];
  }

  function clearAllFlags() {
    photoPlates.forEach(p => p.flagged = false);
    photoPlates = [...photoPlates];
  }

  function handleFlagToggled() {
    photoPlates = [...photoPlates];
  }

  function selectPhoto(plate: PhotoPlate) {
    // 記憶前一張相片的自訂調色與裁切狀態
    if (activePhoto && activePhoto.id !== plate.id) {
      activePhoto.tuning = {
        exposure,
        contrast,
        lutIntensity,
        colorTemp,
        tint,
        clarity,
        sharpness
      };
      activePhoto.crop = {
        x: cropX,
        y: cropY,
        width: cropWidth,
        height: cropHeight,
        rotation: cropRotation,
        keystoneV,
        keystoneH,
        aspectRatio: cropAspectRatio,
        flipH,
        flipV
      };
      photoPlates = photoPlates.map(p => p.id === activePhoto!.id ? { ...p, tuning: activePhoto!.tuning, crop: activePhoto!.crop } : p);
    }

    activePhoto = plate;
    photoPlates.forEach(p => p.selected = (p.id === plate.id));

    // 載入當前選中相片的專屬調色或拍攝原生值 (As Shot)
    if (plate.tuning) {
      exposure = plate.tuning.exposure;
      contrast = plate.tuning.contrast;
      lutIntensity = plate.tuning.lutIntensity;
      colorTemp = plate.tuning.colorTemp;
      tint = plate.tuning.tint ?? 0;
      clarity = plate.tuning.clarity ?? 0;
      sharpness = plate.tuning.sharpness ?? 0;
    } else {
      exposure = plate.asShotExposure ?? 0.0;
      contrast = 0.0;
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
  }

  function openRetouchForPhoto(plate: PhotoPlate) {
    selectPhoto(plate);
    activeTab = 'retouch';
  }

  // 步驟一：一鍵進入精修頁面 (只出現選取的，沒選則全部顯示)
  function goToRetouch() {
    if (activeQueue.length > 0) {
      if (!activePhoto || !activeQueue.some(p => p.id === activePhoto?.id)) {
        selectPhoto(activeQueue[0]);
      }
    }
    activeTab = 'retouch';
  }

  // 步驟二：前往批次導出頁面
  function goToExport() {
    activeTab = 'export';
  }

  // 返回膠卷目錄挑圖
  function goToCatalog() {
    activeTab = 'catalog';
  }

  // 在精修佇列中循環切換上一張/下一張相片
  function selectAdjacentPhoto(delta: number) {
    if (activeQueue.length === 0) return;
    const currentIndex = activeQueue.findIndex(p => p.id === activePhoto?.id);
    let nextIndex = currentIndex + delta;
    if (nextIndex < 0) nextIndex = activeQueue.length - 1;
    if (nextIndex >= activeQueue.length) nextIndex = 0;
    selectPhoto(activeQueue[nextIndex]);
  }

  // 精修暗房中的 Vim (H/L) 瀏覽切換與鍵盤操作
  function handleRetouchKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    if (activeTab === 'retouch') {
      if (e.key === 'h' || e.key === 'ArrowLeft') {
        e.preventDefault();
        selectAdjacentPhoto(-1);
      } else if (e.key === 'l' || e.key === 'ArrowRight') {
        e.preventDefault();
        selectAdjacentPhoto(1);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        showABComparison = !showABComparison;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        goToExport();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        goToCatalog();
      }
    }
  }

  function applyProfile(profileId: string) {
    if (!activePhoto) return;
    activePhoto.appliedProfile = profileId;
    const found = profiles.find(p => p.id === profileId);
    if (found) {
      exposure = found.evDefault;
      contrast = found.contrastDefault || 0.0;
      lutIntensity = found.lutIntensityDefault;
      clarity = found.clarityDefault ?? 0.0;
      sharpness = found.sharpnessDefault ?? 0.0;
    }
    triggerWebglRender();
    enqueueThumbnailRender(activePhoto);
  }

  function applyProfileToAll(profileId: string) {
    photoPlates.forEach(p => {
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
    if (typeof document === 'undefined') return false;
    offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = 400;
    offscreenCanvas.height = 300;
    offscreenRenderer = new WebglLutRenderer();
    return offscreenRenderer.initialize(offscreenCanvas);
  }

  function enqueueThumbnailRender(plate: PhotoPlate) {
    if (!thumbnailRenderQueue.some(p => p.id === plate.id)) {
      thumbnailRenderQueue.push(plate);
    }
    if (!isProcessingQueue) {
      processThumbnailQueue();
    }
  }

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
      if (plate.appliedProfile === 'Profile_00_StandardNatural') {
        plate.gradedThumbnail = undefined;
        photoPlates = photoPlates.map(p => p.id === plate.id ? { ...p, gradedThumbnail: undefined } : p);
        if (activePhoto && activePhoto.id === plate.id) {
          activePhoto = { ...activePhoto, gradedThumbnail: undefined };
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
          const found = profiles.find(p => p.id === plate.appliedProfile);
          const currentEv = isCurrentActive ? exposure : (plate.tuning?.exposure ?? (found ? found.evDefault : (plate.asShotExposure ?? 0.0)));
          const currentContrast = isCurrentActive ? contrast : (plate.tuning?.contrast ?? (found ? (found.contrastDefault || 0.0) : 0.0));
          const currentTemp = isCurrentActive ? colorTemp : (plate.tuning?.colorTemp ?? plate.asShotTemp ?? 5500);
          const currentTint = isCurrentActive ? tint : (plate.tuning?.tint ?? plate.asShotTint ?? 0.0);
          const currentLut = isCurrentActive ? lutIntensity : (plate.tuning?.lutIntensity ?? (found ? found.lutIntensityDefault : 1.0));
          const currentClarity = isCurrentActive ? clarity : (plate.tuning?.clarity ?? (found ? (found.clarityDefault ?? 0.0) : 0.0));
          const currentSharpness = isCurrentActive ? sharpness : (plate.tuning?.sharpness ?? (found ? (found.sharpnessDefault ?? 0.0) : 0.0));

          offscreenRenderer.setImageSource(img);
          offscreenRenderer.setProfile(plate.appliedProfile);
          offscreenRenderer.render({
            exposure: currentEv,
            contrast: currentContrast,
            colorTemp: currentTemp,
            tint: currentTint,
            lutIntensity: currentLut,
            bypassLut: false,
            clarity: currentClarity,
            sharpness: currentSharpness
          }, img.naturalWidth || 400, img.naturalHeight || 300);

          const dataUrl = offscreenRenderer.exportDataUrl('image/jpeg', 0.85);
          if (dataUrl) {
            plate.gradedThumbnail = dataUrl;
            photoPlates = photoPlates.map(p => p.id === plate.id ? { ...p, gradedThumbnail: dataUrl } : p);
            if (activePhoto && activePhoto.id === plate.id) {
              activePhoto = { ...activePhoto, gradedThumbnail: dataUrl };
            }
          }
        } catch (err) {
          console.warn('[ThumbnailRenderer] 縮圖渲染略過或失敗:', err);
        }
      }
    }

    // 稍微延遲讓出主執行緒，確保 60FPS 流暢
    setTimeout(processThumbnailQueue, 20);
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
    lutIntensity = 1.0;
    clarity = 0.0;
    sharpness = 0.0;
    triggerWebglRender();
  }

  /**
   * 一鍵恢復當前相片調色參數（Reset to Natural Baseline 5500K / 0 EV）
   */
  function resetTuningParams() {
    exposure = 0.0;
    contrast = 0.0;
    colorTemp = 5500;
    tint = 0.0;
    lutIntensity = 1.0;
    clarity = 0.0;
    sharpness = 0.0;
    if (activePhoto) {
      activePhoto.appliedProfile = 'Profile_00_StandardNatural';
    }
    triggerWebglRender();
  }

  let lastBoundImageSrc = '';

  function ensureImageTexture(): boolean {
    if (!webglRenderer || !sourceImgElement || !sourceImgElement.complete || !sourceImgElement.naturalWidth) {
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
      webglRenderer.render({
        exposure: 0.0,
        contrast: 0.0,
        colorTemp: 5500,
        tint: 0.0,
        lutIntensity: 0.0,
        bypassLut: true
      }, imgWidth, imgHeight);
      return;
    }

    const currentPid = activePhoto ? activePhoto.appliedProfile : 'Profile_00_StandardNatural';
    const isBypass = currentPid === 'Profile_00_StandardNatural';

    webglRenderer.setProfile(currentPid);
    webglRenderer.render({
      exposure,
      contrast,
      colorTemp,
      tint,
      lutIntensity,
      bypassLut: isBypass,
      clarity,
      sharpness
    }, imgWidth, imgHeight);
  }

  function onSourceImgLoaded() {
    lastBoundImageSrc = '';
    if (webglRenderer && sourceImgElement && sourceImgElement.complete && sourceImgElement.naturalWidth > 0) {
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
    const _temp = colorTemp;
    const _tint = tint;
    const _lut = lutIntensity;
    const _clarity = clarity;
    const _sharpness = sharpness;
    const _ab = showABComparison;
    const _diff = diffMode;
    const canvas = webglCanvas;

    if (canvas && !webglRenderer) {
      webglRenderer = new WebglLutRenderer();
      isWebglActive = webglRenderer.initialize(canvas);
      lastBoundImageSrc = '';
    }

    if (isWebglActive && sourceImgElement && sourceImgElement.complete) {
      ensureImageTexture();
      triggerWebglRender();

      // 滑桿微調防抖（Debounce）：拖動調色時非同步同步當前相片在目錄中的縮圖
      if (activePhoto && activePhoto.appliedProfile !== 'Profile_00_StandardNatural') {
        if (sliderThumbnailTimer) clearTimeout(sliderThumbnailTimer);
        sliderThumbnailTimer = setTimeout(() => {
          if (activePhoto) enqueueThumbnailRender(activePhoto);
        }, 300);
      }
    }
  });

  async function loadPhotosFromItems(items: import('$lib/services/ingestionService').RawPhotoItem[]) {
    if (items.length > 0) {
      const isTauriEnv = IngestionService.isTauri();

      // Step 1: Instant zero-latency initialization (< 5ms) for all frames
      const loaded: PhotoPlate[] = items.map((item, i) => {
        const directUrl = !isTauriEnv && item.file_path
          ? `/api/extract-preview?path=${encodeURIComponent(item.file_path)}`
          : '';
        return {
          id: `photo_${i + 1}`,
          frameNo: item.frame_no,
          filename: item.filename,
          camera: `${item.extension.toUpperCase()} 底片`,
          lens: '標準光學鏡頭',
          iso: 100,
          shutter: '--',
          aperture: '--',
          focalLength: '--',
          thumbnail: directUrl,
          sceneTag: '本機相簿幀',
          selected: i === 0,
          appliedProfile: 'Profile_00_StandardNatural',
          fileHandle: item.fileHandle
        };
      });

      photoPlates = loaded;
      activePhoto = loaded[0];
      activeTab = 'catalog'; // Switch to catalog grid view immediately

      // Step 2: Progressive enhancement for EXIF and thumbnails
      // Prioritize the first visible frames immediately
      const initialBatch = Math.min(items.length, 12);
      for (let i = 0; i < initialBatch; i++) {
        const item = items[i];
        if (!photoPlates[i].thumbnail || isTauriEnv || item.fileHandle) {
          IngestionService.extractPreview(item.file_path, item.fileHandle).then(preview => {
            if (photoPlates[i]) {
              if (preview.blob_url || preview.jpeg_base64) {
                photoPlates[i].thumbnail = preview.blob_url || `data:image/jpeg;base64,${preview.jpeg_base64}`;
                if (photoPlates[i].appliedProfile && photoPlates[i].appliedProfile !== 'Profile_00_StandardNatural') {
                  enqueueThumbnailRender(photoPlates[i]);
                }
              }
              photoPlates[i].camera = preview.exif.camera_model || photoPlates[i].camera;
              photoPlates[i].lens = preview.exif.lens_model || photoPlates[i].lens;
              photoPlates[i].iso = preview.exif.iso || photoPlates[i].iso;
              photoPlates[i].shutter = preview.exif.shutter_speed || photoPlates[i].shutter;
              photoPlates[i].aperture = preview.exif.aperture || photoPlates[i].aperture;
              photoPlates[i].focalLength = preview.exif.focal_length || photoPlates[i].focalLength;
              photoPlates[i].exposureBias = preview.exif.exposure_bias ?? 0.0;
              photoPlates[i].exposureProgram = preview.exif.exposure_program || '標準自動';
              photoPlates[i].meteringMode = preview.exif.metering_mode || '多重測光';
              photoPlates[i].colorSpace = preview.exif.color_space || 'sRGB';
              photoPlates[i].flash = preview.exif.flash || '未擊發';
              photoPlates[i].asShotTemp = preview.exif.color_temp ?? 5500;
              photoPlates[i].asShotTint = preview.exif.tint ?? 0;
              photoPlates[i].asShotExposure = preview.exif.exposure_bias ?? 0.0;
              latestExtractionMs = preview.extraction_time_ms || 18;

              // 若剛好是當前活躍檢視相片，且尚未調整過，立即同步載入相機拍攝原值
              if (activePhoto && activePhoto.id === photoPlates[i].id && !activePhoto.tuning) {
                activePhoto = { ...photoPlates[i] };
                colorTemp = photoPlates[i].asShotTemp ?? 5500;
                tint = photoPlates[i].asShotTint ?? 0.0;
                exposure = photoPlates[i].asShotExposure ?? 0.0;
              }
            }
          });
        }
      }

      // Step 3: Background chunked ingestion for subsequent frames
      if (items.length > initialBatch) {
        setTimeout(async () => {
          for (let i = initialBatch; i < items.length; i++) {
            const item = items[i];
            if (!photoPlates[i]?.thumbnail || isTauriEnv || item.fileHandle) {
              const preview = await IngestionService.extractPreview(item.file_path, item.fileHandle);
              if (photoPlates[i]) {
                if (preview.blob_url || preview.jpeg_base64) {
                  photoPlates[i].thumbnail = preview.blob_url || `data:image/jpeg;base64,${preview.jpeg_base64}`;
                  if (photoPlates[i].appliedProfile && photoPlates[i].appliedProfile !== 'Profile_00_StandardNatural') {
                    enqueueThumbnailRender(photoPlates[i]);
                  }
                }
                photoPlates[i].camera = preview.exif.camera_model || photoPlates[i].camera;
                photoPlates[i].lens = preview.exif.lens_model || photoPlates[i].lens;
                photoPlates[i].iso = preview.exif.iso || photoPlates[i].iso;
                photoPlates[i].shutter = preview.exif.shutter_speed || photoPlates[i].shutter;
                photoPlates[i].aperture = preview.exif.aperture || photoPlates[i].aperture;
                photoPlates[i].focalLength = preview.exif.focal_length || photoPlates[i].focalLength;
                photoPlates[i].exposureBias = preview.exif.exposure_bias ?? 0.0;
                photoPlates[i].exposureProgram = preview.exif.exposure_program || '標準自動';
                photoPlates[i].meteringMode = preview.exif.metering_mode || '多重測光';
                photoPlates[i].colorSpace = preview.exif.color_space || 'sRGB';
                photoPlates[i].flash = preview.exif.flash || '未擊發';
                photoPlates[i].asShotTemp = preview.exif.color_temp ?? 5500;
                photoPlates[i].asShotTint = preview.exif.tint ?? 0;
                photoPlates[i].asShotExposure = preview.exif.exposure_bias ?? 0.0;
              }
            }
          }
        }, 60);
      }
    }
  }

  // Open directory and load real photos
  async function handlePickDirectory() {
    isLoadingPhotos = true;
    try {
      const items = await IngestionService.pickWebDirectory();
      await loadPhotosFromItems(items);
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
      await loadPhotosFromItems(items);
    } finally {
      isLoadingPhotos = false;
    }
  }

  // AI Adjustment Slider Organic Tween Animation (AI 手動推拉滑桿感)
  function animateAdjustmentValues(target: {
    exposure?: number;
    contrast?: number;
    lutIntensity?: number;
    colorTemp?: number;
    tint?: number;
  }, durationMs = 650) {
    const startExposure = exposure;
    const startContrast = contrast;
    const startLutIntensity = lutIntensity;
    const startColorTemp = colorTemp;
    const startTint = tint;

    const targetExposure = target.exposure ?? startExposure;
    const targetContrast = target.contrast ?? startContrast;
    const targetLutIntensity = target.lutIntensity ?? startLutIntensity;
    const targetColorTemp = target.colorTemp ?? startColorTemp;
    const targetTint = target.tint ?? startTint;

    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1.0);
      // Ease-out cubic for realistic organic dial resistance
      const ease = 1 - Math.pow(1 - progress, 3);

      exposure = parseFloat((startExposure + (targetExposure - startExposure) * ease).toFixed(2));
      contrast = parseFloat((startContrast + (targetContrast - startContrast) * ease).toFixed(2));
      lutIntensity = parseFloat((startLutIntensity + (targetLutIntensity - startLutIntensity) * ease).toFixed(2));
      colorTemp = Math.round(startColorTemp + (targetColorTemp - startColorTemp) * ease);
      tint = parseFloat((startTint + (targetTint - startTint) * ease).toFixed(1));

      if (progress < 1.0) {
        requestAnimationFrame(step);
      } else {
        if (activePhoto) {
          activePhoto.tuning = {
            exposure,
            contrast,
            lutIntensity,
            colorTemp,
            tint,
            clarity,
            sharpness
          };
          photoPlates = photoPlates.map(p => p.id === activePhoto!.id ? { ...p, tuning: activePhoto!.tuning } : p);
        }
      }
    }
    requestAnimationFrame(step);
  }

  async function appendAiLog(msg: string, delayMs = 60) {
    aiTerminalLogs = [...aiTerminalLogs.slice(-25), msg];
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // Authentic AI Scene Analysis & Organic Parameter Tuning
  async function runAiAnalysis(targetPhoto?: PhotoPlate): Promise<boolean> {
    const photoToProcess = targetPhoto || activePhoto;
    if (!photoToProcess) {
      exportNotice = '請先載入相片以進行 AI 顯影調色';
      setTimeout(() => { exportNotice = ''; }, 2500);
      return false;
    }

    if (photoToProcess.id !== activePhoto?.id) {
      selectPhoto(photoToProcess);
    }

    isAiAnalyzing = true;
    if (!isBatchAiRunning) {
      aiTerminalLogs = [];
    }
    await appendAiLog(`> [OPTICAL_SCAN] 掃描 ${photoToProcess.filename} 影格直方圖...`);
    await appendAiLog(`> [EXIF] ISO ${photoToProcess.iso} · ${photoToProcess.aperture} · ${photoToProcess.shutter} · ${photoToProcess.focalLength}`);
    await appendAiLog(`> [STREAM] 傳輸 512px 縮圖至視覺多模態引擎...`, 100);

    try {
      const decision = await AiSceneService.analyzeScene(
        photoToProcess.thumbnail,
        {
          cameraModel: photoToProcess.camera,
          lensModel: photoToProcess.lens,
          iso: photoToProcess.iso,
          shutterSpeed: photoToProcess.shutter,
          apertureValue: photoToProcess.aperture,
          focalLength: photoToProcess.focalLength
        }
      );

      aiConfidence = decision.confidence;
      aiSuggestedScene = decision.isFallback ? `${decision.scene_type} (在地光學推估)` : `${decision.scene_type} (視覺即時判讀)`;
      aiSceneTitle = decision.scene_title || decision.scene_type;
      aiStyleInsight = decision.style_insight || '';
      aiRecommendedMood = decision.recommended_mood || '';
      aiRecommendedProfile = decision.recommended_profile;
      aiVisionTags = decision.tags || [];

      // 若有視覺標籤，自動預熱 Groq 文案生成（秒回體驗）
      if (aiVisionTags.length > 0 && !isBatchAiRunning) {
        triggerGroqCopywriting();
      }

      await appendAiLog(`> [DETECTED] 識別場景：【${aiSceneTitle}】(信心度 ${(decision.confidence * 100).toFixed(0)}%)`);
      if (decision.tags && decision.tags.length > 0) {
        await appendAiLog(`> [VISION_TAGS] 視覺特徵：#${decision.tags.join(' #')}`, 50);
      }
      if (decision.style_insight) {
        await appendAiLog(`> [INSIGHT] ${decision.style_insight}`, 80);
      }
      if (decision.recommended_mood) {
        await appendAiLog(`> [MOOD_SUGGEST] 建議風格調性：${decision.recommended_mood}`);
      }
      await appendAiLog(`> [AUTOTUNE] 依據 AI 職責勾選開始套用參數...`);

      // 1. 基礎光影與色調 (Tone)
      const targetAnim: { exposure?: number; contrast?: number; colorTemp?: number; tint?: number; lutIntensity?: number } = {};
      if (aiScope.tone) {
        targetAnim.exposure = decision.exposure_compensation;
        targetAnim.contrast = decision.contrast ?? contrast;
        shadows = decision.lift_shadows;
        await appendAiLog(`> [AI_TONE] 光影對比已推進 (EV: ${decision.exposure_compensation > 0 ? '+' : ''}${decision.exposure_compensation})`);
      }

      // 2. 自動白平衡 (White Balance)
      if (aiScope.whiteBalance) {
        targetAnim.colorTemp = decision.color_temp ?? colorTemp;
        targetAnim.tint = decision.tint ?? tint;
        await appendAiLog(`> [AI_WB] 自動白平衡已校正 (${decision.color_temp ?? colorTemp}K, Tint: ${decision.tint ?? tint})`);
      }

      // 3. 3D LUT 風格推薦 (Film Profile)
      if (aiScope.lutProfile) {
        targetAnim.lutIntensity = decision.lut_intensity;
        applyProfile(decision.recommended_profile);
        await appendAiLog(`> [AI_LUT] 套用底片風格：${decision.recommended_profile}`);
      }

      // 觸發推桿動畫
      if (Object.keys(targetAnim).length > 0) {
        animateAdjustmentValues(targetAnim, 700);
      }

      // 4. 構圖與智慧裁切 (Crop)
      if (aiScope.crop && decision.crop_box) {
        cropY = decision.crop_box[0];
        cropX = decision.crop_box[1];
        cropHeight = decision.crop_box[2] - decision.crop_box[0];
        cropWidth = decision.crop_box[3] - decision.crop_box[1];
        if (decision.aspect_ratio && ['original', '1:1', '4:5', '16:9', '9:16', 'free'].includes(decision.aspect_ratio)) {
          cropAspectRatio = decision.aspect_ratio as any;
        }
        aiCropRationale = decision.crop_rationale || '';
        await appendAiLog(`> [AI_CROP] 智慧構圖裁切已套用：${decision.crop_rationale || '黃金三分點重心'}`);
      }

      // 5. 梯形與水平校正 (Keystone & Leveling)
      if (aiScope.keystone) {
        if (typeof decision.rotation_deg === 'number') {
          cropRotation = decision.rotation_deg;
        }
        if (typeof decision.keystone_v === 'number') {
          keystoneV = decision.keystone_v;
        }
        await appendAiLog(`> [AI_LEVEL] 地平線與垂直透視已校正 (${cropRotation.toFixed(1)}°)`);
      }

      await appendAiLog(`> [SUCCESS] 顯影調校完成 ✓`);
      return true;
    } catch (err: any) {
      console.error('AI Analysis failed:', err);
      await appendAiLog(`> [ERROR] 顯影推估異常：${err.message || '未知錯誤'}`);
      return false;
    } finally {
      isAiAnalyzing = false;
    }
  }

  // 獨立快捷操作：一鍵 AI 智慧裁切
  async function quickAiCrop() {
    if (!activePhoto || isAiAnalyzing) return;
    isAiAnalyzing = true;
    await appendAiLog(`> [AI_CROP_SOLO] 正在分析 ${activePhoto.filename} 構圖重心與邊界...`);
    try {
      const decision = await AiSceneService.analyzeScene(activePhoto.thumbnail, {
        cameraModel: activePhoto.camera,
        lensModel: activePhoto.lens,
        iso: activePhoto.iso,
        shutterSpeed: activePhoto.shutter,
        apertureValue: activePhoto.aperture,
        focalLength: activePhoto.focalLength
      });
      if (decision.crop_box) {
        cropY = decision.crop_box[0];
        cropX = decision.crop_box[1];
        cropHeight = decision.crop_box[2] - decision.crop_box[0];
        cropWidth = decision.crop_box[3] - decision.crop_box[1];
      }
      if (typeof decision.rotation_deg === 'number') {
        cropRotation = decision.rotation_deg;
      }
      if (decision.aspect_ratio && ['original', '1:1', '4:5', '16:9', '9:16', 'free'].includes(decision.aspect_ratio)) {
        cropAspectRatio = decision.aspect_ratio as any;
      }
      aiCropRationale = decision.crop_rationale || '已套用 AI 建議構圖比例。';
      isCropMode = true; // 自動開啟裁切框供檢視
      await appendAiLog(`> [SUCCESS] 智慧裁切已套用：${aiCropRationale} ✓`);
    } catch (err: any) {
      await appendAiLog(`> [ERROR] 裁切分析失敗：${err.message}`);
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
      const decision = await AiSceneService.analyzeScene(activePhoto.thumbnail, {
        cameraModel: activePhoto.camera,
        lensModel: activePhoto.lens,
        iso: activePhoto.iso,
        shutterSpeed: activePhoto.shutter,
        apertureValue: activePhoto.aperture,
        focalLength: activePhoto.focalLength
      });
      cropRotation = typeof decision.rotation_deg === 'number' ? decision.rotation_deg : 0.0;
      keystoneV = typeof decision.keystone_v === 'number' ? decision.keystone_v : 0.0;
      await appendAiLog(`> [SUCCESS] 地平線校正 ${cropRotation.toFixed(1)}°，垂直梯形 ${keystoneV.toFixed(1)}° ✓`);
    } catch (err: any) {
      await appendAiLog(`> [ERROR] 水平偵測失敗：${err.message}`);
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
      const decision = await AiSceneService.analyzeScene(activePhoto.thumbnail, {
        cameraModel: activePhoto.camera,
        lensModel: activePhoto.lens,
        iso: activePhoto.iso,
        shutterSpeed: activePhoto.shutter,
        apertureValue: activePhoto.aperture,
        focalLength: activePhoto.focalLength
      });
      animateAdjustmentValues({
        colorTemp: decision.color_temp ?? colorTemp,
        tint: decision.tint ?? tint
      }, 500);
      await appendAiLog(`> [SUCCESS] 自動白平衡已套用 (${decision.color_temp}K, Tint: ${decision.tint}) ✓`);
    } catch (err: any) {
      await appendAiLog(`> [ERROR] 白平衡失敗：${err.message}`);
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
      const decision = await AiSceneService.analyzeScene(activePhoto.thumbnail, {
        cameraModel: activePhoto.camera,
        lensModel: activePhoto.lens,
        iso: activePhoto.iso,
        shutterSpeed: activePhoto.shutter,
        apertureValue: activePhoto.aperture,
        focalLength: activePhoto.focalLength
      });
      animateAdjustmentValues({
        exposure: decision.exposure_compensation,
        contrast: decision.contrast ?? contrast
      }, 500);
      shadows = decision.lift_shadows;
      await appendAiLog(`> [SUCCESS] 自動光比已套用 (EV: ${decision.exposure_compensation > 0 ? '+' : ''}${decision.exposure_compensation}) ✓`);
    } catch (err: any) {
      await appendAiLog(`> [ERROR] 光比失敗：${err.message}`);
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
      const decision = await AiSceneService.analyzeScene(activePhoto.thumbnail, {
        cameraModel: activePhoto.camera,
        lensModel: activePhoto.lens,
        iso: activePhoto.iso,
        shutterSpeed: activePhoto.shutter,
        apertureValue: activePhoto.aperture,
        focalLength: activePhoto.focalLength
      });
      applyProfile(decision.recommended_profile);
      animateAdjustmentValues({
        lutIntensity: decision.lut_intensity
      }, 400);
      await appendAiLog(`> [SUCCESS] 已推薦套用：${decision.recommended_profile} ✓`);
    } catch (err: any) {
      await appendAiLog(`> [ERROR] 風格推薦失敗：${err.message}`);
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
        tags: aiVisionTags.length > 0 ? aiVisionTags : ['底片攝影', '街頭光影'],
        sceneTitle: aiSceneTitle || '底片光影顯影',
        userPrompt: userSocialPrompt,
        cameraModel: activePhoto.camera,
        lensModel: activePhoto.lens,
        exifOptical: `${activePhoto.shutter} · ${activePhoto.aperture} · ISO ${activePhoto.iso}`
      });
      aiSocialCaption = res.caption;
      aiSocialHashtags = res.hashtags;
      aiIptcKeywords = res.iptcKeywords;
    } catch (err: any) {
      console.error('Groq copywriting error:', err);
    } finally {
      isGeneratingCopy = false;
    }
  }

  // 一鍵複製社群文案至剪貼簿
  async function copySocialContent() {
    if (!aiSocialCaption) return;
    const fullText = `${aiSocialCaption}\n\n${aiSocialHashtags.join(' ')}`;
    try {
      await navigator.clipboard.writeText(fullText);
      copyNotice = '文案已複製 ✓';
      setTimeout(() => { copyNotice = ''; }, 2500);
    } catch {
      copyNotice = '複製失敗';
      setTimeout(() => { copyNotice = ''; }, 2000);
    }
  }

  // 批次 AI 顯影調色（含 4.2s 速率保護與取消中斷）
  async function runBatchAiAnalysis() {
    const targetList = flaggedPhotos.length > 0 ? flaggedPhotos : photoPlates;
    if (targetList.length === 0) {
      exportNotice = '目前相簿無相片可供批次顯影';
      setTimeout(() => { exportNotice = ''; }, 2500);
      return;
    }

    isBatchAiRunning = true;
    cancelBatchRequested = false;
    aiTerminalLogs = [];
    await appendAiLog(`> [BATCH_START] 啟動批次 AI 顯影調色，共 ${targetList.length} 張相片...`);
    await appendAiLog(`> [RATE_LIMIT] 啟用 Gemini Free Tier 速率保護 (每分鐘 15 次限制，間隔 4.2 秒)`);

    for (let i = 0; i < targetList.length; i++) {
      if (cancelBatchRequested) {
        await appendAiLog(`> [BATCH_ABORT] 使用者已手動中止批次顯影程序。`);
        break;
      }

      const p = targetList[i];
      batchProgress = { current: i + 1, total: targetList.length, countdown: 0 };
      await appendAiLog(`----------------------------------------`);
      await appendAiLog(`> [BATCH ${i + 1}/${targetList.length}] 正在顯影：${p.filename}`);

      await runAiAnalysis(p);

      // 如果不是最後一張且未被中斷，進行防超限 Sleep 倒數 (4.2 秒)
      if (i < targetList.length - 1 && !cancelBatchRequested) {
        for (let cd = 4; cd > 0; cd--) {
          if (cancelBatchRequested) break;
          batchProgress.countdown = cd;
          await new Promise(r => setTimeout(r, 1050));
        }
        batchProgress.countdown = 0;
      }
    }

    if (!cancelBatchRequested) {
      await appendAiLog(`> [BATCH_COMPLETE] 全部 ${targetList.length} 張相片批次顯影完成！🎉`);
    }

    isBatchAiRunning = false;
    batchProgress = null;
    cancelBatchRequested = false;
  }

  function cancelBatchAi() {
    cancelBatchRequested = true;
  }

  // Export Pipeline State
  let exportMode = $state<'modeA' | 'modeB'>('modeA');
  let exportProgress = $state<number>(100);
  let isExporting = $state<boolean>(false);
  let exportNotice = $state<string>('');

  async function triggerExport() {
    if (!activePhoto) {
      exportNotice = '目前相簿為空，請先載入照片';
      setTimeout(() => { exportNotice = ''; }, 2500);
      return;
    }

    isExporting = true;
    exportProgress = 20;
    exportNotice = 'WebGL 著色器離屏採樣中...';

    try {
      if (webglRenderer) {
        exportProgress = 50;
        const blob = await webglRenderer.exportBlob('image/jpeg', 0.96);
        if (blob) {
          exportProgress = 85;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const baseName = activePhoto.filename.replace(/\.[^/.]+$/, '');
          a.href = url;
          a.download = `${baseName}_graded.jpg`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
      exportProgress = 100;
      exportNotice = exportMode === 'modeA' 
        ? '已成功匯出所見即所得調色 JPEG (極速完成)' 
        : '16-bit 滿血無損 JPEG 已儲存 (典藏模式)';
    } catch (e) {
      exportNotice = '匯出發生錯誤';
    } finally {
      isExporting = false;
      setTimeout(() => { exportNotice = ''; }, 3500);
    }
  }
</script>

<svelte:window onkeydown={handleRetouchKeydown} />

<div class="workspace-container">
  <!-- 去識別化 3D 膠卷風格濾鏡著色矩陣定義 (De-identified Film Emulation Matrices) -->
  <svg style="position: absolute; width: 0; height: 0; pointer-events: none; opacity: 0;" aria-hidden="true">
    <defs>
      <!-- 1. 啞光微膠卷 (FILM_LOOK_01): 低黑階抬升、低飽和沉穩綠、柔和高反差 -->
      <filter id="filter-matte-shadow" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="
          0.98  0.03  0.00  0  0.03
          0.02  0.96  0.02  0  0.03
          0.01  0.02  0.94  0  0.04
          0.00  0.00  0.00  1  0.00
        " />
        <feComponentTransfer>
          <feFuncR type="linear" slope="0.92" intercept="0.04" />
          <feFuncG type="linear" slope="0.92" intercept="0.04" />
          <feFuncB type="linear" slope="0.90" intercept="0.05" />
        </feComponentTransfer>
      </filter>

      <!-- 2. 冷青翡翠 (COLOR_GRADE_02): 陰影青綠冷調、高光暖金微溫、膠卷膚色隔離保護 -->
      <filter id="filter-teal-emerald" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="
          0.88  0.08  0.00  0  -0.01
          0.02  1.04  0.04  0   0.02
          0.04  0.10  1.16  0   0.05
          0.00  0.00  0.00  1   0.00
        " />
        <feComponentTransfer>
          <feFuncR type="linear" slope="0.95" intercept="0.01" />
          <feFuncG type="linear" slope="1.00" intercept="0.02" />
          <feFuncB type="linear" slope="1.05" intercept="0.04" />
        </feComponentTransfer>
      </filter>

      <!-- 3. 溫潤人像 (PORTRAIT_03): 鎢絲燈光感暖調、洋紅微相移、高光柔和滾降 -->
      <filter id="filter-tungsten-soft" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="
          1.14  0.02  0.00  0   0.03
          0.02  1.02  0.02  0   0.01
          0.00  0.02  0.86  0  -0.02
          0.00  0.00  0.00  1   0.00
        " />
      </filter>

      <!-- 4. 高反差單色 (MONO_SILVER_04): 經典紅橙濾鏡感黑白、暗部深邃銀鹽紀實 -->
      <filter id="filter-high-contrast-mono" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="
          0.48  0.42  0.10  0  0
          0.48  0.42  0.10  0  0
          0.48  0.42  0.10  0  0
          0.00  0.00  0.00  1  0
        " />
        <feComponentTransfer>
          <feFuncR type="gamma" amplitude="1" exponent="1.25" offset="-0.02" />
          <feFuncG type="gamma" amplitude="1" exponent="1.25" offset="-0.02" />
          <feFuncB type="gamma" amplitude="1" exponent="1.25" offset="-0.02" />
        </feComponentTransfer>
      </filter>
    </defs>
  </svg>

  <!-- TOP HEADER / TELEMETRY STATUS BAR -->
  <header class="top-nav hairline-b">
    <div class="brand-block">
      <span class="material-symbols-outlined brand-icon">lens_blur</span>
      <div class="brand-titles">
        <h1 class="brand-title font-headline">大相無形</h1>
        <span class="brand-sub font-mono">SLIPKNOTTING ON HEAVEN'S DOOR · 0.1.0</span>
      </div>
    </div>

    <!-- Active Hardware Ingestion Indicator -->
    <button 
      type="button"
      class="device-telemetry hairline-all" 
      onclick={() => {
        if (cameraMounts.length > 0) {
          handleLoadCameraMount(cameraMounts[0]);
        } else if (!IngestionService.isTauri()) {
          handlePickDirectory();
        } else {
          refreshCameraMounts();
        }
      }}
      title={cameraMounts.length > 0 ? '點擊一鍵載入相機 DCIM 底片' : !IngestionService.isTauri() ? '瀏覽器環境：點擊手動選取相機資料夾 (或執行桌面版自動偵測)' : '點擊重新偵測相機外接裝置'}
    >
      <span class="status-dot" class:scanning={isScanningMounts} class:connected={cameraMounts.length > 0}></span>
      <span class="device-name font-mono">
        {#if cameraMounts.length > 0}
          {cameraMounts[0].volume_name} // 隨插即讀已連線
        {:else if !IngestionService.isTauri()}
          瀏覽器模式 // 點擊開啟相機目錄 (RAW/JPG)
        {:else}
          未偵測到相機掛載
        {/if}
      </span>
      <span class="divider">|</span>
      <span class="device-metric font-mono">
        {#if cameraMounts.length > 0}
          載入 {cameraMounts[0].file_count} 幀 RAW ↵
        {:else if !IngestionService.isTauri()}
          支援手動載入
        {:else}
          等待接線
        {/if}
      </span>
    </button>

    <!-- 3-STEP SEQUENTIAL WORKFLOW BUTTONS -->
    <div class="stepper-pipeline hairline-all font-mono">
      <!-- Step 1: Catalog Selection -->
      <button 
        type="button" 
        class="stepper-step" 
        class:active={activeTab === 'catalog'}
        onclick={goToCatalog}
        title="按鈕一：目錄挑選底片"
      >
        <span class="step-num">01</span>
        <span class="step-label">目錄挑選</span>
        {#if flaggedCount > 0}
          <span class="step-tag amber">{flaggedCount} 幀</span>
        {:else if photoPlates.length > 0}
          <span class="step-tag">{photoPlates.length} 幀</span>
        {/if}
      </button>

      <span class="stepper-sep">➔</span>

      <!-- Step 2: Darkroom Retouch -->
      <button 
        type="button" 
        class="stepper-step" 
        class:active={activeTab === 'retouch'}
        onclick={goToRetouch}
        title="按鈕二：單張暗房精修（若有選取則僅出現選取底片，未選取則全部顯示）"
      >
        <span class="step-num">02</span>
        <span class="step-label">一鍵精修</span>
        {#if activeQueue.length > 0}
          <span class="step-tag" class:amber={flaggedCount > 0}>
            {activeQueue.length} 幀 {flaggedCount > 0 ? '(挑選)' : '(全量)'}
          </span>
        {/if}
      </button>

      <span class="stepper-sep">➔</span>

      <!-- Step 3: Batch Export -->
      <button 
        type="button" 
        class="stepper-step" 
        class:active={activeTab === 'export'}
        onclick={goToExport}
        title="按鈕三：批次導出管線"
      >
        <span class="step-num">03</span>
        <span class="step-label">批次導出</span>
        {#if activeQueue.length > 0}
          <span class="step-tag">{activeQueue.length} 幀</span>
        {/if}
      </button>
    </div>

    <!-- Right Controls: Dynamic Sequential Action Button -->
    <div class="top-actions">
      <div class="archival-chip font-mono amber">
        <span class="material-symbols-outlined" style="font-size: 14px;">bolt</span>
        RAW 預覽 {latestExtractionMs}MS
      </div>
      <div class="archival-chip font-mono">
        <span class="material-symbols-outlined" style="font-size: 14px;">memory</span>
        GPU 著色器 60FPS
      </div>

      {#if activeTab === 'catalog'}
        <!-- STEP 1 PRIMARY ACTION -->
        <button 
          class="archival-btn-primary stepper-cta amber-glow" 
          onclick={goToRetouch}
          disabled={photoPlates.length === 0}
          title="步驟一動作：一鍵進入暗房精修（若有選取則僅精修選取幀，未選取則精修全部）"
        >
          <span class="material-symbols-outlined" style="font-size: 16px;">tonality</span>
          <span>
            {#if flaggedCount > 0}
              一鍵精修 ({flaggedCount} 幀) →
            {:else}
              一鍵精修 (全部) →
            {/if}
          </span>
        </button>
      {:else if activeTab === 'retouch'}
        <!-- STEP 2 PRIMARY ACTION -->
        <button 
          class="archival-btn-primary stepper-cta cyan-glow" 
          onclick={goToExport}
          title="步驟二動作：完成調色，前往批次導出"
        >
          <span class="material-symbols-outlined" style="font-size: 16px;">output_circle</span>
          <span>完成精修，前往導出 ({activeQueue.length} 幀) →</span>
        </button>
      {:else}
        <!-- STEP 3 PRIMARY ACTION -->
        <button 
          class="archival-btn-primary stepper-cta" 
          onclick={triggerExport}
          disabled={isExporting || activeQueue.length === 0}
          title="步驟三動作：執行批次出圖管線"
        >
          <span class="material-symbols-outlined" style="font-size: 16px;">
            {exportMode === 'modeA' ? 'bolt' : 'hd'}
          </span>
          <span>{isExporting ? '匯出中...' : `批次導出 (${activeQueue.length} 幀) ⚡`}</span>
        </button>
      {/if}
    </div>
  </header>

  <!-- MAIN CURATORIAL WORKSPACE -->
  <main class="main-body">
    <!-- LEFT SIDEBAR: WORKFLOW MODULES -->
    <aside class="left-sidebar hairline-r">
      <div class="sidebar-heading font-mono">WORKFLOW MODULES</div>
      
      <nav class="nav-menu">
        <button 
          class="nav-item" 
          class:active={activeTab === 'catalog'} 
          onclick={goToCatalog}
        >
          <span class="material-symbols-outlined">grid_view</span>
          <span class="nav-label">1. 膠卷目錄挑圖</span>
          <span class="nav-badge font-mono">{photoPlates.length}</span>
        </button>

        <button 
          class="nav-item" 
          class:active={activeTab === 'retouch'} 
          onclick={goToRetouch}
        >
          <span class="material-symbols-outlined">tonality</span>
          <span class="nav-label">2. 單張暗房精修</span>
          {#if flaggedCount > 0}
            <span class="nav-badge font-mono amber">{flaggedCount}</span>
          {/if}
        </button>

        <button 
          class="nav-item" 
          class:active={activeTab === 'export'} 
          onclick={goToExport}
        >
          <span class="material-symbols-outlined">output_circle</span>
          <span class="nav-label">3. 批次匯出管線</span>
          <span class="nav-badge font-mono">{activeQueue.length}</span>
        </button>

        <button 
          class="nav-item" 
          class:active={activeTab === 'profiles'} 
          onclick={() => activeTab = 'profiles'}
        >
          <span class="material-symbols-outlined">palette</span>
          <span class="nav-label">3D LUT 風格庫</span>
          <span class="nav-badge font-mono">{profiles.length}</span>
        </button>

        <button 
          class="nav-item" 
          class:active={activeTab === 'devices'} 
          onclick={() => activeTab = 'devices'}
        >
          <span class="material-symbols-outlined">settings_input_component</span>
          <span class="nav-label">設備與存儲設定</span>
        </button>
      </nav>

      <!-- AI Scene Assistant Quick Dock (Step 2: 單張暗房精修專屬) -->
      {#if activeTab === 'retouch'}
        <div class="ai-assistant-dock hairline-t">
          <div class="ai-header">
            <span class="material-symbols-outlined ai-sparkle">auto_awesome</span>
            <span class="font-headline ai-title">AI 顯影調色</span>
            {#if isBatchAiRunning}
              <span class="ai-batch-badge font-mono amber">BATCH RUNNING</span>
            {/if}
          </div>
          <p class="ai-desc">Gemini 視覺多模態 · 智慧光學顯影</p>
          
          {#if aiTerminalLogs.length > 0}
            <!-- LIVE TERMINAL SCAN STREAM HUD -->
            <div class="ai-terminal-box hairline-all font-mono">
              <div class="terminal-bar hairline-b">
                <span class="term-dot red"></span>
                <span class="term-dot amber"></span>
                <span class="term-dot green"></span>
                <span class="term-title">DARKROOM://NEURAL_DEVELOP</span>
              </div>
              <div class="terminal-body custom-scroll">
                {#each aiTerminalLogs as line}
                  <div class="term-line">{line}</div>
                {/each}
                {#if isAiAnalyzing || isBatchAiRunning}
                  <div class="term-line active">
                    {#if batchProgress?.countdown}
                      <span class="term-blink amber">⚡ 速率保護冷卻中 ({batchProgress.countdown}s)...</span>
                    {:else}
                      <span class="term-cursor">▌</span>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- STATUS & INSIGHT SUMMARY CARD (始終常駐保留清晰資訊標籤) -->
          <div class="ai-status-card hairline-all">
            <div class="ai-row">
              <span class="ai-label font-mono">場景</span>
              <span class="ai-val font-mono">{aiSceneTitle || aiSuggestedScene}</span>
            </div>
            {#if aiRecommendedMood}
              <div class="ai-row">
                <span class="ai-label font-mono">推薦風格</span>
                <span class="ai-val font-mono amber">⚡ {aiRecommendedMood}</span>
              </div>
            {/if}
            <div class="ai-row">
              <span class="ai-label font-mono">信心指數</span>
              <span class="ai-val font-mono amber">{(aiConfidence * 100).toFixed(0)}%</span>
            </div>
            <div class="ai-row">
              <span class="ai-label font-mono">色彩檔</span>
              <span class="ai-val font-mono indigo">{activePhoto ? activePhoto.appliedProfile : '尚未載入'}</span>
            </div>
          </div>

          {#if aiStyleInsight}
            <div class="ai-insight-quote hairline-all font-body">
              <span class="material-symbols-outlined insight-icon">lightbulb</span>
              <div class="insight-text">{aiStyleInsight}</div>
            </div>
          {/if}

          <!-- GEMINI 視覺神經特徵標籤 -->
          {#if aiVisionTags.length > 0}
            <div class="ai-tags-box hairline-all font-mono">
              <div class="box-header">
                <span class="material-symbols-outlined" style="font-size: 13px; color: var(--amber-highlight);">visibility</span>
                <span>視覺特徵標籤 (GEMINI FLASH)</span>
              </div>
              <div class="chips-wrap">
                {#each aiVisionTags as tag}
                  <span class="vision-chip">#{tag}</span>
                {/each}
              </div>
            </div>
          {/if}

          <!-- AI Scope Responsibility Selector -->
          <div class="ai-scope-card hairline-all">
            <button 
              type="button" 
              class="ai-scope-toggle-btn font-mono"
              onclick={() => isAiScopeOpen = !isAiScopeOpen}
              title="展開或收合 AI 負責的調色與裁切範圍"
            >
              <div class="scope-header-left">
                <span class="material-symbols-outlined" style="font-size: 14px; color: var(--amber-highlight);">checklist</span>
                <span>AI 職責範圍勾選 ({Object.values(aiScope).filter(Boolean).length}/5)</span>
              </div>
              <span class="material-symbols-outlined scope-chevron" style:transform={isAiScopeOpen ? 'rotate(180deg)' : 'none'}>
                expand_more
              </span>
            </button>

            {#if isAiScopeOpen}
              <div class="ai-scope-list font-mono">
                <label class="scope-checkbox-row">
                  <input type="checkbox" checked={aiScope.lutProfile} onchange={() => toggleAiScope('lutProfile')} />
                  <span>3D LUT 風格推薦</span>
                </label>
                <label class="scope-checkbox-row">
                  <input type="checkbox" checked={aiScope.crop} onchange={() => toggleAiScope('crop')} />
                  <span>智慧構圖與裁切</span>
                </label>
                <label class="scope-checkbox-row">
                  <input type="checkbox" checked={aiScope.keystone} onchange={() => toggleAiScope('keystone')} />
                  <span>梯形與水平校正</span>
                </label>
                <label class="scope-checkbox-row">
                  <input type="checkbox" checked={aiScope.tone} onchange={() => toggleAiScope('tone')} />
                  <span>基礎光影與動態</span>
                </label>
                <label class="scope-checkbox-row">
                  <input type="checkbox" checked={aiScope.whiteBalance} onchange={() => toggleAiScope('whiteBalance')} />
                  <span>自動色溫與色偏</span>
                </label>
              </div>
            {/if}
          </div>

          <div class="ai-actions-stack">
            {#if isBatchAiRunning}
              <button 
                type="button"
                class="archival-btn-secondary danger w-full" 
                onclick={cancelBatchAi}
              >
                <span class="material-symbols-outlined" style="font-size: 16px;">cancel</span>
                <span>中止批次顯影 ({batchProgress?.current || 1}/{batchProgress?.total || 1})</span>
              </button>
            {:else}
              <button 
                type="button"
                class="archival-btn-primary w-full ai-main-btn" 
                onclick={() => runAiAnalysis()}
                disabled={isAiAnalyzing || !activePhoto}
              >
                <span class="material-symbols-outlined" style="font-size: 16px;">
                  {isAiAnalyzing ? 'progress_activity' : 'psychology'}
                </span>
                <span>{isAiAnalyzing ? '正在顯影調校...' : 'AI 顯影調色'}</span>
              </button>

              {#if photoPlates.length > 1}
                <button 
                  type="button"
                  class="archival-btn-secondary w-full batch-btn font-mono" 
                  onclick={runBatchAiAnalysis}
                  disabled={isAiAnalyzing}
                  title="針對所有已標記（或全部）相片循序進行 AI 顯影調色，含 15 RPM 速率保護"
                >
                  <span class="material-symbols-outlined" style="font-size: 15px;">auto_mode</span>
                  <span>批次顯影 ({flaggedPhotos.length > 0 ? `${flaggedPhotos.length} 張勾選` : `全簿 ${photoPlates.length} 張`})</span>
                </button>
              {/if}
            {/if}

            <button 
              type="button"
              class="vault-trigger-btn font-mono hairline-all" 
              onclick={() => isVaultOpen = true}
            >
              <span class="material-symbols-outlined" style="font-size: 14px;">
                {geminiKeyStatus.exists ? 'lock' : 'vpn_key'}
              </span>
              <span>
                {geminiKeyStatus.exists 
                  ? (geminiKeyStatus.mode === 'password' ? '金鑰保險庫 (密碼保護)' : geminiKeyStatus.mode === 'transparent' ? '金鑰保險庫 (透明加密)' : '金鑰保險庫 (無加密)') 
                  : '設定 AI 安全金鑰'}
              </span>
            </button>
          </div>
        </div>
      {/if}
    </aside>

    <!-- CENTER STAGE: PHOTOGRAPHIC PLATE VIEWPORT -->
    <section class="center-stage">
      {#if activeTab === 'catalog'}
        <!-- MODULE 1: CATALOG MATRIX (Phase 3 Virtual Grid) -->
        <CatalogView 
          photos={photoPlates}
          {activePhoto}
          {isLoadingPhotos}
          onSelectPhoto={(p) => selectPhoto(p)}
          onOpenRetouch={(p) => openRetouchForPhoto(p)}
          onGoToRetouch={goToRetouch}
          onPickDirectory={handlePickDirectory}
          onRefreshMounts={refreshCameraMounts}
          onToggleFlag={handleFlagToggled}
        />
      {:else if activeTab === 'retouch'}
        <!-- MODULE 2: RETOUCH DARKROOM WORKBENCH -->
        <div class="photo-stage-viewport">
          {#if exportNotice}
            <div class="export-notice-banner hairline-all font-mono">
              <span class="material-symbols-outlined" style="color: var(--amber-highlight); font-size: 18px;">check_circle</span>
              {exportNotice}
            </div>
          {/if}

          {#if activePhoto}
            <!-- CANVAS CONTAINER (SINGLE / SPLIT / SIDE-BY-SIDE 共享同一 WebGL 畫布與頂部標籤) -->
            <div 
              class="plate-canvas-wrapper hairline-all"
              class:is-side-by-side={diffMode === 'sideBySide'}
              bind:this={canvasContainerRef}
              onmousemove={handleStagePointerMove}
              onmouseup={handleStagePointerUp}
              onmouseleave={handleStagePointerUp}
              role="region"
              aria-label="暗房畫布視窗"
            >
              <!-- 頂部浮動列 (整齊置頂於照片上方中央，唯一的 plate-tag-bar) -->
              <div class="plate-tag-bar font-mono">
                <div class="plate-id-badge">
                  <span class="film-code">PLATE #{activePhoto.frameNo}</span>
                  <span class="film-file">{activePhoto.filename}</span>
                </div>

                <!-- STAGE HUD TOOLBAR (DIFF & CROP) 位於照片上方中央 -->
                <div class="stage-hud-bar font-mono hairline-all">
                  <div class="hud-left">
                    <span class="hud-title">VIEW DIFF:</span>
                    <div class="diff-btn-group">
                      <button 
                        type="button" 
                        class="diff-mode-btn" 
                        class:active={isDiffModeActive('off')}
                        onclick={() => setDiffMode('off')}
                      >
                        單幀顯影
                      </button>
                      <button 
                        type="button" 
                        class="diff-mode-btn" 
                        class:active={isDiffModeActive('split')}
                        onclick={() => setDiffMode('split')}
                        title="簾幕滑桿比對 (可左右拖曳分割線)"
                      >
                        <span class="material-symbols-outlined" style="font-size: 13px;">vertical_split</span>
                        <span>簾幕滑桿</span>
                      </button>
                      <button 
                        type="button" 
                        class="diff-mode-btn" 
                        class:active={isDiffModeActive('sideBySide')}
                        onclick={() => setDiffMode('sideBySide')}
                        title="雙聯幅並排比對"
                      >
                        <span class="material-symbols-outlined" style="font-size: 13px;">view_column</span>
                        <span>雙聯並排</span>
                      </button>
                    </div>
                  </div>

                  <div class="hud-right">
                    <button 
                      type="button" 
                      class="crop-toggle-btn" 
                      class:active={isCropMode}
                      onclick={() => isCropMode = !isCropMode}
                      title="開啟/關閉互動構圖裁切框"
                    >
                      <span class="material-symbols-outlined" style="font-size: 14px;">crop</span>
                      <span>{isCropMode ? '完成裁切' : '構圖裁切'}</span>
                    </button>

                    {#if cropWidth < 1 || cropHeight < 1 || cropRotation !== 0}
                      <button 
                        type="button" 
                        class="crop-reset-quick-btn" 
                        onclick={resetCropState}
                        title="還原為原始全幅構圖"
                      >
                        <span class="material-symbols-outlined" style="font-size: 13px;">restart_alt</span>
                      </button>
                    {/if}
                  </div>
                </div>

                <div class="plate-profile-badge">
                  <span class="profile-dot" style:background={activePhoto.appliedProfile ? 'var(--amber-highlight)' : 'var(--parchment-dim)'}></span>
                  <span>{activePhoto.appliedProfile}</span>
                </div>
              </div>

              <!-- Source Image for WebGL 3D LUT Texture Ingestion (常駐 DOM) -->
              <img 
                bind:this={sourceImgElement}
                src={activePhoto.thumbnail} 
                alt={activePhoto.filename} 
                class="source-hidden-img"
                onload={onSourceImgLoaded}
              />

              <!-- DIPTYCH LEFT PANE (雙聯並排時顯示的原圖) -->
              {#if diffMode === 'sideBySide'}
                <div class="diptych-pane left hairline-all">
                  <div class="diptych-badge font-mono">ORIGINAL // 本相 RAW</div>
                  <img src={activePhoto.thumbnail} alt="Original RAW" class="plate-render-img" />
                </div>
              {/if}

              <!-- DIPTYCH RIGHT PANE / MAIN VIEWPORT (唯一的 WebGL 畫布所在) -->
              <div class="diptych-pane right" class:hairline-all={diffMode === 'sideBySide'}>
                {#if diffMode === 'sideBySide'}
                  <div class="diptych-badge font-mono amber">GRADED // 顯影 {activePhoto.appliedProfile}</div>
                {/if}

                <!-- WebGL 2.0 3D LUT Hardware-Accelerated Viewport Canvas -->
                <canvas 
                  bind:this={webglCanvas}
                  class="plate-render-canvas"
                  style:transform={`scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1}) rotate(${cropRotation}deg)`}
                ></canvas>

                <!-- Fallback Image if WebGL is initializing or unsupported -->
                {#if !isWebglActive}
                  <img 
                    src={activePhoto.thumbnail} 
                    alt={activePhoto.filename} 
                    class="plate-render-img"
                    style:transform={`scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1}) rotate(${cropRotation}deg)`}
                  />
                {/if}

                <!-- SPLIT DIFF OVERLAY (Top layer: Original RAW with clip-path) -->
                {#if diffMode === 'split'}
                  <div 
                    class="split-original-layer"
                    style:clip-path={`polygon(0 0, ${splitPosition}% 0, ${splitPosition}% 100%, 0 100%)`}
                  >
                    <img src={activePhoto.thumbnail} alt="Original RAW" class="plate-render-img" />
                    <div class="split-label original font-mono">ORIGINAL 本相</div>
                  </div>
                  <div class="split-label graded font-mono">GRADED 顯影</div>

                  <!-- Interactive Divider Handle -->
                  <div 
                    class="split-divider-line"
                    style:left={`${splitPosition}%`}
                    onmousedown={handleSplitPointerDown}
                    role="slider"
                    aria-label="比對簾幕分割線"
                    aria-valuenow={splitPosition}
                    tabindex="0"
                  >
                    <div class="split-handle-grip font-mono">
                      <span>‹</span>
                      <span>›</span>
                    </div>
                  </div>
                {/if}

                <!-- INTERACTIVE CROP OVERLAY -->
                {#if isCropMode}
                  <div class="crop-overlay-stage">
                    <div 
                      class="crop-box-element"
                      style:left={`${cropX * 100}%`}
                      style:top={`${cropY * 100}%`}
                      style:width={`${cropWidth * 100}%`}
                      style:height={`${cropHeight * 100}%`}
                      onmousedown={(e) => handleCropStart('move', e)}
                      onkeydown={(e) => {
                        if (e.key === 'ArrowLeft') cropX = Math.max(0, cropX - 0.02);
                        if (e.key === 'ArrowRight') cropX = Math.min(1 - cropWidth, cropX + 0.02);
                        if (e.key === 'ArrowUp') cropY = Math.max(0, cropY - 0.02);
                        if (e.key === 'ArrowDown') cropY = Math.min(1 - cropHeight, cropY + 0.02);
                      }}
                      tabindex="0"
                      role="region"
                      aria-label="可拖曳調整之裁切構圖框"
                    >
                      <!-- Thirds Grid Lines -->
                      <div class="crop-grid-line v1"></div>
                      <div class="crop-grid-line v2"></div>
                      <div class="crop-grid-line h1"></div>
                      <div class="crop-grid-line h2"></div>

                      <!-- Handles -->
                      <div class="crop-handle nw" onmousedown={(e) => handleCropStart('nw', e)} role="button" tabindex="0" aria-label="左上角裁切把手"></div>
                      <div class="crop-handle se" onmousedown={(e) => handleCropStart('se', e)} role="button" tabindex="0" aria-label="右下角裁切把手"></div>

                      <div class="crop-readout font-mono">
                        {cropAspectRatio.toUpperCase()} · {(cropWidth * 100).toFixed(0)}% × {(cropHeight * 100).toFixed(0)}%
                        {#if cropRotation !== 0}
                          · {cropRotation > 0 ? `+${cropRotation}°` : `${cropRotation}°`}
                        {/if}
                      </div>
                    </div>
                  </div>
                {/if}

                <!-- A/B Comparison Toggle Floater -->
                <button 
                  type="button"
                  class="ab-toggle-btn hairline-all font-mono" 
                  onmousedown={() => showABComparison = true}
                  onmouseup={() => showABComparison = false}
                  onmouseleave={() => showABComparison = false}
                >
                  <span class="material-symbols-outlined" style="font-size: 15px;">compare</span>
                  <span>{showABComparison ? '原始本相 (RAW)' : '按住 A/B 比對 (Space)'}</span>
                </button>
              </div>
            </div>
          {:else}
            <!-- Empty State: Waiting for camera connection or local directory selection -->
            <div class="empty-stage-box hairline-all">
              <span class="material-symbols-outlined empty-stage-icon">camera_roll</span>
              <h3 class="font-headline empty-stage-title">等待相機裝置連接</h3>
              <p class="font-body empty-stage-desc">
                接上相機 USB/Type-C 傳輸線開機自動載入，或手動指定本機 DCIM / RAW 目錄開啟底片作業。
              </p>
              <div class="empty-actions">
                <button type="button" class="archival-btn-primary" onclick={handlePickDirectory} disabled={isLoadingPhotos}>
                  <span class="material-symbols-outlined" style="font-size: 16px;">folder_open</span>
                  <span>{isLoadingPhotos ? '正在解析 RAW/JPG...' : '開啟相片目錄 (RAW / JPG)'}</span>
                </button>
                <button type="button" class="archival-btn-secondary" onclick={refreshCameraMounts} disabled={isScanningMounts}>
                  <span class="material-symbols-outlined" style="font-size: 16px;">cable</span>
                  <span>{isScanningMounts ? '正在搜尋掛載...' : '重新偵測隨插即讀設備'}</span>
                </button>
              </div>
            </div>
          {/if}
        </div>

        <!-- PERSISTENT BOTTOM CONTACT SHEET LIGHT-TABLE STRIP (FILTERED BY SELECTION) -->
        <footer class="contact-sheet-strip hairline-t">
          <div class="strip-header font-mono">
            <div class="strip-info-left">
              <span class="strip-label">CONTACT SHEET // EXPOSURE RACK</span>
              <span class="strip-count" class:amber={flaggedCount > 0}>
                {activeQueue.length} FRAMES {flaggedCount > 0 ? '(已挑選精修佇列)' : '(全量底片佇列)'}
              </span>
            </div>
            <div class="strip-actions-right">
              <button type="button" class="strip-ctrl-btn" onclick={() => selectAdjacentPhoto(-1)} title="前一張底片 (H / ← 鍵)">
                <span class="material-symbols-outlined" style="font-size: 14px;">arrow_back</span>
                <span>前一張 [H]</span>
              </button>
              <button type="button" class="strip-ctrl-btn" onclick={() => selectAdjacentPhoto(1)} title="下一張底片 (L / → 鍵)">
                <span>下一張 [L]</span>
                <span class="material-symbols-outlined" style="font-size: 14px;">arrow_forward</span>
              </button>
              <button type="button" class="strip-ctrl-btn highlight" onclick={goToCatalog} title="返回第一步目錄重新選取">
                <span class="material-symbols-outlined" style="font-size: 14px;">grid_view</span>
                <span>返回挑圖</span>
              </button>
            </div>
          </div>
          <div class="strip-frames-scroll">
            {#if activeQueue.length > 0}
              {#each activeQueue as plate}
                <button 
                  type="button"
                  class="film-frame-card" 
                  class:selected={plate.selected}
                  onclick={() => selectPhoto(plate)}
                >
                  <div class="film-frame-outer">
                    <img src={plate.gradedThumbnail || plate.thumbnail} alt={plate.filename} class="film-frame-thumb" />
                  </div>
                  <div class="film-frame-meta font-mono">
                    <span class="frame-num">{plate.frameNo}</span>
                    <span class="frame-tag">{plate.camera.split(' ')[0]}</span>
                  </div>
                </button>
              {/each}
            {:else}
              <div class="empty-strip-hint font-mono">
                <span class="material-symbols-outlined" style="font-size: 14px;">exposure_zero</span>
                <span>尚無載入幀數 · 請點擊上方「開啟相片目錄」載入 RAW 檔</span>
              </div>
            {/if}
          </div>
        </footer>
      {:else if activeTab === 'profiles'}
        <!-- MODULE 3: 3D LUT PROFILES VAULT -->
        <ProfilesView 
          {profiles}
          activeProfileId={activePhoto ? activePhoto.appliedProfile : 'Profile_01_MatteShadow'}
          activePhotoTitle={activePhoto ? activePhoto.filename : '尚未選取相片'}
          onApplyProfile={(id) => applyProfile(id)}
          onApplyToAll={(id) => applyProfileToAll(id)}
        />
      {:else if activeTab === 'export'}
        <!-- MODULE 4: DUAL PIPELINE EXPORT DOCK (BOUND TO ACTIVE QUEUE) -->
        <ExportView 
          photos={activeQueue}
          {exportMode}
          {isExporting}
          {exportProgress}
          {exportNotice}
          {aiVisionTags}
          {aiSceneTitle}
          onSetExportMode={(m: 'modeA' | 'modeB') => exportMode = m}
          onTriggerExport={triggerExport}
        />
      {:else if activeTab === 'devices'}
        <!-- MODULE 5: HARDWARE MOUNTS & STORAGE SETTINGS -->
        <DevicesView 
          {cameraMounts}
          {isScanningMounts}
          {geminiKeyStatus}
          onRefreshMounts={refreshCameraMounts}
          onOpenVault={() => isVaultOpen = true}
          onLoadMount={(m: CameraMountInfo) => handleLoadCameraMount(m)}
          onPickDirectory={handlePickDirectory}
        />
      {/if}
    </section>

    <!-- RIGHT SIDEBAR: DARKROOM TELEMETRY & COLOR DOCK -->
    <aside class="right-telemetry hairline-l">
      <!-- EXIF Optical Telemetry -->
      <div class="telemetry-box hairline-b">
        <div class="box-title font-mono">EXIF OPTICAL TELEMETRY</div>
        <div class="optical-grid font-mono">
          <div class="optical-chip">
            <span class="opt-label">APERTURE</span>
            <span class="opt-val">{activePhoto ? activePhoto.aperture : '--'}</span>
          </div>
          <div class="optical-chip">
            <span class="opt-label">SHUTTER</span>
            <span class="opt-val">{activePhoto ? activePhoto.shutter : '--'}</span>
          </div>
          <div class="optical-chip">
            <span class="opt-label">ISO SPEED</span>
            <span class="opt-val amber">{activePhoto && activePhoto.iso > 0 ? `ISO ${activePhoto.iso}` : '--'}</span>
          </div>
          <div class="optical-chip">
            <span class="opt-label">FOCAL</span>
            <span class="opt-val">{activePhoto ? activePhoto.focalLength : '--'}</span>
          </div>
          <div class="optical-chip">
            <span class="opt-label">EXP. BIAS</span>
            <span class="opt-val">{activePhoto && activePhoto.exposureBias !== undefined ? (activePhoto.exposureBias > 0 ? `+${activePhoto.exposureBias.toFixed(2)} EV` : `${activePhoto.exposureBias.toFixed(2)} EV`) : '0.00 EV'}</span>
          </div>
          <div class="optical-chip">
            <span class="opt-label">PROGRAM</span>
            <span class="opt-val truncate" title={activePhoto?.exposureProgram || '--'}>{activePhoto?.exposureProgram || '--'}</span>
          </div>
          <div class="optical-chip">
            <span class="opt-label">METERING</span>
            <span class="opt-val truncate" title={activePhoto?.meteringMode || '--'}>{activePhoto?.meteringMode || '--'}</span>
          </div>
          <div class="optical-chip">
            <span class="opt-label">COLOR SPACE</span>
            <span class="opt-val amber">{activePhoto?.colorSpace || 'sRGB'}</span>
          </div>
          <div class="optical-chip">
            <span class="opt-label">AS-SHOT WB</span>
            <span class="opt-val">{activePhoto?.asShotTemp ? `${activePhoto.asShotTemp}K` : '5500K'}</span>
          </div>
          <div class="optical-chip">
            <span class="opt-label">FLASH</span>
            <span class="opt-val">{activePhoto?.flash || '未擊發'}</span>
          </div>
        </div>
        <div class="lens-line font-mono">
          <span class="material-symbols-outlined" style="font-size: 14px;">camera_alt</span>
          <span class="truncate">{activePhoto ? activePhoto.lens : '尚未選取相片'}</span>
        </div>
      </div>

      {#if activeTab === 'retouch'}
        <!-- CROP & GEOMETRY TELEMETRY BOX -->
        <div class="telemetry-box hairline-b">
          <div class="tuning-box-header">
            <div class="box-title font-mono">CROP & GEOMETRY</div>
            <div style="display: flex; gap: 4px;">
              <button 
                type="button" 
                class="quick-ai-btn font-mono"
                onclick={quickAiCrop}
                disabled={isAiAnalyzing || !activePhoto}
                title="一鍵讓 AI 判斷最佳構圖並套用裁切"
              >
                <span class="material-symbols-outlined" style="font-size: 12px; color: var(--amber-highlight);">auto_fix_high</span>
                <span>AI 裁切</span>
              </button>
              <button 
                type="button" 
                class="quick-ai-btn font-mono"
                onclick={quickAiHorizon}
                disabled={isAiAnalyzing || !activePhoto}
                title="一鍵讓 AI 自動校正地平線傾角"
              >
                <span class="material-symbols-outlined" style="font-size: 12px; color: var(--amber-highlight);">straighten</span>
                <span>AI 拉平</span>
              </button>
            </div>
          </div>

          <!-- Aspect Ratio Presets -->
          <div class="aspect-ratio-row font-mono">
            {#each ['original', '1:1', '4:5', '16:9', '9:16', 'free'] as const as ratio}
              <button 
                type="button" 
                class="ratio-chip" 
                class:active={cropAspectRatio === ratio}
                onclick={() => cropAspectRatio = ratio}
              >
                {ratio === 'original' ? '原圖' : ratio}
              </button>
            {/each}
          </div>

          <!-- Rotation Slider -->
          <div class="control-row">
            <div class="control-header font-mono">
              <span>ROTATION (水平旋轉)</span>
              <span class="control-val">{cropRotation > 0 ? `+${cropRotation.toFixed(1)}°` : `${cropRotation.toFixed(1)}°`}</span>
            </div>
            <input 
              type="range" 
              min="-45" 
              max="45" 
              step="0.1" 
              bind:value={cropRotation} 
              class="darkroom-slider"
            />
          </div>

          <!-- Vertical Keystone Slider -->
          <div class="control-row">
            <div class="control-header font-mono">
              <span>KEYSTONE V (垂直透視梯形)</span>
              <span class="control-val">{keystoneV > 0 ? `+${keystoneV.toFixed(1)}°` : `${keystoneV.toFixed(1)}°`}</span>
            </div>
            <input 
              type="range" 
              min="-30" 
              max="30" 
              step="0.5" 
              bind:value={keystoneV} 
              class="darkroom-slider"
            />
          </div>

          <!-- Flip & Reset Controls -->
          <div class="geom-actions-row font-mono">
            <button 
              type="button" 
              class="geom-btn" 
              class:active={flipH}
              onclick={() => flipH = !flipH}
              title="水平鏡像翻轉"
            >
              <span class="material-symbols-outlined" style="font-size: 13px;">flip</span>
              <span>水平翻轉</span>
            </button>
            <button 
              type="button" 
              class="geom-btn" 
              class:active={flipV}
              onclick={() => flipV = !flipV}
              title="垂直鏡像翻轉"
            >
              <span class="material-symbols-outlined" style="font-size: 13px; transform: rotate(90deg);">flip</span>
              <span>垂直翻轉</span>
            </button>
            <button 
              type="button" 
              class="geom-btn reset"
              onclick={resetCropState}
              title="重設裁切與透視"
            >
              <span class="material-symbols-outlined" style="font-size: 13px;">restart_alt</span>
              <span>重設幾何</span>
            </button>
          </div>
        </div>

        <!-- Color Adjustment Sliders -->
        <div class="telemetry-box hairline-b">
          <div class="tuning-box-header">
            <div class="box-title font-mono">3D LUT TUNING</div>
            <div style="display: flex; gap: 4px; align-items: center;">
              <button 
                type="button" 
                class="quick-ai-btn font-mono"
                onclick={quickAiTone}
                disabled={isAiAnalyzing || !activePhoto}
                title="一鍵讓 AI 分析光比動態 (曝光/對比/陰影)"
              >
                <span class="material-symbols-outlined" style="font-size: 12px; color: var(--amber-highlight);">exposure</span>
                <span>AI 光比</span>
              </button>
              <button 
                type="button" 
                class="quick-ai-btn font-mono"
                onclick={quickAiWhiteBalance}
                disabled={isAiAnalyzing || !activePhoto}
                title="一鍵讓 AI 自動校準白平衡與色偏"
              >
                <span class="material-symbols-outlined" style="font-size: 12px; color: var(--amber-highlight);">thermostat</span>
                <span>AI 白平衡</span>
              </button>
              <button 
                type="button" 
                class="reset-tuning-btn font-mono"
                onclick={resetToAsShot}
                title="還原為相機原生拍攝時的色溫與曝光 (As Shot)"
              >
                <span class="material-symbols-outlined" style="font-size: 13px;">photo_camera</span>
                <span>拍攝原值</span>
              </button>
              <button 
                type="button" 
                class="reset-tuning-btn font-mono"
                onclick={resetTuningParams}
                title="恢復為無偏色直出基準值 (5500K / 0 EV)"
              >
                <span class="material-symbols-outlined" style="font-size: 13px;">restart_alt</span>
                <span>重設</span>
              </button>
            </div>
          </div>

          <!-- Slider 1: Exposure -->
          <div class="control-row">
            <div class="control-header font-mono">
              <span>EXPOSURE (EV)</span>
              <span class="control-val">{exposure > 0 ? `+${exposure.toFixed(2)}` : exposure.toFixed(2)}</span>
            </div>
            <input 
              type="range" 
              min="-2.0" 
              max="2.0" 
              step="0.05" 
              bind:value={exposure} 
              class="darkroom-slider"
            />
          </div>

          <!-- Slider 2: Contrast -->
          <div class="control-row">
            <div class="control-header font-mono">
              <span>CONTRAST (對比)</span>
              <span class="control-val">{contrast > 0 ? `+${Math.round(contrast * 100)}%` : `${Math.round(contrast * 100)}%`}</span>
            </div>
            <input 
              type="range" 
              min="-0.8" 
              max="0.8" 
              step="0.02" 
              bind:value={contrast} 
              class="darkroom-slider"
            />
          </div>

          <!-- Slider 3: LUT Intensity -->
          <div class="control-row">
            <div class="control-header font-mono">
              <span>LUT INTENSITY (風格濃度)</span>
              <span class="control-val amber">{Math.round(lutIntensity * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              bind:value={lutIntensity} 
              class="darkroom-slider"
            />
          </div>

          <!-- Slider 4: Color Temp -->
          <div class="control-row">
            <div class="control-header font-mono">
              <span>KELVIN SCALE</span>
              <span class="control-val">{colorTemp}K</span>
            </div>
            <input 
              type="range" 
              min="2800" 
              max="8500" 
              step="50" 
              bind:value={colorTemp} 
              class="darkroom-slider"
            />
          </div>

          <!-- Slider 4.5: Tint (Green <-> Magenta) -->
          <div class="control-row">
            <div class="control-header font-mono">
              <span>TINT (色調微調)</span>
              <span class="control-val">{tint > 0 ? `+${Math.round(tint)} (洋紅)` : (tint < 0 ? `${Math.round(tint)} (青綠)` : '0')}</span>
            </div>
            <input 
              type="range" 
              min="-100" 
              max="100" 
              step="1" 
              bind:value={tint} 
              class="darkroom-slider"
            />
          </div>

          <!-- Slider 5: Clarity -->
          <div class="control-row">
            <div class="control-header font-mono">
              <span>CLARITY (清晰度)</span>
              <span class="control-val">{clarity > 0 ? `+${Math.round(clarity * 100)}%` : `${Math.round(clarity * 100)}%`}</span>
            </div>
            <input 
              type="range" 
              min="-1.0" 
              max="1.0" 
              step="0.05" 
              bind:value={clarity} 
              class="darkroom-slider"
            />
          </div>

          <!-- Slider 6: Sharpness -->
          <div class="control-row">
            <div class="control-header font-mono">
              <span>SHARPNESS (銳利度)</span>
              <span class="control-val">{Math.round(sharpness * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0.0" 
              max="1.0" 
              step="0.05" 
              bind:value={sharpness} 
              class="darkroom-slider"
            />
          </div>
        </div>

        <!-- 3D LUT Vault Quick Select -->
        <div class="telemetry-box">
          <div class="tuning-box-header">
            <div class="box-title font-mono">3D LUT PROFILES (ANONYMIZED)</div>
            <button 
              type="button" 
              class="quick-ai-btn font-mono"
              onclick={quickAiProfile}
              disabled={isAiAnalyzing || !activePhoto}
              title="一鍵讓 AI 推薦最合適的風格檔"
            >
              <span class="material-symbols-outlined" style="font-size: 12px; color: var(--amber-highlight);">palette</span>
              <span>AI 推薦</span>
            </button>
          </div>
          <div class="profile-cards-list">
            {#each profiles as prof}
              <button 
                type="button"
                class="profile-card hairline-all" 
                class:active={activePhoto?.appliedProfile === prof.id}
                onclick={() => applyProfile(prof.id)}
              >
                <div class="prof-card-top">
                  <span class="prof-title font-headline">{prof.title}</span>
                  <span class="prof-badge font-mono">{prof.badge}</span>
                </div>
                <div class="prof-tone font-body">{prof.tone}</div>
              </button>
            {/each}
          </div>
        </div>

        <!-- 下一個步驟：前往步驟三 批次匯出管線 -->
        <div class="telemetry-box hairline-t mt-auto">
          <button 
            type="button" 
            class="archival-btn-primary w-full step2-cta-btn" 
            onclick={goToExport}
            title="步驟二完成：前往步驟三 批次匯出管線"
          >
            <span class="material-symbols-outlined" style="font-size: 15px;">output_circle</span>
            <span>完成調色，前往匯出管線 ({activeQueue.length} 幀) →</span>
          </button>
        </div>
      {:else if activeTab === 'catalog'}
        <!-- CATALOG STAGE: 勾選的圖片預覽清單 -->
        <div class="telemetry-box curatorial-preview-box">
          <div class="curatorial-preview-header">
            <div class="box-title font-mono" style="margin-bottom: 0;">
              PICKED PREVIEWS ({flaggedCount} 幀)
            </div>
            {#if flaggedCount > 0}
              <button 
                type="button" 
                class="clear-flags-btn font-mono" 
                onclick={clearAllFlags}
                title="清空所有挑圖勾選"
              >
                清空勾選
              </button>
            {/if}
          </div>

          {#if flaggedCount > 0}
            <div class="curatorial-thumbs-list">
              {#each flaggedPhotos as item (item.id)}
                <div 
                  class="curatorial-thumb-item hairline-all" 
                  class:active={activePhoto?.id === item.id}
                  onclick={() => selectPhoto(item)}
                  ondblclick={() => openRetouchForPhoto(item)}
                  title="點擊聚焦預覽，雙擊前往精修"
                >
                  <div class="thumb-img-wrapper">
                    <img 
                      src={item.gradedThumbnail || item.thumbnail} 
                      alt={item.filename} 
                      class="thumb-img"
                      loading="lazy"
                    />
                    <span class="thumb-frame-tag font-mono">#{item.frameNo}</span>
                  </div>
                  <div class="thumb-info font-mono">
                    <div class="thumb-filename truncate">{item.filename}</div>
                    <div class="thumb-meta">
                      <span>{item.shutter}</span>
                      <span>{item.aperture}</span>
                      <span>ISO {item.iso}</span>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    class="thumb-unflag-btn" 
                    onclick={(e) => togglePhotoFlag(item, e)}
                    title="取消勾選此張相片"
                  >
                    <span class="material-symbols-outlined" style="font-size: 14px;">close</span>
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <!-- Empty state when no photo is flagged yet -->
            <div class="empty-curatorial-card hairline-all font-mono">
              <span class="material-symbols-outlined empty-guide-icon">bookmarks</span>
              <div class="empty-guide-title">尚未勾選任何相片</div>
              <p class="empty-guide-desc">
                在目錄中按 <kbd class="kbd-chip">Space</kbd> 或點擊右上角書籤標記挑圖。
              </p>
              <div class="empty-guide-sub">
                ※ 若未特別勾選，前往精修時將自動帶入全部 ({photoPlates.length} 幀)
              </div>
            </div>
          {/if}
        </div>

        <!-- 下一個步驟是前往精修（不顯示 export pipeline spec） -->
        <div class="telemetry-box hairline-t mt-auto">
          <button 
            type="button" 
            class="archival-btn-primary w-full step-cta-btn" 
            onclick={goToRetouch}
            disabled={photoPlates.length === 0}
            title="下一個步驟：前往暗房精修"
          >
            <span class="material-symbols-outlined" style="font-size: 16px;">tonality</span>
            <span>
              {flaggedCount > 0 
                ? `前往暗房精修 (已選 ${flaggedCount} 幀) →` 
                : `前往暗房精修 (全量 ${photoPlates.length} 幀) →`}
            </span>
          </button>
        </div>
      {/if}
    </aside>
  </main>

  <!-- AI Key Vault Modal -->
  <KeyVaultModal bind:isOpen={isVaultOpen} onClose={refreshKeyStatus} />
</div>

<style>
  .workspace-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background-color: var(--canvas-base);
    color: var(--parchment-bright);
    overflow: hidden;
  }

  /* TOP NAVIGATION */
  .top-nav {
    height: 52px;
    background-color: var(--surface-panel);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }

  .brand-block {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand-icon {
    color: var(--amber-highlight);
    font-size: 24px;
  }
  .brand-titles {
    display: flex;
    flex-direction: column;
  }
  .brand-title {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: 0.05em;
  }
  .brand-sub {
    font-size: 9px;
    color: var(--parchment-dim);
    letter-spacing: 0.08em;
  }

  .device-telemetry {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    cursor: pointer;
    border: 1px solid var(--hairline-slate);
    color: inherit;
    transition: all 0.15s ease;
  }
  .device-telemetry:hover {
    border-color: var(--primary-indigo);
    background-color: var(--surface-overlay);
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--primary-indigo);
    box-shadow: 0 0 6px var(--primary-indigo);
  }
  .status-dot.scanning {
    background-color: var(--amber-highlight);
    box-shadow: 0 0 6px var(--amber-highlight);
    animation: dotPulse 0.8s ease-in-out infinite alternate;
  }
  @keyframes dotPulse {
    from { opacity: 0.4; }
    to { opacity: 1; }
  }
  .device-name {
    color: var(--parchment-bright);
  }
  .divider {
    color: var(--parchment-ghost);
  }
  .device-metric {
    color: var(--amber-highlight);
  }

  .top-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* 3-STEP SEQUENTIAL PIPELINE */
  .stepper-pipeline {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: rgba(22, 23, 26, 0.85);
    padding: 3px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline-slate);
    user-select: none;
  }

  .stepper-step {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--parchment-dim);
    padding: 4px 8px;
    border-radius: var(--radius-xs);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .stepper-step:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-elevated);
  }

  .stepper-step.active {
    background-color: var(--surface-overlay);
    color: var(--parchment-bright);
    border-color: var(--hairline-slate);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
  }

  .step-num {
    color: var(--primary-indigo);
    font-weight: 700;
    font-size: 10px;
  }

  .stepper-step.active .step-num {
    color: var(--amber-highlight);
  }

  .step-label {
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .step-tag {
    font-size: 10px;
    background-color: var(--surface-elevated);
    color: var(--parchment-dim);
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .step-tag.amber {
    color: var(--amber-highlight);
    border-color: rgba(226, 157, 82, 0.3);
    background-color: rgba(226, 157, 82, 0.1);
  }

  .stepper-sep {
    font-size: 10px;
    color: var(--parchment-ghost);
    opacity: 0.6;
  }

  /* STEPPER CTA HIGHLIGHTS */
  .stepper-cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .amber-glow {
    background: linear-gradient(135deg, var(--amber-highlight), #d48b3b) !important;
    color: #121214 !important;
    border: 1px solid rgba(226, 157, 82, 0.9) !important;
    box-shadow: 0 0 14px rgba(226, 157, 82, 0.3);
  }

  .amber-glow:hover {
    filter: brightness(1.1);
    box-shadow: 0 0 18px rgba(226, 157, 82, 0.45);
  }

  .cyan-glow {
    background: linear-gradient(135deg, #4b92b6, #2d6b8c) !important;
    color: #ffffff !important;
    border: 1px solid rgba(75, 146, 182, 0.9) !important;
    box-shadow: 0 0 14px rgba(75, 146, 182, 0.3);
  }

  .cyan-glow:hover {
    filter: brightness(1.1);
    box-shadow: 0 0 18px rgba(75, 146, 182, 0.45);
  }

  /* STEP 2 IN-PANEL CTA BUTTON */
  .step2-cta-btn {
    margin-top: 10px;
    background: linear-gradient(135deg, var(--primary-indigo), #3a506b) !important;
    border: 1px solid rgba(138, 154, 184, 0.4) !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    font-weight: 600;
  }

  .step2-cta-btn:hover {
    filter: brightness(1.1);
  }

  /* MAIN WORKSPACE LAYOUT */
  .main-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* LEFT SIDEBAR */
  .left-sidebar {
    width: var(--sidebar-width);
    background-color: var(--surface-panel);
    display: flex;
    flex-direction: column;
    padding: 14px 10px;
    flex-shrink: 0;
  }

  .sidebar-heading {
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--parchment-dim);
    padding: 0 8px 10px 8px;
  }

  .nav-menu {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: var(--parchment-muted);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    width: 100%;
  }
  .nav-item:hover {
    background-color: var(--surface-elevated);
    color: var(--parchment-bright);
  }
  .nav-item.active {
    background-color: var(--surface-overlay);
    color: var(--parchment-bright);
    border-left: 2px solid var(--primary-indigo);
  }
  .nav-label {
    flex: 1;
  }
  .nav-badge {
    font-size: 10px;
    padding: 2px 6px;
    background-color: var(--canvas-base);
    border-radius: var(--radius-xs);
    color: var(--parchment-dim);
  }

  .ai-assistant-dock {
    margin-top: auto;
    padding-top: 14px;
  }
  .ai-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }
  .ai-sparkle {
    color: var(--amber-highlight);
    font-size: 16px;
  }
  .ai-title {
    font-size: 13px;
    font-weight: 600;
  }
  .ai-desc {
    font-size: 11px;
    color: var(--parchment-dim);
    margin-bottom: 10px;
  }
  .ai-status-card {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    margin-bottom: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ai-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }
  .ai-label {
    color: var(--parchment-dim);
  }
  .ai-val {
    color: var(--parchment-bright);
  }
  .ai-val.amber {
    color: var(--amber-highlight);
  }
  .ai-val.indigo {
    color: var(--primary-indigo);
  }
  .w-full {
    width: 100%;
    justify-content: center;
  }
  .ai-actions-stack {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* LIVE TERMINAL SCAN STREAM HUD STYLES */
  .ai-terminal-box {
    background-color: #0b0d10;
    border-radius: var(--radius-sm);
    overflow: hidden;
    margin-bottom: 10px;
    box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.8), 0 0 10px rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(226, 157, 82, 0.25);
  }
  .terminal-bar {
    background-color: #12141a;
    padding: 4px 8px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .term-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .term-dot.red { background-color: #e06c75; }
  .term-dot.amber { background-color: #e5c07b; }
  .term-dot.green { background-color: #98c379; }
  .term-title {
    font-size: 8px;
    letter-spacing: 0.08em;
    color: var(--parchment-dim);
    margin-left: 4px;
  }
  .terminal-body {
    padding: 8px 10px;
    max-height: 120px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .term-line {
    font-size: 10px;
    line-height: 1.35;
    color: #98c379;
    word-break: break-all;
  }
  .term-line.active {
    color: var(--amber-highlight);
  }
  .term-cursor {
    animation: termBlink 0.8s infinite;
    color: var(--amber-highlight);
  }
  .term-blink {
    animation: termBlink 1s infinite;
  }
  @keyframes termBlink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.2; }
  }

  .ai-batch-badge {
    font-size: 8px;
    padding: 1px 4px;
    border-radius: 2px;
    background-color: rgba(226, 157, 82, 0.15);
    border: 1px solid rgba(226, 157, 82, 0.4);
    margin-left: auto;
  }
  .ai-insight-quote {
    background-color: rgba(226, 157, 82, 0.08);
    border-left: 2px solid var(--amber-highlight);
    border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
    padding: 6px 8px;
    margin-bottom: 10px;
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }
  .insight-icon {
    font-size: 13px;
    color: var(--amber-highlight);
    flex-shrink: 0;
    margin-top: 1px;
  }
  .insight-text {
    font-size: 10px;
    color: var(--parchment-muted);
    line-height: 1.35;
  }

  /* GEMINI 視覺神經標籤樣式 */
  .ai-tags-box {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    margin-bottom: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .box-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    color: var(--parchment-dim);
    letter-spacing: 0.04em;
  }
  .chips-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .vision-chip {
    font-size: 10px;
    background-color: var(--canvas-base);
    color: var(--amber-highlight);
    border: 1px solid rgba(226, 157, 82, 0.3);
    border-radius: var(--radius-xs);
    padding: 2px 6px;
  }

  .ai-main-btn {
    background: linear-gradient(135deg, #3d5a80, #293241) !important;
    border: 1px solid rgba(152, 195, 121, 0.4) !important;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
  }
  .ai-main-btn:hover {
    border-color: #98c379 !important;
  }
  .batch-btn {
    font-size: 10px !important;
    padding: 5px 8px !important;
  }

  .vault-trigger-btn {
    background: transparent;
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-sm);
    color: var(--parchment-muted);
    font-size: 10px;
    padding: 5px 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .vault-trigger-btn:hover {
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    background-color: var(--surface-elevated);
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

  .photo-stage-viewport {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    position: relative;
    overflow: hidden;
  }

  .export-notice-banner {
    position: absolute;
    top: 16px;
    background-color: var(--surface-overlay);
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--parchment-bright);
    z-index: 10;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  }

  .plate-canvas-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #08090b;
    border-radius: var(--radius-sm);
    overflow: hidden;
    box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.8), 0 16px 48px rgba(0, 0, 0, 0.7);
  }

  .plate-canvas-wrapper.is-side-by-side {
    flex-direction: row;
    gap: 14px;
    padding: 56px 14px 14px 14px;
    align-items: stretch;
  }

  .source-hidden-img {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .plate-render-canvas,
  .plate-render-img {
    max-width: 95%;
    max-height: 92%;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
    user-select: none;
    -webkit-user-drag: none;
    border-radius: 2px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.85);
    transition: transform 0.2s ease;
  }

  .tuning-box-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .reset-tuning-btn {
    background: transparent;
    border: 1px solid var(--border-hairline);
    color: var(--parchment-dim);
    font-size: 11px;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .reset-tuning-btn:hover {
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    background-color: var(--surface-overlay);
  }

  .plate-tag-bar {
    position: absolute;
    top: 14px;
    left: 16px;
    right: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    pointer-events: none;
    z-index: 20;
  }
  .plate-tag-bar > * {
    pointer-events: auto;
  }
  .plate-id-badge {
    background-color: rgba(14, 15, 18, 0.82);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }
  .film-code {
    color: var(--amber-highlight);
    font-weight: 600;
  }
  .film-file {
    color: var(--parchment-bright);
    letter-spacing: 0.05em;
  }

  .plate-profile-badge {
    background-color: rgba(14, 15, 18, 0.82);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--parchment-bright);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }
  .profile-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .ab-toggle-btn {
    position: absolute;
    bottom: 16px;
    right: 16px;
    background-color: rgba(18, 19, 23, 0.88);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--parchment-bright);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6);
    transition: all 0.15s ease;
    z-index: 10;
  }
  .ab-toggle-btn:hover {
    background-color: var(--primary-indigo);
    color: var(--canvas-base);
    border-color: var(--primary-indigo);
  }

  /* BOTTOM CONTACT SHEET STRIP */
  .contact-sheet-strip {
    height: var(--contact-strip-height);
    background-color: var(--surface-panel);
    display: flex;
    flex-direction: column;
    padding: 6px 12px;
    flex-shrink: 0;
  }
  .strip-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    color: var(--parchment-dim);
    margin-bottom: 6px;
    letter-spacing: 0.08em;
  }
  .strip-info-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .strip-count.amber {
    color: var(--amber-highlight);
    font-weight: 600;
  }
  .strip-actions-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .strip-ctrl-btn {
    background-color: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-dim);
    padding: 3px 8px;
    border-radius: var(--radius-xs);
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s ease;
  }
  .strip-ctrl-btn:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
    border-color: var(--parchment-dim);
  }
  .strip-ctrl-btn.highlight {
    color: var(--amber-highlight);
    border-color: rgba(226, 157, 82, 0.4);
    background-color: rgba(226, 157, 82, 0.1);
  }
  .strip-ctrl-btn.highlight:hover {
    background-color: rgba(226, 157, 82, 0.2);
  }
  .strip-frames-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .film-frame-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    flex-shrink: 0;
    background: transparent;
    border: none;
    padding: 0;
    outline: none;
  }
  .film-frame-outer {
    width: 64px;
    height: 48px;
    border: 1px solid var(--hairline-slate);
    overflow: hidden;
    position: relative;
    border-radius: 0;
  }
  .film-frame-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .film-frame-card.selected .film-frame-outer {
    border: 1.5px solid var(--amber-highlight);
    outline: 1px solid var(--canvas-base);
  }
  .film-frame-meta {
    display: flex;
    gap: 4px;
    font-size: 9px;
    color: var(--parchment-dim);
    margin-top: 2px;
  }
  .film-frame-card.selected .frame-num {
    color: var(--amber-highlight);
    font-weight: 600;
  }

  /* RIGHT TELEMETRY SIDEBAR */
  .right-telemetry {
    width: var(--telemetry-width);
    background-color: var(--surface-panel);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .telemetry-box {
    padding: 14px;
  }
  .box-title {
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--parchment-dim);
    margin-bottom: 10px;
  }

  .optical-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-bottom: 8px;
  }
  .optical-chip {
    background-color: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    padding: 6px 8px;
    border-radius: var(--radius-xs);
    display: flex;
    flex-direction: column;
  }
  .opt-label {
    font-size: 9px;
    color: var(--parchment-dim);
  }
  .opt-val {
    font-size: 13px;
    color: var(--parchment-bright);
  }
  .opt-val.amber {
    color: var(--amber-highlight);
  }
  .lens-line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--parchment-muted);
  }
  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* CONTROLS */
  .control-row {
    margin-bottom: 12px;
  }
  .control-header {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--parchment-muted);
    margin-bottom: 4px;
  }
  .control-val {
    color: var(--parchment-bright);
  }
  .control-val.amber {
    color: var(--amber-highlight);
  }

  /* PROFILES LIST */
  .profile-cards-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .profile-card {
    background-color: var(--surface-elevated);
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid var(--hairline-slate);
    width: 100%;
    text-align: left;
    outline: none;
    font-family: inherit;
  }
  .profile-card:hover {
    background-color: var(--surface-overlay);
  }
  .profile-card.active {
    border-color: var(--amber-highlight);
    background-color: var(--surface-overlay);
  }
  .prof-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 3px;
  }
  .prof-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--parchment-bright);
  }
  .prof-badge {
    font-size: 9px;
    color: var(--parchment-dim);
    background-color: var(--canvas-base);
    padding: 1px 4px;
    border-radius: var(--radius-xs);
  }
  .prof-tone {
    font-size: 10px;
    color: var(--parchment-muted);
    line-height: 1.3;
  }

  .mt-auto {
    margin-top: auto;
  }

  /* EMPTY STAGE & STRIP */
  .empty-stage-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 32px;
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    max-width: 520px;
    text-align: center;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
  }
  .empty-stage-icon {
    font-size: 56px;
    color: var(--parchment-dim);
    margin-bottom: 16px;
    opacity: 0.7;
  }
  .empty-stage-title {
    font-size: 20px;
    color: var(--parchment-bright);
    margin: 0 0 8px 0;
  }
  .empty-stage-desc {
    font-size: 13px;
    color: var(--parchment-muted);
    line-height: 1.6;
    margin: 0 0 24px 0;
  }
  .empty-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .empty-strip-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--parchment-dim);
    padding: 12px 4px;
  }

  /* CURATORIAL PICKED PREVIEW (CATALOG MODE RIGHT SIDEBAR) */
  .curatorial-preview-box {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .curatorial-preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .clear-flags-btn {
    background: transparent;
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    color: var(--parchment-dim);
    font-size: 10px;
    padding: 2px 7px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .clear-flags-btn:hover {
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
  }
  .curatorial-thumbs-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    max-height: calc(100vh - 380px);
    padding-right: 4px;
  }
  .curatorial-thumb-item {
    display: flex;
    align-items: center;
    gap: 10px;
    background-color: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-sm);
    padding: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .curatorial-thumb-item:hover {
    background-color: var(--surface-overlay);
    border-color: var(--parchment-muted);
  }
  .curatorial-thumb-item.active {
    border-color: var(--amber-highlight);
    background-color: var(--surface-overlay);
  }
  .thumb-img-wrapper {
    position: relative;
    width: 52px;
    height: 52px;
    flex-shrink: 0;
    border-radius: var(--radius-xs);
    overflow: hidden;
    background-color: var(--canvas-base);
  }
  .thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .thumb-frame-tag {
    position: absolute;
    bottom: 2px;
    left: 2px;
    background: rgba(0, 0, 0, 0.75);
    color: var(--amber-highlight);
    font-size: 9px;
    padding: 1px 3px;
    border-radius: 2px;
  }
  .thumb-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .thumb-filename {
    font-size: 11px;
    color: var(--parchment-bright);
    font-weight: 500;
  }
  .thumb-meta {
    font-size: 9px;
    color: var(--parchment-dim);
    display: flex;
    gap: 6px;
  }
  .thumb-unflag-btn {
    background: transparent;
    border: none;
    color: var(--parchment-dim);
    padding: 4px;
    cursor: pointer;
    border-radius: var(--radius-xs);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: all 0.15s ease;
  }
  .thumb-unflag-btn:hover {
    opacity: 1;
    color: #ff6b6b;
    background: rgba(255, 107, 107, 0.15);
  }
  .empty-curatorial-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px 14px;
    background-color: var(--surface-elevated);
    border: 1px dashed var(--hairline-slate);
    border-radius: var(--radius-sm);
    color: var(--parchment-muted);
    gap: 8px;
  }
  .empty-guide-icon {
    font-size: 28px;
    color: var(--parchment-dim);
  }
  .empty-guide-title {
    font-size: 12px;
    color: var(--parchment-bright);
    font-weight: 600;
  }
  .empty-guide-desc {
    font-size: 10px;
    color: var(--parchment-dim);
    line-height: 1.5;
    margin: 0;
  }
  .kbd-chip {
    background: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 9px;
    color: var(--amber-highlight);
  }
  .empty-guide-sub {
    font-size: 9px;
    color: var(--parchment-dim);
    opacity: 0.8;
    margin-top: 4px;
  }
  .step-cta-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 14px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  /* AI SCOPE RESPONSIBILITY SELECTOR */
  .ai-scope-card {
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-sm);
    overflow: hidden;
    margin-bottom: 8px;
  }
  .ai-scope-toggle-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    background: transparent;
    border: none;
    color: var(--parchment-bright);
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .ai-scope-toggle-btn:hover {
    background-color: var(--surface-elevated);
  }
  .scope-header-left {
    display: flex;
    align-items: center;
    gap: 6px;
    letter-spacing: 0.04em;
  }
  .scope-chevron {
    font-size: 16px;
    color: var(--parchment-dim);
    transition: transform 0.2s ease;
  }
  .ai-scope-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px 10px;
    background-color: var(--canvas-base);
    border-top: 1px solid var(--hairline-slate);
    font-size: 10.5px;
  }
  .scope-checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--parchment-muted);
    cursor: pointer;
    user-select: none;
    transition: color 0.15s ease;
  }
  .scope-checkbox-row:hover {
    color: var(--parchment-bright);
  }
  .scope-checkbox-row input[type="checkbox"] {
    accent-color: var(--amber-highlight);
    cursor: pointer;
    width: 13px;
    height: 13px;
  }

  /* STAGE HUD TOOLBAR (DIFF & CROP) - 懸浮於照片上方中央 */
  .stage-hud-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 3px 8px;
    background-color: rgba(14, 15, 18, 0.88);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-sm);
    font-size: 11px;
    pointer-events: auto;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    z-index: 15;
  }
  .hud-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .hud-title {
    color: var(--parchment-dim);
    font-size: 10px;
    letter-spacing: 0.06em;
  }
  .diff-btn-group {
    display: flex;
    align-items: center;
    background-color: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    padding: 2px;
    gap: 2px;
  }
  .diff-mode-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: transparent;
    border: none;
    border-radius: 2px;
    color: var(--parchment-dim);
    font-size: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .diff-mode-btn:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-elevated);
  }
  .diff-mode-btn.active {
    background-color: var(--surface-overlay);
    color: var(--amber-highlight);
    box-shadow: 0 1px 3px rgba(0,0,0,0.5);
  }
  .hud-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .crop-toggle-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background-color: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    color: var(--parchment-muted);
    font-size: 10.5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .crop-toggle-btn:hover {
    color: var(--parchment-bright);
    border-color: var(--parchment-dim);
  }
  .crop-toggle-btn.active {
    background-color: rgba(212, 163, 115, 0.18);
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
  }
  .crop-reset-quick-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px 5px;
    background: transparent;
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    color: var(--parchment-dim);
    cursor: pointer;
  }
  .crop-reset-quick-btn:hover {
    color: #ff6b6b;
    border-color: #ff6b6b;
  }

  /* SIDE-BY-SIDE DIPTYCH DIFF */
  .diptych-pane {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .plate-canvas-wrapper.is-side-by-side .diptych-pane {
    flex: 1 1 50%;
    height: 100%;
    min-width: 0;
    background-color: #0b0c0e;
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.7);
  }

  .plate-canvas-wrapper:not(.is-side-by-side) .diptych-pane {
    flex: 1 1 100%;
    width: 100%;
    height: 100%;
    border: none;
    background-color: transparent;
  }

  .diptych-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    font-size: 10px;
    padding: 3px 8px;
    background: rgba(18, 19, 22, 0.88);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-bright);
    z-index: 5;
    letter-spacing: 0.05em;
    border-radius: 2px;
  }
  .diptych-badge.amber {
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
  }

  /* SPLIT CURTAIN DIFF */
  .split-original-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .split-label {
    position: absolute;
    bottom: 12px;
    font-size: 10px;
    padding: 3px 8px;
    background: rgba(18, 19, 22, 0.85);
    border: 1px solid var(--hairline-slate);
    letter-spacing: 0.06em;
    pointer-events: none;
  }
  .split-label.original {
    left: 12px;
    color: var(--parchment-muted);
  }
  .split-label.graded {
    right: 12px;
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
    z-index: 1;
  }
  .split-divider-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background-color: var(--amber-highlight);
    box-shadow: 0 0 8px rgba(212, 163, 115, 0.6);
    cursor: ew-resize;
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .split-handle-grip {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background-color: var(--surface-panel);
    border: 1px solid var(--amber-highlight);
    color: var(--amber-highlight);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    box-shadow: 0 2px 8px rgba(0,0,0,0.8);
    user-select: none;
  }

  /* INTERACTIVE CROP OVERLAY */
  .crop-overlay-stage {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 4;
  }
  .crop-box-element {
    position: absolute;
    border: 1px solid var(--amber-highlight);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.65);
    pointer-events: auto;
    cursor: move;
  }
  .crop-grid-line {
    position: absolute;
    background-color: rgba(232, 228, 220, 0.25);
    pointer-events: none;
  }
  .crop-grid-line.v1 { top: 0; bottom: 0; left: 33.33%; width: 1px; }
  .crop-grid-line.v2 { top: 0; bottom: 0; left: 66.66%; width: 1px; }
  .crop-grid-line.h1 { left: 0; right: 0; top: 33.33%; height: 1px; }
  .crop-grid-line.h2 { left: 0; right: 0; top: 66.66%; height: 1px; }
  
  .crop-handle {
    position: absolute;
    width: 14px;
    height: 14px;
    background-color: var(--amber-highlight);
    border: 1px solid #121316;
  }
  .crop-handle.nw { top: -7px; left: -7px; cursor: nwse-resize; }
  .crop-handle.se { bottom: -7px; right: -7px; cursor: nwse-resize; }

  .crop-readout {
    position: absolute;
    bottom: -22px;
    left: 0;
    font-size: 9.5px;
    color: var(--amber-highlight);
    background: rgba(18, 19, 22, 0.9);
    padding: 1px 6px;
    border-radius: 2px;
    white-space: nowrap;
    border: 1px solid var(--hairline-slate);
  }

  /* CROP & GEOMETRY RIGHT PANEL */
  .aspect-ratio-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-bottom: 10px;
  }
  .ratio-chip {
    padding: 4px 6px;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: 3px;
    color: var(--parchment-muted);
    font-size: 10px;
    cursor: pointer;
    text-align: center;
    transition: all 0.15s ease;
  }
  .ratio-chip:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
  }
  .ratio-chip.active {
    background-color: var(--surface-overlay);
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
  }
  .geom-actions-row {
    display: flex;
    gap: 5px;
    margin-top: 8px;
  }
  .geom-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 5px 6px;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: 3px;
    color: var(--parchment-muted);
    font-size: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .geom-btn:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
  }
  .geom-btn.active {
    background-color: rgba(212, 163, 115, 0.15);
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
  }
  .geom-btn.reset:hover {
    color: #ff6b6b;
    border-color: #ff6b6b;
  }

  /* QUICK AI BUTTONS */
  .quick-ai-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    padding: 2px 6px;
    color: var(--parchment-muted);
    font-size: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .quick-ai-btn:hover:not(:disabled) {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
    border-color: var(--amber-highlight);
  }
  .quick-ai-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

</style>

