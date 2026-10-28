/**
 * Export Service: Cross-Platform File Export and Storage Architecture
 * Bridges frontend renderers with Rust native filesystem storage.
 * Seamlessly handles Windows backslashes (\), macOS/Linux slashes (/),
 * automatic directory creation, and browser fallback.
 */

import { IngestionService } from './ingestionService';

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

export class ExportService {
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
}
