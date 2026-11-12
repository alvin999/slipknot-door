/**
 * Export Service: Cross-Platform File Export and Storage Architecture
 * Bridges frontend renderers with Rust native filesystem storage.
 * Seamlessly handles Windows backslashes (\), macOS/Linux slashes (/),
 * automatic directory creation, and browser fallback.
 */

import { IngestionService } from './ingestionService';
import { WebglLutRenderer } from './webglLutRenderer';
import type { CustomLutRecord } from './customLutService';
import { hasActiveCropGeometry, renderGeometryToCanvas } from '../utils/cropGeometry';

export type ExportFormat = 'jpeg' | 'png' | 'webp';

export function getExportMimeType(format: ExportFormat = 'jpeg'): string {
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export function getExportExtension(format: ExportFormat = 'jpeg'): string {
  if (format === 'png') return 'png';
  if (format === 'webp') return 'webp';
  return 'jpg';
}

export interface SaveExportedPhotoParams {
  targetDir: string;
  subDir?: string;
  filename: string;
  blob: Blob;
}

export interface SaveExportedPhotoResult {
  success: boolean;
  savedPath?: string;
  error?: string;
}

export interface RenderPhotoOptions {
  photo: {
    id?: string;
    filename?: string;
    thumbnail?: string;
    appliedProfile?: string;
    asShotExposure?: number;
    asShotTemp?: number;
    asShotTint?: number;
    tuning?: {
      exposure: number;
      contrast: number;
      shadows?: number;
      colorTemp: number;
      tint: number;
      lutIntensity: number;
      clarity?: number;
      sharpness?: number;
      colorDensity?: number;
      shadowHue?: number;
      shadowTintAmount?: number;
      highlightHue?: number;
      highlightTintAmount?: number;
      halation?: number;
      grainAmount?: number;
      highlights?: number;
      blacks?: number;
      vibrance?: number;
      vignette?: number;
      monochrome?: boolean;
      hsl?: import('../types/photo').HslAdjustments;
    };
    crop?: {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation?: number;
      keystoneV?: number;
      keystoneH?: number;
      flipH?: boolean;
      flipV?: boolean;
    };
  };
  format?: ExportFormat;
  quality?: number;
  maxLongEdge?: number | null;
  profileDefaults?: {
    id: string;
    evDefault: number;
    highlightsDefault?: number;
    contrastDefault?: number;
    shadowsDefault?: number;
    lutIntensityDefault: number;
    clarityDefault?: number;
    sharpnessDefault?: number;
  }[];
  customLuts?: CustomLutRecord[];
}

export class ExportService {
  private static exportCanvas: HTMLCanvasElement | null = null;
  private static exportRenderer: WebglLutRenderer | null = null;

  /**
   * Determine whether execution is currently within a Tauri desktop environment
   */
  public static isTauri(): boolean {
    return IngestionService.isTauri();
  }

  /**
   * Resolve and normalize destination directory path across platforms.
   * Delegated to Rust PathBuf in desktop environment to ensure 100% correct
   * Windows drive letter and backslash semantics.
   */
  public static async resolveExportPath(targetDir: string, subDir?: string): Promise<string> {
    if (this.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string>('resolve_export_path', {
          targetDir: targetDir || './Exports',
          subDir: subDir || null,
        });
      } catch (err) {
        console.warn('Rust resolve_export_path failed, falling back to local normalizer:', err);
      }
    }

    // Web Fallback: Normalize path string
    const cleanBase = (targetDir || './Exports').trim().replace(/[\\/]+$/, '') || './Exports';
    return subDir ? `${cleanBase}/${subDir}` : cleanBase;
  }

  /**
   * Write rendered photo binary directly to the specified destination on local disk.
   * Uses native Rust I/O in desktop mode, and DOM download anchor in browser mode.
   */
  public static async saveExportedPhoto(params: SaveExportedPhotoParams): Promise<SaveExportedPhotoResult> {
    if (this.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const arrayBuffer = await params.blob.arrayBuffer();
        const data = Array.from(new Uint8Array(arrayBuffer));

        const savedPath = await invoke<string>('save_exported_file', {
          targetDir: params.targetDir || './Exports',
          subDir: params.subDir || null,
          filename: params.filename,
          data,
        });

        return { success: true, savedPath };
      } catch (err: any) {
        console.error('Rust save_exported_file error:', err);
        return { success: false, error: String(err) };
      }
    }

    // Web Fallback: Standard browser download dispatch
    try {
      const url = URL.createObjectURL(params.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = params.filename;
      a.click();
      URL.revokeObjectURL(url);
      return { success: true, savedPath: params.filename };
    } catch (err: any) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * Open export destination folder in system file explorer (Finder / File Explorer)
   */
  public static async openExportDirectory(targetPath: string): Promise<boolean> {
    if (this.isTauri()) {
      try {
        const { openPath } = await import('@tauri-apps/plugin-opener');
        await openPath(targetPath);
        return true;
      } catch (err) {
        console.warn('Failed to open export folder via tauri-plugin-opener:', err);
      }
    }
    return false;
  }

  /**
   * Render a photographic plate to a high-resolution JPEG Blob with its full-size
   * original source, 3D LUT grading, tuning parameters, and geometric crop/rotation.
   */
  public static async renderPhotoToBlob(options: RenderPhotoOptions): Promise<Blob | null> {
    if (typeof document === 'undefined') return null;

    const src = options.photo.thumbnail;
    if (!src) return null;

    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
        img.src = src;
      });

      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w === 0 || h === 0) return null;

      const profileId = options.photo.appliedProfile || 'Profile_00_StandardNatural';
      const profileDefault = options.profileDefaults?.find((p) => p.id === profileId);

      const tuning = options.photo.tuning;
      const monochrome = tuning?.monochrome ?? false;
      const exposure = tuning?.exposure ?? (profileDefault ? profileDefault.evDefault : (options.photo.asShotExposure ?? 0.0));
      const contrast = tuning?.contrast ?? (profileDefault?.contrastDefault ?? 0.0);
      const colorTemp = tuning?.colorTemp ?? (options.photo.asShotTemp ?? 5500);
      const tint = tuning?.tint ?? (options.photo.asShotTint ?? 0.0);
      const lutIntensity = tuning?.lutIntensity ?? (profileDefault ? profileDefault.lutIntensityDefault : 1.0);
      const shadows = tuning?.shadows ?? (profileDefault?.shadowsDefault ?? 0.0);
      const clarity = tuning?.clarity ?? (profileDefault?.clarityDefault ?? 0.0);
      const sharpness = tuning?.sharpness ?? (profileDefault?.sharpnessDefault ?? 0.0);
      const colorDensity = tuning?.colorDensity ?? 0.0;
      const shadowHue = tuning?.shadowHue ?? 200;
      const shadowTintAmount = tuning?.shadowTintAmount ?? 0.0;
      const highlightHue = tuning?.highlightHue ?? 40;
      const highlightTintAmount = tuning?.highlightTintAmount ?? 0.0;
      const halation = tuning?.halation ?? 0.0;
      const grainAmount = tuning?.grainAmount ?? 0.15;
      const highlights = tuning?.highlights ?? (profileDefault?.highlightsDefault ?? 0.0);
      const blacks = tuning?.blacks ?? 0.0;
      const vibrance = tuning?.vibrance ?? 0.0;
      const vignette = tuning?.vignette ?? 0.0;
      const hsl = tuning?.hsl;

      if (!this.exportRenderer) {
        this.exportCanvas = document.createElement('canvas');
        this.exportRenderer = new WebglLutRenderer();
        this.exportRenderer.initialize(this.exportCanvas);
      }

      if (options.customLuts && options.customLuts.length > 0) {
        this.exportRenderer.registerCustomLuts(options.customLuts);
      }

      this.exportRenderer.setImageSource(img);
      this.exportRenderer.setProfile(profileId);
      this.exportRenderer.render(
        {
          monochrome,
          exposure,
          contrast,
          colorTemp,
          tint,
          shadowLift: shadows,
          lutIntensity,
          bypassLut: profileId === 'Profile_00_StandardNatural',
          clarity,
          sharpness,
          colorDensity,
          shadowHue,
          shadowTintAmount,
          highlightHue,
          highlightTintAmount,
          halation,
          grainAmount,
          highlights,
          blacks,
          vibrance,
          vignette,
          hsl,
        },
        w,
        h
      );

      const crop = options.photo.crop;
      const hasGeometry = hasActiveCropGeometry(crop);

      const format: ExportFormat = options.format ?? 'jpeg';
      const mimeType = getExportMimeType(format);
      const quality = format === 'png' ? 1.0 : (options.quality ?? 0.95);
      const maxLongEdge = options.maxLongEdge && options.maxLongEdge > 0 ? Math.round(options.maxLongEdge) : null;

      if (!this.exportCanvas) {
        return await this.exportRenderer.exportBlob(mimeType, quality);
      }

      const cropW = hasGeometry && crop ? Math.max(0.01, Math.min(1, crop.width || 1)) : 1;
      const cropH = hasGeometry && crop ? Math.max(0.01, Math.min(1, crop.height || 1)) : 1;
      const currentLongEdge = Math.max(Math.round(cropW * w), Math.round(cropH * h));
      const needsResize = maxLongEdge !== null && currentLongEdge > maxLongEdge;

      if (!hasGeometry && !needsResize) {
        return await this.exportRenderer.exportBlob(mimeType, quality);
      }

      const outCanvas = renderGeometryToCanvas(this.exportCanvas, crop, maxLongEdge);
      return new Promise<Blob | null>((resolve) => {
        outCanvas.toBlob((blob) => resolve(blob), mimeType, quality);
      });
    } catch (err) {
      console.warn('[ExportService] renderPhotoToBlob error:', err);
      return null;
    }
  }
}
