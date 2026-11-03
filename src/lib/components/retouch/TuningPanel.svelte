<script lang="ts">
  import { darkroomState, type CropRatioPreset } from "$lib/stores/darkroomState.svelte";
  import { photoLibrary, type PhotoPlateItem } from "$lib/stores/photoLibrary.svelte";
  import { aiPipeline } from "$lib/stores/aiPipeline.svelte";
  import DarkroomSlider from "./DarkroomSlider.svelte";

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
  const currentProfileId = $derived(propsActiveProfileId ?? activePhoto?.appliedProfile);
  const isAiAnalyzing = $derived(aiPipeline.isAiAnalyzing);
</script>

<!-- 1. Color Adjustment Sliders (3D LUT TUNING) - 置頂第一順位 -->
<div class="telemetry-box hairline-b">
  <div class="tuning-box-header">
    <div class="box-title font-mono">3D LUT TUNING</div>
    <div style="display: flex; gap: 4px; align-items: center;">
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
    formatValue={(v) =>
      v > 0
        ? `+${Math.round(v)} (洋紅)`
        : v < 0
          ? `${Math.round(v)} (青綠)`
          : "0"}
    parseInput={parseCleanNumber}
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

<!-- 3. 3D LUT Vault Quick Select - 第三順位 -->
<div class="telemetry-box">
  <div class="tuning-box-header">
    <div class="box-title font-mono">3D LUT PROFILES</div>
    {#if onQuickAiProfile}
      <button
        type="button"
        class="quick-ai-btn font-mono"
        onclick={onQuickAiProfile}
        disabled={isAiAnalyzing || !activePhoto}
        title="一鍵讓 AI 推薦最合適的風格檔"
      >
        <span
          class="material-symbols-outlined"
          style="font-size: 12px; color: var(--amber-highlight);"
          >palette</span
        >
        <span>AI 推薦</span>
      </button>
    {/if}
  </div>

  <div class="profile-cards-list">
    {#each profiles as prof}
      <button
        type="button"
        class="profile-card hairline-all"
        class:active={currentProfileId === prof.id}
        onclick={() => {
          if (onHoverProfile) onHoverProfile(null);
          if (onApplyProfile) onApplyProfile(prof.id);
          const linkedPreset = styleGradingPresets.find(
            (p) => p.profileId === prof.id,
          );
          if (linkedPreset) darkroomState.activeStylePreset = linkedPreset.key;
        }}
        onmouseenter={() => {
          if (onHoverProfile) onHoverProfile(prof.id);
        }}
        onmouseleave={() => {
          if (onHoverProfile) onHoverProfile(null);
        }}
      >
        <div class="prof-card-top">
          <span class="prof-title font-headline">{prof.title}</span>
          <span class="prof-badge font-mono">{prof.badge}</span>
        </div>
        <div class="prof-tone font-body">{prof.tone}</div>
      </button>
    {/each}
  </div>
</div>

<!-- 下一個步驟：前往步驟三 批次匯出管線 -->
{#if onGoToExport}
  <div class="telemetry-box hairline-t mt-auto">
    <button
      type="button"
      class="archival-btn-primary w-full step2-cta-btn"
      onclick={onGoToExport}
      title="步驟二完成：前往步驟三 批次匯出管線"
    >
      <span class="material-symbols-outlined" style="font-size: 15px;">output_circle</span>
      <span>前往步驟三 · 批次匯出 →</span>
    </button>
  </div>
{/if}


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

  /* STEP 2 IN-PANEL CTA BUTTON */
  .step2-cta-btn {
    margin-top: 10px;
    background: linear-gradient(
      135deg,
      var(--primary-indigo),
      #3a506b
    ) !important;
    border: 1px solid rgba(138, 154, 184, 0.4) !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    font-weight: 600;
  }

  .step2-cta-btn:hover {
    filter: brightness(1.1);
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

  /* PROFILES LIST */
  .profile-cards-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .profile-card {
    background-color: var(--surface-elevated);
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid var(--hairline-slate);
    width: 100%;
    text-align: left;
    outline: none;
    font-family: inherit;
  }
  .profile-card:hover {
    background-color: var(--surface-overlay);
  }
  .profile-card.active {
    border-color: var(--amber-highlight);
    background-color: var(--surface-overlay);
  }
  .prof-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 3px;
  }
  .prof-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--parchment-bright);
  }
  .prof-badge {
    font-size: 9px;
    color: var(--parchment-dim);
    background-color: var(--canvas-base);
    padding: 1px 4px;
    border-radius: var(--radius-xs);
  }
  .prof-tone {
    font-size: 10px;
    color: var(--parchment-muted);
    line-height: 1.3;
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

</style>
