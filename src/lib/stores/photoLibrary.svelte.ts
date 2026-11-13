/**
 * 相片典藏庫狀態管理模組 (Photo Library Store)
 * 負責管理工作區相片陣列、作用中相片、挑圖旗標、工作區排除/復原、磁碟刪除、相機硬體掛載與目錄載入。
 * 遵循 Svelte 5 Runes ($state, $derived) 響應式規範。
 */

import {
  IngestionService,
  type CameraMountInfo,
  type RawPhotoItem,
} from "$lib/services/ingestionService";
import type { AiSceneDecision } from "$lib/services/aiSceneService";
import { SessionService } from "$lib/services/sessionService";
import { toastStore } from "$lib/stores/toastStore.svelte";
import { darkroomState } from "$lib/stores/darkroomState.svelte";
import { thumbnailRenderService } from "$lib/services/thumbnailRenderService.svelte";
import type { CropGeometry, AiTuningSnapshot, AiIterationRecord } from "$lib/types/photo";

export interface PhotoPlateItem {
  id: string;
  frameNo: string;
  filename: string;
  camera: string;
  lens: string;
  iso: number;
  shutter: string;
  aperture: string;
  focalLength: string;
  thumbnail: string;
  sceneTag: string;
  selected: boolean;
  flagged?: boolean;
  appliedProfile: string;
  fileHandle?: File;
  filePath?: string;
  sidecarPath?: string;
  formatType?: "raw" | "jpeg" | "pair";
  gradedThumbnail?: string;
  exposureBias?: number;
  exposureProgram?: string;
  meteringMode?: string;
  colorSpace?: string;
  flash?: string;
  asShotTemp?: number;
  asShotTint?: number;
  asShotExposure?: number;
  crop?: CropGeometry;
  aiDecision?: AiSceneDecision;
  aiTuningSnapshot?: AiTuningSnapshot;
  aiLatestBaseline?: AiTuningSnapshot;
  aiIterationHistory?: AiIterationRecord[];
  tuning?: {
    exposure: number;
    contrast: number;
    shadows?: number;
    lutIntensity: number;
    colorTemp: number;
    tint: number;
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
    hsl?: import("$lib/types/photo").HslAdjustments;
  };
}

// ── 相片工作區排除與復原機制 (Photo Workspace Removal & Undo) ──
export interface RemovedPhotoItemSnapshot {
  photo: PhotoPlateItem;
  originalIndex: number; // 記錄排除前在相卷中的原始索引位置
}

export interface RemovedPhotosSnapshot {
  items: RemovedPhotoItemSnapshot[];
  prevActiveId: string | null;
}

export class PhotoLibraryStore {
  // 核心相片陣列與當前作用中相片
  photoPlates = $state<PhotoPlateItem[]>([]);
  activePhoto = $state<PhotoPlateItem | null>(null);
  isLoadingPhotos = $state<boolean>(false);
  currentDirectoryName = $state<string>("");

  // 硬體相機掛載狀態
  cameraMounts = $state<CameraMountInfo[]>([]);
  isScanningMounts = $state<boolean>(false);
  latestExtractionMs = $state<number>(18);
  private loadToken: number = 0;

  // 工作區排除復原堆疊快照
  lastRemovedSnapshot = $state<RemovedPhotosSnapshot | null>(null);

  // 縮圖著色背景回呼通知（由 Darkroom/WebGL 離線渲染器註冊）
  onThumbnailEnqueue: ((plate: PhotoPlateItem) => void) | null = null;

  // 當載入新相卷（非追加模式）時的視圖切換回呼
  onCatalogLoaded: (() => void) | null = null;

  // 當選擇相片切換時的額外回呼（如同步 AI 決策標籤）
  onPhotoSelected: ((plate: PhotoPlateItem) => void) | null = null;

  // 衍生佇列：若有挑圖 (flagged)，精修與匯出僅聚焦選取的相片；若無選取則全部顯示
  activeQueue = $derived<PhotoPlateItem[]>(
    this.photoPlates.filter((p) => p.flagged).length > 0
      ? this.photoPlates.filter((p) => p.flagged)
      : this.photoPlates,
  );

  // 已標記挑圖的相片數量
  flaggedCount = $derived<number>(
    this.photoPlates.filter((p) => p.flagged).length,
  );

  // 已標記挑圖的相片陣列
  flaggedPhotos = $derived<PhotoPlateItem[]>(
    this.photoPlates.filter((p) => p.flagged),
  );

  /**
   * 刷新相機掛載裝置
   */
  async refreshCameraMounts(): Promise<void> {
    this.isScanningMounts = true;
    try {
      this.cameraMounts = await IngestionService.detectMounts();
    } finally {
      this.isScanningMounts = false;
    }
  }

  /**
   * 切換相片的挑選標記 (Flagged / Picked)
   */
  togglePhotoFlag(photo: PhotoPlateItem, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    photo.flagged = !photo.flagged;
    this.photoPlates = [...this.photoPlates];
  }

  /**
   * 清除所有相片的挑選標記
   */
  clearAllFlags(): void {
    this.photoPlates.forEach((p) => (p.flagged = false));
    this.photoPlates = [...this.photoPlates];
  }

  /**
   * 觸發相片陣列淺拷貝重繪（當子元件直接修改 flagged 時）
   */
  handleFlagToggled(): void {
    this.photoPlates = [...this.photoPlates];
  }

  /**
   * 設定特定相片為作用中相片並更新選取狀態
   */
  setActivePhoto(plate: PhotoPlateItem): void {
    this.activePhoto = plate;
    this.photoPlates.forEach((p) => {
      p.selected = p.id === plate.id;
    });
  }

  /**
   * 選取相片：記憶前一張相片的自訂調色與裁切狀態，並載入新相片參數至 darkroomState
   */
  selectPhoto(plate: PhotoPlateItem): void {
    // 記憶前一張相片的自訂調色與裁切狀態（僅在有實質調整且與原儲存不同時寫入）
    if (this.activePhoto && this.activePhoto.id !== plate.id) {
      const currentPlate = this.photoPlates.find(
        (p) => p.id === this.activePhoto!.id,
      );
      const targetTuning = darkroomState.buildTuningSnapshot(this.activePhoto);
      const targetCrop = darkroomState.buildCropSnapshot();

      const tuningChanged =
        JSON.stringify(currentPlate?.tuning) !== JSON.stringify(targetTuning);
      const cropChanged =
        JSON.stringify(currentPlate?.crop) !== JSON.stringify(targetCrop);

      if (tuningChanged) {
        this.activePhoto.tuning = targetTuning;
      }
      if (cropChanged) {
        this.activePhoto.crop = targetCrop;
      }

      if (tuningChanged || cropChanged) {
        const activeId = this.activePhoto.id;
        const updatedTuning = this.activePhoto.tuning;
        const updatedCrop = this.activePhoto.crop;
        this.photoPlates = this.photoPlates.map((p) =>
          p.id === activeId
            ? { ...p, tuning: updatedTuning, crop: updatedCrop }
            : p,
        );
      }
    }

    this.setActivePhoto(plate);
    darkroomState.loadFromPhoto(plate);

    if (this.onPhotoSelected) {
      this.onPhotoSelected(plate);
    }
  }

  /**
   * 切換至相鄰相片 (Vim 快捷鍵或方向鍵)
   */
  selectAdjacentPhoto(delta: number, onPhotoChanging?: () => void): void {
    if (this.activeQueue.length === 0) return;
    const currentIndex = this.activeQueue.findIndex(
      (p) => p.id === this.activePhoto?.id,
    );
    let nextIndex = currentIndex + delta;
    if (nextIndex < 0) nextIndex = this.activeQueue.length - 1;
    if (nextIndex >= this.activeQueue.length) nextIndex = 0;

    const targetPlate = this.activeQueue[nextIndex];
    if (targetPlate) {
      if (onPhotoChanging) onPhotoChanging();
      this.selectPhoto(targetPlate);
    }
  }

  /**
   * 更新特定相片的調色與裁切資料並同步陣列
   */
  updatePhotoSettings(
    id: string,
    tuning?: PhotoPlateItem["tuning"],
    crop?: CropGeometry,
  ): void {
    this.photoPlates = this.photoPlates.map((p) => {
      if (p.id === id) {
        return {
          ...p,
          tuning: tuning !== undefined ? tuning : p.tuning,
          crop: crop !== undefined ? crop : p.crop,
        };
      }
      return p;
    });

    if (this.activePhoto && this.activePhoto.id === id) {
      if (tuning !== undefined) this.activePhoto.tuning = tuning;
      if (crop !== undefined) this.activePhoto.crop = crop;
    }
  }

  /**
   * 更新特定相片的 AI 場景判斷結果
   */
  updatePhotoAiDecision(id: string, decision: AiSceneDecision): void {
    this.photoPlates = this.photoPlates.map((p) => {
      if (p.id === id) {
        return { ...p, aiDecision: decision };
      }
      return p;
    });

    if (this.activePhoto && this.activePhoto.id === id) {
      this.activePhoto.aiDecision = decision;
    }
  }

  /**
   * Ingestion 反饋通知輔助函式：讓使用者清楚了解載入結果或未支援原因
   */
  notifyIngestionResult(loadedCount: number, actionName: string = "相片"): void {
    const summary = IngestionService.lastSummary;
    const skipped = summary?.skippedCount || 0;
    const skippedExts = summary?.skippedExtensions || [];
    const extsText =
      skippedExts.length > 0
        ? `（如 ${skippedExts
            .slice(0, 3)
            .map((e) => "." + e.toUpperCase())
            .join(", ")}${skippedExts.length > 3 ? " 等" : ""}）`
        : "";

    if (loadedCount > 0) {
      if (skipped > 0) {
        toastStore.show(
          `已成功載入 ${loadedCount} 幀底片（已略過 ${skipped} 個不支援或非影像檔案${extsText}）`,
          "info",
          4000,
        );
      } else {
        toastStore.show(`已成功載入 ${loadedCount} 幀底片 ✓`, "success", 2500);
      }
    } else {
      // 未讀到任何相片
      if (skipped > 0) {
        toastStore.show(
          `未在此${actionName}中找到支援的底片格式（已略過 ${skipped} 個不相容檔案${extsText}）。支援各大廠相機 RAW 及主流影像。`,
          "warning",
          5000,
        );
      } else {
        toastStore.show(
          `未找到相片檔案。請確認目錄或檔案是否包含支援的相機 RAW 或影像。`,
          "warning",
          4000,
        );
      }
    }
  }

  /**
   * 從檔案列表批次載入相片並進行漸進式 EXIF 解析
   */
  async loadPhotosFromItems(
    items: RawPhotoItem[],
    append = false,
  ): Promise<void> {
    if (items.length === 0) return;

    if (!append) {
      // 清理前一個相卷所佔用的 Blob URL，防止記憶體洩漏
      IngestionService.revokeAllBlobUrls();
    }
    const isTauriEnv = IngestionService.isTauri();

    // 追加模式下，過濾掉已存在於目前相卷中的相片（以檔名比對）
    let itemsToLoad = items;
    if (append && this.photoPlates.length > 0) {
      const existingNames = new Set(this.photoPlates.map((p) => p.filename));
      itemsToLoad = items.filter((item) => !existingNames.has(item.filename));
      if (itemsToLoad.length === 0) {
        toastStore.show("所選相片均已在相卷中，未有新增相片", "info", 2500);
        return;
      }
    }

    const startIndex = append ? this.photoPlates.length : 0;
    // Step 1: Instant zero-latency initialization (< 5ms) for all frames
    const loaded: PhotoPlateItem[] = itemsToLoad.map((item, i) => {
      let directUrl = "";
      if (item.fileHandle) {
        if (item.extension === "jpg" || item.extension === "jpeg") {
          directUrl = IngestionService.createTrackedBlobUrl(item.fileHandle);
        }
      } else if (!isTauriEnv && item.file_path) {
        directUrl = `/api/extract-preview?path=${encodeURIComponent(item.file_path)}`;
      }
      const frameIdx = startIndex + i + 1;
      return {
        id: `photo_${frameIdx}_${Date.now()}`,
        frameNo: item.frame_no || `${String(frameIdx).padStart(2, "0")}A`,
        filename: item.filename,
        camera: `${item.extension.toUpperCase()} 底片`,
        lens: "標準光學鏡頭",
        iso: 100,
        shutter: "--",
        aperture: "--",
        focalLength: "--",
        thumbnail: directUrl,
        sceneTag: "本機相簿幀",
        selected: !append && i === 0,
        appliedProfile: "Profile_00_StandardNatural",
        fileHandle: item.fileHandle,
        filePath: item.file_path,
        sidecarPath: item.sidecar_path,
        formatType:
          item.format_type ||
          (item.extension.toLowerCase() === "jpg" ||
          item.extension.toLowerCase() === "jpeg"
            ? "jpeg"
            : "raw"),
      };
    });

    if (append) {
      this.photoPlates = [...this.photoPlates, ...loaded];
      if (!this.activePhoto && this.photoPlates.length > 0) {
        this.activePhoto = this.photoPlates[0];
        this.photoPlates[0].selected = true;
      }
      toastStore.show(`已成功追加 ${loaded.length} 幀底片 ✓`, "success", 2500);
    } else {
      const restoredCount = SessionService.restoreSession(
        this.currentDirectoryName,
        loaded as any,
      );
      this.photoPlates = loaded;
      this.activePhoto = loaded[0];
      if (this.onCatalogLoaded) {
        this.onCatalogLoaded();
      }
      if (restoredCount > 0) {
        toastStore.show(
          `已自動恢復 ${restoredCount} 幀底片的挑圖與調色進度 ✓`,
          "info",
          3500,
        );
      }
    }

    // Step 2: Progressive enhancement for EXIF and thumbnails with controlled concurrency worker pool
    // Limits simultaneous I/O to avoid blocking system or network FUSE pipelines while keeping UI responsive
    const currentToken = ++this.loadToken;
    const CONCURRENCY = 3;
    let nextIndex = 0;

    const runWorker = async () => {
      while (nextIndex < itemsToLoad.length) {
        if (currentToken !== this.loadToken) return;
        const i = nextIndex++;
        const item = itemsToLoad[i];
        const plateIndex = startIndex + i;
        if (
          !this.photoPlates[plateIndex]?.thumbnail ||
          isTauriEnv ||
          item.fileHandle
        ) {
          try {
            const preview = await IngestionService.extractPreview(
              item.file_path,
              item.fileHandle,
            );
            if (currentToken !== this.loadToken) return;
            if (this.photoPlates[plateIndex]) {
              if (preview.blob_url || preview.jpeg_base64) {
                this.photoPlates[plateIndex].thumbnail =
                  preview.blob_url ||
                  `data:image/jpeg;base64,${preview.jpeg_base64}`;
                if (
                  this.photoPlates[plateIndex].appliedProfile &&
                  this.photoPlates[plateIndex].appliedProfile !==
                    "Profile_00_StandardNatural"
                ) {
                  thumbnailRenderService.enqueueThumbnailRender(
                    this.photoPlates[plateIndex],
                  );
                  if (this.onThumbnailEnqueue) {
                    this.onThumbnailEnqueue(this.photoPlates[plateIndex]);
                  }
                }
              }
              this.photoPlates[plateIndex].camera =
                preview.exif.camera_model ||
                this.photoPlates[plateIndex].camera;
              this.photoPlates[plateIndex].lens =
                preview.exif.lens_model || this.photoPlates[plateIndex].lens;
              this.photoPlates[plateIndex].iso =
                preview.exif.iso || this.photoPlates[plateIndex].iso;
              this.photoPlates[plateIndex].shutter =
                preview.exif.shutter_speed ||
                this.photoPlates[plateIndex].shutter;
              this.photoPlates[plateIndex].aperture =
                preview.exif.aperture || this.photoPlates[plateIndex].aperture;
              this.photoPlates[plateIndex].focalLength =
                preview.exif.focal_length ||
                this.photoPlates[plateIndex].focalLength;
              this.photoPlates[plateIndex].exposureBias =
                preview.exif.exposure_bias ?? 0.0;
              this.photoPlates[plateIndex].exposureProgram =
                preview.exif.exposure_program || "標準自動";
              this.photoPlates[plateIndex].meteringMode =
                preview.exif.metering_mode || "多重測光";
              this.photoPlates[plateIndex].colorSpace =
                preview.exif.color_space || "sRGB";
              this.photoPlates[plateIndex].flash =
                preview.exif.flash || "未擊發";
              this.photoPlates[plateIndex].asShotTemp =
                preview.exif.color_temp ?? 5500;
              this.photoPlates[plateIndex].asShotTint = preview.exif.tint ?? 0;
              this.photoPlates[plateIndex].asShotExposure =
                preview.exif.exposure_bias ?? 0.0;
              this.latestExtractionMs = preview.extraction_time_ms || 18;

              // 若剛好是當前活躍檢視相片，且尚未調整過，立即同步載入相機拍攝原值
              if (
                this.activePhoto &&
                this.activePhoto.id === this.photoPlates[plateIndex].id &&
                !this.activePhoto.tuning
              ) {
                this.activePhoto = { ...this.photoPlates[plateIndex] };
                darkroomState.colorTemp =
                  this.photoPlates[plateIndex].asShotTemp ?? 5500;
                darkroomState.tint =
                  this.photoPlates[plateIndex].asShotTint ?? 0.0;
                darkroomState.exposure =
                  this.photoPlates[plateIndex].asShotExposure ?? 0.0;
              }
            }
          } catch (err) {
            console.warn(
              `[PhotoLibrary] 解析相片預覽失敗 (${item.filename}):`,
              err,
            );
          }
        }
      }
    };

    const workerCount = Math.min(itemsToLoad.length, CONCURRENCY);
    for (let w = 0; w < workerCount; w++) {
      runWorker();
    }
  }

  /**
   * 單張實體刪除磁碟底片檔案（移至資源回收筒 / 廢紙簍）
   */
  async handleDeletePhotoFromDisk(photo: PhotoPlateItem): Promise<void> {
    await this.handleBatchDeletePhotosFromDisk([photo]);
  }

  /**
   * 批次實體刪除磁碟底片檔案（移至資源回收筒 / 廢紙簍）
   */
  async handleBatchDeletePhotosFromDisk(
    photos: PhotoPlateItem[],
  ): Promise<void> {
    if (!photos || photos.length === 0) return;

    const count = photos.length;
    const names =
      photos
        .slice(0, 3)
        .map((p) => p.filename)
        .join("、") + (count > 3 ? ` 等共 ${count} 幀` : "");

    let confirmed = false;
    if (IngestionService.isTauri()) {
      try {
        const { confirm } = await import("@tauri-apps/plugin-dialog");
        confirmed = await confirm(
          `確定要將以下底片自電腦磁碟刪除（移至資源回收筒 / 廢紙簍）嗎？\n\n${names}\n\n此操作將從磁碟移除檔案！`,
          {
            title: "磁碟實體刪除確認",
            kind: "warning",
            okLabel: "移至回收筒",
            cancelLabel: "取消",
          },
        );
      } catch (err) {
        console.warn(
          "Tauri confirm dialog failed, fallback to window.confirm:",
          err,
        );
        confirmed = window.confirm(
          `⚠️ 【磁碟實體刪除確認】\n\n確定要將以下底片自電腦磁碟刪除（移至資源回收筒 / 廢紙簍）嗎？\n\n${names}\n\n此操作將從磁碟移除檔案！`,
        );
      }
    } else {
      confirmed = window.confirm(
        `⚠️ 【磁碟實體刪除確認】\n\n確定要將以下底片自電腦磁碟刪除（移至資源回收筒 / 廢紙簍）嗎？\n\n${names}\n\n此操作將從磁碟移除檔案！`,
      );
    }
    if (!confirmed) return;

    let deletedCount = 0;
    let failedCount = 0;

    for (const p of photos) {
      if (p.filePath) {
        try {
          await IngestionService.deleteDiskFile(p.filePath);
          deletedCount++;
        } catch (err) {
          console.error(`刪除磁碟檔案失敗 (${p.filePath}):`, err);
          failedCount++;
        }
      } else {
        failedCount++;
      }
    }

    // 磁碟刪除成功後，直接自相卷清單移除（切勿呼叫 handleBatchRemovePhotos，以避免產生復原棧與排除提示）
    const idSet = new Set(photos.map((p) => p.id));
    let nextActive: PhotoPlateItem | null = this.activePhoto;
    if (this.activePhoto && idSet.has(this.activePhoto.id)) {
      const remaining = this.photoPlates.filter((p) => !idSet.has(p.id));
      if (remaining.length > 0) {
        const curIndex = this.photoPlates.findIndex(
          (p) => p.id === this.activePhoto!.id,
        );
        const nextIndex = Math.min(curIndex, remaining.length - 1);
        nextActive = remaining[Math.max(0, nextIndex)];
        nextActive.selected = true;
      } else {
        nextActive = null;
      }
    }
    this.photoPlates = this.photoPlates.filter((p) => !idSet.has(p.id));
    this.activePhoto = nextActive;

    if (deletedCount > 0) {
      toastStore.show(
        `已將 ${deletedCount} 幀底片移入資源回收筒 / 廢紙簍 🗑️`,
        "success",
        3500,
      );
    }
    if (failedCount > 0) {
      toastStore.show(
        `${failedCount} 幀底片無實體磁碟路徑或刪除失敗`,
        "error",
        4000,
      );
    }
  }

  /**
   * 從工作區相卷排除單張相片
   */
  handleRemovePhoto(photoId: string): void {
    this.handleBatchRemovePhotos([photoId]);
  }

  /**
   * 從工作區相卷批次排除相片（支援復原）
   */
  handleBatchRemovePhotos(photoIds: string[]): void {
    if (!photoIds || photoIds.length === 0) return;
    const idSet = new Set(photoIds);

    // 依序記錄被排除相片及其原始索引位置，以便復原時精準插回原序
    const toRemoveWithIndex: RemovedPhotoItemSnapshot[] = [];
    this.photoPlates.forEach((p, idx) => {
      if (idSet.has(p.id)) {
        toRemoveWithIndex.push({ photo: p, originalIndex: idx });
      }
    });
    if (toRemoveWithIndex.length === 0) return;

    this.lastRemovedSnapshot = {
      items: toRemoveWithIndex,
      prevActiveId: this.activePhoto?.id || null,
    };

    // 若作用中相片被移除，自動聚焦至下一張相鄰底片
    let nextActive: PhotoPlateItem | null = this.activePhoto;
    if (this.activePhoto && idSet.has(this.activePhoto.id)) {
      const remaining = this.photoPlates.filter((p) => !idSet.has(p.id));
      if (remaining.length > 0) {
        const curIndex = this.photoPlates.findIndex(
          (p) => p.id === this.activePhoto!.id,
        );
        const nextIndex = Math.min(curIndex, remaining.length - 1);
        nextActive = remaining[Math.max(0, nextIndex)];
        nextActive.selected = true;
      } else {
        nextActive = null;
      }
    }

    this.photoPlates = this.photoPlates.filter((p) => !idSet.has(p.id));
    this.activePhoto = nextActive;

    toastStore.show(
      `已自相卷排除 ${toRemoveWithIndex.length} 幀底片`,
      "info",
      5000,
      {
        label: "復原 ↺",
        onClick: () => this.handleUndoRemove(),
      },
    );
  }

  /**
   * 原位復原剛才被排除的相片
   */
  handleUndoRemove(): void {
    if (
      !this.lastRemovedSnapshot ||
      this.lastRemovedSnapshot.items.length === 0
    )
      return;
    const restoredItems = this.lastRemovedSnapshot.items;

    // 依原始索引升冪排序，並依序精準插回相卷原始位置（保持載入順序不變）
    const nextPlates = [...this.photoPlates];
    const sorted = [...restoredItems].sort(
      (a, b) => a.originalIndex - b.originalIndex,
    );
    for (const item of sorted) {
      const insertAt = Math.min(
        Math.max(0, item.originalIndex),
        nextPlates.length,
      );
      nextPlates.splice(insertAt, 0, item.photo);
    }

    this.photoPlates = nextPlates;

    if (this.lastRemovedSnapshot.prevActiveId) {
      const found = this.photoPlates.find(
        (p) => p.id === this.lastRemovedSnapshot!.prevActiveId,
      );
      if (found) {
        this.activePhoto = found;
        found.selected = true;
      }
    }

    toastStore.show(
      `已原位復原 ${restoredItems.length} 幀底片 ✓`,
      "success",
      2500,
    );
    this.lastRemovedSnapshot = null;
  }

  /**
   * 選擇本機目錄匯入相片（取代現有相卷）
   */
  async handlePickDirectory(): Promise<void> {
    this.isLoadingPhotos = true;
    try {
      const items = await IngestionService.pickWebDirectory();
      if (items.length > 0) {
        this.currentDirectoryName =
          IngestionService.currentDirectoryName || "相片資料夾";
        await this.loadPhotosFromItems(items, false);
      }
      this.notifyIngestionResult(items.length, "目錄");
    } finally {
      this.isLoadingPhotos = false;
    }
  }

  /**
   * 追加目錄至現有相卷
   */
  async handleAppendDirectory(): Promise<void> {
    this.isLoadingPhotos = true;
    try {
      const items = await IngestionService.pickWebDirectory();
      if (items.length > 0) {
        await this.loadPhotosFromItems(items, true);
      }
      this.notifyIngestionResult(items.length, "目錄");
    } finally {
      this.isLoadingPhotos = false;
    }
  }

  /**
   * 追加個別檔案至現有相卷
   */
  async handleAppendFiles(): Promise<void> {
    this.isLoadingPhotos = true;
    try {
      const items = await IngestionService.pickWebFiles();
      if (items.length > 0) {
        await this.loadPhotosFromItems(items, true);
      }
      this.notifyIngestionResult(items.length, "選取項目");
    } finally {
      this.isLoadingPhotos = false;
    }
  }

  /**
   * 透過路徑直接載入目錄（自最近目錄清單）
   */
  async handleLoadDirectoryByPath(path: string): Promise<void> {
    if (!path) return;
    this.isLoadingPhotos = true;
    try {
      const items = await IngestionService.scanDirectory(path);
      if (items.length > 0) {
        this.currentDirectoryName =
          IngestionService.currentDirectoryName || "相片資料夾";
        await this.loadPhotosFromItems(items, false);
      }
      this.notifyIngestionResult(items.length, "目錄");
    } finally {
      this.isLoadingPhotos = false;
    }
  }

  /**
   * 處理自作業系統桌面或檔案總管拖放的檔案/目錄
   */
  async handleFilesDropped(dataTransfer: DataTransfer): Promise<void> {
    this.isLoadingPhotos = true;
    try {
      const items = await IngestionService.processDataTransfer(dataTransfer);
      if (items.length > 0) {
        this.currentDirectoryName =
          IngestionService.currentDirectoryName || "拖放相片集";
        await this.loadPhotosFromItems(items, false);
      }
      this.notifyIngestionResult(items.length, "拖放內容");
    } catch (err) {
      console.warn("Drag and drop ingestion failed:", err);
      toastStore.show("載入相片失敗，請重試", "error", 3000);
    } finally {
      this.isLoadingPhotos = false;
    }
  }

  /**
   * 載入相機掛載點相片
   */
  async handleLoadCameraMount(mount: CameraMountInfo): Promise<void> {
    const targetPath = mount.dcim_path || mount.mount_path;
    this.isLoadingPhotos = true;
    try {
      const items = await IngestionService.scanDirectory(targetPath);
      if (items.length > 0) {
        this.currentDirectoryName =
          mount.volume_name ||
          IngestionService.currentDirectoryName ||
          "相機外接裝置";
        await this.loadPhotosFromItems(items, false);
      }
      this.notifyIngestionResult(items.length, "相機裝置");
    } finally {
      this.isLoadingPhotos = false;
    }
  }

  /**
   * 智慧處理：頂部全域目錄與相機切換
   */
  async handleSelectMountOrDirectory(): Promise<void> {
    if (this.cameraMounts.length > 0) {
      const camera = this.cameraMounts[0];
      if (this.photoPlates.length > 0) {
        const confirmLoad = window.confirm(
          `【偵測到外接相機連線】\n相機名稱：${camera.volume_name}\n可載入底片：${camera.file_count} 幀 RAW\n\n點擊「確定」載入此相機相卷\n點擊「取消」瀏覽挑選其他本機目錄`,
        );
        if (confirmLoad) {
          await this.handleLoadCameraMount(camera);
          return;
        } else {
          await this.handlePickDirectory();
          return;
        }
      } else {
        await this.handleLoadCameraMount(camera);
        return;
      }
    }
    await this.handlePickDirectory();
  }
}

export const photoLibrary = new PhotoLibraryStore();
