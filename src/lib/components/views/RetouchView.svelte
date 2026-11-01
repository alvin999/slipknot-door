<script lang="ts">
  /**
   * 暗房精修主視圖 (Retouch Darkroom View)
   * 封裝 WebGL 2.0 3D LUT 硬體畫布、A/B 簾幕分割線、構圖裁切 HUD、
   * 光學 EXIF 遙測印字條以及底部挑選膠卷縮圖軌 (Filmstrip)。
   */
  import DarkroomViewport from "$lib/components/retouch/DarkroomViewport.svelte";
  import type { PhotoPlateItem } from "$lib/stores/photoLibrary.svelte";

  interface Props {
    activePhoto?: any;
    photos?: any[];
    activeQueue?: any[];
    exportNotice?: string;
    exposure?: number;
    contrast?: number;
    shadows?: number;
    colorTemp?: number;
    tint?: number;
    lutIntensity?: number;
    clarity?: number;
    sharpness?: number;
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
    contrast,
    shadows,
    colorTemp,
    tint,
    lutIntensity,
    clarity,
    sharpness,
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
  {contrast}
  {shadows}
  {colorTemp}
  {tint}
  {lutIntensity}
  {clarity}
  {sharpness}
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
  {onSelectPhoto}
  {onOpenQuickExport}
  {onGoToCatalog}
  {onPickDirectory}
  {onRefreshMounts}
  {onResetCropState}
  {onSyncCropToActivePhoto}
/>
