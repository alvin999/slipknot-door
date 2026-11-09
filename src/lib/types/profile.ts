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
