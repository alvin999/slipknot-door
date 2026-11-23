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

import type {
  StylePresetKey,
  StyleKeywordId,
} from './types';
import {
  HSL_BAND_KEYS,
  type HslBandKey,
  type HslBandAdjustment,
} from '../../types/photo';
import type { CustomLutRecord } from '../customLutService';

export interface StyleKeywordEntry {
  id: StyleKeywordId;
  label: string;
  shortTag: string;
  tooltip: string;
  promptEnglish: string;
  isCustom?: boolean;
  isModified?: boolean;
  hidden?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 調色意境關鍵字預設集 (Vibe / Style Keywords for Prompt Injection)
 * 僅提供精煉的風格關鍵字給 AI 作為美學意向開關，不強加多餘的參數微調指令
 */
export const STYLE_KEYWORD_ENTRIES: StyleKeywordEntry[] = [
  {
    id: 'film_like',
    label: 'Film Like (Analog Film Aesthetic / 底片感)',
    shortTag: 'Film Like',
    tooltip: '有機高光滾降、暗部微抬啞光黑、柔和暈光與溫潤底片色調',
    promptEnglish: 'Film Like',
  },
  {
    id: 'lomo',
    label: 'LOMO (Lomography Toy Camera / LOMO 風)',
    shortTag: 'LOMO 風',
    tooltip: '玩具相機負沖感、鮮明高反差、大膽色偏與邊緣微柔化',
    promptEnglish: 'LOMO',
  },
  {
    id: 'airy_jp',
    label: 'Japanese Airy Style (日系空氣感)',
    shortTag: '日系空氣感',
    tooltip: '明亮微過曝、低反差、抬升暗部、清透偏冷青日光感',
    promptEnglish: 'Japanese Airy Style',
  },
  {
    id: 'cinematic',
    label: 'Cinematic Color Grade (電影感)',
    shortTag: '電影感',
    tooltip: '戲劇張力光比、冷暖色溫分離、深邃中間調立體感',
    promptEnglish: 'Cinematic',
  },
  {
    id: 'faded_vintage',
    label: 'Faded Vintage Print (復古褪色)',
    shortTag: '復古褪色',
    tooltip: '歲月泛黃暖調、強烈啞光抬黑、低反差懷舊老照片',
    promptEnglish: 'Faded Vintage',
  },
  {
    id: 'neon_wkw',
    label: 'Wong Kar-wai Hong Kong Neon (王家衛 · 霓虹夜色)',
    shortTag: '霓虹王家衛',
    tooltip: '90年代港片氛圍、濃烈鎢絲綠或琥珀洋紅偏移、迷離柔焦感',
    promptEnglish: 'Wong Kar-wai Hong Kong Neon',
  },
  {
    id: 'gritty_mono',
    label: 'Daido Moriyama Gritty Monochrome (森山大道 · 粗粒子硬調)',
    shortTag: '粗粒子硬調',
    tooltip: '極致高反差黑白街拍、深沉黑階、強烈邊緣微反差與清晰度',
    promptEnglish: 'Daido Moriyama Gritty Monochrome',
  },
];

/**
 * 依據選取的風格關鍵字清單，自動組合專業英文光學指令
 */
export function composeStyleKeywordPrompt(
  ids: StyleKeywordId[],
  entries: StyleKeywordEntry[] = STYLE_KEYWORD_ENTRIES
): string {
  if (!Array.isArray(ids) || ids.length === 0) return '';
  const parts: string[] = [];
  for (const id of ids) {
    const entry = entries.find((k) => k.id === id);
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
 * 依據 stylePreset 與使用者自訂 LUT 清單，解析是否已鎖定特定 3D LUT Profile ID
 * （非 'auto' 且存在對應內建或自訂 LUT 時回傳該 profileId，否則回傳 undefined）
 */
export function resolveLockedProfileId(
  preset?: StylePresetKey | string,
  customLuts?: CustomLutRecord[]
): string | undefined {
  if (!preset || preset === 'auto') return undefined;
  const entry = LUT_DIRECTIVE_ENTRIES.find((e) => e.presetKey === preset);
  if (entry) return entry.profileId;
  const customFound = customLuts?.find((c) => c.id === preset);
  return customFound?.id;
}

/**
 * 根據使用者選擇的 `stylePreset`、關鍵字按鈕 (`styleKeywords`)、自訂文字 (`customStylePrompt`) 與使用者自訂 LUT 清單產生對應的風格背景資訊與調色指令
 */
export function buildStyleInstructionBlock(
  preset?: StylePresetKey | string,
  styleKeywords?: StyleKeywordId[],
  customStylePrompt?: string,
  customLuts?: CustomLutRecord[],
  monochrome?: boolean
): {
  instructionBlock: string;
  recommendedProfileSchemaHint: string;
  isProfileLocked: boolean;
} {
  let baseBlock = '';
  let recommendedProfileSchemaHint = 'string (One ID from Available 3D LUT Profiles)';
  let isProfileLocked = false;

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
      baseBlock = `Selected 3D LUT Profile (Locked by User): "${entry.profileId}": ${entry.prototypeName}`;
      recommendedProfileSchemaHint = `"${entry.profileId}"`;
      isProfileLocked = true;
    } else {
      // 2. 檢查是否為使用者自訂的 LUT (例如 "custom_xxx")
      const customFound = customLuts?.find((c) => c.id === preset);
      if (customFound) {
        baseBlock = `Selected 3D LUT Profile (Locked by User): "${customFound.id}": [User Custom 3D LUT] ${customFound.name} (${customFound.directiveDescription})`;
        recommendedProfileSchemaHint = `"${customFound.id}"`;
        isProfileLocked = true;
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
  if (monochrome) {
    baseBlock += `\n\nMonochrome Output Mode: ACTIVE (User-selected B&W darkroom output). The 3D LUT tonal curve is preserved and converted to pure monochrome via 6-band spectral luminance weights BEFORE desaturation. In this mode: vibrance and color_density are bypassed; use hsl[band].lum (-1.0 to +1.0) as B&W optical color filter weights (e.g., negative blue/cyan.lum deepens skies, positive orange/red.lum brightens skin); keep shadow_tint_amount and highlight_tint_amount at 0.0 unless subtle darkroom split-toning (selenium/sepia) fits the intent; focus on tonal contrast, blacks, highlights, and silver grain.`;
  }
  baseBlock += `\n\nWebGL 2.0 Hardware Pipeline Specification:
1. exposure_compensation: Global luminance scaling before LUT.
2. lift_shadows: Shadow toe adjustment affecting darkest 40% luminance. Negative deepens blacks; positive lifts blacks.
3. color_temp & tint: Pre-LUT white balance (5500K / 0.0 baseline).
4. recommended_profile & lut_intensity: 3D film LUT volumetric emulation.
5. contrast: Global linear tonal slope.
6. clarity & sharpness [-1.0 to 1.0, Baseline: 0.0]: Spatial frequency unsharp masking (high-frequency detail control).
   - Baseline 0.0 preserves native optical lens MTF.
   - Negative values (< 0.0) soften edge steepness and micro-contrast.
   - Positive values (> 0.0) accentuate edge acutance and local micro-contrast.
7. composition & geometric framing (crop_box, rotation_deg, keystone_v):
   - Frame Boundary Consolidation vs. Environmental Negative Space:
     * When perimeter edges contain disruptive tangential cuts, visual clutter, or unbalanced dead space, consolidate crop boundaries inwards to anchor subject prominence and compositional harmony.
     * When wide contextual breathing room, atmospheric scale, or environmental context reinforces the aesthetic, preserve open framing or full frame [0.0, 0.0, 1.0, 1.0].
   - Horizon & Perspective Alignment:
     * Modulate rotation_deg and keystone_v to correct unintended optical lean or keystoning on architectural verticals and natural horizons, while respecting intentional dynamic angles.
8. color_density [-1.0 to 1.0, Baseline: 0.0]: Subtractive emulsion dye density applied post-LUT. Positive values increase chroma while proportionally deepening high-chroma luminance (emulating light absorption of analog dyes); negative values attenuate chroma density toward pastel tonality.
9. Split Toning (shadow_hue, shadow_tint_amount, highlight_hue, highlight_tint_amount): Post-LUT zone-separated chromatic bias preserving pure black and pure white anchors. Hue angles (0 to 360 deg): 0=Red, 45=Amber, 120=Green, 180=Cyan, 210=Teal-Blue, 240=Blue, 300=Magenta. Amounts range 0.0 to 1.0 (0.0 disables tint).
10. halation [0.0 to 1.0, Baseline: 0.0]: Red-orange specular scatter halo around high-luminance edges caused by emulsion base reflection before highlight shoulder roll-off.
11. grain_amount [0.0 to 1.0, Baseline: 0.15]: Luminance-weighted dual-scale silver-halide emulsion grain intensity.
12. highlights [-1.0 to 1.0, Baseline: 0.0]: Upper-luminance roll-off / compression. Negative recovers specular highlight headroom without compressing midtones; positive boosts peak highlight energy.
13. blacks [-0.5 to 0.5, Baseline: 0.0]: Lowest-luminance black-point anchor. Negative deepens true black floor density; positive creates a matte fade in darkest shadows.
14. vibrance [-1.0 to 1.0, Baseline: 0.0]: Skin-aware natural saturation scaling. Boosts muted hues proportionally while protecting warm skin tones and preventing over-saturated clipping.
15. vignette [-1.0 to 1.0, Baseline: 0.0]: Optical peripheral radial falloff. Negative applies natural lens edge darkening; positive brightens outer corners.
16. hsl (6-Band Targeted Color Mixer: "red" | "orange" | "yellow" | "green" | "cyan" | "blue"): Optional partial object where each specified band adjusts { hue: [-1.0, 1.0] (shifts ±30°), sat: [-1.0, 1.0], lum: [-1.0, 1.0] } centered at 0°, 30°, 60°, 120°, 185°, 240° with smooth inter-band blending and neutral-gray protection. Omit unadjusted bands or keep at 0.0.`;

  return {
    instructionBlock: baseBlock,
    recommendedProfileSchemaHint,
    isProfileLocked,
  };
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
 * 清理並解析 AI 回傳的 6 區段局部 HSL 調整物件，確保僅保留有效區段並箝制在合法物理邊界內
 */
export function parsePartialHslFromAi(
  raw: unknown,
  maxAbs: number = 1.0
): Partial<Record<HslBandKey, Partial<HslBandAdjustment>>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const out: Partial<Record<HslBandKey, Partial<HslBandAdjustment>>> = {};
  let hasAny = false;
  const clampVal = (v: unknown): number | undefined => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    return Math.max(-maxAbs, Math.min(maxAbs, v));
  };
  for (const band of HSL_BAND_KEYS) {
    const entry = src[band];
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const hue = clampVal(obj.hue);
    const sat = clampVal(obj.sat);
    const lum = clampVal(obj.lum);
    if (hue !== undefined || sat !== undefined || lum !== undefined) {
      out[band] = {
        ...(hue !== undefined ? { hue } : {}),
        ...(sat !== undefined ? { sat } : {}),
        ...(lum !== undefined ? { lum } : {}),
      };
      hasAny = true;
    }
  }
  return hasAny ? out : undefined;
}
