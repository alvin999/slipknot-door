<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { darkroomState, type DiffMode } from "$lib/stores/darkroomState.svelte";
  import { photoLibrary, type PhotoPlateItem } from "$lib/stores/photoLibrary.svelte";
  import { aiPipeline } from "$lib/stores/aiPipeline.svelte";
  import { WebglLutRenderer } from "$lib/services/webglLutRenderer";
  import { HSL_BAND_KEYS, createDefaultHslAdjustments, type HslAdjustments } from "$lib/types/photo";

  interface Props {
    activePhoto?: PhotoPlateItem | null;
    photos?: PhotoPlateItem[];
    activeQueue?: PhotoPlateItem[];
    exportNotice?: string;
    monochrome?: boolean;
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
    cropX?: number;
    cropY?: number;
    cropWidth?: number;
    cropHeight?: number;
    cropRotation?: number;
    keystoneV?: number;
    keystoneH?: number;
    cropAspectRatio?: any;
    flipH?: boolean;
    flipV?: boolean;
    isCropMode?: boolean;
    aiCropRationale?: string;
    diffMode?: DiffMode;
    splitPosition?: number;
    showABComparison?: boolean;
    previewHoverProfileId?: string | null;
    hasApiKey?: boolean;
    isAiAnalyzing?: boolean;
    isBatchAiRunning?: boolean;
    batchProgress?: { current: number; total: number; countdown: number } | null;
    aiSceneTitle?: string;
    aiTerminalLogs?: string[];
    hasAiBaseline?: boolean;
    isModifiedFromAi?: boolean;
    onRestoreAiTuning?: () => void;
    onOpenAiDrawer?: () => void;
    onOpenVault?: () => void;
    onSelectPhoto: (p: PhotoPlateItem) => void;
    onOpenQuickExport?: () => void;
    onGoToCatalog?: () => void;
    onPickDirectory?: () => void;
    onRefreshMounts?: () => void;
    onResetCropState?: () => void;
    onSyncCropToActivePhoto?: () => void;
  }

  let {
    activePhoto: propsActivePhoto = null,
    photos: propsPhotos = [],
    activeQueue: propsActiveQueue = [],
    exportNotice = "",
    monochrome: propsMonochrome,
    exposure: propsExposure,
    highlights: propsHighlights,
    contrast: propsContrast,
    shadows: propsShadows,
    blacks: propsBlacks,
    colorTemp: propsColorTemp,
    tint: propsTint,
    vibrance: propsVibrance,
    lutIntensity: propsLutIntensity,
    clarity: propsClarity,
    sharpness: propsSharpness,
    colorDensity: propsColorDensity,
    shadowHue: propsShadowHue,
    shadowTintAmount: propsShadowTintAmount,
    highlightHue: propsHighlightHue,
    highlightTintAmount: propsHighlightTintAmount,
    halation: propsHalation,
    grainAmount: propsGrainAmount,
    vignette: propsVignette,
    hsl: propsHsl,
    cropX: propsCropX,
    cropY: propsCropY,
    cropWidth: propsCropWidth,
    cropHeight: propsCropHeight,
    cropRotation: propsCropRotation,
    keystoneV: propsKeystoneV,
    keystoneH: propsKeystoneH,
    cropAspectRatio: propsCropAspectRatio,
    flipH: propsFlipH,
    flipV: propsFlipV,
    isCropMode: propsIsCropMode,
    aiCropRationale: propsAiCropRationale,
    diffMode: propsDiffMode,
    splitPosition: propsSplitPosition,
    showABComparison: propsShowABComparison,
    previewHoverProfileId: propsPreviewHoverProfileId,
    hasApiKey = false,
    isAiAnalyzing: propsIsAiAnalyzing,
    isBatchAiRunning: propsIsBatchAiRunning,
    batchProgress: propsBatchProgress,
    aiSceneTitle: propsAiSceneTitle,
    aiTerminalLogs: propsAiTerminalLogs,
    hasAiBaseline = false,
    isModifiedFromAi = false,
    onRestoreAiTuning,
    onOpenAiDrawer,
    onOpenVault,
    onSelectPhoto,
    onOpenQuickExport,
    onGoToCatalog,
    onPickDirectory,
    onRefreshMounts,
    onResetCropState,
    onSyncCropToActivePhoto,
  }: Props = $props();

  const activePhoto = $derived(propsActivePhoto ?? photoLibrary.activePhoto);
  const activeQueue = $derived(
    propsActiveQueue && propsActiveQueue.length > 0
      ? propsActiveQueue
      : propsPhotos && propsPhotos.length > 0
        ? propsPhotos
        : photoLibrary.activeQueue.length > 0
          ? photoLibrary.activeQueue
          : photoLibrary.photoPlates
  );
  const flaggedCount = $derived(
    activeQueue.filter((p) => p.flagged).length || photoLibrary.flaggedCount
  );
  const isLoadingPhotos = $derived(photoLibrary.isLoadingPhotos);
  const isScanningMounts = $derived(photoLibrary.isScanningMounts);

  // AI 執行狀態與即時進度膠囊資料解析
  const currentIsAiAnalyzing = $derived(propsIsAiAnalyzing ?? aiPipeline.isAiAnalyzing);
  const currentIsBatchAiRunning = $derived(propsIsBatchAiRunning ?? aiPipeline.isBatchAiRunning);
  const currentBatchProgress = $derived(propsBatchProgress ?? aiPipeline.batchProgress);
  const currentAiSceneTitle = $derived(propsAiSceneTitle ?? aiPipeline.aiSceneTitle);
  const currentAiLogs = $derived(propsAiTerminalLogs ?? aiPipeline.aiTerminalLogs);

  function formatProfileShortName(profileId?: string): string {
    if (!profileId) return "原色自然";
    if (profileId === "Profile_00_StandardNatural") return "Standard 原色";
    const match = profileId.match(/^Profile_\d+_(.+)$/);
    return match ? match[1] : profileId;
  }

  function extractLatestLogSnippet(logs: string[]): string {
    if (!logs || logs.length === 0) return "";
    const last = logs[logs.length - 1] || "";
    const firstLine = last.split("\n")[0].trim();
    if (!firstLine || /^-+$/.test(firstLine)) return "";
    return firstLine.replace(/^>\s*(\[[^\]]+\]\s*)?/, "").trim();
  }

  const mobileAiPill = $derived.by(() => {
    const snippet = extractLatestLogSnippet(currentAiLogs);
    if (currentIsBatchAiRunning) {
      const cur = currentBatchProgress?.current || 1;
      const tot = currentBatchProgress?.total || 1;
      const pct = Math.min(100, Math.round((cur / Math.max(1, tot)) * 100));
      if (currentBatchProgress?.countdown && currentBatchProgress.countdown > 0) {
        return {
          status: "batch" as const,
          icon: "hourglass_top",
          text: `批次 ${cur}/${tot} · 速率冷卻 ${currentBatchProgress.countdown}s`,
          progressPct: pct,
        };
      }
      return {
        status: "batch" as const,
        icon: "auto_mode",
        text: `批次顯影 ${cur}/${tot}${snippet ? ` · ${snippet}` : " · AI 分析中..."}`,
        progressPct: pct,
      };
    }

    if (currentIsAiAnalyzing) {
      return {
        status: "running" as const,
        icon: "progress_activity",
        text: snippet || "AI 正在掃描光影與智慧調色...",
        progressPct: null,
      };
    }

    const sceneLabel =
      activePhoto?.aiDecision?.scene_title ||
      activePhoto?.aiDecision?.scene_type ||
      currentAiSceneTitle ||
      (activePhoto?.sceneTag && activePhoto.sceneTag !== "本機相簿幀" ? activePhoto.sceneTag : "");

    if (sceneLabel || activePhoto?.aiTuningSnapshot) {
      const profLabel = formatProfileShortName(activePhoto?.appliedProfile);
      return {
        status: "done" as const,
        icon: "auto_awesome",
        text: `${sceneLabel || "AI 已顯影"} · ${profLabel}`,
        progressPct: null,
      };
    }

    return {
      status: "idle" as const,
      icon: "auto_awesome",
      text: "待機中 · 點擊下方「一鍵 AI」自動顯影",
      progressPct: null,
    };
  });

  // 參數解析：優先使用傳入的 prop，若未傳入則使用 darkroomState
  const currentMonochrome = $derived(propsMonochrome ?? darkroomState.monochrome);
  const currentExposure = $derived(propsExposure ?? darkroomState.exposure);
  const currentHighlights = $derived(propsHighlights ?? darkroomState.highlights);
  const currentContrast = $derived(propsContrast ?? darkroomState.contrast);
  const currentShadows = $derived(propsShadows ?? darkroomState.shadows);
  const currentBlacks = $derived(propsBlacks ?? darkroomState.blacks);
  const currentColorTemp = $derived(propsColorTemp ?? darkroomState.colorTemp);
  const currentTint = $derived(propsTint ?? darkroomState.tint);
  const currentVibrance = $derived(propsVibrance ?? darkroomState.vibrance);
  const currentLutIntensity = $derived(propsLutIntensity ?? darkroomState.lutIntensity);
  const currentClarity = $derived(propsClarity ?? darkroomState.clarity);
  const currentSharpness = $derived(propsSharpness ?? darkroomState.sharpness);
  const currentColorDensity = $derived(propsColorDensity ?? darkroomState.colorDensity);
  const currentShadowHue = $derived(propsShadowHue ?? darkroomState.shadowHue);
  const currentShadowTintAmount = $derived(propsShadowTintAmount ?? darkroomState.shadowTintAmount);
  const currentHighlightHue = $derived(propsHighlightHue ?? darkroomState.highlightHue);
  const currentHighlightTintAmount = $derived(propsHighlightTintAmount ?? darkroomState.highlightTintAmount);
  const currentHalation = $derived(propsHalation ?? darkroomState.halation);
  const currentGrainAmount = $derived(propsGrainAmount ?? darkroomState.grainAmount);
  const currentVignette = $derived(propsVignette ?? darkroomState.vignette);
  const currentHsl = $derived(propsHsl ?? darkroomState.hsl);

  const currentCropX = $derived(propsCropX ?? darkroomState.cropX);
  const currentCropY = $derived(propsCropY ?? darkroomState.cropY);
  const currentCropWidth = $derived(propsCropWidth ?? darkroomState.cropWidth);
  const currentCropHeight = $derived(propsCropHeight ?? darkroomState.cropHeight);
  const currentCropRotation = $derived(propsCropRotation ?? darkroomState.cropRotation);
  const currentKeystoneV = $derived(propsKeystoneV ?? darkroomState.keystoneV);
  const currentKeystoneH = $derived(propsKeystoneH ?? darkroomState.keystoneH);
  const currentCropAspectRatio = $derived(propsCropAspectRatio ?? darkroomState.cropAspectRatio);
  const currentFlipH = $derived(propsFlipH ?? darkroomState.flipH);
  const currentFlipV = $derived(propsFlipV ?? darkroomState.flipV);
  const currentIsCropMode = $derived(propsIsCropMode ?? darkroomState.isCropMode);
  const currentAiCropRationale = $derived(propsAiCropRationale ?? darkroomState.aiCropRationale);

  // ── 桌面端畫布自由縮放與平移檢視 (Zoom & Pan) ──
  let desktopZoom = $state<number>(1.0);
  let panOffsetX = $state<number>(0);
  let panOffsetY = $state<number>(0);
  let isPanningCanvas = $state<boolean>(false);
  let panStartX = 0;
  let panStartY = 0;
  let initialPanX = 0;
  let initialPanY = 0;

  function resetDesktopZoom() {
    desktopZoom = 1.0;
    panOffsetX = 0;
    panOffsetY = 0;
    isPanningCanvas = false;
  }

  function handleCanvasWheel(e: WheelEvent) {
    if (currentIsCropMode || darkroomState.isDraggingSplit) return;
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
    let next = Math.max(1.0, Math.min(4.0, desktopZoom * zoomFactor));
    if (next <= 1.03) {
      next = 1.0;
      panOffsetX = 0;
      panOffsetY = 0;
    }
    desktopZoom = parseFloat(next.toFixed(2));
  }

  function toggleDesktopZoom() {
    if (currentIsCropMode || darkroomState.isDraggingSplit) return;
    if (desktopZoom > 1.05) {
      resetDesktopZoom();
    } else {
      desktopZoom = 2.0;
    }
  }

  // 裁切手柄初始位置記憶（防突跳）
  let cropDragStartX = 0;
  let cropDragStartY = 0;
  let cropInitialBox = { x: 0, y: 0, width: 1, height: 1 };

  // 組合幾何變換樣式（包含 3D 透視梯形校正 Keystone V/H、翻轉與旋轉）
  const viewportImageTransform = $derived.by(() => {
    const flipX = currentFlipH ? -1 : 1;
    const flipY = currentFlipV ? -1 : 1;
    const rot = currentCropRotation;
    const kv = currentKeystoneV;
    const kh = currentKeystoneH;
    const zoom = isMobileZoomed ? 1.8 : desktopZoom;
    const pan = desktopZoom > 1.0 ? `translate(${panOffsetX}px, ${panOffsetY}px) ` : "";

    if (!kv && !kh) {
      return `${pan}scaleX(${flipX}) scaleY(${flipY}) rotate(${rot}deg) scale(${zoom})`;
    }

    // 垂直透視校正：負 rotateX 使頂部往觀察者拉近（拉寬）、底部遠離（縮窄），補償仰拍產生的上窄下寬
    return `${pan}perspective(1000px) rotateX(${-kv}deg) rotateY(${kh}deg) scaleX(${flipX}) scaleY(${flipY}) rotate(${rot}deg) scale(${zoom})`;
  });


  const currentDiffMode = $derived(propsDiffMode ?? darkroomState.diffMode);
  const currentSplitPosition = $derived(propsSplitPosition ?? darkroomState.splitPosition);
  const currentShowABComparison = $derived(propsShowABComparison ?? darkroomState.showABComparison);
  const currentHoverProfile = $derived(propsPreviewHoverProfileId ?? darkroomState.previewHoverProfileId);

  // DOM 參考與 WebGL 2.0 狀態
  let canvasContainerRef = $state<HTMLDivElement | null>(null);
  let stripScrollRef = $state<HTMLDivElement | null>(null);

  // 底部膠卷切換相片時自動平滑滾動至置中視角 (Auto Scroll Into View)
  $effect(() => {
    const currentId = activePhoto?.id;
    if (currentId && stripScrollRef) {
      setTimeout(() => {
        const activeCard = stripScrollRef?.querySelector('.film-frame-card.selected') as HTMLElement | null;
        if (activeCard) {
          activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }, 50);
    }
  });
  let webglCanvas = $state<HTMLCanvasElement | null>(null);
  let sourceImgElement = $state<HTMLImageElement | null>(null);
  let webglRenderer: WebglLutRenderer | null = null;
  let currentBoundCanvas: HTMLCanvasElement | null = null;
  let lastBoundImageSrc = "";
  let hasRenderedFirstFrame = $state<boolean>(false);
  let isWebglActive = $state<boolean>(false);
  let isExifSlateOpen = $state<boolean>(false);

  // ── 行動端觸控手勢 (Mobile Touch Gestures: Swipe & Double-Tap Zoom) ──
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let lastTapTime = 0;
  let isMobileZoomed = $state<boolean>(false);

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = performance.now();
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    if (e.changedTouches.length === 1) {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
      const deltaTime = performance.now() - touchStartTime;

      // 1. 雙擊縮放偵測 (Double-Tap Zoom)
      const now = performance.now();
      if (Math.abs(deltaX) < 15 && Math.abs(deltaY) < 15 && deltaTime < 280) {
        if (now - lastTapTime < 320) {
          isMobileZoomed = !isMobileZoomed;
          lastTapTime = 0;
          return;
        }
        lastTapTime = now;
      }

      // 2. 左右滑動切換底片 (Swipe Left / Right)
      // 在非縮放、非裁切調整與非簾幕拖曳狀態下觸發
      if (!isMobileZoomed && !currentIsCropMode && !darkroomState.isDraggingSplit) {
        if (deltaX < -50 && Math.abs(deltaY) < 60) {
          // 向左滑動 -> 下一張
          photoLibrary.selectAdjacentPhoto(1);
        } else if (deltaX > 50 && Math.abs(deltaY) < 60) {
          // 向右滑動 -> 前一張
          photoLibrary.selectAdjacentPhoto(-1);
        }
      }
    }
  }

  // 簾幕比對拖曳
  function handleSplitPointerDown(e: MouseEvent) {
    darkroomState.isDraggingSplit = true;
    updateSplitFromEvent(e);
  }

  function updateSplitFromEvent(e: MouseEvent) {
    if (!canvasContainerRef) return;
    const rect = canvasContainerRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(3, Math.min(97, (x / rect.width) * 100));
    darkroomState.splitPosition = Math.round(pct);
  }

  // 畫布滑鼠按下（若處於放大檢視則啟動自由平移拖曳）
  function handleCanvasPointerDown(e: MouseEvent) {
    if (e.button !== 0) return;
    if (currentIsCropMode || darkroomState.isDraggingSplit) return;
    if (desktopZoom > 1.0) {
      isPanningCanvas = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      initialPanX = panOffsetX;
      initialPanY = panOffsetY;
    }
  }

  // 裁切手柄互動拖曳（記憶起始點以防游標置中跳動）
  function handleCropStart(handle: string, e: MouseEvent) {
    e.stopPropagation();
    darkroomState.isDraggingCrop = handle;
    if (!canvasContainerRef) return;
    const rect = canvasContainerRef.getBoundingClientRect();
    cropDragStartX = (e.clientX - rect.left) / rect.width;
    cropDragStartY = (e.clientY - rect.top) / rect.height;
    cropInitialBox = {
      x: currentCropX,
      y: currentCropY,
      width: currentCropWidth,
      height: currentCropHeight,
    };
  }

  function updateCropFromEvent(e: MouseEvent) {
    if (!canvasContainerRef || !darkroomState.isDraggingCrop) return;
    const rect = canvasContainerRef.getBoundingClientRect();
    const curX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const curY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const dx = curX - cropDragStartX;
    const dy = curY - cropDragStartY;
    const handle = darkroomState.isDraggingCrop;

    if (handle === 'move') {
      const newX = Math.max(0, Math.min(1 - cropInitialBox.width, cropInitialBox.x + dx));
      const newY = Math.max(0, Math.min(1 - cropInitialBox.height, cropInitialBox.y + dy));
      darkroomState.cropX = parseFloat(newX.toFixed(3));
      darkroomState.cropY = parseFloat(newY.toFixed(3));
    } else if (handle === 'se') {
      let newW = Math.max(0.08, Math.min(1 - cropInitialBox.x, cropInitialBox.width + dx));
      let newH = Math.max(0.08, Math.min(1 - cropInitialBox.y, cropInitialBox.height + dy));
      darkroomState.cropWidth = parseFloat(newW.toFixed(3));
      darkroomState.cropHeight = parseFloat(newH.toFixed(3));
    } else if (handle === 'nw') {
      let newX = Math.max(0, Math.min(cropInitialBox.x + cropInitialBox.width - 0.08, cropInitialBox.x + dx));
      let newY = Math.max(0, Math.min(cropInitialBox.y + cropInitialBox.height - 0.08, cropInitialBox.y + dy));
      darkroomState.cropWidth = parseFloat((cropInitialBox.x + cropInitialBox.width - newX).toFixed(3));
      darkroomState.cropHeight = parseFloat((cropInitialBox.y + cropInitialBox.height - newY).toFixed(3));
      darkroomState.cropX = parseFloat(newX.toFixed(3));
      darkroomState.cropY = parseFloat(newY.toFixed(3));
    } else if (handle === 'ne') {
      let newY = Math.max(0, Math.min(cropInitialBox.y + cropInitialBox.height - 0.08, cropInitialBox.y + dy));
      let newW = Math.max(0.08, Math.min(1 - cropInitialBox.x, cropInitialBox.width + dx));
      darkroomState.cropHeight = parseFloat((cropInitialBox.y + cropInitialBox.height - newY).toFixed(3));
      darkroomState.cropWidth = parseFloat(newW.toFixed(3));
      darkroomState.cropY = parseFloat(newY.toFixed(3));
    } else if (handle === 'sw') {
      let newX = Math.max(0, Math.min(cropInitialBox.x + cropInitialBox.width - 0.08, cropInitialBox.x + dx));
      let newH = Math.max(0.08, Math.min(1 - cropInitialBox.y, cropInitialBox.height + dy));
      darkroomState.cropWidth = parseFloat((cropInitialBox.x + cropInitialBox.width - newX).toFixed(3));
      darkroomState.cropHeight = parseFloat(newH.toFixed(3));
      darkroomState.cropX = parseFloat(newX.toFixed(3));
    } else if (handle === 'n') {
      let newY = Math.max(0, Math.min(cropInitialBox.y + cropInitialBox.height - 0.08, cropInitialBox.y + dy));
      darkroomState.cropHeight = parseFloat((cropInitialBox.y + cropInitialBox.height - newY).toFixed(3));
      darkroomState.cropY = parseFloat(newY.toFixed(3));
    } else if (handle === 's') {
      let newH = Math.max(0.08, Math.min(1 - cropInitialBox.y, cropInitialBox.height + dy));
      darkroomState.cropHeight = parseFloat(newH.toFixed(3));
    } else if (handle === 'w') {
      let newX = Math.max(0, Math.min(cropInitialBox.x + cropInitialBox.width - 0.08, cropInitialBox.x + dx));
      darkroomState.cropWidth = parseFloat((cropInitialBox.x + cropInitialBox.width - newX).toFixed(3));
      darkroomState.cropX = parseFloat(newX.toFixed(3));
    } else if (handle === 'e') {
      let newW = Math.max(0.08, Math.min(1 - cropInitialBox.x, cropInitialBox.width + dx));
      darkroomState.cropWidth = parseFloat(newW.toFixed(3));
    }
  }

  function handleStagePointerMove(e: MouseEvent) {
    if (isPanningCanvas) {
      panOffsetX = initialPanX + (e.clientX - panStartX);
      panOffsetY = initialPanY + (e.clientY - panStartY);
    }
    if (darkroomState.isDraggingSplit && canvasContainerRef) {
      updateSplitFromEvent(e);
    }
    if (darkroomState.isDraggingCrop && canvasContainerRef) {
      updateCropFromEvent(e);
    }
  }

  function handleStagePointerUp() {
    isPanningCanvas = false;
    darkroomState.isDraggingSplit = false;
    darkroomState.isDraggingCrop = null;
  }

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

  export function triggerWebglRender() {
    if (!ensureImageTexture() || !webglRenderer || !sourceImgElement) {
      return;
    }

    const imgWidth = sourceImgElement.naturalWidth;
    const imgHeight = sourceImgElement.naturalHeight;

    if (currentShowABComparison) {
      webglRenderer.render(
        {
          monochrome: false,
          exposure: 0.0,
          highlights: 0.0,
          contrast: 0.0,
          blacks: 0.0,
          colorTemp: 5500,
          tint: 0.0,
          vibrance: 0.0,
          lutIntensity: 0.0,
          shadowLift: 0.0,
          bypassLut: true,
          clarity: 0.0,
          sharpness: 0.0,
          colorDensity: 0.0,
          shadowHue: 200,
          shadowTintAmount: 0.0,
          highlightHue: 40,
          highlightTintAmount: 0.0,
          halation: 0.0,
          grainAmount: 0.0,
          vignette: 0.0,
          hsl: createDefaultHslAdjustments(),
        },
        imgWidth,
        imgHeight
      );
      return;
    }

    const currentPid = currentHoverProfile
      ? currentHoverProfile
      : activePhoto
        ? activePhoto.appliedProfile
        : "Profile_00_StandardNatural";
    const isBypass = currentPid === "Profile_00_StandardNatural";

    webglRenderer.setProfile(currentPid);
    webglRenderer.render(
      {
        monochrome: currentMonochrome,
        exposure: currentExposure,
        highlights: currentHighlights,
        contrast: currentContrast,
        blacks: currentBlacks,
        colorTemp: currentColorTemp,
        tint: currentTint,
        vibrance: currentVibrance,
        shadowLift: currentShadows,
        lutIntensity: currentLutIntensity,
        bypassLut: isBypass,
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
        hsl: currentHsl,
      },
      imgWidth,
      imgHeight
    );
    hasRenderedFirstFrame = true;
  }

  function onSourceImgLoaded() {
    lastBoundImageSrc = "";
    if (webglCanvas && (!webglRenderer || webglCanvas !== currentBoundCanvas)) {
      currentBoundCanvas = webglCanvas;
      webglRenderer = new WebglLutRenderer();
      isWebglActive = webglRenderer.initialize(webglCanvas);
    }
    if (webglRenderer && sourceImgElement && sourceImgElement.naturalWidth > 0) {
      ensureImageTexture();
      triggerWebglRender();
    }
  }

  // 響應式追蹤：調色滑桿、相片切換與比對模式切換時即時著色
  $effect(() => {
    const _photoId = activePhoto?.id;
    const _thumb = activePhoto?.thumbnail;
    const _profile = activePhoto?.appliedProfile;
    const _monochrome = currentMonochrome;
    const _exp = currentExposure;
    const _highlights = currentHighlights;
    const _contrast = currentContrast;
    const _shadows = currentShadows;
    const _blacks = currentBlacks;
    const _temp = currentColorTemp;
    const _tint = currentTint;
    const _vibrance = currentVibrance;
    const _lut = currentLutIntensity;
    const _clarity = currentClarity;
    const _sharpness = currentSharpness;
    const _colorDensity = currentColorDensity;
    const _shadowHue = currentShadowHue;
    const _shadowTint = currentShadowTintAmount;
    const _highlightHue = currentHighlightHue;
    const _highlightTint = currentHighlightTintAmount;
    const _halation = currentHalation;
    const _grain = currentGrainAmount;
    const _vignette = currentVignette;
    const _hslSig = currentHsl
      ? HSL_BAND_KEYS.map((k) => `${currentHsl[k].hue},${currentHsl[k].sat},${currentHsl[k].lum}`).join(';')
      : '';
    const _ab = currentShowABComparison;
    const _diff = currentDiffMode;
    const _hover = currentHoverProfile;
    const canvas = webglCanvas;

    if (canvas && (!webglRenderer || canvas !== currentBoundCanvas)) {
      currentBoundCanvas = canvas;
      webglRenderer = new WebglLutRenderer();
      isWebglActive = webglRenderer.initialize(canvas);
      lastBoundImageSrc = "";
    }

    if (aiPipeline.isBatchAiRunning) return;

    if (
      isWebglActive &&
      sourceImgElement &&
      (sourceImgElement.complete || sourceImgElement.naturalWidth > 0)
    ) {
      ensureImageTexture();
      triggerWebglRender();
    }
  });
</script>

<div class="photo-stage-viewport">
  {#if exportNotice}
    <div class="export-notice-banner hairline-all font-mono">
      <span
        class="material-symbols-outlined"
        style="color: var(--amber-highlight); font-size: 18px;"
      >
        check_circle
      </span>
      {exportNotice}
    </div>
  {/if}

  {#if activePhoto}
    <!-- CANVAS CONTAINER (SINGLE / SPLIT / SIDE-BY-SIDE 共享同一 WebGL 畫布與頂部標籤) -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="plate-canvas-wrapper hairline-all"
      class:is-side-by-side={currentDiffMode === "sideBySide"}
      class:is-zoomed={desktopZoom > 1.0}
      bind:this={canvasContainerRef}
      onwheel={handleCanvasWheel}
      onmousedown={handleCanvasPointerDown}
      ondblclick={toggleDesktopZoom}
      onmousemove={handleStagePointerMove}
      onmouseup={handleStagePointerUp}
      onmouseleave={handleStagePointerUp}
      ontouchstart={handleTouchStart}
      ontouchend={handleTouchEnd}
      role="region"
      aria-label="暗房畫布視窗 (滾輪縮放 / 拖曳平移 / 雙擊切換視角)"
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
                class:active={currentDiffMode === "off"}
                onclick={() => darkroomState.setDiffMode("off")}
              >
                單幀顯影
              </button>
              <button
                type="button"
                class="diff-mode-btn"
                class:active={currentDiffMode === "split"}
                onclick={() => darkroomState.setDiffMode("split")}
                title="簾幕滑桿比對 (可左右拖曳分割線)"
              >
                <span class="material-symbols-outlined" style="font-size: 13px;">vertical_split</span>
                <span>簾幕滑桿</span>
              </button>
              <button
                type="button"
                class="diff-mode-btn"
                class:active={currentDiffMode === "sideBySide"}
                onclick={() => darkroomState.setDiffMode("sideBySide")}
                title="雙聯幅並排比對"
              >
                <span class="material-symbols-outlined" style="font-size: 13px;">view_column</span>
                <span>雙聯並排</span>
              </button>
            </div>
          </div>

          <!-- ZOOM HUD INDICATOR -->
          <div class="hud-center">
            <button
              type="button"
              class="zoom-hud-btn font-mono"
              class:zoomed={desktopZoom > 1.0}
              onclick={resetDesktopZoom}
              title={desktopZoom > 1.0 ? "目前已放大，點擊恢復全幅 (FIT)" : "雙擊畫布或滾輪可自由放大 (100%~400%)"}
            >
              <span class="material-symbols-outlined" style="font-size: 13px;">
                {desktopZoom > 1.0 ? "zoom_out_map" : "fit_screen"}
              </span>
              <span>{desktopZoom > 1.0 ? `${Math.round(desktopZoom * 100)}%` : "FIT"}</span>
            </button>
          </div>

          <div class="hud-right">
            <button
              type="button"
              class="crop-toggle-btn"
              class:active={currentIsCropMode}
              onclick={() => (darkroomState.isCropMode = !currentIsCropMode)}
              title="開啟/關閉互動構圖裁切框"
            >
              <span class="material-symbols-outlined" style="font-size: 14px;">crop</span>
              <span>{currentIsCropMode ? "完成裁切" : "構圖裁切"}</span>
            </button>

            {#if currentCropWidth < 1 || currentCropHeight < 1 || currentCropRotation !== 0}
              <button
                type="button"
                class="crop-reset-quick-btn"
                onclick={() => {
                  if (onResetCropState) onResetCropState();
                  else darkroomState.resetCropState();
                }}
                title="還原為原始全幅構圖"
              >
                <span class="material-symbols-outlined" style="font-size: 13px;">restart_alt</span>
              </button>
            {/if}
          </div>
        </div>

        <div class="plate-profile-badge">
          <span
            class="profile-dot"
            style:background={activePhoto.appliedProfile
              ? "var(--amber-highlight)"
              : "var(--parchment-dim)"}
          ></span>
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
      {#if currentDiffMode === "sideBySide"}
        <div class="diptych-pane left hairline-all">
          <div class="diptych-badge font-mono">ORIGINAL // 本相 RAW</div>
          <img src={activePhoto.thumbnail} alt="Original RAW" class="plate-render-img" />
        </div>
      {/if}

      <!-- DIPTYCH RIGHT PANE / MAIN VIEWPORT (唯一的 WebGL 畫布所在) -->
      <div class="diptych-pane right" class:hairline-all={currentDiffMode === "sideBySide"}>
        {#if currentDiffMode === "sideBySide"}
          <div class="diptych-badge font-mono amber">
            GRADED // 顯影 {activePhoto.appliedProfile}
          </div>
        {/if}

        <!-- WebGL 2.0 3D LUT Hardware-Accelerated Viewport Canvas -->
        <canvas
          bind:this={webglCanvas}
          class="plate-render-canvas"
          class:canvas-hidden={!hasRenderedFirstFrame}
          style:transform={viewportImageTransform}
        ></canvas>

        <!-- 零延遲預載入／回退底圖：在 WebGL 首幀著色完成前立即顯示原圖，杜絕死黑 -->
        {#if !hasRenderedFirstFrame || !isWebglActive}
          <img
            src={activePhoto.thumbnail}
            alt={activePhoto.filename}
            class="plate-render-img"
            style:transform={viewportImageTransform}
          />
        {/if}

        <!-- SPLIT DIFF OVERLAY (Top layer: Original RAW with clip-path) -->
        {#if currentDiffMode === "split"}
          <div
            class="split-original-layer"
            style:clip-path={`polygon(0 0, ${currentSplitPosition}% 0, ${currentSplitPosition}% 100%, 0 100%)`}
          >
            <img src={activePhoto.thumbnail} alt="Original RAW" class="plate-render-img" style:transform={viewportImageTransform} />
            <div class="split-label original font-mono">ORIGINAL 本相</div>
          </div>
          <div class="split-label graded font-mono">GRADED 顯影</div>

          <!-- Interactive Divider Handle -->
          <div
            class="split-divider-line"
            style:left={`${currentSplitPosition}%`}
            onmousedown={handleSplitPointerDown}
            role="slider"
            aria-label="比對簾幕分割線"
            aria-valuenow={currentSplitPosition}
            tabindex="0"
          >
            <div class="split-handle-grip font-mono">
              <span>‹</span>
              <span>›</span>
            </div>
          </div>
        {/if}

        {#if currentIsCropMode}
          <div class="crop-overlay-stage">
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
              class="crop-box-element"
              style:left={`${currentCropX * 100}%`}
              style:top={`${currentCropY * 100}%`}
              style:width={`${currentCropWidth * 100}%`}
              style:height={`${currentCropHeight * 100}%`}
              onmousedown={(e) => handleCropStart("move", e)}
              role="region"
              aria-label="可拖曳調整之裁切構圖框"
            >
              <!-- Thirds Grid Lines -->
              <div class="crop-grid-line v1"></div>
              <div class="crop-grid-line v2"></div>
              <div class="crop-grid-line h1"></div>
              <div class="crop-grid-line h2"></div>

              <!-- 8 向互動把手 (Corners & Edges) -->
              <div
                class="crop-handle nw"
                onmousedown={(e) => handleCropStart("nw", e)}
                role="button"
                tabindex="0"
                aria-label="左上角裁切把手"
              ></div>
              <div
                class="crop-handle ne"
                onmousedown={(e) => handleCropStart("ne", e)}
                role="button"
                tabindex="0"
                aria-label="右上角裁切把手"
              ></div>
              <div
                class="crop-handle se"
                onmousedown={(e) => handleCropStart("se", e)}
                role="button"
                tabindex="0"
                aria-label="右下角裁切把手"
              ></div>
              <div
                class="crop-handle sw"
                onmousedown={(e) => handleCropStart("sw", e)}
                role="button"
                tabindex="0"
                aria-label="左下角裁切把手"
              ></div>
              <div
                class="crop-handle edge-n"
                onmousedown={(e) => handleCropStart("n", e)}
                role="button"
                tabindex="0"
                aria-label="上緣裁切把手"
              ></div>
              <div
                class="crop-handle edge-s"
                onmousedown={(e) => handleCropStart("s", e)}
                role="button"
                tabindex="0"
                aria-label="下緣裁切把手"
              ></div>
              <div
                class="crop-handle edge-w"
                onmousedown={(e) => handleCropStart("w", e)}
                role="button"
                tabindex="0"
                aria-label="左緣裁切把手"
              ></div>
              <div
                class="crop-handle edge-e"
                onmousedown={(e) => handleCropStart("e", e)}
                role="button"
                tabindex="0"
                aria-label="右緣裁切把手"
              ></div>

              <div class="crop-readout font-mono">
                {currentCropAspectRatio.toUpperCase()} · {(currentCropWidth * 100).toFixed(0)}% × {(currentCropHeight * 100).toFixed(0)}%
                {#if currentCropRotation !== 0}
                  · {currentCropRotation > 0
                    ? `+${currentCropRotation}°`
                    : `${currentCropRotation}°`}
                {/if}
                {#if currentAiCropRationale}
                  · <span
                    class="amber truncate"
                    style="max-width: 280px; display: inline-block; vertical-align: bottom;"
                  >
                    {currentAiCropRationale}
                  </span>
                {/if}
              </div>
            </div>
          </div>
        {:else if currentCropWidth < 0.999 || currentCropHeight < 0.999 || currentCropX > 0.001 || currentCropY > 0.001}
          <!-- STATIC CROP PREVIEW MASK -->
          <div class="crop-overlay-stage static-preview">
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
              class="crop-box-element static"
              style:left={`${currentCropX * 100}%`}
              style:top={`${currentCropY * 100}%`}
              style:width={`${currentCropWidth * 100}%`}
              style:height={`${currentCropHeight * 100}%`}
              role="button"
              tabindex="0"
              aria-label="構圖裁切預覽框，按 Enter 或雙擊進入編輯"
              onkeydown={(e) => { if (e.key === 'Enter') darkroomState.isCropMode = true; }}
              ondblclick={() => (darkroomState.isCropMode = true)}
              title="雙擊進入構圖裁切編輯"
            >
              <div class="crop-readout font-mono static">
                {currentCropAspectRatio.toUpperCase()} · 構圖裁切預覽
                {#if currentAiCropRationale}
                  · <span class="amber">{currentAiCropRationale}</span>
                {/if}
              </div>
            </div>
          </div>
        {/if}

        <!-- A/B Comparison Toggle Floater -->
        <button
          type="button"
          class="ab-toggle-btn hairline-all font-mono"
          class:active={currentShowABComparison}
          onmousedown={() => (darkroomState.showABComparison = true)}
          onmouseup={() => (darkroomState.showABComparison = false)}
          onmouseleave={() => (darkroomState.showABComparison = false)}
          ontouchstart={() => (darkroomState.showABComparison = true)}
          ontouchend={() => (darkroomState.showABComparison = false)}
          ontouchcancel={() => (darkroomState.showABComparison = false)}
        >
          <span class="material-symbols-outlined" style="font-size: 15px;">compare</span>
          <span>{currentShowABComparison ? "原始本相 (RAW)" : "按住比對原圖 (Space)"}</span>
        </button>
      </div>

      <!-- 底部底片邊緣印字光學遙測條 (FILM REBATE OPTICAL TELEMETRY SLATE) -->
      <div class="plate-rebate-bar font-mono">
        <div class="rebate-camera-block truncate">
          <span class="material-symbols-outlined rebate-camera-icon">photo_camera</span>
          <span class="rebate-camera-model truncate">{activePhoto.camera || "CAMERA"}</span>
          {#if activePhoto.lens}
            <span class="rebate-sep">/</span>
            <span class="rebate-lens truncate" title={activePhoto.lens}>{activePhoto.lens}</span>
          {/if}
        </div>

        <div class="rebate-optical-chips">
          {#if activePhoto.focalLength && activePhoto.focalLength !== "--"}
            <span class="rebate-chip">{activePhoto.focalLength}</span>
          {/if}
          <span class="rebate-chip highlight">{activePhoto.aperture || "ƒ/--"}</span>
          <span class="rebate-chip highlight">{activePhoto.shutter || "--s"}</span>
          <span class="rebate-chip amber">
            {activePhoto.iso > 0 ? `ISO ${activePhoto.iso}` : "ISO --"}
          </span>
          {#if activePhoto.exposureBias !== undefined}
            <span class="rebate-chip">
              {activePhoto.exposureBias > 0
                ? `+${activePhoto.exposureBias.toFixed(1)}`
                : activePhoto.exposureBias.toFixed(1)} EV
            </span>
          {/if}
          <span class="rebate-chip">
            {activePhoto.asShotTemp ? `${activePhoto.asShotTemp}K` : "5500K"}
          </span>
          <span class="rebate-chip dim">{activePhoto.colorSpace || "sRGB"}</span>

          <button
            type="button"
            class="rebate-detail-btn"
            class:active={isExifSlateOpen}
            onclick={() => (isExifSlateOpen = !isExifSlateOpen)}
            title="檢視完整 EXIF 測光模式與曝光程式"
          >
            <span class="material-symbols-outlined" style="font-size: 13px;">info</span>
            <span>EXIF</span>
          </button>
        </div>

        {#if isExifSlateOpen}
          <div class="rebate-exif-popover hairline-all font-mono">
            <div class="popover-title">
              <span>OPTICAL TELEMETRY // 完整光學數據</span>
              <button
                type="button"
                class="popover-close-btn"
                onclick={() => (isExifSlateOpen = false)}
              >
                <span class="material-symbols-outlined" style="font-size: 13px;">close</span>
              </button>
            </div>
            <div class="popover-grid">
              <div class="pop-row">
                <span>相機機身</span>
                <strong class="truncate">{activePhoto.camera || "--"}</strong>
              </div>
              <div class="pop-row">
                <span>搭配鏡頭</span>
                <strong class="truncate">{activePhoto.lens || "--"}</strong>
              </div>
              <div class="pop-row">
                <span>曝光程式</span>
                <strong>{activePhoto.exposureProgram || "--"}</strong>
              </div>
              <div class="pop-row">
                <span>測光模式</span>
                <strong>{activePhoto.meteringMode || "--"}</strong>
              </div>
              <div class="pop-row">
                <span>閃光燈</span>
                <strong>{activePhoto.flash || "未擊發"}</strong>
              </div>
              <div class="pop-row">
                <span>原生色溫</span>
                <strong>{activePhoto.asShotTemp ? `${activePhoto.asShotTemp}K` : "5500K"}</strong>
              </div>
              <div class="pop-row">
                <span>色偏 Tint</span>
                <strong>{activePhoto.asShotTint ? `${activePhoto.asShotTint.toFixed(1)}` : "0.0"}</strong>
              </div>
              <div class="pop-row">
                <span>色彩空間</span>
                <strong>{activePhoto.colorSpace || "sRGB"}</strong>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- 行動端畫布下方單行即時 AI 進度／判讀結果小膠囊 -->
    <div
      class="mobile-ai-status-pill font-mono hairline-all"
      class:is-running={mobileAiPill.status === "running" || mobileAiPill.status === "batch"}
      class:is-done={mobileAiPill.status === "done"}
    >
      <button
        type="button"
        class="ai-pill-main"
        onclick={() => onOpenAiDrawer?.()}
        title="點擊展開 AI 風格與後製理念面板"
      >
        <span
          class="material-symbols-outlined ai-pill-icon"
          class:spin={mobileAiPill.status === "running" || mobileAiPill.status === "batch"}
        >
          {mobileAiPill.icon}
        </span>
        <span class="ai-pill-text">{mobileAiPill.text}</span>
      </button>

      {#if hasAiBaseline && isModifiedFromAi && onRestoreAiTuning && mobileAiPill.status === "done"}
        <button
          type="button"
          class="ai-pill-restore-btn font-mono"
          onclick={onRestoreAiTuning}
          title="還原為 AI 顯影基準"
        >
          <span class="material-symbols-outlined" style="font-size: 12px;">settings_backup_restore</span>
          <span>還原 AI</span>
        </button>
      {:else if mobileAiPill.status === "done"}
        <span class="ai-pill-chevron material-symbols-outlined" aria-hidden="true">chevron_right</span>
      {/if}

      {#if mobileAiPill.progressPct !== null}
        <div
          class="ai-pill-progress-bar"
          style:width={`${mobileAiPill.progressPct}%`}
        ></div>
      {/if}
    </div>
  {:else}
    <!-- Empty State -->
    <div class="empty-stage-box">
      <span class="material-symbols-outlined empty-stage-icon">camera_roll</span>
      <h3 class="font-headline empty-stage-title">
        {#if (propsPhotos && propsPhotos.length > 0) || (photoLibrary.photoPlates.length > 0)}
          尚未選取暗房底片幀
        {:else}
          等待相機裝置連接或底片匯入
        {/if}
      </h3>
      <p class="font-body empty-stage-desc">
        {#if (propsPhotos && propsPhotos.length > 0) || (photoLibrary.photoPlates.length > 0)}
          目錄中已有底片檔案。請前往膠卷目錄挑選底片，或於下方底片滾軸點選任意幀以啟動顯影。
        {:else}
          接上相機 USB/Type-C 傳輸線開機自動載入，或手動指定本機 DCIM / RAW 目錄開啟底片作業。
        {/if}
      </p>
      <div class="empty-actions">
        {#if ((propsPhotos && propsPhotos.length > 0) || (photoLibrary.photoPlates.length > 0)) && onGoToCatalog}
          <button
            type="button"
            class="archival-btn-primary"
            onclick={onGoToCatalog}
          >
            <span class="material-symbols-outlined" style="font-size: 16px;">photo_library</span>
            <span>返回膠卷目錄挑選底片 →</span>
          </button>
        {:else if onPickDirectory}
          <button
            type="button"
            class="archival-btn-primary"
            onclick={onPickDirectory}
            disabled={isLoadingPhotos}
          >
            <span class="material-symbols-outlined" style="font-size: 16px;">folder_open</span>
            <span>{isLoadingPhotos ? "正在解析 RAW/JPG..." : "開啟相片目錄 (RAW / JPG)"}</span>
          </button>
        {/if}
        {#if onRefreshMounts}
          <button
            type="button"
            class="empty-ghost-btn font-mono"
            onclick={onRefreshMounts}
            disabled={isScanningMounts}
          >
            <span class="material-symbols-outlined" style="font-size: 16px;">cable</span>
            <span>{isScanningMounts ? "正在搜尋掛載..." : "重新偵測隨插即讀設備"}</span>
          </button>
        {/if}
      </div>

      {#if !hasApiKey && onOpenVault}
        <div class="key-vault-empty-banner font-mono">
          <div class="banner-left">
            <span class="material-symbols-outlined banner-icon">vpn_key_alert</span>
            <div class="banner-texts">
              <span class="banner-title">尚未配置 AI 雲端金鑰</span>
              <span class="banner-desc">可預先配置 Gemini / Groq API 金鑰，載入相片後隨即可享受 AI 智慧光學顯影</span>
            </div>
          </div>
          <button type="button" class="banner-action-hint font-mono" onclick={onOpenVault}>
            <span>立即配置 →</span>
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- PERSISTENT BOTTOM CONTACT SHEET LIGHT-TABLE STRIP (FILTERED BY SELECTION) -->
<footer class="contact-sheet-strip hairline-t">
  <div class="strip-header font-mono">
    <div class="strip-info-left">
      <span class="strip-label">CONTACT SHEET // EXPOSURE RACK</span>
      <span class="strip-count" class:amber={flaggedCount > 0}>
        {activeQueue.length} FRAMES {flaggedCount > 0 ? "(已挑選精修佇列)" : "(全量底片佇列)"}
      </span>
    </div>
    <div class="strip-actions-right">
      <button
        type="button"
        class="strip-ctrl-btn"
        onclick={() => photoLibrary.selectAdjacentPhoto(-1)}
        title="前一張底片 (H / ← 鍵)"
      >
        <span class="material-symbols-outlined" style="font-size: 14px;">arrow_back</span>
        <span>前一張 [H]</span>
      </button>
      <button
        type="button"
        class="strip-ctrl-btn"
        onclick={() => photoLibrary.selectAdjacentPhoto(1)}
        title="下一張底片 (L / → 鍵)"
      >
        <span>下一張 [L]</span>
        <span class="material-symbols-outlined" style="font-size: 14px;">arrow_forward</span>
      </button>
      {#if onGoToCatalog}
        <button
          type="button"
          class="strip-ctrl-btn highlight"
          onclick={onGoToCatalog}
          title="返回第一步目錄重新選取"
        >
          <span class="material-symbols-outlined" style="font-size: 14px;">grid_view</span>
          <span>返回挑圖</span>
        </button>
      {/if}
    </div>
  </div>
  <div class="strip-frames-scroll custom-scroll" bind:this={stripScrollRef}>
    {#if activeQueue.length > 0}
      {#each activeQueue as plate (plate.id)}
        {@const isGraded = !!(plate.tuning || plate.gradedThumbnail || (plate.appliedProfile && plate.appliedProfile !== 'Profile_00_StandardNatural') || plate.crop)}
        <button
          type="button"
          class="film-frame-card"
          class:selected={plate.selected}
          class:is-graded={isGraded}
          onclick={() => onSelectPhoto(plate)}
        >
          <div class="film-frame-outer">
            <img
              src={plate.gradedThumbnail || plate.thumbnail}
              alt={plate.filename}
              class="film-frame-thumb"
            />
            {#if isGraded}
              <span class="frame-graded-badge" title="已顯影/已調色"></span>
            {/if}
            {#if plate.flagged}
              <span class="frame-flag-badge" title="已挑選精修">★</span>
            {/if}
          </div>
          <div class="film-frame-meta font-mono">
            <span class="frame-num">{plate.frameNo}</span>
            <span class="frame-tag">{plate.camera ? plate.camera.split(" ")[0] : "RAW"}</span>
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


<style>


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
    box-shadow:
      inset 0 0 100px rgba(0, 0, 0, 0.8),
      0 16px 48px rgba(0, 0, 0, 0.7);
  }

  .plate-canvas-wrapper.is-side-by-side {
    flex-direction: row;
    gap: 14px;
    padding: 56px 14px 48px 14px;
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
    max-height: 88%;
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

  .canvas-hidden {
    position: absolute;
    opacity: 0;
    pointer-events: none;
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
    bottom: 48px;
    right: 14px;
    background-color: rgba(18, 19, 23, 0.88);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--parchment-bright);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10.5px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6);
    transition: all 0.15s ease;
    z-index: 12;
  }
  .ab-toggle-btn.active,
  .ab-toggle-btn:hover {
    background-color: var(--primary-indigo);
    color: var(--canvas-base);
    border-color: var(--primary-indigo);
  }

  /* FILM REBATE OPTICAL TELEMETRY SLATE */
  .plate-rebate-bar {
    position: absolute;
    bottom: 12px;
    left: 14px;
    right: 14px;
    background-color: rgba(12, 13, 16, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-sm);
    padding: 6px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    z-index: 15;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.65);
    pointer-events: auto;
  }

  .rebate-camera-block {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--parchment-bright);
    min-width: 0;
    max-width: 45%;
  }
  .rebate-camera-icon {
    font-size: 14px;
    color: var(--amber-highlight);
    flex-shrink: 0;
  }
  .rebate-camera-model {
    font-weight: 600;
    letter-spacing: 0.03em;
  }
  .rebate-sep {
    color: var(--parchment-dim);
    opacity: 0.4;
  }
  .rebate-lens {
    color: var(--parchment-muted);
    font-size: 10.5px;
  }

  .rebate-optical-chips {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }
  .rebate-chip {
    font-size: 10.5px;
    padding: 2px 6px;
    background-color: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 2px;
    color: var(--parchment-muted);
    letter-spacing: 0.04em;
  }
  .rebate-chip.highlight {
    color: var(--parchment-bright);
    font-weight: 500;
  }
  .rebate-chip.amber {
    color: var(--amber-highlight);
    font-weight: 600;
    border-color: rgba(212, 163, 115, 0.25);
  }
  .rebate-chip.dim {
    color: var(--parchment-dim);
    font-size: 9.5px;
  }

  .rebate-detail-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 2px 6px;
    background-color: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    border-radius: 2px;
    color: var(--parchment-dim);
    font-size: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .rebate-detail-btn:hover,
  .rebate-detail-btn.active {
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
    background-color: var(--surface-overlay);
  }

  .rebate-exif-popover {
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    width: 290px;
    background-color: rgba(14, 15, 19, 0.94);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.85);
    z-index: 25;
  }
  .popover-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9.5px;
    letter-spacing: 0.08em;
    color: var(--amber-highlight);
    padding-bottom: 6px;
    border-bottom: 1px solid var(--hairline-slate);
    margin-bottom: 8px;
  }
  .popover-close-btn {
    background: transparent;
    border: none;
    color: var(--parchment-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
  }
  .popover-close-btn:hover {
    color: var(--parchment-bright);
  }
  .popover-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pop-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
  }
  .pop-row span {
    color: var(--parchment-dim);
  }
  .pop-row strong {
    color: var(--parchment-bright);
    font-weight: 500;
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

  /* KEY VAULT GUIDANCE BANNER */
  .key-vault-empty-banner {
    margin-top: 24px;
    width: 100%;
    padding: 12px 16px;
    background: rgba(226, 157, 82, 0.05);
    border: none;
    border-left: 2px solid var(--amber-highlight);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    text-align: left;
    box-sizing: border-box;
  }
  .key-vault-empty-banner .banner-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .key-vault-empty-banner .banner-icon {
    font-size: 20px;
    color: var(--amber-highlight);
    flex-shrink: 0;
  }
  .key-vault-empty-banner .banner-texts {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .key-vault-empty-banner .banner-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--amber-highlight);
    letter-spacing: 0.04em;
  }
  .key-vault-empty-banner .banner-desc {
    font-size: 11px;
    color: var(--parchment-muted);
    line-height: 1.4;
  }
  .key-vault-empty-banner .banner-action-hint {
    background: transparent;
    border: none;
    color: var(--amber-highlight);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    padding: 4px 8px;
    transition: all 0.15s ease;
  }
  .key-vault-empty-banner .banner-action-hint:hover {
    transform: translateX(2px);
    color: #f0a855;
  }

  /* EMPTY STAGE & STRIP */
  .empty-stage-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 32px;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-md);
    max-width: 520px;
    text-align: center;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
  }

  .empty-ghost-btn {
    background: transparent;
    border: none;
    color: var(--parchment-muted);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    cursor: pointer;
    padding: 8px 12px;
    transition: all 0.15s ease;
    border-radius: var(--radius-xs);
  }
  .empty-ghost-btn:hover {
    color: var(--parchment-bright);
    background: rgba(255, 255, 255, 0.04);
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
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
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
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
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
  .crop-box-element.static {
    border: 1px dashed rgba(212, 163, 115, 0.55);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.72);
    cursor: default;
    pointer-events: none;
  }
  .crop-readout.static {
    background: rgba(18, 19, 22, 0.85);
    border-color: rgba(212, 163, 115, 0.4);
    color: var(--parchment-dim);
  }
  .crop-grid-line {
    position: absolute;
    background-color: rgba(232, 228, 220, 0.25);
    pointer-events: none;
  }
  .crop-grid-line.v1 {
    top: 0;
    bottom: 0;
    left: 33.33%;
    width: 1px;
  }
  .crop-grid-line.v2 {
    top: 0;
    bottom: 0;
    left: 66.66%;
    width: 1px;
  }
  .crop-grid-line.h1 {
    left: 0;
    right: 0;
    top: 33.33%;
    height: 1px;
  }
  .crop-grid-line.h2 {
    left: 0;
    right: 0;
    top: 66.66%;
    height: 1px;
  }

  .crop-handle {
    position: absolute;
    width: 14px;
    height: 14px;
    background-color: var(--amber-highlight);
    border: 1px solid #121316;
  }
  .crop-handle.nw {
    top: -7px;
    left: -7px;
    cursor: nwse-resize;
  }
  .crop-handle.ne {
    top: -7px;
    right: -7px;
    cursor: nesw-resize;
  }
  .crop-handle.se {
    bottom: -7px;
    right: -7px;
    cursor: nwse-resize;
  }
  .crop-handle.sw {
    bottom: -7px;
    left: -7px;
    cursor: nesw-resize;
  }
  .crop-handle.edge-n {
    top: -5px;
    left: 50%;
    transform: translateX(-50%);
    width: 24px;
    height: 8px;
    cursor: ns-resize;
    border-radius: 2px;
  }
  .crop-handle.edge-s {
    bottom: -5px;
    left: 50%;
    transform: translateX(-50%);
    width: 24px;
    height: 8px;
    cursor: ns-resize;
    border-radius: 2px;
  }
  .crop-handle.edge-w {
    left: -5px;
    top: 50%;
    transform: translateY(-50%);
    width: 8px;
    height: 24px;
    cursor: ew-resize;
    border-radius: 2px;
  }
  .crop-handle.edge-e {
    right: -5px;
    top: 50%;
    transform: translateY(-50%);
    width: 8px;
    height: 24px;
    cursor: ew-resize;
    border-radius: 2px;
  }
  
  .zoom-hud-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: transparent;
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    color: var(--parchment-dim);
    font-size: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .zoom-hud-btn:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
    border-color: var(--parchment-muted);
  }
  .zoom-hud-btn.zoomed {
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
    background-color: rgba(212, 163, 115, 0.12);
  }
  .plate-canvas-wrapper.is-zoomed {
    cursor: grab;
  }
  .plate-canvas-wrapper.is-zoomed:active {
    cursor: grabbing;
  }

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
  .mobile-ai-status-pill {
    display: none;
  }
  /* ── 行動端暗房觸控與排版優化 (Mobile Darkroom Responsive Layout) ── */
  @media (max-width: 768px) {
    .key-vault-empty-banner {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
      padding: 14px;
    }
    .key-vault-empty-banner .banner-action-hint {
      width: 100%;
      padding: 8px 10px;
      font-size: 12px;
      text-align: center;
    }
    .photo-stage-viewport {
      padding: 6px;
      gap: 6px;
      overflow: hidden;
    }

    .plate-canvas-wrapper {
      flex: 1;
      min-height: 0;
      height: auto;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      touch-action: manipulation;
    }

    /* 行動端畫布下方單行 AI 進度／判讀結果小膠囊 */
    .mobile-ai-status-pill {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      width: 100%;
      height: 30px;
      padding: 0 10px;
      background-color: rgba(16, 17, 21, 0.92);
      border: 1px solid var(--hairline-slate);
      border-radius: 999px;
      position: relative;
      overflow: hidden;
      flex-shrink: 0;
    }
    .mobile-ai-status-pill.is-running {
      border-color: rgba(226, 157, 82, 0.55);
      background-color: rgba(226, 157, 82, 0.08);
    }
    .mobile-ai-status-pill.is-done {
      border-color: rgba(212, 163, 115, 0.35);
    }
    .ai-pill-main {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: none;
      padding: 0;
      color: var(--parchment-muted);
      font-family: inherit;
      font-size: 10.5px;
      text-align: left;
      cursor: pointer;
    }
    .mobile-ai-status-pill.is-running .ai-pill-main,
    .mobile-ai-status-pill.is-done .ai-pill-main {
      color: var(--parchment-bright);
    }
    .ai-pill-icon {
      font-size: 14px;
      color: var(--amber-highlight);
      flex-shrink: 0;
    }
    .ai-pill-icon.spin {
      animation: ai-pill-spin 1.1s linear infinite;
    }
    @keyframes ai-pill-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .ai-pill-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ai-pill-chevron {
      font-size: 14px;
      color: var(--parchment-dim);
      flex-shrink: 0;
      pointer-events: none;
    }
    .ai-pill-restore-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 7px;
      border-radius: 999px;
      border: 1px solid rgba(226, 157, 82, 0.45);
      background: rgba(226, 157, 82, 0.14);
      color: var(--amber-highlight);
      font-size: 10px;
      flex-shrink: 0;
      cursor: pointer;
    }
    .ai-pill-progress-bar {
      position: absolute;
      left: 0;
      bottom: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--amber-highlight), #f5c37e);
      transition: width 0.25s ease;
      pointer-events: none;
    }

    .plate-tag-bar {
      top: 6px;
      left: 6px;
      right: 6px;
      gap: 6px;
      justify-content: space-between;
      align-items: center;
    }

    .plate-id-badge {
      font-size: 10px;
      padding: 4px 7px;
      flex-shrink: 0;
      white-space: nowrap;
    }

    .film-file,
    .plate-profile-badge {
      display: none;
    }

    .stage-hud-bar {
      flex: 1;
      min-width: 0;
      padding: 2px 6px;
      gap: 4px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .stage-hud-bar::-webkit-scrollbar {
      display: none;
    }

    .hud-left,
    .hud-center,
    .hud-right {
      flex-shrink: 0;
    }

    .hud-left {
      gap: 3px;
    }

    .hud-title {
      display: none;
    }

    .diff-mode-btn,
    .zoom-hud-btn,
    .crop-toggle-btn {
      font-size: 10px;
      padding: 3px 6px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    

    /* 原圖比對按鈕：浮動在手機右下方拇指舒適區 */
    .ab-toggle-btn {
      bottom: 42px;
      right: 10px;
      padding: 6px 10px;
      font-size: 11px;
      border-radius: 20px;
      background: rgba(18, 19, 22, 0.85);
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }

    /* 光學遙測條：緊湊橫向滑動，防相機型號折行與焦段重疊 */
    .plate-rebate-bar {
      height: 32px;
      padding: 0 8px;
      gap: 8px;
      font-size: 10px;
      overflow-x: auto;
      scrollbar-width: none;
      white-space: nowrap;
    }

    .plate-rebate-bar::-webkit-scrollbar {
      display: none;
    }

    .rebate-camera-block {
      flex-shrink: 0;
      max-width: 110px;
      white-space: nowrap;
    }

    .rebate-camera-model {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .rebate-lens,
    .rebate-sep,
    .rebate-chip.dim {
      display: none;
    }

    /* 底部底片軌道：緊湊直覺 */
    .contact-sheet-strip {
      height: 86px;
    }

    .strip-header {
      padding: 4px 10px;
      font-size: 10px;
    }

    .strip-info-left .strip-label {
      display: none;
    }

    .strip-frames-scroll {
      padding: 4px 8px;
      gap: 6px;
    }

    .film-frame-card {
      width: 58px;
      height: 52px;
    }
  }
</style>
