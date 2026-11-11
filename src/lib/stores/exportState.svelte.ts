/**
 * 匯出管線與出圖狀態管理模組 (Export Pipeline Store)
 * 負責管理單張快速出圖 (Quick Export) 與批次分組出圖 (Batch Export & RAW Backup) 的狀態、進度與執行。
 * 遵循 Svelte 5 Runes ($state) 響應式規範。
 */

import {
  ExportService,
  getExportExtension,
  type ExportFormat,
} from "$lib/services/exportService";
import type { DirectoryPlanResult } from "$lib/services/ai/types";
import { darkroomState } from "$lib/stores/darkroomState.svelte";
import { lutCatalog } from "$lib/stores/lutCatalog.svelte";
import {
  photoLibrary,
  type PhotoPlateItem,
} from "$lib/stores/photoLibrary.svelte";
import { cloneHslAdjustments } from "$lib/types/photo";

export interface BatchExportOptions {
  targetDir: string;
  autoDateSubdir: boolean;
  backupRawFiles: boolean;
  directoryPlan?: DirectoryPlanResult | null;
  format?: ExportFormat;
  quality?: number;
  maxLongEdge?: number | null;
  colorSpace?: "sRGB" | "DisplayP3" | "ProPhotoRGB";
  preserveExif?: boolean;
}

export class ExportPipelineStore {
  exportMode = $state<"modeA" | "modeB">("modeA");
  exportProgress = $state<number>(100);
  isExporting = $state<boolean>(false);
  exportNotice = $state<string>("");

  /**
   * 顯示短暫匯出或系統提示訊息
   */
  showNotice(message: string, durationMs = 2500): void {
    this.exportNotice = message;
    setTimeout(() => {
      if (this.exportNotice === message) {
        this.exportNotice = "";
      }
    }, durationMs);
  }

  /**
   * 單張即時快速匯出 (⌘E / Quick Export)
   */
  async handleSingleQuickExport(
    quickOptions:
      | "modeA"
      | "modeB"
      | {
          mode: "modeA" | "modeB";
          format: ExportFormat;
          quality: number;
          maxLongEdge: number | null;
        },
  ): Promise<void> {
    const activePhoto = photoLibrary.activePhoto;
    if (!activePhoto) return;
    try {
      const resolvedOpts =
        typeof quickOptions === "string"
          ? {
              mode: quickOptions,
              format: "jpeg" as ExportFormat,
              quality: quickOptions === "modeA" ? 0.95 : 1.0,
              maxLongEdge: null as number | null,
            }
          : quickOptions;
      const format = resolvedOpts.format;
      const quality = resolvedOpts.quality;
      const maxLongEdge = resolvedOpts.maxLongEdge;
      const currentCrop = activePhoto.crop || darkroomState.buildCropSnapshot();

      const blob = await ExportService.renderPhotoToBlob({
        photo: {
          ...activePhoto,
          tuning: activePhoto.tuning || {
            exposure: darkroomState.exposure,
            highlights: darkroomState.highlights,
            contrast: darkroomState.contrast,
            shadows: darkroomState.shadows,
            blacks: darkroomState.blacks,
            colorTemp: darkroomState.colorTemp,
            tint: darkroomState.tint,
            vibrance: darkroomState.vibrance,
            lutIntensity: darkroomState.lutIntensity,
            clarity: darkroomState.clarity,
            sharpness: darkroomState.sharpness,
            colorDensity: darkroomState.colorDensity,
            shadowHue: darkroomState.shadowHue,
            shadowTintAmount: darkroomState.shadowTintAmount,
            highlightHue: darkroomState.highlightHue,
            highlightTintAmount: darkroomState.highlightTintAmount,
            halation: darkroomState.halation,
            grainAmount: darkroomState.grainAmount,
            vignette: darkroomState.vignette,
            monochrome: darkroomState.monochrome,
            hsl: cloneHslAdjustments(darkroomState.hsl),
          },
          crop: currentCrop,
        },
        format,
        quality,
        maxLongEdge,
        profileDefaults: lutCatalog.allProfiles,
        customLuts: lutCatalog.userCustomLuts,
      });

      if (blob) {
        const targetDir =
          typeof localStorage !== "undefined"
            ? localStorage.getItem("slipknot_export_target_dir") || "./Exports"
            : "./Exports";
        const autoDateSubdir =
          typeof localStorage !== "undefined"
            ? localStorage.getItem("slipknot_export_date_subdir") !== "false"
            : true;
        const subDir = autoDateSubdir
          ? new Date().toISOString().slice(0, 10)
          : undefined;
        const baseName = activePhoto.filename.replace(/\.[^/.]+$/, "");
        const ext = getExportExtension(format);
        const filename = `${baseName}_graded.${ext}`;

        const saveResult = await ExportService.saveExportedPhoto({
          targetDir,
          subDir,
          filename,
          blob,
        });

        this.exportNotice = saveResult.savedPath
          ? `已快速匯出至 ${saveResult.savedPath}`
          : `已快速匯出 ${filename}`;
      }
    } catch {
      this.exportNotice = "快速匯出發生錯誤";
    } finally {
      setTimeout(() => {
        this.exportNotice = "";
      }, 3500);
    }
  }

  /**
   * 觸發批次匯出與智慧目錄分類及 RAW 備份
   */
  async triggerExport(
    subset?: PhotoPlateItem[],
    options?: BatchExportOptions,
  ): Promise<void> {
    const activeQueue = photoLibrary.activeQueue;
    const activePhoto = photoLibrary.activePhoto;
    const listToExport =
      subset && subset.length > 0
        ? subset
        : activeQueue.length > 0
          ? activeQueue
          : activePhoto
            ? [activePhoto]
            : [];

    if (listToExport.length === 0) {
      this.showNotice("目前相簿為空，請先載入相片", 2500);
      return;
    }

    const exportFormat: ExportFormat =
      options?.format ??
      ((typeof localStorage !== "undefined"
        ? (localStorage.getItem("slipknot_export_format") as ExportFormat)
        : null) ||
        "jpeg");
    const exportQuality =
      options?.quality ??
      (typeof localStorage !== "undefined" &&
      localStorage.getItem("slipknot_export_quality")
        ? Number(localStorage.getItem("slipknot_export_quality"))
        : this.exportMode === "modeA"
          ? 0.95
          : 1.0);
    const maxLongEdge = options?.maxLongEdge ?? null;
    const ext = getExportExtension(exportFormat);

    const targetDir =
      options?.targetDir ||
      (typeof localStorage !== "undefined"
        ? localStorage.getItem("slipknot_export_target_dir") || "./Exports"
        : "./Exports");
    const autoDateSubdir =
      options !== undefined
        ? options.autoDateSubdir
        : typeof localStorage !== "undefined"
          ? localStorage.getItem("slipknot_export_date_subdir") !== "false"
          : true;
    const dateSubDir = autoDateSubdir
      ? new Date().toISOString().slice(0, 10)
      : undefined;

    const directoryPlan = options?.directoryPlan;
    const photoSubPathMap = new Map<string, string>();
    if (directoryPlan && directoryPlan.folders) {
      for (const folder of directoryPlan.folders) {
        for (const pid of folder.photoIds) {
          photoSubPathMap.set(pid, folder.subPath);
        }
      }
    }

    this.isExporting = true;
    this.exportProgress = 5;
    this.exportNotice = `準備匯出 ${listToExport.length} 張相片...`;

    let lastSavedPath = "";

    try {
      for (let i = 0; i < listToExport.length; i++) {
        const p = listToExport[i];
        this.exportProgress = Math.round(((i + 0.5) / listToExport.length) * 100);
        this.exportNotice = `正在處理第 ${i + 1}/${listToExport.length} 張：${p.filename}...`;

        let blobToSave: Blob | null = null;
        const baseName = p.filename.replace(/\.[^/.]+$/, "");
        const filename = `${baseName}_graded.${ext}`;

        // 計算該照片實際的目標子路徑 (結合日期子目錄與智慧規劃目錄)
        const itemPlanSubPath = photoSubPathMap.get(p.id);
        let actualSubDir: string | undefined = undefined;
        if (dateSubDir && itemPlanSubPath) {
          actualSubDir = `${dateSubDir}/${itemPlanSubPath}`;
        } else if (itemPlanSubPath) {
          actualSubDir = itemPlanSubPath;
        } else if (dateSubDir) {
          actualSubDir = dateSubDir;
        }

        // 渲染成片：依序以設定格式、畫質、尺寸與個別調色裁切算圖
        blobToSave = await ExportService.renderPhotoToBlob({
          photo: p as any,
          format: exportFormat,
          quality: exportQuality,
          maxLongEdge,
          profileDefaults: lutCatalog.allProfiles,
          customLuts: lutCatalog.userCustomLuts,
        });

        if (blobToSave) {
          const saveResult = await ExportService.saveExportedPhoto({
            targetDir,
            subDir: actualSubDir,
            filename,
            blob: blobToSave,
          });
          if (saveResult.savedPath) {
            lastSavedPath = saveResult.savedPath;
          }
        }

        // 原始 RAW 備份處理
        if (options?.backupRawFiles && p.fileHandle) {
          try {
            const rawFile: File =
              typeof (p.fileHandle as any).getFile === "function"
                ? await (p.fileHandle as any).getFile()
                : p.fileHandle;
            const rawSubPath = directoryPlan?.rawBackupSubPath || "Raw_Backup";
            const actualRawSubDir = dateSubDir
              ? `${dateSubDir}/${rawSubPath}`
              : rawSubPath;
            await ExportService.saveExportedPhoto({
              targetDir,
              subDir: actualRawSubDir,
              filename: rawFile.name || p.filename,
              blob: rawFile,
            });
          } catch (rawErr) {
            console.warn("備份原始 RAW 檔失敗:", rawErr);
          }
        }

        await new Promise((r) => setTimeout(r, 60));
      }

      this.exportProgress = 100;
      const planNotice = directoryPlan
        ? `（已自動分類為 ${directoryPlan.folders.length} 個資料夾）`
        : "";
      this.exportNotice = `已完成匯出 ${listToExport.length} 張相片${planNotice} 至 ${lastSavedPath || targetDir}`;
    } catch {
      this.exportNotice = "匯出發生錯誤";
    } finally {
      this.isExporting = false;
      setTimeout(() => {
        this.exportNotice = "";
      }, 4000);
    }
  }
}

export const exportState = new ExportPipelineStore();
