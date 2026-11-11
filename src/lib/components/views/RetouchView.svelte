<script lang="ts">
  /**
   * 暗房精修主視圖 (Retouch Darkroom View)
   * 封裝 WebGL 2.0 3D LUT 硬體畫布、A/B 簾幕分割線、構圖裁切 HUD、
   * 光學 EXIF 遙測印字條以及底部挑選膠卷縮圖軌 (Filmstrip)。
   */
  import DarkroomViewport from "$lib/components/retouch/DarkroomViewport.svelte";
  import type { PhotoPlateItem } from "$lib/stores/photoLibrary.svelte";
  import type { HslAdjustments } from "$lib/types/photo";

  interface Props {
    activePhoto?: any;
    photos?: any[];
    activeQueue?: any[];
    exportNotice?: string;
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
    diffMode?: any;
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
    isMobileDrawerOpen?: boolean;
    onRestoreAiTuning?: () => void;
    onOpenAiDrawer?: () => void;
    onOpenVault?: () => void;
    onSelectPhoto: (p: any) => void;
    onOpenQuickExport?: () => void;
    onGoToCatalog?: () => void;
    onPickDirectory?: () => void;
    onRefreshMounts?: () => void;
    onResetCropState?: () => void;
    onSyncCropToActivePhoto?: () => void;
  }

  let {
    activePhoto = null,
    photos = [],
    activeQueue = [],
    exportNotice = "",
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
    hsl,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    cropRotation,
    keystoneV,
    keystoneH,
    cropAspectRatio,
    flipH,
    flipV,
    isCropMode,
    aiCropRationale,
    diffMode,
    splitPosition,
    showABComparison,
    previewHoverProfileId,
    hasApiKey = false,
    isAiAnalyzing,
    isBatchAiRunning,
    batchProgress,
    aiSceneTitle,
    aiTerminalLogs,
    hasAiBaseline = false,
    isModifiedFromAi = false,
    isMobileDrawerOpen = false,
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

  let viewportRef: { triggerWebglRender: () => void } | null = $state(null);

  /**
   * 外部調用觸發 WebGL 畫布重繪
   */
  export function triggerRender(): void {
    if (viewportRef) {
      viewportRef.triggerWebglRender();
    }
  }
</script>

<DarkroomViewport
  bind:this={viewportRef}
  {activePhoto}
  {photos}
  {activeQueue}
  {exportNotice}
  {exposure}
  {highlights}
  {contrast}
  {shadows}
  {blacks}
  {colorTemp}
  {tint}
  {vibrance}
  {lutIntensity}
  {clarity}
  {sharpness}
  {colorDensity}
  {shadowHue}
  {shadowTintAmount}
  {highlightHue}
  {highlightTintAmount}
  {halation}
  {grainAmount}
  {vignette}
  {hsl}
  {cropX}
  {cropY}
  {cropWidth}
  {cropHeight}
  {cropRotation}
  {keystoneV}
  {keystoneH}
  {cropAspectRatio}
  {flipH}
  {flipV}
  {isCropMode}
  {aiCropRationale}
  {diffMode}
  {splitPosition}
  {showABComparison}
  {previewHoverProfileId}
  {hasApiKey}
  {isAiAnalyzing}
  {isBatchAiRunning}
  {batchProgress}
  {aiSceneTitle}
  {aiTerminalLogs}
  {hasAiBaseline}
  {isModifiedFromAi}
  {isMobileDrawerOpen}
  {onRestoreAiTuning}
  {onOpenAiDrawer}
  {onOpenVault}
  {onSelectPhoto}
  {onOpenQuickExport}
  {onGoToCatalog}
  {onPickDirectory}
  {onRefreshMounts}
  {onResetCropState}
  {onSyncCropToActivePhoto}
/>
