/**
 * 風格目標指令與 LUT 清單唯一真實來源 (Single Source of Truth for AI LUT Profiles & Directives)
 * 對齊 webglLutRenderer.ts 實際載入的 .cube 檔與 static/luts/README.md 對照表。
 * 僅客观描述各個 .cube 檔案的色彩科學特性，不干預或強制指定 AI 的具體參數調整方向。
 */

import type { StylePresetKey } from './types';

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
 * 根據使用者選擇的 `stylePreset` 產生對應的風格背景資訊（僅告知 AI 當前使用的 Profile 與其光學特性，不強制指示調色手法）
 */
export function buildStyleInstructionBlock(preset?: StylePresetKey): {
  instructionBlock: string;
  recommendedProfileSchemaHint: string;
} {
  if (!preset || preset === 'auto') {
    const manifest = buildLutManifestPrompt();
    return {
      instructionBlock: `Available 3D LUT Profiles:
${manifest}`,
      recommendedProfileSchemaHint:
        'string (One ID from Available 3D LUT Profiles above)',
    };
  }

  const entry = LUT_DIRECTIVE_ENTRIES.find((e) => e.presetKey === preset);
  if (!entry) {
    const manifest = buildLutManifestPrompt();
    return {
      instructionBlock: `Available 3D LUT Profiles:\n${manifest}`,
      recommendedProfileSchemaHint: 'string (One ID from Available 3D LUT Profiles)',
    };
  }

  const cubeTag = entry.cubeFile ? ` (${entry.cubeFile})` : '';
  return {
    instructionBlock: `Selected 3D LUT Profile:
- "${entry.profileId}" — ${entry.prototypeName}${cubeTag}: ${entry.characteristics}`,
    recommendedProfileSchemaHint: `"${entry.profileId}"`,
  };
}
