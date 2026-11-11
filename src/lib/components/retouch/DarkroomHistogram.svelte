<script lang="ts">
  /**
   * 暗房光學即時直方圖 (Optical Live Histogram)
   * 遵循 Alexandria Darkroom Curatorial 典藏光學遙測工藝美學：
   * 1. 支援 RGB 三原色通道與 LUMA 亮度光階波形即時繪製。
   * 2. 即時反映當前曝光 (EV)、對比度 (Contrast)、暗部抬升 (Shadows)、色溫與色偏。
   * 3. 具備 1/4 (陰影)、1/2 (中間調中性灰)、3/4 (高光) 遙測分界線與高光/死黑修剪提示。
   */
  import { onMount } from "svelte";
  import { darkroomState } from "$lib/stores/darkroomState.svelte";
  import type { PhotoPlateItem } from "$lib/stores/photoLibrary.svelte";

  interface Props {
    activePhoto?: PhotoPlateItem | null;
  }

  let { activePhoto = null }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let displayMode = $state<"rgb" | "luma">("rgb");
  let sampleImage: HTMLImageElement | null = null;
  let cachedRawHistogram: { r: number[]; g: number[]; b: number[]; luma: number[] } | null = null;
  let lastSampleSrc = "";

  // 離屏取樣抽樣運算
  function analyzeImageBins(img: HTMLImageElement) {
    const offCanvas = document.createElement("canvas");
    const sampleWidth = 120;
    const sampleHeight = Math.round((120 * img.naturalHeight) / img.naturalWidth) || 80;
    offCanvas.width = sampleWidth;
    offCanvas.height = sampleHeight;
    const ctx = offCanvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
    const imgData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
    const data = imgData.data;

    const rBins = new Array(256).fill(0);
    const gBins = new Array(256).fill(0);
    const bBins = new Array(256).fill(0);
    const lumaBins = new Array(256).fill(0);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

      rBins[r]++;
      gBins[g]++;
      bBins[b]++;
      lumaBins[luma]++;
    }

    return { r: rBins, g: gBins, b: bBins, luma: lumaBins };
  }

  function drawHistogram() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const w = canvasEl.width;
    const h = canvasEl.height;

    ctx.clearRect(0, 0, w, h);

    // 背景底色
    ctx.fillStyle = "#0c0d10";
    ctx.fillRect(0, 0, w, h);

    // 垂直參考線 (暗部、中間調中性灰、高光)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((ratio) => {
      ctx.beginPath();
      ctx.moveTo(w * ratio, 0);
      ctx.lineTo(w * ratio, h);
      ctx.stroke();
    });

    if (!cachedRawHistogram) {
      return;
    }

    // 考慮當前曝光補償、對比度、色溫色調進行簡易直方圖位移模擬
    const expShift = darkroomState.exposure * 30; // 曝光位移
    const conFactor = 1 + darkroomState.contrast;
    const shadowLift = darkroomState.shadows * 25;
    const tempShift = ((darkroomState.colorTemp - 5500) / 3000) * 15;
    const tintShift = (darkroomState.tint / 100) * 12;

    const mapBin = (binIdx: number, channelShift = 0) => {
      let v = (binIdx - 128) * conFactor + 128 + expShift + channelShift;
      if (v < 60) v += shadowLift * (1 - v / 60);
      return Math.max(0, Math.min(255, Math.round(v)));
    };

    // 重新分箱
    const rShifted = new Array(256).fill(0);
    const gShifted = new Array(256).fill(0);
    const bShifted = new Array(256).fill(0);
    const lumaShifted = new Array(256).fill(0);

    for (let i = 0; i < 256; i++) {
      const rDest = mapBin(i, tempShift);
      const gDest = mapBin(i, -tintShift);
      const bDest = mapBin(i, -tempShift + tintShift);
      const lDest = mapBin(i, 0);

      rShifted[rDest] += cachedRawHistogram.r[i];
      gShifted[gDest] += cachedRawHistogram.g[i];
      bShifted[bDest] += cachedRawHistogram.b[i];
      lumaShifted[lDest] += cachedRawHistogram.luma[i];
    }

    // 找峰值正規化
    let maxCount = 1;
    for (let i = 2; i < 254; i++) {
      maxCount = Math.max(maxCount, rShifted[i], gShifted[i], bShifted[i], lumaShifted[i]);
    }

    // 繪製波形
    const drawChannel = (bins: number[], strokeStyle: string, fillStyle?: string) => {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x < w; x++) {
        const binIndex = Math.min(255, Math.floor((x / w) * 256));
        const val = bins[binIndex] || 0;
        const normalizedH = Math.min(h - 2, (val / maxCount) * (h - 6));
        const y = h - normalizedH;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();

      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
      }
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };

    if (displayMode === "rgb" && !darkroomState.monochrome) {
      ctx.globalCompositeOperation = "screen";
      drawChannel(rShifted, "rgba(224, 108, 117, 0.9)", "rgba(224, 108, 117, 0.2)");
      drawChannel(gShifted, "rgba(152, 195, 121, 0.9)", "rgba(152, 195, 121, 0.2)");
      drawChannel(bShifted, "rgba(97, 175, 239, 0.9)", "rgba(97, 175, 239, 0.2)");
      ctx.globalCompositeOperation = "source-over";
    } else {
      const stroke = darkroomState.monochrome ? "rgba(229, 231, 235, 0.92)" : "rgba(212, 163, 115, 0.95)";
      const fill = darkroomState.monochrome ? "rgba(229, 231, 235, 0.22)" : "rgba(212, 163, 115, 0.25)";
      drawChannel(lumaShifted, stroke, fill);
    }
  }

  // 監聽 activePhoto 載入抽樣圖檔
  $effect(() => {
    const src = activePhoto?.thumbnail;
    if (src && src !== lastSampleSrc) {
      lastSampleSrc = src;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        cachedRawHistogram = analyzeImageBins(img);
        drawHistogram();
      };
      img.src = src;
    }
  });

  // 監聽調色滑桿即時重繪直方圖波形
  $effect(() => {
    const _exp = darkroomState.exposure;
    const _con = darkroomState.contrast;
    const _shd = darkroomState.shadows;
    const _tmp = darkroomState.colorTemp;
    const _tnt = darkroomState.tint;
    const _mono = darkroomState.monochrome;
    const _mode = displayMode;
    drawHistogram();
  });

  onMount(() => {
    drawHistogram();
  });
</script>

<div class="histogram-card hairline-b">
  <div class="hist-header">
    <div class="hist-title">
      <span class="material-symbols-outlined hist-icon">equalizer</span>
      <span class="hist-title-main">光學直方圖</span>
      <span class="hist-title-sub font-mono">HISTOGRAM</span>
    </div>
    <div class="hist-controls font-mono">
      <button
        type="button"
        class="mode-chip"
        class:active={displayMode === "rgb"}
        onclick={() => (displayMode = "rgb")}
        title="RGB 三原色分佈波形"
      >
        RGB 色彩
      </button>
      <button
        type="button"
        class="mode-chip"
        class:active={displayMode === "luma"}
        onclick={() => (displayMode = "luma")}
        title="Luma 單色明度光階波形"
      >
        明度階調
      </button>
    </div>
  </div>

  <div class="canvas-wrap hairline-all font-mono">
    <canvas
      bind:this={canvasEl}
      width="240"
      height="46"
      class="hist-canvas"
    ></canvas>
    <div class="scale-readout">
      <span>暗部 0</span>
      <span>中間調 128</span>
      <span>高光 255</span>
    </div>
  </div>
</div>

<style>
  .histogram-card {
    padding: 9px 14px 10px 14px;
    background-color: var(--surface-panel);
  }
  .hist-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .hist-title {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--parchment-bright);
  }
  .hist-title-main {
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .hist-title-sub {
    font-size: 9px;
    letter-spacing: 0.06em;
    color: var(--parchment-dim);
  }
  .hist-icon {
    font-size: 14px;
    color: var(--amber-highlight);
  }
  .hist-controls {
    display: flex;
    gap: 4px;
  }
  .mode-chip {
    padding: 2px 7px;
    font-size: 9.5px;
    background: transparent;
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    color: var(--parchment-dim);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .mode-chip:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
  }
  .mode-chip.active {
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
    background-color: rgba(212, 163, 115, 0.15);
    font-weight: 600;
  }
  .canvas-wrap {
    position: relative;
    border-radius: var(--radius-xs);
    overflow: hidden;
    background: #08090b;
  }
  .hist-canvas {
    width: 100%;
    height: 44px;
    display: block;
  }
  .scale-readout {
    position: absolute;
    bottom: 2px;
    left: 6px;
    right: 6px;
    display: flex;
    justify-content: space-between;
    font-size: 8.5px;
    color: rgba(255, 255, 255, 0.35);
    pointer-events: none;
  }
</style>

