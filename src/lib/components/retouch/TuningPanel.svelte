<script lang="ts">
  import { darkroomState, type CropRatioPreset, type BwFilterPresetKey } from "$lib/stores/darkroomState.svelte";
  import { photoLibrary, type PhotoPlateItem } from "$lib/stores/photoLibrary.svelte";
  import { aiPipeline } from "$lib/stores/aiPipeline.svelte";
  import { HSL_BAND_KEYS, createDefaultHslAdjustments, type HslBandKey } from "$lib/types/photo";
  import DarkroomSlider from "./DarkroomSlider.svelte";
  import DarkroomHistogram from "./DarkroomHistogram.svelte";
  import { toastStore } from "$lib/stores/toastStore.svelte";
  import {
    TUNING_PANEL_UI_STORAGE_KEY,
    DEFAULT_TUNING_PANEL_UI_STATE,
    readLocalJson,
    writeLocalJson,
  } from "$lib/utils/panelStorage";

  const HSL_BAND_META: {
    key: HslBandKey;
    label: string;
    color: string;
    hueGradient: string;
  }[] = [
    { key: "red", label: "紅", color: "#e05555", hueGradient: "linear-gradient(to right, #c74ca8 0%, #e05555 50%, #e68a3e 100%)" },
    { key: "orange", label: "橙", color: "#e68a3e", hueGradient: "linear-gradient(to right, #e05555 0%, #e68a3e 50%, #d9bd45 100%)" },
    { key: "yellow", label: "黃", color: "#d9bd45", hueGradient: "linear-gradient(to right, #e68a3e 0%, #d9bd45 50%, #52b365 100%)" },
    { key: "green", label: "綠", color: "#52b365", hueGradient: "linear-gradient(to right, #d9bd45 0%, #52b365 50%, #46b8c4 100%)" },
    { key: "cyan", label: "青", color: "#46b8c4", hueGradient: "linear-gradient(to right, #52b365 0%, #46b8c4 50%, #4e79d9 100%)" },
    { key: "blue", label: "藍", color: "#4e79d9", hueGradient: "linear-gradient(to right, #46b8c4 0%, #4e79d9 50%, #b558d6 100%)" },
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

  const BW_FILTER_PRESETS: { key: BwFilterPresetKey; label: string; title: string }[] = [
    { key: "neutral", label: "標準中性", title: "全色性中性灰階（歸零各色濾鏡權重）" },
    { key: "yellow", label: "黃色濾鏡", title: "微壓藍天與反差增強（街拍常用）" },
    { key: "orange", label: "橙色濾鏡", title: "明顯壓暗藍天、提亮暖色磚牆與膚色" },
    { key: "red", label: "紅色濾鏡", title: "極致深黑戲劇天空與強烈白雲反差" },
    { key: "green", label: "綠色濾鏡", title: "提亮森林樹葉層次、壓實紅色花果" },
    { key: "portrait", label: "柔膚人像", title: "柔和提亮橙紅膚質與細膩中間調" },
  ];

  const CROP_RATIO_OPTIONS: { key: CropRatioPreset; label: string; sub: string }[] = [
    { key: "original", label: "原始比例", sub: "ORIG" },
    { key: "1:1", label: "1:1 正方", sub: "1:1" },
    { key: "4:5", label: "4:5 社群", sub: "4:5" },
    { key: "16:9", label: "16:9 寬景", sub: "16:9" },
    { key: "9:16", label: "9:16 直幅", sub: "9:16" },
    { key: "free", label: "自由裁切", sub: "FREE" },
  ];

  // 將 0~360 度色相轉換為易讀的中文色彩名稱
  function describeHueName(deg: number): string {
    const d = ((Math.round(deg) % 360) + 360) % 360;
    if (d < 18 || d >= 345) return "緋紅";
    if (d < 48) return "暖金琥珀";
    if (d < 72) return "暖黃";
    if (d < 155) return "翠綠";
    if (d < 205) return "冷青";
    if (d < 255) return "靛藍";
    if (d < 300) return "堇紫";
    return "洋紅";
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
    return "Standard · 原色自然直出";
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
          toastStore.show("已復原上一步調色 (Undo)", "info", 1200);
        }
      }
      // Redo: Ctrl+Y 或 Ctrl+Shift+Z
      else if (key === "y" || (key === "z" && e.shiftKey)) {
        if (darkroomState.canRedo) {
          e.preventDefault();
          darkroomState.redo();
          toastStore.show("已重做下一步調色 (Redo)", "info", 1200);
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
      <div class="style-status-info" title={`目前套用風格檔：${activeStyleTitle}`}>
        <span class="style-status-label">目前風格</span>
        <span class="style-status-name font-headline">{activeStyleTitle}</span>
      </div>

      <div class="output-mode-switch font-mono" role="group" aria-label="顯影輸出色彩模式">
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
          title="標準彩色 3D LUT 顯影管線"
        >
          <span class="mode-dot color"></span>
          <span>彩色</span>
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
          title="黑白暗房管線（繼承當前 LUT 階調曲線 + 6 色光譜濾鏡混色 + 銀鹽光暈）"
        >
          <span class="mode-dot mono"></span>
          <span>黑白</span>
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
              toastStore.show("已復原上一步調色", "info", 1200);
            }
          }}
          title="復原上一步調色 (Ctrl+Z)"
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">undo</span>
          <span>復原</span>
        </button>

        <button
          type="button"
          class="toolbar-btn"
          class:is-disabled={!darkroomState.canRedo}
          disabled={!darkroomState.canRedo}
          onclick={() => {
            if (darkroomState.redo()) {
              toastStore.show("已重做下一步調色", "info", 1200);
            }
          }}
          title="重做下一步調色 (Ctrl+Y)"
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">redo</span>
          <span>重做</span>
        </button>

        <span class="toolbar-divider"></span>

        <button
          type="button"
          class="toolbar-btn"
          onclick={() => {
            if (!activePhoto) return;
            darkroomState.copyCurrentTuning(activePhoto.appliedProfile);
            toastStore.show("已複製目前調色參數 ✓", "success", 2000);
          }}
          title="複製目前相片的所有調色參數，可貼上至其他相片"
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">content_copy</span>
          <span>複製</span>
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
              toastStore.show("已套用複製的調色參數 ✓", "success", 2000);
            }}
            title="將已複製的調色參數套用至目前相片"
          >
            <span class="material-symbols-outlined" style="font-size: 13px;">content_paste</span>
            <span>貼上</span>
          </button>
        {/if}
      </div>

      <div class="history-right-group">
        {#if hasAiBaseline && onRestoreAiTuning}
          <button
            type="button"
            class="toolbar-btn"
            class:highlight={isModifiedFromAi}
            onclick={onRestoreAiTuning}
            title={isModifiedFromAi ? "已手動微調：點擊可一鍵還原為 AI 顯影基準" : "目前維持 AI 顯影基準"}
          >
            <span class="material-symbols-outlined" style="font-size: 13px;">
              settings_backup_restore
            </span>
            <span>還原 AI</span>
          </button>
        {/if}

        {#if onResetToAsShot}
          <button
            type="button"
            class="toolbar-btn"
            onclick={onResetToAsShot}
            title="還原為相機拍攝時的原始色溫與曝光 (As Shot)"
          >
            <span class="material-symbols-outlined" style="font-size: 13px;">photo_camera</span>
            <span>相機原值</span>
          </button>
        {/if}

        {#if onResetTuningParams}
          <button
            type="button"
            class="toolbar-btn danger-hover"
            onclick={onResetTuningParams}
            title="完全重設為未修圖原片（清除所有調色、風格與裁切）"
          >
            <span class="material-symbols-outlined" style="font-size: 13px;">restart_alt</span>
            <span>全重設</span>
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
      title="展開或收合基礎光影與白平衡微調"
    >
      <span class="step-num-badge font-mono">1</span>
      <span class="section-main-title">光影與白平衡</span>
      {#if hasAnyToneAdjustment}
        <span class="section-dirty-dot" title="此區塊已有微調項目"></span>
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
          title="讓 AI 自動分析並平衡此張相片的曝光、對比與明暗層次"
        >
          <span class="material-symbols-outlined ai-icon">exposure</span>
          <span>AI 光影</span>
        </button>
      {/if}

      {#if onQuickAiWhiteBalance}
        <button
          type="button"
          class="quick-ai-btn"
          onclick={onQuickAiWhiteBalance}
          disabled={isAiAnalyzing || !activePhoto}
          title="讓 AI 自動校正此張相片的色溫與色調偏移"
        >
          <span class="material-symbols-outlined ai-icon">thermostat</span>
          <span>AI 白平衡</span>
        </button>
      {/if}
    </div>
  </div>

  {#if lutTuningExpanded}
    <!-- 子分組 A：風格濃度與白平衡 -->
    <div class="sub-group-card">
      <div class="sub-group-title">
        <span>風格濃度與色溫</span>
        <span class="sub-group-en font-mono">STYLE & WB</span>
      </div>

      <DarkroomSlider
        label="風格套用濃度"
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
        label="色溫冷暖"
        subLabel="Kelvin"
        bind:value={darkroomState.colorTemp}
        defaultValue={activePhoto?.asShotTemp ?? 5500}
        min={2800}
        max={8500}
        step={50}
        customTrackGradient="linear-gradient(to right, #4578b8 0%, #83a5cf 35%, #d4a373 65%, #ea8d3b 100%)"
        formatValue={(v) => `${v}K ${v < 4800 ? "(偏冷)" : v > 6200 ? "(偏暖)" : ""}`.trim()}
        parseInput={parseCleanNumber}
      />

      <DarkroomSlider
        label="色調偏移"
        subLabel="綠 ↔ 洋紅"
        bind:value={darkroomState.tint}
        defaultValue={activePhoto?.asShotTint ?? 0}
        min={-100}
        max={100}
        step={1}
        isBipolar={true}
        customTrackGradient="linear-gradient(to right, #2ba471 0%, #1a1e24 50%, #c44e91 100%)"
        formatValue={(v) =>
          v > 0
            ? `+${Math.round(v)} (偏洋紅)`
            : v < 0
              ? `${Math.round(v)} (偏青綠)`
              : "0 (中性)"}
        parseInput={parseCleanNumber}
      />
    </div>

    <!-- 子分組 B：曝光與明暗階調 -->
    <div class="sub-group-card">
      <div class="sub-group-title">
        <span>曝光與明暗階調</span>
        <span class="sub-group-en font-mono">EXPOSURE & TONE</span>
      </div>

      <DarkroomSlider
        label="整體曝光"
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
        label="對比反差"
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
        label="高光細節修復"
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
        label="暗部提亮 (啞光感)"
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
        label="黑階紮實度"
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
        <span>飽和度與細節</span>
        <span class="sub-group-en font-mono">PRESENCE & DETAIL</span>
      </div>

      <DarkroomSlider
        label={darkroomState.monochrome ? "自然飽和度 (黑白停用)" : "自然飽和度 (護膚色)"}
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
        label="清晰度 (中頻立體感)"
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
        label="邊緣銳利度"
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
        ? "展開或收合黑白 6 色光學濾鏡混色器"
        : "展開或收合 6 種顏色獨立微調 (紅/橙/黃/綠/青/藍)"}
    >
      <span class="step-num-badge font-mono">2</span>
      <span class="section-main-title">
        {darkroomState.monochrome ? "黑白濾鏡混色" : "分色獨立微調 (HSL)"}
      </span>
      {#if darkroomState.monochrome ? hasAnyBwLumAdjustment : hasAnyHslAdjustment}
        <span class="section-dirty-dot" title="已有色域調整"></span>
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
        title={darkroomState.monochrome ? "歸零黑白光學濾鏡混色權重" : "歸零全部 6 色 HSL 調整"}
      >
        <span class="material-symbols-outlined" style="font-size: 12px;">restart_alt</span>
        <span>全部歸零</span>
      </button>
    {/if}
  </div>

  {#if hslExpanded}
    {#if darkroomState.monochrome}
      <p class="section-helper-desc">
        模擬傳統黑白攝影在鏡頭前加裝有色濾鏡，控制不同顏色轉換為灰階時的明暗反差：
      </p>
      <div class="bw-filter-presets">
        {#each BW_FILTER_PRESETS as preset}
          <button
            type="button"
            class="bw-filter-chip"
            onclick={() => darkroomState.applyBwFilterPreset(preset.key)}
            title={preset.title}
          >
            {preset.label}
          </button>
        {/each}
      </div>

      <div class="sub-group-card last">
        {#each HSL_BAND_META as band}
          <DarkroomSlider
            label={`${band.label}色區域明暗`}
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
            title={`切換調整「${band.label}色」的色相、彩度與明度`}
          >
            <span class="hsl-dot" style="background: {band.color};"></span>
            <span>{band.label}</span>
            {#if isHslBandDirty(band.key)}
              <span class="hsl-band-dirty-dot"></span>
            {/if}
          </button>
        {/each}
      </div>

      <div class="sub-group-card last">
        <div class="hsl-band-subbar">
          <span class="hsl-current-label">
            正在調整：<strong style="color: {selectedHslMeta.color};">{selectedHslMeta.label}色域 ({selectedHslMeta.key.toUpperCase()})</strong>
            {#if selectedHslBand === "orange" || selectedHslBand === "red"}
              <span class="hsl-skin-tip">· 常用於膚色微調</span>
            {:else if selectedHslBand === "green" || selectedHslBand === "yellow"}
              <span class="hsl-skin-tip">· 常用於植物草木</span>
            {:else if selectedHslBand === "blue" || selectedHslBand === "cyan"}
              <span class="hsl-skin-tip">· 常用於天空水面</span>
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
              歸零{selectedHslMeta.label}色
            </button>
          {/if}
        </div>

        <DarkroomSlider
          label={`${selectedHslMeta.label}色 · 色相偏移`}
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
          label={`${selectedHslMeta.label}色 · 鮮豔彩度`}
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
          label={`${selectedHslMeta.label}色 · 明暗亮度`}
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
      title="展開或收合底片顆粒、高光紅暈與冷暖分區染色"
    >
      <span class="step-num-badge font-mono">3</span>
      <span class="section-main-title">底片質感與冷暖染色</span>
      {#if hasAnyToningAdjustment}
        <span class="section-dirty-dot" title="此區塊已有微調項目"></span>
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
        title="將底片質感與冷暖染色還原為預設值"
      >
        <span class="material-symbols-outlined" style="font-size: 12px;">restart_alt</span>
        <span>歸零質感</span>
      </button>
    {/if}
  </div>

  {#if toningExpanded}
    <!-- 子分組 A：光學底片質感 -->
    <div class="sub-group-card">
      <div class="sub-group-title">
        <span>傳統底片光學效應</span>
        <span class="sub-group-en font-mono">FILM TEXTURE</span>
      </div>

      <DarkroomSlider
        label={darkroomState.monochrome ? "色彩濃厚感 (黑白停用)" : "色彩濃厚感 (減色密度)"}
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
        label="高光邊緣紅暈"
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
        label="銀鹽顆粒粗細"
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
        label="四周光學暗角"
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
        <span>{darkroomState.monochrome ? "暗房調色液染色 (硒調/棕調)" : "明暗冷暖分區染色"}</span>
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
          <span class="split-tone-label">暗部色調：{describeHueName(darkroomState.shadowHue)}</span>
          <span class="split-tone-status font-mono">
            {darkroomState.shadowTintAmount > 0.005
              ? `濃度 ${Math.round(darkroomState.shadowTintAmount * 100)}%`
              : "未啟用 (0%)"}
          </span>
        </div>

        <DarkroomSlider
          label="暗部染色強度"
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
          label="暗部色相選擇"
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
          <span class="split-tone-label">亮部色調：{describeHueName(darkroomState.highlightHue)}</span>
          <span class="split-tone-status font-mono">
            {darkroomState.highlightTintAmount > 0.005
              ? `濃度 ${Math.round(darkroomState.highlightTintAmount * 100)}%`
              : "未啟用 (0%)"}
          </span>
        </div>

        <DarkroomSlider
          label="亮部染色強度"
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
          label="亮部色相選擇"
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
      title="展開或收合構圖比例裁切、地平線旋轉與透視校正"
    >
      <span class="step-num-badge font-mono">4</span>
      <span class="section-main-title">構圖裁切與水平</span>
      {#if hasAnyCropAdjustment}
        <span class="section-dirty-dot" title="已套用裁切或水平校正"></span>
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
          title="讓 AI 判讀畫面主體重心並自動套用最佳裁切框"
        >
          <span class="material-symbols-outlined ai-icon">auto_fix_high</span>
          <span>AI 裁切</span>
        </button>
      {/if}

      {#if onQuickAiHorizon}
        <button
          type="button"
          class="quick-ai-btn"
          onclick={onQuickAiHorizon}
          disabled={isAiAnalyzing || !activePhoto}
          title="讓 AI 自動偵測地平線傾角與垂直建築線條並拉平"
        >
          <span class="material-symbols-outlined ai-icon">straighten</span>
          <span>AI 拉平</span>
        </button>
      {/if}
    </div>
  </div>

  {#if cropExpanded}
    <div class="sub-group-card last">
      <div class="sub-group-title">
        <span>畫面長寬比例</span>
        <button
          type="button"
          class="crop-frame-toggle font-mono"
          class:active={darkroomState.isCropMode}
          onclick={() => (darkroomState.isCropMode = !darkroomState.isCropMode)}
        >
          <span class="material-symbols-outlined" style="font-size: 12px;">crop</span>
          <span>{darkroomState.isCropMode ? "完成調整" : "顯示裁切框"}</span>
        </button>
      </div>

      <!-- Aspect Ratio Presets -->
      <div class="aspect-ratio-row">
        {#each CROP_RATIO_OPTIONS as item}
          <button
            type="button"
            class="ratio-chip"
            class:active={darkroomState.cropAspectRatio === item.key}
            onclick={() => darkroomState.applyAspectRatioPreset(item.key)}
            title={`切換為 ${item.label} 並開啟畫布裁切框`}
          >
            {item.label}
          </button>
        {/each}
      </div>

      <!-- Rotation Slider -->
      <DarkroomSlider
        label="水平旋轉校正"
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
        label="垂直透視校正 (建築仰拍)"
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

      <!-- Flip & Reset Controls -->
      <div class="geom-actions-row">
        <button
          type="button"
          class="geom-btn"
          class:active={darkroomState.flipH}
          onclick={() => (darkroomState.flipH = !darkroomState.flipH)}
          title="左右水平鏡像翻轉"
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">flip</span>
          <span>水平翻轉</span>
        </button>
        <button
          type="button"
          class="geom-btn"
          class:active={darkroomState.flipV}
          onclick={() => (darkroomState.flipV = !darkroomState.flipV)}
          title="上下垂直鏡像翻轉"
        >
          <span
            class="material-symbols-outlined"
            style="font-size: 13px; transform: rotate(90deg);">flip</span
          >
          <span>垂直翻轉</span>
        </button>
        <button
          type="button"
          class="geom-btn reset"
          onclick={() => darkroomState.resetCropState()}
          title="重設所有裁切、旋轉與透視變形"
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">restart_alt</span>
          <span>重設構圖</span>
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
    <span>微調滿意後，可立即輸出成片或進入批次匯出</span>
  </div>
  <div class="export-footer-actions">
    {#if onOpenQuickExport}
      <button
        type="button"
        class="footer-export-btn quick"
        onclick={onOpenQuickExport}
        disabled={!activePhoto}
        title="快速匯出目前這張相片 (快捷鍵 Ctrl+E)"
      >
        <span class="material-symbols-outlined" style="font-size: 15px;">download</span>
        <span>單張快速匯出</span>
      </button>
    {/if}
    {#if onGoToExport}
      <button
        type="button"
        class="footer-export-btn primary"
        onclick={onGoToExport}
        title="前往匯出與分享頁面（支援多張批次輸出與 AI 社群文案）"
      >
        <span>前往匯出佇列</span>
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

  .geom-btn.active {
    background-color: rgba(212, 163, 115, 0.15);
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
  }

  .geom-btn.reset:hover {
    color: #ff6b6b;
    border-color: #ff6b6b;
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
