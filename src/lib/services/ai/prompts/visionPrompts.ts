/**
 * ═══════════════════════════════════════════════════════════════════
 * 【AI Prompt 中性化與客觀數據規範準則 (Prompt Neutrality Guidelines)】
 * 1. 保持客觀中立：不使用情緒化形容詞（如 punch, dreamy, extreme, harsh, poetic）。
 * 2. 避免固定數值區間：不提供預設數字範例或固定範圍，由模型依據畫面光學動態自主推算。
 * 3. 純物理控制通道：僅提供數據型別、物理邊界、方向定義與 EXIF 參數。
 * 4. 責任分離：Schema 作為標準型別規格，由前置風格意向引導調色，回歸模型預訓練常識。
 *
 * 【分階段中性 Prompt 構建原則 (Staged Neutral Prompt Builders)】
 * 1. 幾何空間與光學色彩完全解耦，防止 Attention 互相稀釋與直方圖因果倒置。
 * 2. 僅提供純物理邊界、型別規範與光學坐標系，不使用任何主觀情緒化修飾詞。
 * 3. 依據使用者指派之 AiScope 動態隱藏/關閉非目標通道，杜絕無謂漂移。
 * ═══════════════════════════════════════════════════════════════════
 */

import type {
  StylePresetKey,
  StyleKeywordId,
  VisionInferenceOptions,
  IterativeRefinementContext,
} from '../types';
import {
  HSL_BAND_KEYS,
  type ExifOpticalData,
  type AiScopePreferences,
} from '../../../types/photo';
import type { AiSceneDecision } from '../../aiSceneService';
import { getAiResponseLanguageInstruction, i18nStore } from '../../../i18n';
import { STYLE_KEYWORD_ENTRIES, buildStyleInstructionBlock } from '../styleDirectives';

/**
 * 根據當前 UI 語系取得人類可讀語言名稱
 */
function getLocaleLanguageLabel(): string {
  switch (i18nStore.locale) {
    case 'en':
      return 'English';
    case 'ja':
      return 'Japanese';
    case 'zh-TW':
    default:
      return 'Traditional Chinese';
  }
}

/**
 * 構建 Stage 1: 空間幾何與構圖分析之客觀中性 Prompt
 */
export function buildGeometryInstructionPrompt(
  exif: ExifOpticalData,
  lockAspectRatio = false
): string {
  const langName = getLocaleLanguageLabel();
  const aspectRule = lockAspectRatio
    ? `4. aspect_ratio: LOCKED to "original" by user preference. Preserve the original image aspect ratio in crop_box and always output "original".`
    : `4. aspect_ratio: Framing ratio ("original" | "1:1" | "4:5" | "16:9" | "9:16" | "free").`;

  const aspectSchema = lockAspectRatio
    ? `"aspect_ratio": "original",`
    : `"aspect_ratio": "original | 1:1 | 4:5 | 16:9 | 9:16 | free",`;

  return `You are an optical geometry and spatial composition analyzer.
Analyze this photographic image and optical EXIF (Lens/Focal: ${exif.focalLength || 'N/A'}, Aperture: ${exif.apertureValue || 'N/A'}).

Evaluate horizon alignment, architectural vertical perspective convergence, perimeter dead-space, and compositional balance.

Physical Geometric Channel Specifications:
1. crop_box: Normalized bounding box [ymin, xmin, ymax, xmax] within 0.0 to 1.0. Baseline uncropped full frame is [0.0, 0.0, 1.0, 1.0].
   - Consolidate boundaries inwards when frame edges contain disruptive tangential cuts or unbalanced dead space.
   - Maintain [0.0, 0.0, 1.0, 1.0] when contextual breathing room or environmental scale reinforces the subject.
2. rotation_deg: Roll axis tilt compensation in degrees (-45.0 to +45.0). 0.0 denotes perfectly level.
3. keystone_v: Vertical perspective convergence compensation (-45.0 to +45.0). 0.0 denotes parallel verticals.
${aspectRule}

Language Requirement: ${getAiResponseLanguageInstruction()}

Respond ONLY with raw JSON matching this schema:
{
  "crop_box": [ymin, xmin, ymax, xmax],
  "rotation_deg": number between -45.0 and +45.0,
  "keystone_v": number between -45.0 and +45.0,
  ${aspectSchema}
  "crop_rationale": "string (Concise technical rationale in ${langName}, or empty string if unchanged)"
}`;
}

/**
 * 構建 Stage 2: 物理測光、色彩分級與微反差之客觀中性 Prompt
 * 幾何視角已由前置階段或使用者手動固定，專注於物理動態範圍與色調曲線
 */
export function buildColorGradeInstructionPrompt(options: VisionInferenceOptions): string {
  const { exif, stylePreset, styleKeywords, customStylePrompt, customLuts, scope, monochrome } = options;

  const { instructionBlock, recommendedProfileSchemaHint, isProfileLocked } = buildStyleInstructionBlock(
    stylePreset,
    styleKeywords,
    customStylePrompt,
    customLuts,
    monochrome
  );

  // 根據 AiScope 偏好決定啟用的物理通道，若未傳入 scope 則預設全開
  const enableTone = !scope || scope.tone;
  const enableWb = !scope || scope.whiteBalance;
  const enableLutIntensity = !scope || scope.lutProfile;
  const enableProfileSelection = enableLutIntensity && !isProfileLocked;
  const enableColorMixer = !scope || scope.filmPhysics !== false;
  const enableSplitToning = !scope || (scope.splitToning !== undefined ? scope.splitToning : scope.filmPhysics !== false);
  const enableFilmTexture = !scope || (scope.filmTexture !== undefined ? scope.filmTexture : scope.filmPhysics !== false);

  const channels: string[] = [];
  if (enableTone) {
    channels.push('1. exposure_compensation: Global luminance scaling (-2.0 to +2.0 EV, baseline: 0.0). Negative decreases overall luminance; positive increases overall luminance.');
    channels.push('2. highlights [-1.0 to +1.0, baseline: 0.0]: Upper-luminance roll-off / recovery. Negative compresses bright highlight headroom; positive lifts peak highlights.');
    channels.push('3. contrast: Global linear tonal slope (-0.8 to +0.8).');
    channels.push('4. lift_shadows: Shadow toe adjustment (-0.5 to +0.5). Negative deepens blacks; positive lifts darkest 40% luminance.');
    channels.push('5. blacks [-0.5 to +0.5, baseline: 0.0]: Lowest-luminance black-point anchor. Negative deepens true blacks; positive creates a matte fade.');
    channels.push('6. clarity & sharpness [-1.0 to +1.0, baseline: 0.0]: Spatial frequency control. Baseline 0.0 preserves native lens MTF. Negative values (< 0.0) soften edge steepness and micro-contrast; positive values (> 0.0) accentuate edge acutance and local micro-contrast.');
  }
  if (enableWb) {
    channels.push('7. color_temp & tint: Pre-LUT white balance (color_temp: integer 2800 to 8500, 5500 baseline; tint: -100.0 to +100.0).');
  }
  if (enableProfileSelection) {
    channels.push('8. recommended_profile & lut_intensity: 3D film volumetric emulation (lut_intensity: 0.0 to 1.0).');
  } else if (enableLutIntensity) {
    channels.push('8. lut_intensity: 3D film LUT volumetric strength (0.0 to 1.0) for the user-locked 3D LUT profile.');
  }
  if (enableColorMixer) {
    channels.push('9. vibrance [-1.0 to +1.0, baseline: 0.0]: Post-LUT skin-aware natural saturation scaling. Modulates muted chromatic regions proportionally while protecting skin tones.');
    channels.push('10. color_density [-1.0 to +1.0, baseline: 0.0]: Post-LUT subtractive dye density. Positive values increase chroma while proportionally attenuating luminance of high-chroma regions (emulsion dye light absorption); negative values yield softer pastel tonality.');
    channels.push('11. hsl (optional partial 6-band color mixer): Adjust targeted hue (±30° normalized to -1.0..1.0), saturation (-1.0..1.0), and luminance (-1.0..1.0) per band ("red" | "orange" | "yellow" | "green" | "cyan" | "blue"). Omit bands that remain 0.0.');
  }
  if (enableSplitToning) {
    channels.push('12. shadow_hue & shadow_tint_amount (shadow_hue: 0 to 360 deg, shadow_tint_amount: 0.0 to 1.0): Post-LUT chromatic bias in mid-shadows with black-point anchor. Hue reference: 0=Red, 45=Amber, 120=Green, 180=Cyan, 210=Teal-Blue, 240=Blue, 300=Magenta.');
    channels.push('13. highlight_hue & highlight_tint_amount (highlight_hue: 0 to 360 deg, highlight_tint_amount: 0.0 to 1.0): Post-LUT chromatic bias in upper midtone highlights with white-point anchor. Uses the same 0-360 hue reference.');
  }
  if (enableFilmTexture) {
    channels.push('14. halation [0.0 to 1.0, baseline: 0.0]: Red-orange specular light scattering halo around high-luminance edges caused by emulsion base reflection.');
    channels.push('15. grain_amount [0.0 to 1.0, baseline: 0.15]: Luminance-weighted dual-scale organic silver-halide emulsion grain intensity.');
    channels.push('16. vignette [-1.0 to +1.0, baseline: 0.0]: Optical radial peripheral falloff. Negative darkens outer corners; positive brightens outer corners.');
  }

  const lutSchemaFields = enableProfileSelection
    ? `,\n  "recommended_profile": "${recommendedProfileSchemaHint}",\n  "lut_intensity": "number between 0.0 and 1.0"`
    : enableLutIntensity
      ? `,\n  "lut_intensity": "number between 0.0 and 1.0"`
      : '';

  const langName = getLocaleLanguageLabel();

  return `You are a radiometric calibration and volumetric color grading specialist.
The geometric frame and perspective have already been stabilized. Analyze the optical luminance distribution and chromatic harmony of this image.
EXIF: ISO ${exif.iso || 'N/A'}, Shutter ${exif.shutterSpeed || 'N/A'}, Aperture ${exif.apertureValue || 'N/A'}, Focal ${exif.focalLength || 'N/A'}.

Note: The image is a 1024px preview proxy downscaled from high-resolution capture; native optical sharpness is optimal at baseline 0.0. Do not add clarity or sharpness to compensate for proxy resolution; evaluate strictly for intended artistic character.

${instructionBlock}

Active Control Channels:
${channels.join('\n')}

Language Requirement: ${getAiResponseLanguageInstruction()}

Respond ONLY with raw JSON matching this schema:
{
  "scene_title": "string (concise title in ${langName})",
  "scene_type": "string (portrait | landscape | architecture | street | night | still_life | documentary | nature | indoor)",
  "style_insight": "string (1-2 sentences in ${langName})",
  "recommended_mood": "string (short mood label in ${langName})",
  "tags": ["string (3 to 6 tags in ${langName})"]${lutSchemaFields}${enableTone ? `,\n  "exposure_compensation": "number between -2.0 and +2.0",\n  "highlights": "number between -1.0 and +1.0",\n  "contrast": "number between -0.8 and +0.8",\n  "lift_shadows": "number between -0.5 and +0.5",\n  "blacks": "number between -0.5 and +0.5",\n  "clarity": "number between -1.0 and +1.0",\n  "sharpness": "number between -1.0 and +1.0"` : ''}${enableWb ? `,\n  "color_temp": "integer between 2800 and 8500",\n  "tint": "number between -100.0 and +100.0"` : ''}${enableColorMixer ? `,\n  "vibrance": "number between -1.0 and +1.0",\n  "color_density": "number between -1.0 and +1.0",\n  "hsl": "optional partial object { red|orange|yellow|green|cyan|blue?: { hue?: number, sat?: number, lum?: number } } in [-1.0, +1.0]"` : ''}${enableSplitToning ? `,\n  "shadow_hue": "number between 0 and 360",\n  "shadow_tint_amount": "number between 0.0 and 1.0",\n  "highlight_hue": "number between 0 and 360",\n  "highlight_tint_amount": "number between 0.0 and 1.0"` : ''}${enableFilmTexture ? `,\n  "halation": "number between 0.0 and 1.0",\n  "grain_amount": "number between 0.0 and 1.0",\n  "vignette": "number between -1.0 and +1.0"` : ''}
}`;
}

/**
 * 構建影像視覺顯影分析 (全量單次向後相容模式) Prompt (analyzePhoto)
 */
export function buildAnalyzePhotoPrompt(options: VisionInferenceOptions): string {
  const { exif, stylePreset, styleKeywords, customStylePrompt, customLuts, monochrome } = options;
  const { instructionBlock, recommendedProfileSchemaHint } = buildStyleInstructionBlock(
    stylePreset,
    styleKeywords,
    customStylePrompt,
    customLuts,
    monochrome
  );
  const langName = getLocaleLanguageLabel();

  return `You are a master analog darkroom colorist and curatorial director.
Analyze this photographic image and optical EXIF (ISO: ${exif.iso || 'N/A'}, Shutter: ${exif.shutterSpeed || 'N/A'}, Aperture: ${exif.apertureValue || 'N/A'}, Lens/Focal: ${exif.focalLength || 'N/A'}).

Note: The image is a 1024px preview proxy downscaled from a high-resolution capture; native optical sharpness is optimal at baseline 0.0. Do not add clarity or sharpness to compensate for proxy resolution; evaluate strictly for artistic character.

Evaluate lighting dynamics, color harmony, optical texture, and visual composition.

${instructionBlock}

Language Requirement: ${getAiResponseLanguageInstruction()}

Respond ONLY with raw JSON matching this schema:
{
  "scene_title": "string (concise title in ${langName})",
  "scene_type": "string (portrait | landscape | architecture | street | night | still_life | documentary | nature | indoor)",
  "style_insight": "string (1-2 sentences in ${langName})",
  "recommended_mood": "string (short mood label in ${langName})",
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
  "tags": ["string (3 to 6 tags in ${langName})"],
  "crop_box": [ymin, xmin, ymax, xmax] (normalized bounding box [ymin, xmin, ymax, xmax] within 0.0 to 1.0; [0.0, 0.0, 1.0, 1.0] denotes uncropped full frame),
  "rotation_deg": "number between -45.0 and +45.0",
  "keystone_v": "number between -45.0 and +45.0",
  "aspect_ratio": "original | 1:1 | 4:5 | 16:9 | 9:16 | free",
  "crop_rationale": "string (explanation in ${langName}, or empty string if unchanged)"
}`;
}

/**
 * 建立雙圖閉環覆審 (Pass 2 Refinement / Critic) 之專用品控 Prompt 指令區塊
 * 嚴格鎖定 Pass 1 底片風格，專注於暗部浮黑 (Shadow Lift)、動態範圍與色彩中性殘差校正
 */
export function buildCriticInstructionBlock(
  firstPassInput: string | AiSceneDecision,
  stylePreset?: StylePresetKey,
  styleKeywords?: StyleKeywordId[],
  customStylePrompt?: string,
  monochrome?: boolean,
  scope?: AiScopePreferences,
  iterativeContext?: IterativeRefinementContext
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
    const colorDensity = firstPassInput.color_density ?? 0.0;
    const shadowHue = firstPassInput.shadow_hue ?? 200;
    const shadowTintAmount = firstPassInput.shadow_tint_amount ?? 0.0;
    const highlightHue = firstPassInput.highlight_hue ?? 40;
    const highlightTintAmount = firstPassInput.highlight_tint_amount ?? 0.0;
    const halation = firstPassInput.halation ?? 0.0;
    const grainAmount = firstPassInput.grain_amount ?? 0.15;
    const highlights = firstPassInput.highlights ?? 0.0;
    const blacks = firstPassInput.blacks ?? 0.0;
    const vibrance = firstPassInput.vibrance ?? 0.0;
    const vignette = firstPassInput.vignette ?? 0.0;
    const activeHslEntries = firstPassInput.hsl
      ? HSL_BAND_KEYS.filter((k) => {
        const b = firstPassInput.hsl?.[k];
        return b && (Math.abs(b.hue) > 0.01 || Math.abs(b.sat) > 0.01 || Math.abs(b.lum) > 0.01);
      }).map((k) => {
        const b = firstPassInput.hsl![k];
        return `${k}(H:${b.hue.toFixed(2)},S:${b.sat.toFixed(2)},L:${b.lum.toFixed(2)})`;
      })
      : [];

    baselineParamsBlock = `Current Pass 1 Baseline Parameters Applied on Image 2:
- 3D LUT Profile: "${firstPassProfile}" (Intensity: ${lutIntensity.toFixed(2)})
- Exposure Compensation: ${exp >= 0 ? '+' : ''}${exp.toFixed(2)} EV
- Highlights: ${highlights >= 0 ? '+' : ''}${highlights.toFixed(2)}, Contrast: ${contrast >= 0 ? '+' : ''}${contrast.toFixed(2)}, Lift Shadows: ${shadow >= 0 ? '+' : ''}${shadow.toFixed(2)}, Blacks: ${blacks >= 0 ? '+' : ''}${blacks.toFixed(2)}
- Color Temperature: ${temp}K (Tint: ${tint >= 0 ? '+' : ''}${tint.toFixed(1)})
- Clarity: ${clarity >= 0 ? '+' : ''}${clarity.toFixed(2)}, Sharpness: ${sharpness >= 0 ? '+' : ''}${sharpness.toFixed(2)}
- Vibrance: ${vibrance >= 0 ? '+' : ''}${vibrance.toFixed(2)}, Subtractive Color Density: ${colorDensity >= 0 ? '+' : ''}${colorDensity.toFixed(2)}
- Split Toning: Shadow ${Math.round(shadowHue)}° (Amt ${shadowTintAmount.toFixed(2)}) | Highlight ${Math.round(highlightHue)}° (Amt ${highlightTintAmount.toFixed(2)})
- Film Halation: ${halation.toFixed(2)}, Silver-Halide Grain: ${grainAmount.toFixed(2)}, Optical Vignette: ${vignette >= 0 ? '+' : ''}${vignette.toFixed(2)}${activeHslEntries.length > 0 ? `\n- Active 6-Band HSL: ${activeHslEntries.join(', ')}` : ''}\n\n`;
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
  const monochromeLine = monochrome
    ? `- Monochrome Output Mode: ACTIVE (User-selected B&W output). Image 2 is rendered in monochrome; keep vibrance_delta & color_density_delta at 0.0, use hsl_deltas[band].lum as B&W optical filter refinements, and preserve neutral grayscale unless subtle darkroom split-toning is intended.\n`
    : '';
  const enableLutIntensity = !scope || scope.lutProfile;
  const enableTone = !scope || scope.tone;
  const enableWb = !scope || scope.whiteBalance;
  const enableColorMixer = !scope || scope.filmPhysics !== false;
  const enableSplitToning = !scope || (scope.splitToning !== undefined ? scope.splitToning : scope.filmPhysics !== false);
  const enableFilmTexture = !scope || (scope.filmTexture !== undefined ? scope.filmTexture : scope.filmPhysics !== false);

  const lockedChannels: string[] = [];
  if (!enableTone) lockedChannels.push('tone/exposure/contrast/highlights/shadows/blacks/clarity/sharpness');
  if (!enableWb) lockedChannels.push('color_temp/tint');
  if (!enableLutIntensity) lockedChannels.push('lut_intensity');
  if (!enableColorMixer) lockedChannels.push('vibrance/color_density/hsl');
  if (!enableSplitToning) lockedChannels.push('shadow_tint_amount/highlight_tint_amount');
  if (!enableFilmTexture) lockedChannels.push('halation/grain_amount/vignette');
  const scopeLockLine = lockedChannels.length > 0
    ? `- User Scope Locks: Keep [${lockedChannels.join(', ')}] strictly unchanged (omit or set deltas to 0).\n`
    : '';

  let iterativeBlock = '';
  if (iterativeContext) {
    const roundLabel = iterativeContext.round ? ` (Iteration Round ${iterativeContext.round})` : '';
    const parts: string[] = [
      `- ITERATIVE CO-PILOT REFINEMENT MODE${roundLabel}: Image 2 already reflects the user's latest slider adjustments and/or previous iteration state. Evaluate Image 2 as the current visual ground truth.`,
    ];
    if (iterativeContext.userChangesSummary && iterativeContext.userChangesSummary.length > 0) {
      parts.push(`- User Manual Parameter Adjustments Applied on Image 2:\n  ${iterativeContext.userChangesSummary.join('\n  ')}`);
    }
    if (iterativeContext.lockedParamKeys && iterativeContext.lockedParamKeys.length > 0) {
      parts.push(`- User-Anchored Pinned Parameters (STRICTLY LOCKED): Keep [${iterativeContext.lockedParamKeys.join(', ')}] strictly unchanged (output 0 / 0.0 for their deltas). Harmonize the remaining unlocked channels around the user's pinned choices.`);
    }
    if (iterativeContext.userFeedbackPrompt && iterativeContext.userFeedbackPrompt.trim().length > 0) {
      parts.push(`- User Refinement Request (HIGHEST PRIORITY): "${iterativeContext.userFeedbackPrompt.trim()}". Fulfill this visual intent precisely via delta adjustments on unlocked channels while keeping the overall image balanced.`);
    } else if (iterativeContext.userChangesSummary && iterativeContext.userChangesSummary.length > 0) {
      parts.push(`- Co-Pilot Compensation Goal: The user adjusted specific parameters above; inspect Image 2 and compensate the remaining unlocked channels (e.g., highlights, lift_shadows, blacks, contrast, vibrance, color_density, split-toning, HSL) so the overall tonal balance, shadow detail, and color harmony remain cohesive.`);
    }
    iterativeBlock = `${parts.join('\n')}\n`;
  }

  const criticPrompt = `You are a darkroom quality-control colorist and technical critic.
You are inspecting TWO images:
1. IMAGE 1: The original unedited capture proxy (1024px downscaled preview).
2. IMAGE 2: The rendered draft result produced after applying Pass 1 tone & 3D LUT profile parameters (Profile: "${firstPassProfile}").
Note: Do not supply positive clarity/sharpness deltas to compensate for proxy resolution; evaluate strictly for intended artistic character.

${baselineParamsBlock}YOUR MISSION & GUIDELINES:
- Baseline Film Aesthetic: The designated 3D film profile is "${firstPassProfile}". Maintain and respect this baseline film aesthetic.
${aestheticLine}${monochromeLine}${scopeLockLine}${iterativeBlock}- Since you have Image 2 (rendered actual result) as concrete ground truth, supply the necessary Delta adjustments to harmonize exposure, dynamic range, and tonal balance toward the intended aesthetic.
- Inspect and fine-tune the following parameters (Respecting the hardware shader boundaries):
  1. EXPOSURE & HIGHLIGHT HARMONY (exposure_delta, valid range: -2.0 to 2.0 EV):
     - Evaluate overall luminance and highlight roll-off relative to the target aesthetic.
     - Supply a negative delta within [-2.0, 0.0] EV if highlights clip or lose roll-off gradation.
     - Supply a positive delta within [0.0, 2.0] EV if overall exposure requires higher luminance.
  2. SHADOW DEPTH & TOE GRADATION (lift_shadows_delta, valid range: -0.5 to 0.5):
     - If blacks require deeper density, supply a negative delta within [-0.5, 0.0].
     - If shadow areas require lifting or a matte shadow floor is desired, provide a positive delta within [0.0, 0.5].
  3. TONAL CONTRAST & DYNAMICS (contrast_delta, valid range: -0.8 to 0.8):
     - If contrast transition is too steep for the target aesthetic, provide a negative delta within [-0.8, 0.0] for flatter tonal gradation.
     - If the image benefits from greater tonal separation, provide a positive delta within [0.0, 0.8].
  4. COLOR TEMPERATURE & AMBIENT HARMONY (color_temp_delta, valid range: -3000 to 3000 Kelvin; tint_delta, optional, valid range: -100.0 to 100.0):
     - Supply the necessary Kelvin adjustment within [-3000, 3000] K to harmonize ambient scene lighting with the selected film profile and aesthetic targets.
     - Supply a tint delta within [-100.0, 100.0] to adjust the green-magenta balance relative to the target aesthetic.
  5. 3D LUT INTENSITY (${enableLutIntensity ? 'lut_intensity_delta, optional, valid range: -1.0 to 1.0' : 'LOCKED by user preference'}):
     - ${enableLutIntensity
       ? "Modulate the 3D LUT's volumetric influence within [-1.0, 1.0] if a more subtle or distinct profile presence is desired."
       : 'User froze LUT intensity; keep LUT intensity untouched and do NOT emit lut_intensity_delta.'}
  6. OPTICAL TEXTURE & ACUTANCE (clarity_delta & sharpness_delta, optional, valid range: -0.5 to 0.5):
     - Supply a negative delta within [-0.5, 0.0] to soften micro-contrast or edge steepness relative to target character.
     - Supply a positive delta within [0.0, 0.5] when stronger micro-contrast or fine detail accentuation is warranted.
  7. SUBTRACTIVE COLOR DENSITY & SPLIT TONING DELTAS (optional):
     - color_density_delta (-0.5 to 0.5): Modulate subtractive dye absorption density relative to the target aesthetic.
     - shadow_tint_amount_delta (-0.5 to 0.5) & highlight_tint_amount_delta (-0.5 to 0.5): Attenuate or reinforce zone-separated tint intensity while preserving Pass 1 hue character.
  8. EMULSION HALATION & GRAIN DELTAS (optional):
     - halation_delta (-0.5 to 0.5): Adjust red-orange highlight edge scattering relative to the target emulsion character.
     - grain_amount_delta (-0.5 to 0.5): Adjust silver-halide grain amplitude relative to target emulsion character.
  9. HIGHLIGHTS, BLACKS, VIBRANCE, VIGNETTE & 6-BAND HSL DELTAS (optional):
     - highlights_delta (-0.5 to 0.5): Negative compresses bright highlight headroom; positive lifts peak highlight luminance.
     - blacks_delta (-0.5 to 0.5): Negative anchors deeper blacks; positive softens black floor into matte tones.
     - vibrance_delta (-0.5 to 0.5): Adjust natural skin-aware chromatic richness.
     - vignette_delta (-0.5 to 0.5): Negative deepens peripheral lens falloff; positive lifts outer frame corners.
     - hsl_deltas (optional partial object): Keys among "red" | "orange" | "yellow" | "green" | "cyan" | "blue", each { hue, sat, lum } in [-0.5, 0.5], to selectively adjust individual color bands relative to the target aesthetic. Omit bands needing no change.

Language Requirement: ${getAiResponseLanguageInstruction()}

Respond ONLY with raw JSON matching this schema:
{
  "exposure_delta": "number between -2.0 and 2.0 (EV adjustment, 0.0 if optimal)",
  "highlights_delta": "number between -0.5 and 0.5 (optional highlight headroom adjustment, 0.0 if optimal)",
  "lift_shadows_delta": "number between -0.5 and 0.5 (toe lift adjustment, 0.0 if optimal)",
  "blacks_delta": "number between -0.5 and 0.5 (optional black point anchor adjustment, 0.0 if optimal)",
  "color_temp_delta": "integer between -3000 and 3000 (Kelvin adjustment, 0 if accurate)",
  "tint_delta": "number between -100.0 and 100.0 (optional tint adjustment, 0.0 if balanced)",
  "contrast_delta": "number between -0.8 and 0.8 (contrast adjustment, 0.0 if balanced)",${enableLutIntensity ? '\n  "lut_intensity_delta": "number between -1.0 and 1.0 (optional LUT intensity adjustment, 0.0 if optimal)",' : ''}
  "clarity_delta": "number between -0.5 and 0.5 (optional clarity adjustment, 0.0 if optimal)",
  "sharpness_delta": "number between -0.5 and 0.5 (optional sharpness adjustment, 0.0 if optimal)",
  "vibrance_delta": "number between -0.5 and 0.5 (optional skin-aware vibrance adjustment, 0.0 if optimal)",
  "color_density_delta": "number between -0.5 and 0.5 (optional subtractive density adjustment, 0.0 if optimal)",
  "shadow_tint_amount_delta": "number between -0.5 and 0.5 (optional shadow split-tone amount adjustment, 0.0 if optimal)",
  "highlight_tint_amount_delta": "number between -0.5 and 0.5 (optional highlight split-tone amount adjustment, 0.0 if optimal)",
  "halation_delta": "number between -0.5 and 0.5 (optional halation scattering adjustment, 0.0 if optimal)",
  "grain_amount_delta": "number between -0.5 and 0.5 (optional grain intensity adjustment, 0.0 if optimal)",
  "vignette_delta": "number between -0.5 and 0.5 (optional optical vignette adjustment, 0.0 if optimal)",
  "hsl_deltas": "optional object { red|orange|yellow|green|cyan|blue?: { hue?: number, sat?: number, lum?: number } } in [-0.5, 0.5]",
  "refine_rationale": "string (1 concise sentence in ${getLocaleLanguageLabel()} summarizing the tonal/color refinements and aesthetic rationale)"
}`;

  return criticPrompt;
}
