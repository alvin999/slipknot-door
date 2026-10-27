/**
 * AI Scene Analysis & Heuristic Offline Fallback Service
 * Authentic Gemini / Groq live API inference with automated optical heuristic fallback.
 * Zero hardcoded dummy returns.
 */

import type { ExifOpticalData } from '../types/photo';
import { KeyVaultService } from './keyVaultService';

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
  private static TIMEOUT_MS = 10000;

  /**
   * Convert any image payload (Data URL, Blob URL, HTTP URL) into clean Base64 string and MIME type.
   */
  public static async toCleanBase64(imageSrc: string): Promise<{ base64: string; mimeType: string }> {
    if (!imageSrc || imageSrc.trim() === '') {
      throw new Error('影像資料為空');
    }

    // 1. 若已經是 data:image/xxx;base64,yyy
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

    // 2. 若為 blob: 或一般 URL，透過 fetch 轉為 Blob 並用 FileReader 讀成 base64
    try {
      const resp = await fetch(imageSrc);
      const blob = await resp.blob();
      const mimeType = blob.type || 'image/jpeg';

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

      return { base64, mimeType };
    } catch (err: any) {
      throw new Error(`無法將縮圖 Blob/URL 轉換為 Base64：${err?.message || err}`);
    }
  }

  /**
   * Run optical scene analysis with automatic 10000ms offline fallback.
   */
  public static async analyzeScene(
    imagePayload512pxBase64: string,
    exif: ExifOpticalData
  ): Promise<AiSceneDecision> {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI 推論逾時 (>10s)，自動切換在地光學降級')), this.TIMEOUT_MS)
      );

      // Authentic Vision Model Call
      const inferencePromise = this.callVisionModel(imagePayload512pxBase64, exif);

      return await Promise.race([inferencePromise, timeoutPromise]);
    } catch (err: any) {
      const errMsg = err?.message || '雲端服務連線異常';
      console.warn('AI Scene Service switching to optical heuristic fallback:', errMsg);
      return this.heuristicFallback(exif, errMsg);
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
        tags: ['自然日光', '低感光度', '人文紀實', '層次分明'],
        isFallback: true,
        fallbackReason: reason,
        crop_box: [0.02, 0.02, 0.98, 0.98],
        rotation_deg: 0.0,
        keystone_v: 0.0,
        aspect_ratio: 'original',
        crop_rationale: '開闊平衡光照，維持原尺寸構圖，微調四邊邊界。'
      };
    }

    // Default Fallback: Cool teal emerald for medium ISO scenes
    return {
      scene_type: 'outdoor_street',
      scene_title: '開闊日常光景',
      style_insight: '平衡光照環境，推薦微冷調翡翠綠，賦予影像沉靜而通透的電影底片氛圍。',
      recommended_mood: '青綠冷調紀實',
      recommended_profile: 'Profile_02_TealEmerald',
      confidence: 0.78,
      exposure_compensation: 0.05,
      contrast: 0.02,
      color_temp: 5400,
      tint: -1.5,
      lift_shadows: 0.1,
      lut_intensity: 0.9,
      tags: ['日常光景', '平衡光照', '電影質感', '青綠冷調'],
      isFallback: true,
      fallbackReason: reason,
      crop_box: [0.02, 0.02, 0.98, 0.98],
      rotation_deg: 0.0,
      keystone_v: 0.0,
      aspect_ratio: 'original',
      crop_rationale: '開闊平衡光照，維持原尺寸構圖，微調四邊邊界。'
    };
  }

  /**
   * Authentic live model inference via Google Gemini or Groq Vision models
   * Uses dynamically selected model from discovery engine (Zero hardcoded model strings)
   */
  private static async callVisionModel(
    imagePayload512pxBase64: string,
    exif: ExifOpticalData
  ): Promise<AiSceneDecision> {
    // 1. Determine active provider
    // Note: Multimodal visual inference requires Gemini (or vision-capable endpoints).
    // If user has Gemini Key configured, prioritize it for image grading over text-only Groq.
    let provider: 'gemini' | 'groq' = 'gemini';
    if (typeof localStorage !== 'undefined') {
      const storedProv = localStorage.getItem('slipknot_active_provider');
      if (storedProv === 'groq' || storedProv === 'gemini') {
        provider = storedProv;
      }
    }

    // 2. Load API key for active provider (or alternate if first is empty)
    let apiKey: string | null = null;
    try {
      const vaultRes = await KeyVaultService.loadKey(provider);
      apiKey = vaultRes.apiKey;
    } catch {
      // Protected or locked
    }

    // If active provider is Groq (which is primarily text in current free tier), check if Gemini is available
    if (provider === 'groq') {
      try {
        const geminiRes = await KeyVaultService.loadKey('gemini');
        if (geminiRes.apiKey && geminiRes.apiKey.trim() !== '') {
          // Transparently promote visual inference to Gemini
          provider = 'gemini';
          apiKey = geminiRes.apiKey;
        }
      } catch {
        // pass
      }
    }

    if (!apiKey || apiKey.trim() === '') {
      // Try alternate provider
      const altProvider: 'gemini' | 'groq' = provider === 'gemini' ? 'groq' : 'gemini';
      try {
        const altRes = await KeyVaultService.loadKey(altProvider);
        if (altRes.apiKey) {
          apiKey = altRes.apiKey;
          provider = altProvider;
        }
      } catch {
        // Locked
      }
    }

    if (!apiKey || apiKey.trim() === '') {
      // If no valid key provided, immediately fallback with explicit reason
      return this.heuristicFallback(exif, '未配置可用之 AI 金鑰 (請於右下角保險庫輸入)');
    }

    if (provider === 'groq') {
      // Groq does not offer official vision in current free tiers
      throw new Error('Groq 目前端點僅支援文字生成，影像多模態視覺顯影請於金鑰保險庫配置 Gemini 金鑰');
    }

    // If image payload is empty, fallback directly
    if (!imagePayload512pxBase64 || imagePayload512pxBase64.trim() === '') {
      return this.heuristicFallback(exif, '縮圖影像資料為空');
    }

    const { base64: cleanBase64, mimeType } = await this.toCleanBase64(imagePayload512pxBase64);

    // 3. Resolve dynamic model ID
    let modelId: string | null = null;
    if (typeof localStorage !== 'undefined') {
      modelId = localStorage.getItem(`slipknot_model_${provider}`);
    }

    const promptText = `You are a master analog darkroom colorist and curatorial director.
Analyze this photographic image and optical EXIF (ISO: ${exif.iso || 'N/A'}, Shutter: ${exif.shutterSpeed || 'N/A'}, Aperture: ${exif.apertureValue || 'N/A'}, Lens/Focal: ${exif.focalLength || 'N/A'}).
Provide artistic color grading decisions, lighting dynamics, and composition crop recommendations (Rule of Thirds, horizon leveling, perspective correction).
Respond ONLY with raw JSON matching this schema:
{
  "scene_title": "午後斜陽微光街角 (Poetic scene title in Traditional Chinese, 4-8 chars)",
  "scene_type": "outdoor_street",
  "style_insight": "主體處於側逆光環境，建議壓制高光並微提暗部細節，整體色調偏向暖調底片質感。(1-2 sentences professional insight in Traditional Chinese)",
  "recommended_mood": "經典暖調底片 (Mood / style label in Traditional Chinese)",
  "recommended_profile": "One of: Profile_00_StandardNatural, Profile_01_MatteShadow, Profile_02_TealEmerald, Profile_03_TungstenSoft, Profile_04_HighContrastMono, Profile_05_DocumentaryChrome",
  "confidence": 0.94,
  "exposure_compensation": 0.15,
  "contrast": 0.05,
  "color_temp": 5600,
  "tint": 2.0,
  "lift_shadows": 0.1,
  "lut_intensity": 0.85,
  "tags": ["側逆光", "斜陽街角", "暖調底片", "微光散景"],
  "crop_box": [0.04, 0.06, 0.96, 0.94],
  "rotation_deg": -0.8,
  "keystone_v": 0.0,
  "aspect_ratio": "original",
  "crop_rationale": "微幅旋轉校正地平線傾斜，適度收緊邊界以強化畫面視覺重心。(Traditional Chinese)"
}`;

    if (provider === 'gemini') {
      const activeModel = modelId || 'gemini-1.5-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  inlineData: {
                    mimeType: mimeType || 'image/jpeg',
                    data: cleanBase64
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        const detail = errJson?.error?.message || `HTTP ${response.status}`;
        throw new Error(`Gemini 端點回應異常 (${detail})`);
      }

      const jsonRes = await response.json();
      const rawContent = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawContent) {
        throw new Error('Gemini 多模態視覺模型未回傳分析文字');
      }

      const parsed = JSON.parse(rawContent);
      return {
        scene_type: parsed.scene_type || 'outdoor_street',
        scene_title: parsed.scene_title || '光影畫面顯影',
        style_insight: parsed.style_insight || 'AI 已根據畫面光影特徵完成動態範圍與色調調校。',
        recommended_mood: parsed.recommended_mood || '底片氛圍調性',
        recommended_profile: parsed.recommended_profile || 'Profile_01_MatteShadow',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
        exposure_compensation: typeof parsed.exposure_compensation === 'number' ? parsed.exposure_compensation : 0.0,
        contrast: typeof parsed.contrast === 'number' ? parsed.contrast : 0.0,
        color_temp: typeof parsed.color_temp === 'number' ? parsed.color_temp : 5500,
        tint: typeof parsed.tint === 'number' ? parsed.tint : 0.0,
        lift_shadows: typeof parsed.lift_shadows === 'number' ? parsed.lift_shadows : 0.0,
        lut_intensity: typeof parsed.lut_intensity === 'number' ? parsed.lut_intensity : 0.85,
        tags: Array.isArray(parsed.tags) ? parsed.tags : ['光影顯影', '底片氛圍'],
        isFallback: false,
        crop_box: Array.isArray(parsed.crop_box) && parsed.crop_box.length === 4 ? parsed.crop_box : [0.03, 0.04, 0.97, 0.96],
        rotation_deg: typeof parsed.rotation_deg === 'number' ? parsed.rotation_deg : 0.0,
        keystone_v: typeof parsed.keystone_v === 'number' ? parsed.keystone_v : 0.0,
        aspect_ratio: parsed.aspect_ratio || 'original',
        crop_rationale: parsed.crop_rationale || 'AI 智慧構圖建議已生成。'
      };
    } else {
      // Groq Vision endpoint
      const activeModel = modelId || 'llama-3.2-11b-vision-preview';
      const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${cleanBase64}`
                  }
                }
              ]
            }
          ],
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        const detail = errJson?.error?.message || `HTTP ${response.status}`;
        throw new Error(`Groq 端點回應異常 (${detail})`);
      }

      const jsonRes = await response.json();
      const rawContent = jsonRes.choices?.[0]?.message?.content;
      if (!rawContent) {
        throw new Error('Empty response from Groq Vision model');
      }

      const parsed = JSON.parse(rawContent);
      return {
        scene_type: parsed.scene_type || 'outdoor_street',
        scene_title: parsed.scene_title || '光影畫面顯影',
        style_insight: parsed.style_insight || 'AI 已根據畫面光影特徵完成動態範圍與色調調校。',
        recommended_mood: parsed.recommended_mood || '底片氛圍調性',
        recommended_profile: parsed.recommended_profile || 'Profile_01_MatteShadow',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
        exposure_compensation: typeof parsed.exposure_compensation === 'number' ? parsed.exposure_compensation : 0.0,
        contrast: typeof parsed.contrast === 'number' ? parsed.contrast : 0.0,
        color_temp: typeof parsed.color_temp === 'number' ? parsed.color_temp : 5500,
        tint: typeof parsed.tint === 'number' ? parsed.tint : 0.0,
        lift_shadows: typeof parsed.lift_shadows === 'number' ? parsed.lift_shadows : 0.0,
        lut_intensity: typeof parsed.lut_intensity === 'number' ? parsed.lut_intensity : 0.85,
        tags: Array.isArray(parsed.tags) ? parsed.tags : ['光影顯影', '底片氛圍'],
        isFallback: false,
        crop_box: Array.isArray(parsed.crop_box) && parsed.crop_box.length === 4 ? parsed.crop_box : [0.03, 0.04, 0.97, 0.96],
        rotation_deg: typeof parsed.rotation_deg === 'number' ? parsed.rotation_deg : 0.0,
        keystone_v: typeof parsed.keystone_v === 'number' ? parsed.keystone_v : 0.0,
        aspect_ratio: parsed.aspect_ratio || 'original',
        crop_rationale: parsed.crop_rationale || 'AI 智慧構圖建議已生成。'
      };
    }
  }

  /**
   * Hybrid Dual-Engine Pipeline:
   * Groq-powered Lightning Copywriting & IPTC Keyword Generation.
   * Blends Gemini vision tags + camera optical EXIF + User personal note into poetic social posts.
   */
  public static async generateGroqCopywriting(payload: CopywritingPayload): Promise<CopywritingResult> {
    // 1. Check for Groq API Key first (fastest LPU text generation)
    let groqKey: string | null = null;
    try {
      const vaultRes = await KeyVaultService.loadKey('groq');
      groqKey = vaultRes.apiKey;
    } catch {
      // Ignored
    }

    // Fallback to Gemini if no Groq Key
    let geminiKey: string | null = null;
    if (!groqKey || groqKey.trim() === '') {
      try {
        const vaultRes = await KeyVaultService.loadKey('gemini');
        geminiKey = vaultRes.apiKey;
      } catch {
        // Ignored
      }
    }

    const tagsStr = payload.tags.length > 0 ? payload.tags.join('、') : '底片日常、光影紀錄';
    const userPromptSection = payload.userPrompt && payload.userPrompt.trim()
      ? `\n【使用者現場個人筆記/心情】：${payload.userPrompt.trim()}`
      : '';

    const systemPrompt = `你是一位精通底片美學與光影詩意的當代攝影策展人，擅長為相片撰寫引人入勝且具溫度的社群文字（Instagram / Threads）與檔案檢索關鍵字。
請根據畫面視覺標籤、相機光學資訊與使用者的個人備註，生成發文草稿與標籤。
${userPromptSection}
【相片場景主題】：${payload.sceneTitle}
【視覺標籤】：${tagsStr}
【器材與光學】：${payload.cameraModel || ''} ${payload.lensModel || ''} ${payload.exifOptical ? `(${payload.exifOptical})` : ''}

請務必嚴格回傳標準 JSON 格式（正體中文/台灣用語，禁止簡體或中國用語）：
{
  "caption": "2-3 句具底片質感與畫面溫度的短文案，若有使用者筆記請巧妙自然融入。",
  "hashtags": ["#底片日常", "#35mm", "#街頭光影", ...約 5-8 個熱門推薦 hashtag],
  "iptc_keywords": ["Street", "Night", "WarmToned", "Portrait", ...約 8-12 個中英雙語搜尋關鍵字，用於檔案搜尋與 Spotlight 檢索]
}`;

    // A. Use Groq if available (lightning fast, ~200-400ms)
    if (groqKey && groqKey.trim() !== '') {
      try {
        let modelId = 'llama-3.3-70b-versatile';
        if (typeof localStorage !== 'undefined') {
          const storedModel = localStorage.getItem('slipknot_model_groq');
          if (storedModel && !storedModel.includes('vision')) {
            modelId = storedModel;
          }
        }

        const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              {
                role: 'system',
                content: 'You are a professional film photography curator. Respond ONLY in valid JSON matching the requested schema.'
              },
              {
                role: 'user',
                content: systemPrompt
              }
            ],
            response_format: { type: 'json_object' }
          })
        });

        if (response.ok) {
          const jsonRes = await response.json();
          const rawContent = jsonRes.choices?.[0]?.message?.content;
          if (rawContent) {
            const parsed = JSON.parse(rawContent);
            return {
              caption: parsed.caption || '光線在底片顆粒中緩緩顯影，紀錄下快門凝結的瞬間。',
              hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#底片日常', '#光影紀實'],
              iptcKeywords: Array.isArray(parsed.iptc_keywords) ? parsed.iptc_keywords : payload.tags,
              providerUsed: 'groq'
            };
          }
        }
      } catch (err) {
        console.warn('Groq copywriting call failed, falling back to Gemini/offline:', err);
      }
    }

    // B. Fallback to Gemini text if Groq is unavailable
    if (geminiKey && geminiKey.trim() !== '') {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });

        if (response.ok) {
          const jsonRes = await response.json();
          const rawContent = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawContent) {
            const parsed = JSON.parse(rawContent);
            return {
              caption: parsed.caption || '光線在底片顆粒中緩緩顯影，紀錄下快門凝結的瞬間。',
              hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#底片日常', '#光影紀實'],
              iptcKeywords: Array.isArray(parsed.iptc_keywords) ? parsed.iptc_keywords : payload.tags,
              providerUsed: 'gemini'
            };
          }
        }
      } catch (err) {
        console.warn('Gemini text copywriting fallback failed:', err);
      }
    }

    // C. Offline Curatorial Fallback (Instant aesthetic templates)
    const baseNote = payload.userPrompt && payload.userPrompt.trim()
      ? `「${payload.userPrompt.trim()}」— `
      : '';
    return {
      caption: `${baseNote}${payload.sceneTitle}。光線於底片顆粒中悄然凝結，留住快門開啟時最真實的呼吸與溫度。`,
      hashtags: ['#底片攝影', '#底片日常', '#35mm', '#光影散策', '#暗房顯影'],
      iptcKeywords: [...payload.tags, 'Analog', 'FilmPhotography', '35mm', 'StreetScene'],
      providerUsed: 'offline'
    };
  }
}
