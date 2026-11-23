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
 * Anthropic Claude Provider Adapter
 * Implements IVisionStrategy & ITextStrategy for Anthropic Messages API
 */

import type {
  IVisionStrategy,
  ITextStrategy,
  VisionInferenceOptions,
  TextInferenceOptions,
  DirectoryPlanOptions,
  DirectoryPlanResult,
  RefinementInferenceOptions,
  RefinementDecision,
  GeometryDecision,
  ColorGradeDecision,
} from './types';
import {
  parseAiJsonString,
  parsePartialHslFromAi,
} from './styleDirectives';
import {
  CONNECTION_PING_PROMPT,
  buildAnalyzePhotoPrompt,
  buildColorGradeInstructionPrompt,
  buildCopywritingPrompt,
  buildCriticInstructionBlock,
  buildDirectoryPlanPrompts,
  buildGeometryInstructionPrompt,
} from './prompts';
import { cloneHslAdjustments } from '../../types/photo';
import type { AiSceneDecision, CopywritingResult } from '../aiSceneService';

export class AnthropicAdapter implements IVisionStrategy, ITextStrategy {
  public readonly providerId = 'anthropic';
  public readonly providerName = 'Anthropic Claude';

  private buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  private async executeVisionRequest(
    apiKey: string,
    modelId: string,
    promptText: string,
    imagePayload1024pxBase64: string,
    signal?: AbortSignal,
    temperature?: number
  ): Promise<{ parsed: any; activeModel: string }> {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('未配置 Anthropic API 金鑰');
    }

    const activeModel = modelId && modelId.trim() ? modelId.trim() : 'claude-3-5-sonnet-latest';
    const cleanBase64 = imagePayload1024pxBase64.includes(',')
      ? imagePayload1024pxBase64.slice(imagePayload1024pxBase64.indexOf(',') + 1)
      : imagePayload1024pxBase64;

    const endpoint = 'https://api.anthropic.com/v1/messages';
    const payloadBody: Record<string, any> = {
      model: activeModel,
      max_tokens: 1536,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: cleanBase64,
              },
            },
            { type: 'text', text: `${promptText}\n\nReturn ONLY a valid JSON object without markdown wrappers.` },
          ],
        },
      ],
    };

    if (typeof temperature === 'number' && Number.isFinite(temperature)) {
      payloadBody.temperature = Math.min(1.0, Math.max(0.0, temperature));
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify(payloadBody),
        signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || signal?.aborted) {
        throw new Error('推論連線已由使用者手動中止');
      }
      throw new Error(`無法連線至 Anthropic 伺服器 (${err?.message || '網路連線異常'})`);
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const detail = errJson?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Anthropic 端點回應異常 (${detail})`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.content?.find((c: any) => c.type === 'text')?.text;
    if (!rawContent) {
      throw new Error('Claude 視覺模型未回傳推論內容');
    }

    return { parsed: parseAiJsonString(rawContent), activeModel };
  }

  public async analyzeGeometry(options: VisionInferenceOptions): Promise<GeometryDecision> {
    const promptText = buildGeometryInstructionPrompt(
      options.exif,
      Boolean(options.scope?.lockCropAspectRatio)
    );
    const { parsed } = await this.executeVisionRequest(
      options.apiKey,
      options.modelId,
      promptText,
      options.imagePayload1024pxBase64,
      options.signal,
      options.temperature
    );

    return {
      crop_box: Array.isArray(parsed.crop_box) && parsed.crop_box.length === 4 ? parsed.crop_box : [0.0, 0.0, 1.0, 1.0],
      rotation_deg: typeof parsed.rotation_deg === 'number' ? parsed.rotation_deg : 0.0,
      keystone_v: typeof parsed.keystone_v === 'number' ? parsed.keystone_v : 0.0,
      aspect_ratio: options.scope?.lockCropAspectRatio ? 'original' : (parsed.aspect_ratio || 'original'),
      crop_rationale: parsed.crop_rationale || '',
    };
  }

  public async analyzeColorGrade(options: VisionInferenceOptions): Promise<ColorGradeDecision> {
    const promptText = buildColorGradeInstructionPrompt(options);
    const { parsed } = await this.executeVisionRequest(
      options.apiKey,
      options.modelId,
      promptText,
      options.imagePayload1024pxBase64,
      options.signal,
      options.temperature
    );

    return {
      scene_type: parsed.scene_type || 'outdoor_street',
      scene_title: parsed.scene_title || '光影畫面顯影',
      style_insight: parsed.style_insight || 'AI 已根據畫面光影特徵完成動態範圍與色調調校。',
      recommended_mood: parsed.recommended_mood || '底片氛圍調性',
      recommended_profile: parsed.recommended_profile || 'Profile_00_StandardNatural',
      exposure_compensation: typeof parsed.exposure_compensation === 'number' ? parsed.exposure_compensation : 0.0,
      highlights: typeof parsed.highlights === 'number' ? parsed.highlights : 0.0,
      contrast: typeof parsed.contrast === 'number' ? parsed.contrast : 0.0,
      color_temp: typeof parsed.color_temp === 'number' ? parsed.color_temp : 5500,
      tint: typeof parsed.tint === 'number' ? parsed.tint : 0.0,
      lift_shadows: typeof parsed.lift_shadows === 'number' ? parsed.lift_shadows : 0.0,
      blacks: typeof parsed.blacks === 'number' ? parsed.blacks : 0.0,
      vibrance: typeof parsed.vibrance === 'number' ? parsed.vibrance : 0.0,
      lut_intensity: typeof parsed.lut_intensity === 'number' ? parsed.lut_intensity : 0.85,
      clarity: typeof parsed.clarity === 'number' ? parsed.clarity : 0.0,
      sharpness: typeof parsed.sharpness === 'number' ? parsed.sharpness : 0.0,
      color_density: typeof parsed.color_density === 'number' ? parsed.color_density : 0.0,
      shadow_hue: typeof parsed.shadow_hue === 'number' ? parsed.shadow_hue : 200,
      shadow_tint_amount: typeof parsed.shadow_tint_amount === 'number' ? parsed.shadow_tint_amount : 0.0,
      highlight_hue: typeof parsed.highlight_hue === 'number' ? parsed.highlight_hue : 40,
      highlight_tint_amount: typeof parsed.highlight_tint_amount === 'number' ? parsed.highlight_tint_amount : 0.0,
      halation: typeof parsed.halation === 'number' ? parsed.halation : 0.0,
      grain_amount: typeof parsed.grain_amount === 'number' ? parsed.grain_amount : 0.15,
      vignette: typeof parsed.vignette === 'number' ? parsed.vignette : 0.0,
      hsl: parsePartialHslFromAi(parsed.hsl, 1.0) ? cloneHslAdjustments(parsePartialHslFromAi(parsed.hsl, 1.0)) : undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags : ['光影顯影', '底片氛圍'],
    };
  }

  public async analyzePhoto(options: VisionInferenceOptions): Promise<AiSceneDecision> {
    const { apiKey, modelId } = options;
    const promptText = buildAnalyzePhotoPrompt(options);

    const { parsed, activeModel } = await this.executeVisionRequest(
      apiKey,
      modelId,
      promptText,
      options.imagePayload1024pxBase64,
      options.signal,
      options.temperature
    );

    return {
      scene_type: parsed.scene_type || 'outdoor_street',
      scene_title: parsed.scene_title || '光影畫面顯影',
      style_insight: parsed.style_insight || 'AI 已根據畫面光影特徵完成動態範圍與色調調校。',
      recommended_mood: parsed.recommended_mood || '底片氛圍調性',
      recommended_profile: parsed.recommended_profile || 'Profile_00_StandardNatural',
      exposure_compensation: typeof parsed.exposure_compensation === 'number' ? parsed.exposure_compensation : 0.0,
      highlights: typeof parsed.highlights === 'number' ? parsed.highlights : 0.0,
      contrast: typeof parsed.contrast === 'number' ? parsed.contrast : 0.0,
      color_temp: typeof parsed.color_temp === 'number' ? parsed.color_temp : 5500,
      tint: typeof parsed.tint === 'number' ? parsed.tint : 0.0,
      lift_shadows: typeof parsed.lift_shadows === 'number' ? parsed.lift_shadows : 0.0,
      blacks: typeof parsed.blacks === 'number' ? parsed.blacks : 0.0,
      vibrance: typeof parsed.vibrance === 'number' ? parsed.vibrance : 0.0,
      lut_intensity: typeof parsed.lut_intensity === 'number' ? parsed.lut_intensity : 0.85,
      clarity: typeof parsed.clarity === 'number' ? parsed.clarity : 0.0,
      sharpness: typeof parsed.sharpness === 'number' ? parsed.sharpness : 0.0,
      color_density: typeof parsed.color_density === 'number' ? parsed.color_density : 0.0,
      shadow_hue: typeof parsed.shadow_hue === 'number' ? parsed.shadow_hue : 200,
      shadow_tint_amount: typeof parsed.shadow_tint_amount === 'number' ? parsed.shadow_tint_amount : 0.0,
      highlight_hue: typeof parsed.highlight_hue === 'number' ? parsed.highlight_hue : 40,
      highlight_tint_amount: typeof parsed.highlight_tint_amount === 'number' ? parsed.highlight_tint_amount : 0.0,
      halation: typeof parsed.halation === 'number' ? parsed.halation : 0.0,
      grain_amount: typeof parsed.grain_amount === 'number' ? parsed.grain_amount : 0.15,
      vignette: typeof parsed.vignette === 'number' ? parsed.vignette : 0.0,
      hsl: parsePartialHslFromAi(parsed.hsl, 1.0) ? cloneHslAdjustments(parsePartialHslFromAi(parsed.hsl, 1.0)) : undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags : ['光影顯影', '底片氛圍'],
      isFallback: false,
      providerUsed: 'anthropic' as any,
      modelUsed: activeModel,
      crop_box: Array.isArray(parsed.crop_box) && parsed.crop_box.length === 4 ? parsed.crop_box : [0.0, 0.0, 1.0, 1.0],
      rotation_deg: typeof parsed.rotation_deg === 'number' ? parsed.rotation_deg : 0.0,
      keystone_v: typeof parsed.keystone_v === 'number' ? parsed.keystone_v : 0.0,
      aspect_ratio: parsed.aspect_ratio || 'original',
      crop_rationale: parsed.crop_rationale || '',
    };
  }

  public async refinePhoto(options: RefinementInferenceOptions): Promise<RefinementDecision> {
    const { apiKey, modelId, originalImageBase64, renderedImageBase64, firstPassDecision } = options;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('未配置 Anthropic API 金鑰');
    }

    const activeModel = modelId && modelId.trim() ? modelId.trim() : 'claude-3-5-sonnet-latest';
    const cleanOrig = originalImageBase64.includes(',')
      ? originalImageBase64.slice(originalImageBase64.indexOf(',') + 1)
      : originalImageBase64;
    const cleanRendered = renderedImageBase64.includes(',')
      ? renderedImageBase64.slice(renderedImageBase64.indexOf(',') + 1)
      : renderedImageBase64;

    const endpoint = 'https://api.anthropic.com/v1/messages';
    const criticPrompt = buildCriticInstructionBlock(
      firstPassDecision,
      options.stylePreset,
      options.styleKeywords,
      options.customStylePrompt,
      options.monochrome,
      options.scope,
      options.iterativeContext
    );

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({
        model: activeModel,
        max_tokens: 768,
        temperature:
          typeof options.temperature === 'number' && Number.isFinite(options.temperature)
            ? Math.min(1.0, Math.max(0.0, options.temperature))
            : 0.2,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: cleanOrig },
              },
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: cleanRendered },
              },
              { type: 'text', text: `${criticPrompt}\n\nReturn ONLY a valid JSON object.` },
            ],
          },
        ],
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const detail = errJson?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Anthropic 覆審端點回應異常 (${detail})`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.content?.find((c: any) => c.type === 'text')?.text;
    if (!rawContent) {
      throw new Error('Claude 覆審未回傳內容');
    }

    const parsed = parseAiJsonString(rawContent);
    return {
      exposure_delta: typeof parsed.exposure_delta === 'number' ? parsed.exposure_delta : 0.0,
      highlights_delta: typeof parsed.highlights_delta === 'number' ? parsed.highlights_delta : undefined,
      lift_shadows_delta: typeof parsed.lift_shadows_delta === 'number' ? parsed.lift_shadows_delta : 0.0,
      blacks_delta: typeof parsed.blacks_delta === 'number' ? parsed.blacks_delta : undefined,
      color_temp_delta: typeof parsed.color_temp_delta === 'number' ? Math.round(parsed.color_temp_delta) : 0,
      tint_delta: typeof parsed.tint_delta === 'number' ? parsed.tint_delta : undefined,
      contrast_delta: typeof parsed.contrast_delta === 'number' ? parsed.contrast_delta : 0.0,
      lut_intensity_delta: typeof parsed.lut_intensity_delta === 'number' ? parsed.lut_intensity_delta : undefined,
      clarity_delta: typeof parsed.clarity_delta === 'number' ? parsed.clarity_delta : undefined,
      sharpness_delta: typeof parsed.sharpness_delta === 'number' ? parsed.sharpness_delta : undefined,
      vibrance_delta: typeof parsed.vibrance_delta === 'number' ? parsed.vibrance_delta : undefined,
      color_density_delta: typeof parsed.color_density_delta === 'number' ? parsed.color_density_delta : undefined,
      shadow_tint_amount_delta: typeof parsed.shadow_tint_amount_delta === 'number' ? parsed.shadow_tint_amount_delta : undefined,
      highlight_tint_amount_delta: typeof parsed.highlight_tint_amount_delta === 'number' ? parsed.highlight_tint_amount_delta : undefined,
      halation_delta: typeof parsed.halation_delta === 'number' ? parsed.halation_delta : undefined,
      grain_amount_delta: typeof parsed.grain_amount_delta === 'number' ? parsed.grain_amount_delta : undefined,
      vignette_delta: typeof parsed.vignette_delta === 'number' ? parsed.vignette_delta : undefined,
      hsl_deltas: parsePartialHslFromAi(parsed.hsl_deltas, 0.5),
      refine_rationale: parsed.refine_rationale || '雙圖比對覆審完成，曝光與動態範圍已微調優化。',
    };
  }

  public async generateCopywriting(options: TextInferenceOptions): Promise<CopywritingResult> {
    const { apiKey, modelId, payload } = options;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('未配置 Anthropic API 金鑰');
    }
    const activeModel = modelId && modelId.trim() ? modelId.trim() : 'claude-3-5-haiku-latest';
    const endpoint = 'https://api.anthropic.com/v1/messages';

    const systemPrompt = buildCopywritingPrompt(payload);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({
        model: activeModel,
        max_tokens: 768,
        messages: [{ role: 'user', content: systemPrompt }],
        ...(typeof options.temperature === 'number' && Number.isFinite(options.temperature)
          ? { temperature: Math.min(1.0, Math.max(0.0, options.temperature)) }
          : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic 文案生成失敗: HTTP ${response.status}`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.content?.find((c: any) => c.type === 'text')?.text;
    const parsed = parseAiJsonString(rawContent);
    return {
      caption: parsed.caption || '靜謐的光影，在時間的流隙中凝結成永恆的底片記憶。',
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#35mm', '#FilmPhotography'],
      iptcKeywords: Array.isArray(parsed.iptc_keywords) ? parsed.iptc_keywords : ['Analog', 'Photography'],
      providerUsed: 'anthropic' as any,
    };
  }

  public async planDirectory(options: DirectoryPlanOptions): Promise<DirectoryPlanResult> {
    const { apiKey, modelId, payload } = options;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('未配置 Anthropic API 金鑰');
    }
    const activeModel = modelId && modelId.trim() ? modelId.trim() : 'claude-3-5-haiku-latest';
    const endpoint = 'https://api.anthropic.com/v1/messages';
    const { systemPrompt, userContent, sessionDate } = buildDirectoryPlanPrompts(payload);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.buildHeaders(apiKey),
      body: JSON.stringify({
        model: activeModel,
        max_tokens: 1536,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`Anthropic 目錄規劃失敗: HTTP ${response.status}`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.content?.find((c: any) => c.type === 'text')?.text;
    const parsed = parseAiJsonString(rawContent);

    return {
      projectRootName: parsed.projectRootName || `${sessionDate}_底片導出集`,
      rationale: parsed.rationale || '已依據光影場景與風格屬性完成智慧目錄規劃。',
      folders: Array.isArray(parsed.folders) && parsed.folders.length > 0 ? parsed.folders : [
        {
          subPath: '01_Final_JPG',
          description: '所有成片',
          photoIds: payload.photos.map(p => p.id),
          renamePattern: '{original}_graded'
        }
      ],
      rawBackupSubPath: parsed.rawBackupSubPath || '00_RAW_Originals',
      providerUsed: 'anthropic',
    };
  }

  public async testConnection(apiKey: string, modelId: string): Promise<{ success: boolean; latencySec: number; error?: string }> {
    const activeModel = modelId && modelId.trim() ? modelId.trim() : 'claude-3-5-haiku-latest';
    const endpoint = 'https://api.anthropic.com/v1/messages';
    const t0 = Date.now();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify({
          model: activeModel,
          max_tokens: 10,
          messages: [{ role: 'user', content: CONNECTION_PING_PROMPT }],
        }),
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

