<script lang="ts">
  import { darkroomState, type CropRatioPreset } from "$lib/stores/darkroomState.svelte";
  import { photoLibrary, type PhotoPlateItem } from "$lib/stores/photoLibrary.svelte";
  import { aiPipeline } from "$lib/stores/aiPipeline.svelte";
  import { HSL_BAND_KEYS, createDefaultHslAdjustments, type HslBandKey } from "$lib/types/photo";
  import DarkroomSlider from "./DarkroomSlider.svelte";
  import DarkroomHistogram from "./DarkroomHistogram.svelte";
  import { toastStore } from "$lib/stores/toastStore.svelte";

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

  let selectedHslBand = $state<HslBandKey>("red");
  let hslExpanded = $state<boolean>(false);

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
    onGoToExport,
  }: Props = $props();

  const activePhoto = $derived(propsActivePhoto ?? photoLibrary.activePhoto);
  const isAiAnalyzing = $derived(aiPipeline.isAiAnalyzing);

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

<!-- 光學即時直方圖波形 -->
<DarkroomHistogram {activePhoto} />

<!-- 1. Color Adjustment Sliders (3D LUT TUNING) - 置頂第一順位 -->
<div class="telemetry-box hairline-b">
  <div class="tuning-box-header">
    <div class="box-title font-mono">3D LUT TUNING</div>
    <div style="display: flex; gap: 4px; align-items: center;">
      <!-- 單步復原 (Undo) 與 重做 (Redo) -->
      <button
        type="button"
        class="reset-tuning-btn font-mono"
        class:is-disabled={!darkroomState.canUndo}
        disabled={!darkroomState.canUndo}
        onclick={() => {
          if (darkroomState.undo()) {
            toastStore.show("已復原 (Undo)", "info", 1200);
          }
        }}
        title="復原上一步調色 (Ctrl+Z)"
      >
        <span class="material-symbols-outlined" style="font-size: 13px;">undo</span>
        <span>復原</span>
      </button>

      <button
        type="button"
        class="reset-tuning-btn font-mono"
        class:is-disabled={!darkroomState.canRedo}
        disabled={!darkroomState.canRedo}
        onclick={() => {
          if (darkroomState.redo()) {
            toastStore.show("已重做 (Redo)", "info", 1200);
          }
        }}
        title="重做下一步調色 (Ctrl+Y)"
      >
        <span class="material-symbols-outlined" style="font-size: 13px;">redo</span>
        <span>重做</span>
      </button>

      <!-- 複製與貼上調色按鈕 -->
      <button
        type="button"
        class="reset-tuning-btn font-mono"
        onclick={() => {
          if (!activePhoto) return;
          darkroomState.copyCurrentTuning(activePhoto.appliedProfile);
          toastStore.show("已複製當前調色參數 ✓", "success", 2000);
        }}
        title="複製當前底片的所有調色參數"
      >
        <span class="material-symbols-outlined" style="font-size: 13px;">content_copy</span>
        <span>複製</span>
      </button>

      {#if darkroomState.copiedTuning}
        <button
          type="button"
          class="reset-tuning-btn font-mono is-modified"
          onclick={() => {
            const pasted = darkroomState.pasteCopiedTuning();
            if (pasted && onApplyProfile) {
              onApplyProfile(pasted.appliedProfile);
            }
            toastStore.show("已套用貼上調色參數 ✓", "success", 2000);
          }}
          title="將複製的調色參數套用至目前底片"
        >
          <span class="material-symbols-outlined" style="font-size: 13px; color: var(--amber-highlight);">content_paste</span>
          <span>貼上</span>
        </button>
      {/if}
      {#if onQuickAiTone}
        <button
          type="button"
          class="quick-ai-btn font-mono"
          onclick={onQuickAiTone}
          disabled={isAiAnalyzing || !activePhoto}
          title="一鍵讓 AI 分析光比動態 (曝光/對比/陰影)"
        >
          <span
            class="material-symbols-outlined"
            style="font-size: 12px; color: var(--amber-highlight);"
            >exposure</span
          >
          <span>AI 光比</span>
        </button>
      {/if}

      {#if onQuickAiWhiteBalance}
        <button
          type="button"
          class="quick-ai-btn font-mono"
          onclick={onQuickAiWhiteBalance}
          disabled={isAiAnalyzing || !activePhoto}
          title="一鍵讓 AI 自動校準白平衡與色偏"
        >
          <span
            class="material-symbols-outlined"
            style="font-size: 12px; color: var(--amber-highlight);"
            >thermostat</span
          >
          <span>AI 白平衡</span>
        </button>
      {/if}

      {#if hasAiBaseline && onRestoreAiTuning}
        <button
          type="button"
          class="reset-tuning-btn font-mono"
          class:is-modified={isModifiedFromAi}
          onclick={onRestoreAiTuning}
          title={isModifiedFromAi ? "已手動微調：點擊可一鍵恢復為 AI 顯影設定" : "當前維持 AI 最佳顯影設定"}
        >
          <span
            class="material-symbols-outlined"
            style="font-size: 13px; color: {isModifiedFromAi ? 'var(--amber-highlight)' : 'inherit'};"
          >
            settings_backup_restore
          </span>
          <span>恢復 AI</span>
        </button>
      {/if}

      {#if onResetToAsShot}
        <button
          type="button"
          class="reset-tuning-btn font-mono"
          onclick={onResetToAsShot}
          title="還原為相機原生拍攝時的色溫與曝光 (As Shot)"
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">photo_camera</span>
          <span>拍攝原值</span>
        </button>
      {/if}

      {#if onResetTuningParams}
        <button
          type="button"
          class="reset-tuning-btn font-mono"
          onclick={onResetTuningParams}
          title="完全還原為未編輯原片（清除所有調色與裁切，並自已調色匯出佇列排除）"
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">restart_alt</span>
          <span>重設</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Slider 1: Exposure -->
  <DarkroomSlider
    label="EXPOSURE (EV)"
    bind:value={darkroomState.exposure}
    defaultValue={0}
    min={-2.0}
    max={2.0}
    step={0.05}
    isBipolar={true}
    formatValue={(v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))}
    parseInput={parseCleanNumber}
  />

  <!-- Slider 1.5: Highlights (Highlight Recovery / Boost) -->
  <DarkroomSlider
    label="HIGHLIGHTS (高光抑揚)"
    bind:value={darkroomState.highlights}
    defaultValue={0}
    min={-1.0}
    max={1.0}
    step={0.02}
    isBipolar={true}
    formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
    parseInput={parsePercentage}
  />

  <!-- Slider 2: Contrast -->
  <DarkroomSlider
    label="CONTRAST (對比)"
    bind:value={darkroomState.contrast}
    defaultValue={0}
    min={-0.8}
    max={0.8}
    step={0.02}
    isBipolar={true}
    formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
    parseInput={parsePercentage}
  />

  <!-- Slider 2.5: Shadow Lift (Matte Toe Lift) -->
  <DarkroomSlider
    label="SHADOW LIFT (暗部啞光抬升)"
    bind:value={darkroomState.shadows}
    defaultValue={0}
    min={-0.5}
    max={0.5}
    step={0.02}
    isBipolar={true}
    formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
    parseInput={parsePercentage}
  />

  <!-- Slider 2.8: Blacks (Black Point Anchor) -->
  <DarkroomSlider
    label="BLACKS (黑階錨點)"
    bind:value={darkroomState.blacks}
    defaultValue={0}
    min={-0.5}
    max={0.5}
    step={0.02}
    isBipolar={true}
    formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
    parseInput={parsePercentage}
  />

  <!-- Slider 3: LUT Intensity -->
  <DarkroomSlider
    label="LUT INTENSITY (風格濃度)"
    bind:value={darkroomState.lutIntensity}
    defaultValue={1.0}
    min={0}
    max={1}
    step={0.01}
    amberValue={true}
    formatValue={(v) => `${Math.round(v * 100)}%`}
    parseInput={parsePercentage}
  />

  <!-- Slider 4: Color Temp -->
  <DarkroomSlider
    label="KELVIN SCALE"
    bind:value={darkroomState.colorTemp}
    defaultValue={activePhoto?.asShotTemp ?? 5500}
    min={2800}
    max={8500}
    step={50}
    customTrackGradient="linear-gradient(to right, #4578b8 0%, #83a5cf 35%, #d4a373 65%, #ea8d3b 100%)"
    formatValue={(v) => `${v}K`}
    parseInput={parseCleanNumber}
  />

  <!-- Slider 4.5: Tint (Green <-> Magenta) -->
  <DarkroomSlider
    label="TINT (色調微調)"
    bind:value={darkroomState.tint}
    defaultValue={activePhoto?.asShotTint ?? 0}
    min={-100}
    max={100}
    step={1}
    isBipolar={true}
    customTrackGradient="linear-gradient(to right, #2ba471 0%, #1a1e24 50%, #c44e91 100%)"
    formatValue={(v) =>
      v > 0
        ? `+${Math.round(v)} (洋紅)`
        : v < 0
          ? `${Math.round(v)} (青綠)`
          : "0"}
    parseInput={parseCleanNumber}
  />

  <!-- Slider 4.8: Vibrance (Skin-Aware Natural Saturation) -->
  <DarkroomSlider
    label="VIBRANCE (自然飽和度)"
    bind:value={darkroomState.vibrance}
    defaultValue={0}
    min={-1.0}
    max={1.0}
    step={0.02}
    isBipolar={true}
    formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
    parseInput={parsePercentage}
  />

  <!-- Slider 5: Clarity -->
  <DarkroomSlider
    label="CLARITY (清晰度)"
    bind:value={darkroomState.clarity}
    defaultValue={0}
    min={-1.0}
    max={1.0}
    step={0.05}
    isBipolar={true}
    formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
    parseInput={parsePercentage}
  />

  <!-- Slider 6: Sharpness -->
  <DarkroomSlider
    label="SHARPNESS (銳利度)"
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

<!-- 1.5 Toning & Texture (減色密度 / 分區調色 / 光暈與銀鹽微粒) -->
<div class="telemetry-box hairline-b">
  <div class="tuning-box-header">
    <div class="box-title font-mono">TONING & TEXTURE</div>
    <button
      type="button"
      class="reset-tuning-btn font-mono"
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
      title="重置分區調色與底片質感為預設基準"
    >
      <span class="material-symbols-outlined" style="font-size: 13px;">restart_alt</span>
      <span>歸零</span>
    </button>
  </div>

  <!-- Subtractive Color Density -->
  <DarkroomSlider
    label="COLOR DENSITY (減色密度)"
    bind:value={darkroomState.colorDensity}
    defaultValue={0}
    min={-1.0}
    max={1.0}
    step={0.02}
    isBipolar={true}
    formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
    parseInput={parsePercentage}
  />

  <!-- Film Halation -->
  <DarkroomSlider
    label="HALATION (高光暈染)"
    bind:value={darkroomState.halation}
    defaultValue={0}
    min={0}
    max={1.0}
    step={0.02}
    amberValue={true}
    formatValue={(v) => `${Math.round(v * 100)}%`}
    parseInput={parsePercentage}
  />

  <!-- Organic Silver-Halide Grain -->
  <DarkroomSlider
    label="SILVER GRAIN (銀鹽微粒)"
    bind:value={darkroomState.grainAmount}
    defaultValue={0.15}
    min={0}
    max={1.0}
    step={0.02}
    formatValue={(v) => `${Math.round(v * 100)}%`}
    parseInput={parsePercentage}
  />

  <!-- Split Toning: Shadow Hue & Amount -->
  <DarkroomSlider
    label="SHADOW HUE (暗部色相)"
    bind:value={darkroomState.shadowHue}
    defaultValue={200}
    min={0}
    max={360}
    step={1}
    customTrackGradient="linear-gradient(to right, #d9534f 0%, #d9a74f 17%, #5cb85c 33%, #4fb8c9 50%, #4f6fd9 67%, #b84fd9 83%, #d9534f 100%)"
    formatValue={(v) => `${Math.round(v)}°`}
    parseInput={parseCleanNumber}
  />
  <DarkroomSlider
    label="SHADOW TINT (暗部色偏)"
    bind:value={darkroomState.shadowTintAmount}
    defaultValue={0}
    min={0}
    max={1.0}
    step={0.02}
    formatValue={(v) => `${Math.round(v * 100)}%`}
    parseInput={parsePercentage}
  />

  <!-- Split Toning: Highlight Hue & Amount -->
  <DarkroomSlider
    label="HIGHLIGHT HUE (亮部色相)"
    bind:value={darkroomState.highlightHue}
    defaultValue={40}
    min={0}
    max={360}
    step={1}
    customTrackGradient="linear-gradient(to right, #d9534f 0%, #d9a74f 17%, #5cb85c 33%, #4fb8c9 50%, #4f6fd9 67%, #b84fd9 83%, #d9534f 100%)"
    formatValue={(v) => `${Math.round(v)}°`}
    parseInput={parseCleanNumber}
  />
  <DarkroomSlider
    label="HIGHLIGHT TINT (亮部色偏)"
    bind:value={darkroomState.highlightTintAmount}
    defaultValue={0}
    min={0}
    max={1.0}
    step={0.02}
    formatValue={(v) => `${Math.round(v * 100)}%`}
    parseInput={parsePercentage}
  />

  <!-- Optical Vignette -->
  <DarkroomSlider
    label="VIGNETTE (光學暗角)"
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

<!-- 1.8 HSL Color Mixer (6-Band Targeted Color Mixer) -->
<div class="telemetry-box hairline-b">
  <div class="tuning-box-header" style="margin-bottom: {hslExpanded ? '10px' : '0'};">
    <button
      type="button"
      class="hsl-collapse-toggle font-mono"
      onclick={() => (hslExpanded = !hslExpanded)}
      title="展開或收合 6 段色彩微調 (HSL Color Mixer)"
    >
      <span class="material-symbols-outlined" style="font-size: 14px;">
        {hslExpanded ? "expand_more" : "chevron_right"}
      </span>
      <span class="box-title font-mono" style="margin-bottom: 0;">HSL COLOR MIXER</span>
      {#if hasAnyHslAdjustment}
        <span class="hsl-active-badge" title="已有 HSL 色域調整"></span>
      {/if}
    </button>
    {#if hasAnyHslAdjustment}
      <button
        type="button"
        class="reset-tuning-btn font-mono"
        onclick={() => {
          darkroomState.hsl = createDefaultHslAdjustments();
          darkroomState.recordSnapshot(true);
        }}
        title="歸零全部 6 段 HSL 調整"
      >
        <span class="material-symbols-outlined" style="font-size: 13px;">restart_alt</span>
        <span>全部歸零</span>
      </button>
    {/if}
  </div>

  {#if hslExpanded}
    <div class="hsl-band-tabs">
      {#each HSL_BAND_META as band}
        <button
          type="button"
          class="hsl-band-tab font-mono"
          class:active={selectedHslBand === band.key}
          onclick={() => (selectedHslBand = band.key)}
          title={`${band.label}色域調整`}
        >
          <span class="hsl-dot" style="background: {band.color};"></span>
          <span>{band.label}</span>
          {#if isHslBandDirty(band.key)}
            <span class="hsl-band-dirty-dot"></span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="hsl-band-subbar">
      <span class="font-mono" style="font-size: 10px; color: var(--parchment-dim);">
        ACTIVE BAND: <strong style="color: {selectedHslMeta.color};">{selectedHslMeta.label} ({selectedHslMeta.key.toUpperCase()})</strong>
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
          歸零此色
        </button>
      {/if}
    </div>

    <DarkroomSlider
      label="HUE (色相偏移)"
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
      label="SATURATION (彩度)"
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
      label="LUMINANCE (明度)"
      bind:value={darkroomState.hsl[selectedHslBand].lum}
      defaultValue={0}
      min={-1.0}
      max={1.0}
      step={0.02}
      isBipolar={true}
      formatValue={(v) => (v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`)}
      parseInput={parsePercentage}
    />
  {/if}
</div>

<!-- 2. CROP & GEOMETRY TELEMETRY BOX - 第二順位 -->
<div class="telemetry-box hairline-b">
  <div class="tuning-box-header">
    <div class="box-title font-mono">CROP & GEOMETRY</div>
    <div style="display: flex; gap: 4px;">
      {#if onQuickAiCrop}
        <button
          type="button"
          class="quick-ai-btn font-mono"
          onclick={onQuickAiCrop}
          disabled={isAiAnalyzing || !activePhoto}
          title="一鍵讓 AI 判斷最佳構圖並套用裁切"
        >
          <span
            class="material-symbols-outlined"
            style="font-size: 12px; color: var(--amber-highlight);"
            >auto_fix_high</span
          >
          <span>AI 裁切</span>
        </button>
      {/if}

      {#if onQuickAiHorizon}
        <button
          type="button"
          class="quick-ai-btn font-mono"
          onclick={onQuickAiHorizon}
          disabled={isAiAnalyzing || !activePhoto}
          title="一鍵讓 AI 自動校正地平線傾角"
        >
          <span
            class="material-symbols-outlined"
            style="font-size: 12px; color: var(--amber-highlight);"
            >straighten</span
          >
          <span>AI 拉平</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Aspect Ratio Presets -->
  <div class="aspect-ratio-row font-mono">
    {#each ["original", "1:1", "4:5", "16:9", "9:16", "free"] as ratio}
      <button
        type="button"
        class="ratio-chip"
        class:active={darkroomState.cropAspectRatio === ratio}
        onclick={() => darkroomState.applyAspectRatioPreset(ratio as CropRatioPreset)}
        title={`切換為 ${ratio} 比例並開啟裁切框`}
      >
        {ratio === "original" ? "原圖" : ratio}
      </button>
    {/each}
  </div>

  <!-- Rotation Slider -->
  <DarkroomSlider
    label="ROTATION (水平旋轉)"
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
    label="KEYSTONE V (垂直透視梯形)"
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
  <div class="geom-actions-row font-mono">
    <button
      type="button"
      class="geom-btn"
      class:active={darkroomState.flipH}
      onclick={() => (darkroomState.flipH = !darkroomState.flipH)}
      title="水平鏡像翻轉"
    >
      <span class="material-symbols-outlined" style="font-size: 13px;">flip</span>
      <span>水平翻轉</span>
    </button>
    <button
      type="button"
      class="geom-btn"
      class:active={darkroomState.flipV}
      onclick={() => (darkroomState.flipV = !darkroomState.flipV)}
      title="垂直鏡像翻轉"
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
      title="重設裁切與透視"
    >
      <span class="material-symbols-outlined" style="font-size: 13px;">restart_alt</span>
      <span>重設幾何</span>
    </button>
  </div>
</div>

<style>
  .telemetry-box {
    padding: 14px 16px;
    box-sizing: border-box;
  }

  .box-title {
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--parchment-dim);
    margin-bottom: 10px;
  }

  .tuning-box-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

.reset-tuning-btn {
    background: transparent;
    border: 1px solid var(--border-hairline);
    color: var(--parchment-dim);
    font-size: 11px;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
    .reset-tuning-btn:disabled,
  .reset-tuning-btn.is-disabled {
    opacity: 0.35;
    cursor: not-allowed;
    border-color: var(--border-hairline);
    color: var(--parchment-dim);
    pointer-events: none;
  }

  .reset-tuning-btn:hover {
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    background-color: var(--surface-overlay);
  }
  .reset-tuning-btn.is-modified {
    border-color: rgba(229, 142, 38, 0.45);
    color: var(--amber-highlight);
    background-color: rgba(229, 142, 38, 0.08);
  }

  /* CROP & GEOMETRY RIGHT PANEL */
  .aspect-ratio-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-bottom: 10px;
  }
  .ratio-chip {
    padding: 4px 6px;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: 3px;
    color: var(--parchment-muted);
    font-size: 10px;
    cursor: pointer;
    text-align: center;
    transition: all 0.15s ease;
  }
  .ratio-chip:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
  }
  .ratio-chip.active {
    background-color: var(--surface-overlay);
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
  }
  .geom-actions-row {
    display: flex;
    gap: 5px;
    margin-top: 8px;
  }
  .geom-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 5px 6px;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: 3px;
    color: var(--parchment-muted);
    font-size: 10px;
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

  /* QUICK AI BUTTONS */
  .quick-ai-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    padding: 2px 6px;
    color: var(--parchment-muted);
    font-size: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .quick-ai-btn:hover:not(:disabled) {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
    border-color: var(--amber-highlight);
  }
  .quick-ai-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* HSL COLOR MIXER */
  .hsl-collapse-toggle {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--parchment-dim);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }
  .hsl-collapse-toggle:hover {
    color: var(--parchment-bright);
  }
  .hsl-active-badge {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--amber-highlight);
    display: inline-block;
    margin-left: 2px;
  }
  .hsl-band-tabs {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    margin-bottom: 10px;
  }
  .hsl-band-tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 5px 4px;
    background: var(--surface-panel);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-xs);
    color: var(--parchment-dim);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .hsl-band-tab:hover {
    color: var(--parchment-bright);
    border-color: var(--hairline-slate);
  }
  .hsl-band-tab.active {
    background: rgba(212, 163, 115, 0.14);
    border-color: var(--amber-highlight);
    color: var(--parchment-bright);
  }
  .hsl-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .hsl-band-dirty-dot {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--amber-highlight);
  }
  .hsl-band-subbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .hsl-band-reset {
    background: transparent;
    border: none;
    color: var(--amber-highlight);
    font-size: 10px;
    cursor: pointer;
    padding: 0 2px;
  }
  .hsl-band-reset:hover {
    text-decoration: underline;
  }

</style>
