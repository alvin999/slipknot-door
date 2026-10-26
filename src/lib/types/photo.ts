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
  sceneTag?: string;
  selected?: boolean;
  appliedProfile?: string;
  appliedProfileId?: string;
  tuning?: TuningParameters;
  crop?: CropGeometry;
  fileHandle?: any;
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
  lutProfile: boolean;     // 3D LUT 風格推薦
  crop: boolean;           // 構圖與智慧裁切
  keystone: boolean;       // 梯形與水平校正
  tone: boolean;           // 基礎光影 (曝光/對比/陰影)
  whiteBalance: boolean;   // 自動色溫與色偏 (Kelvin / Tint)
}

export interface TuningParameters {
  exposure: number;       // EV (-2.00 ~ +2.00)
  contrast: number;       // (-0.8 ~ +0.8)
  shadowLift?: number;    // 0.00 ~ 1.00
  lutIntensity: number;   // 0.00 ~ 1.00
  colorTemp: number;      // Kelvin (2800 ~ 8500)
  tint: number;           // Tint (-100 ~ +100, Green <-> Magenta)
  clarity?: number;       // (-1.0 ~ +1.0)
  sharpness?: number;     // (0.0 ~ 1.0)
}

