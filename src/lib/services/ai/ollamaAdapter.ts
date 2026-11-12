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
 * Ollama Local / LAN Inference Adapter
 * Implements IVisionStrategy & ITextStrategy for local Ollama models (e.g. qwen2.5vl, gemma3, llama3.2-vision, llava)
 * Zero API Key required. Uses `apiKey` field as configurable Endpoint Base URL (defaults to http://localhost:11434).
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
  buildStyleInstructionBlock,
  buildCriticInstructionBlock,
  buildGeometryInstructionPrompt,
  buildColorGradeInstructionPrompt,
  parseAiJsonString,
  parsePartialHslFromAi,
} from './styleDirectives';
import { cloneHslAdjustments } from '../../types/photo';
import { KeyVaultService } from '../keyVaultService';
import type { AiSceneDecision, CopywritingResult } from '../aiSceneService';

export class OllamaAdapter implements IVisionStrategy, ITextStrategy {
  public readonly providerId = 'ollama';
  public readonly providerName = 'Ollama (本地端)';

  private resolveBaseUrl(urlOrKey?: string): string {
    if (urlOrKey && /^https?:\/\//i.test(urlOrKey.trim())) {
      return urlOrKey.trim().replace(/\/+$/, '');
    }
    return KeyVaultService.getOllamaEndpoint();
  }

  private async executeVisionRequest(
    baseUrlOrKey: string,
    modelId: string,
    promptText: string,
    imagePayload1024pxBase64: string,
    signal?: AbortSignal,
    temperature?: number
  ): Promise<{ parsed: any; activeModel: string }> {
    const baseUrl = this.resolveBaseUrl(baseUrlOrKey);
    const activeModel = modelId && modelId.trim() ? modelId.trim() : 'qwen2.5vl:latest';

    const cleanBase64 = imagePayload1024pxBase64.includes(',')
      ? imagePayload1024pxBase64.slice(imagePayload1024pxBase64.indexOf(',') + 1)
      : imagePayload1024pxBase64;

    const endpoint = `${baseUrl}/api/chat`;
    const optionsObj: Record<string, any> = {};
    if (typeof temperature === 'number' && Number.isFinite(temperature)) {
      optionsObj.temperature = temperature;
    }

    const payloadBody = {
      model: activeModel,
      stream: false,
      format: 'json',
      options: optionsObj,
      messages: [
        {
          role: 'user',
          content: promptText,
          images: [cleanBase64],
        },
      ],
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody),
        signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || signal?.aborted) {
        throw new Error('推論連線已由使用者手動中止');
      }
      throw new Error(
        `無法連線至本地 Ollama (${baseUrl})。請確認 Ollama 已啟動，並已設定環境變數 OLLAMA_ORIGINS="*" 允許瀏覽器跨域存取。`
      );
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const detail = errJson?.error || `HTTP ${response.status}`;
      throw new Error(`Ollama 端點回應異常 [${activeModel}]: ${detail}`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.message?.content;
    if (!rawContent) {
      throw new Error(`Ollama 模型 [${activeModel}] 未回傳推論內容`);
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
      style_insight: parsed.style_insight || '本地 AI 已根據畫面光影特徵完成動態範圍與色調調校。',
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
    const { exif, apiKey, modelId } = options;
    const { instructionBlock, recommendedProfileSchemaHint } = buildStyleInstructionBlock(
      options.stylePreset,
      options.styleKeywords,
      options.customStylePrompt,
      options.customLuts,
      options.monochrome
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
  "highlights": "number between -1.0 and +1.0",
  "contrast": "number between -0.8 and +0.8",
  "color_temp": "integer between 2800 and 8500",
  "tint": "number between -100.0 and +100.0",
  "lift_shadows": "number between -0.5 and +0.5",
  "blacks": "number between -0.5 and +0.5",
  "vibrance": "number between -1.0 and +1.0",
  "lut_intensity": "number between 0.0 and 1.0",
  "clarity": "number between -1.0 and +1.0",
  "sharpness": "number between -1.0 and +1.0",
  "color_density": "number between -1.0 and +1.0",
  "shadow_hue": "number between 0 and 360",
  "shadow_tint_amount": "number between 0.0 and 1.0",
  "highlight_hue": "number between 0 and 360",
  "highlight_tint_amount": "number between 0.0 and 1.0",
  "halation": "number between 0.0 and 1.0",
  "grain_amount": "number between 0.0 and 1.0",
  "vignette": "number between -1.0 and +1.0",
  "hsl": "optional partial object { red|orange|yellow|green|cyan|blue?: { hue?: number, sat?: number, lum?: number } } in [-1.0, +1.0]",
  "tags": ["string (3 to 6 tags in Traditional Chinese)"],
  "crop_box": [ymin, xmin, ymax, xmax],
  "rotation_deg": "number between -45.0 and +45.0",
  "keystone_v": "number between -45.0 and +45.0",
  "aspect_ratio": "original | 1:1 | 4:5 | 16:9 | 9:16 | free",
  "crop_rationale": "string (explanation in Traditional Chinese, or empty string if unchanged)"
}`;

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
      style_insight: parsed.style_insight || '本地 AI 已根據畫面光影特徵完成動態範圍與色調調校。',
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
      providerUsed: 'ollama' as any,
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
    const baseUrl = this.resolveBaseUrl(apiKey);
    const activeModel = modelId && modelId.trim() ? modelId.trim() : 'qwen2.5vl:latest';

    const cleanOrig = originalImageBase64.includes(',')
      ? originalImageBase64.slice(originalImageBase64.indexOf(',') + 1)
      : originalImageBase64;
    const cleanRendered = renderedImageBase64.includes(',')
      ? renderedImageBase64.slice(renderedImageBase64.indexOf(',') + 1)
      : renderedImageBase64;

    const endpoint = `${baseUrl}/api/chat`;
    const criticPrompt = buildCriticInstructionBlock(
      firstPassDecision,
      options.stylePreset,
      options.styleKeywords,
      options.customStylePrompt,
      options.monochrome,
      options.scope
    );

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: activeModel,
        stream: false,
        format: 'json',
        options: {
          temperature:
            typeof options.temperature === 'number' && Number.isFinite(options.temperature)
              ? options.temperature
              : 0.2,
        },
        messages: [
          {
            role: 'user',
            content: criticPrompt,
            images: [cleanOrig, cleanRendered],
          },
        ],
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      const detail = errJson?.error || `HTTP ${response.status}`;
      throw new Error(`Ollama 覆審端點回應異常 (${detail})`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.message?.content;
    if (!rawContent) {
      throw new Error('Ollama 覆審未回傳內容');
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
      refine_rationale: parsed.refine_rationale || '本地雙圖比對覆審完成，曝光與動態範圍已微調優化。',
    };
  }

  public async generateCopywriting(options: TextInferenceOptions): Promise<CopywritingResult> {
    const { apiKey, modelId, payload } = options;
    const baseUrl = this.resolveBaseUrl(apiKey);
    const activeModel = modelId && modelId.trim() ? modelId.trim() : 'qwen2.5:latest';
    const endpoint = `${baseUrl}/api/chat`;

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
  "hashtags": ["#底片日常", "#35mm", "#街頭光影"],
  "iptc_keywords": ["Street", "Night", "WarmToned", "Portrait"]
}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: activeModel,
        stream: false,
        format: 'json',
        options:
          typeof options.temperature === 'number' && Number.isFinite(options.temperature)
            ? { temperature: options.temperature }
            : {},
        messages: [{ role: 'user', content: systemPrompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama 文案生成失敗: HTTP ${response.status}`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.message?.content;
    const parsed = parseAiJsonString(rawContent);
    return {
      caption: parsed.caption || '靜謐的光影，在時間的流隙中凝結成永恆的底片記憶。',
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ['#35mm', '#FilmPhotography'],
      iptcKeywords: Array.isArray(parsed.iptc_keywords) ? parsed.iptc_keywords : ['Analog', 'Photography'],
      providerUsed: 'ollama' as any,
    };
  }

  public async planDirectory(options: DirectoryPlanOptions): Promise<DirectoryPlanResult> {
    const { apiKey, modelId, payload } = options;
    const baseUrl = this.resolveBaseUrl(apiKey);
    const activeModel = modelId && modelId.trim() ? modelId.trim() : 'qwen2.5:latest';
    const endpoint = `${baseUrl}/api/chat`;
    const sessionDate = payload.sessionDate || new Date().toISOString().slice(0, 10);
    const strategy = payload.strategy || 'smart_scene';
    const userPrompt = payload.userInstruction?.trim() || '';

    const systemPrompt = `你是一位資深的數位資產管理 (DAM) 專家與暗房策展人。
請根據輸入的攝影底片相片屬性，規劃匯出目錄結構藍圖並嚴格回傳 JSON 格式（正體中文）：
{
  "projectRootName": "${sessionDate}_街頭光影策展集",
  "rationale": "簡述目錄規劃的邏輯與分組考量（1-2句正體中文）",
  "folders": [
    {
      "subPath": "01_街頭夜景_Night",
      "description": "該資料夾包含的主題特色",
      "photoIds": ["photo_1"],
      "renamePattern": "{original}_graded"
    }
  ],
  "rawBackupSubPath": "00_RAW_Originals"
}`;

    const userContent = JSON.stringify({
      sessionDate,
      strategy,
      userInstruction: userPrompt,
      totalPhotos: payload.photos.length,
      samplePhotos: payload.photos.map(p => ({
        id: p.id,
        filename: p.filename,
        scene: p.scene || '未標註',
        profile: p.profile || '標準風格',
        focal: p.focalLength || '--',
        iso: p.iso || 100,
        shutter: p.shutter || '--',
        time: p.dateTime || '--',
        flagged: !!p.flagged
      }))
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: activeModel,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama 目錄規劃失敗: HTTP ${response.status}`);
    }

    const jsonRes = await response.json();
    const rawContent = jsonRes.message?.content;
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
      providerUsed: 'ollama',
    };
  }

  public async testConnection(apiKey: string, modelId: string): Promise<{ success: boolean; latencySec: number; error?: string }> {
    const baseUrl = this.resolveBaseUrl(apiKey);
    const t0 = Date.now();
    try {
      const res = await fetch(`${baseUrl}/api/tags`);
      const latencySec = parseFloat(((Date.now() - t0) / 1000).toFixed(2));
      if (!res.ok) {
        return { success: false, latencySec, error: `HTTP ${res.status}` };
      }
      if (modelId && modelId.trim()) {
        const chatRes = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelId.trim(),
            stream: false,
            messages: [{ role: 'user', content: 'Ping' }],
          }),
        });
        const totalLatency = parseFloat(((Date.now() - t0) / 1000).toFixed(2));
        if (!chatRes.ok) {
          const errJson = await chatRes.json().catch(() => null);
          return { success: false, latencySec: totalLatency, error: errJson?.error || `HTTP ${chatRes.status}` };
        }
        return { success: true, latencySec: totalLatency };
      }
      return { success: true, latencySec };
    } catch (err: any) {
      const latencySec = parseFloat(((Date.now() - t0) / 1000).toFixed(2));
      return {
        success: false,
        latencySec,
        error: err?.message || '無法連線至 Ollama，請確認服務已啟動且已設定 OLLAMA_ORIGINS="*"',
      };
    }
  }
}

