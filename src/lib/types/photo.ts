/**
 * Photographic Plate & Optical EXIF Metadata Models
 */

export interface ExifOpticalData {
  cameraModel: string;
  lensModel: string;
  iso: number;
  shutterSpeed: string;
  apertureValue: string;
  focalLength: string;
  colorTemperature?: number;
  tint?: number;
  exposureBias?: number;
  exposureProgram?: string;
  meteringMode?: string;
  colorSpace?: string;
  flash?: string;
  captureTime?: string;
}

export interface PhotoPlate {
  id: string;
  frameNo: string;
  filename: string;
  fileSize?: number;
  storageUri?: string;
  camera?: string;
  lens?: string;
  iso?: number;
  shutter?: string;
  aperture?: string;
  focalLength?: string;
  exposureBias?: number;
  exposureProgram?: string;
  meteringMode?: string;
  colorSpace?: string;
  flash?: string;
  asShotTemp?: number;
  asShotTint?: number;
  asShotExposure?: number;
  exif?: ExifOpticalData;
  thumbnail?: string;
  thumbnailUrl?: string;
  gradedThumbnail?: string;
  previewUrl?: string;
  fullRawPath?: string;
  sidecarPath?: string;
  formatType?: 'raw' | 'jpeg' | 'pair';
  sceneTag?: string;
  selected?: boolean;
  appliedProfile?: string;
  appliedProfileId?: string;
  tuning?: TuningParameters;
  crop?: CropGeometry;
  fileHandle?: any;
  aiTuningSnapshot?: AiTuningSnapshot;
  aiLatestBaseline?: AiTuningSnapshot;
  aiIterationHistory?: AiIterationRecord[];
}

export interface AiIterationRecord {
  round: number;
  timestamp: number;
  userPrompt?: string;
  userModifiedKeys: string[];
  lockedKeys: string[];
  aiRationale: string;
  deltasSummary: string[];
  appliedProfile: string;
  tuning: TuningParameters;
}

export interface AiTuningSnapshot {
  appliedProfile: string;
  tuning: TuningParameters;
  crop?: CropGeometry;
  appliedScope?: AiScopePreferences;
  appliedAt?: number;
}

export interface CropGeometry {
  x: number;          // 0.0 ~ 1.0 (左上角 X 比例)
  y: number;          // 0.0 ~ 1.0 (左上角 Y 比例)
  width: number;      // 0.0 ~ 1.0 (寬度比例)
  height: number;     // 0.0 ~ 1.0 (高度比例)
  rotation: number;   // 旋轉角度 (-45 ~ +45 度)
  keystoneV: number;  // 垂直透視梯形 (-45 ~ +45)
  keystoneH: number;  // 水平透視梯形 (-45 ~ +45)
  aspectRatio: 'original' | '1:1' | '4:5' | '16:9' | '9:16' | 'free';
  flipH: boolean;     // 水平翻轉
  flipV: boolean;     // 垂直翻轉
  rationale?: string; // AI 構圖與裁切理由
}

export interface AiScopePreferences {
  lutProfile: boolean;          // 3D LUT 風格推薦
  crop: boolean;                // 構圖與智慧裁切
  lockCropAspectRatio?: boolean;// 智慧裁切時鎖定原始長寬比 (不改為 1:1 / 4:5 等)
  keystone: boolean;            // 梯形與水平校正
  tone: boolean;                // 基礎光影 (曝光/對比/陰影)
  whiteBalance: boolean;        // 自動色溫與色偏 (Kelvin / Tint)
  filmPhysics?: boolean;        // 色彩科學與 HSL (自然飽和度/色彩密度/6段HSL)
  splitToning?: boolean;        // 冷暖分區色調 (暗部/亮部 Split Toning)
  filmTexture?: boolean;        // 底片質感特效 (Halation/銀鹽微粒/光學暗角)
}

export type HslBandKey = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue';

export interface HslBandAdjustment {
  hue: number; // -1.0 ~ +1.0 (maps to -30° ~ +30°)
  sat: number; // -1.0 ~ +1.0
  lum: number; // -1.0 ~ +1.0
}

export type HslAdjustments = Record<HslBandKey, HslBandAdjustment>;

export const HSL_BAND_KEYS: HslBandKey[] = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue'];

export function createDefaultHslAdjustments(): HslAdjustments {
  return {
    red: { hue: 0, sat: 0, lum: 0 },
    orange: { hue: 0, sat: 0, lum: 0 },
    yellow: { hue: 0, sat: 0, lum: 0 },
    green: { hue: 0, sat: 0, lum: 0 },
    cyan: { hue: 0, sat: 0, lum: 0 },
    blue: { hue: 0, sat: 0, lum: 0 },
  };
}

export function cloneHslAdjustments(src?: Partial<Record<HslBandKey, Partial<HslBandAdjustment>>>): HslAdjustments {
  const base = createDefaultHslAdjustments();
  if (!src) return base;
  for (const key of HSL_BAND_KEYS) {
    const band = src[key];
    if (band) {
      base[key] = {
        hue: typeof band.hue === 'number' && !Number.isNaN(band.hue) ? band.hue : 0,
        sat: typeof band.sat === 'number' && !Number.isNaN(band.sat) ? band.sat : 0,
        lum: typeof band.lum === 'number' && !Number.isNaN(band.lum) ? band.lum : 0,
      };
    }
  }
  return base;
}

export interface TuningParameters {
  monochrome?: boolean;   // 黑白暗房輸出模式 (預設 false 為彩色)
  exposure: number;       // EV (-2.00 ~ +2.00)
  contrast: number;       // (-0.8 ~ +0.8)
  highlights?: number;    // (-1.0 ~ +1.0) 高光壓回/提亮
  shadows?: number;       // 暗部抬升 (Matte Toe / Shadows)
  blacks?: number;        // (-0.5 ~ +0.5) 純黑錨點/褪色基底
  shadowLift?: number;    // 0.00 ~ 1.00 (相容別名)
  lutIntensity: number;   // 0.00 ~ 1.00
  colorTemp: number;      // Kelvin (2800 ~ 8500)
  tint: number;           // Tint (-100 ~ +100, Green <-> Magenta)
  vibrance?: number;      // (-1.0 ~ +1.0) 自然飽和度
  clarity?: number;       // (-1.0 ~ +1.0)
  sharpness?: number;     // (-1.0 ~ +1.0)
  colorDensity?: number;        // (-1.0 ~ +1.0) 減色法色彩密度
  shadowHue?: number;           // (0 ~ 360°) 暗部分離色相
  shadowTintAmount?: number;    // (0.0 ~ 1.0) 暗部分離著色強度
  highlightHue?: number;        // (0 ~ 360°) 亮部分離色相
  highlightTintAmount?: number; // (0.0 ~ 1.0) 亮部分離著色強度
  halation?: number;            // (0.0 ~ 1.0) 底片片基高光暈染
  vignette?: number;            // (-1.0 ~ +1.0) 光學暗角 (負值壓暗邊緣)
  grainAmount?: number;         // (0.0 ~ 1.0) 有機銀鹽微粒強度 (預設 0.15)
  hsl?: HslAdjustments;         // 6 區 HSL 分色微調
}
