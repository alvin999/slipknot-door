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
 * 風格目標指令與 LUT 清單唯一真實來源 (Single Source of Truth for AI LUT Profiles & Directives)
 * 對齊 webglLutRenderer.ts 實際載入的 .cube 檔與 static/luts/README.md 對照表。
 * 僅客观描述各個 .cube 檔案的色彩科學特性，不干預或強制指定 AI 的具體參數調整方向。
 */

import type { StylePresetKey, StyleKeywordId, VisionInferenceOptions } from './types';
import type { ExifOpticalData, AiScopePreferences } from '../../types/photo';
import type { AiSceneDecision } from '../aiSceneService';
import type { CustomLutRecord } from '../customLutService';

export interface StyleKeywordEntry {
  id: StyleKeywordId;
  label: string;
  shortTag: string;
  tooltip: string;
  promptEnglish: string;
}

/**
 * 調色意境關鍵字預設集 (Vibe / Style Keywords for Prompt Injection)
 * 供使用者點擊選取後注入 AI 調色 Prompt，引導曝光、對比、色溫、Tint、陰影抬升、清晰度與銳利度
 */
export const STYLE_KEYWORD_ENTRIES: StyleKeywordEntry[] = [
  {
    id: 'film_like',
    label: 'Film Like (Analog Film Aesthetic / 底片感)',
    shortTag: 'Film Like',
    tooltip: '有機高光滾降、暗部微抬啞光黑、柔和暈光與溫潤底片色調',
    promptEnglish:
      'Analog film aesthetic: prioritize emulsion diffusion and gentle optical roll-off (keep clarity & sharpness <= 0.0 to prevent algorithmic digital edge halos), lifted matte shadow toe, natural highlight chroma desaturation',
  },
  {
    id: 'lomo',
    label: 'LOMO (Lomography Toy Camera / LOMO 風)',
    shortTag: 'LOMO 風',
    tooltip: '玩具相機負沖感、鮮明高反差、大膽色偏與邊緣微柔化',
    promptEnglish:
      'Lomography toy camera: punchy cross-processed chromatic drift, high dynamic contrast, vignetted falloff, soft peripheral focus',
  },
  {
    id: 'airy_jp',
    label: 'Japanese Airy Style (日系空氣感)',
    shortTag: '日系空氣感',
    tooltip: '明亮微過曝、低反差、抬升暗部、清透偏冷青日光感',
    promptEnglish:
      'Japanese airy aesthetic: high-key gentle overexposure, soft low contrast, lifted airy shadows, pastel tonality, cool cyan-green daylight bias',
  },
  {
    id: 'cinematic',
    label: 'Cinematic Color Grade (電影感)',
    shortTag: '電影感',
    tooltip: '戲劇張力光比、冷暖色溫分離、深邃中間調立體感',
    promptEnglish:
      'Cinematic color grade: teal and orange complementary split-toning, deep rich midtones, controlled contrast ratio, preserved dynamic shadow texture',
  },
  {
    id: 'faded_vintage',
    label: 'Faded Vintage Print (復古褪色)',
    shortTag: '復古褪色',
    tooltip: '歲月泛黃暖調、強烈啞光抬黑、低反差懷舊老照片',
    promptEnglish:
      'Faded vintage print: warm nostalgic sepia-amber cast, heavily lifted matte black floor, compressed dynamic range, aged print patina',
  },
  {
    id: 'neon_wkw',
    label: 'Wong Kar-wai Hong Kong Neon (王家衛 · 霓虹夜色)',
    shortTag: '霓虹王家衛',
    tooltip: '90年代港片氛圍、濃烈鎢絲綠或琥珀洋紅偏移、迷離柔焦感',
    promptEnglish:
      'Wong Kar-wai Hong Kong neon: stylized tungsten green and amber-magenta chromatic drift, dreamy bloom diffusion, nocturnal moody atmosphere',
  },
  {
    id: 'gritty_mono',
    label: 'Daido Moriyama Gritty Monochrome (森山大道 · 粗粒子硬調)',
    shortTag: '粗粒子硬調',
    tooltip: '極致高反差黑白街拍、深沉黑階、強烈邊緣微反差與清晰度',
    promptEnglish:
      'Daido Moriyama gritty monochrome: extreme high-contrast black-and-white, crushed deep blacks, aggressive micro-contrast and tactile edge sharpness',
  },
];

/**
 * 依據選取的風格關鍵字清單，自動組合專業英文光學指令
 */
export function composeStyleKeywordPrompt(ids: StyleKeywordId[]): string {
  if (!Array.isArray(ids) || ids.length === 0) return '';
  const parts: string[] = [];
  for (const id of ids) {
    const entry = STYLE_KEYWORD_ENTRIES.find((k) => k.id === id);
    if (entry && entry.promptEnglish) {
      parts.push(entry.promptEnglish);
    }
  }
  return parts.join('; ');
}

export interface LutDirectiveEntry {
  presetKey: Exclude<StylePresetKey, 'auto'>;
  profileId: string;
  cubeFile: string | null;
  prototypeName: string;
}

export const LUT_DIRECTIVE_ENTRIES: LutDirectiveEntry[] = [
  {
    presetKey: 'standard',
    profileId: 'Profile_00_StandardNatural',
    cubeFile: null,
    prototypeName: 'Optical Straight-Out-Of-Camera (Zero 3D LUT)',
  },
  {
    presetKey: 'fieldnote',
    profileId: 'Profile_01_Fieldnote',
    cubeFile: 'Fieldnote.cube',
    prototypeName: 'LUMIX Fieldnote (C-41 Daily Negative, Long Toe, Slate Shadows & Straw Highlights)',
  },
  {
    presetKey: 'heartland',
    profileId: 'Profile_02_Heartland',
    cubeFile: 'Heartland.cube',
    prototypeName: 'LUMIX Heartland (Warm Portrait Negative, Natural Skin Tones & Warm Indoor Light)',
  },
  {
    presetKey: 'meridian',
    profileId: 'Profile_03_Meridian',
    cubeFile: 'Meridian.cube',
    prototypeName: 'LUMIX Meridian (Honest Daylight Stock, Zero-Drift Measured-Neutral Gray Axis)',
  },
  {
    presetKey: 'matinee',
    profileId: 'Profile_04_Matinee',
    cubeFile: 'Matinee.cube',
    prototypeName: 'LUMIX Matinee (Cinema Print Density, Deep Readable Blacks & Subtle Expressive Tones)',
  },
  {
    presetKey: 'postcard',
    profileId: 'Profile_05_Postcard',
    cubeFile: 'Postcard.cube',
    prototypeName: 'LUMIX Postcard (Reversal Slide Hue Purification & Micro-Density, Clean Saturation)',
  },
  {
    presetKey: 'skylight',
    profileId: 'Profile_06_Skylight',
    cubeFile: 'Skylight.cube',
    prototypeName: 'LUMIX Skylight (Light-Ratio Restructure, Open Shadows & Smooth Highlight Compression)',
  },
  {
    presetKey: 'night_market',
    profileId: 'Profile_07_NightMarket',
    cubeFile: 'NightMarket.cube',
    prototypeName: 'LUMIX NightMarket (Mixed-Light Night, Tungsten/Sodium to Gold, LED Anti-Posterization)',
  },
  {
    presetKey: 'dusk_tide',
    profileId: 'Profile_08_DuskTide',
    cubeFile: 'DuskTide.cube',
    prototypeName: 'LUMIX DuskTide (Blue Hour, Indigo Shadows vs Warm Golden City Lighting)',
  },
  {
    presetKey: 'canopy',
    profileId: 'Profile_09_Canopy',
    cubeFile: 'Canopy.cube',
    prototypeName: 'LUMIX Canopy (Foliage Lightness Hierarchy, Deep Cyan-Greens vs Lit Yellow-Greens)',
  },
  {
    presetKey: 'lowsun',
    profileId: 'Profile_10_Lowsun',
    cubeFile: 'Lowsun.cube',
    prototypeName: 'LUMIX Lowsun (Golden Hour, Golden-Amber Highlights vs Cool Blue Shadows)',
  },
];

/**
 * 產生完整可選 LUT 清單（供 `auto` 自動配對模式放入 Prompt，支援合併使用者自訂 LUT）
 */
export function buildLutManifestPrompt(customLuts?: CustomLutRecord[]): string {
  const builtinManifest = LUT_DIRECTIVE_ENTRIES.map((e) => {
    return `- "${e.profileId}": ${e.prototypeName}`;
  });

  if (Array.isArray(customLuts) && customLuts.length > 0) {
    for (const lut of customLuts) {
      builtinManifest.push(`- "${lut.id}": [User Custom 3D LUT] ${lut.name} (${lut.directiveDescription})`);
    }
  }

  return builtinManifest.join('\n');
}

/**
 * 根據使用者選擇的 `stylePreset`、關鍵字按鈕 (`styleKeywords`)、自訂文字 (`customStylePrompt`) 與使用者自訂 LUT 清單產生對應的風格背景資訊與調色指令
 */
export function buildStyleInstructionBlock(
  preset?: StylePresetKey | string,
  styleKeywords?: StyleKeywordId[],
  customStylePrompt?: string,
  customLuts?: CustomLutRecord[]
): {
  instructionBlock: string;
  recommendedProfileSchemaHint: string;
} {
  let baseBlock = '';
  let recommendedProfileSchemaHint = 'string (One ID from Available 3D LUT Profiles)';

  if (!preset || preset === 'auto') {
    const manifest = buildLutManifestPrompt(customLuts);
    baseBlock = `Available 3D LUT Profiles:
${manifest}`;
    recommendedProfileSchemaHint =
      'string (One ID from Available 3D LUT Profiles above)';
  } else {
    // 1. 優先檢查是否為內建 10 款 LUT 或別名
    const entry = LUT_DIRECTIVE_ENTRIES.find((e) => e.presetKey === preset);
    if (entry) {
      baseBlock = `Selected 3D LUT Profile: "${entry.profileId}": ${entry.prototypeName}`;
      recommendedProfileSchemaHint = `"${entry.profileId}"`;
    } else {
      // 2. 檢查是否為使用者自訂的 LUT (例如 "custom_xxx")
      const customFound = customLuts?.find((c) => c.id === preset);
      if (customFound) {
        baseBlock = `Selected 3D LUT Profile: "${customFound.id}": [User Custom 3D LUT] ${customFound.name} (${customFound.directiveDescription})`;
        recommendedProfileSchemaHint = `"${customFound.id}"`;
      } else {
        const manifest = buildLutManifestPrompt(customLuts);
        baseBlock = `Available 3D LUT Profiles:\n${manifest}`;
        recommendedProfileSchemaHint = 'string (One ID from Available 3D LUT Profiles)';
      }
    }
  }

  const targetAesthetics: string[] = [];
  const trimmedCustom = customStylePrompt?.trim() || '';

  if (trimmedCustom) {
    // 若已提供具體文字（無論是 Chips 自動填入的英文指令或使用者自訂內容），以此為主
    targetAesthetics.push(trimmedCustom);
  } else if (Array.isArray(styleKeywords) && styleKeywords.length > 0) {
    // 若無具體文字，則 fallback 使用選中標籤的預設指示
    for (const kwId of styleKeywords) {
      const found = STYLE_KEYWORD_ENTRIES.find((k) => k.id === kwId);
      if (found) {
        targetAesthetics.push(found.promptEnglish || found.label);
      }
    }
  }

  if (targetAesthetics.length > 0) {
    baseBlock += `\n\nTarget Aesthetic Intent: ${targetAesthetics.join(', ')}`;
  }
  baseBlock += `\n\nWebGL 2.0 Hardware Pipeline Specification:
1. exposure_compensation: Global luminance scaling before LUT.
2. lift_shadows: Shadow toe adjustment affecting darkest 40% luminance. Negative deepens blacks; positive lifts blacks.
3. color_temp & tint: Pre-LUT white balance (5500K / 0.0 baseline).
4. recommended_profile & lut_intensity: 3D film LUT volumetric emulation.
5. contrast: Global linear tonal slope.
6. clarity & sharpness [-1.0 to 1.0, Baseline: 0.0]: Spatial frequency unsharp masking (high-frequency detail control).
   - Baseline 0.0 preserves native optical lens MTF.
   - Negative values (<= 0.0) attenuate high-frequency edge steepness to model chemical emulsion diffusion, halation, and organic optical roll-off.
   - Positive values (> 0.0) apply algorithmic edge-overshoot sharpening; use only when explicitly intending modern digital micro-contrast (not applicable for organic film emulation).
7. FILMIC HIGHLIGHT PHILOSOPHY: Analog film prioritizes highlight roll-off over global brightness. Protect organic textures in bright skies, sunlit walls, and skin highlights; preserve highlight headroom rather than pushing exposure.
8. composition & geometric framing (crop_box, rotation_deg, keystone_v):
   - Frame Boundary Consolidation vs. Environmental Negative Space:
     * When perimeter edges contain disruptive tangential cuts, visual clutter, or unbalanced dead space, consolidate crop boundaries inwards to anchor subject prominence and compositional harmony.
     * When wide contextual breathing room, atmospheric scale, or environmental context reinforces the aesthetic, preserve open framing or full frame [0.0, 0.0, 1.0, 1.0].
   - Horizon & Perspective Alignment:
     * Modulate rotation_deg and keystone_v to correct unintended optical lean or keystoning on architectural verticals and natural horizons, while respecting intentional dynamic angles.`;

  return {
    instructionBlock: baseBlock,
    recommendedProfileSchemaHint,
  };
}

/**
 * 建立雙圖閉環覆審 (Pass 2 Refinement / Critic) 之專用品控 Prompt 指令區塊
 * 嚴格鎖定 Pass 1 底片風格，專注於暗部浮黑 (Shadow Lift)、動態範圍與色彩中性殘差校正
 */
export function buildCriticInstructionBlock(
  firstPassInput: string | AiSceneDecision,
  stylePreset?: StylePresetKey,
  styleKeywords?: StyleKeywordId[],
  customStylePrompt?: string
): string {
  const isDecisionObj = typeof firstPassInput === 'object' && firstPassInput !== null;
  const firstPassProfile = isDecisionObj ? firstPassInput.recommended_profile : firstPassInput;

  let baselineParamsBlock = '';
  if (isDecisionObj) {
    const exp = firstPassInput.exposure_compensation;
    const shadow = firstPassInput.lift_shadows;
    const contrast = firstPassInput.contrast ?? 0.0;
    const temp = firstPassInput.color_temp ?? 5500;
    const tint = firstPassInput.tint ?? 0.0;
    const lutIntensity = firstPassInput.lut_intensity ?? 0.85;
    const clarity = firstPassInput.clarity ?? 0.0;
    const sharpness = firstPassInput.sharpness ?? 0.0;

    baselineParamsBlock = `Current Pass 1 Baseline Parameters Applied on Image 2:
- 3D LUT Profile: "${firstPassProfile}" (Intensity: ${lutIntensity.toFixed(2)})
- Exposure Compensation: ${exp >= 0 ? '+' : ''}${exp.toFixed(2)} EV
- Lift Shadows: ${shadow >= 0 ? '+' : ''}${shadow.toFixed(2)}
- Contrast: ${contrast >= 0 ? '+' : ''}${contrast.toFixed(2)}
- Color Temperature: ${temp}K (Tint: ${tint >= 0 ? '+' : ''}${tint.toFixed(1)})
- Clarity: ${clarity >= 0 ? '+' : ''}${clarity.toFixed(2)}, Sharpness: ${sharpness >= 0 ? '+' : ''}${sharpness.toFixed(2)}\n\n`;
  }
  const targetAesthetics: string[] = [];
  const trimmedCustom = customStylePrompt?.trim() || '';
  if (trimmedCustom) {
    targetAesthetics.push(trimmedCustom);
  } else if (Array.isArray(styleKeywords) && styleKeywords.length > 0) {
    for (const kwId of styleKeywords) {
      const found = STYLE_KEYWORD_ENTRIES.find((k) => k.id === kwId);
      if (found) targetAesthetics.push(found.promptEnglish || found.label);
    }
  }

  const aestheticLine = targetAesthetics.length > 0
    ? `- Target Aesthetic Intent: ${targetAesthetics.join(', ')}. Harmonize all delta adjustments to fulfill this target aesthetic.\n`
    : '';

  let criticPrompt = `You are an elite darkroom quality-control colorist and technical critic.
You are inspecting TWO images:
1. IMAGE 1: The original unedited capture proxy (1024px downscaled preview).
2. IMAGE 2: The rendered draft result produced after applying Pass 1 tone & 3D LUT profile parameters (Profile: "${firstPassProfile}").
Note: Do not supply positive clarity/sharpness deltas to compensate for proxy resolution; evaluate strictly for intended artistic character.

${baselineParamsBlock}YOUR MISSION & GUIDELINES:
- Baseline Film Aesthetic: The designated 3D film profile is "${firstPassProfile}". Maintain and respect this baseline film aesthetic.
${aestheticLine}- Since you have Image 2 (rendered actual result) as concrete ground truth, supply the necessary Delta adjustments to harmonize exposure, dynamic range, and tonal balance toward the intended aesthetic.
- Inspect and fine-tune the following parameters (Respecting the hardware shader boundaries):
  1. EXPOSURE & HIGHLIGHT HARMONY (exposure_delta, valid range: -2.0 to 2.0 EV):
     - Evaluate overall luminance and highlight roll-off relative to the target aesthetic.
     - Supply a negative delta within [-2.0, 0.0] EV if highlights clip or lose organic roll-off texture.
     - Supply a positive delta within [0.0, 2.0] EV if overall exposure requires open luminance.
  2. SHADOW DEPTH & TOE GRADATION (lift_shadows_delta, valid range: -0.5 to 0.5):
     - If blacks benefit from deeper, crisper punch, supply a negative delta within [-0.5, 0.0].
     - If shadow areas require gentle opening or a softer matte film aesthetic is desired, provide a positive delta within [0.0, 0.5].
  3. TONAL CONTRAST & DYNAMICS (contrast_delta, valid range: -0.8 to 0.8):
     - If contrast transition is too steep for the target vibe, provide a negative delta within [-0.8, 0.0] for smoother, gentler roll-off.
     - If the image benefits from greater tonal separation and visual energy, provide a positive delta within [0.0, 0.8].
  4. COLOR TEMPERATURE & AMBIENT HARMONY (color_temp_delta, valid range: -3000 to 3000 Kelvin; tint_delta, optional, valid range: -100.0 to 100.0):
     - Supply the necessary Kelvin adjustment within [-3000, 3000] K to harmonize ambient scene lighting with the selected film profile and aesthetic targets.
     - Supply a tint delta within [-100.0, 100.0] if the rendered draft exhibits unwanted green/magenta cast or requires stylized tint adjustment.
  5. 3D LUT INTENSITY (lut_intensity_delta, optional, valid range: -1.0 to 1.0):
     - Modulate the 3D LUT's volumetric influence within [-1.0, 1.0] if a more subtle or distinct profile presence is desired.
  6. OPTICAL TEXTURE & ACUTANCE (clarity_delta & sharpness_delta, optional, valid range: -0.5 to 0.5):
     - Supply a negative delta if Image 2 exhibits unnatural digital edge hardness or to enhance analog emulsion diffusion and roll-off.
     - Supply a positive delta only when the scene specifically requires modern high-frequency digital edge accentuation (not recommended for analog film aesthetics).

Respond ONLY with raw JSON matching this schema:
{
  "exposure_delta": "number between -2.0 and 2.0 (EV adjustment, 0.0 if optimal)",
  "lift_shadows_delta": "number between -0.5 and 0.5 (toe lift adjustment, 0.0 if optimal)",
  "color_temp_delta": "integer between -3000 and 3000 (Kelvin adjustment, 0 if accurate)",
  "tint_delta": "number between -100.0 and 100.0 (optional tint adjustment, 0.0 if balanced)",
  "contrast_delta": "number between -0.8 and 0.8 (contrast adjustment, 0.0 if balanced)",
  "lut_intensity_delta": "number between -1.0 and 1.0 (optional LUT intensity adjustment, 0.0 if optimal)",
  "clarity_delta": "number between -0.5 and 0.5 (optional clarity adjustment, 0.0 if optimal)",
  "sharpness_delta": "number between -0.5 and 0.5 (optional sharpness adjustment, 0.0 if optimal)",
  "refine_rationale": "string (1 concise sentence in Traditional Chinese summarizing the tonal/color refinements and aesthetic rationale)"
}`;

  return criticPrompt;
}

/**
 * 清理並解析模型回傳的 JSON 字串
 * 1. 剝除 Markdown code block (```json ... ```)
 * 2. 擷取最外層 JSON 物件 ({ ... })
 * 3. 移除非標準的數值前綴正號 (如 ": +100" -> ": 100", ": +0.15" -> ": 0.15")，符合 RFC 8259 規範
 */
export function parseAiJsonString<T = any>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  // 移除在冒號、逗號或中括號後面的非法正號 (例如 : +100 -> : 100, : +0.15 -> : 0.15)
  cleaned = cleaned.replace(/(:\s*|\[\s*|,\s*)\+(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, '$1$2');
  return JSON.parse(cleaned);
}


/**
 * ═══════════════════════════════════════════════════════════════════
 * 【分階段中性 Prompt 構建器 (Staged Neutral Prompt Builders)】
 * 嚴格恪守 Prompt Neutrality Guidelines：
 * 1. 幾何空間與光學色彩完全解耦，防止 Attention 互相稀釋與直方圖因果倒置。
 * 2. 僅提供純物理邊界、型別規範與光學坐標系，不使用任何主觀情緒化修飾詞。
 * 3. 依據使用者指派之 AiScope 動態隱藏/關閉非目標通道，杜絕無謂漂移。
 * ═══════════════════════════════════════════════════════════════════
 */

/**
 * 構建 Stage 1: 空間幾何與構圖分析之客觀中性 Prompt
 */
export function buildGeometryInstructionPrompt(exif: ExifOpticalData): string {
  return `You are an optical geometry and spatial composition analyzer.
Analyze this photographic image and optical EXIF (Lens/Focal: ${exif.focalLength || 'N/A'}, Aperture: ${exif.apertureValue || 'N/A'}).

Evaluate horizon alignment, architectural vertical perspective convergence, perimeter dead-space, and compositional balance.

Physical Geometric Channel Specifications:
1. crop_box: Normalized bounding box [ymin, xmin, ymax, xmax] within 0.0 to 1.0. Baseline uncropped full frame is [0.0, 0.0, 1.0, 1.0].
   - Consolidate boundaries inwards when frame edges contain disruptive tangential cuts or unbalanced dead space.
   - Maintain [0.0, 0.0, 1.0, 1.0] when contextual breathing room or environmental scale reinforces the subject.
2. rotation_deg: Roll axis tilt compensation in degrees (-45.0 to +45.0). 0.0 denotes perfectly level.
3. keystone_v: Vertical perspective convergence compensation (-45.0 to +45.0). 0.0 denotes parallel verticals.
4. aspect_ratio: Framing ratio ("original" | "1:1" | "4:5" | "16:9" | "9:16" | "free").

Respond ONLY with raw JSON matching this schema:
{
  "crop_box": [ymin, xmin, ymax, xmax],
  "rotation_deg": number between -45.0 and +45.0,
  "keystone_v": number between -45.0 and +45.0,
  "aspect_ratio": "original | 1:1 | 4:5 | 16:9 | 9:16 | free",
  "crop_rationale": "string (Concise technical rationale in Traditional Chinese, or empty string if unchanged)"
}`;
}

/**
 * 構建 Stage 2: 物理測光、色彩分級與微反差之客觀中性 Prompt
 * 幾何視角已由前置階段或使用者手動固定，專注於物理動態範圍與色調曲線
 */
export function buildColorGradeInstructionPrompt(options: VisionInferenceOptions): string {
  const { exif, stylePreset, styleKeywords, customStylePrompt, customLuts, scope } = options;

  const { instructionBlock, recommendedProfileSchemaHint } = buildStyleInstructionBlock(
    stylePreset,
    styleKeywords,
    customStylePrompt,
    customLuts
  );

  // 根據 AiScope 偏好決定啟用的物理通道，若未傳入 scope 則預設全開
  const enableTone = !scope || scope.tone;
  const enableWb = !scope || scope.whiteBalance;
  const enableLut = !scope || scope.lutProfile;

  const channels: string[] = [];
  if (enableTone) {
    channels.push('1. exposure_compensation: Global luminance scaling (-2.0 to +2.0 EV). Target linear mid-tone placement while protecting organic highlight headroom.');
    channels.push('2. contrast: Global linear tonal slope (-0.8 to +0.8).');
    channels.push('3. lift_shadows: Shadow toe adjustment (-0.5 to +0.5). Negative deepens blacks; positive lifts darkest 40% luminance.');
    channels.push('4. clarity & sharpness [-1.0 to +1.0, baseline: 0.0]: Spatial frequency control. Baseline 0.0 preserves native lens MTF. Negative values (<= 0.0) attenuate edge contrast to model organic emulsion diffusion; positive values (> 0.0) apply algorithmic digital sharpening.');
  }
  if (enableWb) {
    channels.push('5. color_temp & tint: Pre-LUT white balance (color_temp: integer 2800 to 8500, 5500 baseline; tint: -100.0 to +100.0). Neutralize unintended environmental chromatic cast.');
  }
  if (enableLut) {
    channels.push('6. recommended_profile & lut_intensity: 3D film volumetric emulation (lut_intensity: 0.0 to 1.0).');
  }

  return `You are a radiometric calibration and volumetric color grading specialist.
The geometric frame and perspective have already been stabilized. Analyze the optical luminance distribution and chromatic harmony of this image.
EXIF: ISO ${exif.iso || 'N/A'}, Shutter ${exif.shutterSpeed || 'N/A'}, Aperture ${exif.apertureValue || 'N/A'}, Focal ${exif.focalLength || 'N/A'}.

Note: The image is a 1024px preview proxy downscaled from high-resolution capture; native optical sharpness is optimal at baseline 0.0. Do not add clarity or sharpness to compensate for proxy resolution; evaluate strictly for intended artistic character.

${instructionBlock}

Active Control Channels:
${channels.join('\n')}

Respond ONLY with raw JSON matching this schema:
{
  "scene_title": "string (4-8 chars in Traditional Chinese)",
  "scene_type": "string (portrait | landscape | architecture | street | night | still_life | documentary | nature | indoor)",
  "style_insight": "string (1-2 sentences in Traditional Chinese)",
  "recommended_mood": "string (short mood label in Traditional Chinese)",
  "tags": ["string (3 to 6 tags in Traditional Chinese)"]${enableLut ? `,\n  "recommended_profile": "${recommendedProfileSchemaHint}",\n  "lut_intensity": "number between 0.0 and 1.0"` : ''}${enableTone ? `,\n  "exposure_compensation": "number between -2.0 and +2.0",\n  "contrast": "number between -0.8 and +0.8",\n  "lift_shadows": "number between -0.5 and +0.5",\n  "clarity": "number between -1.0 and +1.0",\n  "sharpness": "number between -1.0 and +1.0"` : ''}${enableWb ? `,\n  "color_temp": "integer between 2800 and 8500",\n  "tint": "number between -100.0 and +100.0"` : ''}
}`;
}
