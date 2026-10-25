/**
 * De-identified 3D LUT Profile Specifications
 * Strictly free of commercial brand trademarks.
 */

export interface LutProfile {
  id: string;
  code: string;
  title: string;
  englishTitle: string;
  toneDescription: string;
  technicalCharacteristics: string;
  cubeFilePath: string;
  lutSize: number; // e.g., 33
  defaultTuning: {
    exposure: number;
    shadowLift: number;
    lutIntensity: number;
  };
}

export const BUILTIN_PROFILES: LutProfile[] = [
  {
    id: 'Profile_00_StandardNatural',
    code: 'NATURAL_00',
    title: '原色自然直出',
    englishTitle: 'Standard Natural',
    toneDescription: '零風格偏調、純淨光學原色、保留相機原始寬容度',
    technicalCharacteristics: 'Zero color grade + linear dynamic range + pure sensor color',
    cubeFilePath: '',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.0,
      shadowLift: 0.0,
      lutIntensity: 1.0
    }
  },
  {
    id: 'Profile_01_MatteShadow',
    code: 'FILM_LOOK_01',
    title: '啞光微膠卷',
    englishTitle: 'Matte Shadow Film',
    toneDescription: '低黑階抬升、低飽和綠色調、柔和高反差',
    technicalCharacteristics: 'Lifted black pedestal + muted foliage greens + cinema curve',
    cubeFilePath: '/luts/profile_01_matte_shadow.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.1,
      shadowLift: 0.25,
      lutIntensity: 0.85
    }
  },
  {
    id: 'Profile_02_TealEmerald',
    code: 'COLOR_GRADE_02',
    title: '冷青翡翠',
    englishTitle: 'Teal Emerald',
    toneDescription: '陰影注入藍青色、高光溫潤偏暖金、膚色隔離保護',
    technicalCharacteristics: 'Subtle split tone + cool shadows + preserved skin luminance',
    cubeFilePath: '/luts/profile_02_teal_emerald.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: -0.1,
      shadowLift: 0.15,
      lutIntensity: 0.90
    }
  },
  {
    id: 'Profile_03_TungstenSoft',
    code: 'PORTRAIT_03',
    title: '溫潤人像',
    englishTitle: 'Tungsten Soft Portrait',
    toneDescription: '鎢絲燈暖調、洋紅微量相移、高光柔和過渡滾降',
    technicalCharacteristics: 'Warm highlights + gentle highlight roll-off + magenta skin tint',
    cubeFilePath: '/luts/profile_03_tungsten_soft.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.2,
      shadowLift: 0.30,
      lutIntensity: 0.80
    }
  },
  {
    id: 'Profile_04_HighContrastMono',
    code: 'MONO_SILVER_04',
    title: '高反差單色紀實',
    englishTitle: 'High Contrast Monochrome',
    toneDescription: '紅橙濾鏡感、暗部深邃沉穩、經典銀鹽紀實反差',
    technicalCharacteristics: 'Panchromatic red filter emulation + deep blacks + fine grain matrix',
    cubeFilePath: '/luts/profile_04_high_contrast_mono.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.0,
      shadowLift: -0.10,
      lutIntensity: 1.0
    }
  },
  {
    id: 'Profile_05_DocumentaryChrome',
    code: 'CHROME_DOC_05',
    title: '典藏冷印紀實',
    englishTitle: 'Documentary Chrome Print',
    toneDescription: '收斂三原色飽和度、暗部深邃硬調、高光平緩滾降、深邃冷調紀實感',
    technicalCharacteristics: 'Desaturated chroma + punchy mid-contrast + deep blacks + cyan-cast sky',
    cubeFilePath: '/luts/profile_05_documentary_chrome.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.0,
      shadowLift: -0.05,
      lutIntensity: 0.90
    }
  }
];
