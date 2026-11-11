<script lang="ts">
  /**
   * 暗房精密調色滑桿元件 (Darkroom Precision Slider)
   * 專為暗房專業修圖打造，支援：
   * 1. 雙擊 (Double-click) 標籤、數值或滑桿軌道即刻歸零 (重設為標準預設值)。
   * 2. 滑鼠懸停滾輪微調 (Wheel Scrubbing)，支援 Shift (5x 快速) 與 Alt (0.2x 細微) 倍率。
   * 3. 單擊或雙擊數值啟動就地文字編輯 (Inline Text Input)，按 Enter 儲存、Esc 放棄。
   * 4. 雙向滑桿中點填色條 (Bipolar Track Fill) 與零點微磁吸附。
   * 5. 參數變更指示燈 (Modified Dot Indicator)，點擊亦可單項還原。
   */
  interface Props {
    label: string;
    value: number;
    defaultValue?: number;
    min: number;
    max: number;
    step: number;
    isBipolar?: boolean;
    amberValue?: boolean;
    disabled?: boolean;
    customTrackGradient?: string;
    formatValue?: (val: number) => string;
    parseInput?: (text: string) => number | null;
  }

  let {
    label,
    value = $bindable(),
    defaultValue = 0,
    min,
    max,
    step,
    isBipolar = false,
    amberValue = false,
    disabled = false,
    customTrackGradient,
    formatValue,
    parseInput,
  }: Props = $props();

  // 判定是否已被調整（偏離預設值）
  const isModified = $derived(Math.abs(value - defaultValue) > step * 0.1);

  // 就地文字編輯狀態
  let isEditing = $state(false);
  let editInputText = $state("");
  let inputEl = $state<HTMLInputElement | null>(null);

  // 重設為預設值（點兩下歸零）
  function resetToDefault() {
    if (disabled) return;
    value = defaultValue;
  }

  // 滑鼠滾輪懸停微調
  function handleWheel(e: WheelEvent) {
    if (disabled || isEditing) return;
    e.preventDefault();
    const direction = e.deltaY < 0 ? 1 : -1;
    let multiplier = 1;
    if (e.shiftKey) multiplier = 5;
    else if (e.altKey) multiplier = 0.2;

    let next = value + direction * step * multiplier;

    // 零點微磁吸附 (Zero Snapping)
    if (Math.abs(next - defaultValue) < step * 0.5) {
      next = defaultValue;
    }

    // 計算小數位數精度，避免浮點數誤差
    const stepDecimals = step.toString().split(".")[1]?.length || 0;
    const precision = Math.max(stepDecimals, multiplier < 1 ? stepDecimals + 1 : 0);
    const clamped = Math.max(min, Math.min(max, next));
    value = Number(clamped.toFixed(precision));
  }

  // 啟動就地文字編輯
  function startEditing() {
    if (disabled) return;
    isEditing = true;
    editInputText = formatValue ? formatValue(value).replace(/[^0-9.-]/g, "") : String(value);
    setTimeout(() => {
      inputEl?.focus();
      inputEl?.select();
    }, 20);
  }

  // 完成就地編輯並驗證
  function commitEditing() {
    if (!isEditing) return;
    isEditing = false;
    let parsed: number | null = null;
    if (parseInput) {
      parsed = parseInput(editInputText);
    } else {
      const clean = editInputText.trim();
      const num = parseFloat(clean);
      if (!isNaN(num)) {
        parsed = num;
      }
    }

    if (parsed !== null && !isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      value = Number(clamped.toFixed(3));
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      commitEditing();
    } else if (e.key === "Escape") {
      isEditing = false;
    }
  }

  // 計算滑桿填充背景樣式 (CSS gradient track fill)
  const trackBackground = $derived.by(() => {
    if (customTrackGradient) return customTrackGradient;
    const range = max - min;
    if (range <= 0) return "var(--surface-overlay)";

    const currentPercent = Math.max(0, Math.min(100, ((value - min) / range) * 100));

    if (isBipolar) {
      const zeroPercent = Math.max(0, Math.min(100, ((0 - min) / range) * 100));
      const left = Math.min(zeroPercent, currentPercent);
      const right = Math.max(zeroPercent, currentPercent);
      return `linear-gradient(to right,
        var(--surface-overlay) 0%,
        var(--surface-overlay) ${left}%,
        var(--amber-highlight) ${left}%,
        var(--amber-highlight) ${right}%,
        var(--surface-overlay) ${right}%,
        var(--surface-overlay) 100%)`;
    } else {
      return `linear-gradient(to right,
        var(--amber-highlight) 0%,
        var(--amber-highlight) ${currentPercent}%,
        var(--surface-overlay) ${currentPercent}%,
        var(--surface-overlay) 100%)`;
    }
  });

  const displayString = $derived(formatValue ? formatValue(value) : String(value));
</script>

<div
  class="control-row"
  class:is-disabled={disabled}
  onwheel={handleWheel}
  role="region"
  aria-label={label}
>
  <div class="control-header font-mono">
    <!-- 標籤區：支援雙擊歸零，並顯示已修改指示燈 -->
    <div class="label-group">
      <span
        class="label-text"
        role="button"
        tabindex="-1"
        ondblclick={resetToDefault}
        title="點兩下歸零 / 還原為標準基準值"
      >
        {label}
      </span>
      {#if isModified}
        <button
          type="button"
          class="modified-dot"
          onclick={resetToDefault}
          title={`已修改，點擊還原為預設值 (${defaultValue})`}
          aria-label="還原為預設值"
        ></button>
      {/if}
    </div>

    <!-- 數值區：支援單擊直接打字輸入、雙擊歸零 -->
    <div class="val-group">
      {#if isEditing}
        <input
          bind:this={inputEl}
          type="text"
          class="inline-val-input font-mono"
          bind:value={editInputText}
          onblur={commitEditing}
          onkeydown={handleKeyDown}
        />
      {:else}
        <button
          type="button"
          class="control-val font-mono"
          class:amber={amberValue}
          class:modified={isModified}
          onclick={startEditing}
          ondblclick={resetToDefault}
          title="單擊輸入數值，點兩下歸零"
        >
          {displayString}
        </button>
      {/if}
    </div>
  </div>

  <!-- 滑桿軌道：支援雙擊軌道或拖曳鍵歸零 -->
  <div class="slider-wrapper">
    <input
      type="range"
      {min}
      {max}
      {step}
      {disabled}
      bind:value
      ondblclick={resetToDefault}
      class="darkroom-slider"
      style:background={trackBackground}
      title={disabled ? "黑白模式下停用此色彩通道" : "拖曳滑動，懸停滾輪微調，點兩下歸零"}
    />
    {#if isBipolar}
      <!-- 中心 0 刻度指示點 -->
      <div
        class="center-detent"
        style:left={`${((0 - min) / (max - min)) * 100}%`}
        title="零點基準"
      ></div>
    {/if}
  </div>
</div>

<style>
  .control-row {
    margin-bottom: 12px;
    user-select: none;
  }
  .control-row.is-disabled {
    opacity: 0.36;
    pointer-events: none;
  }

  .control-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    letter-spacing: 0.05em;
    color: var(--parchment-dim);
    margin-bottom: 6px;
  }

  .label-group {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }

  .label-group:hover .label-text {
    color: var(--parchment-bright);
  }

  .label-text {
    transition: color 0.15s ease;
  }

  .modified-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background-color: var(--amber-highlight);
    border: none;
    padding: 0;
    cursor: pointer;
    box-shadow: 0 0 4px var(--amber-highlight);
    transition: transform 0.15s ease;
  }

  .modified-dot:hover {
    transform: scale(1.5);
  }

  .val-group {
    display: flex;
    align-items: center;
  }

  .control-val {
    background: transparent;
    border: none;
    font: inherit;
    color: var(--parchment-bright);
    font-weight: 500;
    cursor: text;
    padding: 1px 4px;
    border-radius: var(--radius-xs, 2px);
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .control-val:hover {
    background-color: var(--surface-overlay);
    color: var(--amber-highlight);
  }

  .control-val.amber {
    color: var(--amber-highlight);
  }

  .inline-val-input {
    width: 65px;
    background: var(--surface-panel, #1a1e24);
    border: 1px solid var(--amber-highlight);
    color: var(--parchment-bright);
    font-size: 11px;
    text-align: right;
    padding: 1px 4px;
    border-radius: 2px;
    outline: none;
    box-shadow: 0 0 6px rgba(212, 163, 115, 0.3);
  }

  .slider-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .darkroom-slider {
    width: 100%;
    height: 4px;
    border-radius: 2px;
    appearance: none;
    outline: none;
    cursor: pointer;
    transition: filter 0.15s ease;
  }

  .darkroom-slider:hover {
    filter: brightness(1.15);
  }

  .darkroom-slider::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--parchment-bright);
    cursor: pointer;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
    transition: transform 0.1s ease, background-color 0.1s ease;
  }

  .darkroom-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
    background-color: var(--amber-highlight);
  }

  .darkroom-slider::-webkit-slider-thumb:active {
    transform: scale(1.3);
    background-color: var(--amber-highlight);
  }

  .center-detent {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 2px;
    height: 8px;
    background-color: rgba(255, 255, 255, 0.25);
    pointer-events: none;
    border-radius: 1px;
  }

  /* 行動端觸控介面優化：放大滑桿 thumb 與點擊熱區 */
  @media (max-width: 768px) {
    .slider-wrapper {
      padding: 10px 0;
      touch-action: none;
    }

    .darkroom-slider {
      height: 6px;
    }

    .darkroom-slider::-webkit-slider-thumb {
      width: 22px;
      height: 22px;
      box-shadow: 0 0 6px rgba(0, 0, 0, 0.8);
    }

    .label-text,
    .control-val {
      font-size: 13px;
      padding: 4px 6px;
    }
  }
</style>
