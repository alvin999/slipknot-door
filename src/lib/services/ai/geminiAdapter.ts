/**
 * Google Gemini Provider Adapter
 * Implements IVisionStrategy & ITextStrategy for Google Gemini API
 * Dynamic model IDs, zero hardcoded strings.
 */

import type { IVisionStrategy, ITextStrategy, VisionInferenceOptions, TextInferenceOptions } from './types';
import type { AiSceneDecision, CopywritingResult } from '../aiSceneService';

export class GeminiAdapter implements IVisionStrategy, ITextStrategy {
  public readonly providerId = 'gemini';
  public readonly providerName = 'Google Gemini';

  /**
   * 影像視覺顯影分析
   */
  public async analyzePhoto(options: VisionInferenceOptions): Promise<AiSceneDecision> {
    const { apiKey, modelId, imagePayload512pxBase64, exif } = options;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('未配置 Gemini API 金鑰');
    }

    // 將縮圖清理為純 Base64
    const cleanBase64 = imagePayload512pxBase64.includes(',')
      ? imagePayload512pxBase64.slice(imagePayload512pxBase64.indexOf(',') + 1)
      : imagePayload512pxBase64;

    const cleanModel = (modelId && modelId.trim()) ? modelId.trim().replace(/^models\//, '') : '';
    if (!cleanModel) {
      throw new Error('未指定有效的模型名稱，請至右下角保險庫選擇欲指派之端點模型');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;

    const promptText = `You are a master analog darkroom colorist and curatorial director.
Analyze this photographic image and optical EXIF (ISO: ${exif.iso || 'N/A'}, Shutter: ${exif.shutterSpeed || 'N/A'}, Aperture: ${exif.apertureValue || 'N/A'}, Lens/Focal: ${exif.focalLength || 'N/A'}).
Provide artistic color grading decisions, lighting dynamics, and composition crop recommendations (Rule of Thirds, horizon leveling, perspective correction).
Respond ONLY with raw JSON matching this schema:
{
  "scene_title": "午後斜陽微光街角 (Poetic scene title in Traditional Chinese, 4-8 chars)",
  "scene_type": "outdoor_street",
  "style_insight": "主體處於側逆光環境，建議壓制高光並微提暗部細節。(1-2 sentences professional insight in Traditional Chinese)",
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
      providerUsed: 'gemini',
      modelUsed: cleanModel,
      crop_box: Array.isArray(parsed.crop_box) && parsed.crop_box.length === 4 ? parsed.crop_box : [0.03, 0.04, 0.97, 0.96],
      rotation_deg: typeof parsed.rotation_deg === 'number' ? parsed.rotation_deg : 0.0,
      keystone_v: typeof parsed.keystone_v === 'number' ? parsed.keystone_v : 0.0,
      aspect_ratio: parsed.aspect_ratio || 'original',
      crop_rationale: parsed.crop_rationale || 'AI 智慧構圖建議已生成。'
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
    const parsed = JSON.parse(rawContent);
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
