<script lang="ts">
  import { darkroomState, type CropRatioPreset, type BwFilterPresetKey } from "$lib/stores/darkroomState.svelte";
  import { photoLibrary, type PhotoPlateItem } from "$lib/stores/photoLibrary.svelte";
  import { aiPipeline } from "$lib/stores/aiPipeline.svelte";
  import { HSL_BAND_KEYS, createDefaultHslAdjustments, type HslBandKey } from "$lib/types/photo";
  import DarkroomSlider from "./DarkroomSlider.svelte";
  import DarkroomHistogram from "./DarkroomHistogram.svelte";
  import { toastStore } from "$lib/stores/toastStore.svelte";
  import { t, type TranslationKey } from "$lib/i18n";
  import {
    TUNING_PANEL_UI_STORAGE_KEY,
    DEFAULT_TUNING_PANEL_UI_STATE,
    readLocalJson,
    writeLocalJson,
  } from "$lib/utils/panelStorage";

  const HSL_BAND_META: {
    key: HslBandKey;
    labelKey: TranslationKey;
    color: string;
    hueGradient: string;
  }[] = [
    { key: "red", labelKey: "tuning.bandRed", color: "#e05555", hueGradient: "linear-gradient(to right, #c74ca8 0%, #e05555 50%, #e68a3e 100%)" },
    { key: "orange", labelKey: "tuning.bandOrange", color: "#e68a3e", hueGradient: "linear-gradient(to right, #e05555 0%, #e68a3e 50%, #d9bd45 100%)" },
    { key: "yellow", labelKey: "tuning.bandYellow", color: "#d9bd45", hueGradient: "linear-gradient(to right, #e68a3e 0%, #d9bd45 50%, #52b365 100%)" },
    { key: "green", labelKey: "tuning.bandGreen", color: "#52b365", hueGradient: "linear-gradient(to right, #d9bd45 0%, #52b365 50%, #46b8c4 100%)" },
    { key: "cyan", labelKey: "tuning.bandCyan", color: "#46b8c4", hueGradient: "linear-gradient(to right, #52b365 0%, #46b8c4 50%, #4e79d9 100%)" },
    { key: "blue", labelKey: "tuning.bandBlue", color: "#4e79d9", hueGradient: "linear-gradient(to right, #46b8c4 0%, #4e79d9 50%, #b558d6 100%)" },
  ];

  const initialTuningUi = readLocalJson(
    TUNING_PANEL_UI_STORAGE_KEY,
    DEFAULT_TUNING_PANEL_UI_STATE
  );
  let selectedHslBand = $state<HslBandKey>(
    HSL_BAND_KEYS.includes(initialTuningUi.selectedHslBand)
      ? initialTuningUi.selectedHslBand
      : "red"
  );
  let lutTuningExpanded = $state<boolean>(Boolean(initialTuningUi.lutTuningExpanded));
  let toningExpanded = $state<boolean>(Boolean(initialTuningUi.toningExpanded));
  let hslExpanded = $state<boolean>(Boolean(initialTuningUi.hslExpanded));
  let cropExpanded = $state<boolean>(Boolean(initialTuningUi.cropExpanded));

  function saveTuningPanelUi(): void {
    writeLocalJson(TUNING_PANEL_UI_STORAGE_KEY, {
      lutTuningExpanded,
      toningExpanded,
      hslExpanded,
      cropExpanded,
      selectedHslBand,
    });
  }

  const BW_FILTER_PRESETS: { key: BwFilterPresetKey; labelKey: TranslationKey; titleKey: TranslationKey }[] = [
    { key: "neutral", labelKey: "tuning.bwNeutral", titleKey: "tuning.bwNeutralTitle" },
    { key: "yellow", labelKey: "tuning.bwYellow", titleKey: "tuning.bwYellowTitle" },
    { key: "orange", labelKey: "tuning.bwOrange", titleKey: "tuning.bwOrangeTitle" },
    { key: "red", labelKey: "tuning.bwRed", titleKey: "tuning.bwRedTitle" },
    { key: "green", labelKey: "tuning.bwGreen", titleKey: "tuning.bwGreenTitle" },
    { key: "portrait", labelKey: "tuning.bwPortrait", titleKey: "tuning.bwPortraitTitle" },
  ];

  const CROP_RATIO_OPTIONS: { key: CropRatioPreset; labelKey: TranslationKey; sub: string }[] = [
    { key: "original", labelKey: "tuning.cropOriginal", sub: "ORIG" },
    { key: "1:1", labelKey: "tuning.cropSquare", sub: "1:1" },
    { key: "4:5", labelKey: "tuning.cropPortrait45", sub: "4:5" },
    { key: "16:9", labelKey: "tuning.cropWide169", sub: "16:9" },
    { key: "9:16", labelKey: "tuning.cropVertical916", sub: "9:16" },
    { key: "free", labelKey: "tuning.cropFree", sub: "FREE" },
  ];

  // 將 0~360 度色相轉換為易讀的色彩名稱
  function describeHueName(deg: number): string {
    const d = ((Math.round(deg) % 360) + 360) % 360;
    if (d < 18 || d >= 345) return t("tuning.hueCrimson");
    if (d < 48) return t("tuning.hueAmber");
    if (d < 72) return t("tuning.hueYellow");
    if (d < 155) return t("tuning.hueEmerald");
    if (d < 205) return t("tuning.hueCyan");
    if (d < 255) return t("tuning.hueIndigo");
    if (d < 300) return t("tuning.hueViolet");
    return t("tuning.hueMagenta");
  }

  const hasAnyBwLumAdjustment = $derived(
    HSL_BAND_KEYS.some((k) => Math.abs(darkroomState.hsl?.[k]?.lum ?? 0) > 0.001)
  );

  const hasAnyHslAdjustment = $derived(
    HSL_BAND_KEYS.some((k) => {
      const b = darkroomState.hsl?.[k];
      return b && (Math.abs(b.hue) > 0.001 || Math.abs(b.sat) > 0.001 || Math.abs(b.lum) > 0.001);
    })
  );

  const selectedHslMeta = $derived(
    HSL_BAND_META.find((m) => m.key === selectedHslBand) ?? HSL_BAND_META[0]
  );

  function isHslBandDirty(key: HslBandKey): boolean {
    const b = darkroomState.hsl?.[key];
    return Boolean(b && (Math.abs(b.hue) > 0.001 || Math.abs(b.sat) > 0.001 || Math.abs(b.lum) > 0.001));
  }

  // 百分比參數解析函式 (支援 20 -> 0.2 或 0.2 -> 0.2)
  function parsePercentage(text: string): number | null {
    const clean = text.replace("%", "").trim();
    const num = parseFloat(clean);
    if (isNaN(num)) return null;
    return Math.abs(num) > 1.0 ? num / 100 : num;
  }

  // 角度與純數值解析函式
  function parseCleanNumber(text: string): number | null {
    const clean = text.replace(/[^0-9.-]/g, "").trim();
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
  }

  interface Props {
    profiles: any[];
    styleGradingPresets: any[];
    hasAiBaseline?: boolean;
    isModifiedFromAi?: boolean;
    activePhoto?: PhotoPlateItem | any;
    activeProfileId?: string;
    onRestoreAiTuning?: () => void;
    onIterateAiTuning?: () => void;
    onQuickAiTone?: () => void;
    onQuickAiWhiteBalance?: () => void;
    onResetToAsShot?: () => void;
    onResetTuningParams?: () => void;
    onQuickAiCrop?: () => void;
    onQuickAiHorizon?: () => void;
    onQuickAiProfile?: () => void;
    onApplyProfile?: (profileId: string) => void;
    onHoverProfile?: (profileId: string | null) => void;
    onOpenQuickExport?: () => void;
    onGoToExport?: () => void;
  }

  let {
    profiles = [],
    styleGradingPresets = [],
    hasAiBaseline = false,
    isModifiedFromAi = false,
    activePhoto: propsActivePhoto = null,
    activeProfileId: propsActiveProfileId,
    onRestoreAiTuning,
    onIterateAiTuning,
    onQuickAiTone,
    onQuickAiWhiteBalance,
    onResetToAsShot,
    onResetTuningParams,
    onQuickAiCrop,
    onQuickAiHorizon,
    onQuickAiProfile,
    onApplyProfile,
    onHoverProfile,
    onOpenQuickExport,
    onGoToExport,
  }: Props = $props();

  const activePhoto = $derived(propsActivePhoto ?? photoLibrary.activePhoto);
  const isAiAnalyzing = $derived(aiPipeline.isAiAnalyzing);

  const hasAnyToneAdjustment = $derived(
    Math.abs(darkroomState.exposure) > 0.01 ||
    Math.abs(darkroomState.highlights) > 0.01 ||
    Math.abs(darkroomState.contrast) > 0.01 ||
    Math.abs(darkroomState.shadows) > 0.01 ||
    Math.abs(darkroomState.blacks) > 0.01 ||
    Math.abs(darkroomState.lutIntensity - 1.0) > 0.01 ||
    Math.abs(darkroomState.colorTemp - (activePhoto?.asShotTemp ?? 5500)) > 20 ||
    Math.abs(darkroomState.tint - (activePhoto?.asShotTint ?? 0)) > 0.5 ||
    Math.abs(darkroomState.vibrance) > 0.01 ||
    Math.abs(darkroomState.clarity) > 0.01 ||
    Math.abs(darkroomState.sharpness) > 0.01
  );

  const hasAnyToningAdjustment = $derived(
    Math.abs(darkroomState.colorDensity) > 0.01 ||
    Math.abs(darkroomState.halation) > 0.01 ||
    Math.abs(darkroomState.grainAmount - 0.15) > 0.01 ||
    Math.abs(darkroomState.shadowTintAmount) > 0.01 ||
    Math.abs(darkroomState.highlightTintAmount) > 0.01 ||
    Math.abs(darkroomState.vignette) > 0.01
  );

  const hasAnyCropAdjustment = $derived(
    darkroomState.cropWidth < 0.999 ||
    darkroomState.cropHeight < 0.999 ||
    Math.abs(darkroomState.cropRotation) > 0.05 ||
    Math.abs(darkroomState.keystoneV) > 0.05 ||
    darkroomState.flipH ||
    darkroomState.flipV
  );
  const currentProfileId = $derived(
    propsActiveProfileId ?? activePhoto?.appliedProfile ?? "Profile_00_StandardNatural",
  );
  const activeStyleTitle = $derived.by(() => {
    const preset = styleGradingPresets.find((sp) => sp.profileId === currentProfileId);
    if (preset) return preset.title || preset.shortLabel;
    const prof = profiles.find((p) => p.id === currentProfileId);
    if (prof) return prof.title || prof.name || prof.id;
    return t("tuning.defaultStyleTitle");
  });

  // 監聽各項參數變更以自動記錄快照歷史 (防抖 300ms)
  $effect(() => {
    const _exp = darkroomState.exposure;
    const _hi = darkroomState.highlights;
    const _con = darkroomState.contrast;
    const _sha = darkroomState.shadows;
    const _blk = darkroomState.blacks;
    const _lut = darkroomState.lutIntensity;
    const _tem = darkroomState.colorTemp;
    const _tin = darkroomState.tint;
    const _vib = darkroomState.vibrance;
    const _cla = darkroomState.clarity;
    const _shp = darkroomState.sharpness;
    const _den = darkroomState.colorDensity;
    const _shH = darkroomState.shadowHue;
    const _shA = darkroomState.shadowTintAmount;
    const _hiH = darkroomState.highlightHue;
    const _hiA = darkroomState.highlightTintAmount;
    const _hal = darkroomState.halation;
    const _grn = darkroomState.grainAmount;
    const _vig = darkroomState.vignette;
    const _hslSig = HSL_BAND_KEYS.map((k) => {
      const b = darkroomState.hsl[k];
      return `${b.hue},${b.sat},${b.lum}`;
    }).join(";");
    const _rot = darkroomState.cropRotation;
    const _kv = darkroomState.keystoneV;
    const _cx = darkroomState.cropX;
    const _cy = darkroomState.cropY;
    const _cw = darkroomState.cropWidth;
    const _ch = darkroomState.cropHeight;
    const _fh = darkroomState.flipH;
    const _fv = darkroomState.flipV;

    darkroomState.recordSnapshot();
  });

  // 鍵盤復原/重做快速鍵監聽 (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
  $effect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (!modKey) return;

      const key = e.key.toLowerCase();

      // Undo: Ctrl+Z
      if (key === "z" && !e.shiftKey) {
        if (darkroomState.canUndo) {
          e.preventDefault();
          darkroomState.undo();
          toastStore.show(t("tuning.toastUndo"), "info", 1200);
        }
      }
      // Redo: Ctrl+Y 或 Ctrl+Shift+Z
      else if (key === "y" || (key === "z" && e.shiftKey)) {
        if (darkroomState.canRedo) {
          e.preventDefault();
          darkroomState.redo();
          toastStore.show(t("tuning.toastRedo"), "info", 1200);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });
</script>

<!-- ══════════════════════════════════════════════════════════════════════
     頂部常駐控制區：光學直方圖 ＋ 目前風格 ＋ 全域歷史與重設工具列
     ══════════════════════════════════════════════════════════════════════ -->
<div class="tuning-sticky-top hairline-b">
  <!-- 光學即時直方圖波形 -->
  <DarkroomHistogram {activePhoto} />

  <!-- 顯影輸出模式與目前套用風格資訊 -->
  <div class="output-mode-panel">
    <div class="output-mode-bar">
      <div class="style-status-info" title={t("tuning.styleTitleTip", { title: activeStyleTitle })}>
        <span class="style-status-label">{t("tuning.currentStyle")}</span>
        <span class="style-status-name font-headline">{activeStyleTitle}</span>
      </div>

      <div class="output-mode-switch font-mono" role="group" aria-label={t("tuning.outputModeAria")}>
        <button
          type="button"
          class="output-mode-btn"
          class:active={!darkroomState.monochrome}
          onclick={() => {
            if (darkroomState.monochrome) {
              darkroomState.monochrome = false;
              darkroomState.recordSnapshot(true);
            }
          }}
          title={t("tuning.colorModeTitle")}
        >
          <span class="mode-dot color"></span>
          <span>{t("tuning.colorMode")}</span>
        </button>
        <button
          type="button"
          class="output-mode-btn"
          class:active={darkroomState.monochrome}
          onclick={() => {
            if (!darkroomState.monochrome) {
              darkroomState.monochrome = true;
              darkroomState.recordSnapshot(true);
            }
          }}
          title={t("tuning.monoModeTitle")}
        >
          <span class="mode-dot mono"></span>
          <span>{t("tuning.monoMode")}</span>
        </button>
      </div>
    </div>

    <!-- 全域歷史紀錄、複製貼上與重設工具列（避免塞在滑桿區標題列） -->
    <div class="global-history-toolbar font-mono">
      <div class="history-left-group">
        <button
          type="button"
          class="toolbar-btn"
          class:is-disabled={!darkroomState.canUndo}
          disabled={!darkroomState.canUndo}
          onclick={() => {
            if (darkroomState.undo()) {
              toastStore.show(t("tuning.toastUndoShort"), "info", 1200);
            }
          }}
          title={t("tuning.undoTitle")}
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">undo</span>
          <span>{t("tuning.undo")}</span>
        </button>

        <button
          type="button"
          class="toolbar-btn"
          class:is-disabled={!darkroomState.canRedo}
          disabled={!darkroomState.canRedo}
          onclick={() => {
            if (darkroomState.redo()) {
              toastStore.show(t("tuning.toastRedoShort"), "info", 1200);
            }
          }}
          title={t("tuning.redoTitle")}
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">redo</span>
          <span>{t("tuning.redo")}</span>
        </button>

        <span class="toolbar-divider"></span>

        <button
          type="button"
          class="toolbar-btn"
          onclick={() => {
            if (!activePhoto) return;
            darkroomState.copyCurrentTuning(activePhoto.appliedProfile);
            toastStore.show(t("tuning.toastCopied"), "success", 2000);
          }}
          title={t("tuning.copyTitle")}
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">content_copy</span>
          <span>{t("tuning.copy")}</span>
        </button>

        {#if darkroomState.copiedTuning}
          <button
            type="button"
            class="toolbar-btn highlight"
            onclick={() => {
              const pasted = darkroomState.pasteCopiedTuning();
              if (pasted && onApplyProfile) {
                onApplyProfile(pasted.appliedProfile);
              }
              toastStore.show(t("tuning.toastPasted"), "success", 2000);
            }}
            title={t("tuning.pasteTitle")}
          >
            <span class="material-symbols-outlined" style="font-size: 13px;">content_paste</span>
            <span>{t("tuning.paste")}</span>
          </button>
        {/if}
      </div>

      <div class="history-right-group">
        {#if hasAiBaseline && isModifiedFromAi && onIterateAiTuning}
          <button
            type="button"
            class="toolbar-btn highlight"
            disabled={isAiAnalyzing}
            onclick={onIterateAiTuning}
            title={t("tuning.aiAssistTitle")}
          >
            <span class="material-symbols-outlined" class:spin={isAiAnalyzing} style="font-size: 13px;">
              {isAiAnalyzing ? "progress_activity" : "auto_fix_high"}
            </span>
            <span>{t("tuning.aiAssist")}</span>
          </button>
        {/if}

        {#if hasAiBaseline && onRestoreAiTuning}
          <button
            type="button"
            class="toolbar-btn"
            class:highlight={isModifiedFromAi}
            onclick={onRestoreAiTuning}
            title={isModifiedFromAi ? t("tuning.restoreAiModified") : t("tuning.restoreAiBaseline")}
          >
            <span class="material-symbols-outlined" style="font-size: 13px;">
              settings_backup_restore
            </span>
            <span>{t("tuning.restoreAi")}</span>
          </button>
        {/if}

        {#if onResetToAsShot}
          <button
            type="button"
            class="toolbar-btn"
            onclick={onResetToAsShot}
            title={t("tuning.asShotTitle")}
          >
            <span class="material-symbols-outlined" style="font-size: 13px;">photo_camera</span>
            <span>{t("tuning.asShot")}</span>
          </button>
        {/if}

        {#if onResetTuningParams}
          <button
            type="button"
            class="toolbar-btn danger-hover"
            onclick={onResetTuningParams}
            title={t("tuning.resetAllTitle")}
          >
            <span class="material-symbols-outlined" style="font-size: 13px;">restart_alt</span>
            <span>{t("tuning.resetAll")}</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<!-- ══════════════════════════════════════════════════════════════════════
     步驟 1：光影與白平衡 (Tone & White Balance)
     ══════════════════════════════════════════════════════════════════════ -->
<section class="tuning-section hairline-b">
  <div class="section-header-bar" style="margin-bottom: {lutTuningExpanded ? '10px' : '0'};">
    <button
      type="button"
      class="section-collapse-btn"
      onclick={() => {
        lutTuningExpanded = !lutTuningExpanded;
        saveTuningPanelUi();
      }}
      aria-expanded={lutTuningExpanded}
      title={t("tuning.sec1ToggleTitle")}
    >
      <span class="step-num-badge font-mono">1</span>
      <span class="section-main-title">{t("tuning.sec1Title")}</span>
      {#if hasAnyToneAdjustment}
        <span class="section-dirty-dot" title={t("tuning.secDirtyDot")}></span>
      {/if}
      <span class="material-symbols-outlined section-chevron">
        {lutTuningExpanded ? "expand_more" : "chevron_right"}
      </span>
    </button>

    <div class="section-quick-actions font-mono">
      {#if onQuickAiTone}
        <button
          type="button"
          class="quick-ai-btn"
          onclick={onQuickAiTone}
          disabled={isAiAnalyzing || !activePhoto}
          title={t("tuning.aiExposureTitle")}
        >
          <span class="material-symbols-outlined ai-icon">exposure</span>
          <span>{t("tuning.aiExposure")}</span>
        </button>
      {/if}

      {#if onQuickAiWhiteBalance}
        <button
          type="button"
          class="quick-ai-btn"
          onclick={onQuickAiWhiteBalance}
          disabled={isAiAnalyzing || !activePhoto}
          title={t("tuning.aiWbTitle")}
        >
          <span class="material-symbols-outlined ai-icon">thermostat</span>
          <span>{t("tuning.aiWb")}</span>
        </button>
      {/if}
    </div>
  </div>

  {#if lutTuningExpanded}
    <!-- 子分組 A：風格濃度與白平衡 -->
    <div class="sub-group-card">
      <div class="sub-group-title">
        <span>{t("tuning.subWbTitle")}</span>
        <span class="sub-group-en font-mono">STYLE & WB</span>
      </div>

      <DarkroomSlider
        label={t("tuning.lblLutIntensity")}
        subLabel="LUT"
        bind:value={darkroomState.lutIntensity}
        defaultValue={1.0}
        min={0}
        max={1}
        step={0.01}
        amberValue={true}
        formatValue={(v) => `${Math.round(v * 100)}%`}
        parseInput={parsePercentage}
      />

      <DarkroomSlider
        label={t("tuning.lblTemp")}
        subLabel="Kelvin"
        bind:value={darkroomState.colorTemp}
        defaultValue={activePhoto?.asShotTemp ?? 5500}
        min={2800}
        max={8500}
        step={50}
        customTrackGradient="linear-gradient(to right, #4578b8 0%, #83a5cf 35%, #d4a373 65%, #ea8d3b 100%)"
        formatValue={(v) => `${v}K`}
        parseInput={parseCleanNumber}
      />

      <DarkroomSlider
        label={t("tuning.lblTint")}
        subLabel="Tint"
        bind:value={darkroomState.tint}
        defaultValue={activePhoto?.asShotTint ?? 0}
        min={-100}
        max={100}
        step={1}
        isBipolar={true}
        customTrackGradient="linear-gradient(to right, #2ba471 0%, #1a1e24 50%, #c44e91 100%)"
        formatValue={(v) =>
          v > 0
            ? `+${Math.round(v)}`
            : v < 0
              ? `${Math.round(v)}`
              : "0"}
        parseInput={parseCleanNumber}
      />
    </div>

    <!-- 子分組 B：曝光與明暗階調 -->
    <div class="sub-group-card">
      <div class="sub-group-title">
        <span>{t("tuning.subExposureTitle")}</span>
        <span class="sub-group-en font-mono">EXPOSURE & TONE</span>
      </div>

      <DarkroomSlider
        label={t("tuning.lblExposure")}
        subLabel="EV"
        bind:value={darkroomState.exposure}
        defaultValue={0}
        min={-2.0}
        max={2.0}
        step={0.05}
        isBipolar={true}
        formatValue={(v) => (v > 0 ? `+${v.toFixed(2)} EV` : `${v.toFixed(2)} EV`)}
        parseInput={parseCleanNumber}
      />

      <DarkroomSlider
        label={t("tuning.lblContrast")}
        subLabel="Contrast"
        bind:value={darkroomState.contrast}
        defaultValue={0}
        min={-0.8}
        max={0.8}
        step={0.02}
        isBipolar={true}
        formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
        parseInput={parsePercentage}
      />

      <DarkroomSlider
        label="Highlights"
        subLabel="Highlights"
        bind:value={darkroomState.highlights}
        defaultValue={0}
        min={-1.0}
        max={1.0}
        step={0.02}
        isBipolar={true}
        formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
        parseInput={parsePercentage}
      />

      <DarkroomSlider
        label={t("tuning.lblShadows")}
        subLabel="Shadows"
        bind:value={darkroomState.shadows}
        defaultValue={0}
        min={-0.5}
        max={0.5}
        step={0.02}
        isBipolar={true}
        formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
        parseInput={parsePercentage}
      />

      <DarkroomSlider
        label="Blacks"
        subLabel="Blacks"
        bind:value={darkroomState.blacks}
        defaultValue={0}
        min={-0.5}
        max={0.5}
        step={0.02}
        isBipolar={true}
        formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
        parseInput={parsePercentage}
      />
    </div>

    <!-- 子分組 C：色彩活潑度與細節 -->
    <div class="sub-group-card last">
      <div class="sub-group-title">
        <span>PRESENCE & DETAIL</span>
        <span class="sub-group-en font-mono">DETAIL</span>
      </div>

      <DarkroomSlider
        label="Vibrance"
        subLabel="Vibrance"
        bind:value={darkroomState.vibrance}
        defaultValue={0}
        min={-1.0}
        max={1.0}
        step={0.02}
        isBipolar={true}
        disabled={darkroomState.monochrome}
        formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
        parseInput={parsePercentage}
      />

      <DarkroomSlider
        label={t("tuning.lblClarity")}
        subLabel="Clarity"
        bind:value={darkroomState.clarity}
        defaultValue={0}
        min={-1.0}
        max={1.0}
        step={0.05}
        isBipolar={true}
        formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
        parseInput={parsePercentage}
      />

      <DarkroomSlider
        label={t("tuning.lblSharpness")}
        subLabel="Sharpness"
        bind:value={darkroomState.sharpness}
        defaultValue={0}
        min={-1.0}
        max={1.0}
        step={0.05}
        isBipolar={true}
        formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
        parseInput={parsePercentage}
      />
    </div>
  {/if}
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     步驟 2：6 色獨立微調 (HSL) / 黑白光學濾鏡混色
     ══════════════════════════════════════════════════════════════════════ -->
<section class="tuning-section hairline-b">
  <div class="section-header-bar" style="margin-bottom: {hslExpanded ? '10px' : '0'};">
    <button
      type="button"
      class="section-collapse-btn"
      onclick={() => {
        hslExpanded = !hslExpanded;
        saveTuningPanelUi();
      }}
      aria-expanded={hslExpanded}
      title={darkroomState.monochrome
        ? t("tuning.sec2ToggleTitleMono")
        : t("tuning.sec2ToggleTitleColor")}
    >
      <span class="step-num-badge font-mono">2</span>
      <span class="section-main-title">
        {darkroomState.monochrome ? t("tuning.sec2TitleMono") : t("tuning.sec2TitleColor")}
      </span>
      {#if darkroomState.monochrome ? hasAnyBwLumAdjustment : hasAnyHslAdjustment}
        <span class="section-dirty-dot" title={t("tuning.sec2DirtyDot")}></span>
      {/if}
      <span class="material-symbols-outlined section-chevron">
        {hslExpanded ? "expand_more" : "chevron_right"}
      </span>
    </button>

    {#if darkroomState.monochrome ? hasAnyBwLumAdjustment : hasAnyHslAdjustment}
      <button
        type="button"
        class="section-reset-btn font-mono"
        onclick={() => {
          if (darkroomState.monochrome) {
            darkroomState.applyBwFilterPreset("neutral");
          } else {
            darkroomState.hsl = createDefaultHslAdjustments();
            darkroomState.recordSnapshot(true);
          }
        }}
        title={darkroomState.monochrome ? t("tuning.resetHslTitleMono") : t("tuning.resetHslTitleColor")}
      >
        <span class="material-symbols-outlined" style="font-size: 12px;">restart_alt</span>
        <span>{t("tuning.resetAllZero")}</span>
      </button>
    {/if}
  </div>

  {#if hslExpanded}
    {#if darkroomState.monochrome}
      <p class="section-helper-desc">
        {t("tuning.bwFilterHint")}
      </p>
      <div class="bw-filter-presets">
        {#each BW_FILTER_PRESETS as preset}
          <button
            type="button"
            class="bw-filter-chip"
            onclick={() => darkroomState.applyBwFilterPreset(preset.key)}
            title={t(preset.titleKey)}
          >
            {t(preset.labelKey)}
          </button>
        {/each}
      </div>

      <div class="sub-group-card last">
        {#each HSL_BAND_META as band}
          <DarkroomSlider
            label={t("tuning.bwBandLabel", { label: t(band.labelKey) })}
            subLabel={band.key.toUpperCase()}
            bind:value={darkroomState.hsl[band.key].lum}
            defaultValue={0}
            min={-1.0}
            max={1.0}
            step={0.02}
            isBipolar={true}
            formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
            parseInput={parsePercentage}
          />
        {/each}
      </div>
    {:else}
      <div class="hsl-band-tabs">
        {#each HSL_BAND_META as band}
          <button
            type="button"
            class="hsl-band-tab"
            class:active={selectedHslBand === band.key}
            onclick={() => {
              selectedHslBand = band.key;
              saveTuningPanelUi();
            }}
            title={t("tuning.hslBandBtnTitle", { label: t(band.labelKey) })}
          >
            <span class="hsl-dot" style="background: {band.color};"></span>
            <span>{t(band.labelKey)}</span>
            {#if isHslBandDirty(band.key)}
              <span class="hsl-band-dirty-dot"></span>
            {/if}
          </button>
        {/each}
      </div>

      <div class="sub-group-card last">
        <div class="hsl-band-subbar">
          <span class="hsl-current-label">
            {t("tuning.hslAdjustingPrefix")}<strong style="color: {selectedHslMeta.color};">{t("tuning.hslBandTitle", { label: t(selectedHslMeta.labelKey), code: selectedHslMeta.key.toUpperCase() })}</strong>
            {#if selectedHslBand === "orange" || selectedHslBand === "red"}
              <span class="hsl-skin-tip">{t("tuning.hslTipSkin")}</span>
            {:else if selectedHslBand === "green" || selectedHslBand === "yellow"}
              <span class="hsl-skin-tip">{t("tuning.hslTipPlant")}</span>
            {:else if selectedHslBand === "blue" || selectedHslBand === "cyan"}
              <span class="hsl-skin-tip">{t("tuning.hslTipSky")}</span>
            {/if}
          </span>
          {#if isHslBandDirty(selectedHslBand)}
            <button
              type="button"
              class="hsl-band-reset font-mono"
              onclick={() => {
                darkroomState.hsl[selectedHslBand] = { hue: 0, sat: 0, lum: 0 };
                darkroomState.recordSnapshot(true);
              }}
            >
              {t("tuning.hslResetBand", { label: t(selectedHslMeta.labelKey) })}
            </button>
          {/if}
        </div>

        <DarkroomSlider
          label={t("tuning.hslHue", { label: t(selectedHslMeta.labelKey) })}
          subLabel="Hue"
          bind:value={darkroomState.hsl[selectedHslBand].hue}
          defaultValue={0}
          min={-1.0}
          max={1.0}
          step={0.02}
          isBipolar={true}
          customTrackGradient={selectedHslMeta.hueGradient}
          formatValue={(v) => {
            const deg = Math.round(v * 30);
            return deg > 0 ? `+${deg}°` : `${deg}°`;
          }}
          parseInput={(text) => {
            const num = parseCleanNumber(text);
            if (num === null) return null;
            return Math.abs(num) > 1.0 ? Math.max(-1, Math.min(1, num / 30)) : num;
          }}
        />
        <DarkroomSlider
          label={t("tuning.hslSat", { label: t(selectedHslMeta.labelKey) })}
          subLabel="Saturation"
          bind:value={darkroomState.hsl[selectedHslBand].sat}
          defaultValue={0}
          min={-1.0}
          max={1.0}
          step={0.02}
          isBipolar={true}
          formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
          parseInput={parsePercentage}
        />
        <DarkroomSlider
          label={t("tuning.hslLum", { label: t(selectedHslMeta.labelKey) })}
          subLabel="Luminance"
          bind:value={darkroomState.hsl[selectedHslBand].lum}
          defaultValue={0}
          min={-1.0}
          max={1.0}
          step={0.02}
          isBipolar={true}
          formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
          parseInput={parsePercentage}
        />
      </div>
    {/if}
  {/if}
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     步驟 3：底片質感與冷暖分區調色 (Film Physics & Split Toning)
     ══════════════════════════════════════════════════════════════════════ -->
<section class="tuning-section hairline-b">
  <div class="section-header-bar" style="margin-bottom: {toningExpanded ? '10px' : '0'};">
    <button
      type="button"
      class="section-collapse-btn"
      onclick={() => {
        toningExpanded = !toningExpanded;
        saveTuningPanelUi();
      }}
      aria-expanded={toningExpanded}
      title={t("tuning.sec3ToggleTitle")}
    >
      <span class="step-num-badge font-mono">3</span>
      <span class="section-main-title">{t("tuning.sec3Title")}</span>
      {#if hasAnyToningAdjustment}
        <span class="section-dirty-dot" title={t("tuning.sec3DirtyDot")}></span>
      {/if}
      <span class="material-symbols-outlined section-chevron">
        {toningExpanded ? "expand_more" : "chevron_right"}
      </span>
    </button>

    {#if hasAnyToningAdjustment}
      <button
        type="button"
        class="section-reset-btn font-mono"
        onclick={() => {
          darkroomState.colorDensity = 0.0;
          darkroomState.shadowHue = 200;
          darkroomState.shadowTintAmount = 0.0;
          darkroomState.highlightHue = 40;
          darkroomState.highlightTintAmount = 0.0;
          darkroomState.halation = 0.0;
          darkroomState.grainAmount = 0.15;
          darkroomState.vignette = 0.0;
          darkroomState.recordSnapshot(true);
        }}
        title={t("tuning.resetSec3Title")}
      >
        <span class="material-symbols-outlined" style="font-size: 12px;">restart_alt</span>
        <span>{t("tuning.resetSec3")}</span>
      </button>
    {/if}
  </div>

  {#if toningExpanded}
    <!-- 子分組 A：光學底片質感 -->
    <div class="sub-group-card">
      <div class="sub-group-title">
        <span>{t("tuning.subFilmTitle")}</span>
        <span class="sub-group-en font-mono">FILM TEXTURE</span>
      </div>

      <DarkroomSlider
        label={darkroomState.monochrome ? t("tuning.lblColorDensityMono") : t("tuning.lblColorDensity")}
        subLabel="Color Density"
        bind:value={darkroomState.colorDensity}
        defaultValue={0}
        min={-1.0}
        max={1.0}
        step={0.02}
        isBipolar={true}
        disabled={darkroomState.monochrome}
        formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
        parseInput={parsePercentage}
      />

      <DarkroomSlider
        label={t("tuning.lblHalation")}
        subLabel="Halation"
        bind:value={darkroomState.halation}
        defaultValue={0}
        min={0}
        max={1.0}
        step={0.02}
        amberValue={true}
        formatValue={(v) => `${Math.round(v * 100)}%`}
        parseInput={parsePercentage}
      />

      <DarkroomSlider
        label={t("tuning.lblGrain")}
        subLabel="Silver Grain"
        bind:value={darkroomState.grainAmount}
        defaultValue={0.15}
        min={0}
        max={1.0}
        step={0.02}
        formatValue={(v) => `${Math.round(v * 100)}%`}
        parseInput={parsePercentage}
      />

      <DarkroomSlider
        label={t("tuning.lblVignette")}
        subLabel="Vignette"
        bind:value={darkroomState.vignette}
        defaultValue={0}
        min={-1.0}
        max={1.0}
        step={0.02}
        isBipolar={true}
        formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
        parseInput={parsePercentage}
      />
    </div>

    <!-- 子分組 B：暗部與亮部分區染色 (Split Toning) -->
    <div class="sub-group-card last">
      <div class="sub-group-title">
        <span>{darkroomState.monochrome ? t("tuning.subSplitTitleMono") : t("tuning.subSplitTitleColor")}</span>
        <span class="sub-group-en font-mono">SPLIT TONING</span>
      </div>

      <!-- 暗部染色卡 -->
      <div class="split-tone-box">
        <div class="split-tone-head">
          <span
            class="tone-color-swatch"
            style:background={`hsl(${darkroomState.shadowHue}, 70%, 55%)`}
            style:opacity={Math.max(0.35, darkroomState.shadowTintAmount)}
          ></span>
          <span class="split-tone-label">{t("tuning.splitShadowLabel", { name: describeHueName(darkroomState.shadowHue) })}</span>
          <span class="split-tone-status font-mono">
            {darkroomState.shadowTintAmount > 0.005
              ? t("tuning.splitAmountPct", { pct: Math.round(darkroomState.shadowTintAmount * 100) })
              : t("tuning.splitAmountOff")}
          </span>
        </div>

        <DarkroomSlider
          label={t("tuning.lblShadowStrength")}
          subLabel="Amount"
          bind:value={darkroomState.shadowTintAmount}
          defaultValue={0}
          min={0}
          max={1.0}
          step={0.02}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          parseInput={parsePercentage}
        />

        <DarkroomSlider
          label={t("tuning.lblShadowHue")}
          subLabel="Hue"
          bind:value={darkroomState.shadowHue}
          defaultValue={200}
          min={0}
          max={360}
          step={1}
          customTrackGradient="linear-gradient(to right, #d9534f 0%, #d9a74f 17%, #5cb85c 33%, #4fb8c9 50%, #4f6fd9 67%, #b84fd9 83%, #d9534f 100%)"
          formatValue={(v) => `${Math.round(v)}° (${describeHueName(v)})`}
          parseInput={parseCleanNumber}
        />
      </div>

      <!-- 亮部染色卡 -->
      <div class="split-tone-box">
        <div class="split-tone-head">
          <span
            class="tone-color-swatch"
            style:background={`hsl(${darkroomState.highlightHue}, 75%, 60%)`}
            style:opacity={Math.max(0.35, darkroomState.highlightTintAmount)}
          ></span>
          <span class="split-tone-label">{t("tuning.splitHighlightLabel", { name: describeHueName(darkroomState.highlightHue) })}</span>
          <span class="split-tone-status font-mono">
            {darkroomState.highlightTintAmount > 0.005
              ? t("tuning.splitAmountPct", { pct: Math.round(darkroomState.highlightTintAmount * 100) })
              : t("tuning.splitAmountOff")}
          </span>
        </div>

        <DarkroomSlider
          label={t("tuning.lblHighlightStrength")}
          subLabel="Amount"
          bind:value={darkroomState.highlightTintAmount}
          defaultValue={0}
          min={0}
          max={1.0}
          step={0.02}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          parseInput={parsePercentage}
        />

        <DarkroomSlider
          label={t("tuning.lblHighlightHue")}
          subLabel="Hue"
          bind:value={darkroomState.highlightHue}
          defaultValue={40}
          min={0}
          max={360}
          step={1}
          customTrackGradient="linear-gradient(to right, #d9534f 0%, #d9a74f 17%, #5cb85c 33%, #4fb8c9 50%, #4f6fd9 67%, #b84fd9 83%, #d9534f 100%)"
          formatValue={(v) => `${Math.round(v)}° (${describeHueName(v)})`}
          parseInput={parseCleanNumber}
        />
      </div>
    </div>
  {/if}
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     步驟 4：構圖裁切與水平校正 (Crop & Geometry)
     ══════════════════════════════════════════════════════════════════════ -->
<section class="tuning-section hairline-b">
  <div class="section-header-bar" style="margin-bottom: {cropExpanded ? '10px' : '0'};">
    <button
      type="button"
      class="section-collapse-btn"
      onclick={() => {
        cropExpanded = !cropExpanded;
        saveTuningPanelUi();
      }}
      aria-expanded={cropExpanded}
      title={t("tuning.sec4ToggleTitle")}
    >
      <span class="step-num-badge font-mono">4</span>
      <span class="section-main-title">{t("tuning.sec4Title")}</span>
      {#if hasAnyCropAdjustment}
        <span class="section-dirty-dot" title={t("tuning.sec4DirtyDot")}></span>
      {/if}
      <span class="material-symbols-outlined section-chevron">
        {cropExpanded ? "expand_more" : "chevron_right"}
      </span>
    </button>

    <div class="section-quick-actions font-mono">
      {#if onQuickAiCrop}
        <button
          type="button"
          class="quick-ai-btn"
          onclick={onQuickAiCrop}
          disabled={isAiAnalyzing || !activePhoto}
          title={t("tuning.aiCropTitle")}
        >
          <span class="material-symbols-outlined ai-icon">auto_fix_high</span>
          <span>{t("tuning.aiCrop")}</span>
        </button>
      {/if}

      {#if onQuickAiHorizon}
        <button
          type="button"
          class="quick-ai-btn"
          onclick={onQuickAiHorizon}
          disabled={isAiAnalyzing || !activePhoto}
          title={t("tuning.aiLevelTitle")}
        >
          <span class="material-symbols-outlined ai-icon">straighten</span>
          <span>{t("tuning.aiLevel")}</span>
        </button>
      {/if}
    </div>
  </div>

  {#if cropExpanded}
    <div class="sub-group-card last">
      <div class="sub-group-title">
        <span>{t("tuning.aspectRatioLabel")}</span>
        <div class="crop-title-actions">
          {#if hasAnyCropAdjustment}
            <button
              type="button"
              class="section-reset-btn font-mono"
              onclick={() => {
                darkroomState.resetCropState();
                darkroomState.isCropMode = false;
                darkroomState.recordSnapshot(true);
              }}
              title={t("tuning.resetCropTitle")}
            >
              <span class="material-symbols-outlined" style="font-size: 12px;">restart_alt</span>
              <span>{t("tuning.resetCrop")}</span>
            </button>
          {/if}
          <button
            type="button"
            class="crop-frame-toggle font-mono"
            class:active={darkroomState.isCropMode}
            onclick={() => (darkroomState.isCropMode = !darkroomState.isCropMode)}
          >
            <span class="material-symbols-outlined" style="font-size: 12px;">crop</span>
            <span>{darkroomState.isCropMode ? t("tuning.cropBoxDone") : t("tuning.cropBoxShow")}</span>
          </button>
        </div>
      </div>

      <!-- Aspect Ratio Presets -->
      <div class="aspect-ratio-row">
        {#each CROP_RATIO_OPTIONS as item}
          <button
            type="button"
            class="ratio-chip"
            class:active={darkroomState.cropAspectRatio === item.key}
            onclick={() => darkroomState.applyAspectRatioPreset(item.key)}
            title={t("tuning.cropPresetTitle", { label: t(item.labelKey) })}
          >
            {t(item.labelKey)}
          </button>
        {/each}
      </div>

      <!-- Rotation Slider -->
      <DarkroomSlider
        label={t("tuning.lblRotation")}
        subLabel="Rotation"
        bind:value={darkroomState.cropRotation}
        defaultValue={0}
        min={-45}
        max={45}
        step={0.1}
        isBipolar={true}
        formatValue={(v) => (v > 0 ? `+${v.toFixed(1)}°` : `${v.toFixed(1)}°`)}
        parseInput={parseCleanNumber}
      />

      <!-- Vertical Keystone Slider -->
      <DarkroomSlider
        label={t("tuning.lblKeystoneV")}
        subLabel="Keystone"
        bind:value={darkroomState.keystoneV}
        defaultValue={0}
        min={-30}
        max={30}
        step={0.5}
        isBipolar={true}
        formatValue={(v) => (v > 0 ? `+${v.toFixed(1)}°` : `${v.toFixed(1)}°`)}
        parseInput={parseCleanNumber}
      />

      <!-- Flip Controls -->
      <div class="geom-actions-row">
        <button
          type="button"
          class="geom-btn"
          class:active={darkroomState.flipH}
          onclick={() => (darkroomState.flipH = !darkroomState.flipH)}
          title={t("tuning.flipHTitle")}
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">flip</span>
          <span>{t("tuning.flipH")}</span>
        </button>
        <button
          type="button"
          class="geom-btn"
          class:active={darkroomState.flipV}
          onclick={() => (darkroomState.flipV = !darkroomState.flipV)}
          title={t("tuning.flipVTitle")}
        >
          <span
            class="material-symbols-outlined"
            style="font-size: 13px; transform: rotate(90deg);">flip</span
          >
          <span>{t("tuning.flipV")}</span>
        </button>
      </div>
    </div>
  {/if}
</section>

<!-- ══════════════════════════════════════════════════════════════════════
     底部完稿匯出引導列 (Export Workflow Footer)
     ══════════════════════════════════════════════════════════════════════ -->
<footer class="tuning-export-footer">
  <div class="export-footer-hint">
    <span class="material-symbols-outlined" style="font-size: 14px; color: var(--amber-highlight);">
      task_alt
    </span>
    <span>{t("tuning.footerHint")}</span>
  </div>
  <div class="export-footer-actions">
    {#if onOpenQuickExport}
      <button
        type="button"
        class="footer-export-btn quick"
        onclick={onOpenQuickExport}
        disabled={!activePhoto}
        title={t("tuning.quickExportTitle")}
      >
        <span class="material-symbols-outlined" style="font-size: 15px;">download</span>
        <span>{t("tuning.quickExportBtn")}</span>
      </button>
    {/if}
    {#if onGoToExport}
      <button
        type="button"
        class="footer-export-btn primary"
        onclick={onGoToExport}
        title={t("tuning.goExportTitle")}
      >
        <span>{t("tuning.goExportBtn")}</span>
        <span class="material-symbols-outlined" style="font-size: 15px;">arrow_forward</span>
      </button>
    {/if}
  </div>
</footer>

<style>
  /* ── 頂部常駐控制區 (Sticky Header) ── */
  .tuning-sticky-top {
    position: sticky;
    top: 0;
    z-index: 15;
    background: var(--surface-panel);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  }

  .output-mode-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 14px 10px;
    background: rgba(12, 13, 16, 0.55);
  }

  .output-mode-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .style-status-info {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }

  .style-status-label {
    font-size: 11px;
    color: var(--parchment-dim);
    white-space: nowrap;
  }

  .style-status-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--amber-highlight);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .output-mode-switch {
    display: inline-flex;
    background: var(--surface-panel);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    padding: 2px;
    gap: 2px;
    flex-shrink: 0;
  }

  .output-mode-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border: 1px solid transparent;
    border-radius: calc(var(--radius-sm) - 1px);
    background: transparent;
    color: var(--parchment-dim);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .output-mode-btn:hover {
    color: var(--parchment-bright);
  }

  .output-mode-btn.active {
    background: var(--surface-overlay);
    border-color: var(--amber-highlight);
    color: var(--parchment-bright);
    font-weight: 600;
  }

  .mode-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .mode-dot.color {
    background: conic-gradient(#e05555, #d9bd45, #52b365, #4e79d9, #e05555);
  }
  .mode-dot.mono {
    background: linear-gradient(135deg, #f3f4f6 0%, #9ca3af 50%, #1f2937 100%);
    border: 1px solid rgba(255, 255, 255, 0.35);
  }

  /* 全域歷史與重設工具列 */
  .global-history-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px;
    padding-top: 7px;
    border-top: 1px dashed var(--border-hairline);
  }

  .history-left-group,
  .history-right-group {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .toolbar-divider {
    width: 1px;
    height: 12px;
    background: var(--border-hairline);
    margin: 0 2px;
  }

  .toolbar-btn {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border-hairline);
    color: var(--parchment-muted);
    font-size: 10.5px;
    padding: 3px 7px;
    border-radius: var(--radius-xs);
    display: inline-flex;
    align-items: center;
    gap: 3px;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .toolbar-btn:hover:not(:disabled) {
    border-color: var(--amber-highlight);
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
  }

  .toolbar-btn.highlight {
    border-color: rgba(229, 142, 38, 0.5);
    color: var(--amber-highlight);
    background-color: rgba(229, 142, 38, 0.1);
  }

  .toolbar-btn.danger-hover:hover:not(:disabled) {
    border-color: #ff6b6b;
    color: #ff6b6b;
  }

  .toolbar-btn:disabled,
  .toolbar-btn.is-disabled {
    opacity: 0.32;
    cursor: not-allowed;
    pointer-events: none;
  }

  /* ── 4 階段摺疊區塊 (Section Layout) ── */
  .tuning-section {
    padding: 12px 14px;
    box-sizing: border-box;
  }

  .section-header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
  }

  .section-collapse-btn {
    background: transparent;
    border: none;
    padding: 2px 0;
    color: var(--parchment-bright);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    text-align: left;
    min-width: 0;
  }

  .section-collapse-btn:hover .section-main-title {
    color: var(--amber-highlight);
  }

  .step-num-badge {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: rgba(212, 163, 115, 0.16);
    border: 1px solid rgba(212, 163, 115, 0.35);
    color: var(--amber-highlight);
    font-size: 10.5px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .section-main-title {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--parchment-bright);
    transition: color 0.15s ease;
    white-space: nowrap;
  }

  .section-dirty-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--amber-highlight);
    box-shadow: 0 0 5px var(--amber-highlight);
    flex-shrink: 0;
  }

  .section-chevron {
    font-size: 16px;
    color: var(--parchment-dim);
  }

  .section-quick-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .section-reset-btn {
    background: transparent;
    border: 1px solid var(--border-hairline);
    color: var(--parchment-muted);
    font-size: 10.5px;
    padding: 2px 7px;
    border-radius: var(--radius-xs);
    display: inline-flex;
    align-items: center;
    gap: 3px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .section-reset-btn:hover {
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    background: var(--surface-overlay);
  }

  /* ── 內部子群組卡片 (Sub-group Cards) ── */
  .sub-group-card {
    background: rgba(0, 0, 0, 0.22);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-sm);
    padding: 10px 11px 4px;
    margin-bottom: 8px;
  }

  .sub-group-card.last {
    margin-bottom: 0;
  }

  .sub-group-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    color: var(--parchment-muted);
    margin-bottom: 9px;
    padding-bottom: 5px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .sub-group-en {
    font-size: 9px;
    letter-spacing: 0.06em;
    color: var(--parchment-dim);
    font-weight: 400;
  }

  /* ── 分區染色小盒 (Split Toning Box) ── */
  .split-tone-box {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: var(--radius-xs);
    padding: 8px 9px 2px;
    margin-bottom: 8px;
  }

  .split-tone-box:last-child {
    margin-bottom: 4px;
  }

  .split-tone-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }

  .tone-color-swatch {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.35);
    flex-shrink: 0;
  }

  .split-tone-label {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--parchment-bright);
  }

  .split-tone-status {
    margin-left: auto;
    font-size: 10px;
    color: var(--amber-highlight);
  }

  /* ── 黑白濾鏡與 HSL 控制 ── */
  .section-helper-desc {
    font-size: 11px;
    line-height: 1.45;
    color: var(--parchment-muted);
    margin: 0 0 8px;
  }

  .bw-filter-presets {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
    margin-bottom: 10px;
  }

  .bw-filter-chip {
    padding: 5px 6px;
    background: var(--surface-elevated);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-xs);
    color: var(--parchment-muted);
    font-size: 11px;
    cursor: pointer;
    text-align: center;
    transition: all 0.15s ease;
  }

  .bw-filter-chip:hover {
    color: var(--parchment-bright);
    border-color: var(--amber-highlight);
    background: var(--surface-overlay);
  }

  .hsl-band-tabs {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    margin-bottom: 8px;
  }

  .hsl-band-tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 4px;
    background: var(--surface-elevated);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-xs);
    color: var(--parchment-muted);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .hsl-band-tab:hover {
    color: var(--parchment-bright);
    border-color: var(--hairline-slate);
  }

  .hsl-band-tab.active {
    background: rgba(212, 163, 115, 0.15);
    border-color: var(--amber-highlight);
    color: var(--parchment-bright);
    font-weight: 600;
  }

  .hsl-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .hsl-band-dirty-dot {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--amber-highlight);
  }

  .hsl-band-subbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .hsl-current-label {
    font-size: 11.5px;
    color: var(--parchment-muted);
  }

  .hsl-skin-tip {
    font-size: 10.5px;
    color: var(--parchment-dim);
  }

  .hsl-band-reset {
    background: transparent;
    border: 1px solid rgba(212, 163, 115, 0.35);
    border-radius: var(--radius-xs);
    color: var(--amber-highlight);
    font-size: 10px;
    cursor: pointer;
    padding: 2px 6px;
  }

  .hsl-band-reset:hover {
    background: rgba(212, 163, 115, 0.15);
  }

  /* ── 構圖與幾何控制 ── */
  .crop-frame-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--border-hairline);
    background: var(--surface-panel);
    color: var(--parchment-muted);
    font-size: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .crop-frame-toggle:hover,
  .crop-frame-toggle.active {
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    background: rgba(212, 163, 115, 0.12);
  }

  .aspect-ratio-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
    margin-bottom: 12px;
  }

  .ratio-chip {
    padding: 5px 6px;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: 3px;
    color: var(--parchment-muted);
    font-size: 11px;
    cursor: pointer;
    text-align: center;
    transition: all 0.15s ease;
  }

  .ratio-chip:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
  }

  .ratio-chip.active {
    background-color: rgba(212, 163, 115, 0.15);
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
    font-weight: 600;
  }

  .geom-actions-row {
    display: flex;
    gap: 5px;
    margin: 8px 0 6px;
  }

  .geom-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: 3px;
    color: var(--parchment-muted);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .geom-btn:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
  }

  .crop-title-actions {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .geom-btn.active {
    background-color: rgba(212, 163, 115, 0.15);
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
  }

  /* ── AI 單項快捷按鈕 ── */
  .quick-ai-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background-color: rgba(212, 163, 115, 0.08);
    border: 1px solid rgba(212, 163, 115, 0.35);
    border-radius: var(--radius-xs);
    padding: 3px 7px;
    color: var(--parchment-bright);
    font-size: 10.5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .quick-ai-btn .ai-icon {
    font-size: 12px;
    color: var(--amber-highlight);
  }

  .quick-ai-btn:hover:not(:disabled) {
    color: var(--amber-highlight);
    background-color: rgba(212, 163, 115, 0.18);
    border-color: var(--amber-highlight);
  }

  .quick-ai-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ── 底部完稿匯出引導列 ── */
  .tuning-export-footer {
    padding: 12px 14px 18px;
    background: linear-gradient(180deg, rgba(12, 13, 16, 0.2) 0%, rgba(212, 163, 115, 0.07) 100%);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .export-footer-hint {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--parchment-muted);
  }

  .export-footer-actions {
    display: flex;
    gap: 6px;
  }

  .footer-export-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 7px 10px;
    border-radius: var(--radius-sm);
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .footer-export-btn.quick {
    background: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-bright);
  }

  .footer-export-btn.quick:hover:not(:disabled) {
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
  }

  .footer-export-btn.primary {
    background: rgba(212, 163, 115, 0.16);
    border: 1px solid rgba(212, 163, 115, 0.55);
    color: var(--amber-highlight);
  }

  .footer-export-btn.primary:hover {
    background: rgba(212, 163, 115, 0.26);
    border-color: var(--amber-highlight);
    color: var(--parchment-bright);
  }

  .footer-export-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
