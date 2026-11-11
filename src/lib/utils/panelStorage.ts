/**
 * 暗房與 AI 面板的本地儲存（localStorage）讀寫工具
 * 提供 SSR 安全的 JSON 讀取與寫入，供左右兩側面板共用而不重複錯誤處理邏輯
 */

import type { HslBandKey } from "$lib/types/photo";

export const AI_PANEL_UI_STORAGE_KEY = "slipknot_ai_panel_ui";
export const TUNING_PANEL_UI_STORAGE_KEY = "slipknot_tuning_panel_ui";

export interface AiPanelUiState {
  isAiScopeOpen: boolean;
  isExpandedStyles: boolean;
}

export interface TuningPanelUiState {
  lutTuningExpanded: boolean;
  toningExpanded: boolean;
  hslExpanded: boolean;
  cropExpanded: boolean;
  selectedHslBand: HslBandKey;
}

export const DEFAULT_AI_PANEL_UI_STATE: AiPanelUiState = {
  isAiScopeOpen: false,
  isExpandedStyles: false,
};

export const DEFAULT_TUNING_PANEL_UI_STATE: TuningPanelUiState = {
  lutTuningExpanded: true,
  toningExpanded: true,
  hslExpanded: false,
  cropExpanded: true,
  selectedHslBand: "red",
};

/**
 * 安全讀取 localStorage 中的 JSON 物件並與預設值合併
 * 確保新增欄位或舊資料缺漏時仍能退回預設值
 */
export function readLocalJson<T extends object>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") {
    return { ...fallback };
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...fallback };
    }
    return { ...fallback, ...(parsed as Partial<T>) };
  } catch {
    return { ...fallback };
  }
}

/**
 * 安全寫入 JSON 至 localStorage
 */
export function writeLocalJson<T>(key: string, value: T): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 忽略隱私模式或空間上限錯誤
  }
}

/**
 * 局部更新 localStorage 中的 JSON 物件，避免覆寫同一個 key 下的其他 UI 狀態
 */
export function updateLocalJson<T extends object>(
  key: string,
  fallback: T,
  patch: Partial<T>
): T {
  const next = { ...readLocalJson(key, fallback), ...patch };
  writeLocalJson(key, next);
  return next;
}
