<script lang="ts">
  import { aiPipeline } from "$lib/stores/aiPipeline.svelte";
  import { darkroomState } from "$lib/stores/darkroomState.svelte";
  import { photoLibrary } from "$lib/stores/photoLibrary.svelte";
  import { STYLE_KEYWORD_ENTRIES } from "$lib/services/ai/styleDirectives";

  interface Props {
    styleGradingPresets: any[];
    stylePreviewThumbs?: Record<string, string>;
    geminiKeyStatus: { exists: boolean; mode: string | null };
    activePhoto?: any;
    photos?: any[];
    isAiAnalyzing?: boolean;
    isBatchAiRunning?: boolean;
    batchProgress?: any;
    aiTerminalLogs?: string[];
    aiSceneTitle?: string;
    aiSuggestedScene?: string;
    aiRecommendedMood?: string;
    aiStyleInsight?: string;
    aiCropRationale?: string;
    aiVisionTags?: string[];
    aiScope?: any;
    isAiScopeOpen?: boolean;
    copiedLogNotice?: boolean;
    onToggleAiScope?: (key: any) => void;
    onToggleIsAiScopeOpen?: () => void;
    onCopyTerminalLogs?: () => void;
    onRunAiAnalysis?: () => void;
    onRequestBatchAi?: () => void;
    onCancelBatchAi?: () => void;
    onOpenVault?: () => void;
    onHoverProfile?: (profileId: string | null) => void;
  }

  let {
    styleGradingPresets = [],
    stylePreviewThumbs = {},
    geminiKeyStatus = { exists: false, mode: null },
    activePhoto: propsActivePhoto = null,
    photos: propsPhotos = [],
    isAiAnalyzing: propsIsAiAnalyzing,
    isBatchAiRunning: propsIsBatchAiRunning,
    batchProgress: propsBatchProgress,
    aiTerminalLogs: propsAiTerminalLogs,
    aiSceneTitle: propsAiSceneTitle,
    aiSuggestedScene: propsAiSuggestedScene,
    aiRecommendedMood: propsAiRecommendedMood,
    aiStyleInsight: propsAiStyleInsight,
    aiCropRationale: propsAiCropRationale,
    aiVisionTags: propsAiVisionTags,
    aiScope: propsAiScope,
    isAiScopeOpen: propsIsAiScopeOpen,
    copiedLogNotice: propsCopiedLogNotice,
    onToggleAiScope,
    onToggleIsAiScopeOpen,
    onCopyTerminalLogs,
    onRunAiAnalysis,
    onRequestBatchAi,
    onCancelBatchAi,
    onOpenVault,
    onHoverProfile,
  }: Props = $props();

  let terminalBodyElement = $state<HTMLDivElement | null>(null);

  const activePhoto = $derived(propsActivePhoto ?? photoLibrary.activePhoto);
  const photoPlates = $derived(propsPhotos?.length ? propsPhotos : photoLibrary.photoPlates);
  const flaggedCount = $derived(
    photoPlates.filter((p: any) => p.flagged).length || photoLibrary.flaggedCount
  );

  const currentIsAiAnalyzing = $derived(propsIsAiAnalyzing ?? aiPipeline.isAiAnalyzing);
  const currentIsBatchRunning = $derived(propsIsBatchAiRunning ?? aiPipeline.isBatchAiRunning);
  const currentBatchProgress = $derived(propsBatchProgress ?? aiPipeline.batchProgress);
  const currentLogs = $derived(propsAiTerminalLogs ?? aiPipeline.aiTerminalLogs);
  const currentSceneTitle = $derived(propsAiSceneTitle ?? aiPipeline.aiSceneTitle);
  const currentSuggestedScene = $derived(propsAiSuggestedScene ?? aiPipeline.aiSuggestedScene);
  const currentRecommendedMood = $derived(propsAiRecommendedMood ?? aiPipeline.aiRecommendedMood);
  const currentStyleInsight = $derived(propsAiStyleInsight ?? aiPipeline.aiStyleInsight);
  const currentCropRationale = $derived(propsAiCropRationale ?? darkroomState.aiCropRationale);
  const currentVisionTags = $derived(propsAiVisionTags ?? aiPipeline.aiVisionTags);
  const currentAiScope = $derived(propsAiScope ?? aiPipeline.aiScope);
  const currentIsScopeOpen = $derived(propsIsAiScopeOpen ?? aiPipeline.isAiScopeOpen);
  const currentCopiedNotice = $derived(propsCopiedLogNotice ?? aiPipeline.copiedLogNotice);

  // 當有新日誌時自動捲動終端機底部
  $effect(() => {
    if (currentLogs.length && terminalBodyElement) {
      terminalBodyElement.scrollTop = terminalBodyElement.scrollHeight;
    }
  });
</script>

<div class="ai-assistant-dock hairline-t">
  <div class="ai-header">
    <span class="material-symbols-outlined ai-sparkle">auto_awesome</span>
    <span class="font-headline ai-title">AI 顯影調色</span>
    {#if currentIsBatchRunning}
      <span class="ai-batch-badge font-mono amber">BATCH RUNNING</span>
    {/if}
  </div>
  <p class="ai-desc">Gemini 視覺多模態 · 智慧光學顯影</p>

  {#if currentLogs.length > 0}
    <!-- LIVE TERMINAL SCAN STREAM HUD -->
    <div class="ai-terminal-box hairline-all font-mono">
      <div class="terminal-bar hairline-b">
        <span class="term-dot red"></span>
        <span class="term-dot amber"></span>
        <span class="term-dot green"></span>
        <span class="term-title">DARKROOM://NEURAL_DEVELOP</span>
        {#if currentIsBatchRunning && onCancelBatchAi}
          <button
            type="button"
            class="term-stop-btn font-mono"
            title="立即手動中止 AI 批次顯影"
            onclick={onCancelBatchAi}
          >
            <span class="material-symbols-outlined" style="font-size: 11px;">stop_circle</span>
            <span>停止批次</span>
          </button>
        {/if}
        <button
          type="button"
          class="term-copy-btn font-mono"
          title="複製終端機所有日誌"
          onclick={() => onCopyTerminalLogs ? onCopyTerminalLogs() : aiPipeline.copyTerminalLogs()}
        >
          <span class="material-symbols-outlined" style="font-size: 11px;">
            {currentCopiedNotice ? "check" : "content_copy"}
          </span>
          <span>{currentCopiedNotice ? "已複製" : "複製 Log"}</span>
        </button>
      </div>
      <div class="terminal-body custom-scroll" bind:this={terminalBodyElement}>
        {#each currentLogs as line}
          <div class="term-line">{line}</div>
        {/each}
        {#if currentIsAiAnalyzing || currentIsBatchRunning}
          <div class="term-line active">
            {#if currentBatchProgress?.countdown}
              <span class="term-blink amber">
                ⚡ 速率保護冷卻中 ({currentBatchProgress.countdown}s)...
              </span>
            {:else}
              <span class="term-cursor">▌</span>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- STATUS & INSIGHT SUMMARY CARD (始終常駐保留清晰資訊標籤) -->
  <div class="ai-status-card hairline-all">
    <div class="ai-row">
      <span class="ai-label font-mono">場景</span>
      <span class="ai-val font-mono">{currentSceneTitle || currentSuggestedScene}</span>
    </div>
    {#if currentRecommendedMood}
      <div class="ai-row">
        <span class="ai-label font-mono">風格意境</span>
        <span class="ai-val font-mono amber">⚡ {currentRecommendedMood}</span>
      </div>
    {/if}
    <div class="ai-row">
      <span class="ai-label font-mono">色彩檔</span>
      <span class="ai-val font-mono indigo">
        {activePhoto ? activePhoto.appliedProfile : "尚未載入"}
      </span>
    </div>
  </div>

  <!-- 後製調色理念與光影診斷 Label -->
  {#if currentStyleInsight}
    <div class="ai-insight-quote hairline-all font-body">
      <span class="material-symbols-outlined insight-icon">lightbulb</span>
      <div class="insight-text">
        <strong class="insight-tag font-mono">後製理念 // </strong>{currentStyleInsight}
      </div>
    </div>
  {/if}

  <!-- AI 構圖裁切理由與診斷 Label -->
  {#if currentCropRationale}
    <div class="ai-crop-quote hairline-all font-body">
      <span class="material-symbols-outlined crop-icon">crop</span>
      <div class="crop-text">
        <strong class="crop-tag font-mono">AI 裁切構圖理念 // </strong>{currentCropRationale}
      </div>
    </div>
  {/if}

  <!-- GEMINI 視覺神經特徵標籤 -->
  {#if currentVisionTags.length > 0}
    <div class="ai-tags-box hairline-all font-mono">
      <div class="box-header">
        <span
          class="material-symbols-outlined"
          style="font-size: 13px; color: var(--amber-highlight);"
        >
          visibility
        </span>
        <span>視覺特徵標籤 (GEMINI FLASH)</span>
      </div>
      <div class="chips-wrap">
        {#each currentVisionTags as tag}
          <span class="vision-chip">#{tag}</span>
        {/each}
      </div>
    </div>
  {/if}

  <!-- AI Scope Responsibility Selector -->
  <div class="ai-scope-card hairline-all">
    <button
      type="button"
      class="ai-scope-toggle-btn font-mono"
      onclick={() => onToggleIsAiScopeOpen ? onToggleIsAiScopeOpen() : (aiPipeline.isAiScopeOpen = !aiPipeline.isAiScopeOpen)}
      title="展開或收合 AI 負責的調色與裁切範圍"
    >
      <div class="scope-header-left">
        <span
          class="material-symbols-outlined"
          style="font-size: 14px; color: var(--amber-highlight);"
        >
          checklist
        </span>
        <span>
          AI 職責範圍勾選 ({Object.values(currentAiScope).filter(Boolean).length}/5)
        </span>
      </div>
      <span
        class="material-symbols-outlined scope-chevron"
        style:transform={currentIsScopeOpen ? "rotate(180deg)" : "none"}
      >
        expand_more
      </span>
    </button>

    {#if currentIsScopeOpen}
      <div class="ai-scope-list font-mono">
        <label class="scope-checkbox-row">
          <input
            type="checkbox"
            checked={currentAiScope.lutProfile}
            onchange={() => onToggleAiScope ? onToggleAiScope("lutProfile") : aiPipeline.toggleAiScope("lutProfile")}
          />
          <span>3D LUT 風格推薦</span>
        </label>
        <label class="scope-checkbox-row">
          <input
            type="checkbox"
            checked={currentAiScope.crop}
            onchange={() => onToggleAiScope ? onToggleAiScope("crop") : aiPipeline.toggleAiScope("crop")}
          />
          <span>智慧構圖與裁切</span>
        </label>
        <label class="scope-checkbox-row">
          <input
            type="checkbox"
            checked={currentAiScope.keystone}
            onchange={() => onToggleAiScope ? onToggleAiScope("keystone") : aiPipeline.toggleAiScope("keystone")}
          />
          <span>梯形與水平校正</span>
        </label>
        <label class="scope-checkbox-row">
          <input
            type="checkbox"
            checked={currentAiScope.tone}
            onchange={() => onToggleAiScope ? onToggleAiScope("tone") : aiPipeline.toggleAiScope("tone")}
          />
          <span>基礎光影與動態</span>
        </label>
        <label class="scope-checkbox-row">
          <input
            type="checkbox"
            checked={currentAiScope.whiteBalance}
            onchange={() => onToggleAiScope ? onToggleAiScope("whiteBalance") : aiPipeline.toggleAiScope("whiteBalance")}
          />
          <span>自動色溫與色偏</span>
        </label>
      </div>
    {/if}
  </div>

  <div class="ai-actions-stack">
    {#if currentIsBatchRunning}
      <button
        type="button"
        class="archival-btn-secondary danger w-full"
        onclick={onCancelBatchAi}
      >
        <span class="material-symbols-outlined" style="font-size: 16px;">cancel</span>
        <span>
          中止 AI 批次顯影 ({currentBatchProgress?.current || 1}/{currentBatchProgress?.total || 1})
        </span>
      </button>
    {:else}
      <!-- AI 風格調色：先選風格（卡片列，Hover 即時預覽），再按下執行 -->
      <div class="style-card-picker hairline-all font-mono">
        <div class="style-card-picker-header">
          <span
            class="material-symbols-outlined"
            style="font-size: 13px; color: var(--amber-highlight);"
          >
            palette
          </span>
          <span>選擇風格（Hover 即時預覽）</span>
        </div>
        <div class="style-card-row custom-scroll">
          {#each styleGradingPresets as preset}
            <button
              type="button"
              class="style-card"
              class:active={darkroomState.activeStylePreset === preset.key}
              title={preset.subtitle}
              onclick={() => {
                if (onHoverProfile) onHoverProfile(null);
                darkroomState.activeStylePreset = preset.key;
              }}
              onmouseenter={() => {
                if (preset.profileId && onHoverProfile) {
                  onHoverProfile(preset.profileId);
                }
              }}
              onmouseleave={() => {
                if (onHoverProfile) onHoverProfile(null);
              }}
            >
              <span
                class="style-card-swatch"
                style:background={stylePreviewThumbs[preset.key]
                  ? `center / cover no-repeat url(${stylePreviewThumbs[preset.key]})`
                  : preset.key === "auto"
                    ? "linear-gradient(135deg, #e29d52, #6082b6 55%, #3aa8a8)"
                    : preset.accent}
              >
                {#if preset.key === "auto"}
                  <span class="material-symbols-outlined" style="font-size: 28px; color: #fff;">
                    auto_awesome
                  </span>
                {/if}
              </span>
              <span class="style-card-title font-headline">
                {preset.shortLabel || preset.title}
              </span>
              <span class="style-card-badge">{preset.badge}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- 調色意境關鍵字按鈕列 (Vibe Keywords Prompt Injection) -->
      <div class="vibe-keywords-picker hairline-all font-mono">
        <div class="vibe-keywords-header">
          <div class="vibe-header-left">
            <span
              class="material-symbols-outlined"
              style="font-size: 13px; color: var(--amber-highlight);"
            >
              flare
            </span>
            <span>調色意境關鍵字（點選加入 Prompt）</span>
          </div>
          {#if darkroomState.selectedStyleKeywords.length > 0 || darkroomState.customStylePrompt.trim()}
            <button
              type="button"
              class="vibe-clear-btn font-mono"
              onclick={() => darkroomState.clearStyleKeywords()}
              title="清空已選取的調色關鍵字"
            >
              清空 ({darkroomState.selectedStyleKeywords.length +
                (darkroomState.customStylePrompt.trim() ? 1 : 0)})
            </button>
          {/if}
        </div>

        <div class="vibe-chips-grid">
          {#each STYLE_KEYWORD_ENTRIES as kw}
            <button
              type="button"
              class="vibe-keyword-chip font-mono"
              class:active={darkroomState.selectedStyleKeywords.includes(kw.id)}
              title={kw.tooltip}
              onclick={() => darkroomState.toggleStyleKeyword(kw.id)}
            >
              <span class="vibe-chip-dot"></span>
              <span>{kw.shortTag}</span>
            </button>
          {/each}
        </div>

        <input
          type="text"
          class="vibe-custom-input font-mono"
          placeholder="+ 自訂調色關鍵字 (例：偏暖、底片顆粒感)..."
          bind:value={darkroomState.customStylePrompt}
        />
      </div>

      {#if onRunAiAnalysis}
        <button
          type="button"
          class="archival-btn-primary w-full ai-main-btn"
          onclick={onRunAiAnalysis}
          disabled={currentIsAiAnalyzing || !activePhoto}
          title="以選定風格與調色關鍵字執行 AI 調色（AI 自動配對 = 由 AI 自行判斷；依職責勾選套用裁切與校正）"
        >
          <span class="material-symbols-outlined" style="font-size: 16px;">
            {currentIsAiAnalyzing ? "progress_activity" : "psychology"}
          </span>
          <span>{currentIsAiAnalyzing ? "正在顯影調校..." : "AI 顯影調色"}</span>
        </button>
      {/if}

      {#if photoPlates.length > 1 && onRequestBatchAi}
        <div class="batch-actions-grid">
          <button
            type="button"
            class="archival-btn-secondary w-full batch-btn font-mono"
            onclick={onRequestBatchAi}
            disabled={currentIsAiAnalyzing}
            title="以目前選定的風格，對所有已標記（或全部）相片循序進行 AI 批次調色"
          >
            <span class="material-symbols-outlined" style="font-size: 14px;">auto_mode</span>
            <span>
              AI 批次調色 ({flaggedCount > 0 ? `${flaggedCount} 張` : `全簿 ${photoPlates.length} 張`})
            </span>
          </button>
        </div>
      {/if}
    {/if}

    {#if onOpenVault}
      <button
        type="button"
        class="vault-trigger-btn font-mono hairline-all"
        onclick={onOpenVault}
      >
        <span class="material-symbols-outlined" style="font-size: 14px;">
          {geminiKeyStatus.exists ? "lock" : "vpn_key"}
        </span>
        <span>
          {geminiKeyStatus.exists
            ? geminiKeyStatus.mode === "password"
              ? "金鑰保險庫 (密碼保護)"
              : geminiKeyStatus.mode === "transparent"
                ? "金鑰保險庫 (透明加密)"
                : "金鑰保險庫 (無加密)"
            : "設定 AI 安全金鑰"}
        </span>
      </button>
    {/if}
  </div>
</div>


<style>


  .ai-assistant-dock {
    margin-top: auto;
    padding-top: 14px;
  }
  .ai-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }
  .ai-sparkle {
    color: var(--amber-highlight);
    font-size: 16px;
  }
  .ai-title {
    font-size: 13px;
    font-weight: 600;
  }
  .ai-desc {
    font-size: 11px;
    color: var(--parchment-dim);
    margin-bottom: 10px;
  }
  .ai-status-card {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    margin-bottom: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ai-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }
  .ai-label {
    color: var(--parchment-dim);
  }
  .ai-val {
    color: var(--parchment-bright);
  }
  .ai-val.amber {
    color: var(--amber-highlight);
  }
  .ai-val.indigo {
    color: var(--primary-indigo);
  }
  .ai-actions-stack {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* LIVE TERMINAL SCAN STREAM HUD STYLES */
  .ai-terminal-box {
    background-color: #0b0d10;
    border-radius: var(--radius-sm);
    overflow: hidden;
    margin-bottom: 10px;
    box-shadow:
      inset 0 2px 8px rgba(0, 0, 0, 0.8),
      0 0 10px rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(226, 157, 82, 0.25);
    user-select: text;
    -webkit-user-select: text;
  }
  .terminal-bar {
    background-color: #12141a;
    padding: 4px 8px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .term-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .term-dot.red {
    background-color: #e06c75;
  }
  .term-dot.amber {
    background-color: #e5c07b;
  }
  .term-dot.green {
    background-color: #98c379;
  }
  .term-title {
    font-size: 8px;
    letter-spacing: 0.08em;
    color: var(--parchment-dim);
    margin-left: 4px;
  }
  .term-stop-btn {
    margin-left: auto;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.45);
    color: #fca5a5;
    font-size: 8px;
    padding: 1px 6px;
    border-radius: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 3px;
    transition: all 0.15s ease;
  }
  .term-stop-btn:hover {
    color: #ffffff;
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.4);
  }
  .term-copy-btn {
    margin-left: 4px;
    background: transparent;
    border: 1px solid rgba(226, 157, 82, 0.2);
    color: var(--parchment-dim);
    font-size: 8px;
    padding: 1px 5px;
    border-radius: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 3px;
    transition: all 0.15s ease;
  }
  .term-copy-btn:hover {
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
    background: rgba(226, 157, 82, 0.08);
  }
  .terminal-body {
    padding: 8px 10px;
    max-height: 120px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    user-select: text;
    -webkit-user-select: text;
  }
  .term-line {
    font-size: 10px;
    line-height: 1.35;
    color: #98c379;
    word-break: break-all;
    user-select: text;
    -webkit-user-select: text;
  }
  .term-line.active {
    color: var(--amber-highlight);
  }
  .term-cursor {
    animation: termBlink 0.8s infinite;
    color: var(--amber-highlight);
  }
  .term-blink {
    animation: termBlink 1s infinite;
  }

  .ai-batch-badge {
    font-size: 8px;
    padding: 1px 4px;
    border-radius: 2px;
    background-color: rgba(226, 157, 82, 0.15);
    border: 1px solid rgba(226, 157, 82, 0.4);
    margin-left: auto;
  }
  .ai-insight-quote {
    background-color: rgba(226, 157, 82, 0.08);
    border-left: 2px solid var(--amber-highlight);
    border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
    padding: 6px 8px;
    margin-bottom: 10px;
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }
  .insight-icon {
    font-size: 13px;
    color: var(--amber-highlight);
    flex-shrink: 0;
    margin-top: 1px;
  }
  .insight-text {
    font-size: 10px;
    color: var(--parchment-muted);
    line-height: 1.35;
  }
  .ai-crop-quote {
    background-color: rgba(94, 234, 212, 0.08);
    border-left: 2px solid var(--emerald-cyan, #5eead4);
    border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
    padding: 6px 8px;
    margin-bottom: 10px;
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }
  .crop-icon {
    font-size: 13px;
    color: var(--emerald-cyan, #5eead4);
    flex-shrink: 0;
    margin-top: 1px;
  }
  .crop-text {
    font-size: 10px;
    color: var(--parchment-muted);
    line-height: 1.35;
  }
  .insight-tag {
    color: var(--amber-highlight);
    font-size: 9px;
  }
  .crop-tag {
    color: var(--emerald-cyan, #5eead4);
    font-size: 9px;
  }

  /* GEMINI 視覺神經標籤樣式 */
  .ai-tags-box {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    margin-bottom: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .chips-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .vision-chip {
    font-size: 10px;
    background-color: var(--canvas-base);
    color: var(--amber-highlight);
    border: 1px solid rgba(226, 157, 82, 0.3);
    border-radius: var(--radius-xs);
    padding: 2px 6px;
  }

  .ai-main-btn {
    background: linear-gradient(
      135deg,
      var(--amber-highlight),
      #d48b3b
    ) !important;
    color: #121214 !important;
    font-weight: 600 !important;
    border: 1px solid rgba(226, 157, 82, 0.9) !important;
    box-shadow: 0 0 14px rgba(226, 157, 82, 0.3);
    transition: all 0.2s ease;
  }
  .ai-main-btn:hover:not(:disabled) {
    filter: brightness(1.1);
    box-shadow: 0 0 18px rgba(226, 157, 82, 0.45);
  }
  .ai-main-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    filter: grayscale(0.5);
    box-shadow: none;
  }

  .style-card-picker {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: rgba(255, 255, 255, 0.02);
  }
  .style-card-picker-header {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: var(--parchment-dim);
  }
  .style-card-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
    max-height: 220px;
    overflow-y: auto;
    padding-right: 2px;
  }
  .style-card {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 5px;
    text-align: left;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.14s ease;
  }
  .style-card:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(226, 157, 82, 0.4);
  }
  .style-card.active {
    background: rgba(212, 140, 52, 0.16);
    border-color: var(--amber-highlight);
  }
  .style-card-swatch {
    display: block;
    height: 80px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .style-card-title {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--parchment-bright);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .style-card.active .style-card-title {
    color: var(--amber-highlight);
  }
  .style-card-badge {
    font-size: 8.5px;
    color: var(--parchment-dim);
  }

  /* 調色意境關鍵字按鈕列樣式 (Vibe Keywords Picker) */
  .vibe-keywords-picker {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: var(--radius-xs);
  }
  .vibe-keywords-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    color: var(--parchment-dim);
  }
  .vibe-header-left {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .vibe-clear-btn {
    background: transparent;
    border: 1px solid rgba(226, 157, 82, 0.35);
    color: var(--amber-highlight);
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.14s ease;
  }
  .vibe-clear-btn:hover {
    background: rgba(226, 157, 82, 0.15);
    border-color: var(--amber-highlight);
  }
  .vibe-chips-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .vibe-keyword-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 7px;
    font-size: 9.5px;
    color: var(--parchment-muted);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.14s ease;
  }
  .vibe-keyword-chip:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(226, 157, 82, 0.45);
    color: var(--parchment-bright);
  }
  .vibe-keyword-chip.active {
    background: rgba(226, 157, 82, 0.16);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    font-weight: 600;
  }
  .vibe-chip-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.25);
    transition: background 0.14s ease;
  }
  .vibe-keyword-chip.active .vibe-chip-dot {
    background: var(--amber-highlight);
    box-shadow: 0 0 6px var(--amber-highlight);
  }
  .vibe-custom-input {
    width: 100%;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 3px;
    padding: 4px 7px;
    font-size: 9.5px;
    color: var(--parchment-bright);
    outline: none;
    transition: border-color 0.15s ease;
  }
  .vibe-custom-input::placeholder {
    color: var(--parchment-dim);
    opacity: 0.7;
  }
  .vibe-custom-input:focus {
    border-color: var(--amber-highlight);
    background: rgba(0, 0, 0, 0.5);
  }
  .batch-actions-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 5px;
    width: 100%;
  }

  .batch-btn {
    font-size: 9.5px !important;
    padding: 5px 6px !important;
  }
  .vault-trigger-btn {
    background: transparent;
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-sm);
    color: var(--parchment-muted);
    font-size: 10px;
    padding: 5px 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .vault-trigger-btn:hover {
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    background-color: var(--surface-elevated);
  }

  /* AI SCOPE RESPONSIBILITY SELECTOR */
  .ai-scope-card {
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-sm);
    overflow: hidden;
    margin-bottom: 8px;
  }
  .ai-scope-toggle-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    background: transparent;
    border: none;
    color: var(--parchment-bright);
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .ai-scope-toggle-btn:hover {
    background-color: var(--surface-elevated);
  }
  .scope-header-left {
    display: flex;
    align-items: center;
    gap: 6px;
    letter-spacing: 0.04em;
  }
  .scope-chevron {
    font-size: 16px;
    color: var(--parchment-dim);
    transition: transform 0.2s ease;
  }
  .ai-scope-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px 10px;
    background-color: var(--canvas-base);
    border-top: 1px solid var(--hairline-slate);
    font-size: 10.5px;
  }
  .scope-checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--parchment-muted);
    cursor: pointer;
    user-select: none;
    transition: color 0.15s ease;
  }
  .scope-checkbox-row:hover {
    color: var(--parchment-bright);
  }
  .scope-checkbox-row input[type="checkbox"] {
    accent-color: var(--amber-highlight);
    cursor: pointer;
    width: 13px;
    height: 13px;
  }
</style>
