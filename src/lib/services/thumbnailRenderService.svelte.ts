/**
 * 離屏 WebGL 縮圖與預覽渲染服務 (Thumbnail & Style Preview Render Service)
 * 負責處理：
 * 1. 相卷目錄調色縮圖的非同步排程渲染佇列 (Offscreen Catalog Thumbnail Queue)
 * 2. AI 風格卡片即時預覽小圖生成 (Style Preset Preview Thumbs)
 * 3. AI 雙圖閉環覆審 (Pass 1 -> Critic) 1024px 預覽快速渲染
 */

import { WebglLutRenderer } from "$lib/services/webglLutRenderer";
import { lutCatalog } from "$lib/stores/lutCatalog.svelte";
import { darkroomState } from "$lib/stores/darkroomState.svelte";
import { aiPipeline } from "$lib/stores/aiPipeline.svelte";
import type { CustomLutRecord } from "$lib/services/customLutService";
import { hasActiveCropGeometry, renderGeometryToCanvas } from "$lib/utils/cropGeometry";

export class ThumbnailRenderService {
  // 1. 目錄縮圖離屏渲染器與佇列
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenRenderer: WebglLutRenderer | null = null;
  private thumbnailRenderQueue: any[] = [];
  private isProcessingQueue = false;

  // 當縮圖渲染完成時的回呼通知（由 photoLibrary 或頁面註冊以觸發陣列響應式更新）
  onThumbnailRendered: ((photoId: string, dataUrl: string | undefined) => void) | null = null;

  // 2. 風格卡片小預覽狀態與獨立小型渲染器
  stylePreviewThumbs = $state<Record<string, string>>({});
  private stylePreviewCanvas: HTMLCanvasElement | null = null;
  private stylePreviewRenderer: WebglLutRenderer | null = null;
  private stylePreviewToken = 0;
  private lastStylePreviewSource = "";

  /**
   * 同步使用者自訂 3D LUT 至兩個離屏渲染器
   */
  syncCustomLuts(customLuts: CustomLutRecord[] = lutCatalog.userCustomLuts): void {
    if (customLuts.length === 0) return;
    this.offscreenRenderer?.registerCustomLuts(customLuts);
    this.stylePreviewRenderer?.registerCustomLuts(customLuts);
  }

  /**
   * 確保主離屏 WebGL 渲染器已初始化
   */
  ensureOffscreenRenderer(): boolean {
    if (this.offscreenRenderer) return true;
    if (typeof document === "undefined") return false;
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCanvas.width = 400;
    this.offscreenCanvas.height = 300;
    this.offscreenRenderer = new WebglLutRenderer();
    const ok = this.offscreenRenderer.initialize(this.offscreenCanvas);
    if (ok && lutCatalog.userCustomLuts.length > 0) {
      this.offscreenRenderer.registerCustomLuts(lutCatalog.userCustomLuts);
    }
    return ok;
  }

  /**
   * 將相片排入離屏縮圖渲染佇列
   */
  enqueueThumbnailRender(plate: any): void {
    if (!plate) return;
    if (!this.thumbnailRenderQueue.some((p) => p.id === plate.id)) {
      this.thumbnailRenderQueue.push(plate);
    }
    if (!this.isProcessingQueue) {
      this.processThumbnailQueue();
    }
  }

  /**
   * 依序處理縮圖渲染佇列，讓出主執行緒保持 60FPS 流暢
   */
  private async processThumbnailQueue(): Promise<void> {
    if (this.thumbnailRenderQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }
    this.isProcessingQueue = true;

    if (!this.ensureOffscreenRenderer() || !this.offscreenRenderer) {
      this.isProcessingQueue = false;
      return;
    }

    const plate = this.thumbnailRenderQueue.shift();
    if (plate && plate.thumbnail) {
      if (
        plate.appliedProfile === "Profile_00_StandardNatural" &&
        !plate.tuning &&
        !hasActiveCropGeometry(plate.crop)
      ) {
        if (plate.gradedThumbnail !== undefined) {
          plate.gradedThumbnail = undefined;
          this.onThumbnailRendered?.(plate.id, undefined);
        }
      } else {
        try {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = (e) => reject(e);
            img.src = plate.thumbnail;
          });

          const found = lutCatalog.allProfiles.find(
            (p) => p.id === plate.appliedProfile
          );
          const t = plate.tuning;
          const currentEv =
            t?.exposure ??
            (found ? found.evDefault : (plate.asShotExposure ?? 0.0));
          const currentContrast =
            t?.contrast ?? (found ? found.contrastDefault || 0.0 : 0.0);
          const currentTemp = t?.colorTemp ?? plate.asShotTemp ?? 5500;
          const currentTint = t?.tint ?? plate.asShotTint ?? 0.0;
          const currentLut =
            t?.lutIntensity ?? (found ? found.lutIntensityDefault : 1.0);
          const currentShadows =
            t?.shadows ?? (found ? (found.shadowsDefault ?? 0.0) : 0.0);
          const currentClarity =
            t?.clarity ?? (found ? (found.clarityDefault ?? 0.0) : 0.0);
          const currentSharpness =
            t?.sharpness ?? (found ? (found.sharpnessDefault ?? 0.0) : 0.0);
          const currentColorDensity = t?.colorDensity ?? 0.0;
          const currentShadowHue = t?.shadowHue ?? 200;
          const currentShadowTintAmount = t?.shadowTintAmount ?? 0.0;
          const currentHighlightHue = t?.highlightHue ?? 40;
          const currentHighlightTintAmount = t?.highlightTintAmount ?? 0.0;
          const currentHalation = t?.halation ?? 0.0;
          const currentGrainAmount = t?.grainAmount ?? 0.15;
          const currentHighlights =
            t?.highlights ?? (found ? (found.highlightsDefault ?? 0.0) : 0.0);
          const currentBlacks = t?.blacks ?? 0.0;
          const currentVibrance = t?.vibrance ?? 0.0;
          const currentVignette = t?.vignette ?? 0.0;
          const currentMonochrome = t?.monochrome ?? false;
          const currentHsl = t?.hsl;

          this.offscreenRenderer.setImageSource(img);
          this.offscreenRenderer.setProfile(plate.appliedProfile);
          this.offscreenRenderer.render(
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
            img.naturalHeight || 300
          );

          let dataUrl: string | undefined;
          if (hasActiveCropGeometry(plate.crop) && this.offscreenCanvas) {
            const geomCanvas = renderGeometryToCanvas(this.offscreenCanvas, plate.crop, 400);
            dataUrl = geomCanvas.toDataURL("image/jpeg", 0.85);
          } else {
            dataUrl =
              this.offscreenRenderer.exportDataUrl("image/jpeg", 0.85) ??
              undefined;
          }
          if (dataUrl && plate.gradedThumbnail !== dataUrl) {
            plate.gradedThumbnail = dataUrl;
            this.onThumbnailRendered?.(plate.id, dataUrl);
          }
        } catch (err) {
          console.warn("[ThumbnailRenderer] 縮圖渲染略過或失敗:", err);
        }
      }
    }

    // 稍微延遲讓出主執行緒，確保 60FPS 流暢（批次時拉長間隔防止吃滿 GPU 與 CPU 資源）
    const queueInterval = aiPipeline.isBatchAiRunning ? 100 : 25;
    setTimeout(() => this.processThumbnailQueue(), queueInterval);
  }

  /**
   * 依據相片縮圖更新或清除風格卡片小預覽
   */
  updateStylePreviewsForThumbnail(thumbnail?: string, force = false): void {
    if (thumbnail) {
      if (force || thumbnail !== this.lastStylePreviewSource) {
        this.lastStylePreviewSource = thumbnail;
        this.generateStylePreviews(thumbnail);
      }
    } else {
      this.lastStylePreviewSource = "";
      this.stylePreviewToken++;
      this.stylePreviewThumbs = {};
    }
  }

  /**
   * 以當前相片縮圖套用各風格 LUT 後生成小預覽（獨立小型渲染器，避免干擾縮圖佇列）
   */
  async generateStylePreviews(thumbnail: string): Promise<void> {
    const token = ++this.stylePreviewToken;
    if (typeof document === "undefined" || !thumbnail) return;
    if (!this.stylePreviewRenderer) {
      this.stylePreviewCanvas = document.createElement("canvas");
      this.stylePreviewCanvas.width = 160;
      this.stylePreviewCanvas.height = 107;
      const r = new WebglLutRenderer();
      if (!r.initialize(this.stylePreviewCanvas)) return;
      if (lutCatalog.userCustomLuts.length > 0) {
        r.registerCustomLuts(lutCatalog.userCustomLuts);
      }
      this.stylePreviewRenderer = r;
    }
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
        img.src = thumbnail;
      });
      const next: Record<string, string> = {};
      for (const preset of lutCatalog.allStyleGradingPresets) {
        if (token !== this.stylePreviewToken) return; // 已切換相片，放棄過期結果
        if (!preset.profileId) continue;
        if (preset.profileId === "Profile_00_StandardNatural") {
          next[preset.key] = thumbnail;
          continue;
        }
        const prof = lutCatalog.allProfiles.find(
          (p) => p.id === preset.profileId
        );
        this.stylePreviewRenderer.setImageSource(img);
        this.stylePreviewRenderer.setProfile(preset.profileId);
        this.stylePreviewRenderer.render(
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
          107
        );
        const url = this.stylePreviewRenderer.exportDataUrl("image/jpeg", 0.7);
        if (url) next[preset.key] = url;
        // 讓出主執行緒，避免卡住 UI
        await new Promise((r) => setTimeout(r, 0));
      }
      if (token === this.stylePreviewToken) this.stylePreviewThumbs = next;
    } catch (err) {
      console.warn("[StylePreview] 風格預覽生成失敗:", err);
    }
  }

  /**
   * 雙圖閉環覆審專用：以 Pass 1 決策參數極速渲染 1024px 預覽縮圖供 AI 覆審比對
   */
  async renderPass1PreviewForCritic(
    previewSrc: string,
    decision: any,
    targetMonochrome = false,
    activeStylePreset: string = darkroomState.activeStylePreset
  ): Promise<string | null> {
    if (!this.ensureOffscreenRenderer() || !this.offscreenRenderer) return null;
    try {
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

        if (img.complete && img.naturalWidth > 0) {
          clearTimeout(timer);
          resolve();
        }
      });

      const forcedProfileId =
        activeStylePreset !== "auto"
          ? lutCatalog.allStyleGradingPresets.find(
              (sp) => sp.key === activeStylePreset
            )?.profileId
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

      this.offscreenRenderer.setImageSource(img);
      this.offscreenRenderer.setProfile(targetProf);
      this.offscreenRenderer.render(
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
        targetH
      );

      return this.offscreenRenderer.exportDataUrl("image/jpeg", 0.8);
    } catch (err) {
      console.warn("[Pass1CriticRenderer] 預覽生成失敗:", err);
      return null;
    }
  }
}

export const thumbnailRenderService = new ThumbnailRenderService();

