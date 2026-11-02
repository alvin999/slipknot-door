/**
 * ═══════════════════════════════════════════════════════════════════
 * 【AI Prompt 中性化與客觀數據規範準則 (Prompt Neutrality Guidelines)】
 * 1. 保持客觀中立：不使用情緒化形容詞（如 punch, dreamy, extreme, harsh, poetic）。
 * 2. 避免固定數值區間：不提供預設數字範例或固定範圍，由模型依據畫面光學動態自主推算。
 * 3. 純物理控制通道：僅提供數據型別、物理邊界、方向定義與 EXIF 參數。
 * 4. 責任分離：Schema 作為標準型別規格，由前置風格意向引導調色，回歸模型預訓練常識。
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * Google Gemini Provider Adapter
 * Implements IVisionStrategy & ITextStrategy for Google Gemini API
 * Dynamic model IDs, zero hardcoded strings.
 */

import type { IVisionStrategy, ITextStrategy, VisionInferenceOptions, TextInferenceOptions, RefinementInferenceOptions, RefinementDecision } from './types';
import { buildStyleInstructionBlock, buildCriticInstructionBlock, parseAiJsonString } from './styleDirectives';
import type { AiSceneDecision, CopywritingResult } from '../aiSceneService';

export class GeminiAdapter implements IVisionStrategy, ITextStrategy {
  public readonly providerId = 'gemini';
  public readonly providerName = 'Google Gemini';

  /**
   * 影像視覺顯影分析
   */
  public async analyzePhoto(options: VisionInferenceOptions): Promise<AiSceneDecision> {
    const { apiKey, modelId, imagePayload1024pxBase64, exif } = options;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('未配置 Gemini API 金鑰');
    }

    // 將縮圖清理為純 Base64
    const cleanBase64 = imagePayload1024pxBase64.includes(',')
      ? imagePayload1024pxBase64.slice(imagePayload1024pxBase64.indexOf(',') + 1)
      : imagePayload1024pxBase64;

    const cleanModel = (modelId && modelId.trim()) ? modelId.trim().replace(/^models\//, '') : '';
    if (!cleanModel) {
      throw new Error('未指定有效的模型名稱，請至右下角保險庫選擇欲指派之端點模型');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;

    const { instructionBlock, recommendedProfileSchemaHint } = buildStyleInstructionBlock(
      options.stylePreset,
      options.styleKeywords,
      options.customStylePrompt
    );

    const promptText = `You are a master analog darkroom colorist and curatorial director.
Analyze this photographic image and optical EXIF (ISO: ${exif.iso || 'N/A'}, Shutter: ${exif.shutterSpeed || 'N/A'}, Aperture: ${exif.apertureValue || 'N/A'}, Lens/Focal: ${exif.focalLength || 'N/A'}).

Note: The image is a 1024px preview proxy downscaled from a high-resolution capture; native optical sharpness is optimal at baseline 0.0. Do not add clarity or sharpness to compensate for proxy resolution; evaluate strictly for artistic character.

Evaluate lighting dynamics, color harmony, optical texture, and visual composition.

${instructionBlock}

Respond ONLY with raw JSON matching this schema:
{
  "scene_title": "string (4-8 chars in Traditional Chinese)",
  "scene_type": "string (portrait | landscape | architecture | street | night | still_life | documentary | nature | indoor)",
  "style_insight": "string (1-2 sentences in Traditional Chinese)",
  "recommended_mood": "string (short mood label in Traditional Chinese)",
  "recommended_profile": "${recommendedProfileSchemaHint}",
  "exposure_compensation": "number between -2.0 and +2.0",
  "contrast": "number between -0.5 and +0.5",
  "color_temp": "integer between 2500 and 10000",
  "tint": "number between -30.0 and +30.0",
  "lift_shadows": "number between -0.5 and +0.5",
  "lut_intensity": "number between 0.0 and 1.0",
  "clarity": "number between -1.0 and +1.0",
  "sharpness": "number between -1.0 and +1.0",
  "tags": ["string (3 to 6 tags in Traditional Chinese)"],
  "crop_box": [ymin, xmin, ymax, xmax] (normalized bounding box [ymin, xmin, ymax, xmax] within 0.0 to 1.0; [0.0, 0.0, 1.0, 1.0] denotes uncropped full frame),
  "rotation_deg": "number between -45.0 and +45.0",
  "keystone_v": "number between -45.0 and +45.0",
  "aspect_ratio": "original | 1:1 | 4:5 | 16:9 | 9:16 | free",
  "crop_rationale": "string (explanation in Traditional Chinese, or empty string if unchanged)"
}`;

    const requestBody = JSON.stringify({
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: cleanBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: options.signal
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || options.signal?.aborted) {
        throw new Error('推論連線已由使用者手動中止');
      }
      throw new Error(`無法連線至 Gemini 伺服器 (${err?.message || '網路連線異常'})`);
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const detail = errJson?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Gemini 端點回應異常 (${detail})`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      throw new Error('Gemini 多模態模型未回傳推論內容');
    }

    const parsed = parseAiJsonString(rawContent);
    return {
      scene_type: parsed.scene_type || 'outdoor_street',
      scene_title: parsed.scene_title || '光影畫面顯影',
      style_insight: parsed.style_insight || 'AI 已根據畫面光影特徵完成動態範圍與色調調校。',
      recommended_mood: parsed.recommended_mood || '底片氛圍調性',
      recommended_profile: parsed.recommended_profile || 'Profile_00_StandardNatural',
      exposure_compensation: typeof parsed.exposure_compensation === 'number' ? parsed.exposure_compensation : 0.0,
      contrast: typeof parsed.contrast === 'number' ? parsed.contrast : 0.0,
      color_temp: typeof parsed.color_temp === 'number' ? parsed.color_temp : 5500,
      tint: typeof parsed.tint === 'number' ? parsed.tint : 0.0,
      lift_shadows: typeof parsed.lift_shadows === 'number' ? parsed.lift_shadows : 0.0,
      lut_intensity: typeof parsed.lut_intensity === 'number' ? parsed.lut_intensity : 0.85,
      clarity: typeof parsed.clarity === 'number' ? parsed.clarity : 0.0,
      sharpness: typeof parsed.sharpness === 'number' ? parsed.sharpness : 0.0,
      tags: Array.isArray(parsed.tags) ? parsed.tags : ['光影顯影', '底片氛圍'],
      isFallback: false,
      providerUsed: 'gemini',
      modelUsed: cleanModel,
      crop_box: Array.isArray(parsed.crop_box) && parsed.crop_box.length === 4 ? parsed.crop_box : [0.0, 0.0, 1.0, 1.0],
      rotation_deg: typeof parsed.rotation_deg === 'number' ? parsed.rotation_deg : 0.0,
      keystone_v: typeof parsed.keystone_v === 'number' ? parsed.keystone_v : 0.0,
      aspect_ratio: parsed.aspect_ratio || 'original',
      crop_rationale: parsed.crop_rationale || ''
    };
  }

  /**
   * 雙圖閉環覆審分析 (Pass 2 Critic Refinement)
   * 傳入原圖與 Pass 1 成果圖，進行品控微調
   */
  public async refinePhoto(options: RefinementInferenceOptions): Promise<RefinementDecision> {
    const { apiKey, modelId, originalImageBase64, renderedImageBase64, firstPassDecision } = options;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('未配置 Gemini API 金鑰');
    }

    const cleanOrig = originalImageBase64.includes(',')
      ? originalImageBase64.slice(originalImageBase64.indexOf(',') + 1)
      : originalImageBase64;

    const cleanRendered = renderedImageBase64.includes(',')
      ? renderedImageBase64.slice(renderedImageBase64.indexOf(',') + 1)
      : renderedImageBase64;

    const cleanModel = (modelId && modelId.trim()) ? modelId.trim().replace(/^models\//, '') : '';
    if (!cleanModel) {
      throw new Error('未指定有效的模型名稱');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;
    const criticPrompt = buildCriticInstructionBlock(
      firstPassDecision,
      options.stylePreset,
      options.styleKeywords,
      options.customStylePrompt
    );

    const requestBody = JSON.stringify({
      contents: [
        {
          parts: [
            { text: criticPrompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: cleanOrig
              }
            },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: cleanRendered
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 512,
        temperature: 0.2
      }
    });

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: options.signal
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || options.signal?.aborted) {
        throw new Error('覆審連線已由使用者手動中止');
      }
      throw new Error(`無法連線至 Gemini 覆審伺服器 (${err?.message || '網路連線異常'})`);
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const detail = errJson?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Gemini 覆審端點回應異常 (${detail})`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      throw new Error('Gemini 覆審未回傳內容');
    }

    const parsed = parseAiJsonString(rawContent);
    return {
      exposure_delta: typeof parsed.exposure_delta === 'number' ? parsed.exposure_delta : 0.0,
      lift_shadows_delta: typeof parsed.lift_shadows_delta === 'number' ? parsed.lift_shadows_delta : 0.0,
      color_temp_delta: typeof parsed.color_temp_delta === 'number' ? Math.round(parsed.color_temp_delta) : 0,
      contrast_delta: typeof parsed.contrast_delta === 'number' ? parsed.contrast_delta : 0.0,
      lut_intensity_delta: typeof parsed.lut_intensity_delta === 'number' ? parsed.lut_intensity_delta : undefined,
      clarity_delta: typeof parsed.clarity_delta === 'number' ? parsed.clarity_delta : undefined,
      sharpness_delta: typeof parsed.sharpness_delta === 'number' ? parsed.sharpness_delta : undefined,
      refine_rationale: parsed.refine_rationale || '雙圖比對覆審完成，曝光與動態範圍已微調優化。'
    };
  }

  /**
   * 社群文案與 IPTC 標籤文字生成
   */
  public async generateCopywriting(options: TextInferenceOptions): Promise<CopywritingResult> {
    const { apiKey, modelId, payload } = options;
    const cleanModel = (modelId && modelId.trim()) ? modelId.trim().replace(/^models\//, '') : '';
    if (!cleanModel) {
      throw new Error('未指定有效的模型名稱');
    }
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;

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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini 文字生成失敗: HTTP ${response.status}`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = parseAiJsonString(rawContent);
    return {
      caption: parsed.caption || '靜謐的光影，在時間的流隙中凝結成永恆的底片記憶。',
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#35mm', '#FilmPhotography'],
      iptcKeywords: Array.isArray(parsed.iptc_keywords) ? parsed.iptc_keywords : ['Analog', 'Photography'],
      providerUsed: 'gemini'
    };
  }

  /**
   * 端點即時推論測試（Session 連線與延遲檢測）
   */
  public async testConnection(apiKey: string, modelId: string): Promise<{ success: boolean; latencySec: number; error?: string }> {
    const cleanModel = (modelId && modelId.trim()) ? modelId.trim().replace(/^models\//, '') : '';
    if (!cleanModel) {
      return { success: false, latencySec: 0, error: '未指定要測試之模型名稱' };
    }
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;
    const t0 = Date.now();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping test. Reply with OK.' }] }] })
      });
      const latencySec = parseFloat(((Date.now() - t0) / 1000).toFixed(2));
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const detail = errJson?.error?.message || `HTTP ${res.status}`;
        return { success: false, latencySec, error: detail };
      }
      return { success: true, latencySec };
    } catch (err: any) {
      const latencySec = parseFloat(((Date.now() - t0) / 1000).toFixed(2));
      return { success: false, latencySec, error: err?.message || '連線逾時或網路異常' };
    }
  }
}
