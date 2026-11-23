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
 * Groq Provider Adapter
 * Implements ITextStrategy (Lightning LPU Text Generation)
 * and IVisionStrategy (for Vision-capable Llama models)
 * Dynamic model IDs, zero hardcoded strings.
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

export class GroqAdapter implements IVisionStrategy, ITextStrategy {
  public readonly providerId = 'groq';
  public readonly providerName = 'Groq';

  /**
   * 輔助函式：發送 Groq Vision JSON 請求
   */
  private async executeGroqVisionRequest(
    apiKey: string,
    modelId: string,
    promptText: string,
    imagePayload1024pxBase64: string,
    signal?: AbortSignal,
    temperature?: number
  ): Promise<{ parsed: any; activeModel: string }> {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('未配置 Groq API 金鑰');
    }

    const activeModel = (modelId && modelId.trim()) ? modelId.trim() : 'meta-llama/llama-4-scout-17b-16e-instruct';
    const isVisionModel = /(vision|-vl-|llama-3\.2-(11b|90b)-vision|llama-4|scout|maverick|pixtral)/i.test(activeModel);
    if (!isVisionModel) {
      throw new Error(`Groq 模型 [${activeModel}] 為純文字語言引擎，不支援相片影像上傳。請指派具備多模態能力之模型`);
    }

    const cleanBase64 = imagePayload1024pxBase64.includes(',')
      ? imagePayload1024pxBase64.slice(imagePayload1024pxBase64.indexOf(',') + 1)
      : imagePayload1024pxBase64;

    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

    const payloadBody: Record<string, any> = {
      model: activeModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${cleanBase64}` },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    };
    if (typeof temperature === 'number' && Number.isFinite(temperature)) {
      payloadBody.temperature = temperature;
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payloadBody),
        signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || signal?.aborted) {
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

    return { parsed: parseAiJsonString(rawContent), activeModel };
  }

  /**
   * Stage 1: 空間幾何與構圖分析 (Geometry Analysis)
   */
  public async analyzeGeometry(options: VisionInferenceOptions): Promise<GeometryDecision> {
    const promptText = buildGeometryInstructionPrompt(
      options.exif,
      Boolean(options.scope?.lockCropAspectRatio)
    );
    const { parsed } = await this.executeGroqVisionRequest(
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

  /**
   * Stage 2: 物理光學校正與風格階調分級 (Color Grade & Tonal Analysis)
   */
  public async analyzeColorGrade(options: VisionInferenceOptions): Promise<ColorGradeDecision> {
    const promptText = buildColorGradeInstructionPrompt(options);
    const { parsed } = await this.executeGroqVisionRequest(
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

  /**
   * 影像視覺顯影分析 (全量單次向後相容模式)
   */
  public async analyzePhoto(options: VisionInferenceOptions): Promise<AiSceneDecision> {
    const { apiKey, modelId } = options;
    const promptText = buildAnalyzePhotoPrompt(options);

    const { parsed, activeModel } = await this.executeGroqVisionRequest(
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
      providerUsed: 'groq',
      modelUsed: activeModel,
      crop_box: Array.isArray(parsed.crop_box) && parsed.crop_box.length === 4 ? parsed.crop_box : [0.0, 0.0, 1.0, 1.0],
      rotation_deg: typeof parsed.rotation_deg === 'number' ? parsed.rotation_deg : 0.0,
      keystone_v: typeof parsed.keystone_v === 'number' ? parsed.keystone_v : 0.0,
      aspect_ratio: parsed.aspect_ratio || 'original',
      crop_rationale: parsed.crop_rationale || '',
    };
  }

  /**
   * 雙圖閉環覆審分析 (Pass 2 Critic Refinement)
   * 傳入原圖與 Pass 1 成果圖，進行品控微調
   */
  public async refinePhoto(options: RefinementInferenceOptions): Promise<RefinementDecision> {
    const { apiKey, modelId, originalImageBase64, renderedImageBase64, firstPassDecision } = options;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('未配置 Groq API 金鑰');
    }

    const activeModel = (modelId && modelId.trim()) ? modelId.trim() : 'meta-llama/llama-4-scout-17b-16e-instruct';
    const isVisionModel = /(vision|-vl-|llama-3\.2-(11b|90b)-vision|llama-4|scout|maverick|pixtral)/i.test(activeModel);
    if (!isVisionModel) {
      throw new Error(`Groq 模型 [${activeModel}] 為純文字引擎，不支援雙圖視覺覆審`);
    }

    const cleanOrig = originalImageBase64.includes(',')
      ? originalImageBase64.slice(originalImageBase64.indexOf(',') + 1)
      : originalImageBase64;

    const cleanRendered = renderedImageBase64.includes(',')
      ? renderedImageBase64.slice(renderedImageBase64.indexOf(',') + 1)
      : renderedImageBase64;

    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    const criticPrompt = buildCriticInstructionBlock(
      firstPassDecision,
      options.stylePreset,
      options.styleKeywords,
      options.customStylePrompt,
      options.monochrome,
      options.scope,
      options.iterativeContext
    );

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: criticPrompt },
                {
                  type: 'image_url',
                  image_url: { url: `data:image/jpeg;base64,${cleanOrig}` },
                },
                {
                  type: 'image_url',
                  image_url: { url: `data:image/jpeg;base64,${cleanRendered}` },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 512,
          temperature:
            typeof options.temperature === 'number' && Number.isFinite(options.temperature)
              ? options.temperature
              : 0.2,
        }),
        signal: options.signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || options.signal?.aborted) {
        throw new Error('覆審連線已由使用者手動中止');
      }
      throw new Error(`無法連線至 Groq 覆審伺服器 (${err?.message || '網路連線異常'})`);
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const detail = errJson?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Groq 覆審端點回應異常 (${detail})`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('Groq 覆審未回傳內容');
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

  /**
   * 社群文案與 IPTC 標籤文字生成（支援任意純文字或多模態模型，極速 LPU 推論）
   */
  public async generateCopywriting(options: TextInferenceOptions): Promise<CopywritingResult> {
    const { apiKey, modelId, payload } = options;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('未配置 Groq API 金鑰');
    }
    const activeModel = (modelId && modelId.trim()) ? modelId.trim() : 'llama-3.3-70b-versatile';
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

    const systemPrompt = buildCopywritingPrompt(payload);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: activeModel,
        messages: [{ role: 'user', content: systemPrompt }],
        response_format: { type: 'json_object' },
        ...(typeof options.temperature === 'number' && Number.isFinite(options.temperature)
          ? { temperature: options.temperature }
          : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq 文案生成失敗: HTTP ${response.status}`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.choices?.[0]?.message?.content;
    const parsed = parseAiJsonString(rawContent);
    return {
      caption: parsed.caption || '靜謐的光影，在時間的流隙中凝結成永恆的底片記憶。',
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#35mm', '#FilmPhotography'],
      iptcKeywords: Array.isArray(parsed.iptc_keywords) ? parsed.iptc_keywords : ['Analog', 'Photography'],
      providerUsed: 'groq',
    };
  }

  /**
   * Groq 智慧目錄規劃 (Smart Directory Planning)
   * 根據照片批次元數據（EXIF、場景標籤、LUT 風格、拍攝時間）與使用者指定策略，秒速回傳結構化子目錄規劃藍圖
   */
  public async planDirectory(options: DirectoryPlanOptions): Promise<DirectoryPlanResult> {
    const { apiKey, modelId, payload } = options;
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('未配置 Groq API 金鑰');
    }
    const activeModel = (modelId && modelId.trim()) ? modelId.trim() : 'llama-3.3-70b-versatile';
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

    const { systemPrompt, userContent, sessionDate } = buildDirectoryPlanPrompts(payload);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: activeModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`Groq 目錄規劃失敗: HTTP ${response.status}`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.choices?.[0]?.message?.content;
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
      providerUsed: 'groq',
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
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: activeModel,
          messages: [{ role: 'user', content: CONNECTION_PING_PROMPT }],
          max_tokens: 5,
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
