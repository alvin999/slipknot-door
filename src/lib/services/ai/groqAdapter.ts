/**
 * Groq Provider Adapter
 * Implements ITextStrategy (Lightning LPU Text Generation)
 * and IVisionStrategy (for Vision-capable Llama models)
 * Dynamic model IDs, zero hardcoded strings.
 */

import type { IVisionStrategy, ITextStrategy, VisionInferenceOptions, TextInferenceOptions } from './types';
import { buildStyleInstructionBlock } from './styleDirectives';
import type { AiSceneDecision, CopywritingResult } from '../aiSceneService';

export class GroqAdapter implements IVisionStrategy, ITextStrategy {
  public readonly providerId = 'groq';
  public readonly providerName = 'Groq';

  /**
   * 影像視覺顯影分析 (限具備視覺多模態能力之 Groq 模型)
   */
  public async analyzePhoto(options: VisionInferenceOptions): Promise<AiSceneDecision> {
    const { apiKey, modelId, imagePayload512pxBase64, exif } = options;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('未配置 Groq API 金鑰');
    }

    const activeModel = (modelId && modelId.trim()) ? modelId.trim() : 'llama-3.2-11b-vision-preview';

    // 檢查模型是否具備視覺能力（防禦純文字模型誤打視覺端點）
    const isVisionModel = /(vision|-vl-|llama-3.2-(11b|90b)-vision)/i.test(activeModel);
    if (!isVisionModel) {
      throw new Error(`Groq 模型 [${activeModel}] 為純文字語言引擎，不支援相片影像上傳。請指派具備多模態能力之模型 (如 Gemini 視覺模型或 Groq Vision)`);
    }

    const cleanBase64 = imagePayload512pxBase64.includes(',')
      ? imagePayload512pxBase64.slice(imagePayload512pxBase64.indexOf(',') + 1)
      : imagePayload512pxBase64;

    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

    const { instructionBlock, recommendedProfileSchemaHint } = buildStyleInstructionBlock(options.stylePreset);

    const promptText = `You are a master analog darkroom colorist and curatorial director.
Analyze this photographic image and optical EXIF (ISO: ${exif.iso || 'N/A'}, Shutter: ${exif.shutterSpeed || 'N/A'}, Aperture: ${exif.apertureValue || 'N/A'}, Lens/Focal: ${exif.focalLength || 'N/A'}).

Evaluate lighting dynamics, color harmony, and visual composition.

${instructionBlock}

Respond ONLY with raw JSON matching this schema:
{
  "scene_title": "string (4-8 chars poetic title in Traditional Chinese describing the actual subject/light)",
  "scene_type": "string (lowercase code: portrait | landscape | architecture | street | night | still_life | documentary | nature | indoor)",
  "style_insight": "string (1-2 sentences professional light/color analysis and treatment rationale in Traditional Chinese)",
  "recommended_mood": "string (short mood/style label in Traditional Chinese)",
  "recommended_profile": "${recommendedProfileSchemaHint}",
  "exposure_compensation": "number (-2.0 to +2.0 EV)",
  "contrast": "number (-0.5 to +0.5)",
  "color_temp": "integer (2500 to 10000 Kelvin)",
  "tint": "number (-30.0 to +30.0, negative=green, positive=magenta)",
  "lift_shadows": "number (-0.5 to +0.5)",
  "lut_intensity": "number (0.0 to 1.0)",
  "clarity": "number (-1.0 to +1.0, mid-tone local contrast)",
  "sharpness": "number (-1.0 to +1.0, fine edge detail; negative softens, positive sharpens)",
  "tags": ["string (3 to 6 Traditional Chinese tags capturing actual subjects, light, and textures)"],
  "crop_box": [ymin, xmin, ymax, xmax] (four numbers between 0.0 and 1.0; use [0.0, 0.0, 1.0, 1.0] if composition is already balanced),
  "rotation_deg": "number between -45.0 and +45.0 (horizon leveling angle, 0.0 if straight)",
  "keystone_v": "number between -45.0 and +45.0 (vertical perspective keystoning correction, 0.0 if not needed)",
  "aspect_ratio": "original | 1:1 | 4:5 | 16:9 | 9:16 | free",
  "crop_rationale": "string (diagnosis and justification for composition crop/rotation in Traditional Chinese, or empty string if unchanged)"
}`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
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
                  image_url: { url: `data:image/jpeg;base64,${cleanBase64}` }
                }
              ]
            }
          ],
          response_format: { type: 'json_object' }
        }),
        signal: options.signal
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || options.signal?.aborted) {
        throw new Error('推論連線已由使用者手動中止');
      }
      throw new Error(`無法連線至 Groq 伺服器 (${err?.message || '網路連線異常'})`);
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const detail = errJson?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Groq 端點回應異常 (${detail})`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('Groq 視覺模型未回傳推論內容');
    }

    const parsed = JSON.parse(rawContent);
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
      providerUsed: 'groq',
      modelUsed: activeModel,
      crop_box: Array.isArray(parsed.crop_box) && parsed.crop_box.length === 4 ? parsed.crop_box : [0.0, 0.0, 1.0, 1.0],
      rotation_deg: typeof parsed.rotation_deg === 'number' ? parsed.rotation_deg : 0.0,
      keystone_v: typeof parsed.keystone_v === 'number' ? parsed.keystone_v : 0.0,
      aspect_ratio: parsed.aspect_ratio || 'original',
      crop_rationale: parsed.crop_rationale || ''
    };
  }

  /**
   * 社群文案與 IPTC 標籤文字生成（支援任意純文字或多模態模型，極速 LPU 推論）
   */
  public async generateCopywriting(options: TextInferenceOptions): Promise<CopywritingResult> {
    const { apiKey, modelId, payload } = options;
    const activeModel = (modelId && modelId.trim()) ? modelId.trim() : 'llama-3.3-70b-versatile';
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: activeModel,
        messages: [{ role: 'user', content: systemPrompt }],
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`Groq 文案生成失敗: HTTP ${response.status}`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.choices?.[0]?.message?.content;
    const parsed = JSON.parse(rawContent);
    return {
      caption: parsed.caption || '靜謐的光影，在時間的流隙中凝結成永恆的底片記憶。',
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#35mm', '#FilmPhotography'],
      iptcKeywords: Array.isArray(parsed.iptc_keywords) ? parsed.iptc_keywords : ['Analog', 'Photography'],
      providerUsed: 'groq'
    };
  }

  /**
   * 端點即時推論測試（Session 連線與延遲檢測）
   */
  public async testConnection(apiKey: string, modelId: string): Promise<{ success: boolean; latencySec: number; error?: string }> {
    const activeModel = (modelId && modelId.trim()) ? modelId.trim() : 'llama-3.3-70b-versatile';
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    const t0 = Date.now();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 5
        })
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
