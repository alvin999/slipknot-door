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
  exposureProgram?: string;
  captureTime?: string;
}

export interface PhotoPlate {
  id: string;
  frameNo: string;
  filename: string;
  fileSize: number;
  storageUri: string;
  exif: ExifOpticalData;
  thumbnailUrl: string;
  previewUrl?: string;
  fullRawPath: string;
  sceneTag: string;
  selected: boolean;
  appliedProfileId: string;
  tuning: TuningParameters;
}

export interface TuningParameters {
  exposure: number;       // EV (-2.00 ~ +2.00)
  shadowLift: number;     // 0.00 ~ 1.00
  lutIntensity: number;   // 0.00 ~ 1.00
  colorTemp: number;      // Kelvin (2800 ~ 8500)
}
