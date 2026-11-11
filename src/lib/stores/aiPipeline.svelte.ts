/**
 * AI 管線與推論排程狀態模組 (AI Pipeline Store)
 * 負責維護 AI 職責範圍矩陣 (AI Scope Matrix)、推論執行狀態、批次排程與進度倒數、
 * 虛擬終端機即時記錄 (Telemetry Logs) 以及 Groq 社群文案與 IPTC 標籤狀態。
 * 遵循 Svelte 5 Runes ($state, $derived) 響應式規範。
 */

import type { AiScopePreferences } from "$lib/types/photo";
import {
  AI_PANEL_UI_STORAGE_KEY,
  DEFAULT_AI_PANEL_UI_STATE,
  readLocalJson,
  updateLocalJson,
} from "$lib/utils/panelStorage";

export const AI_SCOPE_STORAGE_KEY = "slipknot_ai_scope_prefs";

export function loadInitialAiScope(): AiScopePreferences {
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(AI_SCOPE_STORAGE_KEY);
    if (raw) {
      try {
        return {
          lutProfile: true,
          crop: true,
          keystone: true,
          tone: true,
          whiteBalance: true,
          filmPhysics: true,
          ...JSON.parse(raw),
        };
      } catch {
        // 解析失敗時回傳預設值
      }
    }
  }
  return {
    lutProfile: true,
    crop: true,
    keystone: true,
    tone: true,
    whiteBalance: true,
    filmPhysics: true,
  };
}

export class AiPipelineStore {
  // AI 職責範圍偏好矩陣 (AI Scope Matrix)
  aiScope = $state<AiScopePreferences>(loadInitialAiScope());
  isAiScopeOpen = $state<boolean>(
    Boolean(readLocalJson(AI_PANEL_UI_STORAGE_KEY, DEFAULT_AI_PANEL_UI_STATE).isAiScopeOpen)
  );

  // AI 推論與批次排程狀態
  isAiAnalyzing = $state<boolean>(false);
  isBatchAiRunning = $state<boolean>(false);
  cancelBatchRequested = $state<boolean>(false);
  batchAbortController: AbortController | null = null;
  batchProgress = $state<{
    current: number;
    total: number;
    countdown: number;
  } | null>(null);

  // AI 場景研判與美學決策數據
  aiDecisionIsFallback = $state<boolean | null>(null);
  aiSuggestedScene = $state<string>("等待判讀");
  aiSceneTitle = $state<string>("");
  aiStyleInsight = $state<string>("");
  aiRecommendedMood = $state<string>("");
  aiRecommendedProfile = $state<string>("");

  // 虛擬終端機紀錄輸出 (Neural Terminal Logs)
  aiTerminalLogs = $state<string[]>([]);
  copiedLogNotice = $state<boolean>(false);

  // AI 混合雙軌：Gemini 視覺標籤 + Groq 社群文案與 IPTC
  aiVisionTags = $state<string[]>([]);
  userSocialPrompt = $state<string>("");
  aiSocialCaption = $state<string>("");
  aiSocialHashtags = $state<string[]>([]);
  aiIptcKeywords = $state<string[]>([]);
  isGeneratingCopy = $state<boolean>(false);
  copyNotice = $state<string>("");

  /**
   * 儲存 AI 職責範圍設定至 localStorage
   */
  saveAiScope(): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(AI_SCOPE_STORAGE_KEY, JSON.stringify(this.aiScope));
    }
  }

  /**
   * 切換特定 AI 職責開關
   */
  toggleAiScope(key: keyof AiScopePreferences): void {
    this.aiScope[key] = !this.aiScope[key];
    this.saveAiScope();
  }

  /**
   * 追加一筆終端機日誌，並保持最多 35 行
   */
  async appendAiLog(msg: string, delayMs = 50): Promise<void> {
    this.aiTerminalLogs = [...this.aiTerminalLogs.slice(-35), msg];
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  /**
   * 清除虛擬終端機所有日誌
   */
  clearTerminalLogs(): void {
    this.aiTerminalLogs = [];
  }

  /**
   * 複製虛擬終端機日誌至剪貼簿
   */
  async copyTerminalLogs(): Promise<void> {
    if (this.aiTerminalLogs.length === 0) return;
    const fullLog = this.aiTerminalLogs.join("\n");
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(fullLog);
        this.copiedLogNotice = true;
        setTimeout(() => {
          this.copiedLogNotice = false;
        }, 2000);
      }
    } catch (err) {
      console.warn("無法複製終端機日誌:", err);
    }
  }

  /**
   * 重設推論狀態（例如當切換至尚未分析的相片時）
   */
  resetDecisionState(): void {
    this.aiDecisionIsFallback = null;
    this.aiSuggestedScene = "等待判讀";
    this.aiSceneTitle = "";
    this.aiStyleInsight = "";
    this.aiRecommendedMood = "";
    this.aiRecommendedProfile = "";
  }

  /**
   * 切換並持久化 AI 職責範圍面板開關狀態
   */
  toggleAiScopeOpen(): boolean {
    const next = !this.isAiScopeOpen;
    this.isAiScopeOpen = next;
    updateLocalJson(AI_PANEL_UI_STORAGE_KEY, DEFAULT_AI_PANEL_UI_STATE, {
      isAiScopeOpen: next,
    });
    return next;
  }
}

export const aiPipeline = new AiPipelineStore();

