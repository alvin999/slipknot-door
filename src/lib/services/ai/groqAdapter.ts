/**
 * Groq Provider Adapter
 * Implements ITextStrategy (Lightning LPU Text Generation)
 * and IVisionStrategy (for Vision-capable Llama models)
 * Dynamic model IDs, zero hardcoded strings.
 */

import type { IVisionStrategy, ITextStrategy, VisionInferenceOptions, TextInferenceOptions } from './types';
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

    // 動態組合可擴充 LUT 清單描述
    const lutList = (options.availableProfiles && options.availableProfiles.length > 0)
      ? options.availableProfiles
      : [
          { id: 'Profile_00_StandardNatural', title: '原色自然直出', description: '保留光學原色，零風格扭曲' },
          { id: 'Profile_01_MatteShadow', title: '啞光微膠卷', description: '黑階抬升、低飽和綠、電影感' },
          { id: 'Profile_02_TealEmerald', title: '冷青翡翠', description: '暗部青藍、高光暖金雙色調' },
          { id: 'Profile_03_TungstenSoft', title: '溫潤人像', description: '鎢絲燈暖調、柔和膚色' },
          { id: 'Profile_04_HighContrastMono', title: '高反差黑白紀實', description: '幾何建築、強烈反差光影' },
          { id: 'Profile_05_DocumentaryChrome', title: '典藏冷印紀實', description: '收斂飽和、暗部深邃冷調' }
        ];

    const lutManifest = lutList.map(p => `- ${p.id}: ${p.title} (${p.description || '自訂風格檔'})`).join('\n');

    const isStyleGrading = options.analysisMode === 'style_grading';
    let promptText: string;

    if (isStyleGrading) {
      // 專屬 AI 風格調色：解除保守中庸束縛，指名經典相機色彩科學或自由輸入風格，動態生成專屬 3D LUT
      let targetDirective = '';
      if (options.customStylePrompt && options.customStylePrompt.trim()) {
        targetDirective = `Emulate the user's bespoke artistic style request: "${options.customStylePrompt.trim()}". Be creative, bold, and fully realize this artistic atmosphere on this photograph.`;
      } else if (options.stylePreset === 'film_like_fl') {
        targetDirective = `Recreate the authentic aesthetic of Sony Creative Look 'FL' (Film-like). Lift shadows with a matte cyan-green pedestal, keep foliage greens muted/olive, enrich warm skin tones, and deliver a cinematic, low-fatigue analog look.`;
      } else if (options.stylePreset === 'classic_chrome_cc') {
        targetDirective = `Recreate the legendary Fujifilm Film Simulation 'Classic Chrome'. Produce hard, linear documentary contrast, distinct cyan sky shift, desaturated reds and rich olive-toned greens with gentle highlight roll-off.`;
      } else if (options.stylePreset === 'monochrome_hc') {
        targetDirective = `Recreate high-contrast classic monochrome silver gelatin aesthetic (reminiscent of legendary German rangefinder cameras). Deep obsidian shadows, rich micro-contrast, crisp luminance separation without crushed midtone textures.`;
      } else if (options.stylePreset === 'matte_shadow') {
        targetDirective = `Recreate the 'MatteShadow' analog film look: lifted black pedestal, low-saturation muted sage greens, and soft cinematic high-contrast roll-off.`;
      } else if (options.stylePreset === 'tungsten_soft') {
        targetDirective = `Recreate the 'TungstenSoft' warm portrait look: warm tungsten glow, subtle magenta tint protection for human skin tones, and creamy highlight roll-off.`;
      } else {
        targetDirective = `Analyze the photo's subject, light angle, and mood, then select the best matching 3D LUT profile from:\n${lutManifest}\n(Prefer stylized LUTs Profile_01 to Profile_05 over Profile_00_StandardNatural) and tailor optical parameters to elevate this image.`;
      }

      promptText = `You are a world-class analog colorist and camera color science architect.
Your mission is to perform bold, evocative AI Style Grading for this photograph.
Optical EXIF: (ISO: ${exif.iso || 'N/A'}, Shutter: ${exif.shutterSpeed || 'N/A'}, Aperture: ${exif.apertureValue || 'N/A'}, Lens/Focal: ${exif.focalLength || 'N/A'}).

TARGET STYLE OBJECTIVE:
${targetDirective}

CRITICAL RULES:
1. DO NOT BE CONSERVATIVE. DO NOT default to neutral or standard straight-out-of-camera looks.
2. Formulate a tailored 3D LUT recipe: Provide the exact shadow tint [r, g, b], highlight tint [r, g, b], black lift amount (0.0 to 0.4), cyan sky shift (0.0 to 1.0), green desaturation (0.0 to 1.0), and warm highlights (0.0 to 1.0) so we can bake a bespoke 33x33x33 3D LUT texture in real-time.
3. Recommend lut_intensity boldly (typically 0.85 to 1.0).
4. Balance the image's dynamic range (exposure_compensation, contrast, lift_shadows, color_temp, tint) to perfectly complement this target look.

Respond ONLY with raw JSON matching this schema:
{
  "scene_title": "string (4-8 chars poetic title in Traditional Chinese describing the actual subject/light)",
  "scene_type": "string (lowercase code: portrait | landscape | architecture | street | night | still_life | documentary | nature | indoor)",
  "style_insight": "string (1-2 sentences explaining how you tailored this specific camera style to this image's light in Traditional Chinese)",
  "recommended_mood": "string (short mood/style label in Traditional Chinese)",
  "recommended_profile": "custom",
  "exposure_compensation": "number (-2.0 to +2.0 EV)",
  "contrast": "number (-0.5 to +0.5)",
  "color_temp": "integer (2500 to 10000 Kelvin)",
  "tint": "number (-30.0 to +30.0, negative=green, positive=magenta)",
  "lift_shadows": "number (-0.5 to +0.5)",
  "lut_intensity": "number (0.75 to 1.0)",
  "neural_matrix": {
    "custom_look_name": "string (Creative 4-8 chars Traditional Chinese artistic look name invented by AI)",
    "shadow_tint": [r, g, b] (three numbers between 0.0 and 1.0, shadow color injection vector),
    "highlight_tint": [r, g, b] (three numbers between 0.0 and 1.0, highlight warm/cool color injection vector),
    "curve_mode": "punchy_s | fade_black | soft_highlight | linear",
    "black_lift": "number (0.0 to 0.4, black pedestal lift for matte film look)",
    "cyan_sky_shift": "number (0.0 to 1.0, shifts pure blues toward rich cyan)",
    "desaturate_greens": "number (0.0 to 1.0, calms neon greens toward olive tones)",
    "warm_highlights": "number (0.0 to 1.0, warm amber glow on upper highlights)",
    "clarity": "number (-1.0 to 1.0)",
    "sharpness": "number (0.0 to 1.0)"
  },
  "tags": ["string (3 to 6 Traditional Chinese tags)"],
  "crop_box": [ymin, xmin, ymax, xmax],
  "rotation_deg": "number between -45.0 and +45.0",
  "keystone_v": "number between -45.0 and +45.0",
  "aspect_ratio": "original | 1:1 | 4:5 | 16:9 | 9:16 | free",
  "crop_rationale": "string (Traditional Chinese)"
}`;
    } else {
      // 既有 AI 智慧顯影：保留原有純淨自然與 Profile_00_StandardNatural 偏好
      promptText = `You are a master analog darkroom colorist and curatorial director.
Analyze this photographic image and optical EXIF (ISO: ${exif.iso || 'N/A'}, Shutter: ${exif.shutterSpeed || 'N/A'}, Aperture: ${exif.apertureValue || 'N/A'}, Lens/Focal: ${exif.focalLength || 'N/A'}).

Evaluate lighting dynamics, color harmony, and visual composition.
You can either select the best matching LUT profile from the available list below, or choose "custom" to invent a bespoke neural color recipe.
If colors are already balanced and natural without requiring heavy color grading, prefer "Profile_00_StandardNatural".

Available LUT Profiles:
${lutManifest}
- custom: Invent a bespoke neural color grading recipe

Respond ONLY with raw JSON matching this schema:
{
  "scene_title": "string (4-8 chars poetic title in Traditional Chinese describing the actual subject/light)",
  "scene_type": "string (lowercase code: portrait | landscape | architecture | street | night | still_life | documentary | nature | indoor)",
  "style_insight": "string (1-2 sentences professional light/color analysis and treatment rationale in Traditional Chinese)",
  "recommended_mood": "string (short mood/style label in Traditional Chinese)",
  "recommended_profile": "string (One ID from the available list above, or 'custom')",
  "exposure_compensation": "number (-2.0 to +2.0 EV)",
  "contrast": "number (-0.5 to +0.5)",
  "color_temp": "integer (2500 to 10000 Kelvin)",
  "tint": "number (-30.0 to +30.0, negative=green, positive=magenta)",
  "lift_shadows": "number (-0.5 to +0.5)",
  "lut_intensity": "number (0.0 to 1.0)",
  "neural_matrix": {
    "custom_look_name": "string (Creative 4-8 chars Traditional Chinese artistic look name invented by AI, e.g. 雨夜消光冷霓虹, 琥珀溫潤微光, 幾何銀鹽深邃)",
    "shadow_tint": [r, g, b] (three numbers between 0.0 and 1.0, shadow color injection vector),
    "highlight_tint": [r, g, b] (three numbers between 0.0 and 1.0, highlight warm/cool color injection vector),
    "curve_mode": "linear | punchy_s | fade_black | soft_highlight",
    "clarity": "number (-1.0 to 1.0)",
    "sharpness": "number (0.0 to 1.0)"
  },
  "tags": ["string (3 to 6 Traditional Chinese tags capturing actual subjects, light, and textures)"],
  "crop_box": [ymin, xmin, ymax, xmax] (four numbers between 0.0 and 1.0; use [0.0, 0.0, 1.0, 1.0] if composition is already balanced),
  "rotation_deg": "number between -45.0 and +45.0 (horizon leveling angle, 0.0 if straight)",
  "keystone_v": "number between -45.0 and +45.0 (vertical perspective keystoning correction, 0.0 if not needed)",
  "aspect_ratio": "original | 1:1 | 4:5 | 16:9 | 9:16 | free",
  "crop_rationale": "string (diagnosis and justification for composition crop/rotation in Traditional Chinese, or empty string if unchanged)"
}`;
    }

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
      neural_matrix: parsed.neural_matrix ? {
        custom_look_name: parsed.neural_matrix.custom_look_name || undefined,
        shadow_tint: Array.isArray(parsed.neural_matrix.shadow_tint) && parsed.neural_matrix.shadow_tint.length === 3 ? parsed.neural_matrix.shadow_tint : undefined,
        highlight_tint: Array.isArray(parsed.neural_matrix.highlight_tint) && parsed.neural_matrix.highlight_tint.length === 3 ? parsed.neural_matrix.highlight_tint : undefined,
        curve_mode: parsed.neural_matrix.curve_mode || undefined,
        clarity: typeof parsed.neural_matrix.clarity === 'number' ? parsed.neural_matrix.clarity : undefined,
        sharpness: typeof parsed.neural_matrix.sharpness === 'number' ? parsed.neural_matrix.sharpness : undefined
      } : undefined,
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
