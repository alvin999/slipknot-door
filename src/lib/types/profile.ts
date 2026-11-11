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
    id: 'Profile_01_Fieldnote',
    code: 'FIELD_01',
    title: '日常微負片',
    englishTitle: 'Fieldnote Daily Negative',
    toneDescription: '中性 C-41 街拍日常、長階調長 Toe、板岩青暗部與稻草金高光',
    technicalCharacteristics: 'Neutral C-41 negative + long toe + restrained saturation + slate shadows',
    cubeFilePath: '/luts/Fieldnote.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.0,
      shadowLift: 0.10,
      lutIntensity: 0.90
    }
  },
  {
    id: 'Profile_02_Heartland',
    code: 'HEART_02',
    title: '溫潤人像負片',
    englishTitle: 'Heartland Warm Portrait',
    toneDescription: '專為健康膚色與室內暖燈調校、溫潤通透、暗部不泛紅',
    technicalCharacteristics: 'Warm portrait negative + delicate skin tone protection + organic shadow roll-off',
    cubeFilePath: '/luts/Heartland.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.05,
      shadowLift: 0.08,
      lutIntensity: 0.85
    }
  },
  {
    id: 'Profile_03_Meridian',
    code: 'MERIDIAN_03',
    title: '澄澈天光紀實',
    englishTitle: 'Meridian Honest Daylight',
    toneDescription: '中性灰軸零漂移、純淨日光色彩、通透自然真實感',
    technicalCharacteristics: 'Measured-neutral gray axis + zero drift + pristine daylight clarity',
    cubeFilePath: '/luts/Meridian.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.0,
      shadowLift: 0.0,
      lutIntensity: 1.0
    }
  },
  {
    id: 'Profile_04_Matinee',
    code: 'MATINEE_04',
    title: '放映電影拷貝',
    englishTitle: 'Matinee Cinema Density',
    toneDescription: '深沉具階調的黑位、內斂細膩色彩、強烈故事感光影',
    technicalCharacteristics: 'Cinema print density + deep readable blacks + restrained emotional palette',
    cubeFilePath: '/luts/Matinee.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.0,
      shadowLift: -0.05,
      lutIntensity: 0.85
    }
  },
  {
    id: 'Profile_05_Postcard',
    code: 'POSTCARD_05',
    title: '明信片正片純色',
    englishTitle: 'Postcard Reversal Slide',
    toneDescription: '色彩純度提純而非暴力拉飽和、細膩微密度、生動明媚感',
    technicalCharacteristics: 'Slide film hue purification + micro-density + clean vivid colors',
    cubeFilePath: '/luts/Postcard.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.0,
      shadowLift: 0.0,
      lutIntensity: 0.85
    }
  },
  {
    id: 'Profile_06_Skylight',
    code: 'SKYLIGHT_06',
    title: '天光重組高動態',
    englishTitle: 'Skylight Dynamic Tone',
    toneDescription: '開放暗部與壓縮高光、平衡大光比逆光、通透立體質感',
    technicalCharacteristics: 'Light-ratio restructure + open shadows + compressed highlights + crisp palette',
    cubeFilePath: '/luts/Skylight.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.0,
      shadowLift: 0.15,
      lutIntensity: 0.90
    }
  },
  {
    id: 'Profile_07_NightMarket',
    code: 'NIGHT_07',
    title: '夜市微光金芒',
    englishTitle: 'NightMarket Anti-Posterize',
    toneDescription: '夜間混光調校、鎢絲與鈉燈轉為純淨琥珀金、防止 LED 斷階',
    technicalCharacteristics: 'Mixed-light night tuning + tungsten/sodium to gold + LED anti-posterization',
    cubeFilePath: '/luts/NightMarket.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.05,
      shadowLift: 0.05,
      lutIntensity: 0.85
    }
  },
  {
    id: 'Profile_08_DuskTide',
    code: 'DUSK_08',
    title: '暮光藍調冷暖',
    englishTitle: 'DuskTide Blue Hour',
    toneDescription: '黃昏藍調時刻、深青靛藍暗部與暖金燈火冷暖交融',
    technicalCharacteristics: 'Blue-hour look + indigo shadows vs golden lamp glow + cinematic contrast',
    cubeFilePath: '/luts/DuskTide.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.0,
      shadowLift: 0.0,
      lutIntensity: 0.85
    }
  },
  {
    id: 'Profile_09_Canopy',
    code: 'CANOPY_09',
    title: '森綠層次透光',
    englishTitle: 'Canopy Foliage Lightness',
    toneDescription: '綠色亮度分階、陰翳青綠與透光黃綠分離、告別死灰綠意',
    technicalCharacteristics: 'Tropical foliage lightness hierarchy + shaded cyan-greens vs sunlit yellow-greens',
    cubeFilePath: '/luts/Canopy.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.0,
      shadowLift: 0.05,
      lutIntensity: 0.85
    }
  },
  {
    id: 'Profile_10_Lowsun',
    code: 'LOWSUN_10',
    title: '金暉斜陽逆光',
    englishTitle: 'Lowsun Golden Hour',
    toneDescription: '金琥珀高光與冷調陰影、強烈逆光立體感、黃昏魔幻光影',
    technicalCharacteristics: 'Golden hour look + golden-amber highlights vs cool blue shadows',
    cubeFilePath: '/luts/Lowsun.cube',
    lutSize: 33,
    defaultTuning: {
      exposure: 0.0,
      shadowLift: 0.0,
      lutIntensity: 0.85
    }
  }
];

import type { StylePresetKey } from "$lib/services/ai/types";
import type { CustomLutRecord } from "$lib/services/customLutService";

export interface StyleGradingPresetItem {
  key: StylePresetKey;
  badge: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  accent: string;
  profileId?: string;
}

export interface ProfileCatalogItem {
  id: string;
  title: string;
  tone: string;
  badge: string;
  accent: string;
  evDefault: number;
  contrastDefault: number;
  highlightsDefault: number;
  shadowsDefault: number;
  fadeDefault: number;
  cyanSkyDefault: number;
  foliageDefault: number;
  lutIntensityDefault: number;
  clarityDefault: number;
  sharpnessDefault: number;
  recommendedScene: string;
  isCustom?: boolean;
  rawCustomLut?: CustomLutRecord;
}

export const BUILTIN_STYLE_GRADING_PRESETS: StyleGradingPresetItem[] = [
  {
    key: "auto",
    badge: "AUTO_MATCH",
    shortLabel: "AI 自動配對",
    title: "AI 智慧配對 · 自動推薦 LUT",
    subtitle: "由 AI 依場景光影從 10 款典藏中自動選配最佳風格檔",
    accent: "#e29d52",
  },
  {
    key: "standard",
    badge: "NATURAL_00",
    shortLabel: "Standard",
    title: "Standard · 原色自然直出",
    subtitle: "零風格偏調 · 純淨光學原色 · 保留真實寬容度",
    accent: "#8e929b",
    profileId: "Profile_00_StandardNatural",
  },
  {
    key: "fieldnote",
    badge: "FIELD_01",
    shortLabel: "Fieldnote",
    title: "Fieldnote · 日常微負片",
    subtitle: "中性 C-41 街拍日常 · 長階調長 Toe · 復古清透 (.cube)",
    accent: "#5c7c8a",
    profileId: "Profile_01_Fieldnote",
  },
  {
    key: "heartland",
    badge: "HEART_02",
    shortLabel: "Heartland",
    title: "Heartland · 溫潤人像負片",
    subtitle: "專為健康膚色與暖光調校 · 溫潤通透不泛紅 (.cube)",
    accent: "#c97a5d",
    profileId: "Profile_02_Heartland",
  },
  {
    key: "meridian",
    badge: "MERIDIAN_03",
    shortLabel: "Meridian",
    title: "Meridian · 澄澈天光紀實",
    subtitle: "中性灰軸零漂移 · 純淨日光色彩 · 通透自然 (.cube)",
    accent: "#4a8fa8",
    profileId: "Profile_03_Meridian",
  },
  {
    key: "matinee",
    badge: "MATINEE_04",
    shortLabel: "Matinee",
    title: "Matinee · 放映電影拷貝",
    subtitle: "深沉具階調的黑階 · 內斂細膩色彩 · 故事感光影 (.cube)",
    accent: "#3d404d",
    profileId: "Profile_04_Matinee",
  },
  {
    key: "postcard",
    badge: "POSTCARD_05",
    shortLabel: "Postcard",
    title: "Postcard · 明信片正片純色",
    subtitle: "正片色彩提純 · 細膩微密度 · 鮮明不俗艷 (.cube)",
    accent: "#cf5c42",
    profileId: "Profile_05_Postcard",
  },
  {
    key: "skylight",
    badge: "SKYLIGHT_06",
    shortLabel: "Skylight",
    title: "Skylight · 天光重組高動態",
    subtitle: "開放暗部與壓縮高光 · 平衡大光比逆光 · 通透立體 (.cube)",
    accent: "#4f9da6",
    profileId: "Profile_06_Skylight",
  },
  {
    key: "night_market",
    badge: "NIGHT_07",
    shortLabel: "NightMarket",
    title: "NightMarket · 夜市微光金芒",
    subtitle: "夜間混光調校 · 鎢絲與鈉燈轉為純金 · 抗LED色階斷裂 (.cube)",
    accent: "#d9822b",
    profileId: "Profile_07_NightMarket",
  },
  {
    key: "dusk_tide",
    badge: "DUSK_08",
    shortLabel: "DuskTide",
    title: "DuskTide · 暮光藍調冷暖",
    subtitle: "黃昏藍調時刻 · 深青靛藍暗部與暖金燈火交融 (.cube)",
    accent: "#3f51b5",
    profileId: "Profile_08_DuskTide",
  },
  {
    key: "canopy",
    badge: "CANOPY_09",
    shortLabel: "Canopy",
    title: "Canopy · 森綠層次透光",
    subtitle: "綠色亮度分階 · 陰翳青綠與透光黃綠分離 · 鮮活綠意 (.cube)",
    accent: "#2e7d32",
    profileId: "Profile_09_Canopy",
  },
  {
    key: "lowsun",
    badge: "LOWSUN_10",
    shortLabel: "Lowsun",
    title: "Lowsun · 金暉斜陽逆光",
    subtitle: "金琥珀高光與冷調陰影 · 強烈逆光立體感 · 黃昏魔幻 (.cube)",
    accent: "#e67e22",
    profileId: "Profile_10_Lowsun",
  },
];

export const BUILTIN_PROFILE_CATALOG: ProfileCatalogItem[] = [
  {
    id: "Profile_00_StandardNatural",
    title: "Standard · 原色自然直出",
    tone: "零風格偏調 · 純淨光學原色 · 保留真實寬容度",
    badge: "NATURAL_00",
    accent: "#8e929b",
    evDefault: 0.0,
    contrastDefault: 0.0,
    highlightsDefault: 0.0,
    shadowsDefault: 0.0,
    fadeDefault: 0.0,
    cyanSkyDefault: 0.0,
    foliageDefault: 0.0,
    lutIntensityDefault: 1.0,
    clarityDefault: 0.0,
    sharpnessDefault: 0.0,
    recommendedScene: "精準微調 / 商業紀實 / 原色直出",
  },
  {
    id: "Profile_01_Fieldnote",
    title: "Fieldnote · 日常微負片",
    tone: "中性 C-41 街拍日常 · 長階調長 Toe · 復古清透",
    badge: "FIELD_01",
    accent: "#5c7c8a",
    evDefault: 0.0,
    contrastDefault: 0.0,
    highlightsDefault: 0.0,
    shadowsDefault: 0.1,
    fadeDefault: 0.0,
    cyanSkyDefault: 0.0,
    foliageDefault: 0.0,
    lutIntensityDefault: 0.9,
    clarityDefault: 0.0,
    sharpnessDefault: 0.0,
    recommendedScene: "街拍人文 / 日常記事 / 雜誌隨行",
  },
  {
    id: "Profile_02_Heartland",
    title: "Heartland · 溫潤人像負片",
    tone: "專為健康膚色與室內暖光調校 · 溫潤通透不泛紅",
    badge: "HEART_02",
    accent: "#c97a5d",
    evDefault: 0.05,
    contrastDefault: -0.02,
    highlightsDefault: -0.05,
    shadowsDefault: 0.08,
    fadeDefault: 0.0,
    cyanSkyDefault: 0.0,
    foliageDefault: 0.0,
    lutIntensityDefault: 0.85,
    clarityDefault: -0.05,
    sharpnessDefault: 0.0,
    recommendedScene: "溫馨人像 / 家庭合照 / 室內暖光",
  },
  {
    id: "Profile_03_Meridian",
    title: "Meridian · 澄澈天光紀實",
    tone: "中性灰軸零漂移 · 純淨日光色彩 · 澄澈通透自然",
    badge: "MERIDIAN_03",
    accent: "#4a8fa8",
    evDefault: 0.0,
    contrastDefault: 0.0,
    highlightsDefault: 0.0,
    shadowsDefault: 0.0,
    fadeDefault: 0.0,
    cyanSkyDefault: 0.0,
    foliageDefault: 0.0,
    lutIntensityDefault: 1.0,
    clarityDefault: 0.0,
    sharpnessDefault: 0.0,
    recommendedScene: "晴天戶外 / 建築幾何 / 忠實紀實",
  },
  {
    id: "Profile_04_Matinee",
    title: "Matinee · 放映電影拷貝",
    tone: "深沉具階調的黑階 · 內斂細膩色彩 · 故事感光影",
    badge: "MATINEE_04",
    accent: "#3d404d",
    evDefault: 0.0,
    contrastDefault: 0.15,
    highlightsDefault: -0.1,
    shadowsDefault: -0.05,
    fadeDefault: 0.0,
    cyanSkyDefault: 0.0,
    foliageDefault: 0.0,
    lutIntensityDefault: 0.85,
    clarityDefault: 0.1,
    sharpnessDefault: 0.1,
    recommendedScene: "戲劇張力 / 展演光影 / 電影氛圍",
  },
  {
    id: "Profile_05_Postcard",
    title: "Postcard · 明信片正片純色",
    tone: "正片色彩提純 · 細膩微密度 · 鮮明不俗艷",
    badge: "POSTCARD_05",
    accent: "#cf5c42",
    evDefault: 0.0,
    contrastDefault: 0.08,
    highlightsDefault: 0.0,
    shadowsDefault: 0.0,
    fadeDefault: 0.0,
    cyanSkyDefault: 0.0,
    foliageDefault: 0.0,
    lutIntensityDefault: 0.85,
    clarityDefault: 0.05,
    sharpnessDefault: 0.05,
    recommendedScene: "旅行寫真 / 色彩鮮活 / 陽光戶外",
  },
  {
    id: "Profile_06_Skylight",
    title: "Skylight · 天光重組高動態",
    tone: "開放暗部與壓縮高光 · 平衡大光比逆光 · 通透立體",
    badge: "SKYLIGHT_06",
    accent: "#4f9da6",
    evDefault: 0.0,
    contrastDefault: -0.05,
    highlightsDefault: -0.15,
    shadowsDefault: 0.15,
    fadeDefault: 0.0,
    cyanSkyDefault: 0.1,
    foliageDefault: 0.0,
    lutIntensityDefault: 0.9,
    clarityDefault: 0.0,
    sharpnessDefault: 0.0,
    recommendedScene: "大逆光風景 / 窗邊人像 / 高反差場景",
  },
  {
    id: "Profile_07_NightMarket",
    title: "NightMarket · 夜市微光金芒",
    tone: "夜間混光調校 · 鎢絲與鈉燈轉為純金 · 抗LED色階斷裂",
    badge: "NIGHT_07",
    accent: "#d9822b",
    evDefault: 0.05,
    contrastDefault: 0.05,
    highlightsDefault: -0.1,
    shadowsDefault: 0.05,
    fadeDefault: 0.0,
    cyanSkyDefault: 0.0,
    foliageDefault: 0.0,
    lutIntensityDefault: 0.85,
    clarityDefault: 0.0,
    sharpnessDefault: 0.05,
    recommendedScene: "夜市小吃 / 街頭夜景 / 霓虹混光",
  },
  {
    id: "Profile_08_DuskTide",
    title: "DuskTide · 暮光藍調冷暖",
    tone: "黃昏藍調時刻 · 深青靛藍暗部與暖金燈火交融",
    badge: "DUSK_08",
    accent: "#3f51b5",
    evDefault: 0.0,
    contrastDefault: 0.1,
    highlightsDefault: -0.05,
    shadowsDefault: 0.0,
    fadeDefault: 0.0,
    cyanSkyDefault: 0.2,
    foliageDefault: 0.0,
    lutIntensityDefault: 0.85,
    clarityDefault: 0.05,
    sharpnessDefault: 0.05,
    recommendedScene: "日落暮色 / 藍調Magic Hour / 碼頭河畔",
  },
  {
    id: "Profile_09_Canopy",
    title: "Canopy · 森綠層次透光",
    tone: "綠色亮度分階 · 陰翳青綠與透光黃綠分離 · 鮮活綠意",
    badge: "CANOPY_09",
    accent: "#2e7d32",
    evDefault: 0.0,
    contrastDefault: 0.05,
    highlightsDefault: 0.0,
    shadowsDefault: 0.05,
    fadeDefault: 0.0,
    cyanSkyDefault: 0.0,
    foliageDefault: 0.3,
    lutIntensityDefault: 0.85,
    clarityDefault: 0.05,
    sharpnessDefault: 0.1,
    recommendedScene: "林道踏青 / 露營戶外 / 植栽花草",
  },
  {
    id: "Profile_10_Lowsun",
    title: "Lowsun · 金暉斜陽逆光",
    tone: "金琥珀高光與冷調陰影 · 強烈逆光立體感 · 黃昏魔幻",
    badge: "LOWSUN_10",
    accent: "#e67e22",
    evDefault: 0.0,
    contrastDefault: 0.12,
    highlightsDefault: -0.1,
    shadowsDefault: 0.0,
    fadeDefault: 0.0,
    cyanSkyDefault: -0.1,
    foliageDefault: 0.1,
    lutIntensityDefault: 0.85,
    clarityDefault: 0.05,
    sharpnessDefault: 0.05,
    recommendedScene: "斜陽夕照 / 金色逆光 / 剪影氛圍",
  },
];

