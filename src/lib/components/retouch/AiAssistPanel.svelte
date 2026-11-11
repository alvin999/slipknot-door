<script lang="ts">
  import { aiPipeline } from "$lib/stores/aiPipeline.svelte";
  import { darkroomState } from "$lib/stores/darkroomState.svelte";
  import { photoLibrary } from "$lib/stores/photoLibrary.svelte";
  import { STYLE_KEYWORD_ENTRIES } from "$lib/services/ai/styleDirectives";
  import {
    AI_PANEL_UI_STORAGE_KEY,
    DEFAULT_AI_PANEL_UI_STATE,
    readLocalJson,
    updateLocalJson,
  } from "$lib/utils/panelStorage";

  interface Props {
    styleGradingPresets: any[];
    stylePreviewThumbs?: Record<string, string>;
    geminiKeyStatus: { exists: boolean; mode: string | null };
    activePhoto?: any;
    photos?: any[];
    hasAiBaseline?: boolean;
    isModifiedFromAi?: boolean;
    onRestoreAiTuning?: () => void;
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
    onApplyProfile?: (profileId: string) => void;
  }

  let {
    styleGradingPresets = [],
    stylePreviewThumbs = {},
    geminiKeyStatus = { exists: false, mode: null },
    activePhoto: propsActivePhoto = null,
    photos: propsPhotos = [],
    hasAiBaseline = false,
    isModifiedFromAi = false,
    onRestoreAiTuning,
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
    onApplyProfile,
  }: Props = $props();

  let terminalBodyElement = $state<HTMLDivElement | null>(null);
  let isProcessLogOpen = $state<boolean>(false);
  let isExpandedStyles = $state<boolean>(
    Boolean(
      readLocalJson(AI_PANEL_UI_STORAGE_KEY, DEFAULT_AI_PANEL_UI_STATE)
        .isExpandedStyles,
    ),
  );

  const activePhoto = $derived(propsActivePhoto ?? photoLibrary.activePhoto);
  const photoPlates = $derived(
    propsPhotos?.length ? propsPhotos : photoLibrary.photoPlates,
  );
  const flaggedCount = $derived(
    photoPlates.filter((p: any) => p.flagged).length ||
      photoLibrary.flaggedCount,
  );

  const currentIsAiAnalyzing = $derived(
    propsIsAiAnalyzing ?? aiPipeline.isAiAnalyzing,
  );
  const currentIsBatchRunning = $derived(
    propsIsBatchAiRunning ?? aiPipeline.isBatchAiRunning,
  );
  const currentBatchProgress = $derived(
    propsBatchProgress ?? aiPipeline.batchProgress,
  );
  const currentLogs = $derived(
    propsAiTerminalLogs ?? aiPipeline.aiTerminalLogs,
  );
  const currentSceneTitle = $derived(
    propsAiSceneTitle ?? aiPipeline.aiSceneTitle,
  );
  const currentSuggestedScene = $derived(
    propsAiSuggestedScene ?? aiPipeline.aiSuggestedScene,
  );
  const currentRecommendedMood = $derived(
    propsAiRecommendedMood ?? aiPipeline.aiRecommendedMood,
  );
  const currentStyleInsight = $derived(
    propsAiStyleInsight ?? aiPipeline.aiStyleInsight,
  );
  const currentCropRationale = $derived(
    propsAiCropRationale ?? darkroomState.aiCropRationale,
  );
  const currentVisionTags = $derived(
    propsAiVisionTags ?? aiPipeline.aiVisionTags,
  );
  const currentAiScope = $derived(propsAiScope ?? aiPipeline.aiScope);
  const aiScopeActiveCount = $derived(
    [
      currentAiScope?.lutProfile,
      currentAiScope?.crop,
      currentAiScope?.keystone,
      currentAiScope?.tone,
      currentAiScope?.whiteBalance,
      currentAiScope?.filmPhysics !== false,
    ].filter(Boolean).length,
  );
  const currentIsScopeOpen = $derived(
    propsIsAiScopeOpen ?? aiPipeline.isAiScopeOpen,
  );
  const currentCopiedNotice = $derived(
    propsCopiedLogNotice ?? aiPipeline.copiedLogNotice,
  );
  const latestLogSummary = $derived.by(() => {
    if (!currentLogs.length) return "";
    const last = currentLogs[currentLogs.length - 1] || "";
    const firstLine = last.split("\n")[0].trim();
    if (!firstLine || /^-+$/.test(firstLine)) return "AI 顯影作業中...";
    return firstLine.replace(/^>\s*(\[[^\]]+\]\s*)?/, "").trim();
  });

  // 當有新日誌時自動捲動日誌匣底部
  $effect(() => {
    if (isProcessLogOpen && currentLogs.length && terminalBodyElement) {
      terminalBodyElement.scrollTop = terminalBodyElement.scrollHeight;
    }
  });

  // 純視覺呈現之去識別化風格範例輪播
  const VIBE_PROMPT_SAMPLES = [
    "清透冷青調、低反差柔和感、微抬暗部...",
    "溫潤暖金膠片色調、高光柔順、膚色通透...",
    "高對比冷暖分離、深青暗部配暖橘高光...",
    "懷舊泛黃復古相紙、啞光抬黑與細緻顆粒...",
    "極簡低飽和灰階調性、平緩高光壓縮...",
    "濃郁沉穩暗調氛圍、深邃黑階、邊緣微暗角...",
  ];
  let sampleIndex = $state(0);
  let isCustomInputFocused = $state(false);
  const activeCustomSample = $derived(VIBE_PROMPT_SAMPLES[sampleIndex]);
  const hasCustomPrompt = $derived(
    Boolean(darkroomState.customStylePrompt.trim()),
  );

  $effect(() => {
    if (hasCustomPrompt || isCustomInputFocused) return;
    const timer = setInterval(() => {
      sampleIndex = (sampleIndex + 1) % VIBE_PROMPT_SAMPLES.length;
    }, 3500);
    return () => clearInterval(timer);
  });

  function applyRandomVibeSample() {
    const nextIdx = (sampleIndex + 1) % VIBE_PROMPT_SAMPLES.length;
    sampleIndex = nextIdx;
    darkroomState.customStylePrompt = VIBE_PROMPT_SAMPLES[nextIdx].replace(
      /\.\.\.$/,
      "",
    );
  }
</script>

<div class="ai-assistant-dock">
  <div class="ai-header">
    <span class="material-symbols-outlined ai-sparkle">auto_awesome</span>
    <span class="font-headline ai-title">AI 顯影調色</span>
    {#if currentIsBatchRunning}
      <span class="ai-batch-badge font-mono amber">BATCH RUNNING</span>
    {/if}
  </div>
  <p class="ai-desc">Gemini 視覺多模態 · 智慧光學顯影</p>

  <!-- 暗房風格可收合 AI 顯影過程紀錄匣（常駐保留一列供隨時展開檢視） -->
  <div class="ai-terminal-box hairline-all font-mono">
    <div class="terminal-bar" class:hairline-b={isProcessLogOpen}>
      <button
        type="button"
        class="term-toggle-btn font-mono"
        onclick={() => (isProcessLogOpen = !isProcessLogOpen)}
        title={isProcessLogOpen
          ? "收合 AI 顯影過程紀錄"
          : "展開完整 AI 顯影過程紀錄"}
        aria-expanded={isProcessLogOpen}
      >
        <span
          class="term-status-dot"
          class:is-idle={currentLogs.length === 0 &&
            !currentIsAiAnalyzing &&
            !currentIsBatchRunning}
          class:is-active={currentIsAiAnalyzing || currentIsBatchRunning}
        ></span>
        <span class="term-title">
          {#if currentLogs.length === 0 && !currentIsAiAnalyzing && !currentIsBatchRunning}
            AI 顯影紀錄 · 待機中（尚無紀錄）
          {:else if isProcessLogOpen}
            AI 顯影紀錄 ({currentLogs.length})
          {:else}
            {latestLogSummary || "AI 顯影紀錄"}
          {/if}
        </span>
      </button>

      <div class="term-bar-actions">
        {#if currentIsBatchRunning && onCancelBatchAi}
          <button
            type="button"
            class="term-stop-btn font-mono"
            title="立即手動中止 AI 批次顯影"
            onclick={onCancelBatchAi}
          >
            <span class="material-symbols-outlined" style="font-size: 11px;"
              >stop_circle</span
            >
            <span>停止</span>
          </button>
        {/if}
        {#if currentLogs.length > 0}
          <button
            type="button"
            class="term-copy-btn font-mono"
            title="複製所有顯影紀錄"
            onclick={() =>
              onCopyTerminalLogs
                ? onCopyTerminalLogs()
                : aiPipeline.copyTerminalLogs()}
          >
            <span class="material-symbols-outlined" style="font-size: 11px;">
              {currentCopiedNotice ? "check" : "content_copy"}
            </span>
            <span>{currentCopiedNotice ? "已複製" : "複製"}</span>
          </button>
        {/if}
        <button
          type="button"
          class="term-expand-btn"
          onclick={() => (isProcessLogOpen = !isProcessLogOpen)}
          title={isProcessLogOpen ? "收合紀錄" : "展開紀錄"}
          aria-label={isProcessLogOpen ? "收合紀錄" : "展開紀錄"}
        >
          <span
            class="material-symbols-outlined"
            style="font-size: 14px;"
            style:transform={isProcessLogOpen ? "rotate(180deg)" : "none"}
          >
            expand_more
          </span>
        </button>
      </div>
    </div>

    {#if isProcessLogOpen}
      <div class="terminal-body custom-scroll" bind:this={terminalBodyElement}>
        {#if currentLogs.length === 0 && !currentIsAiAnalyzing && !currentIsBatchRunning}
          <div class="term-line empty">
            尚未執行本次 AI 顯影，點擊「一鍵 AI」或「AI
            顯影調色」後將在此紀錄場景判讀與參數套用明細。
          </div>
        {:else}
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
        {/if}
      </div>
    {/if}
  </div>

  <!-- STATUS & INSIGHT SUMMARY CARD (始終常駐保留清晰資訊標籤) -->
  <div class="ai-status-card hairline-all">
    <div class="ai-row">
      <span class="ai-label font-mono">場景</span>
      <span class="ai-val font-mono"
        >{currentSceneTitle || currentSuggestedScene}</span
      >
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
        <strong class="insight-tag font-mono"
          >後製理念 //
        </strong>{currentStyleInsight}
      </div>
    </div>
  {/if}

  <!-- AI 構圖裁切理由與診斷 Label -->
  {#if currentCropRationale}
    <div class="ai-crop-quote hairline-all font-body">
      <span class="material-symbols-outlined crop-icon">crop</span>
      <div class="crop-text">
        <strong class="crop-tag font-mono"
          >AI 裁切構圖理念 //
        </strong>{currentCropRationale}
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
      onclick={() =>
        onToggleIsAiScopeOpen
          ? onToggleIsAiScopeOpen()
          : aiPipeline.toggleAiScopeOpen()}
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
          AI 職責範圍勾選 ({aiScopeActiveCount}/6)
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
            onchange={() =>
              onToggleAiScope
                ? onToggleAiScope("lutProfile")
                : aiPipeline.toggleAiScope("lutProfile")}
          />
          <span>3D LUT 風格推薦</span>
        </label>
        <label class="scope-checkbox-row">
          <input
            type="checkbox"
            checked={currentAiScope.crop}
            onchange={() =>
              onToggleAiScope
                ? onToggleAiScope("crop")
                : aiPipeline.toggleAiScope("crop")}
          />
          <span>智慧構圖與裁切</span>
        </label>
        <label class="scope-checkbox-row">
          <input
            type="checkbox"
            checked={currentAiScope.keystone}
            onchange={() =>
              onToggleAiScope
                ? onToggleAiScope("keystone")
                : aiPipeline.toggleAiScope("keystone")}
          />
          <span>梯形與水平校正</span>
        </label>
        <label class="scope-checkbox-row">
          <input
            type="checkbox"
            checked={currentAiScope.tone}
            onchange={() =>
              onToggleAiScope
                ? onToggleAiScope("tone")
                : aiPipeline.toggleAiScope("tone")}
          />
          <span>基礎光影與動態</span>
        </label>
        <label class="scope-checkbox-row">
          <input
            type="checkbox"
            checked={currentAiScope.whiteBalance}
            onchange={() =>
              onToggleAiScope
                ? onToggleAiScope("whiteBalance")
                : aiPipeline.toggleAiScope("whiteBalance")}
          />
          <span>自動色溫與色偏</span>
        </label>
        <label class="scope-checkbox-row">
          <input
            type="checkbox"
            checked={currentAiScope.filmPhysics !== false}
            onchange={() =>
              onToggleAiScope
                ? onToggleAiScope("filmPhysics")
                : aiPipeline.toggleAiScope("filmPhysics")}
          />
          <span>分區調色與底片質感</span>
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
        <span class="material-symbols-outlined" style="font-size: 16px;"
          >cancel</span
        >
        <span>
          中止 AI 批次顯影 ({currentBatchProgress?.current ||
            1}/{currentBatchProgress?.total || 1})
        </span>
      </button>
    {:else}
      <!-- AI 風格調色：先選風格（卡片列，Hover 即時預覽），再按下執行 -->
      <div class="style-card-picker hairline-all font-mono">
        <div class="style-card-picker-header">
          <div class="header-left">
            <span
              class="material-symbols-outlined"
              style="font-size: 13px; color: var(--amber-highlight);"
            >
              palette
            </span>
            <span>選擇風格（Hover 預覽）</span>
            <span class="picker-count font-mono"
              >{styleGradingPresets.length}</span
            >
          </div>
          <button
            type="button"
            class="expand-toggle-btn font-mono"
            onclick={() => {
              isExpandedStyles = !isExpandedStyles;
              updateLocalJson(
                AI_PANEL_UI_STORAGE_KEY,
                DEFAULT_AI_PANEL_UI_STATE,
                {
                  isExpandedStyles,
                },
              );
            }}
            title={isExpandedStyles ? "切換為捲軸檢視" : "展開全部 12 款風格"}
          >
            <span>{isExpandedStyles ? "收合" : "展開全部"}</span>
            <span class="material-symbols-outlined" style="font-size: 13px;">
              {isExpandedStyles ? "unfold_less" : "unfold_more"}
            </span>
          </button>
        </div>
        <div class="style-output-sync-bar font-mono">
          <span class="style-output-sync-label">顯影輸出</span>
          <div
            class="style-output-sync-switch"
            role="group"
            aria-label="顯影輸出色彩模式"
          >
            <button
              type="button"
              class="style-output-sync-btn"
              class:active={!darkroomState.monochrome}
              onclick={() => {
                if (darkroomState.monochrome) {
                  darkroomState.monochrome = false;
                  darkroomState.recordSnapshot(true);
                }
              }}
              title="標準彩色 3D LUT 顯影管線"
            >
              <span class="sync-dot color"></span>
              <span>彩色 COLOR</span>
            </button>
            <button
              type="button"
              class="style-output-sync-btn"
              class:active={darkroomState.monochrome}
              onclick={() => {
                if (!darkroomState.monochrome) {
                  darkroomState.monochrome = true;
                  darkroomState.recordSnapshot(true);
                }
              }}
              title="黑白暗房管線（保留上方所選 LUT 階調曲線，並與右側面板同步）"
            >
              <span class="sync-dot mono"></span>
              <span>黑白 B&W</span>
            </button>
          </div>
        </div>
        <div
          class="style-card-row custom-scroll"
          class:is-expanded={isExpandedStyles}
        >
          {#each styleGradingPresets as preset}
            <button
              type="button"
              class="style-card"
              class:active={darkroomState.activeStylePreset === preset.key}
              title={preset.subtitle}
              onclick={() => {
                if (onHoverProfile) onHoverProfile(null);
                darkroomState.activeStylePreset = preset.key;
                if (preset.profileId && onApplyProfile) {
                  onApplyProfile(preset.profileId);
                }
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
                class:is-mono={darkroomState.monochrome &&
                  preset.key !== "auto"}
                style:background={stylePreviewThumbs[preset.key]
                  ? `center / cover no-repeat url(${stylePreviewThumbs[preset.key]})`
                  : preset.key === "auto"
                    ? "linear-gradient(135deg, #e29d52, #6082b6 55%, #3aa8a8)"
                    : preset.accent}
              >
                {#if preset.key === "auto"}
                  <span
                    class="material-symbols-outlined"
                    style="font-size: 28px; color: #fff;"
                  >
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
            <span>調色意境關鍵字</span>
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

        {#if darkroomState.selectedStyleKeywords.length > 0}
          <div class="style-labels-list">
            {#each darkroomState.selectedStyleKeywords as kwId}
              {@const entry = STYLE_KEYWORD_ENTRIES.find((k) => k.id === kwId)}
              {@const isEditing = darkroomState.editingKeywordId === kwId}
              {@const isOverridden =
                darkroomState.keywordOverrides[kwId] !== undefined}
              {#if entry}
                <div class="style-label-card" class:is-editing={isEditing}>
                  <div class="label-card-head font-mono">
                    <div class="label-badge-group">
                      <span class="label-card-badge">{entry.shortTag}</span>
                      {#if isOverridden}
                        <span class="label-custom-indicator">已修改</span>
                      {/if}
                    </div>
                    <div class="label-card-actions">
                      {#if isEditing}
                        <button
                          type="button"
                          class="label-action-btn primary font-mono"
                          onclick={() => darkroomState.stopEditingKeyword()}
                        >
                          完成
                        </button>
                        <button
                          type="button"
                          class="label-action-btn font-mono"
                          onclick={() =>
                            darkroomState.resetKeywordOverride(kwId)}
                        >
                          還原
                        </button>
                      {:else}
                        <button
                          type="button"
                          class="label-action-btn font-mono"
                          onclick={() =>
                            darkroomState.startEditingKeyword(kwId)}
                        >
                          編輯
                        </button>
                        {#if isOverridden}
                          <button
                            type="button"
                            class="label-action-btn font-mono"
                            onclick={() =>
                              darkroomState.resetKeywordOverride(kwId)}
                          >
                            還原
                          </button>
                        {/if}
                        <button
                          type="button"
                          class="label-action-btn remove font-mono"
                          onclick={() => darkroomState.removeStyleKeyword(kwId)}
                          title="移除此標籤"
                        >
                          ✕
                        </button>
                      {/if}
                    </div>
                  </div>
                  {#if isEditing}
                    <textarea
                      class="label-edit-textarea font-mono"
                      rows="3"
                      value={darkroomState.getKeywordDirective(kwId)}
                      oninput={(e) =>
                        darkroomState.updateKeywordOverride(
                          kwId,
                          (e.target as HTMLTextAreaElement).value,
                        )}></textarea>
                  {:else}
                    <div class="label-directive-display font-mono">
                      {darkroomState.getKeywordDirective(kwId)}
                    </div>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        <div
          class="vibe-command-box"
          class:has-prompt={hasCustomPrompt}
          class:is-focused={isCustomInputFocused}
        >
          <span class="material-symbols-outlined vibe-command-icon"
            >auto_awesome</span
          >
          <div class="vibe-command-body">
            <textarea
              class="vibe-custom-input font-mono"
              rows="2"
              placeholder={activeCustomSample}
              bind:value={darkroomState.customStylePrompt}
              onfocus={() => (isCustomInputFocused = true)}
              onblur={() => (isCustomInputFocused = false)}></textarea>
            <div class="vibe-command-footer font-mono">
              <span class="vibe-intent-status" class:active={hasCustomPrompt}>
                {#if hasCustomPrompt}
                  ✦ 自訂意境
                {/if}
              </span>
              <button
                type="button"
                class="vibe-sample-btn font-mono"
                onclick={applyRandomVibeSample}
                title="填入視覺風格範例"
              >
                <span class="material-symbols-outlined" style="font-size: 11px;"
                  >casino</span
                >
                <span>試試範例</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {#if onRunAiAnalysis}
        <button
          type="button"
          class="archival-btn-primary w-full ai-main-btn"
          class:custom-driven={hasCustomPrompt}
          onclick={onRunAiAnalysis}
          disabled={currentIsAiAnalyzing || !activePhoto}
          title="以選定風格與調色關鍵字執行 AI 調色（AI 自動配對 = 由 AI 自行判斷；依職責勾選套用裁切與校正）"
        >
          <span class="material-symbols-outlined" style="font-size: 16px;">
            {currentIsAiAnalyzing
              ? "progress_activity"
              : hasCustomPrompt
                ? "auto_awesome"
                : "psychology"}
          </span>
          <span>
            {currentIsAiAnalyzing
              ? "正在顯影調校..."
              : hasCustomPrompt
                ? "依自訂意境顯影"
                : "AI 顯影調色"}
          </span>
        </button>
      {/if}

      {#if hasAiBaseline && onRestoreAiTuning}
        <div class="ai-revert-bar font-mono hairline-all">
          <div class="revert-info">
            <span
              class="material-symbols-outlined"
              style="font-size: 14px; color: {isModifiedFromAi
                ? 'var(--amber-highlight)'
                : 'var(--sage-soft)'};"
            >
              {isModifiedFromAi ? "tune" : "check_circle"}
            </span>
            <span
              >{isModifiedFromAi ? "已手動微調參數" : "維持 AI 顯影設定"}</span
            >
          </div>
          {#if isModifiedFromAi}
            <button
              type="button"
              class="revert-chip-btn font-mono"
              onclick={onRestoreAiTuning}
              title="捨棄手動微調，復原為 AI 顯影調色基準"
            >
              <span class="material-symbols-outlined" style="font-size: 12px;"
                >settings_backup_restore</span
              >
              <span>還原 AI</span>
            </button>
          {/if}
        </div>
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
            <span class="material-symbols-outlined" style="font-size: 14px;"
              >auto_mode</span
            >
            <span>
              AI 批次調色 ({flaggedCount > 0
                ? `${flaggedCount} 張`
                : `全簿 ${photoPlates.length} 張`})
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
    display: flex;
    flex-direction: column;
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

  /* 暗房風格可收合 AI 顯影日誌匣 (取代突兀的黑底終端機) */
  .ai-terminal-box {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    overflow: hidden;
    margin-bottom: 10px;
    border: 1px solid var(--hairline-slate);
    user-select: text;
    -webkit-user-select: text;
  }
  .terminal-bar {
    background-color: rgba(255, 255, 255, 0.025);
    padding: 5px 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .term-toggle-btn {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    text-align: left;
    color: var(--parchment-muted);
  }
  .term-toggle-btn:hover .term-title {
    color: var(--parchment-bright);
  }
  .term-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--amber-highlight);
    opacity: 0.7;
    flex-shrink: 0;
  }
  .term-status-dot.is-idle {
    background-color: var(--parchment-dim);
    opacity: 0.5;
  }
  .term-status-dot.is-active {
    opacity: 1;
    box-shadow: 0 0 6px var(--amber-highlight);
    animation: termBlink 1s infinite;
  }
  .term-title {
    font-size: 10px;
    letter-spacing: 0.03em;
    color: var(--parchment-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .term-bar-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .term-stop-btn {
    background: rgba(239, 68, 68, 0.14);
    border: 1px solid rgba(239, 68, 68, 0.45);
    color: #fca5a5;
    font-size: 9px;
    padding: 2px 6px;
    border-radius: var(--radius-xs);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 3px;
    transition: all 0.15s ease;
  }
  .term-stop-btn:hover {
    color: #ffffff;
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.35);
  }
  .term-copy-btn {
    background: transparent;
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-dim);
    font-size: 9px;
    padding: 2px 6px;
    border-radius: var(--radius-xs);
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
  .term-expand-btn {
    background: transparent;
    border: none;
    color: var(--parchment-dim);
    padding: 0 2px;
    display: flex;
    align-items: center;
    cursor: pointer;
    transition: color 0.15s ease;
  }
  .term-expand-btn:hover {
    color: var(--amber-highlight);
  }
  .term-expand-btn .material-symbols-outlined {
    transition: transform 0.18s ease;
  }
  .terminal-body {
    padding: 8px 10px;
    max-height: 130px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    background-color: rgba(10, 11, 14, 0.45);
    user-select: text;
    -webkit-user-select: text;
  }
  .term-line {
    font-size: 10px;
    line-height: 1.4;
    color: var(--parchment-muted);
    word-break: break-word;
    user-select: text;
    -webkit-user-select: text;
  }
  .term-line.empty {
    color: var(--parchment-dim);
    line-height: 1.45;
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
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: var(--radius-sm);
  }
  .style-card-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    color: var(--parchment-dim);
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .picker-count {
    background: var(--surface-overlay);
    color: var(--amber-highlight);
    padding: 1px 5px;
    border-radius: var(--radius-xs);
    font-size: 9px;
  }
  .expand-toggle-btn {
    background: transparent;
    border: none;
    color: var(--parchment-muted);
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 2px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: var(--radius-xs);
    transition: all 0.15s ease;
  }
  .expand-toggle-btn:hover {
    color: var(--amber-highlight);
    background: rgba(212, 163, 115, 0.12);
  }
  .style-output-sync-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 4px 6px;
    background: rgba(12, 13, 16, 0.45);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-xs);
  }
  .style-output-sync-label {
    font-size: 9.5px;
    letter-spacing: 0.06em;
    color: var(--parchment-dim);
    white-space: nowrap;
  }
  .style-output-sync-switch {
    display: inline-flex;
    gap: 2px;
    background: var(--surface-panel);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-xs);
    padding: 2px;
  }
  .style-output-sync-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border: 1px solid transparent;
    border-radius: calc(var(--radius-xs) - 1px);
    background: transparent;
    color: var(--parchment-dim);
    font-size: 9.5px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }
  .style-output-sync-btn:hover {
    color: var(--parchment-bright);
  }
  .style-output-sync-btn.active {
    background: var(--surface-overlay);
    border-color: var(--amber-highlight);
    color: var(--parchment-bright);
  }
  .sync-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .sync-dot.color {
    background: conic-gradient(#e05555, #d9bd45, #52b365, #4e79d9, #e05555);
  }
  .sync-dot.mono {
    background: linear-gradient(135deg, #f3f4f6 0%, #9ca3af 50%, #1f2937 100%);
    border: 1px solid rgba(255, 255, 255, 0.35);
  }
  .style-card-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    max-height: 380px;
    overflow-y: auto;
    padding-right: 2px;
    transition: max-height 0.25s ease;
  }
  .style-card-row.is-expanded {
    max-height: none;
    overflow-y: visible;
  }
  .style-card {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    text-align: left;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .style-card:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(226, 157, 82, 0.5);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  }
  .style-card.active {
    background: rgba(212, 140, 52, 0.16);
    border-color: var(--amber-highlight);
    box-shadow:
      0 0 0 1px var(--amber-highlight),
      0 4px 12px rgba(0, 0, 0, 0.4);
  }
  .style-card-swatch {
    display: block;
    height: 90px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    transition: filter 0.2s ease;
  }
  .style-card-swatch.is-mono {
    filter: grayscale(1) contrast(1.06);
  }
  .style-card-title {
    font-size: 11px;
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
    font-size: 9px;
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
  .style-labels-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }
  .style-label-card {
    background: rgba(0, 0, 0, 0.38);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 3px;
    padding: 5px 7px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: border-color 0.15s ease;
  }
  .style-label-card.is-editing {
    border-color: var(--amber-highlight);
    background: rgba(0, 0, 0, 0.55);
  }
  .label-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 8.5px;
  }
  .label-badge-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .label-card-badge {
    color: var(--amber-highlight);
    font-weight: 600;
    font-size: 9px;
  }
  .label-custom-indicator {
    color: var(--parchment-dim);
    font-size: 8px;
  }
  .label-card-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .label-action-btn {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 2px;
    padding: 1px 4px;
    font-size: 8px;
    color: var(--parchment-bright);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .label-action-btn:hover {
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
  }
  .label-action-btn.primary {
    background: rgba(255, 179, 0, 0.15);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
  }
  .label-action-btn.remove:hover {
    border-color: #e57373;
    color: #e57373;
  }
  .label-directive-display {
    font-size: 9.5px;
    line-height: 1.45;
    color: var(--parchment-bright);
    word-break: break-word;
    white-space: pre-wrap;
    user-select: text;
  }
  .label-edit-textarea {
    width: 100%;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid var(--amber-highlight);
    border-radius: 2px;
    padding: 4px 6px;
    font-size: 9.5px;
    line-height: 1.4;
    color: var(--parchment-bright);
    outline: none;
    resize: vertical;
  }
  .vibe-command-box {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 7px 5px;
    background: rgba(0, 0, 0, 0.36);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      background 0.18s ease;
  }
  .vibe-command-box.is-focused,
  .vibe-command-box.has-prompt {
    border-color: rgba(226, 157, 82, 0.65);
    background: rgba(0, 0, 0, 0.52);
    box-shadow:
      0 0 0 1px rgba(226, 157, 82, 0.18),
      0 0 12px rgba(226, 157, 82, 0.08);
  }
  .vibe-command-icon {
    font-size: 14px;
    margin-top: 2px;
    color: var(--parchment-dim);
    opacity: 0.7;
    transition:
      color 0.18s ease,
      opacity 0.18s ease,
      filter 0.18s ease;
    flex-shrink: 0;
  }
  .vibe-command-box.is-focused .vibe-command-icon,
  .vibe-command-box.has-prompt .vibe-command-icon {
    color: var(--amber-highlight);
    opacity: 1;
    filter: drop-shadow(0 0 4px rgba(226, 157, 82, 0.55));
  }
  .vibe-command-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .vibe-custom-input {
    width: 100%;
    box-sizing: border-box;
    background: transparent;
    border: none;
    padding: 0;
    font-size: 10px;
    line-height: 1.45;
    color: var(--parchment-bright);
    outline: none;
    resize: vertical;
    min-height: 34px;
  }
  .vibe-custom-input::placeholder {
    color: var(--parchment-dim);
    opacity: 0.72;
  }
  .vibe-command-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px dashed rgba(255, 255, 255, 0.07);
  }
  .vibe-intent-status {
    font-size: 8.5px;
    color: var(--amber-highlight);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .vibe-sample-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 5px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 3px;
    color: var(--parchment-muted);
    font-size: 8.5px;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.14s ease;
  }
  .vibe-sample-btn:hover {
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    background: rgba(226, 157, 82, 0.12);
  }
  .ai-main-btn.custom-driven {
    box-shadow: 0 0 14px rgba(226, 157, 82, 0.28);
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
  .ai-revert-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: var(--surface-elevated);
    border-radius: var(--radius-sm);
    margin-top: 6px;
    font-size: 11px;
  }
  .revert-info {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--parchment-dim);
  }
  .revert-chip-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    background: rgba(229, 142, 38, 0.12);
    border: 1px solid var(--amber-highlight);
    border-radius: var(--radius-xs);
    color: var(--amber-highlight);
    cursor: pointer;
    font-size: 10px;
    transition: all 0.15s ease;
  }
  .revert-chip-btn:hover {
    background: var(--amber-highlight);
    color: var(--canvas-base);
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
