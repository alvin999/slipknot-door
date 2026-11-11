/**
 * 相片典藏庫狀態管理模組 (Photo Library Store)
 * 負責管理工作區相片陣列、作用中相片、挑圖旗標、相機硬體掛載與目錄載入。
 * 遵循 Svelte 5 Runes ($state, $derived) 響應式規範。
 */

import { IngestionService, type CameraMountInfo, type RawPhotoItem } from "$lib/services/ingestionService";
import type { AiSceneDecision } from "$lib/services/aiSceneService";
import type { CropGeometry, TuningParameters, AiTuningSnapshot } from "$lib/types/photo";

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
  formatType?: 'raw' | 'jpeg' | 'pair';
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
    hsl?: import("$lib/types/photo").HslAdjustments;
  };
}

export class PhotoLibraryStore {
  // 核心相片陣列與當前作用中相片
  photoPlates = $state<PhotoPlateItem[]>([]);
  activePhoto = $state<PhotoPlateItem | null>(null);
  isLoadingPhotos = $state<boolean>(false);

  // 硬體相機掛載狀態
  cameraMounts = $state<CameraMountInfo[]>([]);
  isScanningMounts = $state<boolean>(false);
  latestExtractionMs = $state<number>(18);
  private loadToken: number = 0;

  // 縮圖著色背景回呼通知（由 Darkroom/WebGL 離線渲染器註冊）
  onThumbnailEnqueue: ((plate: PhotoPlateItem) => void) | null = null;

  // 衍生佇列：若有挑圖 (flagged)，精修與匯出僅聚焦選取的相片；若無選取則全部顯示
  activeQueue = $derived<PhotoPlateItem[]>(
    this.photoPlates.filter((p) => p.flagged).length > 0
      ? this.photoPlates.filter((p) => p.flagged)
      : this.photoPlates
  );

  // 已標記挑圖的相片數量
  flaggedCount = $derived<number>(
    this.photoPlates.filter((p) => p.flagged).length
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
   * 設定特定相片為作用中相片並更新選取狀態
   */
  setActivePhoto(plate: PhotoPlateItem): void {
    this.activePhoto = plate;
    this.photoPlates.forEach((p) => {
      p.selected = p.id === plate.id;
    });
  }

  /**
   * 切換至相鄰相片 (Vim 快捷鍵或方向鍵)
   */
  selectAdjacentPhoto(delta: number, onPhotoChanging?: () => void): void {
    if (this.activeQueue.length === 0) return;
    const currentIndex = this.activeQueue.findIndex(
      (p) => p.id === this.activePhoto?.id
    );
    let nextIndex = currentIndex + delta;
    if (nextIndex < 0) nextIndex = this.activeQueue.length - 1;
    if (nextIndex >= this.activeQueue.length) nextIndex = 0;

    const targetPlate = this.activeQueue[nextIndex];
    if (targetPlate) {
      if (onPhotoChanging) onPhotoChanging();
      this.setActivePhoto(targetPlate);
    }
  }

  /**
   * 更新特定相片的調色與裁切資料並同步陣列
   */
  updatePhotoSettings(
    id: string,
    tuning?: PhotoPlateItem["tuning"],
    crop?: CropGeometry
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
   * 從檔案列表批次載入相片並進行漸進式 EXIF 解析
   */
  async loadPhotosFromItems(items: RawPhotoItem[]): Promise<void> {
    if (items.length === 0) return;

    // 清理舊相卷佔用的 Blob URL 記憶體
    IngestionService.revokeAllBlobUrls();

    const isTauriEnv = IngestionService.isTauri();

    // 步驟 1: 即時零延遲初始化 (< 5ms) 所有畫格
    const loaded: PhotoPlateItem[] = items.map((item, i) => {
      let directUrl = "";
      if (item.fileHandle) {
        if (item.extension === "jpg" || item.extension === "jpeg") {
          directUrl = IngestionService.createTrackedBlobUrl(item.fileHandle);
        }
      } else if (!isTauriEnv && item.file_path) {
        directUrl = `/api/extract-preview?path=${encodeURIComponent(item.file_path)}`;
      }
      return {
        id: `photo_${i + 1}`,
        frameNo: item.frame_no,
        filename: item.filename,
        camera: `${item.extension.toUpperCase()} 底片`,
        lens: "標準光學鏡頭",
        iso: 100,
        shutter: "--",
        aperture: "--",
        focalLength: "--",
        thumbnail: directUrl,
        sceneTag: "本機相簿幀",
        selected: i === 0,
        appliedProfile: "Profile_00_StandardNatural",
        fileHandle: item.fileHandle,
        filePath: item.file_path,
        sidecarPath: item.sidecar_path,
        formatType: item.format_type || (item.extension.toLowerCase() === "jpg" || item.extension.toLowerCase() === "jpeg" ? "jpeg" : "raw"),
      };
    });

    this.photoPlates = loaded;
    this.activePhoto = loaded[0];

    // 步驟 2: 以受控並行池（限制 3 個 worker 並行）漸進式解析 EXIF 與縮圖
    // 避免瞬間發起過量 I/O 卡死系統或網路檔案系統（如雲端掛載），同時保證畫面順暢響應
    const currentToken = ++this.loadToken;
    const CONCURRENCY = 3;
    let nextIndex = 0;

    const runWorker = async () => {
      while (nextIndex < items.length) {
        if (currentToken !== this.loadToken) return;
        const i = nextIndex++;
        const item = items[i];
        if (!this.photoPlates[i]?.thumbnail || isTauriEnv || item.fileHandle) {
          try {
            const preview = await IngestionService.extractPreview(
              item.file_path,
              item.fileHandle
            );
            if (currentToken !== this.loadToken) return;
            if (this.photoPlates[i]) {
              if (preview.blob_url || preview.jpeg_base64) {
                this.photoPlates[i].thumbnail =
                  preview.blob_url ||
                  `data:image/jpeg;base64,${preview.jpeg_base64}`;
                if (
                  this.photoPlates[i].appliedProfile &&
                  this.photoPlates[i].appliedProfile !==
                    "Profile_00_StandardNatural" &&
                  this.onThumbnailEnqueue
                ) {
                  this.onThumbnailEnqueue(this.photoPlates[i]);
                }
              }
              this.photoPlates[i].camera =
                preview.exif.camera_model || this.photoPlates[i].camera;
              this.photoPlates[i].lens =
                preview.exif.lens_model || this.photoPlates[i].lens;
              this.photoPlates[i].iso =
                preview.exif.iso || this.photoPlates[i].iso;
              this.photoPlates[i].shutter =
                preview.exif.shutter_speed || this.photoPlates[i].shutter;
              this.photoPlates[i].aperture =
                preview.exif.aperture || this.photoPlates[i].aperture;
              this.photoPlates[i].focalLength =
                preview.exif.focal_length || this.photoPlates[i].focalLength;
              this.photoPlates[i].exposureBias = preview.exif.exposure_bias ?? 0.0;
              this.photoPlates[i].exposureProgram =
                preview.exif.exposure_program || "標準自動";
              this.photoPlates[i].meteringMode =
                preview.exif.metering_mode || "多重測光";
              this.photoPlates[i].colorSpace = preview.exif.color_space || "sRGB";
              this.photoPlates[i].flash = preview.exif.flash || "未擊發";
              this.photoPlates[i].asShotTemp = preview.exif.color_temp ?? 5500;
              this.photoPlates[i].asShotTint = preview.exif.tint ?? 0;
              this.photoPlates[i].asShotExposure =
                preview.exif.exposure_bias ?? 0.0;
              this.latestExtractionMs = preview.extraction_time_ms || 18;

              // 若剛好是當前活躍檢視相片，且尚未調整過，立即同步載入相機拍攝原值
              if (
                this.activePhoto &&
                this.activePhoto.id === this.photoPlates[i].id &&
                !this.activePhoto.tuning
              ) {
                this.activePhoto = { ...this.photoPlates[i] };
              }
            }
          } catch (err) {
            console.warn(`[PhotoLibrary] 解析相片預覽失敗 (${item.filename}):`, err);
          }
        }
      }
    };

    const workerCount = Math.min(items.length, CONCURRENCY);
    for (let w = 0; w < workerCount; w++) {
      runWorker();
    }
  }

  /**
   * 選擇本機目錄匯入相片
   */
  async handlePickDirectory(): Promise<void> {
    this.isLoadingPhotos = true;
    try {
      const items = await IngestionService.pickWebDirectory();
      await this.loadPhotosFromItems(items);
    } catch (err) {
      console.error("載入目錄失敗:", err);
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
      await this.loadPhotosFromItems(items);
    } catch (err) {
      console.error("載入相機掛載失敗:", err);
    } finally {
      this.isLoadingPhotos = false;
    }
  }
}

export const photoLibrary = new PhotoLibraryStore();
