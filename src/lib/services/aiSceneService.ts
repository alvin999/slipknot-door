/**
 * AI Scene Analysis & Heuristic Offline Fallback Service
 * Authentic Gemini / Groq live API inference with automated optical heuristic fallback.
 * Zero hardcoded dummy returns.
 */

import type { ExifOpticalData } from '../types/photo';
import { KeyVaultService } from './keyVaultService';
import { AiEngineFactory } from './ai/engineFactory';

export interface AiSceneDecision {
  scene_type: string;
  scene_title?: string;
  style_insight?: string;
  recommended_mood?: string;
  recommended_profile: string;
  confidence: number;
  exposure_compensation: number;
  contrast?: number;
  color_temp?: number;
  tint?: number;
  lift_shadows: number;
  lut_intensity: number;
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
   * 將任何影像載入並透過 HTML5 Canvas 等比例壓縮為最大 512px 之輕量 JPEG Base64
   * 確保 Payload 降至 30KB~50KB，使雲端多模態推論在 1~3 秒內極速完成，杜絕逾時
   */
  public static async toCleanBase64(imageSrc: string): Promise<{ base64: string; mimeType: string }> {
    if (!imageSrc || imageSrc.trim() === '') {
      throw new Error('影像資料為空');
    }

    // 瀏覽器環境：使用 Image + Canvas 執行極速縮圖壓縮 (Max 512px)
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

        const maxDim = 512;
        let w = img.naturalWidth || img.width || maxDim;
        let h = img.naturalHeight || img.height || maxDim;

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          const commaIdx = dataUrl.indexOf(',');
          return {
            base64: commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl,
            mimeType: 'image/jpeg'
          };
        }
      } catch (e) {
        console.warn('Canvas 512px 壓縮回退至直接 Base64 轉換:', e);
      }
    }

    // 備援方案：若無 DOM 或 Canvas 失敗，直接擷取 Base64
    if (imageSrc.startsWith('data:')) {
      const match = imageSrc.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (match) {
        return { mimeType: match[1], base64: match[2] };
      }
      const commaIdx = imageSrc.indexOf(',');
      if (commaIdx !== -1) {
        return { mimeType: 'image/jpeg', base64: imageSrc.slice(commaIdx + 1) };
      }
    }

    try {
      const resp = await fetch(imageSrc);
      const blob = await resp.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          const comma = res.indexOf(',');
          resolve(comma !== -1 ? res.slice(comma + 1) : res);
        };
        reader.onerror = () => reject(new Error('FileReader 讀取 Blob 失敗'));
        reader.readAsDataURL(blob);
      });

      return { base64, mimeType: 'image/jpeg' };
    } catch (err: any) {
      throw new Error(`無法將縮圖 Blob/URL 轉換為 Base64：${err?.message || err}`);
    }
  }

  /**
   * 取得視覺顯影當前啟用之模型資訊（依使用者任務職責指派動態回傳）
   */
  public static getActiveModelInfo(): { provider: string; modelId: string } {
    const roles = AiEngineFactory.getTaskRoles();
    const provider = roles.vision.provider || 'gemini';
    const modelId = roles.vision.modelId || (provider === 'gemini' ? 'gemini-flash-latest' : 'llama-3.2-11b-vision-preview');
    return { provider, modelId };
  }

  /**
   * 執行場景分析決策：
   * 1. 若使用者「已配置 API 金鑰」：100% 執行雲端多模態神經推論。若遇到伺服器壅塞 (503)、配額或超時，直接真實報錯，絕不私自偷塞寫死本地規則。
   * 2. 若使用者「未配置 API 金鑰」：代表純本機離線操作，才以本機光學規則作為免費基礎輔助。
   */
  public static async analyzeScene(
    imagePayload512pxBase64: string,
    exif: ExifOpticalData
  ): Promise<AiSceneDecision> {
    const startTime = Date.now();

    // 檢查當前視覺引擎是否具備金鑰
    const { strategy, modelId, apiKey } = await AiEngineFactory.getVisionEngine();
    const hasValidKey = !!(apiKey && apiKey.trim() !== '');

    if (!hasValidKey) {
      // 純離線無金鑰模式：才走本地光學啟發式推估
      const fallback = this.heuristicFallback(exif, '未配置 API 金鑰 (純離線本機光學模式)');
      fallback.inferenceDurationMs = Date.now() - startTime;
      return fallback;
    }

    if (!imagePayload512pxBase64 || imagePayload512pxBase64.trim() === '') {
      throw new Error('縮圖影像資料為空，無法傳輸至雲端進行神經視覺分析');
    }

    // 準備輕量 512px Payload
    const tPrep = Date.now();
    const { base64: cleanBase64 } = await this.toCleanBase64(imagePayload512pxBase64);
    const prepMs = Date.now() - tPrep;
    const sizeKb = (cleanBase64.length * 0.75 / 1024).toFixed(1);
    console.info(`[AI_VISION] 縮圖準備完成 (耗時: ${prepMs}ms, 體積: ${sizeKb} KB, 模型: ${modelId})`);

    // 執行真實雲端多模態推論：完全依賴伺服器連線響應與網路狀態，絕不在前端用秒數定時炸彈掐斷連線
    const inferencePromise = strategy.analyzePhoto({
      apiKey,
      modelId,
      imagePayload512pxBase64: cleanBase64,
      exif,
      timeoutMs: 180000 // 提供最寬裕的 3 分鐘底層 Socket 守護，其餘完全由伺服器自然回傳 (200/503/429) 驅動
    });

    try {
      const decision = await inferencePromise;
      decision.inferenceDurationMs = Date.now() - startTime;
      decision.isFallback = false; // 確信為雲端真實推論
      return decision;
    } catch (err: any) {
      const rawMsg = err?.message || '雲端服務連線中斷';
      console.error(`[AI_VISION] 雲端推論失敗 (${strategy.providerName} / ${modelId}):`, err);
      // 有金鑰時直接真實拋出錯誤，讓暗房顯示真實狀況，拒絕假裝成功
      throw new Error(`雲端推論失敗 [${modelId}]：${rawMsg}`);
    }
  }

  /**
   * Rule-based Optical Heuristics when offline or timeout occurs
   */
  public static heuristicFallback(exif: ExifOpticalData, reason?: string): AiSceneDecision {
    const focalMm = parseInt(exif.focalLength, 10) || 0;
    const aperture = parseFloat(exif.apertureValue.replace('f/', '')) || 0;
    const iso = exif.iso || 100;
    const hasCompleteExif = focalMm > 0 && aperture > 0;

    // Rule 1: Portrait condition (large aperture + focal length >= 50mm)
    if (hasCompleteExif && aperture <= 2.0 && focalMm >= 50) {
      return {
        scene_type: 'portrait',
        scene_title: '大光圈淺景深人像',
        style_insight: '偵測到大光圈特寫鏡頭，建議柔化肌膚調性並微升曝光，呈現鎢絲燈柔光暖意。',
        recommended_mood: '柔焦暖光人像',
        recommended_profile: 'Profile_03_TungstenSoft',
        confidence: 0.88,
        exposure_compensation: 0.2,
        contrast: -0.05,
        color_temp: 5800,
        tint: 3.0,
        lift_shadows: 0.15,
        lut_intensity: 0.85,
        tags: ['大光圈', '淺景深', '柔焦暖光', '人像特寫'],
        isFallback: true,
        fallbackReason: reason,
        crop_box: [0.06, 0.10, 0.94, 0.90],
        rotation_deg: 0.0,
        keystone_v: 0.0,
        aspect_ratio: '4:5',
        crop_rationale: '偵測到大光圈特寫人像，建議以 4:5 經典直式比例居中微聚焦主體。'
      };
    }

    // Rule 2: Low-light or Night photography (ISO >= 3200)
    if (iso >= 3200) {
      return {
        scene_type: 'outdoor_street',
        scene_title: '微光夜巡街景',
        style_insight: '高感光度低光場景，建議微調高光抑止噪點、提亮暗部細節，賦予沉穩霧面黑質感。',
        recommended_mood: '消光暗夜影調',
        recommended_profile: 'Profile_01_MatteShadow',
        confidence: 0.82,
        exposure_compensation: 0.1,
        contrast: 0.05,
        color_temp: 5200,
        tint: -2.0,
        lift_shadows: 0.25,
        lut_intensity: 0.80,
        tags: ['微光夜景', '高感度', '暗夜影調', '低光街拍'],
        isFallback: true,
        fallbackReason: reason,
        crop_box: [0.03, 0.04, 0.97, 0.96],
        rotation_deg: -0.5,
        keystone_v: 0.0,
        aspect_ratio: 'original',
        crop_rationale: '夜巡微光環境，微幅校正地平線傾斜以維持視覺重心穩定。'
      };
    }

    // Rule 3: High contrast architecture (aperture >= f/5.6)
    if (hasCompleteExif && aperture >= 5.6) {
      return {
        scene_type: 'urban_geometry',
        scene_title: '幾何建築線條',
        style_insight: '深景深幾何架構，光影對比較為分明，推薦純粹的高反差黑白以強化幾何張力。',
        recommended_mood: '硬調幾何黑白',
        recommended_profile: 'Profile_04_HighContrastMono',
        confidence: 0.85,
        exposure_compensation: 0.0,
        contrast: 0.12,
        color_temp: 5500,
        tint: 0.0,
        lift_shadows: -0.05,
        lut_intensity: 1.0,
        tags: ['幾何建築', '深景深', '高反差黑白', '結構線條'],
        isFallback: true,
        fallbackReason: reason,
        crop_box: [0.04, 0.05, 0.96, 0.95],
        rotation_deg: 0.0,
        keystone_v: -1.0,
        aspect_ratio: 'original',
        crop_rationale: '深景深建築幾何，建議微幅補正仰角透視垂直梯形，消除視覺壓迫感。'
      };
    }

    // Rule 4: Daylight / Landscape / Street base when EXIF is incomplete or ISO is low
    if (iso <= 400) {
      return {
        scene_type: 'outdoor_street',
        scene_title: '日光寫實紀實',
        style_insight: '低感光度自然光照環境，賦予通透層次與適度反差，推薦經典人文寫實底片調性。',
        recommended_mood: '人文寫實紀實',
        recommended_profile: 'Profile_05_DocumentaryChrome',
        confidence: 0.80,
        exposure_compensation: 0.1,
        contrast: 0.04,
        color_temp: 5600,
        tint: 0.5,
        lift_shadows: 0.08,
        lut_intensity: 0.85,
        isFallback: true,
        fallbackReason: reason,
        crop_box: [0.0, 0.0, 1.0, 1.0],
        rotation_deg: 0.0,
        keystone_v: 0.0,
        aspect_ratio: 'original',
        crop_rationale: '日光寫實場景，構圖保持原始取景視角。'
      };
    }

    // Default Fallback
    return {
      scene_type: 'general',
      scene_title: '生活隨拍底片',
      style_insight: '均衡光影環境，微調對比與自然色溫，展現溫潤生活感底片成像。',
      recommended_mood: '日常紀實溫潤',
      recommended_profile: 'Profile_02_GoldenWarmth',
      confidence: 0.75,
      exposure_compensation: 0.05,
      contrast: 0.02,
      color_temp: 5500,
      tint: 0.0,
      lift_shadows: 0.05,
      lut_intensity: 0.80,
      tags: ['日常隨拍', '溫潤色彩', '自然光'],
      isFallback: true,
      fallbackReason: reason,
      crop_box: [0.0, 0.0, 1.0, 1.0],
      rotation_deg: 0.0,
      keystone_v: 0.0,
      aspect_ratio: 'original',
      crop_rationale: '通用隨拍場景，維持原始構圖長寬比。'
    };
  }

  /**
   * 依據使用者指派之視覺策略執行多模態影像推論 (Strategy Pattern)
   */
  private static async callVisionModel(
    imagePayload512pxBase64: string,
    exif: ExifOpticalData
  ): Promise<AiSceneDecision> {
    if (!imagePayload512pxBase64 || imagePayload512pxBase64.trim() === '') {
      return this.heuristicFallback(exif, '縮圖影像資料為空');
    }

    const { strategy, modelId, apiKey } = await AiEngineFactory.getVisionEngine();
    if (!apiKey || apiKey.trim() === '') {
      return this.heuristicFallback(exif, `未配置 ${strategy.providerName} 之可用 API 金鑰 (請於右下角保險庫輸入)`);
    }

    const tPrep = Date.now();
    const { base64: cleanBase64 } = await this.toCleanBase64(imagePayload512pxBase64);
    const prepMs = Date.now() - tPrep;
    const sizeKb = (cleanBase64.length * 0.75 / 1024).toFixed(1);
    console.info(`[AI_VISION] 縮圖準備完成 (耗時: ${prepMs}ms, 體積: ${sizeKb} KB, 模型: ${modelId})`);

    return await strategy.analyzePhoto({
      apiKey,
      modelId,
      imagePayload512pxBase64: cleanBase64,
      exif,
      timeoutMs: this.TIMEOUT_MS
    });
  }

  /**
   * 依據使用者指派之文字策略執行極速社群文案與 IPTC 標籤生成 (Strategy Pattern)
   */
  public static async generateGroqCopywriting(payload: CopywritingPayload): Promise<CopywritingResult> {
    try {
      const { strategy, modelId, apiKey } = await AiEngineFactory.getCopywritingEngine();
      if (!apiKey || apiKey.trim() === '') {
        return this.offlineCopywritingFallback(payload);
      }

      return await strategy.generateCopywriting({
        apiKey,
        modelId,
        payload,
        timeoutMs: 15000
      });
    } catch (err: any) {
      console.warn('AI Copywriting call failed, falling back to offline template:', err?.message || err);
      return this.offlineCopywritingFallback(payload);
    }
  }

  /**
   * 離線離線文案降級模板 (Instant aesthetic templates)
   */
  private static offlineCopywritingFallback(payload: CopywritingPayload): CopywritingResult {
    const baseNote = payload.userPrompt && payload.userPrompt.trim()
      ? `「${payload.userPrompt.trim()}」— `
      : '';
    return {
      caption: `${baseNote}${payload.sceneTitle}。光線於底片顆粒中悄然凝結，留住快門開啟時最真實的呼吸與溫度。`,
      hashtags: ['#底片攝影', '#底片日常', '#35mm', '#光影散策', '#暗房顯影'],
      iptcKeywords: [...(payload.tags || []), 'Analog', 'FilmPhotography', '35mm', 'StreetScene'],
      providerUsed: 'offline'
    };
  }
}

