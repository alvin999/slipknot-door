/**
 * AI 管線與推論排程狀態模組 (AI Pipeline Store)
 * 負責維護 AI 職責範圍矩陣 (AI Scope Matrix)、推論執行狀態、批次排程與進度倒數、
 * 虛擬終端機即時記錄 (Telemetry Logs) 以及 Groq 社群文案與 IPTC 標籤狀態。
 * 遵循 Svelte 5 Runes ($state, $derived) 響應式規範。
 */

import { AiSceneService } from "$lib/services/aiSceneService";
import { AiEngineFactory } from "$lib/services/ai/engineFactory";
import { KeyVaultService } from "$lib/services/keyVaultService";
import { thumbnailRenderService } from "$lib/services/thumbnailRenderService.svelte";
import { darkroomState } from "$lib/stores/darkroomState.svelte";
import { lutCatalog } from "$lib/stores/lutCatalog.svelte";
import { styleKeywordCatalog } from "$lib/stores/styleKeywordCatalog.svelte";
import {
  photoLibrary,
  type PhotoPlateItem,
} from "$lib/stores/photoLibrary.svelte";
import { toastStore } from "$lib/stores/toastStore.svelte";
import {
  cloneHslAdjustments,
  type AiScopePreferences,
  type HslAdjustments,
} from "$lib/types/photo";
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
        const parsed = JSON.parse(raw);
        const legacyFilmPhysics = parsed.filmPhysics !== false;
        return {
          lutProfile: true,
          crop: true,
          lockCropAspectRatio: false,
          keystone: true,
          tone: true,
          whiteBalance: true,
          filmPhysics: true,
          splitToning: legacyFilmPhysics,
          filmTexture: legacyFilmPhysics,
          ...parsed,
        };
      } catch {
        // 解析失敗時回傳預設值
      }
    }
  }
  return {
    lutProfile: true,
    crop: true,
    lockCropAspectRatio: false,
    keystone: true,
    tone: true,
    whiteBalance: true,
    filmPhysics: true,
    splitToning: true,
    filmTexture: true,
  };
}

export class AiPipelineStore {
  // AI 職責範圍偏好矩陣 (AI Scope Matrix)
  aiScope = $state<AiScopePreferences>(loadInitialAiScope());
  isAiScopeOpen = $state<boolean>(
    Boolean(
      readLocalJson(AI_PANEL_UI_STORAGE_KEY, DEFAULT_AI_PANEL_UI_STATE)
        .isAiScopeOpen,
    ),
  );

  // AI 推論細部參數與任務引擎設定（與 AiEngineFactory / LocalStorage 雙向同步）
  private initialRoles = AiEngineFactory.getTaskRoles();
  visionProvider = $state<string>(this.initialRoles.vision.provider || "gemini");
  visionModelId = $state<string>(this.initialRoles.vision.modelId || "");
  visionTemperature = $state<number>(this.initialRoles.vision.temperature ?? 0.4);
  copywritingProvider = $state<string>(this.initialRoles.copywriting.provider || "groq");
  copywritingModelId = $state<string>(this.initialRoles.copywriting.modelId || "");
  copywritingTemperature = $state<number>(this.initialRoles.copywriting.temperature ?? 0.7);
  criticEnabled = $state<boolean>(this.initialRoles.critic.enabled);
  criticTemperature = $state<number>(this.initialRoles.critic.temperature ?? 0.2);
  aiTuningStrength = $state<number>(this.initialRoles.tuningStrength ?? 1.0);

  /**
   * 從 AiEngineFactory 重新載入最新模型與溫度設定（例如關閉 KeyVaultModal 後同步）
   */
  reloadEngineSettings(): void {
    const roles = AiEngineFactory.getTaskRoles();
    this.visionProvider = roles.vision.provider || "gemini";
    this.visionModelId = roles.vision.modelId || "";
    this.visionTemperature = roles.vision.temperature ?? 0.4;
    this.copywritingProvider = roles.copywriting.provider || "groq";
    this.copywritingModelId = roles.copywriting.modelId || "";
    this.copywritingTemperature = roles.copywriting.temperature ?? 0.7;
    this.criticEnabled = roles.critic.enabled;
    this.criticTemperature = roles.critic.temperature ?? 0.2;
    this.aiTuningStrength = roles.tuningStrength ?? 1.0;
  }

  setVisionTemperature(temp: number): void {
    const clamped = Math.round(Math.max(0.0, Math.min(1.5, temp)) * 100) / 100;
    this.visionTemperature = clamped;
    AiEngineFactory.setTaskRoles({
      vision: {
        provider: this.visionProvider,
        modelId: this.visionModelId,
        temperature: clamped,
      },
    });
  }

  setCopywritingTemperature(temp: number): void {
    const clamped = Math.round(Math.max(0.0, Math.min(1.5, temp)) * 100) / 100;
    this.copywritingTemperature = clamped;
    AiEngineFactory.setTaskRoles({
      copywriting: {
        provider: this.copywritingProvider,
        modelId: this.copywritingModelId,
        temperature: clamped,
      },
    });
  }

  setCriticTemperature(temp: number): void {
    const clamped = Math.round(Math.max(0.0, Math.min(1.0, temp)) * 100) / 100;
    this.criticTemperature = clamped;
    AiEngineFactory.setTaskRoles({
      critic: {
        enabled: this.criticEnabled,
        useCustomModel: AiEngineFactory.getTaskRoles().critic.useCustomModel,
        provider: AiEngineFactory.getTaskRoles().critic.provider,
        modelId: AiEngineFactory.getTaskRoles().critic.modelId,
        temperature: clamped,
      },
    });
  }

  setCriticEnabled(enabled: boolean): void {
    this.criticEnabled = enabled;
    const current = AiEngineFactory.getTaskRoles().critic;
    AiEngineFactory.setTaskRoles({
      critic: {
        ...current,
        enabled,
      },
    });
  }

  setAiTuningStrength(strength: number): void {
    const clamped = Math.round(Math.max(0.5, Math.min(1.5, strength)) * 100) / 100;
    this.aiTuningStrength = clamped;
    AiEngineFactory.setTaskRoles({ tuningStrength: clamped });
  }

  setVisionEngineSelection(provider: string, modelId: string): void {
    this.visionProvider = provider;
    this.visionModelId = modelId;
    if (typeof localStorage !== "undefined") {
      if (modelId) localStorage.setItem(`slipknot_model_${provider}`, modelId);
    }
    AiEngineFactory.setTaskRoles({
      vision: {
        provider,
        modelId,
        temperature: this.visionTemperature,
      },
    });
  }

  setCopywritingEngineSelection(provider: string, modelId: string): void {
    this.copywritingProvider = provider;
    this.copywritingModelId = modelId;
    if (typeof localStorage !== "undefined") {
      if (modelId) localStorage.setItem(`slipknot_model_${provider}`, modelId);
    }
    AiEngineFactory.setTaskRoles({
      copywriting: {
        provider,
        modelId,
        temperature: this.copywritingTemperature,
      },
    });
  }

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

  // 外部視圖/Modal 委派回呼
  onRequireApiKey: (() => void) | null = null;
  onNotice: ((message: string) => void) | null = null;
  onTriggerRender: (() => void) | null = null;

  /**
   * 檢查目前指派之視覺引擎是否已設定可用金鑰（或使用免金鑰本地端 Ollama）
   */
  hasActiveApiKey(): boolean {
    if (this.visionProvider === "ollama") return true;
    const activeStatus = KeyVaultService.getKeyStatus(this.visionProvider);
    if (activeStatus.exists) return true;
    return KeyVaultService.hasAnyConfiguredProvider(this.visionProvider);
  }

  /**
   * 根據選取相片載入或重設 AI 決策面板狀態
   */
  loadFromPhoto(plate: PhotoPlateItem): void {
    if (plate.aiDecision) {
      this.aiSuggestedScene = `${plate.aiDecision.scene_type} (視覺即時判讀)`;
      this.aiSceneTitle =
        plate.aiDecision.scene_title || plate.aiDecision.scene_type;
      this.aiStyleInsight = plate.aiDecision.style_insight || "";
      this.aiRecommendedMood = plate.aiDecision.recommended_mood || "";
      this.aiRecommendedProfile =
        plate.aiDecision.recommended_profile || plate.appliedProfile;
      this.aiVisionTags = plate.aiDecision.tags || [];
    } else {
      this.aiSuggestedScene = "尚未分析";
      this.aiSceneTitle =
        plate.sceneTag && plate.sceneTag !== "本機相簿幀"
          ? plate.sceneTag
          : "";
      this.aiStyleInsight = "";
      this.aiRecommendedMood = "";
      this.aiRecommendedProfile =
        plate.appliedProfile || "Profile_00_StandardNatural";
      this.aiVisionTags = [];
    }
  }

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
   * 重設推論狀態（例如當切換至尚未分析的相片或重設參數時）
   */
  resetDecisionState(): void {
    this.aiDecisionIsFallback = null;
    this.aiSuggestedScene = "尚未分析";
    this.aiSceneTitle = "";
    this.aiStyleInsight = "";
    this.aiRecommendedMood = "";
    this.aiRecommendedProfile = "Profile_00_StandardNatural";
    this.aiVisionTags = [];
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

  /**
   * 動畫過渡滑桿並同步寫回 activePhoto
   */
  private animateAndSync(
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
  ): void {
    darkroomState.animateAdjustmentValues(target, durationMs, () => {
      const activePhoto = photoLibrary.activePhoto;
      if (activePhoto) {
        activePhoto.tuning = darkroomState.buildTuningSnapshot(activePhoto);
        photoLibrary.photoPlates = photoLibrary.photoPlates.map((p) =>
          p.id === activePhoto.id ? { ...p, tuning: activePhoto.tuning } : p,
        );
      }
    });
  }

  /**
   * 套用底片風格檔並排程縮圖重繪
   */
  private applyProfileToActivePhoto(
    profileId: string,
    resetDefaults = true,
  ): void {
    const activePhoto = photoLibrary.activePhoto;
    if (!activePhoto) return;
    activePhoto.appliedProfile = profileId;
    photoLibrary.photoPlates = photoLibrary.photoPlates.map((p) =>
      p.id === activePhoto.id ? { ...p, appliedProfile: profileId } : p,
    );
    if (resetDefaults) {
      darkroomState.applyProfileDefaults(profileId);
    }
    this.onTriggerRender?.();
    thumbnailRenderService.enqueueThumbnailRender(activePhoto);
  }

  /**
   * Authentic AI Scene Analysis & Organic Parameter Tuning
   * 支援單幀互動模式（含滑桿動畫與畫布更新）與高速批次背景顯影（純資料更新，零主執行緒凍結）
   */
  async runAiAnalysis(targetPhoto?: PhotoPlateItem): Promise<boolean> {
    const activePhoto = photoLibrary.activePhoto;
    const photoToProcess = targetPhoto || activePhoto;
    if (!photoToProcess) {
      this.onNotice?.("請先載入相片以進行 AI 顯影調色");
      return false;
    }

    const isCurrentActive =
      activePhoto && activePhoto.id === photoToProcess.id;

    // 僅在非批次模式且相片不同時，才切換全局焦點相片
    if (!this.isBatchAiRunning && !isCurrentActive) {
      photoLibrary.selectPhoto(photoToProcess);
    }

    if (!this.hasActiveApiKey()) {
      this.onRequireApiKey?.();
      return false;
    }

    this.isAiAnalyzing = true;
    if (!this.isBatchAiRunning) {
      this.aiTerminalLogs = [];
    }
    await this.appendAiLog(
      `> [OPTICAL_SCAN] 掃描 ${photoToProcess.filename} 影格光學數據...`,
      20,
    );
    await this.appendAiLog(
      `> [EXIF] ISO ${photoToProcess.iso} · ${photoToProcess.aperture} · ${photoToProcess.shutter} · ${photoToProcess.focalLength}`,
      20,
    );
    const activeModelInfo = AiSceneService.getActiveModelInfo();
    const providerLabelMap: Record<string, string> = {
      gemini: "Google Gemini",
      openai: "OpenAI",
      anthropic: "Anthropic Claude",
      groq: "Groq Vision",
      openrouter: "OpenRouter",
      ollama: "Ollama (Local)",
    };
    const providerLabel = providerLabelMap[activeModelInfo.provider] || activeModelInfo.provider;
    await this.appendAiLog(
      `> [STREAM] 傳輸 1024px 縮圖至 ${providerLabel} (${activeModelInfo.modelId} · Temp ${this.visionTemperature.toFixed(2)} · 強度 ${Math.round(this.aiTuningStrength * 100)}%)...`,
      40,
    );
    const activeDirectives = darkroomState.getActiveDirectives();
    const userPrompt = darkroomState.customStylePrompt.trim();
    const combinedPromptParts = [...activeDirectives];
    if (userPrompt) {
      combinedPromptParts.push(userPrompt);
    }
    const finalStylePrompt = combinedPromptParts.join("; ");

    if (darkroomState.selectedStyleKeywords.length > 0 || userPrompt) {
      const kwLabels = darkroomState.selectedStyleKeywords
        .map(
          (id) => styleKeywordCatalog.findById(id)?.shortTag || id,
        )
        .concat(userPrompt ? [userPrompt] : []);
      await this.appendAiLog(
        `> [STYLE_PROMPT] 注入調色關鍵字：${kwLabels.join(" + ")}`,
        20,
      );
    }

    const targetMonochrome =
      isCurrentActive || !this.isBatchAiRunning
        ? darkroomState.monochrome
        : (photoToProcess.tuning?.monochrome ?? false);

    const activeStylePreset = darkroomState.activeStylePreset;
    // 使用者指定風格（非自動配對）時鎖定目標 3D LUT；是否交由 AI 調整 LUT 濃度仍由 aiScope.lutProfile 控制
    const forcedProfileId =
      activeStylePreset !== "auto"
        ? lutCatalog.allStyleGradingPresets.find(
            (sp) => sp.key === activeStylePreset,
          )?.profileId
        : undefined;
    const isStyleLocked = Boolean(forcedProfileId);
    const applyLutProfile = this.aiScope.lutProfile || isStyleLocked;
    const applyLutIntensity = this.aiScope.lutProfile;

    const previewTargetProfile =
      forcedProfileId || photoToProcess.appliedProfile;
    const previewFoundProfile = lutCatalog.allProfiles.find(
      (pr) => pr.id === previewTargetProfile,
    );
    const frozenLutIntensityFallback =
      photoToProcess.appliedProfile === previewTargetProfile
        ? (photoToProcess.tuning?.lutIntensity ??
          (previewFoundProfile ? previewFoundProfile.lutIntensityDefault : 1.0))
        : (previewFoundProfile
            ? previewFoundProfile.lutIntensityDefault
            : (photoToProcess.tuning?.lutIntensity ?? 1.0));

    try {
      const decision = await AiSceneService.analyzeScene(
        photoToProcess.thumbnail,
        {
          cameraModel: photoToProcess.camera,
          lensModel: photoToProcess.lens,
          iso: photoToProcess.iso,
          shutterSpeed: photoToProcess.shutter,
          apertureValue: photoToProcess.aperture,
          focalLength: photoToProcess.focalLength,
        },
        {
          signal: this.batchAbortController?.signal,
          stylePreset: activeStylePreset,
          styleKeywords: darkroomState.selectedStyleKeywords,
          customStylePrompt: finalStylePrompt || undefined,
          customLuts: lutCatalog.userCustomLuts,
          monochrome: targetMonochrome,
          currentLutIntensity: applyLutIntensity
            ? undefined
            : frozenLutIntensityFallback,
          onLog: async (msg: string) => {
            await this.appendAiLog(msg, 15);
          },
          renderPreview: (src, dec) =>
            thumbnailRenderService.renderPass1PreviewForCritic(
              src,
              dec,
              targetMonochrome,
              activeStylePreset,
            ),
          scope: this.aiScope,
        },
      );

      if (forcedProfileId) {
        decision.recommended_profile = forcedProfileId;
      }

      // 若為焦點相片或單幀模式，同步頂部與面板 AI 決策狀態
      if (isCurrentActive || !this.isBatchAiRunning) {
        this.aiSuggestedScene = `${decision.scene_type} (視覺即時判讀)`;
        this.aiSceneTitle = decision.scene_title || decision.scene_type;
        this.aiStyleInsight = decision.style_insight || "";
        this.aiRecommendedMood = decision.recommended_mood || "";
        this.aiRecommendedProfile = decision.recommended_profile;
        darkroomState.aiCropRationale = decision.crop_rationale || "";
        this.aiVisionTags = decision.tags || [];

        // 若有視覺標籤，自動預熱 Groq 文案生成（秒回體驗）
        if (this.aiVisionTags.length > 0 && !this.isBatchAiRunning) {
          this.triggerGroqCopywriting();
        }
      }

      await this.appendAiLog(
        `> [AUTOTUNE] 依據 AI 職責勾選開始套用參數...`,
        20,
      );

      // 計算目標參數值
      const targetProfile = applyLutProfile
        ? decision.recommended_profile
        : photoToProcess.appliedProfile;
      const foundProfile = lutCatalog.allProfiles.find(
        (pr) => pr.id === targetProfile,
      );

      const clampVal = (v: number, min: number, max: number) =>
        Math.max(min, Math.min(max, v));
      const strength = this.aiTuningStrength;
      const scaleCentered = (val: number, center: number, min: number, max: number, decimals = 2) => {
        if (Math.abs(strength - 1.0) <= 0.01) return clampVal(val, min, max);
        const scaled = center + (val - center) * strength;
        return parseFloat(clampVal(scaled, min, max).toFixed(decimals));
      };

      const baseEv = this.aiScope.tone
        ? scaleCentered(decision.exposure_compensation, 0.0, -2.0, 2.0)
        : (photoToProcess.tuning?.exposure ??
          (foundProfile
            ? foundProfile.evDefault
            : (photoToProcess.asShotExposure ?? 0.0)));
      const baseContrast = this.aiScope.tone
        ? scaleCentered(decision.contrast ?? 0.0, 0.0, -0.8, 0.8)
        : (photoToProcess.tuning?.contrast ?? 0.0);
      const baseShadows = this.aiScope.tone
        ? scaleCentered(decision.lift_shadows ?? 0.0, 0.0, -0.5, 0.5)
        : (photoToProcess.tuning?.shadows ??
          (foundProfile ? (foundProfile.shadowsDefault ?? 0.0) : 0.0));
      const baseTemp = this.aiScope.whiteBalance
        ? Math.round(scaleCentered(decision.color_temp ?? 5500, 5500, 2800, 8500, 0))
        : (photoToProcess.tuning?.colorTemp ??
          photoToProcess.asShotTemp ??
          5500);
      const baseTint = this.aiScope.whiteBalance
        ? scaleCentered(decision.tint ?? 0.0, 0.0, -100, 100, 1)
        : (photoToProcess.tuning?.tint ?? photoToProcess.asShotTint ?? 0.0);
      const preservedLutIntensity =
        photoToProcess.appliedProfile === targetProfile
          ? (photoToProcess.tuning?.lutIntensity ??
            (foundProfile ? foundProfile.lutIntensityDefault : 1.0))
          : (foundProfile
              ? foundProfile.lutIntensityDefault
              : (photoToProcess.tuning?.lutIntensity ?? 1.0));
      const baseLut = applyLutIntensity
        ? scaleCentered(decision.lut_intensity, 0.0, 0.0, 1.0)
        : preservedLutIntensity;
      const baseClarity = this.aiScope.tone
        ? scaleCentered(decision.clarity ?? 0.0, 0.0, -1.0, 1.0)
        : (photoToProcess.tuning?.clarity ?? 0.0);
      const baseSharpness = this.aiScope.tone
        ? scaleCentered(decision.sharpness ?? 0.0, 0.0, -1.0, 1.0)
        : (photoToProcess.tuning?.sharpness ?? 0.0);
      const applyColorMixer = this.aiScope.filmPhysics !== false;
      const applySplitToning =
        this.aiScope.splitToning !== undefined
          ? this.aiScope.splitToning
          : applyColorMixer;
      const applyFilmTexture =
        this.aiScope.filmTexture !== undefined
          ? this.aiScope.filmTexture
          : applyColorMixer;
      const baseColorDensity = applyColorMixer
        ? scaleCentered(decision.color_density ?? 0.0, 0.0, -1.0, 1.0)
        : (photoToProcess.tuning?.colorDensity ?? 0.0);
      const baseShadowHue = applySplitToning
        ? (decision.shadow_hue ?? 200)
        : (photoToProcess.tuning?.shadowHue ?? 200);
      const baseShadowTintAmount = applySplitToning
        ? scaleCentered(decision.shadow_tint_amount ?? 0.0, 0.0, 0.0, 1.0)
        : (photoToProcess.tuning?.shadowTintAmount ?? 0.0);
      const baseHighlightHue = applySplitToning
        ? (decision.highlight_hue ?? 40)
        : (photoToProcess.tuning?.highlightHue ?? 40);
      const baseHighlightTintAmount = applySplitToning
        ? scaleCentered(decision.highlight_tint_amount ?? 0.0, 0.0, 0.0, 1.0)
        : (photoToProcess.tuning?.highlightTintAmount ?? 0.0);
      const baseHalation = applyFilmTexture
        ? scaleCentered(decision.halation ?? 0.0, 0.0, 0.0, 1.0)
        : (photoToProcess.tuning?.halation ?? 0.0);
      const baseGrainAmount = applyFilmTexture
        ? scaleCentered(decision.grain_amount ?? 0.15, 0.15, 0.0, 1.0)
        : (photoToProcess.tuning?.grainAmount ?? 0.15);
      const baseHighlights = this.aiScope.tone
        ? scaleCentered(decision.highlights ?? 0.0, 0.0, -1.0, 1.0)
        : (photoToProcess.tuning?.highlights ?? 0.0);
      const baseBlacks = this.aiScope.tone
        ? scaleCentered(decision.blacks ?? 0.0, 0.0, -0.5, 0.5)
        : (photoToProcess.tuning?.blacks ?? 0.0);
      const baseVibrance = applyColorMixer
        ? scaleCentered(decision.vibrance ?? 0.0, 0.0, -1.0, 1.0)
        : (photoToProcess.tuning?.vibrance ?? 0.0);
      const baseVignette = applyFilmTexture
        ? scaleCentered(decision.vignette ?? 0.0, 0.0, -1.0, 1.0)
        : (photoToProcess.tuning?.vignette ?? 0.0);
      const rawHsl = applyColorMixer
        ? cloneHslAdjustments(decision.hsl)
        : cloneHslAdjustments(photoToProcess.tuning?.hsl);
      if (applyColorMixer && Math.abs(strength - 1.0) > 0.01) {
        for (const bandKey of Object.keys(rawHsl) as Array<keyof HslAdjustments>) {
          rawHsl[bandKey].hue = scaleCentered(rawHsl[bandKey].hue, 0.0, -1.0, 1.0);
          rawHsl[bandKey].sat = scaleCentered(rawHsl[bandKey].sat, 0.0, -1.0, 1.0);
          rawHsl[bandKey].lum = scaleCentered(rawHsl[bandKey].lum, 0.0, -1.0, 1.0);
        }
      }
      const baseHsl = rawHsl;
      // 黑白模式完全由使用者獨立切換，AI 僅調光影與 6 段光學濾鏡權重，不擅自更改輸出模式
      const baseMonochrome = targetMonochrome;

      const origEv =
        photoToProcess.tuning?.exposure ?? photoToProcess.asShotExposure ?? 0.0;
      const origContrast = photoToProcess.tuning?.contrast ?? 0.0;
      const origShadows =
        photoToProcess.tuning?.shadows ??
        (foundProfile ? (foundProfile.shadowsDefault ?? 0.0) : 0.0);
      const origClarity = photoToProcess.tuning?.clarity ?? 0.0;
      const origSharpness = photoToProcess.tuning?.sharpness ?? 0.0;
      const origTemp =
        photoToProcess.tuning?.colorTemp ?? photoToProcess.asShotTemp ?? 5500;
      const origTint =
        photoToProcess.tuning?.tint ?? photoToProcess.asShotTint ?? 0.0;
      const origLut =
        photoToProcess.tuning?.lutIntensity ??
        (foundProfile ? foundProfile.lutIntensityDefault : 1.0);

      const fmt = (v: number, unit = "", sign = true, decimals = 2) => {
        const s = sign && v > 0 ? "+" : "";
        return `${s}${v.toFixed(decimals)}${unit}`;
      };

      if (this.aiScope.whiteBalance) {
        await this.appendAiLog(
          `> [AI_WB] 白平衡調校：\n  • 色溫: ${origTemp}K → ${baseTemp}K\n  • 色調 (Tint): ${fmt(origTint, "", true, 1)} → ${fmt(baseTint, "", true, 1)}`,
          15,
        );
      }
      if (this.aiScope.tone) {
        await this.appendAiLog(
          `> [AI_TONE] 光影與動態調校：\n  • 曝光補償: ${fmt(origEv, " EV")} → ${fmt(baseEv, " EV")} | 高光抑揚: ${fmt(baseHighlights)}\n  • 對比度: ${fmt(origContrast)} → ${fmt(baseContrast)} | 暗部: ${fmt(origShadows)} → ${fmt(baseShadows)} | 黑階: ${fmt(baseBlacks)}\n  • 清晰度: ${fmt(origClarity)} → ${fmt(baseClarity)} | 銳利度: ${fmt(origSharpness)} → ${fmt(baseSharpness)}`,
          15,
        );
      }
      if (isStyleLocked && applyLutIntensity) {
        await this.appendAiLog(
          `> [AI_LUT] 風格鎖定：${targetProfile} · AI 微調濃度 (${origLut.toFixed(2)} → ${baseLut.toFixed(2)})`,
          15,
        );
      } else if (isStyleLocked && !applyLutIntensity) {
        await this.appendAiLog(
          `> [AI_LUT] 風格鎖定：${targetProfile} · 凍結目前濃度 (${baseLut.toFixed(2)})`,
          15,
        );
      } else if (applyLutProfile) {
        await this.appendAiLog(
          `> [AI_LUT] 底片風格套用：${targetProfile} (濃度: ${origLut.toFixed(2)} → ${baseLut.toFixed(2)})`,
          15,
        );
      }
      if (applyColorMixer || applySplitToning || applyFilmTexture) {
        await this.appendAiLog(
          `> [AI_TONING] 色彩科學與底片質感：\n  • 自然飽和度: ${fmt(baseVibrance)} | 減色密度: ${fmt(baseColorDensity)} | 暗角: ${fmt(baseVignette)} | Halation: ${baseHalation.toFixed(2)} | 微粒: ${baseGrainAmount.toFixed(2)}\n  • 分區色調: 暗部 ${Math.round(baseShadowHue)}° (${baseShadowTintAmount.toFixed(2)}) | 亮部 ${Math.round(baseHighlightHue)}° (${baseHighlightTintAmount.toFixed(2)})`,
          15,
        );
      }

      // 構圖與智慧裁切計算
      let targetCrop = photoToProcess.crop;
      // AI 回傳整幅畫面 (或缺漏時的預設值) 代表構圖已佳、無需裁切，不可誤報為「已套用」
      const isFullFrameCrop = (b: number[]) =>
        b[0] <= 0.01 && b[1] <= 0.01 && b[2] >= 0.99 && b[3] >= 0.99;
      if (
        this.aiScope.crop &&
        (!decision.crop_box || isFullFrameCrop(decision.crop_box))
      ) {
        await this.appendAiLog(
          `> [AI_CROP] AI 判斷構圖已佳，未進行裁切（保留原始構圖）`,
          15,
        );
      }
      if (
        this.aiScope.crop &&
        decision.crop_box &&
        !isFullFrameCrop(decision.crop_box)
      ) {
        targetCrop = {
          x: decision.crop_box[1],
          y: decision.crop_box[0],
          width: decision.crop_box[3] - decision.crop_box[1],
          height: decision.crop_box[2] - decision.crop_box[0],
          rotation:
            this.aiScope.keystone && typeof decision.rotation_deg === "number"
              ? decision.rotation_deg
              : (photoToProcess.crop?.rotation ?? 0),
          keystoneV:
            this.aiScope.keystone && typeof decision.keystone_v === "number"
              ? decision.keystone_v
              : (photoToProcess.crop?.keystoneV ?? 0),
          keystoneH: photoToProcess.crop?.keystoneH ?? 0,
          aspectRatio:
            this.aiScope.lockCropAspectRatio
              ? "original"
              : decision.aspect_ratio &&
                  ["original", "1:1", "4:5", "16:9", "9:16", "free"].includes(
                    decision.aspect_ratio,
                  )
                ? (decision.aspect_ratio as any)
                : (photoToProcess.crop?.aspectRatio ?? "original"),
          flipH: photoToProcess.crop?.flipH ?? false,
          flipV: photoToProcess.crop?.flipV ?? false,
        };
        await this.appendAiLog(
          `> [AI_CROP] 智慧構圖裁切已套用：${decision.crop_rationale || "黃金三分點重心"}`,
          15,
        );
      } else if (
        this.aiScope.keystone &&
        (typeof decision.rotation_deg === "number" ||
          typeof decision.keystone_v === "number")
      ) {
        targetCrop = {
          x: photoToProcess.crop?.x ?? 0,
          y: photoToProcess.crop?.y ?? 0,
          width: photoToProcess.crop?.width ?? 1,
          height: photoToProcess.crop?.height ?? 1,
          rotation:
            typeof decision.rotation_deg === "number"
              ? decision.rotation_deg
              : (photoToProcess.crop?.rotation ?? 0),
          keystoneV:
            typeof decision.keystone_v === "number"
              ? decision.keystone_v
              : (photoToProcess.crop?.keystoneV ?? 0),
          keystoneH: photoToProcess.crop?.keystoneH ?? 0,
          aspectRatio: photoToProcess.crop?.aspectRatio ?? "original",
          flipH: photoToProcess.crop?.flipH ?? false,
          flipV: photoToProcess.crop?.flipV ?? false,
        };
        await this.appendAiLog(
          `> [AI_LEVEL] 地平線與垂直透視已校正 (${(targetCrop.rotation || 0).toFixed(1)}°)`,
          15,
        );
      }

      // 靜態寫入目標底片資料實體（保存專屬 AI 決策與場景標籤）
      photoToProcess.appliedProfile = targetProfile;
      photoToProcess.aiDecision = decision;
      photoToProcess.sceneTag = decision.scene_title || decision.scene_type;
      photoToProcess.tuning = {
        exposure: baseEv,
        highlights: baseHighlights,
        contrast: baseContrast,
        shadows: baseShadows,
        blacks: baseBlacks,
        lutIntensity: baseLut,
        colorTemp: baseTemp,
        tint: baseTint,
        vibrance: baseVibrance,
        clarity: baseClarity,
        sharpness: baseSharpness,
        colorDensity: baseColorDensity,
        shadowHue: baseShadowHue,
        shadowTintAmount: baseShadowTintAmount,
        highlightHue: baseHighlightHue,
        highlightTintAmount: baseHighlightTintAmount,
        halation: baseHalation,
        grainAmount: baseGrainAmount,
        vignette: baseVignette,
        monochrome: baseMonochrome,
        hsl: cloneHslAdjustments(baseHsl),
      };
      if (targetCrop) {
        photoToProcess.crop = targetCrop;
      }

      // 保存專屬 AI 基準快照供後續一鍵還原 (Restore AI Baseline)
      photoToProcess.aiTuningSnapshot = {
        appliedProfile: targetProfile,
        tuning: {
          exposure: baseEv,
          highlights: baseHighlights,
          contrast: baseContrast,
          shadows: baseShadows,
          blacks: baseBlacks,
          lutIntensity: baseLut,
          colorTemp: baseTemp,
          tint: baseTint,
          vibrance: baseVibrance,
          clarity: baseClarity,
          sharpness: baseSharpness,
          colorDensity: baseColorDensity,
          shadowHue: baseShadowHue,
          shadowTintAmount: baseShadowTintAmount,
          highlightHue: baseHighlightHue,
          highlightTintAmount: baseHighlightTintAmount,
          halation: baseHalation,
          grainAmount: baseGrainAmount,
          vignette: baseVignette,
          monochrome: baseMonochrome,
          hsl: cloneHslAdjustments(baseHsl),
        },
        crop: targetCrop ? { ...targetCrop } : undefined,
        appliedScope: { ...this.aiScope },
        appliedAt: Date.now(),
      };

      // 若目前為聚焦相片且為手動單幀觸發，更新全域滑桿與動態動畫
      if (isCurrentActive) {
        if (!this.isBatchAiRunning) {
          this.applyProfileToActivePhoto(targetProfile, false);
          const targetAnim: {
            exposure?: number;
            highlights?: number;
            contrast?: number;
            shadows?: number;
            blacks?: number;
            colorTemp?: number;
            tint?: number;
            vibrance?: number;
            lutIntensity?: number;
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
          } = {};
          if (this.aiScope.tone) {
            targetAnim.exposure = baseEv;
            targetAnim.highlights = baseHighlights;
            targetAnim.contrast = baseContrast;
            targetAnim.shadows = baseShadows;
            targetAnim.blacks = baseBlacks;
            targetAnim.clarity = baseClarity;
            targetAnim.sharpness = baseSharpness;
          }
          if (this.aiScope.whiteBalance) {
            targetAnim.colorTemp = baseTemp;
            targetAnim.tint = baseTint;
          }
          if (applyLutIntensity) {
            targetAnim.lutIntensity = baseLut;
          } else {
            darkroomState.lutIntensity = baseLut;
          }
          if (applyColorMixer) {
            targetAnim.vibrance = baseVibrance;
            targetAnim.colorDensity = baseColorDensity;
            targetAnim.hsl = cloneHslAdjustments(baseHsl);
          }
          if (applySplitToning) {
            targetAnim.shadowHue = baseShadowHue;
            targetAnim.shadowTintAmount = baseShadowTintAmount;
            targetAnim.highlightHue = baseHighlightHue;
            targetAnim.highlightTintAmount = baseHighlightTintAmount;
          }
          if (applyFilmTexture) {
            targetAnim.halation = baseHalation;
            targetAnim.grainAmount = baseGrainAmount;
            targetAnim.vignette = baseVignette;
          }
          darkroomState.highlights = baseHighlights;
          darkroomState.blacks = baseBlacks;
          darkroomState.clarity = baseClarity;
          darkroomState.sharpness = baseSharpness;
          darkroomState.monochrome = baseMonochrome;
          if (applyColorMixer) {
            darkroomState.vibrance = baseVibrance;
            darkroomState.colorDensity = baseColorDensity;
            darkroomState.hsl = cloneHslAdjustments(baseHsl);
          }
          if (applySplitToning) {
            darkroomState.shadowHue = baseShadowHue;
            darkroomState.shadowTintAmount = baseShadowTintAmount;
            darkroomState.highlightHue = baseHighlightHue;
            darkroomState.highlightTintAmount = baseHighlightTintAmount;
          }
          if (applyFilmTexture) {
            darkroomState.halation = baseHalation;
            darkroomState.grainAmount = baseGrainAmount;
            darkroomState.vignette = baseVignette;
          }
          if (Object.keys(targetAnim).length > 0) {
            this.animateAndSync(targetAnim, 650);
          }
          if (targetCrop) {
            darkroomState.cropX = targetCrop.x;
            darkroomState.cropY = targetCrop.y;
            darkroomState.cropWidth = targetCrop.width;
            darkroomState.cropHeight = targetCrop.height;
            darkroomState.cropRotation = targetCrop.rotation;
            darkroomState.keystoneV = targetCrop.keystoneV ?? 0;
            darkroomState.keystoneH = targetCrop.keystoneH ?? 0;
            darkroomState.cropAspectRatio = targetCrop.aspectRatio;
            darkroomState.flipH = targetCrop.flipH;
            darkroomState.flipV = targetCrop.flipV;
          }
        } else {
          // 批次模式中直接更新全域狀態，絕不觸發高頻動畫或重繪風暴
          darkroomState.exposure = baseEv;
          darkroomState.highlights = baseHighlights;
          darkroomState.contrast = baseContrast;
          darkroomState.shadows = baseShadows;
          darkroomState.blacks = baseBlacks;
          darkroomState.colorTemp = baseTemp;
          darkroomState.tint = baseTint;
          darkroomState.vibrance = baseVibrance;
          darkroomState.lutIntensity = baseLut;
          darkroomState.clarity = baseClarity;
          darkroomState.sharpness = baseSharpness;
          darkroomState.colorDensity = baseColorDensity;
          darkroomState.shadowHue = baseShadowHue;
          darkroomState.shadowTintAmount = baseShadowTintAmount;
          darkroomState.highlightHue = baseHighlightHue;
          darkroomState.highlightTintAmount = baseHighlightTintAmount;
          darkroomState.halation = baseHalation;
          darkroomState.grainAmount = baseGrainAmount;
          darkroomState.vignette = baseVignette;
          darkroomState.monochrome = baseMonochrome;
          darkroomState.hsl = cloneHslAdjustments(baseHsl);
          if (targetCrop) {
            darkroomState.cropX = targetCrop.x;
            darkroomState.cropY = targetCrop.y;
            darkroomState.cropWidth = targetCrop.width;
            darkroomState.cropHeight = targetCrop.height;
            darkroomState.cropRotation = targetCrop.rotation;
            darkroomState.keystoneV = targetCrop.keystoneV ?? 0;
            darkroomState.keystoneH = targetCrop.keystoneH ?? 0;
            darkroomState.cropAspectRatio = targetCrop.aspectRatio;
            darkroomState.flipH = targetCrop.flipH;
            darkroomState.flipV = targetCrop.flipV;
          }
        }
      }

      // 更新陣列中該相片，並排程非同步離屏縮圖渲染
      photoLibrary.photoPlates = photoLibrary.photoPlates.map((p) =>
        p.id === photoToProcess.id ? { ...photoToProcess } : p,
      );
      if (
        photoLibrary.activePhoto &&
        photoLibrary.activePhoto.id === photoToProcess.id
      ) {
        photoLibrary.activePhoto = { ...photoToProcess };
      }
      thumbnailRenderService.enqueueThumbnailRender(photoToProcess);

      await this.appendAiLog(`> [SUCCESS] 顯影調校完成 ✓`, 10);
      if (!this.isBatchAiRunning) {
        toastStore.show(
          `【${decision.scene_title || decision.scene_type}】AI 顯影調校完成 ✓`,
          "success",
        );
      }
      return true;
    } catch (err: any) {
      if (
        this.cancelBatchRequested ||
        err?.message?.includes("手動中止") ||
        err?.name === "AbortError"
      ) {
        await this.appendAiLog(
          `> [BATCH_ABORT] 使用者已手動停止顯影程序。`,
          10,
        );
        return false;
      }
      console.error("AI Analysis failed:", err);
      await this.appendAiLog(
        `> [ERROR] 顯影推估異常：${err.message || "未知錯誤"}`,
        20,
      );
      toastStore.show(
        `AI 顯影失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
      return false;
    } finally {
      this.isAiAnalyzing = false;
    }
  }

  /**
   * 獨立快捷操作：一鍵 AI 智慧裁切
   */
  async quickAiCrop(): Promise<void> {
    const activePhoto = photoLibrary.activePhoto;
    if (!activePhoto || this.isAiAnalyzing) return;
    this.isAiAnalyzing = true;
    await this.appendAiLog(
      `> [AI_CROP_SOLO] 正在分析 ${activePhoto.filename} 構圖重心與邊界...`,
    );
    try {
      const decision = await AiSceneService.analyzeScene(
        activePhoto.thumbnail,
        {
          cameraModel: activePhoto.camera,
          lensModel: activePhoto.lens,
          iso: activePhoto.iso,
          shutterSpeed: activePhoto.shutter,
          apertureValue: activePhoto.aperture,
          focalLength: activePhoto.focalLength,
        },
        {
          scope: {
            crop: true,
            keystone: true,
            tone: false,
            whiteBalance: false,
            lutProfile: false,
          },
        },
      );
      if (decision.crop_box) {
        darkroomState.cropY = decision.crop_box[0];
        darkroomState.cropX = decision.crop_box[1];
        darkroomState.cropHeight = decision.crop_box[2] - decision.crop_box[0];
        darkroomState.cropWidth = decision.crop_box[3] - decision.crop_box[1];
      }
      if (typeof decision.rotation_deg === "number") {
        darkroomState.cropRotation = decision.rotation_deg;
      }
      if (
        decision.aspect_ratio &&
        ["original", "1:1", "4:5", "16:9", "9:16", "free"].includes(
          decision.aspect_ratio,
        )
      ) {
        darkroomState.cropAspectRatio = decision.aspect_ratio as any;
      }
      const rationale = decision.crop_rationale || "已套用 AI 建議構圖比例。";
      darkroomState.aiCropRationale = rationale;
      darkroomState.isCropMode = true; // 自動開啟裁切框供檢視
      await this.appendAiLog(`> [SUCCESS] 智慧裁切已套用：${rationale} ✓`);
      toastStore.show(`智慧構圖已套用：${rationale} ✓`, "success");
    } catch (err: any) {
      await this.appendAiLog(`> [ERROR] 裁切分析失敗：${err.message}`);
      toastStore.show(
        `AI 裁切失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
    } finally {
      this.isAiAnalyzing = false;
    }
  }

  /**
   * 獨立快捷操作：一鍵 AI 拉平水平 / 梯形
   */
  async quickAiHorizon(): Promise<void> {
    const activePhoto = photoLibrary.activePhoto;
    if (!activePhoto || this.isAiAnalyzing) return;
    this.isAiAnalyzing = true;
    await this.appendAiLog(
      `> [AI_HORIZON_SOLO] 正在偵測地平線傾角與垂直透視...`,
    );
    try {
      const decision = await AiSceneService.analyzeScene(
        activePhoto.thumbnail,
        {
          cameraModel: activePhoto.camera,
          lensModel: activePhoto.lens,
          iso: activePhoto.iso,
          shutterSpeed: activePhoto.shutter,
          apertureValue: activePhoto.aperture,
          focalLength: activePhoto.focalLength,
        },
        {
          scope: {
            crop: false,
            keystone: true,
            tone: false,
            whiteBalance: false,
            lutProfile: false,
          },
        },
      );
      const nextRotation =
        typeof decision.rotation_deg === "number" ? decision.rotation_deg : 0.0;
      const nextKeystoneV =
        typeof decision.keystone_v === "number" ? decision.keystone_v : 0.0;
      darkroomState.cropRotation = nextRotation;
      darkroomState.keystoneV = nextKeystoneV;
      await this.appendAiLog(
        `> [SUCCESS] 地平線校正 ${nextRotation.toFixed(1)}°，垂直梯形 ${nextKeystoneV.toFixed(1)}° ✓`,
      );
      toastStore.show(
        `地平線校正 ${nextRotation.toFixed(1)}°，垂直梯形 ${nextKeystoneV.toFixed(1)}° ✓`,
        "success",
      );
    } catch (err: any) {
      await this.appendAiLog(`> [ERROR] 水平偵測失敗：${err.message}`);
      toastStore.show(
        `水平偵測失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
    } finally {
      this.isAiAnalyzing = false;
    }
  }

  /**
   * 獨立快捷操作：一鍵 AI 自動白平衡 (Kelvin & Tint)
   */
  async quickAiWhiteBalance(): Promise<void> {
    const activePhoto = photoLibrary.activePhoto;
    if (!activePhoto || this.isAiAnalyzing) return;
    this.isAiAnalyzing = true;
    await this.appendAiLog(`> [AI_WB_SOLO] 計算場景色溫與色彩中性灰...`);
    try {
      const decision = await AiSceneService.analyzeScene(
        activePhoto.thumbnail,
        {
          cameraModel: activePhoto.camera,
          lensModel: activePhoto.lens,
          iso: activePhoto.iso,
          shutterSpeed: activePhoto.shutter,
          apertureValue: activePhoto.aperture,
          focalLength: activePhoto.focalLength,
        },
        {
          scope: {
            crop: false,
            keystone: false,
            tone: false,
            whiteBalance: true,
            lutProfile: false,
            filmPhysics: false,
          },
        },
      );
      this.animateAndSync(
        {
          colorTemp: decision.color_temp ?? darkroomState.colorTemp,
          tint: decision.tint ?? darkroomState.tint,
        },
        500,
      );
      await this.appendAiLog(
        `> [SUCCESS] 自動白平衡已套用 (${decision.color_temp}K, Tint: ${decision.tint}) ✓`,
      );
      toastStore.show(
        `自動白平衡已套用 (${decision.color_temp}K, Tint: ${decision.tint}) ✓`,
        "success",
      );
    } catch (err: any) {
      await this.appendAiLog(`> [ERROR] 白平衡失敗：${err.message}`);
      toastStore.show(
        `白平衡失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
    } finally {
      this.isAiAnalyzing = false;
    }
  }

  /**
   * 獨立快捷操作：一鍵 AI 自動光比 (曝光/對比/陰影)
   */
  async quickAiTone(): Promise<void> {
    const activePhoto = photoLibrary.activePhoto;
    if (!activePhoto || this.isAiAnalyzing) return;
    this.isAiAnalyzing = true;
    await this.appendAiLog(`> [AI_TONE_SOLO] 分析曝光分佈與動態範圍...`);
    try {
      const decision = await AiSceneService.analyzeScene(
        activePhoto.thumbnail,
        {
          cameraModel: activePhoto.camera,
          lensModel: activePhoto.lens,
          iso: activePhoto.iso,
          shutterSpeed: activePhoto.shutter,
          apertureValue: activePhoto.aperture,
          focalLength: activePhoto.focalLength,
        },
        {
          scope: {
            crop: false,
            keystone: false,
            tone: true,
            whiteBalance: false,
            lutProfile: false,
            filmPhysics: false,
          },
        },
      );
      this.animateAndSync(
        {
          exposure: decision.exposure_compensation,
          highlights: decision.highlights ?? darkroomState.highlights,
          contrast: decision.contrast ?? darkroomState.contrast,
          blacks: decision.blacks ?? darkroomState.blacks,
        },
        500,
      );
      darkroomState.shadows = decision.lift_shadows;
      if (typeof decision.highlights === "number") {
        darkroomState.highlights = decision.highlights;
      }
      if (typeof decision.blacks === "number") {
        darkroomState.blacks = decision.blacks;
      }
      if (typeof decision.clarity === "number") {
        darkroomState.clarity = decision.clarity;
      }
      if (typeof decision.sharpness === "number") {
        darkroomState.sharpness = decision.sharpness;
      }
      await this.appendAiLog(
        `> [SUCCESS] 自動光比已套用 (EV: ${decision.exposure_compensation > 0 ? "+" : ""}${decision.exposure_compensation}) ✓`,
      );
      toastStore.show(
        `自動光比已套用 (EV: ${decision.exposure_compensation > 0 ? "+" : ""}${decision.exposure_compensation}) ✓`,
        "success",
      );
    } catch (err: any) {
      await this.appendAiLog(`> [ERROR] 光比失敗：${err.message}`);
      toastStore.show(
        `光比分析失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
    } finally {
      this.isAiAnalyzing = false;
    }
  }

  /**
   * 獨立快捷操作：一鍵 AI 推薦風格
   */
  async quickAiProfile(): Promise<void> {
    const activePhoto = photoLibrary.activePhoto;
    if (!activePhoto || this.isAiAnalyzing) return;
    this.isAiAnalyzing = true;
    await this.appendAiLog(`> [AI_PROFILE_SOLO] 匹配底片情緒風格範本...`);
    try {
      const decision = await AiSceneService.analyzeScene(
        activePhoto.thumbnail,
        {
          cameraModel: activePhoto.camera,
          lensModel: activePhoto.lens,
          iso: activePhoto.iso,
          shutterSpeed: activePhoto.shutter,
          apertureValue: activePhoto.aperture,
          focalLength: activePhoto.focalLength,
        },
        {
          scope: {
            crop: false,
            keystone: false,
            tone: false,
            whiteBalance: false,
            lutProfile: true,
            filmPhysics: false,
          },
          stylePreset: darkroomState.activeStylePreset,
        },
      );
      this.applyProfileToActivePhoto(decision.recommended_profile);
      this.animateAndSync(
        {
          lutIntensity: decision.lut_intensity,
        },
        400,
      );
      await this.appendAiLog(
        `> [SUCCESS] 已推薦套用：${decision.recommended_profile} ✓`,
      );
      toastStore.show(
        `已推薦套用風格：${decision.recommended_profile} ✓`,
        "success",
      );
    } catch (err: any) {
      await this.appendAiLog(`> [ERROR] 風格推薦失敗：${err.message}`);
      toastStore.show(
        `風格推薦失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
    } finally {
      this.isAiAnalyzing = false;
    }
  }

  /**
   * 觸發 Groq 極速社群文案與 IPTC 標籤生成
   */
  async triggerGroqCopywriting(): Promise<void> {
    const activePhoto = photoLibrary.activePhoto;
    if (!activePhoto) return;
    this.isGeneratingCopy = true;
    try {
      const res = await AiSceneService.generateGroqCopywriting({
        tags:
          this.aiVisionTags.length > 0
            ? this.aiVisionTags
            : ["底片攝影", "街頭光影"],
        sceneTitle: this.aiSceneTitle || "底片光影顯影",
        userPrompt: this.userSocialPrompt,
        cameraModel: activePhoto.camera,
        lensModel: activePhoto.lens,
        exifOptical: `${activePhoto.shutter} · ${activePhoto.aperture} · ISO ${activePhoto.iso}`,
      });
      this.aiSocialCaption = res.caption;
      this.aiSocialHashtags = res.hashtags;
      this.aiIptcKeywords = res.iptcKeywords;
      toastStore.show("AI 社群文案與標籤已生成 ✓", "success", 2500);
    } catch (err: any) {
      console.error("Groq copywriting error:", err);
      toastStore.show(
        `文案生成失敗：${err.message || "雲端推論異常"}`,
        "error",
        4500,
      );
    } finally {
      this.isGeneratingCopy = false;
    }
  }

  /**
   * 一鍵複製社群文案至剪貼簿
   */
  async copySocialContent(): Promise<void> {
    if (!this.aiSocialCaption) return;
    const fullText = `${this.aiSocialCaption}\n\n${this.aiSocialHashtags.join(" ")}`;
    try {
      await navigator.clipboard.writeText(fullText);
      this.copyNotice = "文案已複製 ✓";
      toastStore.show("社群文案與標籤已複製至剪貼簿 ✓", "success", 2500);
      setTimeout(() => {
        this.copyNotice = "";
      }, 2500);
    } catch {
      this.copyNotice = "複製失敗";
      toastStore.show("文案複製失敗", "error", 3000);
      setTimeout(() => {
        this.copyNotice = "";
      }, 2000);
    }
  }

  /**
   * 啟動 AI 批次顯影（Pre-flight 檢查金鑰，未配置時彈出對話框詢問）
   */
  requestBatchAiAnalysis(): void {
    const targetList =
      photoLibrary.flaggedPhotos.length > 0
        ? photoLibrary.flaggedPhotos
        : photoLibrary.photoPlates;
    if (targetList.length === 0) {
      this.onNotice?.("目前相簿無相片可供 AI 批次顯影");
      return;
    }

    if (!this.hasActiveApiKey()) {
      this.onRequireApiKey?.();
    } else {
      this.runBatchAiAnalysis();
    }
  }

  /**
   * AI 批次顯影調色（含 4.2s 速率保護與取消中斷）
   */
  async runBatchAiAnalysis(): Promise<void> {
    const targetList =
      photoLibrary.flaggedPhotos.length > 0
        ? [...photoLibrary.flaggedPhotos]
        : [...photoLibrary.photoPlates];
    if (targetList.length === 0) {
      this.onNotice?.("目前相簿無相片可供 AI 批次顯影");
      return;
    }

    if (!this.hasActiveApiKey()) {
      this.onRequireApiKey?.();
      return;
    }

    this.isBatchAiRunning = true;
    this.cancelBatchRequested = false;
    this.batchAbortController = new AbortController();
    this.aiTerminalLogs = [];
    await this.appendAiLog(
      `> [BATCH_START] 啟動 AI 批次顯影調色，共 ${targetList.length} 張相片...`,
      20,
    );

    const activeModelInfo = AiSceneService.getActiveModelInfo();
    await this.appendAiLog(
      `> [CLOUD_AI] 已偵測到有效金鑰，啟動視覺多模態雲端推論 [${activeModelInfo.provider.toUpperCase()} · ${activeModelInfo.modelId}]`,
      20,
    );
    await this.appendAiLog(
      `> [RATE_LIMIT] 啟用雲端 API 速率保護 (間隔 4.2 秒防超限冷卻)`,
      20,
    );

    for (let i = 0; i < targetList.length; i++) {
      if (this.cancelBatchRequested) {
        await this.appendAiLog(
          `> [BATCH_ABORT] 使用者已手動中止批次顯影程序。`,
          10,
        );
        break;
      }

      const p = targetList[i];
      this.batchProgress = {
        current: i + 1,
        total: targetList.length,
        countdown: 0,
      };
      await this.appendAiLog(`----------------------------------------`, 10);
      await this.appendAiLog(
        `> [BATCH ${i + 1}/${targetList.length}] 正在顯影：${p.filename}`,
        20,
      );

      // 讓出微任務讓瀏覽器 DOM 渲染與事件處理器有空隙運作
      await new Promise((r) => setTimeout(r, 16));

      await this.runAiAnalysis(p);

      if (this.cancelBatchRequested) {
        await this.appendAiLog(
          `> [BATCH_ABORT] 使用者已手動中止批次顯影程序。`,
          10,
        );
        break;
      }

      // 每張相片之間進行 4.2 秒速率保護等待，避免超過雲端 API 速率限制
      if (i < targetList.length - 1 && !this.cancelBatchRequested) {
        for (let cd = 4; cd > 0; cd--) {
          if (this.cancelBatchRequested) break;
          this.batchProgress.countdown = cd;
          await new Promise((r) => setTimeout(r, 1000));
        }
        if (this.batchProgress) this.batchProgress.countdown = 0;
      }
    }

    if (!this.cancelBatchRequested) {
      await this.appendAiLog(
        `> [BATCH_COMPLETE] 全部 ${targetList.length} 張相片批次顯影完成！🎉`,
        10,
      );
    }

    this.isBatchAiRunning = false;
    this.batchProgress = null;
    this.cancelBatchRequested = false;
    this.batchAbortController = null;

    // 批次完成後，若當前焦點底片有被處理，重繪畫布一次
    if (photoLibrary.activePhoto) {
      requestAnimationFrame(() => {
        this.onTriggerRender?.();
      });
    }
  }

  /**
   * 立即中止正在執行的 AI 批次顯影
   */
  cancelBatchAi(): void {
    this.cancelBatchRequested = true;
    if (this.batchAbortController) {
      this.batchAbortController.abort();
    }
    this.appendAiLog(
      "> [BATCH_INTERRUPT] 已收到停止指令，正在立即中止批次顯影...",
      0,
    );
  }
}

export const aiPipeline = new AiPipelineStore();
