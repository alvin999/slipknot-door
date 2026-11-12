/**
 * 暗房影像調色與幾何幾構圖狀態模組 (Darkroom State Store)
 * 負責維護暗房調色滑桿、WebGL 3D LUT 渲染參數、A/B 簾幕比對、幾何構圖裁切與意境關鍵字。
 * 遵循 Svelte 5 Runes ($state, $derived) 響應式規範。
 */

import {
  HSL_BAND_KEYS,
  cloneHslAdjustments,
  createDefaultHslAdjustments,
  type CropGeometry,
  type TuningParameters,
  type HslAdjustments,
} from "$lib/types/photo";
import type { PhotoPlateItem } from "./photoLibrary.svelte";
import { lutCatalog } from "./lutCatalog.svelte";
import { styleKeywordCatalog } from "./styleKeywordCatalog.svelte";
import type { StyleKeywordId, StylePresetKey } from "$lib/services/ai/types";

export type DiffMode = "off" | "split" | "sideBySide";
export type CropRatioPreset = "original" | "1:1" | "4:5" | "16:9" | "9:16" | "free";
export type BwFilterPresetKey = "neutral" | "yellow" | "orange" | "red" | "green" | "portrait";

const BW_FILTER_LUM_PRESETS: Record<BwFilterPresetKey, Record<keyof HslAdjustments, number>> = {
  neutral: { red: 0, orange: 0, yellow: 0, green: 0, cyan: 0, blue: 0 },
  yellow: { red: 0.15, orange: 0.25, yellow: 0.30, green: 0.05, cyan: -0.20, blue: -0.35 },
  orange: { red: 0.30, orange: 0.35, yellow: 0.20, green: -0.15, cyan: -0.35, blue: -0.55 },
  red: { red: 0.45, orange: 0.30, yellow: 0.10, green: -0.35, cyan: -0.55, blue: -0.80 },
  green: { red: -0.25, orange: 0.10, yellow: 0.25, green: 0.40, cyan: 0.15, blue: -0.15 },
  portrait: { red: 0.20, orange: 0.42, yellow: 0.25, green: -0.10, cyan: -0.15, blue: -0.25 },
};

export interface DarkroomHistorySnapshot {
  monochrome: boolean;
  exposure: number;
  highlights: number;
  contrast: number;
  shadows: number;
  blacks: number;
  lutIntensity: number;
  colorTemp: number;
  tint: number;
  vibrance: number;
  clarity: number;
  sharpness: number;
  colorDensity: number;
  shadowHue: number;
  shadowTintAmount: number;
  highlightHue: number;
  highlightTintAmount: number;
  halation: number;
  grainAmount: number;
  vignette: number;
  hsl: HslAdjustments;
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

  // 顯影輸出模式 (預設 false = 彩色；true = 黑白暗房管線)
  monochrome = $state<boolean>(false);

  // 基礎光影控制 (Tonal Parameters)
  exposure = $state<number>(0.0);
  contrast = $state<number>(0.0);
  highlights = $state<number>(0.0);
  shadows = $state<number>(0.0);
  blacks = $state<number>(0.0);
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

  // 底片物理通道 (Analog Emulsion Physics)
  colorDensity = $state<number>(0.0);
  shadowHue = $state<number>(200);
  shadowTintAmount = $state<number>(0.0);
  highlightHue = $state<number>(40);
  highlightTintAmount = $state<number>(0.0);
  halation = $state<number>(0.0);
  grainAmount = $state<number>(0.15);
  vignette = $state<number>(0.0);
  hsl = $state<HslAdjustments>(createDefaultHslAdjustments());

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
  activeStylePreset = $state<StylePresetKey>("auto");
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
   * 開始編輯指定標籤的指令內容（暫態草稿，需點擊儲存才會寫入 localStorage）
   */
  startEditingKeyword(id: StyleKeywordId): void {
    if (this.keywordOverrides[id] === undefined) {
      const entry = styleKeywordCatalog.findById(id);
      if (entry?.promptEnglish) {
        this.keywordOverrides = {
          ...this.keywordOverrides,
          [id]: entry.promptEnglish,
        };
      }
    }
    this.editingKeywordId = id;
  }

  /**
   * 完成編輯指定標籤（僅保留為本次工作階段的暫時微調，不寫入儲存）
   */
  stopEditingKeyword(): void {
    this.editingKeywordId = null;
  }

  /**
   * 更新指定標籤的暫時指令草稿
   */
  updateKeywordOverride(id: StyleKeywordId, text: string): void {
    this.keywordOverrides = {
      ...this.keywordOverrides,
      [id]: text,
    };
  }

  /**
   * 將目前暫時微調的關鍵字指令正式儲存至 localStorage
   */
  saveKeywordOverrideToStorage(id: StyleKeywordId): boolean {
    const draft = this.keywordOverrides[id] ?? this.getKeywordDirective(id);
    const trimmed = draft.trim();
    if (!trimmed) return false;

    const updated = styleKeywordCatalog.updateKeyword(id, {
      promptEnglish: trimmed,
    });
    if (!updated) return false;

    const next = { ...this.keywordOverrides };
    delete next[id];
    this.keywordOverrides = next;
    if (this.editingKeywordId === id) {
      this.editingKeywordId = null;
    }
    return true;
  }

  /**
   * 捨棄指定標籤的暫時微調草稿，恢復為目前儲存值
   */
  resetKeywordOverride(id: StyleKeywordId): void {
    const next = { ...this.keywordOverrides };
    delete next[id];
    this.keywordOverrides = next;
  }

  /**
   * 取得指定標籤目前的生效指令（暫時草稿優先，否則讀取關鍵字典藏庫）
   */
  getKeywordDirective(id: StyleKeywordId): string {
    if (this.keywordOverrides[id] !== undefined) {
      return this.keywordOverrides[id];
    }
    const entry = styleKeywordCatalog.findById(id);
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
    this.monochrome = false;
    this.exposure = 0.0;
    this.contrast = 0.0;
    this.highlights = 0.0;
    this.shadows = 0.0;
    this.blacks = 0.0;
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
    this.colorDensity = 0.0;
    this.shadowHue = 200;
    this.shadowTintAmount = 0.0;
    this.highlightHue = 40;
    this.highlightTintAmount = 0.0;
    this.halation = 0.0;
    this.grainAmount = 0.15;
    this.vignette = 0.0;
    this.hsl = createDefaultHslAdjustments();
  }

  /**
   * 回歸拍攝原生參數 (As Shot)
   */
  resetToAsShot(photo: PhotoPlateItem | null): void {
    if (!photo) return;
    this.monochrome = false;
    this.exposure = photo.asShotExposure ?? 0.0;
    this.contrast = 0.0;
    this.highlights = 0.0;
    this.shadows = 0.0;
    this.blacks = 0.0;
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
    this.colorDensity = 0.0;
    this.shadowHue = 200;
    this.shadowTintAmount = 0.0;
    this.highlightHue = 40;
    this.highlightTintAmount = 0.0;
    this.halation = 0.0;
    this.grainAmount = 0.15;
    this.vignette = 0.0;
    this.hsl = createDefaultHslAdjustments();
  }

  /**
   * 載入指定相片的調色與裁切設定
   */
  /**
   * 擷取當前所有調色與裁切狀態之快照
   */
  captureSnapshot(): DarkroomHistorySnapshot {
    return {
      monochrome: this.monochrome,
      exposure: this.exposure,
      highlights: this.highlights,
      contrast: this.contrast,
      shadows: this.shadows,
      blacks: this.blacks,
      lutIntensity: this.lutIntensity,
      colorTemp: this.colorTemp,
      tint: this.tint,
      vibrance: this.vibrance,
      clarity: this.clarity,
      sharpness: this.sharpness,
      colorDensity: this.colorDensity,
      shadowHue: this.shadowHue,
      shadowTintAmount: this.shadowTintAmount,
      highlightHue: this.highlightHue,
      highlightTintAmount: this.highlightTintAmount,
      halation: this.halation,
      grainAmount: this.grainAmount,
      vignette: this.vignette,
      hsl: cloneHslAdjustments(this.hsl),
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
    this.monochrome = snap.monochrome;
    this.exposure = snap.exposure;
    this.highlights = snap.highlights;
    this.contrast = snap.contrast;
    this.shadows = snap.shadows;
    this.blacks = snap.blacks;
    this.lutIntensity = snap.lutIntensity;
    this.colorTemp = snap.colorTemp;
    this.tint = snap.tint;
    this.vibrance = snap.vibrance;
    this.clarity = snap.clarity;
    this.sharpness = snap.sharpness;
    this.colorDensity = snap.colorDensity;
    this.shadowHue = snap.shadowHue;
    this.shadowTintAmount = snap.shadowTintAmount;
    this.highlightHue = snap.highlightHue;
    this.highlightTintAmount = snap.highlightTintAmount;
    this.halation = snap.halation;
    this.grainAmount = snap.grainAmount;
    this.vignette = snap.vignette;
    this.hsl = cloneHslAdjustments(snap.hsl);
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
    const hslEqual = HSL_BAND_KEYS.every((k) =>
      Math.abs(a.hsl[k].hue - b.hsl[k].hue) < 0.001 &&
      Math.abs(a.hsl[k].sat - b.hsl[k].sat) < 0.001 &&
      Math.abs(a.hsl[k].lum - b.hsl[k].lum) < 0.001
    );
    return (
      hslEqual &&
      a.monochrome === b.monochrome &&
      Math.abs(a.exposure - b.exposure) < 0.001 &&
      Math.abs(a.highlights - b.highlights) < 0.001 &&
      Math.abs(a.contrast - b.contrast) < 0.001 &&
      Math.abs(a.shadows - b.shadows) < 0.001 &&
      Math.abs(a.blacks - b.blacks) < 0.001 &&
      Math.abs(a.lutIntensity - b.lutIntensity) < 0.001 &&
      Math.abs(a.colorTemp - b.colorTemp) < 1 &&
      Math.abs(a.tint - b.tint) < 0.001 &&
      Math.abs(a.vibrance - b.vibrance) < 0.001 &&
      Math.abs(a.clarity - b.clarity) < 0.001 &&
      Math.abs(a.sharpness - b.sharpness) < 0.001 &&
      Math.abs(a.colorDensity - b.colorDensity) < 0.001 &&
      Math.abs(a.shadowHue - b.shadowHue) < 0.5 &&
      Math.abs(a.shadowTintAmount - b.shadowTintAmount) < 0.001 &&
      Math.abs(a.highlightHue - b.highlightHue) < 0.5 &&
      Math.abs(a.highlightTintAmount - b.highlightTintAmount) < 0.001 &&
      Math.abs(a.halation - b.halation) < 0.001 &&
      Math.abs(a.grainAmount - b.grainAmount) < 0.001 &&
      Math.abs(a.vignette - b.vignette) < 0.001 &&
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
   * 套用黑白暗房光學色鏡預設 (更新 6 區段灰階明度權重，並保留既有色相與彩度)
   */
  applyBwFilterPreset(presetKey: BwFilterPresetKey): void {
    const preset = BW_FILTER_LUM_PRESETS[presetKey];
    if (!preset) return;
    const next = cloneHslAdjustments(this.hsl);
    for (const k of HSL_BAND_KEYS) {
      next[k].lum = preset[k];
    }
    this.hsl = next;
    this.recordSnapshot(true);
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
      this.monochrome = photo.tuning.monochrome ?? false;
      this.exposure = photo.tuning.exposure;
      this.highlights = photo.tuning.highlights ?? 0;
      this.contrast = photo.tuning.contrast;
      this.shadows = photo.tuning.shadows ?? 0;
      this.blacks = photo.tuning.blacks ?? 0;
      this.lutIntensity = photo.tuning.lutIntensity;
      this.colorTemp = photo.tuning.colorTemp;
      this.tint = photo.tuning.tint ?? 0;
      this.vibrance = photo.tuning.vibrance ?? 0;
      this.clarity = photo.tuning.clarity ?? 0;
      this.sharpness = photo.tuning.sharpness ?? 0;
      this.colorDensity = photo.tuning.colorDensity ?? 0;
      this.shadowHue = photo.tuning.shadowHue ?? 200;
      this.shadowTintAmount = photo.tuning.shadowTintAmount ?? 0;
      this.highlightHue = photo.tuning.highlightHue ?? 40;
      this.highlightTintAmount = photo.tuning.highlightTintAmount ?? 0;
      this.halation = photo.tuning.halation ?? 0;
      this.grainAmount = photo.tuning.grainAmount ?? 0.15;
      this.vignette = photo.tuning.vignette ?? 0;
      this.hsl = cloneHslAdjustments(photo.tuning.hsl);
    } else {
      this.monochrome = false;
      this.exposure = photo.asShotExposure ?? 0.0;
      this.highlights = 0.0;
      this.contrast = 0.0;
      this.shadows = 0.0;
      this.blacks = 0.0;
      this.lutIntensity = 1.0;
      this.colorTemp = photo.asShotTemp ?? 5500;
      this.tint = photo.asShotTint ?? 0.0;
      this.vibrance = 0.0;
      this.clarity = 0.0;
      this.sharpness = 0.0;
      this.colorDensity = 0.0;
      this.shadowHue = 200;
      this.shadowTintAmount = 0.0;
      this.highlightHue = 40;
      this.highlightTintAmount = 0.0;
      this.halation = 0.0;
      this.grainAmount = 0.15;
      this.vignette = 0.0;
      this.hsl = createDefaultHslAdjustments();
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

    const isDefaultHsl = HSL_BAND_KEYS.every((k) =>
      Math.abs(this.hsl[k].hue) < 0.001 &&
      Math.abs(this.hsl[k].sat) < 0.001 &&
      Math.abs(this.hsl[k].lum) < 0.001
    );

    return (
      isDefaultHsl &&
      !this.monochrome &&
      Math.abs(this.exposure - asShotExp) < 0.001 &&
      Math.abs(this.highlights - 0.0) < 0.001 &&
      Math.abs(this.contrast - 0.0) < 0.001 &&
      Math.abs(this.shadows - 0.0) < 0.001 &&
      Math.abs(this.blacks - 0.0) < 0.001 &&
      Math.abs(this.colorTemp - asShotTemp) < 1 &&
      Math.abs(this.tint - asShotTint) < 0.001 &&
      Math.abs(this.vibrance - 0.0) < 0.001 &&
      Math.abs(this.lutIntensity - 1.0) < 0.001 &&
      Math.abs(this.clarity - 0.0) < 0.001 &&
      Math.abs(this.sharpness - 0.0) < 0.001 &&
      Math.abs(this.colorDensity - 0.0) < 0.001 &&
      Math.abs(this.shadowTintAmount - 0.0) < 0.001 &&
      Math.abs(this.highlightTintAmount - 0.0) < 0.001 &&
      Math.abs(this.halation - 0.0) < 0.001 &&
      Math.abs(this.grainAmount - 0.15) < 0.001 &&
      Math.abs(this.vignette - 0.0) < 0.001
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
      monochrome: this.monochrome,
      exposure: this.exposure,
      highlights: this.highlights,
      contrast: this.contrast,
      shadows: this.shadows,
      blacks: this.blacks,
      lutIntensity: this.lutIntensity,
      colorTemp: this.colorTemp,
      tint: this.tint,
      vibrance: this.vibrance,
      clarity: this.clarity,
      sharpness: this.sharpness,
      colorDensity: this.colorDensity,
      shadowHue: this.shadowHue,
      shadowTintAmount: this.shadowTintAmount,
      highlightHue: this.highlightHue,
      highlightTintAmount: this.highlightTintAmount,
      halation: this.halation,
      grainAmount: this.grainAmount,
      vignette: this.vignette,
      hsl: cloneHslAdjustments(this.hsl),
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
        monochrome: this.monochrome,
        exposure: this.exposure,
        highlights: this.highlights,
        contrast: this.contrast,
        shadows: this.shadows,
        blacks: this.blacks,
        lutIntensity: this.lutIntensity,
        colorTemp: this.colorTemp,
        tint: this.tint,
        vibrance: this.vibrance,
        clarity: this.clarity,
        sharpness: this.sharpness,
        colorDensity: this.colorDensity,
        shadowHue: this.shadowHue,
        shadowTintAmount: this.shadowTintAmount,
        highlightHue: this.highlightHue,
        highlightTintAmount: this.highlightTintAmount,
        halation: this.halation,
        grainAmount: this.grainAmount,
        vignette: this.vignette,
        hsl: cloneHslAdjustments(this.hsl),
      },
    };
  }

  /**
   * 貼上已複製之調色參數
   */
  pasteCopiedTuning(): { appliedProfile: string; tuning: TuningParameters } | null {
    if (!this.copiedTuning) return null;
    const { appliedProfile, tuning } = this.copiedTuning;
    this.monochrome = tuning.monochrome ?? false;
    this.exposure = tuning.exposure;
    this.highlights = tuning.highlights ?? 0.0;
    this.contrast = tuning.contrast;
    this.shadows = tuning.shadows ?? 0.0;
    this.blacks = tuning.blacks ?? 0.0;
    this.lutIntensity = tuning.lutIntensity;
    this.colorTemp = tuning.colorTemp;
    this.tint = tuning.tint;
    this.vibrance = tuning.vibrance ?? 0.0;
    this.clarity = tuning.clarity ?? 0.0;
    this.sharpness = tuning.sharpness ?? 0.0;
    this.colorDensity = tuning.colorDensity ?? 0.0;
    this.shadowHue = tuning.shadowHue ?? 200;
    this.shadowTintAmount = tuning.shadowTintAmount ?? 0.0;
    this.highlightHue = tuning.highlightHue ?? 40;
    this.highlightTintAmount = tuning.highlightTintAmount ?? 0.0;
    this.halation = tuning.halation ?? 0.0;
    this.grainAmount = tuning.grainAmount ?? 0.15;
    this.vignette = tuning.vignette ?? 0.0;
    this.hsl = cloneHslAdjustments(tuning.hsl);
    return this.copiedTuning;
  }

  /**
   * 判定指定相片目前調色是否相較於 AI 基準已被使用者手動更動過
   */
  isModifiedFromAi(photo: PhotoPlateItem | null): boolean {
    if (!photo?.aiTuningSnapshot) return false;
    const snap = photo.aiTuningSnapshot;
    const t = snap.tuning;
    const hslModified = HSL_BAND_KEYS.some((k) => {
      const a = this.hsl?.[k];
      const b = t.hsl?.[k];
      return (
        Math.abs((a?.hue ?? 0) - (b?.hue ?? 0)) > 0.001 ||
        Math.abs((a?.sat ?? 0) - (b?.sat ?? 0)) > 0.001 ||
        Math.abs((a?.lum ?? 0) - (b?.lum ?? 0)) > 0.001
      );
    });
    return (
      hslModified ||
      this.monochrome !== (t.monochrome ?? false) ||
      Math.abs(this.exposure - t.exposure) > 0.001 ||
      Math.abs(this.highlights - (t.highlights ?? 0.0)) > 0.001 ||
      Math.abs(this.contrast - t.contrast) > 0.001 ||
      Math.abs(this.shadows - (t.shadows ?? 0.0)) > 0.001 ||
      Math.abs(this.blacks - (t.blacks ?? 0.0)) > 0.001 ||
      Math.abs(this.colorTemp - t.colorTemp) > 1 ||
      Math.abs(this.tint - (t.tint ?? 0.0)) > 0.001 ||
      Math.abs(this.vibrance - (t.vibrance ?? 0.0)) > 0.001 ||
      Math.abs(this.lutIntensity - t.lutIntensity) > 0.001 ||
      Math.abs(this.clarity - (t.clarity ?? 0.0)) > 0.001 ||
      Math.abs(this.sharpness - (t.sharpness ?? 0.0)) > 0.001 ||
      Math.abs(this.colorDensity - (t.colorDensity ?? 0.0)) > 0.001 ||
      Math.abs(this.shadowHue - (t.shadowHue ?? 200)) > 0.5 ||
      Math.abs(this.shadowTintAmount - (t.shadowTintAmount ?? 0.0)) > 0.001 ||
      Math.abs(this.highlightHue - (t.highlightHue ?? 40)) > 0.5 ||
      Math.abs(this.highlightTintAmount - (t.highlightTintAmount ?? 0.0)) > 0.001 ||
      Math.abs(this.halation - (t.halation ?? 0.0)) > 0.001 ||
      Math.abs(this.grainAmount - (t.grainAmount ?? 0.15)) > 0.001 ||
      Math.abs(this.vignette - (t.vignette ?? 0.0)) > 0.001 ||
      photo.appliedProfile !== snap.appliedProfile
    );
  }

  /**
   * 根據指定 3D LUT Profile ID 套用其預設調色參數至暗房滑桿
   */
  applyProfileDefaults(profileId: string): void {
    const found = lutCatalog.allProfiles.find((p) => p.id === profileId);
    if (!found) return;
    this.exposure = found.evDefault;
    this.highlights = found.highlightsDefault ?? 0.0;
    this.contrast = found.contrastDefault || 0.0;
    this.shadows = found.shadowsDefault ?? 0.0;
    this.blacks = 0.0;
    this.lutIntensity = found.lutIntensityDefault;
    this.vibrance = 0.0;
    this.clarity = found.clarityDefault ?? 0.0;
    this.sharpness = found.sharpnessDefault ?? 0.0;
    this.colorDensity = 0.0;
    this.shadowHue = 200;
    this.shadowTintAmount = 0.0;
    this.highlightHue = 40;
    this.highlightTintAmount = 0.0;
    this.halation = 0.0;
    this.grainAmount = 0.15;
    this.vignette = 0.0;
    this.hsl = createDefaultHslAdjustments();
  }

  /**
   * AI Adjustment Slider Organic Tween Animation (AI 手動推拉滑桿感)
   */
  animateAdjustmentValues(
    target: {
      exposure?: number;
      highlights?: number;
      contrast?: number;
      shadows?: number;
      blacks?: number;
      lutIntensity?: number;
      colorTemp?: number;
      tint?: number;
      vibrance?: number;
      clarity?: number;
      sharpness?: number;
      colorDensity?: number;
      shadowHue?: number;
      shadowTintAmount?: number;
      highlightHue?: number;
      highlightTintAmount?: number;
      halation?: number;
      grainAmount?: number;
      vignette?: number;
      hsl?: HslAdjustments;
    },
    durationMs = 650,
    onComplete?: () => void
  ): void {
    const startExposure = this.exposure;
    const startHighlights = this.highlights;
    const startContrast = this.contrast;
    const startShadows = this.shadows;
    const startBlacks = this.blacks;
    const startLutIntensity = this.lutIntensity;
    const startColorTemp = this.colorTemp;
    const startTint = this.tint;
    const startVibrance = this.vibrance;
    const startClarity = this.clarity;
    const startSharpness = this.sharpness;
    const startColorDensity = this.colorDensity;
    const startShadowHue = this.shadowHue;
    const startShadowTintAmount = this.shadowTintAmount;
    const startHighlightHue = this.highlightHue;
    const startHighlightTintAmount = this.highlightTintAmount;
    const startHalation = this.halation;
    const startGrainAmount = this.grainAmount;
    const startVignette = this.vignette;

    const targetExposure = target.exposure ?? startExposure;
    const targetHighlights = target.highlights ?? startHighlights;
    const targetContrast = target.contrast ?? startContrast;
    const targetShadows = target.shadows ?? startShadows;
    const targetBlacks = target.blacks ?? startBlacks;
    const targetLutIntensity = target.lutIntensity ?? startLutIntensity;
    const targetColorTemp = target.colorTemp ?? startColorTemp;
    const targetTint = target.tint ?? startTint;
    const targetVibrance = target.vibrance ?? startVibrance;
    const targetClarity = target.clarity ?? startClarity;
    const targetSharpness = target.sharpness ?? startSharpness;
    const targetColorDensity = target.colorDensity ?? startColorDensity;
    const targetShadowHue = target.shadowHue ?? startShadowHue;
    const targetShadowTintAmount = target.shadowTintAmount ?? startShadowTintAmount;
    const targetHighlightHue = target.highlightHue ?? startHighlightHue;
    const targetHighlightTintAmount = target.highlightTintAmount ?? startHighlightTintAmount;
    const targetHalation = target.halation ?? startHalation;
    const targetGrainAmount = target.grainAmount ?? startGrainAmount;
    const targetVignette = target.vignette ?? startVignette;

    if (target.hsl) {
      this.hsl = cloneHslAdjustments(target.hsl);
    }

    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1.0);
      // Ease-out cubic for realistic organic dial resistance
      const ease = 1 - Math.pow(1 - progress, 3);

      this.exposure = parseFloat(
        (startExposure + (targetExposure - startExposure) * ease).toFixed(2)
      );
      this.highlights = parseFloat(
        (startHighlights + (targetHighlights - startHighlights) * ease).toFixed(2)
      );
      this.contrast = parseFloat(
        (startContrast + (targetContrast - startContrast) * ease).toFixed(2)
      );
      this.shadows = parseFloat(
        (startShadows + (targetShadows - startShadows) * ease).toFixed(2)
      );
      this.blacks = parseFloat(
        (startBlacks + (targetBlacks - startBlacks) * ease).toFixed(2)
      );
      this.lutIntensity = parseFloat(
        (startLutIntensity + (targetLutIntensity - startLutIntensity) * ease).toFixed(2)
      );
      this.colorTemp = Math.round(
        startColorTemp + (targetColorTemp - startColorTemp) * ease
      );
      this.tint = parseFloat(
        (startTint + (targetTint - startTint) * ease).toFixed(1)
      );
      this.vibrance = parseFloat(
        (startVibrance + (targetVibrance - startVibrance) * ease).toFixed(2)
      );
      this.clarity = parseFloat(
        (startClarity + (targetClarity - startClarity) * ease).toFixed(2)
      );
      this.sharpness = parseFloat(
        (startSharpness + (targetSharpness - startSharpness) * ease).toFixed(2)
      );
      this.colorDensity = parseFloat(
        (startColorDensity + (targetColorDensity - startColorDensity) * ease).toFixed(2)
      );
      this.shadowHue = Math.round(
        startShadowHue + (targetShadowHue - startShadowHue) * ease
      );
      this.shadowTintAmount = parseFloat(
        (startShadowTintAmount + (targetShadowTintAmount - startShadowTintAmount) * ease).toFixed(2)
      );
      this.highlightHue = Math.round(
        startHighlightHue + (targetHighlightHue - startHighlightHue) * ease
      );
      this.highlightTintAmount = parseFloat(
        (startHighlightTintAmount + (targetHighlightTintAmount - startHighlightTintAmount) * ease).toFixed(2)
      );
      this.halation = parseFloat(
        (startHalation + (targetHalation - startHalation) * ease).toFixed(2)
      );
      this.grainAmount = parseFloat(
        (startGrainAmount + (targetGrainAmount - startGrainAmount) * ease).toFixed(2)
      );
      this.vignette = parseFloat(
        (startVignette + (targetVignette - startVignette) * ease).toFixed(2)
      );

      if (progress < 1.0) {
        requestAnimationFrame(step);
      } else {
        onComplete?.();
      }
    };
    requestAnimationFrame(step);
  }
}

export const darkroomState = new DarkroomStateStore();

