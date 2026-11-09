/**
 * 暗房影像調色與幾何幾構圖狀態模組 (Darkroom State Store)
 * 負責維護暗房調色滑桿、WebGL 3D LUT 渲染參數、A/B 簾幕比對、幾何構圖裁切與意境關鍵字。
 * 遵循 Svelte 5 Runes ($state, $derived) 響應式規範。
 */

import type { CropGeometry, TuningParameters } from "$lib/types/photo";
import type { PhotoPlateItem } from "./photoLibrary.svelte";
import type { StyleKeywordId } from "$lib/services/ai/types";
import { composeStyleKeywordPrompt, STYLE_KEYWORD_ENTRIES } from "$lib/services/ai/styleDirectives";

export type DiffMode = "off" | "split" | "sideBySide";
export type CropRatioPreset = "original" | "1:1" | "4:5" | "16:9" | "9:16" | "free";

export interface DarkroomHistorySnapshot {
  exposure: number;
  contrast: number;
  shadows: number;
  lutIntensity: number;
  colorTemp: number;
  tint: number;
  clarity: number;
  sharpness: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  cropRotation: number;
  keystoneV: number;
  keystoneH: number;
  cropAspectRatio: CropRatioPreset;
  flipH: boolean;
  flipV: boolean;
}

export interface StylePresetDefinition {
  key: string;
  badge: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  accent: string;
  profileId?: string;
}

export interface ProfileLutItem {
  id: string;
  title: string;
  tone: string;
  badge: string;
  accent: string;
  evDefault: number;
  contrastDefault: number;
  highlightsDefault: number;
  shadowsDefault: number;
  fadeDefault: number;
  cyanSkyDefault: number;
  foliageDefault: number;
  lutIntensityDefault: number;
  clarityDefault: number;
  sharpnessDefault: number;
  recommendedScene: string;
}

export class DarkroomStateStore {
  // 歷史操作記錄棧 (Undo / Redo History)
  historyStack = $state<DarkroomHistorySnapshot[]>([]);
  historyIndex = $state<number>(-1);
  private isTraversingHistory = false;
  private historyDebounceTimer: any = null;

  get canUndo(): boolean {
    return this.historyIndex > 0;
  }

  get canRedo(): boolean {
    return this.historyIndex >= 0 && this.historyIndex < this.historyStack.length - 1;
  }

  // 基礎光影控制 (Tonal Parameters)
  exposure = $state<number>(0.0);
  contrast = $state<number>(0.0);
  highlights = $state<number>(0.0);
  shadows = $state<number>(0.0);
  fade = $state<number>(0.0);

  // 白平衡與飽和度 (Color & White Balance)
  colorTemp = $state<number>(5500);
  tint = $state<number>(0.0);
  saturation = $state<number>(0.0);
  vibrance = $state<number>(0.0);

  // 光學氛圍與質地 (Atmosphere & Texture)
  cyanSkyShift = $state<number>(0.0);
  foliageEmerald = $state<number>(0.0);
  lutIntensity = $state<number>(1.0);
  clarity = $state<number>(0.0);
  sharpness = $state<number>(0.0);

  // A/B 原始與比對狀態 (Curatorial Diff Engine)
  showABComparison = $state<boolean>(false);
  diffMode = $state<DiffMode>("off");
  splitPosition = $state<number>(50); // 0% ~ 100% 簾幕分割線位置
  isDraggingSplit = $state<boolean>(false);

  // 畫布縮放與平移檢視狀態 (Zoom & Pan Navigation)
  zoomLevel = $state<number>(1.0); // 1.0 = 適合視窗 (Fit), > 1.0 = 放大檢視 (如 1.8x, 2.0x, 3.0x)
  panX = $state<number>(0);        // 平移 X 軸像素位移
  panY = $state<number>(0);        // 平移 Y 軸像素位移
  isPanning = $state<boolean>(false);

  // 調色參數剪貼簿 (跨相片快速複製貼上)
  copiedTuning = $state<{
    appliedProfile: string;
    tuning: TuningParameters;
  } | null>(null);

  // 幾何構圖與裁切狀態 (Crop & Keystone Geometry)
  isCropMode = $state<boolean>(false);
  cropX = $state<number>(0.0); // 0.0 ~ 1.0 (左上角 X 比例)
  cropY = $state<number>(0.0); // 0.0 ~ 1.0 (左上角 Y 比例)
  cropWidth = $state<number>(1.0); // 0.0 ~ 1.0 (寬度比例)
  cropHeight = $state<number>(1.0); // 0.0 ~ 1.0 (高度比例)
  cropRotation = $state<number>(0.0); // -45 ~ +45 度 (水平校正)
  keystoneV = $state<number>(0.0); // -45 ~ +45 度 (垂直透視梯形)
  keystoneH = $state<number>(0.0); // -45 ~ +45 度 (水平透視梯形)
  cropAspectRatio = $state<CropRatioPreset>("original");
  flipH = $state<boolean>(false);
  flipV = $state<boolean>(false);
  aiCropRationale = $state<string>("");
  isDraggingCrop = $state<string | null>(null);

  // 風格預設與關鍵字 (Style Grading & Vibe Keywords)
  activeStylePreset = $state<string>("auto");
  previewHoverProfileId = $state<string | null>(null);
  selectedStyleKeywords = $state<StyleKeywordId[]>([]);
  keywordOverrides = $state<Record<string, string>>({});
  editingKeywordId = $state<string | null>(null);
  customStylePrompt = $state<string>("");

  /**
   * 判定比對模式是否啟用
   */
  isDiffModeActive(mode: DiffMode): boolean {
    return this.diffMode === mode;
  }

  /**
   * 設定比對模式
   */
  setDiffMode(mode: DiffMode): void {
    this.diffMode = mode;
    if (mode === "split" || mode === "sideBySide") {
      this.showABComparison = false;
    }
  }

  /**
   * 切換意境風格關鍵字晶片（Textbox 留給使用者，不再連動改寫）
   */
  toggleStyleKeyword(id: StyleKeywordId): void {
    if (this.selectedStyleKeywords.includes(id)) {
      this.selectedStyleKeywords = this.selectedStyleKeywords.filter((k) => k !== id);
      if (this.editingKeywordId === id) {
        this.editingKeywordId = null;
      }
    } else {
      this.selectedStyleKeywords = [...this.selectedStyleKeywords, id];
    }
  }

  /**
   * 移除單一已選取的風格標籤
   */
  removeStyleKeyword(id: StyleKeywordId): void {
    this.selectedStyleKeywords = this.selectedStyleKeywords.filter((k) => k !== id);
    if (this.editingKeywordId === id) {
      this.editingKeywordId = null;
    }
  }

  /**
   * 開始編輯指定標籤的指令內容
   */
  startEditingKeyword(id: StyleKeywordId): void {
    if (!this.keywordOverrides[id]) {
      const entry = STYLE_KEYWORD_ENTRIES.find((k) => k.id === id);
      if (entry?.promptEnglish) {
        this.keywordOverrides[id] = entry.promptEnglish;
      }
    }
    this.editingKeywordId = id;
  }

  /**
   * 完成編輯指定標籤
   */
  stopEditingKeyword(): void {
    this.editingKeywordId = null;
  }

  /**
   * 更新指定標籤的自訂指令
   */
  updateKeywordOverride(id: StyleKeywordId, text: string): void {
    this.keywordOverrides[id] = text;
  }

  /**
   * 還原指定標籤為預設指令
   */
  resetKeywordOverride(id: StyleKeywordId): void {
    const next = { ...this.keywordOverrides };
    delete next[id];
    this.keywordOverrides = next;
  }

  /**
   * 取得指定標籤目前的生效指令
   */
  getKeywordDirective(id: StyleKeywordId): string {
    if (this.keywordOverrides[id] !== undefined) {
      return this.keywordOverrides[id];
    }
    const entry = STYLE_KEYWORD_ENTRIES.find((k) => k.id === id);
    return entry?.promptEnglish || "";
  }

  /**
   * 取得所有生效中的標籤指令清單
   */
  getActiveDirectives(): string[] {
    return this.selectedStyleKeywords
      .map((id) => this.getKeywordDirective(id))
      .filter((d) => d.trim().length > 0);
  }

  /**
   * 清除意境風格關鍵字與自訂輸入
   */
  clearStyleKeywords(): void {
    this.selectedStyleKeywords = [];
    this.keywordOverrides = {};
    this.editingKeywordId = null;
    this.customStylePrompt = "";
  }

  /**
   * 重設幾何裁切與水平狀態
   */
  resetCropState(): void {
    this.cropX = 0.0;
    this.cropY = 0.0;
    this.cropWidth = 1.0;
    this.cropHeight = 1.0;
    this.cropRotation = 0.0;
    this.keystoneV = 0.0;
    this.keystoneH = 0.0;
    this.cropAspectRatio = "original";
    this.flipH = false;
    this.flipV = false;
    this.aiCropRationale = "";
  }

  /**
   * 重設調色參數為標準值
   */
  resetTuningParams(): void {
    this.exposure = 0.0;
    this.contrast = 0.0;
    this.highlights = 0.0;
    this.shadows = 0.0;
    this.fade = 0.0;
    this.colorTemp = 5500;
    this.tint = 0.0;
    this.saturation = 0.0;
    this.vibrance = 0.0;
    this.cyanSkyShift = 0.0;
    this.foliageEmerald = 0.0;
    this.lutIntensity = 1.0;
    this.clarity = 0.0;
    this.sharpness = 0.0;
  }

  /**
   * 回歸拍攝原生參數 (As Shot)
   */
  resetToAsShot(photo: PhotoPlateItem | null): void {
    if (!photo) return;
    this.exposure = photo.asShotExposure ?? 0.0;
    this.contrast = 0.0;
    this.highlights = 0.0;
    this.shadows = 0.0;
    this.fade = 0.0;
    this.colorTemp = photo.asShotTemp ?? 5500;
    this.tint = photo.asShotTint ?? 0.0;
    this.saturation = 0.0;
    this.vibrance = 0.0;
    this.cyanSkyShift = 0.0;
    this.foliageEmerald = 0.0;
    this.lutIntensity = 1.0;
    this.clarity = 0.0;
    this.sharpness = 0.0;
  }

  /**
   * 載入指定相片的調色與裁切設定
   */
  /**
   * 擷取當前所有調色與裁切狀態之快照
   */
  captureSnapshot(): DarkroomHistorySnapshot {
    return {
      exposure: this.exposure,
      contrast: this.contrast,
      shadows: this.shadows,
      lutIntensity: this.lutIntensity,
      colorTemp: this.colorTemp,
      tint: this.tint,
      clarity: this.clarity,
      sharpness: this.sharpness,
      cropX: this.cropX,
      cropY: this.cropY,
      cropWidth: this.cropWidth,
      cropHeight: this.cropHeight,
      cropRotation: this.cropRotation,
      keystoneV: this.keystoneV,
      keystoneH: this.keystoneH,
      cropAspectRatio: this.cropAspectRatio,
      flipH: this.flipH,
      flipV: this.flipV,
    };
  }

  /**
   * 將快照還原至當前暗房狀態
   */
  applySnapshot(snap: DarkroomHistorySnapshot): void {
    this.isTraversingHistory = true;
    this.exposure = snap.exposure;
    this.contrast = snap.contrast;
    this.shadows = snap.shadows;
    this.lutIntensity = snap.lutIntensity;
    this.colorTemp = snap.colorTemp;
    this.tint = snap.tint;
    this.clarity = snap.clarity;
    this.sharpness = snap.sharpness;
    this.cropX = snap.cropX;
    this.cropY = snap.cropY;
    this.cropWidth = snap.cropWidth;
    this.cropHeight = snap.cropHeight;
    this.cropRotation = snap.cropRotation;
    this.keystoneV = snap.keystoneV;
    this.keystoneH = snap.keystoneH;
    this.cropAspectRatio = snap.cropAspectRatio;
    this.flipH = snap.flipH;
    this.flipV = snap.flipV;

    setTimeout(() => {
      this.isTraversingHistory = false;
    }, 60);
  }

  /**
   * 初始化歷史棧（載入相片時重置）
   */
  initHistory(): void {
    const initial = this.captureSnapshot();
    this.historyStack = [initial];
    this.historyIndex = 0;
  }

  /**
   * 記錄歷史快照（支援防抖與即刻記錄）
   */
  recordSnapshot(immediate = false): void {
    if (this.isTraversingHistory) return;

    const doRecord = () => {
      if (this.isTraversingHistory) return;
      const current = this.captureSnapshot();
      const prev = this.historyStack[this.historyIndex];

      if (prev && this.isSnapshotEqual(prev, current)) {
        return;
      }

      // 截斷分支歷史並推入新快照
      const newHistory = this.historyStack.slice(0, this.historyIndex + 1);
      newHistory.push(current);

      // 上限保留 30 步歷史
      if (newHistory.length > 30) {
        newHistory.shift();
      }

      this.historyStack = newHistory;
      this.historyIndex = newHistory.length - 1;
    };

    if (immediate) {
      if (this.historyDebounceTimer) {
        clearTimeout(this.historyDebounceTimer);
        this.historyDebounceTimer = null;
      }
      doRecord();
    } else {
      if (this.historyDebounceTimer) {
        clearTimeout(this.historyDebounceTimer);
      }
      this.historyDebounceTimer = setTimeout(() => {
        doRecord();
        this.historyDebounceTimer = null;
      }, 300);
    }
  }

  private isSnapshotEqual(a: DarkroomHistorySnapshot, b: DarkroomHistorySnapshot): boolean {
    return (
      Math.abs(a.exposure - b.exposure) < 0.001 &&
      Math.abs(a.contrast - b.contrast) < 0.001 &&
      Math.abs(a.shadows - b.shadows) < 0.001 &&
      Math.abs(a.lutIntensity - b.lutIntensity) < 0.001 &&
      Math.abs(a.colorTemp - b.colorTemp) < 1 &&
      Math.abs(a.tint - b.tint) < 0.001 &&
      Math.abs(a.clarity - b.clarity) < 0.001 &&
      Math.abs(a.sharpness - b.sharpness) < 0.001 &&
      Math.abs(a.cropX - b.cropX) < 0.001 &&
      Math.abs(a.cropY - b.cropY) < 0.001 &&
      Math.abs(a.cropWidth - b.cropWidth) < 0.001 &&
      Math.abs(a.cropHeight - b.cropHeight) < 0.001 &&
      Math.abs(a.cropRotation - b.cropRotation) < 0.01 &&
      Math.abs(a.keystoneV - b.keystoneV) < 0.01 &&
      Math.abs(a.keystoneH - b.keystoneH) < 0.01 &&
      a.cropAspectRatio === b.cropAspectRatio &&
      a.flipH === b.flipH &&
      a.flipV === b.flipV
    );
  }

  /**
   * 復原至上一快照 (Undo)
   */
  undo(): boolean {
    if (!this.canUndo) return false;
    this.historyIndex--;
    this.applySnapshot(this.historyStack[this.historyIndex]);
    return true;
  }

  /**
   * 重做下一快照 (Redo)
   */
  redo(): boolean {
    if (!this.canRedo) return false;
    this.historyIndex++;
    this.applySnapshot(this.historyStack[this.historyIndex]);
    return true;
  }

  /**
   * 單項參數雙擊歸零專用方法
   */
  resetExposure(): void { this.exposure = 0.0; this.recordSnapshot(true); }
  resetContrast(): void { this.contrast = 0.0; this.recordSnapshot(true); }
  resetShadows(): void { this.shadows = 0.0; this.recordSnapshot(true); }
  resetLutIntensity(): void { this.lutIntensity = 1.0; this.recordSnapshot(true); }
  resetColorTemp(def = 5500): void { this.colorTemp = def; this.recordSnapshot(true); }
  resetTint(def = 0.0): void { this.tint = def; this.recordSnapshot(true); }
  resetClarity(): void { this.clarity = 0.0; this.recordSnapshot(true); }
  resetSharpness(): void { this.sharpness = 0.0; this.recordSnapshot(true); }
  resetRotation(): void { this.cropRotation = 0.0; this.recordSnapshot(true); }
  resetKeystone(): void { this.keystoneV = 0.0; this.keystoneH = 0.0; this.recordSnapshot(true); }

  loadFromPhoto(photo: PhotoPlateItem): void {
    if (photo.tuning) {
      this.exposure = photo.tuning.exposure;
      this.contrast = photo.tuning.contrast;
      this.shadows = photo.tuning.shadows ?? 0;
      this.lutIntensity = photo.tuning.lutIntensity;
      this.colorTemp = photo.tuning.colorTemp;
      this.tint = photo.tuning.tint ?? 0;
      this.clarity = photo.tuning.clarity ?? 0;
      this.sharpness = photo.tuning.sharpness ?? 0;
    } else {
      this.exposure = photo.asShotExposure ?? 0.0;
      this.contrast = 0.0;
      this.shadows = 0.0;
      this.lutIntensity = 1.0;
      this.colorTemp = photo.asShotTemp ?? 5500;
      this.tint = photo.asShotTint ?? 0.0;
      this.clarity = 0.0;
      this.sharpness = 0.0;
    }

    if (photo.crop) {
      this.cropX = photo.crop.x;
      this.cropY = photo.crop.y;
      this.cropWidth = photo.crop.width;
      this.cropHeight = photo.crop.height;
      this.cropRotation = photo.crop.rotation;
      this.keystoneV = photo.crop.keystoneV ?? 0;
      this.keystoneH = photo.crop.keystoneH ?? 0;
      this.cropAspectRatio = photo.crop.aspectRatio;
      this.flipH = photo.crop.flipH;
      this.flipV = photo.crop.flipV;
      this.aiCropRationale = photo.crop.rationale || "";
    } else {
      this.resetCropState();
    }
    this.initHistory();
  }

  /**
   * 檢查當前調色是否為預設無微調狀態
   */
  isDefaultTuning(photo: PhotoPlateItem | null): boolean {
    const asShotTemp = photo?.asShotTemp ?? 5500;
    const asShotExp = photo?.asShotExposure ?? 0.0;
    const asShotTint = photo?.asShotTint ?? 0.0;

    return (
      Math.abs(this.exposure - asShotExp) < 0.001 &&
      Math.abs(this.contrast - 0.0) < 0.001 &&
      Math.abs(this.shadows - 0.0) < 0.001 &&
      Math.abs(this.colorTemp - asShotTemp) < 1 &&
      Math.abs(this.tint - asShotTint) < 0.001 &&
      Math.abs(this.lutIntensity - 1.0) < 0.001 &&
      Math.abs(this.clarity - 0.0) < 0.001 &&
      Math.abs(this.sharpness - 0.0) < 0.001
    );
  }

  /**
   * 產生當前調色快照物件
   */
  buildTuningSnapshot(photo: PhotoPlateItem | null): PhotoPlateItem["tuning"] {
    if (this.isDefaultTuning(photo)) {
      return undefined;
    }
    return {
      exposure: this.exposure,
      contrast: this.contrast,
      shadows: this.shadows,
      lutIntensity: this.lutIntensity,
      colorTemp: this.colorTemp,
      tint: this.tint,
      clarity: this.clarity,
      sharpness: this.sharpness,
    };
  }

  /**
   * 產生當前裁切幾何快照物件
   */
  buildCropSnapshot(): CropGeometry | undefined {
    const isDefaultCrop =
      this.cropX === 0.0 &&
      this.cropY === 0.0 &&
      this.cropWidth === 1.0 &&
      this.cropHeight === 1.0 &&
      this.cropRotation === 0.0 &&
      this.keystoneV === 0 &&
      this.keystoneH === 0 &&
      !this.flipH &&
      !this.flipV;

    if (isDefaultCrop) return undefined;

    return {
      x: this.cropX,
      y: this.cropY,
      width: this.cropWidth,
      height: this.cropHeight,
      rotation: this.cropRotation,
      keystoneV: this.keystoneV,
      keystoneH: this.keystoneH,
      aspectRatio: this.cropAspectRatio,
      flipH: this.flipH,
      flipV: this.flipV,
      rationale: this.aiCropRationale,
    };
  }

  /**
   * 計算並套用長寬比預設 (Aspect Ratio Preset)
   */
  applyAspectRatioPreset(
    ratio: CropRatioPreset,
    sourceImgElement?: HTMLImageElement | null,
    canvasContainerRef?: HTMLElement | null
  ): void {
    this.cropAspectRatio = ratio;
    this.isCropMode = true;

    if (ratio === "free") return;

    if (ratio === "original") {
      this.cropX = 0.0;
      this.cropY = 0.0;
      this.cropWidth = 1.0;
      this.cropHeight = 1.0;
      return;
    }

    let imgRatio = 1.5; // 預設 3:2
    if (sourceImgElement && sourceImgElement.naturalWidth && sourceImgElement.naturalHeight) {
      imgRatio = sourceImgElement.naturalWidth / sourceImgElement.naturalHeight;
    } else if (canvasContainerRef && canvasContainerRef.clientWidth && canvasContainerRef.clientHeight) {
      imgRatio = canvasContainerRef.clientWidth / canvasContainerRef.clientHeight;
    }

    let targetRatio = 1.0;
    if (ratio === "1:1") targetRatio = 1.0;
    else if (ratio === "4:5") targetRatio = 0.8;
    else if (ratio === "16:9") targetRatio = 16 / 9;
    else if (ratio === "9:16") targetRatio = 9 / 16;

    const r = targetRatio / imgRatio;

    if (r <= 1.0) {
      this.cropHeight = 1.0;
      this.cropWidth = parseFloat(Math.max(0.1, Math.min(1.0, r)).toFixed(3));
      this.cropX = parseFloat(((1.0 - this.cropWidth) / 2).toFixed(3));
      this.cropY = 0.0;
    } else {
      this.cropWidth = 1.0;
      this.cropHeight = parseFloat(Math.max(0.1, Math.min(1.0, 1.0 / r)).toFixed(3));
      this.cropX = 0.0;
      this.cropY = parseFloat(((1.0 - this.cropHeight) / 2).toFixed(3));
    }
  }

  /**
   * 重設縮放與平移狀態為適合視窗 (Fit)
   */
  resetZoom(): void {
    this.zoomLevel = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
  }

  /**
   * 複製當前調色參數至剪貼簿
   */
  copyCurrentTuning(appliedProfile: string): void {
    this.copiedTuning = {
      appliedProfile,
      tuning: {
        exposure: this.exposure,
        contrast: this.contrast,
        shadows: this.shadows,
        lutIntensity: this.lutIntensity,
        colorTemp: this.colorTemp,
        tint: this.tint,
        clarity: this.clarity,
        sharpness: this.sharpness,
      },
    };
  }

  /**
   * 貼上已複製之調色參數
   */
  pasteCopiedTuning(): { appliedProfile: string; tuning: TuningParameters } | null {
    if (!this.copiedTuning) return null;
    const { appliedProfile, tuning } = this.copiedTuning;
    this.exposure = tuning.exposure;
    this.contrast = tuning.contrast;
    this.shadows = tuning.shadows ?? 0.0;
    this.lutIntensity = tuning.lutIntensity;
    this.colorTemp = tuning.colorTemp;
    this.tint = tuning.tint;
    this.clarity = tuning.clarity ?? 0.0;
    this.sharpness = tuning.sharpness ?? 0.0;
    return this.copiedTuning;
  }
}

export const darkroomState = new DarkroomStateStore();

