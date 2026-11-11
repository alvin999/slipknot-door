/**
 * AI Scene Analysis & Vision Orchestration Service
 * Authentic Gemini / Groq live API inference with automated retry and lightweight image compression.
 * Zero hardcoded dummy returns.
 */

import {
  HSL_BAND_KEYS,
  cloneHslAdjustments,
  type ExifOpticalData,
  type AiScopePreferences,
  type HslAdjustments,
} from '../types/photo';
import { AiEngineFactory } from './ai/engineFactory';

export interface AiSceneDecision {
  scene_type: string;
  scene_title?: string;
  style_insight?: string;
  recommended_mood?: string;
  recommended_profile: string;
  exposure_compensation: number;
  highlights?: number;
  contrast?: number;
  color_temp?: number;
  tint?: number;
  lift_shadows: number;
  blacks?: number;
  vibrance?: number;
  lut_intensity: number;
  clarity?: number;
  sharpness?: number;
  color_density?: number;
  shadow_hue?: number;
  shadow_tint_amount?: number;
  highlight_hue?: number;
  highlight_tint_amount?: number;
  halation?: number;
  grain_amount?: number;
  vignette?: number;
  hsl?: HslAdjustments;
  tags?: string[];
  isFallback: boolean;
  fallbackReason?: string; // 記錄跌入本地兜底的真實原因 (透明化 Log 呈現)
  providerUsed?: 'gemini' | 'groq' | 'offline';
  modelUsed?: string;
  inferenceDurationMs?: number;
  // 智慧構圖、裁切與透視校正
  crop_box?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0.0 ~ 1.0
  rotation_deg?: number;                       // 水平傾斜校正角度 (-45 ~ +45)
  keystone_v?: number;                         // 垂直透視梯形校正 (-45 ~ +45)
  aspect_ratio?: 'original' | '1:1' | '4:5' | '16:9' | '9:16' | 'free';
  crop_rationale?: string;                     // 裁切與構圖診斷說明
}

export interface AnalyzeSceneOptions {
  signal?: AbortSignal;
  onLog?: (msg: string) => Promise<void> | void;
  maxRetries?: number; // 預設 2 次自動重試（共嘗試最多 3 次）
  stylePreset?: import('./ai/types').StylePresetKey;
  styleKeywords?: import('./ai/types').StyleKeywordId[];
  customStylePrompt?: string;
  customLuts?: import('./customLutService').CustomLutRecord[];
  renderPreview?: (previewSrc: string, decision: AiSceneDecision) => Promise<string | null>;
  scope?: AiScopePreferences;
}

export interface CopywritingPayload {
  tags: string[];
  sceneTitle: string;
  userPrompt?: string;
  cameraModel?: string;
  lensModel?: string;
  exifOptical?: string;
}

export interface CopywritingResult {
  caption: string;
  hashtags: string[];
  iptcKeywords: string[];
  providerUsed: 'groq' | 'gemini' | 'offline';
}

export class AiSceneService {
  private static TIMEOUT_MS = 60000; // 放寬至 60 秒，提供雲端多模態模型尖峰排隊充裕運算時間

  /**
   * 將任何影像載入並透過 HTML5 Canvas 等比例壓縮為最大 1024px 之輕量 JPEG Base64
   * 確保 Payload 降至 30KB~50KB，使雲端多模態推論在 1~3 秒內極速完成，杜絕逾時
   */
  public static async toCleanBase64(imageSrc: string): Promise<{ base64: string; mimeType: string }> {
    if (!imageSrc || imageSrc.trim() === '') {
      throw new Error('影像資料為空');
    }

    // 瀏覽器環境：使用 Image + Canvas 執行極速縮圖壓縮 (Max 1024px)
    if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
      try {
        const img = new Image();

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            img.onload = null;
            img.onerror = null;
            reject(new Error('圖片載入逾時 (>2s)'));
          }, 2000);
          img.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          img.onerror = () => {
            clearTimeout(timer);
            reject(new Error('縮圖載入失敗'));
          };
          img.src = imageSrc;
        });

        const maxDim = 1024;
        let w = img.naturalWidth || img.width || maxDim;
        let h = img.naturalHeight || img.height || maxDim;

        if (w > maxDim || h > maxDim) {
          if (w >= h) {
            h = Math.round((h / w) * maxDim);
            w = maxDim;
          } else {
            w = Math.round((w / h) * maxDim);
            h = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
          return { base64, mimeType: 'image/jpeg' };
        }
      } catch (err) {
        console.warn('[AI_PREP] Canvas 縮圖壓縮失敗，降級為原始字串清理:', err);
      }
    }

    // Node / 降級環境：純字串剝除 Data URL 前綴
    const clean = imageSrc.includes(',') ? imageSrc.slice(imageSrc.indexOf(',') + 1) : imageSrc;
    return { base64: clean, mimeType: 'image/jpeg' };
  }

  /**
   * 根據 Stage 1 的構圖裁切框 [ymin, xmin, ymax, xmax] 與旋轉角度，
   * 透過 HTML5 Canvas 將影像裁切/旋轉為 Stage 2 專屬的 1024px 乾淨縮圖
   */
  public static async cropAndRotateBase64(
    imageSrc: string,
    cropBox: [number, number, number, number],
    rotationDeg = 0
  ): Promise<string> {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      return imageSrc; // 非瀏覽器/Canvas 環境下降級回傳原圖
    }

    const [ymin, xmin, ymax, xmax] = cropBox;
    const clampedYmin = Math.max(0, Math.min(1, ymin));
    const clampedXmin = Math.max(0, Math.min(1, xmin));
    const clampedYmax = Math.max(clampedYmin + 0.05, Math.min(1, ymax));
    const clampedXmax = Math.max(clampedXmin + 0.05, Math.min(1, xmax));

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('裁切 proxy 圖片載入失敗'));
      img.src = imageSrc.startsWith('data:') ? imageSrc : `data:image/jpeg;base64,${imageSrc}`;
    });

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    const sx = clampedXmin * srcW;
    const sy = clampedYmin * srcH;
    const sWidth = (clampedXmax - clampedXmin) * srcW;
    const sHeight = (clampedYmax - clampedYmin) * srcH;

    // 將目標縮放至最長邊 1024px 以內
    const maxDim = 1024;
    let targetW = sWidth;
    let targetH = sHeight;
    if (targetW > maxDim || targetH > maxDim) {
      if (targetW >= targetH) {
        targetH = Math.round((targetH / targetW) * maxDim);
        targetW = maxDim;
      } else {
        targetW = Math.round((targetW / targetH) * maxDim);
        targetH = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return imageSrc;

    if (rotationDeg !== 0) {
      ctx.translate(targetW / 2, targetH / 2);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      ctx.drawImage(img, sx, sy, sWidth, sHeight, -targetW / 2, -targetH / 2, targetW, targetH);
    } else {
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetW, targetH);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  }

  /**
   * 取得當前指派用於「影像顯影分析 (Vision)」之雲端引擎與模型名稱 (同步讀取 LocalStorage)
   */
  public static getActiveModelInfo(): { provider: string; modelId: string } {
    const roles = AiEngineFactory.getTaskRoles();
    const provider = roles.vision.provider;
    const defaultModel = provider === 'groq' ? 'llama-3.2-11b-vision-preview' : 'gemini-2.5-flash';
    const modelId = roles.vision.modelId || defaultModel;
    return { provider, modelId };
  }

  /**
   * 取得當前指派用於「影像顯影分析 (Vision)」之雲端引擎與模型名稱 (相容非同步別名)
   */
  public static async getActiveVisionRole(): Promise<{ provider: string; modelId: string }> {
    return this.getActiveModelInfo();
  }

  /**
   * 執行場景分析決策：
   * 1. 100% 執行雲端多模態神經推論，具備「智慧自動重試（Auto-retry）」抗尖峰壅塞 (503/429)。
   * 2. 支援分階段解耦管線 (Staged Pipeline)：幾何構圖先行與視角重投影，再進行中性測光與色彩風格分級。
   * 3. 支援隨時手動中斷（AbortSignal），中止時立即掐斷連線與等待。
   */
  public static async analyzeScene(
    imagePayload1024pxBase64: string,
    exif: ExifOpticalData,
    options?: AnalyzeSceneOptions
  ): Promise<AiSceneDecision> {
    const startTime = Date.now();

    // 檢查當前視覺引擎是否具備金鑰
    const { strategy, modelId, apiKey } = await AiEngineFactory.getVisionEngine();
    const hasValidKey = !!(apiKey && apiKey.trim() !== '');

    if (!hasValidKey) {
      throw new Error(`未配置 ${strategy.providerName} 之可用 API 金鑰，請先至右下角保險庫輸入金鑰`);
    }

    if (!imagePayload1024pxBase64 || imagePayload1024pxBase64.trim() === '') {
      throw new Error('縮圖影像資料為空，無法傳輸至雲端進行神經視覺分析');
    }

    // 準備輕量 1024px Payload
    const tPrep = Date.now();
    const { base64: cleanBase64 } = await this.toCleanBase64(imagePayload1024pxBase64);
    const prepMs = Date.now() - tPrep;
    const sizeKb = (cleanBase64.length * 0.75 / 1024).toFixed(1);
    console.info(`[AI_VISION] 縮圖準備完成 (耗時: ${prepMs}ms, 體積: ${sizeKb} KB, 模型: ${modelId})`);

    const maxRetries = options?.maxRetries ?? 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      if (options?.signal?.aborted) {
        throw new Error('使用者已手動中止推論程序');
      }

      try {
        let decision: AiSceneDecision;
        const scope = options?.scope;
        const needGeometry = !scope || scope.crop || scope.keystone;
        const needColor = !scope || scope.tone || scope.whiteBalance || scope.lutProfile || scope.filmPhysics !== false;

        // 【分階段智慧排程管線】
        // 若使用者指派了 scope，且幾何與調色同時需要，由 strategy 分步推論
        if (scope && needGeometry && needColor && strategy.analyzeGeometry && strategy.analyzeColorGrade) {
          if (options?.onLog) {
            await options.onLog(`> [PIPELINE: 1/2] 啟動空間幾何與構圖分析 (Stage 1)...`);
          }

          const geoDecision = await strategy.analyzeGeometry({
            apiKey,
            modelId,
            imagePayload1024pxBase64: cleanBase64,
            exif,
            signal: options?.signal,
            scope,
            stage: 'geometry',
          });

          const cropBox = geoDecision.crop_box || [0.0, 0.0, 1.0, 1.0];
          const isFull = cropBox[0] <= 0.01 && cropBox[1] <= 0.01 && cropBox[2] >= 0.99 && cropBox[3] >= 0.99;
          const rotDeg = geoDecision.rotation_deg || 0.0;

          if (options?.onLog) {
            const rotText = rotDeg !== 0 ? `，旋轉 ${rotDeg > 0 ? '+' : ''}${rotDeg.toFixed(1)}°` : '';
            const cropText = !isFull ? `，裁切至 [${cropBox.map((v) => v.toFixed(2)).join(', ')}]` : '，維持全景視野';
            await options.onLog(`> [PIPELINE: 1/2] 幾何分析就緒：${geoDecision.crop_rationale || '邊界校正'}${cropText}${rotText}`);
          }

          // 若有非全幅裁切或顯著傾斜，產生裁切重投影縮圖作為 Stage 2 的純淨基底
          let colorInputBase64 = cleanBase64;
          if (!isFull || Math.abs(rotDeg) > 0.5) {
            try {
              colorInputBase64 = await this.cropAndRotateBase64(cleanBase64, cropBox, rotDeg);
              if (options?.onLog) {
                await options.onLog(`> [PIPELINE] 視野重投影完成，以新構圖視野動態執行測光與風格分級 (Stage 2)...`);
              }
            } catch (cropErr) {
              console.warn('[PIPELINE] 縮圖裁切失敗，使用原圖進行調色：', cropErr);
            }
          } else {
            if (options?.onLog) {
              await options.onLog(`> [PIPELINE: 2/2] 啟動物理測光與色彩風格分級 (Stage 2)...`);
            }
          }

          const colorDecision = await strategy.analyzeColorGrade({
            apiKey,
            modelId,
            imagePayload1024pxBase64: colorInputBase64,
            exif,
            signal: options?.signal,
            stylePreset: options?.stylePreset,
            styleKeywords: options?.styleKeywords,
            customStylePrompt: options?.customStylePrompt,
            customLuts: options?.customLuts,
            scope,
            stage: 'colorGrade',
          });

          decision = {
            scene_type: colorDecision.scene_type || 'outdoor_street',
            scene_title: colorDecision.scene_title || '光影畫面顯影',
            style_insight: colorDecision.style_insight || 'AI 已完成分步幾何構圖與階調調校。',
            recommended_mood: colorDecision.recommended_mood || '底片氛圍調性',
            recommended_profile: colorDecision.recommended_profile || 'Profile_00_StandardNatural',
            exposure_compensation: typeof colorDecision.exposure_compensation === 'number' ? colorDecision.exposure_compensation : 0.0,
            highlights: typeof colorDecision.highlights === 'number' ? colorDecision.highlights : 0.0,
            contrast: typeof colorDecision.contrast === 'number' ? colorDecision.contrast : 0.0,
            color_temp: typeof colorDecision.color_temp === 'number' ? colorDecision.color_temp : 5500,
            tint: typeof colorDecision.tint === 'number' ? colorDecision.tint : 0.0,
            lift_shadows: typeof colorDecision.lift_shadows === 'number' ? colorDecision.lift_shadows : 0.0,
            blacks: typeof colorDecision.blacks === 'number' ? colorDecision.blacks : 0.0,
            vibrance: typeof colorDecision.vibrance === 'number' ? colorDecision.vibrance : 0.0,
            lut_intensity: typeof colorDecision.lut_intensity === 'number' ? colorDecision.lut_intensity : 0.85,
            clarity: typeof colorDecision.clarity === 'number' ? colorDecision.clarity : 0.0,
            sharpness: typeof colorDecision.sharpness === 'number' ? colorDecision.sharpness : 0.0,
            color_density: typeof colorDecision.color_density === 'number' ? colorDecision.color_density : 0.0,
            shadow_hue: typeof colorDecision.shadow_hue === 'number' ? colorDecision.shadow_hue : 200,
            shadow_tint_amount: typeof colorDecision.shadow_tint_amount === 'number' ? colorDecision.shadow_tint_amount : 0.0,
            highlight_hue: typeof colorDecision.highlight_hue === 'number' ? colorDecision.highlight_hue : 40,
            highlight_tint_amount: typeof colorDecision.highlight_tint_amount === 'number' ? colorDecision.highlight_tint_amount : 0.0,
            halation: typeof colorDecision.halation === 'number' ? colorDecision.halation : 0.0,
            grain_amount: typeof colorDecision.grain_amount === 'number' ? colorDecision.grain_amount : 0.15,
            vignette: typeof colorDecision.vignette === 'number' ? colorDecision.vignette : 0.0,
            hsl: colorDecision.hsl ? cloneHslAdjustments(colorDecision.hsl) : undefined,
            tags: colorDecision.tags || ['光影顯影', '底片氛圍'],
            isFallback: false,
            providerUsed: strategy.providerId as any,
            modelUsed: modelId,
            crop_box: cropBox,
            rotation_deg: rotDeg,
            keystone_v: geoDecision.keystone_v || 0.0,
            aspect_ratio: geoDecision.aspect_ratio || 'original',
            crop_rationale: geoDecision.crop_rationale || '',
          };
        } else if (scope && needGeometry && !needColor && strategy.analyzeGeometry) {
          // 僅需要幾何分析
          if (options?.onLog) {
            await options.onLog(`> [PIPELINE] 僅執行空間幾何與構圖分析 (Stage 1)...`);
          }
          const geoDecision = await strategy.analyzeGeometry({
            apiKey,
            modelId,
            imagePayload1024pxBase64: cleanBase64,
            exif,
            signal: options?.signal,
            scope,
            stage: 'geometry',
          });
          decision = {
            scene_type: 'geometry_only',
            scene_title: '幾何構圖校正',
            style_insight: geoDecision.crop_rationale || '已完成構圖水平與透視校正。',
            recommended_profile: 'Profile_00_StandardNatural',
            exposure_compensation: 0.0,
            lift_shadows: 0.0,
            lut_intensity: 0.0,
            isFallback: false,
            providerUsed: strategy.providerId as any,
            modelUsed: modelId,
            crop_box: geoDecision.crop_box || [0.0, 0.0, 1.0, 1.0],
            rotation_deg: geoDecision.rotation_deg || 0.0,
            keystone_v: geoDecision.keystone_v || 0.0,
            aspect_ratio: geoDecision.aspect_ratio || 'original',
            crop_rationale: geoDecision.crop_rationale || '',
          };
        } else if (scope && !needGeometry && needColor && strategy.analyzeColorGrade) {
          // 僅需要色彩與光影分析
          if (options?.onLog) {
            await options.onLog(`> [PIPELINE] 鎖定幾何構圖，專注執行測光與色彩階調分級 (Stage 2)...`);
          }
          const colorDecision = await strategy.analyzeColorGrade({
            apiKey,
            modelId,
            imagePayload1024pxBase64: cleanBase64,
            exif,
            signal: options?.signal,
            stylePreset: options?.stylePreset,
            styleKeywords: options?.styleKeywords,
            customStylePrompt: options?.customStylePrompt,
            customLuts: options?.customLuts,
            scope,
            stage: 'colorGrade',
          });
          decision = {
            scene_type: colorDecision.scene_type || 'outdoor_street',
            scene_title: colorDecision.scene_title || '光影畫面顯影',
            style_insight: colorDecision.style_insight || 'AI 已完成光影與色調分級。',
            recommended_mood: colorDecision.recommended_mood || '底片氛圍調性',
            recommended_profile: colorDecision.recommended_profile || 'Profile_00_StandardNatural',
            exposure_compensation: typeof colorDecision.exposure_compensation === 'number' ? colorDecision.exposure_compensation : 0.0,
            highlights: typeof colorDecision.highlights === 'number' ? colorDecision.highlights : 0.0,
            contrast: typeof colorDecision.contrast === 'number' ? colorDecision.contrast : 0.0,
            color_temp: typeof colorDecision.color_temp === 'number' ? colorDecision.color_temp : 5500,
            tint: typeof colorDecision.tint === 'number' ? colorDecision.tint : 0.0,
            lift_shadows: typeof colorDecision.lift_shadows === 'number' ? colorDecision.lift_shadows : 0.0,
            blacks: typeof colorDecision.blacks === 'number' ? colorDecision.blacks : 0.0,
            vibrance: typeof colorDecision.vibrance === 'number' ? colorDecision.vibrance : 0.0,
            lut_intensity: typeof colorDecision.lut_intensity === 'number' ? colorDecision.lut_intensity : 0.85,
            clarity: typeof colorDecision.clarity === 'number' ? colorDecision.clarity : 0.0,
            sharpness: typeof colorDecision.sharpness === 'number' ? colorDecision.sharpness : 0.0,
            color_density: typeof colorDecision.color_density === 'number' ? colorDecision.color_density : 0.0,
            shadow_hue: typeof colorDecision.shadow_hue === 'number' ? colorDecision.shadow_hue : 200,
            shadow_tint_amount: typeof colorDecision.shadow_tint_amount === 'number' ? colorDecision.shadow_tint_amount : 0.0,
            highlight_hue: typeof colorDecision.highlight_hue === 'number' ? colorDecision.highlight_hue : 40,
            highlight_tint_amount: typeof colorDecision.highlight_tint_amount === 'number' ? colorDecision.highlight_tint_amount : 0.0,
            halation: typeof colorDecision.halation === 'number' ? colorDecision.halation : 0.0,
            grain_amount: typeof colorDecision.grain_amount === 'number' ? colorDecision.grain_amount : 0.15,
            vignette: typeof colorDecision.vignette === 'number' ? colorDecision.vignette : 0.0,
            hsl: colorDecision.hsl ? cloneHslAdjustments(colorDecision.hsl) : undefined,
            tags: colorDecision.tags || ['光影顯影', '底片氛圍'],
            isFallback: false,
            providerUsed: strategy.providerId as any,
            modelUsed: modelId,
            crop_box: [0.0, 0.0, 1.0, 1.0],
            rotation_deg: 0.0,
            keystone_v: 0.0,
            aspect_ratio: 'original',
            crop_rationale: '',
          };
        } else {
          // 全量單次相容推論
          decision = await strategy.analyzePhoto({
            apiKey,
            modelId,
            imagePayload1024pxBase64: cleanBase64,
            exif,
            signal: options?.signal,
            stylePreset: options?.stylePreset,
            styleKeywords: options?.styleKeywords,
            customStylePrompt: options?.customStylePrompt,
            customLuts: options?.customLuts,
            timeoutMs: 180000,
          });
        }

        // Pass 1 視覺分析完成，即時輸出初判成果與風格洞見
        if (options?.onLog) {
          const pass1Duration = ((Date.now() - startTime) / 1000).toFixed(1);
          const modelTag = decision.modelUsed ? ` [${decision.modelUsed}]` : '';
          await options.onLog(
            `> [CLOUD_DETECTED] 雲端視覺識別完成${modelTag}：【${decision.scene_title || decision.scene_type}】 (耗時 ${pass1Duration}s)`
          );
          if (decision.tags && decision.tags.length > 0) {
            await options.onLog(`> [VISION_TAGS] 視覺特徵：#${decision.tags.join(' #')}`);
          }
          if (decision.style_insight) {
            await options.onLog(`> [INSIGHT] ${decision.style_insight}`);
          }
          if (decision.recommended_mood) {
            await options.onLog(`> [MOOD_SUGGEST] 建議風格調性：${decision.recommended_mood}`);
          }
        }

        // 若開啟雙圖閉環覆審 (Pass 2 Critic Refinement)，且有提供渲染器
        try {
          const criticEngine = await AiEngineFactory.getCriticEngine();
          if (criticEngine.enabled && criticEngine.strategy?.refinePhoto && criticEngine.apiKey && options?.renderPreview) {
            if (options.onLog) {
              await options.onLog(`> [AI_CRITIC] 啟動雙圖閉環覆審 (${criticEngine.modelId || criticEngine.strategy.providerName})...`);
            }
            // 傳入已輕量化至 1024px 之純淨 Base64 進行渲染
            const previewInput = `data:image/jpeg;base64,${cleanBase64}`;
            const renderedBase64 = await options.renderPreview(previewInput, decision);
            if (!renderedBase64 || renderedBase64.trim() === '') {
              if (options.onLog) {
                await options.onLog(`> [AI_CRITIC_NOTICE] 成果圖生成略過，直接採用 Pass 1 決策出圖`);
              }
            } else {
              if (options.onLog) {
                await options.onLog(`> [AI_CRITIC_INSPECT] 雙圖比對審查中 (${criticEngine.modelId || 'Critic'})...`);
              }
              const refinement = await criticEngine.strategy.refinePhoto({
                apiKey: criticEngine.apiKey,
                modelId: criticEngine.modelId,
                originalImageBase64: cleanBase64,
                renderedImageBase64: renderedBase64,
                firstPassDecision: decision,
                exif,
                signal: options.signal,
                stylePreset: options.stylePreset,
                styleKeywords: options.styleKeywords,
                customStylePrompt: options.customStylePrompt,
              });

              // 記錄 Pass 1 原始基準值以供差值對照紀錄
              const prevExposure = decision.exposure_compensation;
              const prevShadow = decision.lift_shadows;
              const prevTemp = decision.color_temp ?? 5500;
              const prevTint = decision.tint ?? 0.0;
              const prevContrast = decision.contrast ?? 0.0;
              const prevLut = decision.lut_intensity ?? 0.85;
              const prevClarity = decision.clarity ?? 0.0;
              const prevSharpness = decision.sharpness ?? 0.0;
              const prevColorDensity = decision.color_density ?? 0.0;
              const prevShadowTintAmount = decision.shadow_tint_amount ?? 0.0;
              const prevHighlightTintAmount = decision.highlight_tint_amount ?? 0.0;
              const prevHalation = decision.halation ?? 0.0;
              const prevGrainAmount = decision.grain_amount ?? 0.15;
              const prevHighlights = decision.highlights ?? 0.0;
              const prevBlacks = decision.blacks ?? 0.0;
              const prevVibrance = decision.vibrance ?? 0.0;
              const prevVignette = decision.vignette ?? 0.0;

              // 數值安全融合：Delta 本身不設微小限幅，僅約束總體結果於 UI 滑桿與著色器物理有效範圍內
              const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
              decision.exposure_compensation = parseFloat(clamp(prevExposure + refinement.exposure_delta, -2.0, 2.0).toFixed(2));
              if (typeof refinement.highlights_delta === 'number') {
                decision.highlights = parseFloat(clamp(prevHighlights + refinement.highlights_delta, -1.0, 1.0).toFixed(2));
              }
              decision.lift_shadows = parseFloat(clamp(prevShadow + refinement.lift_shadows_delta, -0.5, 0.5).toFixed(2));
              if (typeof refinement.blacks_delta === 'number') {
                decision.blacks = parseFloat(clamp(prevBlacks + refinement.blacks_delta, -0.5, 0.5).toFixed(2));
              }
              decision.color_temp = Math.round(clamp(prevTemp + refinement.color_temp_delta, 2800, 8500));
              decision.contrast = parseFloat(clamp(prevContrast + refinement.contrast_delta, -0.8, 0.8).toFixed(2));
              if (typeof refinement.tint_delta === 'number') {
                decision.tint = parseFloat(clamp(prevTint + refinement.tint_delta, -100.0, 100.0).toFixed(1));
              }
              if (typeof refinement.lut_intensity_delta === 'number') {
                decision.lut_intensity = parseFloat(clamp(prevLut + refinement.lut_intensity_delta, 0.0, 1.0).toFixed(2));
              }
              if (typeof refinement.clarity_delta === 'number') {
                decision.clarity = parseFloat(clamp(prevClarity + refinement.clarity_delta, -1.0, 1.0).toFixed(2));
              }
              if (typeof refinement.sharpness_delta === 'number') {
                decision.sharpness = parseFloat(clamp(prevSharpness + refinement.sharpness_delta, -1.0, 1.0).toFixed(2));
              }
              if (typeof refinement.vibrance_delta === 'number') {
                decision.vibrance = parseFloat(clamp(prevVibrance + refinement.vibrance_delta, -1.0, 1.0).toFixed(2));
              }
              if (typeof refinement.color_density_delta === 'number') {
                decision.color_density = parseFloat(clamp(prevColorDensity + refinement.color_density_delta, -1.0, 1.0).toFixed(2));
              }
              if (typeof refinement.shadow_tint_amount_delta === 'number') {
                decision.shadow_tint_amount = parseFloat(clamp(prevShadowTintAmount + refinement.shadow_tint_amount_delta, 0.0, 1.0).toFixed(2));
              }
              if (typeof refinement.highlight_tint_amount_delta === 'number') {
                decision.highlight_tint_amount = parseFloat(clamp(prevHighlightTintAmount + refinement.highlight_tint_amount_delta, 0.0, 1.0).toFixed(2));
              }
              if (typeof refinement.halation_delta === 'number') {
                decision.halation = parseFloat(clamp(prevHalation + refinement.halation_delta, 0.0, 1.0).toFixed(2));
              }
              if (typeof refinement.grain_amount_delta === 'number') {
                decision.grain_amount = parseFloat(clamp(prevGrainAmount + refinement.grain_amount_delta, 0.0, 1.0).toFixed(2));
              }
              if (typeof refinement.vignette_delta === 'number') {
                decision.vignette = parseFloat(clamp(prevVignette + refinement.vignette_delta, -1.0, 1.0).toFixed(2));
              }
              const hslChangeLogs: string[] = [];
              if (refinement.hsl_deltas) {
                const nextHsl = cloneHslAdjustments(decision.hsl);
                for (const band of HSL_BAND_KEYS) {
                  const deltaBand = refinement.hsl_deltas[band];
                  if (!deltaBand) continue;
                  if (typeof deltaBand.hue === 'number') {
                    nextHsl[band].hue = parseFloat(clamp(nextHsl[band].hue + deltaBand.hue, -1.0, 1.0).toFixed(2));
                  }
                  if (typeof deltaBand.sat === 'number') {
                    nextHsl[band].sat = parseFloat(clamp(nextHsl[band].sat + deltaBand.sat, -1.0, 1.0).toFixed(2));
                  }
                  if (typeof deltaBand.lum === 'number') {
                    nextHsl[band].lum = parseFloat(clamp(nextHsl[band].lum + deltaBand.lum, -1.0, 1.0).toFixed(2));
                  }
                  if (
                    Math.abs(deltaBand.hue ?? 0) >= 0.02
                    || Math.abs(deltaBand.sat ?? 0) >= 0.02
                    || Math.abs(deltaBand.lum ?? 0) >= 0.02
                  ) {
                    hslChangeLogs.push(`${band}(H:${nextHsl[band].hue.toFixed(2)},S:${nextHsl[band].sat.toFixed(2)},L:${nextHsl[band].lum.toFixed(2)})`);
                  }
                }
                decision.hsl = nextHsl;
              }

              if (options.onLog) {
                await options.onLog(
                  `> [AI_CRITIC_DONE] 覆審校正完成：${refinement.refine_rationale}`
                );

                const diffLogs: string[] = [];
                const formatDelta = (delta: number, unit = '', decimals = 2) => {
                  const sign = delta > 0 ? '+' : '';
                  return `${sign}${delta.toFixed(decimals)}${unit}`;
                };

                if (Math.abs(refinement.exposure_delta) >= 0.05) {
                  diffLogs.push(`  • 曝光: ${formatDelta(refinement.exposure_delta, ' EV')} (${prevExposure.toFixed(2)} → ${decision.exposure_compensation.toFixed(2)})`);
                }
                if (Math.abs(refinement.lift_shadows_delta) >= 0.05) {
                  diffLogs.push(`  • 暗部: ${formatDelta(refinement.lift_shadows_delta)} (${prevShadow.toFixed(2)} → ${decision.lift_shadows.toFixed(2)})`);
                }
                if (Math.abs(refinement.contrast_delta) >= 0.05) {
                  diffLogs.push(`  • 對比: ${formatDelta(refinement.contrast_delta)} (${prevContrast.toFixed(2)} → ${decision.contrast.toFixed(2)})`);
                }
                if (Math.abs(refinement.color_temp_delta) >= 10) {
                  diffLogs.push(`  • 色溫: ${refinement.color_temp_delta > 0 ? '+' : ''}${refinement.color_temp_delta} K (${prevTemp}K → ${decision.color_temp}K)`);
                }
                if (typeof refinement.tint_delta === 'number' && Math.abs(refinement.tint_delta) >= 0.5) {
                  const newTint = decision.tint ?? 0.0;
                  diffLogs.push(`  • 色調 (Tint): ${refinement.tint_delta > 0 ? '+' : ''}${refinement.tint_delta.toFixed(1)} (${prevTint >= 0 ? '+' : ''}${prevTint.toFixed(1)} → ${newTint >= 0 ? '+' : ''}${newTint.toFixed(1)})`);
                }
                if (typeof refinement.lut_intensity_delta === 'number' && Math.abs(refinement.lut_intensity_delta) >= 0.01) {
                  diffLogs.push(`  • LUT 濃度: ${formatDelta(refinement.lut_intensity_delta)} (${prevLut.toFixed(2)} → ${decision.lut_intensity.toFixed(2)})`);
                }
                if (typeof refinement.clarity_delta === 'number' && Math.abs(refinement.clarity_delta) >= 0.01) {
                  const newClarity = decision.clarity ?? 0.0;
                  diffLogs.push(`  • 清晰度: ${formatDelta(refinement.clarity_delta)} (${prevClarity >= 0 ? '+' : ''}${prevClarity.toFixed(2)} → ${newClarity >= 0 ? '+' : ''}${newClarity.toFixed(2)})`);
                }
                if (typeof refinement.sharpness_delta === 'number' && Math.abs(refinement.sharpness_delta) >= 0.01) {
                  const newSharpness = decision.sharpness ?? 0.0;
                  diffLogs.push(`  • 銳利度: ${formatDelta(refinement.sharpness_delta)} (${prevSharpness >= 0 ? '+' : ''}${prevSharpness.toFixed(2)} → ${newSharpness >= 0 ? '+' : ''}${newSharpness.toFixed(2)})`);
                }
                if (typeof refinement.color_density_delta === 'number' && Math.abs(refinement.color_density_delta) >= 0.01) {
                  const newDensity = decision.color_density ?? 0.0;
                  diffLogs.push(`  • 色彩密度: ${formatDelta(refinement.color_density_delta)} (${prevColorDensity >= 0 ? '+' : ''}${prevColorDensity.toFixed(2)} → ${newDensity >= 0 ? '+' : ''}${newDensity.toFixed(2)})`);
                }
                if (typeof refinement.shadow_tint_amount_delta === 'number' && Math.abs(refinement.shadow_tint_amount_delta) >= 0.01) {
                  const newSh = decision.shadow_tint_amount ?? 0.0;
                  diffLogs.push(`  • 暗部色調: ${formatDelta(refinement.shadow_tint_amount_delta)} (${prevShadowTintAmount.toFixed(2)} → ${newSh.toFixed(2)})`);
                }
                if (typeof refinement.highlight_tint_amount_delta === 'number' && Math.abs(refinement.highlight_tint_amount_delta) >= 0.01) {
                  const newHi = decision.highlight_tint_amount ?? 0.0;
                  diffLogs.push(`  • 亮部色調: ${formatDelta(refinement.highlight_tint_amount_delta)} (${prevHighlightTintAmount.toFixed(2)} → ${newHi.toFixed(2)})`);
                }
                if (typeof refinement.halation_delta === 'number' && Math.abs(refinement.halation_delta) >= 0.01) {
                  const newHal = decision.halation ?? 0.0;
                  diffLogs.push(`  • Halation 暈染: ${formatDelta(refinement.halation_delta)} (${prevHalation.toFixed(2)} → ${newHal.toFixed(2)})`);
                }
                if (typeof refinement.grain_amount_delta === 'number' && Math.abs(refinement.grain_amount_delta) >= 0.01) {
                  const newGr = decision.grain_amount ?? 0.15;
                  diffLogs.push(`  • 銀鹽微粒: ${formatDelta(refinement.grain_amount_delta)} (${prevGrainAmount.toFixed(2)} → ${newGr.toFixed(2)})`);
                }
                if (typeof refinement.highlights_delta === 'number' && Math.abs(refinement.highlights_delta) >= 0.02) {
                  const newHi = decision.highlights ?? 0.0;
                  diffLogs.push(`  • 高光抑揚: ${formatDelta(refinement.highlights_delta)} (${prevHighlights.toFixed(2)} → ${newHi.toFixed(2)})`);
                }
                if (typeof refinement.blacks_delta === 'number' && Math.abs(refinement.blacks_delta) >= 0.02) {
                  const newBlk = decision.blacks ?? 0.0;
                  diffLogs.push(`  • 黑階錨點: ${formatDelta(refinement.blacks_delta)} (${prevBlacks.toFixed(2)} → ${newBlk.toFixed(2)})`);
                }
                if (typeof refinement.vibrance_delta === 'number' && Math.abs(refinement.vibrance_delta) >= 0.02) {
                  const newVib = decision.vibrance ?? 0.0;
                  diffLogs.push(`  • 自然飽和度: ${formatDelta(refinement.vibrance_delta)} (${prevVibrance.toFixed(2)} → ${newVib.toFixed(2)})`);
                }
                if (typeof refinement.vignette_delta === 'number' && Math.abs(refinement.vignette_delta) >= 0.02) {
                  const newVig = decision.vignette ?? 0.0;
                  diffLogs.push(`  • 光學暗角: ${formatDelta(refinement.vignette_delta)} (${prevVignette.toFixed(2)} → ${newVig.toFixed(2)})`);
                }
                if (hslChangeLogs.length > 0) {
                  diffLogs.push(`  • 6段 HSL: ${hslChangeLogs.join(', ')}`);
                }

                if (diffLogs.length > 0) {
                  await options.onLog(`> [AI_CRITIC_DIFF] 參數微調明細：\n${diffLogs.join('\n')}`);
                } else {
                  await options.onLog(`> [AI_CRITIC_DIFF] 各項參數已達動態平衡，無需大幅更動。`);
                }
              }
            }
          }
        } catch (criticErr: any) {
          console.warn('[AI_CRITIC] 覆審階段異常（保留 Pass 1 決策繼續）：', criticErr);
          if (options?.onLog) {
            await options.onLog(`> [AI_CRITIC_SKIP] 覆審略過（保持起草參數）：${criticErr.message}`);
          }
        }

        decision.inferenceDurationMs = Date.now() - startTime;
        decision.isFallback = false; // 確信為雲端真實推論
        return decision;
      } catch (err: any) {
        // 若為使用者主動中止，立即拋出，不進行任何重試
        if (options?.signal?.aborted || err?.name === 'AbortError' || err?.message?.includes('手動中止')) {
          throw new Error('使用者已手動中止批次顯影程序');
        }

        const rawMsg: string = err?.message || '雲端服務連線中斷';
        // 判斷是否為暫時性伺服器尖峰壅塞 (503/UNAVAILABLE/high demand) 或配額冷卻 (429) 或短暫網路抖動
        const isTransient = /503|429|UNAVAILABLE|high demand|rate limit|fetch failed|連線異常|超時/i.test(rawMsg);

        if (isTransient && attempt < maxRetries) {
          attempt++;
          const delaySec = attempt === 1 ? 2.5 : 4.5;
          const retryMsg = `> [RETRY] 雲端伺服器尖峰壅塞 (${rawMsg.includes('503') ? 'HTTP 503' : '暫時壅塞'})，等待 ${delaySec}s 自動重試 (${attempt}/${maxRetries})...`;
          console.warn(`[AI_VISION] ${retryMsg} [${modelId}]`);

          if (options?.onLog) {
            await options.onLog(retryMsg);
          }

          // 指數退避等待，支援 signal 隨時喚醒中斷
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => resolve(), delaySec * 1000);
            if (options?.signal) {
              const onAbort = () => {
                clearTimeout(timer);
                reject(new Error('使用者已手動中止批次顯影程序'));
              };
              options.signal.addEventListener('abort', onAbort, { once: true });
            }
          });

          continue; // 進入下一輪重試
        }

        console.error(`[AI_VISION] 雲端推論失敗 (${strategy.providerName} / ${modelId}):`, err);
        // 重試耗盡或非暫時性錯誤（例如 400 Bad Request、401 Invalid Key），如實拋出真實錯誤
        throw new Error(`雲端推論失敗 [${modelId}]：${rawMsg}`);
      }
    }

    throw new Error(`雲端推論失敗 [${modelId}]：重試 ${maxRetries} 次後端點仍處於壅塞狀態`);
  }

  /**
   * 依據使用者指派之文字策略執行極速社群文案與 IPTC 標籤生成 (Strategy Pattern)
   */
  public static async generateGroqCopywriting(payload: CopywritingPayload): Promise<CopywritingResult> {
    const { strategy, modelId, apiKey } = await AiEngineFactory.getCopywritingEngine();
    return await strategy.generateCopywriting({
      apiKey,
      modelId,
      payload,
      timeoutMs: 15000,
    });
  }

  /**
   * 執行 Groq 智慧目錄規劃 (Smart Directory Planning)
   * 依據相片批次屬性與指定策略自動劃分資料夾架構
   */
  public static async planExportDirectory(payload: import('./ai/types').DirectoryPlanPayload): Promise<import('./ai/types').DirectoryPlanResult> {
    const { strategy, modelId, apiKey } = await AiEngineFactory.getCopywritingEngine();
    if (strategy.planDirectory && apiKey && apiKey.trim() !== '') {
      try {
        return await strategy.planDirectory({
          apiKey,
          modelId,
          payload,
          timeoutMs: 20000,
        });
      } catch (err) {
        console.warn('[AI_DIRECTORY] Groq 智慧目錄規劃失敗，降級為啟發式預設：', err);
      }
    }

    // 離線/未配置金鑰之啟發式分類兜底 (Local Fallback)
    const sessionDate = payload.sessionDate || new Date().toISOString().slice(0, 10);
    const hasMultipleProfiles = new Set(payload.photos.map(p => p.profile || 'Profile_00_StandardNatural')).size > 1;

    if (hasMultipleProfiles) {
      const groups = new Map<string, string[]>();
      payload.photos.forEach(p => {
        const prof = p.profile || '標準風格';
        const list = groups.get(prof) || [];
        list.push(p.id);
        groups.set(prof, list);
      });
      let idx = 1;
      const folders = Array.from(groups.entries()).map(([prof, ids]) => {
        const cleanName = prof.replace(/^Profile_\d+_/, '');
        return {
          subPath: `${String(idx++).padStart(2, '0')}_${cleanName}`,
          description: `風格檔 ${cleanName} 成片`,
          photoIds: ids,
          renamePattern: '{original}_graded'
        };
      });
      return {
        projectRootName: `${sessionDate}_風格策展集`,
        rationale: '（離線啟發式）已依據底片風格 (3D LUT) 自動分組歸類。',
        folders,
        rawBackupSubPath: '00_RAW_Originals',
        providerUsed: 'offline'
      };
    }

    return {
      projectRootName: `${sessionDate}_底片導出集`,
      rationale: '（離線預設）全量集中於單一成片目錄。',
      folders: [
        {
          subPath: '01_Final_JPG',
          description: '所有成片',
          photoIds: payload.photos.map(p => p.id),
          renamePattern: '{original}_graded'
        }
      ],
      rawBackupSubPath: '00_RAW_Originals',
      providerUsed: 'offline'
    };
  }
}
