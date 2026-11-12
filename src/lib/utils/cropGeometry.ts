/**
 * 幾何構圖、裁切比例對齊與旋轉安全內縮數學工具 (Crop & Geometry Utilities)
 * 統一提供給 AI 管線、暗房畫布互動、離屏縮圖與高畫質匯出使用。
 */

import type { CropGeometry } from '$lib/types/photo';
import type { CropRatioPreset } from '$lib/stores/darkroomState.svelte';

export interface NormalizedCropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 判斷 AI 回傳的 [ymin, xmin, ymax, xmax] 是否為近似全幅（不需裁切）
 */
export function isFullFrameCropBox(box?: number[] | null): boolean {
  if (!Array.isArray(box) || box.length !== 4) return true;
  return box[0] <= 0.015 && box[1] <= 0.015 && box[2] >= 0.985 && box[3] >= 0.985;
}

/**
 * 判斷目前 CropGeometry 是否有任何實質幾何變動（裁切、旋轉、透視或翻轉）
 */
export function hasActiveCropGeometry(crop?: Partial<CropGeometry> | null): boolean {
  if (!crop) return false;
  return (
    (crop.x ?? 0) > 0.001 ||
    (crop.y ?? 0) > 0.001 ||
    (crop.width ?? 1) < 0.999 ||
    (crop.height ?? 1) < 0.999 ||
    Math.abs(crop.rotation ?? 0) > 0.05 ||
    Math.abs(crop.keystoneV ?? 0) > 0.05 ||
    Math.abs(crop.keystoneH ?? 0) > 0.05 ||
    Boolean(crop.flipH) ||
    Boolean(crop.flipV)
  );
}

/**
 * 將長寬比預設鍵轉換為目標數值寬高比 (width / height)；若為 'free' 則回傳 null
 */
export function getTargetAspectRatio(
  preset: CropRatioPreset,
  imageAspectRatio: number
): number | null {
  const safeImgRatio = Number.isFinite(imageAspectRatio) && imageAspectRatio > 0.05 ? imageAspectRatio : 1.5;
  switch (preset) {
    case 'original':
      return safeImgRatio;
    case '1:1':
      return 1.0;
    case '4:5':
      return 0.8;
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case 'free':
    default:
      return null;
  }
}

/**
 * 依指定長寬比與影像真實比例，以既有裁切框中心為基準精確正規化裁切框
 */
export function snapCropBoxToAspectRatio(
  box: NormalizedCropBox,
  preset: CropRatioPreset,
  imageAspectRatio: number
): NormalizedCropBox {
  const targetRatio = getTargetAspectRatio(preset, imageAspectRatio);
  const safeImgRatio = Number.isFinite(imageAspectRatio) && imageAspectRatio > 0.05 ? imageAspectRatio : 1.5;

  let w = Math.max(0.08, Math.min(1, box.width));
  let h = Math.max(0.08, Math.min(1, box.height));
  const cx = Math.max(0, Math.min(1, box.x + w / 2));
  const cy = Math.max(0, Math.min(1, box.y + h / 2));

  if (targetRatio !== null) {
    // 正規化座標下的 w / h 需滿足 (w * imgW) / (h * imgH) = targetRatio => w / h = targetRatio / safeImgRatio
    const normRatio = targetRatio / safeImgRatio;
    // 以原建議框面積作為參考，盡量維持相近視覺範圍
    const area = w * h;
    w = Math.sqrt(area * normRatio);
    h = w / normRatio;

    if (w > 1.0) {
      w = 1.0;
      h = w / normRatio;
    }
    if (h > 1.0) {
      h = 1.0;
      w = h * normRatio;
    }
    w = Math.max(0.08, Math.min(1.0, w));
    h = Math.max(0.08, Math.min(1.0, h));
  }

  let x = cx - w / 2;
  let y = cy - h / 2;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + w > 1) x = 1 - w;
  if (y + h > 1) y = 1 - h;

  return {
    x: parseFloat(Math.max(0, x).toFixed(3)),
    y: parseFloat(Math.max(0, y).toFixed(3)),
    width: parseFloat(Math.min(1, w).toFixed(3)),
    height: parseFloat(Math.min(1, h).toFixed(3)),
  };
}

/**
 * 計算在給定旋轉角度 (deg) 下，確保四個角落不超出旋轉後原圖邊界（不露黑邊）的安全裁切框。
 * 若裁切框頂點超出有效像素區，將向中心等比例安全內縮。
 */
export function computeInscribedCropForRotation(
  box: NormalizedCropBox,
  rotationDeg: number,
  imageAspectRatio: number
): NormalizedCropBox {
  const absDeg = Math.abs(rotationDeg);
  if (!Number.isFinite(absDeg) || absDeg < 0.05) {
    return box;
  }

  const r = Number.isFinite(imageAspectRatio) && imageAspectRatio > 0.05 ? imageAspectRatio : 1.5;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // 在高度為 1、寬度為 r 的中心原點座標系中，原圖邊界為 |X| <= r/2, |Y| <= 1/2
  const halfW = r / 2;
  const halfH = 0.5;

  const corners = [
    { u: (box.x - 0.5) * r, v: box.y - 0.5 },
    { u: (box.x + box.width - 0.5) * r, v: box.y - 0.5 },
    { u: (box.x + box.width - 0.5) * r, v: box.y + box.height - 0.5 },
    { u: (box.x - 0.5) * r, v: box.y + box.height - 0.5 },
  ];

  // 將裁切框四角反向旋轉 -rad，檢查是否都落在原圖邊界內
  let scale = 1.0;
  for (const pt of corners) {
    const rx = pt.u * cos + pt.v * sin;
    const ry = -pt.u * sin + pt.v * cos;
    if (Math.abs(rx) > halfW && Math.abs(rx) > 1e-6) {
      scale = Math.min(scale, halfW / Math.abs(rx));
    }
    if (Math.abs(ry) > halfH && Math.abs(ry) > 1e-6) {
      scale = Math.min(scale, halfH / Math.abs(ry));
    }
  }

  if (scale >= 0.999) {
    return box;
  }

  // 以影像中心 (0.5, 0.5) 為縮放中心進行安全內縮，完美保留長寬比且絕不露黑邊
  const nextX = 0.5 + (box.x - 0.5) * scale;
  const nextY = 0.5 + (box.y - 0.5) * scale;
  const nextW = Math.max(0.08, box.width * scale);
  const nextH = Math.max(0.08, box.height * scale);

  return {
    x: parseFloat(Math.max(0, Math.min(1 - nextW, nextX)).toFixed(3)),
    y: parseFloat(Math.max(0, Math.min(1 - nextH, nextY)).toFixed(3)),
    width: parseFloat(Math.min(1, nextW).toFixed(3)),
    height: parseFloat(Math.min(1, nextH).toFixed(3)),
  };
}

/**
 * 將裁切、旋轉、垂直/水平梯形透視校正與翻轉套用至 2D Canvas（供匯出與離屏縮圖共用）
 * 透視模型對齊 DarkroomViewport 的 CSS `perspective(1000px) rotateX(-kv) rotateY(kh)`。
 */
export function renderGeometryToCanvas(
  sourceCanvas: HTMLCanvasElement,
  crop: Partial<CropGeometry> | undefined,
  maxLongEdge: number | null = null
): HTMLCanvasElement {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (!w || !h) return sourceCanvas;

  const hasGeom = hasActiveCropGeometry(crop);
  const cropX = hasGeom && crop ? Math.max(0, Math.min(1, crop.x ?? 0)) : 0;
  const cropY = hasGeom && crop ? Math.max(0, Math.min(1, crop.y ?? 0)) : 0;
  const cropW = hasGeom && crop ? Math.max(0.01, Math.min(1 - cropX, crop.width ?? 1)) : 1;
  const cropH = hasGeom && crop ? Math.max(0.01, Math.min(1 - cropY, crop.height ?? 1)) : 1;
  const rotDeg = hasGeom && crop ? (crop.rotation ?? 0) : 0;
  const kv = hasGeom && crop ? (crop.keystoneV ?? 0) : 0;
  const kh = hasGeom && crop ? (crop.keystoneH ?? 0) : 0;
  const flipH = hasGeom && crop ? Boolean(crop.flipH) : false;
  const flipV = hasGeom && crop ? Boolean(crop.flipV) : false;

  const srcW = Math.max(1, Math.round(cropW * w));
  const srcH = Math.max(1, Math.round(cropH * h));
  const currentLongEdge = Math.max(srcW, srcH);
  const needsResize = maxLongEdge !== null && maxLongEdge > 0 && currentLongEdge > maxLongEdge;

  if (!hasGeom && !needsResize) {
    return sourceCanvas;
  }

  let transformedCanvas: HTMLCanvasElement = sourceCanvas;

  // 1. 先套用旋轉、翻轉與梯形透視（若有）
  if (Math.abs(rotDeg) > 0.05 || Math.abs(kv) > 0.05 || Math.abs(kh) > 0.05 || flipH || flipV) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = 'high';

      if (Math.abs(kv) > 0.05 || Math.abs(kh) > 0.05) {
        // 先建立旋轉與翻轉後的中繼畫布
        const rotCanvas = document.createElement('canvas');
        rotCanvas.width = w;
        rotCanvas.height = h;
        const rotCtx = rotCanvas.getContext('2d');
        if (rotCtx) {
          rotCtx.imageSmoothingEnabled = true;
          rotCtx.imageSmoothingQuality = 'high';
          rotCtx.translate(w / 2, h / 2);
          if (rotDeg !== 0) rotCtx.rotate((rotDeg * Math.PI) / 180);
          if (flipH || flipV) rotCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
          rotCtx.drawImage(sourceCanvas, -w / 2, -h / 2, w, h);

          // 透過掃描條帶投影模擬 CSS perspective(1000px) rotateX(-kv)
          // kv > 0：頂部往外擴張（補償仰拍收斂），底部微縮
          const kvRad = (-kv * Math.PI) / 180;
          const sinX = Math.sin(kvRad);
          const cosX = Math.cos(kvRad);
          const d = Math.max(w, h) * 1.4; // 焦距距離
          const stripH = 2;

          for (let y = 0; y < h; y += stripH) {
            const yc = y - h / 2;
            const z = -yc * sinX;
            const persp = d / Math.max(d * 0.25, d - z);
            const dstY = h / 2 + yc * cosX * persp;
            const dstH = Math.max(1, stripH * cosX * persp + 0.75);
            const dstW = w * persp;
            const dstX = (w - dstW) / 2;
            tempCtx.drawImage(rotCanvas, 0, y, w, Math.min(stripH, h - y), dstX, dstY, dstW, dstH);
          }

          if (Math.abs(kh) > 0.05) {
            const khCanvas = document.createElement('canvas');
            khCanvas.width = w;
            khCanvas.height = h;
            const khCtx = khCanvas.getContext('2d');
            if (khCtx) {
              const khRad = (kh * Math.PI) / 180;
              const sinY = Math.sin(khRad);
              const cosY = Math.cos(khRad);
              const stripW = 2;
              for (let x = 0; x < w; x += stripW) {
                const xc = x - w / 2;
                const z = xc * sinY;
                const persp = d / Math.max(d * 0.25, d - z);
                const dstX = w / 2 + xc * cosY * persp;
                const dstW = Math.max(1, stripW * cosY * persp + 0.75);
                const dstH = h * persp;
                const dstY = (h - dstH) / 2;
                khCtx.drawImage(tempCanvas, x, 0, Math.min(stripW, w - x), h, dstX, dstY, dstW, dstH);
              }
              transformedCanvas = khCanvas;
            } else {
              transformedCanvas = tempCanvas;
            }
          } else {
            transformedCanvas = tempCanvas;
          }
        }
      } else {
        tempCtx.translate(w / 2, h / 2);
        if (rotDeg !== 0) {
          tempCtx.rotate((rotDeg * Math.PI) / 180);
        }
        if (flipH || flipV) {
          tempCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        }
        tempCtx.drawImage(sourceCanvas, -w / 2, -h / 2, w, h);
        transformedCanvas = tempCanvas;
      }
    }
  }

  // 2. 裁切並縮放至目標尺寸
  const scale = needsResize && maxLongEdge ? maxLongEdge / currentLongEdge : 1;
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return transformedCanvas;

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(
    transformedCanvas,
    Math.round(cropX * w),
    Math.round(cropY * h),
    srcW,
    srcH,
    0,
    0,
    outW,
    outH
  );

  return outCanvas;
}

