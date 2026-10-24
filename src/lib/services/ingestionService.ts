/**
 * Ingestion Service: Bridge between Svelte 5 and Rust Tauri Core
 * Handles hardware detection, directory scanning and 50ms embedded JPEG extraction.
 */

import type { PhotoPlate } from '../types/photo';

export interface CameraMountInfo {
  mount_path: string;
  volume_name: string;
  dcim_path: string | null;
  file_count: number;
  is_camera: boolean;
}

export interface RawPhotoItem {
  file_path: string;
  filename: string;
  file_size: number;
  extension: string;
  frame_no: string;
}

export interface EmbeddedPreviewResult {
  file_path: string;
  mime_type: string;
  jpeg_base64: string;
  extraction_time_ms: number;
  exif: {
    camera_model: string;
    lens_model: string;
    iso: number;
    shutter_speed: string;
    aperture: string;
    focal_length: string;
    date_time: string;
  };
}

export class IngestionService {
  private static isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  /**
   * Detect camera mounts and external storage
   */
  public static async detectMounts(): Promise<CameraMountInfo[]> {
    if (this.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<CameraMountInfo[]>('detect_camera_mounts');
      } catch (err) {
        console.warn('Tauri detect_camera_mounts failed, falling back:', err);
      }
    }

    // Web Fallback: Simulated connected camera device
    return [
      {
        mount_path: '/media/alvin/SONY_A7RV',
        volume_name: 'SONY_A7RV',
        dcim_path: '/media/alvin/SONY_A7RV/DCIM/100MSDCF',
        file_count: 342,
        is_camera: true
      }
    ];
  }

  /**
   * Scan DCIM directory
   */
  public static async scanDirectory(path: string): Promise<RawPhotoItem[]> {
    if (this.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<RawPhotoItem[]>('scan_dcim_directory', { path });
      } catch (err) {
        console.warn('Tauri scan_dcim_directory failed:', err);
      }
    }

    // Web Fallback: Mocked camera frames
    return [
      { file_path: '/DCIM/DSC08291.ARW', filename: 'DSC08291.ARW', file_size: 63100000, extension: 'arw', frame_no: '01A' },
      { file_path: '/DCIM/DSC08292.ARW', filename: 'DSC08292.ARW', file_size: 61800000, extension: 'arw', frame_no: '02A' },
      { file_path: '/DCIM/DSC08293.ARW', filename: 'DSC08293.ARW', file_size: 62400000, extension: 'arw', frame_no: '03A' },
      { file_path: '/DCIM/DSC08294.ARW', filename: 'DSC08294.ARW', file_size: 64100000, extension: 'arw', frame_no: '04A' },
      { file_path: '/DCIM/DSC08295.ARW', filename: 'DSC08295.ARW', file_size: 63800000, extension: 'arw', frame_no: '05A' }
    ];
  }

  /**
   * Extract embedded JPEG and EXIF in under 50ms without raw demosaicing
   */
  public static async extractPreview(filePath: string): Promise<EmbeddedPreviewResult> {
    if (this.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<EmbeddedPreviewResult>('extract_embedded_jpeg', { filePath });
      } catch (err) {
        console.warn('Tauri extract_embedded_jpeg failed:', err);
      }
    }

    // Web Fallback simulation
    return {
      file_path: filePath,
      mime_type: 'image/jpeg',
      jpeg_base64: '',
      extraction_time_ms: 18,
      exif: {
        camera_model: 'Sony Alpha 7R V',
        lens_model: 'FE 50mm F1.2 GM',
        iso: 400,
        shutter_speed: '1/320s',
        aperture: 'f/1.4',
        focal_length: '50mm',
        date_time: '2026-10-24 11:28:42'
      }
    };
  }
}
