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
  fileHandle?: any;
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
