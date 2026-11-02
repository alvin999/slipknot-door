/**
 * 風格目標指令與 LUT 清單唯一真實來源 (Single Source of Truth for AI LUT Profiles & Directives)
 * 對齊 webglLutRenderer.ts 實際載入的 .cube 檔與 static/luts/README.md 對照表。
 * 僅客观描述各個 .cube 檔案的色彩科學特性，不干預或強制指定 AI 的具體參數調整方向。
 */

import type { StylePresetKey, StyleKeywordId } from './types';
import type { AiSceneDecision } from '../aiSceneService';

export interface StyleKeywordEntry {
  id: StyleKeywordId;
  label: string;
  shortTag: string;
  tooltip: string;
  promptDirective: string;
}

/**
 * 調色意境關鍵字預設集 (Vibe / Style Keywords for Prompt Injection)
 * 供使用者點擊選取後注入 AI 調色 Prompt，引導曝光、對比、色溫、Tint、陰影抬升、清晰度與銳利度
 */
export const STYLE_KEYWORD_ENTRIES: StyleKeywordEntry[] = [
  {
    id: 'film_like',
    label: 'Film Like · 底片感',
    shortTag: 'Film Like',
    tooltip: '有機高光滾降、暗部微抬啞光黑、柔和暈光與溫潤底片色調',
    promptDirective:
      'Analog Film Look (Film Like): organic highlight roll-off, lifted matte blacks (positive lift_shadows), gentle negative clarity (-0.1 to -0.25) for halation/grain softness, and nostalgic film color balance.',
  },
  {
    id: 'lomo',
    label: 'LOMO 風',
    shortTag: 'LOMO 風',
    tooltip: '玩具相機負沖感、鮮明高反差、大膽色偏與邊緣微柔化',
    promptDirective:
      'LOMO / Toy Camera Aesthetic: punchy contrast (+0.15 to +0.35), cross-processed color shift (distinctive warm/cool kelvin and green/magenta tint bias), deep dramatic shadows, and slightly softened optical edges (negative sharpness / clarity).',
  },
  {
    id: 'airy_jp',
    label: '日系空氣感',
    shortTag: '日系空氣感',
    tooltip: '明亮微過曝、低反差、抬升暗部、清透偏冷青日光感',
    promptDirective:
      'Japanese Airy Style: bright overexposed feel (+0.4 to +1.0 EV), low soft contrast (-0.1 to -0.25), lifted open shadows (+0.15 to +0.35 lift_shadows), clean slightly cool daylight (~4800K-5200K), and dreamy negative clarity.',
  },
  {
    id: 'cinematic',
    label: '電影感 · Cinematic',
    shortTag: '電影感',
    tooltip: '戲劇張力光比、冷暖色溫分離、深邃中間調立體感',
    promptDirective:
      'Cinematic Color Grade: controlled mood lighting, subtle cool/teal shadows or warm tungsten highlights, rich midtone depth, and filmic contrast.',
  },
  {
    id: 'faded_vintage',
    label: '復古褪色',
    shortTag: '復古褪色',
    tooltip: '歲月泛黃暖調、強烈啞光抬黑、低反差懷舊老照片',
    promptDirective:
      'Faded Vintage Print: warm nostalgically aged color temperature (6000K-6800K), strongly lifted matte blacks (+0.2 to +0.4 lift_shadows), muted contrast, and soft vintage lens rendering (-clarity, -sharpness).',
  },
  {
    id: 'neon_wkw',
    label: '王家衛 · 霓虹夜色',
    shortTag: '霓虹王家衛',
    tooltip: '90年代港片氛圍、濃烈鎢絲綠或琥珀洋紅偏移、迷離柔焦感',
    promptDirective:
      '90s Hong Kong Cinema / Wong Kar-wai Vibe: rich atmospheric tungsten-green or amber-magenta tint shift, deep moody contrast, and diffused glow (-0.15 to -0.35 clarity).',
  },
  {
    id: 'gritty_mono',
    label: '森山大道 · 粗粒子硬調',
    shortTag: '粗粒子硬調',
    tooltip: '極致高反差黑白街拍、深沉黑階、強烈邊緣微反差與清晰度',
    promptDirective:
      'Gritty High-Contrast Street Monochrome: extreme punchy contrast (+0.3 to +0.5), crushed deep blacks (negative lift_shadows), strong positive clarity (+0.3 to +0.6) and sharpness, raw documentary impact (prefer B&W LUT if in auto mode).',
  },
];

export interface LutDirectiveEntry {
  presetKey: Exclude<StylePresetKey, 'auto'>;
  profileId: string;
  cubeFile: string | null;
  prototypeName: string;
  characteristics: string;
}

export const LUT_DIRECTIVE_ENTRIES: LutDirectiveEntry[] = [
  {
    presetKey: 'standard',
    profileId: 'Profile_00_StandardNatural',
    cubeFile: null,
    prototypeName: 'Optical Straight-Out-Of-Camera (Zero 3D LUT)',
    characteristics:
      'Pure, ungraded optical colors with zero 3D LUT applied.',
  },
  {
    presetKey: 'matte_shadow',
    profileId: 'Profile_01_MatteShadow',
    cubeFile: 'fuji_eterna.cube',
    prototypeName: 'Fujifilm Eterna (Cinema Negative)',
    characteristics:
      'Soft, low-contrast cinematic tonality with lifted blacks, gentle highlight roll-off, muted colors, and calm sage-leaning greens.',
  },
  {
    presetKey: 'reala_tone',
    profileId: 'Profile_02_RealaTone',
    cubeFile: 'fuji_reala_ace.cube',
    prototypeName: 'Fujifilm Reala Ace (Modern True-to-Life Color Negative)',
    characteristics:
      'Balanced highlight and shadow gradation, calm and controlled contrast, faithful skin tone reproduction, and low-fatigue natural negative colors.',
  },
  {
    presetKey: 'tungsten_soft',
    profileId: 'Profile_03_TungstenSoft',
    cubeFile: 'kodak_portra_160.cube',
    prototypeName: 'Kodak Portra 160 (Portrait Color Negative)',
    characteristics:
      'Fine-grain, soft contrast, creamy highlight roll-off, warm tungsten glow, and flattering natural skin tones.',
  },
  {
    presetKey: 'monochrome_hc',
    profileId: 'Profile_04_HighContrastMono',
    cubeFile: 'kodak_trix_400.cube',
    prototypeName: 'Kodak Tri-X 400 (High-Contrast B&W Negative)',
    characteristics:
      'Monochrome with punchy documentary contrast, deep blacks, bright highlights, and strong midtone separation.',
  },
  {
    presetKey: 'classic_chrome_cc',
    profileId: 'Profile_05_DocumentaryChrome',
    cubeFile: 'fuji_classic_chrome.cube',
    prototypeName: 'Fujifilm Classic Chrome (Documentary Reversal)',
    characteristics:
      'Muted low-saturation documentary palette, firmer tonal gradation, deep shadows, cool cyan-leaning skies, subdued reds and olive-toned greens.',
  },
  {
    presetKey: 'classic_neg',
    profileId: 'Profile_06_ClassicNeg',
    cubeFile: 'fuji_classic_neg.cube',
    prototypeName: 'Fujifilm Classic Neg. (Street Color Negative)',
    characteristics:
      'Harder contrast, dark teal-green shadow cast, slightly warm/magenta highlights, and enriched warm skin saturation.',
  },
  {
    presetKey: 'velvet_slide',
    profileId: 'Profile_07_VelvetSlide',
    cubeFile: 'fuji_velvia.cube',
    prototypeName: 'Fujifilm Velvia (High-Saturation Reversal Slide)',
    characteristics:
      'High saturation and contrast, deep blue skies, vivid emerald foliage, and punchy reds.',
  },
  {
    presetKey: 'warm_astia',
    profileId: 'Profile_08_WarmAstia',
    cubeFile: 'fuji_astia.cube',
    prototypeName: 'Fujifilm Astia (Soft Portrait Reversal Slide)',
    characteristics:
      'Soft contrast, smooth gradation, restrained saturation, and luminous skin highlights.',
  },
  {
    presetKey: 'nostalgic_neg',
    profileId: 'Profile_09_NostalgicNeg',
    cubeFile: 'fuji_nostalgic_neg.cube',
    prototypeName: 'Fujifilm Nostalgic Neg. (Amber Tonality Negative)',
    characteristics:
      'Warm amber highlight glow, rich warm midtones, and soft lifted shadows.',
  },
  {
    presetKey: 'platinum_acros',
    profileId: 'Profile_10_PlatinumAcros',
    cubeFile: 'fuji_acros.cube',
    prototypeName: 'Fujifilm Neopan Acros 100 (Ultra-Fine Silver B&W)',
    characteristics:
      'Monochrome with smooth midtone gradation, deep clean blacks, and fine micro-contrast texture.',
  },
];

/**
 * 產生完整可選 LUT 清單（供 `auto` 自動配對模式放入 Prompt）
 */
export function buildLutManifestPrompt(): string {
  return LUT_DIRECTIVE_ENTRIES.map((e) => {
    const cubeInfo = e.cubeFile ? `${e.prototypeName} [${e.cubeFile}]` : e.prototypeName;
    return `- "${e.profileId}" (${cubeInfo}): ${e.characteristics}`;
  }).join('\n');
}

/**
 * 根據使用者選擇的 `stylePreset`、關鍵字按鈕 (`styleKeywords`) 與自訂文字 (`customStylePrompt`) 產生對應的風格背景資訊與調色指令
 */
export function buildStyleInstructionBlock(
  preset?: StylePresetKey,
  styleKeywords?: StyleKeywordId[],
  customStylePrompt?: string
): {
  instructionBlock: string;
  recommendedProfileSchemaHint: string;
} {
  let baseBlock = '';
  let recommendedProfileSchemaHint = 'string (One ID from Available 3D LUT Profiles)';

  if (!preset || preset === 'auto') {
    const manifest = buildLutManifestPrompt();
    baseBlock = `Available 3D LUT Profiles:
${manifest}`;
    recommendedProfileSchemaHint =
      'string (One ID from Available 3D LUT Profiles above)';
  } else {
    const entry = LUT_DIRECTIVE_ENTRIES.find((e) => e.presetKey === preset);
    if (!entry) {
      const manifest = buildLutManifestPrompt();
      baseBlock = `Available 3D LUT Profiles:\n${manifest}`;
      recommendedProfileSchemaHint = 'string (One ID from Available 3D LUT Profiles)';
    } else {
      const cubeTag = entry.cubeFile ? ` (${entry.cubeFile})` : '';
      baseBlock = `Selected 3D LUT Profile:
- "${entry.profileId}" — ${entry.prototypeName}${cubeTag}: ${entry.characteristics}`;
      recommendedProfileSchemaHint = `"${entry.profileId}"`;
    }
  }

  const keywordLines: string[] = [];
  if (Array.isArray(styleKeywords) && styleKeywords.length > 0) {
    for (const kwId of styleKeywords) {
      const found = STYLE_KEYWORD_ENTRIES.find((k) => k.id === kwId);
      if (found) {
        keywordLines.push(`- [${found.shortTag}]: ${found.promptDirective}`);
      }
    }
  }

  const trimmedCustom = customStylePrompt?.trim() || '';
  if (trimmedCustom) {
    keywordLines.push(`- [User Custom Vibe]: ${trimmedCustom}`);
  }

  if (keywordLines.length > 0) {
    baseBlock += `\n\nUser Requested Color Grading Vibe & Aesthetic Directives (Prioritize these aesthetics when tuning exposure_compensation, contrast, color_temp, tint, lift_shadows, clarity, sharpness, and recommended_profile):\n${keywordLines.join('\n')}`;
  }

  baseBlock += `\n\nWebGL 2.0 Shader Pipeline & Parameter Orthogonality Specification (Exact Mathematical Behavior on Canvas):
Pixels pass sequentially through these 5 hardware shader stages:
1. [Stage 1: exposure_compensation] (-2.0 to +2.0 EV): Multiplies RGB by pow(2.0, EV). Controls global brightness before all other stages.
2. [Stage 1.5: lift_shadows] (-0.5 to +0.5): Non-linear shadow toe curve \`(1 - color)^2 * lift * 0.45\`. ONLY affects the darkest 40% luminance while keeping highlights untouched. Positive values create matte faded film blacks; negative values deepen black point.
3. [Stage 2: color_temp & tint] (Pre-LUT White Balance): Baseline is 5500K / 0.0 Tint. >5500K shifts warm (+R/-B, amber/gold), <5500K shifts cool (-R/+B, cyan/blue). Tint > 0 shifts Magenta (+R/+B/-G), Tint < 0 shifts Green (+G/-R/-B). Applied BEFORE the 3D LUT so it drives the LUT's color response organically.
4. [Stage 3: recommended_profile & lut_intensity] (0.0 to 1.0): Trilinear 3D .cube volumetric mapping. Note that film emulation LUTs (e.g. ClassicNeg, VelvetSlide, HighContrastMono, DocumentaryChrome) inherently incorporate non-linear S-curve tonal compression (typically expanding mid-tone separation while rolling off shadows and highlights). Account for this profile curve when evaluating additional contrast or lift_shadows.
5. [Stage 4: contrast] (-0.5 to +0.5) vs [Stage 5: clarity & sharpness] (-1.0 to +1.0):
   - \`contrast\` is a global linear pivot around 0.4 luminance: \`(color - 0.4) * (1 + contrast * 0.5) + 0.4\`. Freely exercise the full range (-0.5 to +0.5) to sculpt the exact visual punch and dynamic tension that suits the capture.
   - \`clarity\` is a coarse-radius (8px) mid-tone unsharp mask protected by a mid-tone mask \`1 - (2*luma - 1)^2\`. Positive values add local mid-tone punch; negative values create dreamy halation / lens bloom without flattening global black/white points.
   - \`sharpness\` is a fine-radius (1.5px) edge unsharp mask. Positive sharpens fine grain/edges; negative softens optical edges.
   - CREATIVE AUTONOMY: You have unrestricted creative liberty across the entire parameter space. Use \`lift_shadows\` when you want independent matte film shadow roll-off, and freely push \`contrast\`, \`exposure_compensation\`, and white balance as boldly as your artistic vision demands.`;

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
  const keywordLines: string[] = [];
  if (Array.isArray(styleKeywords) && styleKeywords.length > 0) {
    for (const kwId of styleKeywords) {
      const found = STYLE_KEYWORD_ENTRIES.find((k) => k.id === kwId);
      if (found) {
        keywordLines.push(`- [Target Aesthetic ${found.shortTag}]: ${found.promptDirective}`);
      }
    }
  }
  const trimmedCustom = customStylePrompt?.trim() || '';
  if (trimmedCustom) {
    keywordLines.push(`- [Target User Vibe]: ${trimmedCustom}`);
  }

  let criticPrompt = `You are an elite darkroom quality-control colorist and technical critic.
You are inspecting TWO images:
1. IMAGE 1: The original unedited capture.
2. IMAGE 2: The rendered draft result produced after applying Pass 1 tone & 3D LUT profile parameters (Profile: "${firstPassProfile}").

${baselineParamsBlock}YOUR MISSION & GUIDELINES:
- Baseline Film Aesthetic: The designated 3D film profile is "${firstPassProfile}". Maintain and respect this baseline film aesthetic.
- Since you have Image 2 (rendered actual result) as concrete ground truth, supply the necessary Delta adjustments to harmonize exposure, dynamic range, and tonal balance toward the intended aesthetic.
- Inspect and fine-tune the following parameters (Respecting the hardware shader boundaries):
  1. EXPOSURE & HIGHLIGHT HARMONY (exposure_delta, valid range: -2.0 to +2.0 EV):
     - Evaluate overall luminance and highlight roll-off relative to the intended aesthetic.
     - If highlights exceed the desired roll-off or background detail is lost, provide a negative delta within [-2.0, 0.0] EV to gracefully restore highlight texture and dynamic range.
     - If the draft is darker than intended, supply an appropriate positive delta within [0.0, +2.0] EV.
  2. SHADOW DEPTH & TOE GRADATION (lift_shadows_delta, valid range: -0.5 to +0.5):
     - If blacks benefit from deeper, crisper punch, supply a negative delta within [-0.5, 0.0].
     - If shadow areas require gentle opening or a softer matte film aesthetic is desired, provide a positive delta within [0.0, +0.5].
  3. TONAL CONTRAST & DYNAMICS (contrast_delta, valid range: -0.5 to +0.5):
     - If contrast transition is too steep for the target vibe, provide a negative delta within [-0.5, 0.0] for smoother, gentler roll-off.
     - If the image benefits from greater tonal separation and visual energy, provide a positive delta within [0.0, +0.5].
  4. COLOR TEMPERATURE & AMBIENT HARMONY (color_temp_delta, valid range: -3000 to +3000 Kelvin):
     - Supply the necessary Kelvin adjustment within [-3000, +3000] K to harmonize ambient scene lighting with the selected film profile and aesthetic targets.
  5. 3D LUT INTENSITY (lut_intensity_delta, optional, valid range: -1.0 to +1.0):
     - Modulate the 3D LUT's volumetric influence within [-1.0, +1.0] if a more subtle or distinct profile presence is desired.

${keywordLines.length > 0 ? `Aesthetic Targets for Verification:\n${keywordLines.join('\n')}\n` : ''}
Respond ONLY with raw JSON matching this schema:
{
  "exposure_delta": "number between -2.0 and +2.0 (EV adjustment, 0.0 if optimal)",
  "lift_shadows_delta": "number between -0.5 and +0.5 (toe lift adjustment, 0.0 if optimal)",
  "color_temp_delta": "integer between -3000 and +3000 (Kelvin adjustment, 0 if accurate)",
  "contrast_delta": "number between -0.5 and +0.5 (contrast adjustment, 0.0 if balanced)",
  "lut_intensity_delta": "number between -1.0 and +1.0 (optional LUT intensity adjustment, 0.0 if optimal)",
  "refine_rationale": "string (1 concise sentence in Traditional Chinese summarizing the tonal/color refinements and aesthetic rationale)"
}`;

  return criticPrompt;
}
