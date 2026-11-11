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
  let isReportExpanded = $state<boolean>(true);
  let isKeywordDirectivesOpen = $state<boolean>(false);
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

  const SCOPE_ITEMS: { key: string; label: string; short: string; icon: string }[] = [
    { key: "lutProfile", label: "3D LUT 風格推薦", short: "LUT", icon: "palette" },
    { key: "tone", label: "基礎光影與動態", short: "光影", icon: "tonality" },
    { key: "whiteBalance", label: "自動色溫與色偏", short: "白平衡", icon: "thermostat" },
    { key: "filmPhysics", label: "分區調色與底片質感", short: "底片質感", icon: "grain" },
    { key: "crop", label: "智慧構圖與裁切", short: "構圖裁切", icon: "crop" },
    { key: "keystone", label: "梯形與水平校正", short: "水平透視", icon: "straighten" },
  ];

  function isScopeEnabled(key: string): boolean {
    if (!currentAiScope) return true;
    if (key === "filmPhysics") return currentAiScope.filmPhysics !== false;
    return Boolean(currentAiScope[key]);
  }

  const aiScopeActiveCount = $derived(
    SCOPE_ITEMS.filter((item) => isScopeEnabled(item.key)).length,
  );

  const activeScopeSummary = $derived(
    SCOPE_ITEMS.filter((item) => isScopeEnabled(item.key))
      .map((i) => i.short)
      .join(" · "),
  );

  const currentIsScopeOpen = $derived(
    propsIsAiScopeOpen ?? aiPipeline.isAiScopeOpen,
  );
  const currentCopiedNotice = $derived(
    propsCopiedLogNotice ?? aiPipeline.copiedLogNotice,
  );

  // 將 Profile ID 轉為易讀的中文風格名稱
  const readableProfileName = $derived.by(() => {
    if (!activePhoto?.appliedProfile) return "尚未載入";
    const pid = activePhoto.appliedProfile;
    const found = styleGradingPresets.find((p) => p.profileId === pid);
    if (found) return found.title || found.shortLabel;
    return pid.replace(/^Profile_\d+_/, "");
  });

  // 當前選中的風格預設物件
  const selectedPresetObj = $derived(
    styleGradingPresets.find((p) => p.key === darkroomState.activeStylePreset) ||
      styleGradingPresets[0],
  );

  // 判斷是否已有 AI 判讀結果可展示
  const hasAiReportData = $derived(
    Boolean(
      currentSceneTitle ||
        (currentSuggestedScene && currentSuggestedScene !== "等待判讀") ||
        currentStyleInsight ||
        currentCropRationale ||
        currentVisionTags.length > 0,
    ),
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
  <!-- 頂部標題與金鑰狀態列 -->
  <header class="ai-top-bar hairline-b">
    <div class="ai-brand-row">
      <div class="ai-title-group">
        <span class="material-symbols-outlined ai-sparkle">auto_awesome</span>
        <span class="font-headline ai-title">AI 顯影調色</span>
        {#if currentIsBatchRunning}
          <span class="ai-batch-badge font-mono amber">BATCH</span>
        {/if}
      </div>

      {#if onOpenVault}
        <button
          type="button"
          class="vault-pill-btn font-mono"
          class:has-key={geminiKeyStatus.exists}
          onclick={onOpenVault}
          title={geminiKeyStatus.exists
            ? geminiKeyStatus.mode === "password"
              ? "金鑰保險庫 (密碼保護) · 點擊管理"
              : geminiKeyStatus.mode === "transparent"
                ? "金鑰保險庫 (透明加密) · 點擊管理"
                : "金鑰保險庫 (已就緒) · 點擊管理"
            : "尚未設定 AI 金鑰 · 點擊設定"}
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">
            {geminiKeyStatus.exists ? "verified_user" : "vpn_key"}
          </span>
          <span>{geminiKeyStatus.exists ? "金鑰就緒" : "設定金鑰"}</span>
        </button>
      {/if}
    </div>
    <p class="ai-subtitle">
      選取風格與意境，一鍵執行光學判讀與暗房調校
    </p>
  </header>

  <!-- 中央可捲動設定與判讀內容區 -->
  <div class="ai-scroll-body custom-scroll">
    <!-- ══════════════════════════════════════════════════════════════════
         區塊 A：AI 顯影判讀報告（當正在分析或已有判讀結果時，自動置頂呈現）
         ══════════════════════════════════════════════════════════════════ -->
    {#if currentIsAiAnalyzing || currentIsBatchRunning || hasAiReportData}
      <section
        class="ai-report-card hairline-all"
        class:is-analyzing={currentIsAiAnalyzing || currentIsBatchRunning}
      >
        <div class="report-card-header">
          <button
            type="button"
            class="report-toggle-title"
            onclick={() => (isReportExpanded = !isReportExpanded)}
            aria-expanded={isReportExpanded}
          >
            <span
              class="report-status-dot"
              class:active={currentIsAiAnalyzing || currentIsBatchRunning}
            ></span>
            <span class="report-heading font-mono">
              {#if currentIsAiAnalyzing || currentIsBatchRunning}
                AI 正在判讀顯影中...
              {:else}
                AI 顯影判讀報告
              {/if}
            </span>
            {#if currentRecommendedMood && !currentIsAiAnalyzing}
              <span class="mood-pill font-mono">⚡ {currentRecommendedMood}</span>
            {/if}
            <span
              class="material-symbols-outlined report-chevron"
              style:transform={isReportExpanded ? "rotate(180deg)" : "none"}
            >
              expand_more
            </span>
          </button>
        </div>

        {#if isReportExpanded}
          <div class="report-card-body">
            <!-- 核心診斷摘要：場景 + 套用風格 -->
            <div class="report-summary-grid">
              <div class="summary-cell">
                <span class="summary-label font-mono">判讀場景</span>
                <span class="summary-value font-headline">
                  {currentSceneTitle || currentSuggestedScene || "分析中..."}
                </span>
              </div>
              <div class="summary-cell">
                <span class="summary-label font-mono">套用色彩檔</span>
                <span class="summary-value profile-val font-mono">
                  {readableProfileName}
                </span>
              </div>
            </div>

            <!-- 後製調色理念 (字級放大、行距舒適) -->
            {#if currentStyleInsight}
              <div class="insight-block style-insight">
                <div class="insight-block-title font-mono">
                  <span class="material-symbols-outlined" style="font-size: 14px;"
                    >lightbulb</span
                  >
                  <span>後製調色理念</span>
                </div>
                <p class="insight-paragraph font-body">{currentStyleInsight}</p>
              </div>
            {/if}

            <!-- 構圖裁切建議 -->
            {#if currentCropRationale}
              <div class="insight-block crop-insight">
                <div class="insight-block-title font-mono">
                  <span class="material-symbols-outlined" style="font-size: 14px;"
                    >crop</span
                  >
                  <span>構圖與裁切診斷</span>
                </div>
                <p class="insight-paragraph font-body">{currentCropRationale}</p>
              </div>
            {/if}

            <!-- 視覺特徵標籤 -->
            {#if currentVisionTags.length > 0}
              <div class="vision-tags-row">
                {#each currentVisionTags as tag}
                  <span class="vision-tag-chip font-mono">#{tag}</span>
                {/each}
              </div>
            {/if}

            <!-- 內嵌可收合執行過程明細 (Terminal Log) -->
            <div class="embedded-log-box font-mono">
              <div class="embedded-log-bar">
                <button
                  type="button"
                  class="log-bar-toggle font-mono"
                  onclick={() => (isProcessLogOpen = !isProcessLogOpen)}
                >
                  <span class="material-symbols-outlined" style="font-size: 13px;">
                    terminal
                  </span>
                  <span class="log-bar-text">
                    {#if isProcessLogOpen}
                      收合顯影過程明細 ({currentLogs.length})
                    {:else}
                      {latestLogSummary || `檢視顯影過程明細 (${currentLogs.length})`}
                    {/if}
                  </span>
                </button>
                <div class="log-bar-actions">
                  {#if currentLogs.length > 0}
                    <button
                      type="button"
                      class="log-mini-btn font-mono"
                      onclick={() =>
                        onCopyTerminalLogs
                          ? onCopyTerminalLogs()
                          : aiPipeline.copyTerminalLogs()}
                      title="複製完整顯影紀錄"
                    >
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 12px;"
                      >
                        {currentCopiedNotice ? "check" : "content_copy"}
                      </span>
                      <span>{currentCopiedNotice ? "已複製" : "複製"}</span>
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="log-expand-icon"
                    onclick={() => (isProcessLogOpen = !isProcessLogOpen)}
                    aria-label="展開或收合顯影紀錄"
                  >
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 15px;"
                      style:transform={isProcessLogOpen ? "rotate(180deg)" : "none"}
                    >
                      expand_more
                    </span>
                  </button>
                </div>
              </div>

              {#if isProcessLogOpen}
                <div
                  class="terminal-body custom-scroll"
                  bind:this={terminalBodyElement}
                >
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
              {/if}
            </div>
          </div>
        {/if}
      </section>
    {/if}

    <!-- ══════════════════════════════════════════════════════════════════
         STEP 1：選擇顯影風格與輸出色彩 (3D LUT & Output Mode)
         ══════════════════════════════════════════════════════════════════ -->
    <section class="workflow-section hairline-all">
      <div class="section-header">
        <div class="step-title-group">
          <span class="step-badge font-mono">STEP 1</span>
          <span class="section-title">顯影風格與色彩模式</span>
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
          title={isExpandedStyles ? "切換為精簡捲軸檢視" : "展開全部風格卡片"}
        >
          <span>{isExpandedStyles ? "精簡檢視" : `展開全部 (${styleGradingPresets.length})`}</span>
          <span class="material-symbols-outlined" style="font-size: 14px;">
            {isExpandedStyles ? "unfold_less" : "unfold_more"}
          </span>
        </button>
      </div>

      <!-- 彩色 / 黑白輸出切換 -->
      <div class="style-output-sync-bar font-mono">
        <span class="style-output-sync-label">輸出管線</span>
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
            title="黑白暗房管線（保留所選 LUT 階調曲線，並與右側面板同步）"
          >
            <span class="sync-dot mono"></span>
            <span>黑白 B&W</span>
          </button>
        </div>
      </div>

      <!-- 當前選中風格的清楚文字說明橫幅 -->
      {#if selectedPresetObj}
        <div class="selected-style-banner">
          <div class="banner-top">
            <span
              class="banner-dot"
              style:background={selectedPresetObj.accent || "var(--amber-highlight)"}
            ></span>
            <span class="banner-name font-headline">{selectedPresetObj.title}</span>
          </div>
          <p class="banner-desc">{selectedPresetObj.subtitle}</p>
        </div>
      {/if}

      <!-- 風格縮圖卡片網格 -->
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
              class:is-mono={darkroomState.monochrome && preset.key !== "auto"}
              style:background={stylePreviewThumbs[preset.key]
                ? `center / cover no-repeat url(${stylePreviewThumbs[preset.key]})`
                : preset.key === "auto"
                  ? "linear-gradient(135deg, #e29d52, #6082b6 55%, #3aa8a8)"
                  : preset.accent}
            >
              {#if preset.key === "auto"}
                <span
                  class="material-symbols-outlined"
                  style="font-size: 26px; color: #fff;"
                >
                  auto_awesome
                </span>
              {/if}
              {#if darkroomState.activeStylePreset === preset.key}
                <span class="active-check-badge">
                  <span class="material-symbols-outlined" style="font-size: 13px;"
                    >check</span
                  >
                </span>
              {/if}
            </span>
            <div class="style-card-meta">
              <span class="style-card-title font-headline">
                {preset.shortLabel || preset.title}
              </span>
              <span class="style-card-sub">
                {preset.title.includes("·")
                  ? preset.title.split("·")[1].trim()
                  : preset.badge}
              </span>
            </div>
          </button>
        {/each}
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════════════════
         STEP 2：意境關鍵字與自訂指令 (Vibe Keywords & Custom Prompt)
         ══════════════════════════════════════════════════════════════════ -->
    <section class="workflow-section hairline-all">
      <div class="section-header">
        <div class="step-title-group">
          <span class="step-badge font-mono">STEP 2</span>
          <span class="section-title">調色意境與自訂描述</span>
        </div>
        {#if darkroomState.selectedStyleKeywords.length > 0 || hasCustomPrompt}
          <button
            type="button"
            class="vibe-clear-btn font-mono"
            onclick={() => darkroomState.clearStyleKeywords()}
            title="清空已選取的調色關鍵字與自訂指令"
          >
            清空 ({darkroomState.selectedStyleKeywords.length +
              (hasCustomPrompt ? 1 : 0)})
          </button>
        {/if}
      </div>

      <!-- 意境關鍵字 Chips -->
      <div class="vibe-chips-grid">
        {#each STYLE_KEYWORD_ENTRIES as kw}
          {@const isSelected = darkroomState.selectedStyleKeywords.includes(kw.id)}
          <button
            type="button"
            class="vibe-keyword-chip"
            class:active={isSelected}
            title={kw.tooltip}
            onclick={() => darkroomState.toggleStyleKeyword(kw.id)}
          >
            <span class="vibe-chip-dot"></span>
            <span>{kw.shortTag}</span>
          </button>
        {/each}
      </div>

      <!-- 若有選取關鍵字，提供不佔空間的收合微調入口 -->
      {#if darkroomState.selectedStyleKeywords.length > 0}
        <div class="selected-keywords-bar">
          <button
            type="button"
            class="kw-inspect-toggle font-mono"
            onclick={() => (isKeywordDirectivesOpen = !isKeywordDirectivesOpen)}
          >
            <span class="material-symbols-outlined" style="font-size: 13px;">
              tune
            </span>
            <span>
              已選 {darkroomState.selectedStyleKeywords.length} 項意境標籤 · {isKeywordDirectivesOpen
                ? "收合指令明細"
                : "檢視/微調指令"}
            </span>
            <span
              class="material-symbols-outlined"
              style="font-size: 14px; margin-left: auto;"
              style:transform={isKeywordDirectivesOpen ? "rotate(180deg)" : "none"}
            >
              expand_more
            </span>
          </button>

          {#if isKeywordDirectivesOpen}
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
                          <span class="label-custom-indicator">已自訂</span>
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
                            編輯Prompt
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
                        rows="2"
                        value={darkroomState.getKeywordDirective(kwId)}
                        oninput={(e) =>
                          darkroomState.updateKeywordOverride(
                            kwId,
                            (e.target as HTMLTextAreaElement).value,
                          )}
                      ></textarea>
                    {:else}
                      <div class="label-directive-display">
                        {entry.tooltip}
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- 自訂意境描述輸入框 -->
      <div
        class="vibe-command-box"
        class:has-prompt={hasCustomPrompt}
        class:is-focused={isCustomInputFocused}
      >
        <div class="vibe-command-body">
          <textarea
            class="vibe-custom-input font-body"
            rows="2"
            placeholder={`輸入自訂調色想法，如：${activeCustomSample}`}
            bind:value={darkroomState.customStylePrompt}
            onfocus={() => (isCustomInputFocused = true)}
            onblur={() => (isCustomInputFocused = false)}
          ></textarea>
          <div class="vibe-command-footer font-mono">
            <span class="vibe-intent-status" class:active={hasCustomPrompt}>
              {#if hasCustomPrompt}
                ✦ 已啟用自訂意境指令
              {:else}
                可自由描述光影、色溫或氛圍偏好
              {/if}
            </span>
            <button
              type="button"
              class="vibe-sample-btn font-mono"
              onclick={applyRandomVibeSample}
              title="隨機填入一組視覺風格描述範例"
            >
              <span class="material-symbols-outlined" style="font-size: 12px;"
                >casino</span
              >
              <span>試試範例</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ══════════════════════════════════════════════════════════════════
         STEP 3：AI 職責範圍設定 (AI Scope Matrix - 2x3 好讀網格)
         ══════════════════════════════════════════════════════════════════ -->
    <section class="workflow-section scope-section hairline-all">
      <button
        type="button"
        class="scope-accordion-btn"
        onclick={() =>
          onToggleIsAiScopeOpen
            ? onToggleIsAiScopeOpen()
            : aiPipeline.toggleAiScopeOpen()}
        aria-expanded={currentIsScopeOpen}
      >
        <div class="step-title-group">
          <span class="step-badge font-mono">STEP 3</span>
          <span class="section-title">AI 自動調整項目</span>
          <span class="scope-count-pill font-mono">{aiScopeActiveCount}/6</span>
        </div>
        <span
          class="material-symbols-outlined scope-chevron"
          style:transform={currentIsScopeOpen ? "rotate(180deg)" : "none"}
        >
          expand_more
        </span>
      </button>

      {#if !currentIsScopeOpen}
        <div
          class="scope-collapsed-summary font-mono"
          onclick={() =>
            onToggleIsAiScopeOpen
              ? onToggleIsAiScopeOpen()
              : aiPipeline.toggleAiScopeOpen()}
          role="button"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === "Enter") {
              onToggleIsAiScopeOpen
                ? onToggleIsAiScopeOpen()
                : aiPipeline.toggleAiScopeOpen();
            }
          }}
        >
          {activeScopeSummary || "尚未勾選任何項目"}
        </div>
      {:else}
        <div class="scope-grid-2col">
          {#each SCOPE_ITEMS as item}
            {@const checked = isScopeEnabled(item.key)}
            <button
              type="button"
              class="scope-pill-item"
              class:active={checked}
              onclick={() =>
                onToggleAiScope
                  ? onToggleAiScope(item.key)
                  : aiPipeline.toggleAiScope(item.key as any)}
              title={item.label}
            >
              <span
                class="material-symbols-outlined scope-item-icon"
                style="font-size: 14px;"
              >
                {checked ? "check_box" : "check_box_outline_blank"}
              </span>
              <span class="scope-item-text">{item.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <!-- 當尚未執行過 AI 時，將簡易日誌入口放在底部備查，不干擾上方視覺 -->
    {#if !hasAiReportData && !currentIsAiAnalyzing && !currentIsBatchRunning && currentLogs.length > 0}
      <div class="idle-log-bar hairline-all font-mono">
        <button
          type="button"
          class="log-bar-toggle font-mono"
          onclick={() => (isProcessLogOpen = !isProcessLogOpen)}
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">
            terminal
          </span>
          <span class="log-bar-text">
            上次顯影紀錄 ({currentLogs.length})
          </span>
          <span
            class="material-symbols-outlined"
            style="font-size: 14px; margin-left: auto;"
            style:transform={isProcessLogOpen ? "rotate(180deg)" : "none"}
          >
            expand_more
          </span>
        </button>
        {#if isProcessLogOpen}
          <div class="terminal-body custom-scroll" bind:this={terminalBodyElement}>
            {#each currentLogs as line}
              <div class="term-line">{line}</div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- ══════════════════════════════════════════════════════════════════
       常駐底部執行列 (Sticky Action Dock - 永遠可見，免捲動尋找按鈕)
       ══════════════════════════════════════════════════════════════════ -->
  <footer class="ai-sticky-footer hairline-t">
    {#if hasAiBaseline && onRestoreAiTuning}
      <div class="ai-revert-strip font-mono">
        <div class="revert-status">
          <span
            class="material-symbols-outlined"
            style="font-size: 14px; color: {isModifiedFromAi
              ? 'var(--amber-highlight)'
              : 'var(--success-green)'};"
          >
            {isModifiedFromAi ? "tune" : "check_circle"}
          </span>
          <span>
            {isModifiedFromAi ? "已手動微調參數" : "維持 AI 顯影基準"}
          </span>
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

    {#if currentIsBatchRunning}
      <button
        type="button"
        class="archival-btn-secondary danger w-full batch-stop-cta"
        onclick={onCancelBatchAi}
      >
        <span class="material-symbols-outlined" style="font-size: 17px;"
          >stop_circle</span
        >
        <span>
          中止批次顯影 ({currentBatchProgress?.current ||
            1}/{currentBatchProgress?.total || 1})
        </span>
      </button>
    {:else}
      <div class="cta-buttons-row">
        {#if onRunAiAnalysis}
          <button
            type="button"
            class="archival-btn-primary ai-main-btn"
            class:custom-driven={hasCustomPrompt}
            onclick={onRunAiAnalysis}
            disabled={currentIsAiAnalyzing || !activePhoto}
            title="以選定風格與調色關鍵字執行 AI 調色"
          >
            <span
              class="material-symbols-outlined"
              class:spin={currentIsAiAnalyzing}
              style="font-size: 17px;"
            >
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
                  ? "依自訂意境 AI 顯影"
                  : darkroomState.activeStylePreset === "auto"
                    ? "AI 智慧顯影調色"
                    : `以 ${selectedPresetObj?.shortLabel || "選定風格"} AI 顯影`}
            </span>
          </button>
        {/if}

        {#if photoPlates.length > 1 && onRequestBatchAi}
          <button
            type="button"
            class="archival-btn-secondary batch-cta-btn font-mono"
            onclick={onRequestBatchAi}
            disabled={currentIsAiAnalyzing}
            title="以目前選定的風格，對所有已標記（或全部）相片循序進行 AI 批次調色"
          >
            <span class="material-symbols-outlined" style="font-size: 15px;"
              >auto_mode</span
            >
            <span>
              批次 ({flaggedCount > 0 ? flaggedCount : photoPlates.length})
            </span>
          </button>
        {/if}
      </div>
    {/if}
  </footer>
</div>

<style>
  .ai-assistant-dock {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /* ── 頂部標題與金鑰列 ── */
  .ai-top-bar {
    padding: 12px 12px 10px;
    flex-shrink: 0;
    background: var(--surface-panel);
  }
  .ai-brand-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 3px;
  }
  .ai-title-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ai-sparkle {
    color: var(--amber-highlight);
    font-size: 18px;
  }
  .ai-title {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--parchment-bright);
  }
  .ai-subtitle {
    font-size: 11.5px;
    color: var(--parchment-muted);
    line-height: 1.4;
  }
  .ai-batch-badge {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    background-color: rgba(226, 157, 82, 0.16);
    border: 1px solid rgba(226, 157, 82, 0.45);
    color: var(--amber-highlight);
  }

  .vault-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: var(--radius-full);
    border: 1px solid rgba(226, 157, 82, 0.45);
    background: rgba(226, 157, 82, 0.1);
    color: var(--amber-highlight);
    font-size: 10.5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .vault-pill-btn.has-key {
    border-color: var(--hairline-slate);
    background: var(--surface-elevated);
    color: var(--parchment-muted);
  }
  .vault-pill-btn:hover {
    border-color: var(--amber-highlight);
    color: var(--parchment-bright);
    background: rgba(226, 157, 82, 0.18);
  }

  /* ── 中央捲動區 ── */
  .ai-scroll-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 10px 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* ── AI 顯影判讀報告卡 (整合場景、色彩檔、後製理念、裁切與日誌) ── */
  .ai-report-card {
    background: linear-gradient(
      180deg,
      rgba(212, 163, 115, 0.08) 0%,
      var(--surface-elevated) 100%
    );
    border: 1px solid rgba(212, 163, 115, 0.35);
    border-radius: var(--radius-sm);
    overflow: hidden;
    flex-shrink: 0;
  }
  .ai-report-card.is-analyzing {
    border-color: var(--amber-highlight);
    box-shadow: 0 0 12px rgba(212, 163, 115, 0.18);
  }
  .report-card-header {
    padding: 8px 10px;
    background: rgba(0, 0, 0, 0.2);
  }
  .report-toggle-title {
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--parchment-bright);
    cursor: pointer;
    text-align: left;
  }
  .report-status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--amber-highlight);
    flex-shrink: 0;
  }
  .report-status-dot.active {
    box-shadow: 0 0 8px var(--amber-highlight);
    animation: termBlink 1s infinite;
  }
  .report-heading {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--amber-highlight);
    letter-spacing: 0.03em;
  }
  .mood-pill {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-xs);
    background: rgba(212, 163, 115, 0.16);
    color: var(--parchment-bright);
    margin-left: auto;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .report-chevron {
    font-size: 16px;
    color: var(--parchment-muted);
    margin-left: auto;
    transition: transform 0.2s ease;
  }
  .mood-pill + .report-chevron {
    margin-left: 2px;
  }

  .report-card-body {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .report-summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .summary-cell {
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-xs);
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .summary-label {
    font-size: 10px;
    color: var(--parchment-dim);
  }
  .summary-value {
    font-size: 12px;
    font-weight: 600;
    color: var(--parchment-bright);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .summary-value.profile-val {
    color: var(--amber-highlight);
    font-size: 11.5px;
  }

  .insight-block {
    border-radius: var(--radius-xs);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .insight-block.style-insight {
    background: rgba(212, 163, 115, 0.09);
    border-left: 3px solid var(--amber-highlight);
  }
  .insight-block.crop-insight {
    background: rgba(94, 234, 212, 0.08);
    border-left: 3px solid var(--emerald-cyan, #5eead4);
  }
  .insight-block-title {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--amber-highlight);
  }
  .crop-insight .insight-block-title {
    color: var(--emerald-cyan, #5eead4);
  }
  .insight-paragraph {
    font-size: 12px;
    line-height: 1.55;
    color: var(--parchment-bright);
    user-select: text;
    -webkit-user-select: text;
  }

  .vision-tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .vision-tag-chip {
    font-size: 10.5px;
    background: rgba(0, 0, 0, 0.35);
    color: var(--parchment-muted);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-xs);
    padding: 2px 7px;
  }

  /* 內嵌執行紀錄匣 */
  .embedded-log-box,
  .idle-log-bar {
    background: rgba(0, 0, 0, 0.32);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: var(--radius-xs);
    overflow: hidden;
  }
  .embedded-log-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 8px;
    gap: 6px;
  }
  .log-bar-toggle {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--parchment-muted);
    font-size: 10.5px;
    cursor: pointer;
    text-align: left;
  }
  .log-bar-toggle:hover {
    color: var(--parchment-bright);
  }
  .log-bar-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .log-bar-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .log-mini-btn {
    background: transparent;
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-muted);
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-xs);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .log-mini-btn:hover {
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
  }
  .log-expand-icon {
    background: none;
    border: none;
    color: var(--parchment-dim);
    display: flex;
    align-items: center;
    cursor: pointer;
    padding: 0;
  }
  .terminal-body {
    padding: 8px 10px;
    max-height: 140px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background-color: rgba(10, 11, 14, 0.65);
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    user-select: text;
    -webkit-user-select: text;
  }
  .term-line {
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--parchment-muted);
    word-break: break-word;
    user-select: text;
    -webkit-user-select: text;
  }
  .term-line.active {
    color: var(--amber-highlight);
  }
  .term-cursor,
  .term-blink {
    animation: termBlink 0.9s infinite;
    color: var(--amber-highlight);
  }

  /* ── 通用工作流區塊卡片 (Step 1 / Step 2 / Step 3) ── */
  .workflow-section {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--surface-elevated);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .step-title-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .step-badge {
    font-size: 9.5px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(212, 163, 115, 0.16);
    color: var(--amber-highlight);
    letter-spacing: 0.04em;
  }
  .section-title {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--parchment-bright);
  }

  .expand-toggle-btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: var(--parchment-muted);
    font-size: 10.5px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    cursor: pointer;
    padding: 2px 7px;
    border-radius: var(--radius-xs);
    transition: all 0.15s ease;
  }
  .expand-toggle-btn:hover {
    color: var(--amber-highlight);
    border-color: rgba(212, 163, 115, 0.45);
    background: rgba(212, 163, 115, 0.1);
  }

  /* 彩色 / 黑白切換列 */
  .style-output-sync-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 5px 8px;
    background: rgba(12, 13, 16, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-xs);
  }
  .style-output-sync-label {
    font-size: 10.5px;
    color: var(--parchment-muted);
    white-space: nowrap;
  }
  .style-output-sync-switch {
    display: inline-flex;
    gap: 3px;
    background: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    padding: 2px;
  }
  .style-output-sync-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border: 1px solid transparent;
    border-radius: 2px;
    background: transparent;
    color: var(--parchment-muted);
    font-size: 10.5px;
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
    font-weight: 600;
  }
  .sync-dot {
    width: 7px;
    height: 7px;
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

  /* 當前選中風格說明橫幅 */
  .selected-style-banner {
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(212, 163, 115, 0.25);
    border-radius: var(--radius-xs);
    padding: 7px 9px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .banner-top {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .banner-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .banner-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--amber-highlight);
  }
  .banner-desc {
    font-size: 11px;
    line-height: 1.4;
    color: var(--parchment-muted);
  }

  /* 風格卡片網格 */
  .style-card-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 7px;
    max-height: 250px;
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
    gap: 5px;
    padding: 6px;
    text-align: left;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .style-card:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(226, 157, 82, 0.55);
    transform: translateY(-1px);
  }
  .style-card.active {
    background: rgba(212, 140, 52, 0.16);
    border-color: var(--amber-highlight);
    box-shadow: 0 0 0 1px var(--amber-highlight);
  }
  .style-card-swatch {
    position: relative;
    height: 68px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    transition: filter 0.2s ease;
  }
  .style-card-swatch.is-mono {
    filter: grayscale(1) contrast(1.06);
  }
  .active-check-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--amber-highlight);
    color: #121316;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  }
  .style-card-meta {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .style-card-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--parchment-bright);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .style-card.active .style-card-title {
    color: var(--amber-highlight);
  }
  .style-card-sub {
    font-size: 10.5px;
    color: var(--parchment-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Step 2：調色意境與自訂描述 ── */
  .vibe-clear-btn {
    background: transparent;
    border: 1px solid rgba(226, 157, 82, 0.4);
    color: var(--amber-highlight);
    font-size: 10px;
    padding: 2px 7px;
    border-radius: var(--radius-xs);
    cursor: pointer;
    transition: all 0.14s ease;
  }
  .vibe-clear-btn:hover {
    background: rgba(226, 157, 82, 0.16);
    border-color: var(--amber-highlight);
  }
  .vibe-chips-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .vibe-keyword-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 9px;
    font-size: 11px;
    color: var(--parchment-muted);
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.14s ease;
  }
  .vibe-keyword-chip:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(226, 157, 82, 0.5);
    color: var(--parchment-bright);
  }
  .vibe-keyword-chip.active {
    background: rgba(226, 157, 82, 0.18);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    font-weight: 600;
  }
  .vibe-chip-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.25);
  }
  .vibe-keyword-chip.active .vibe-chip-dot {
    background: var(--amber-highlight);
    box-shadow: 0 0 6px var(--amber-highlight);
  }

  .selected-keywords-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .kw-inspect-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 8px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px dashed rgba(212, 163, 115, 0.35);
    border-radius: var(--radius-xs);
    color: var(--amber-highlight);
    font-size: 10.5px;
    cursor: pointer;
    text-align: left;
  }
  .kw-inspect-toggle:hover {
    background: rgba(212, 163, 115, 0.1);
  }

  .style-labels-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .style-label-card {
    background: rgba(0, 0, 0, 0.36);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-xs);
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .style-label-card.is-editing {
    border-color: var(--amber-highlight);
  }
  .label-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .label-badge-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .label-card-badge {
    color: var(--amber-highlight);
    font-weight: 600;
    font-size: 10.5px;
  }
  .label-custom-indicator {
    color: var(--parchment-dim);
    font-size: 9.5px;
  }
  .label-card-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .label-action-btn {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 2px;
    padding: 1px 6px;
    font-size: 9.5px;
    color: var(--parchment-muted);
    cursor: pointer;
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
    font-size: 11px;
    line-height: 1.45;
    color: var(--parchment-muted);
  }
  .label-edit-textarea {
    width: 100%;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid var(--amber-highlight);
    border-radius: 2px;
    padding: 5px 7px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--parchment-bright);
    outline: none;
    resize: vertical;
  }

  /* 自訂意境描述框 */
  .vibe-command-box {
    padding: 8px;
    background: rgba(0, 0, 0, 0.32);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-sm);
    transition: all 0.18s ease;
  }
  .vibe-command-box.is-focused,
  .vibe-command-box.has-prompt {
    border-color: rgba(226, 157, 82, 0.65);
    background: rgba(0, 0, 0, 0.48);
    box-shadow: 0 0 0 1px rgba(226, 157, 82, 0.16);
  }
  .vibe-command-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .vibe-custom-input {
    width: 100%;
    background: transparent;
    border: none;
    padding: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--parchment-bright);
    outline: none;
    resize: vertical;
    min-height: 40px;
  }
  .vibe-custom-input::placeholder {
    color: var(--parchment-dim);
  }
  .vibe-command-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding-top: 5px;
    border-top: 1px dashed rgba(255, 255, 255, 0.08);
  }
  .vibe-intent-status {
    font-size: 10px;
    color: var(--parchment-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .vibe-intent-status.active {
    color: var(--amber-highlight);
    font-weight: 600;
  }
  .vibe-sample-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 3px;
    color: var(--parchment-muted);
    font-size: 10px;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.14s ease;
  }
  .vibe-sample-btn:hover {
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    background: rgba(226, 157, 82, 0.12);
  }

  /* ── Step 3：AI 職責範圍勾選 ── */
  .scope-section {
    gap: 6px;
  }
  .scope-accordion-btn {
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--parchment-bright);
    cursor: pointer;
    text-align: left;
  }
  .scope-count-pill {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-full);
    background: var(--surface-overlay);
    color: var(--amber-highlight);
  }
  .scope-chevron {
    font-size: 16px;
    color: var(--parchment-muted);
    transition: transform 0.2s ease;
  }
  .scope-collapsed-summary {
    font-size: 11px;
    color: var(--parchment-muted);
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.24);
    border-radius: var(--radius-xs);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .scope-collapsed-summary:hover {
    color: var(--parchment-bright);
  }
  .scope-grid-2col {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 5px;
    padding-top: 2px;
  }
  .scope-pill-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 7px;
    background: rgba(0, 0, 0, 0.26);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: var(--radius-xs);
    color: var(--parchment-dim);
    font-size: 11px;
    cursor: pointer;
    text-align: left;
    transition: all 0.14s ease;
    min-width: 0;
  }
  .scope-pill-item:hover {
    border-color: rgba(212, 163, 115, 0.4);
    color: var(--parchment-bright);
  }
  .scope-pill-item.active {
    background: rgba(212, 163, 115, 0.12);
    border-color: rgba(212, 163, 115, 0.45);
    color: var(--parchment-bright);
  }
  .scope-item-icon {
    color: var(--parchment-dim);
    flex-shrink: 0;
  }
  .scope-pill-item.active .scope-item-icon {
    color: var(--amber-highlight);
  }
  .scope-item-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── 底部常駐執行列 (Sticky Action Footer) ── */
  .ai-sticky-footer {
    padding: 10px 12px;
    background: var(--surface-panel);
    box-shadow: 0 -6px 18px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
    z-index: 5;
  }
  .ai-revert-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 8px;
    background: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    font-size: 11px;
  }
  .revert-status {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--parchment-muted);
  }
  .revert-chip-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: rgba(229, 142, 38, 0.14);
    border: 1px solid var(--amber-highlight);
    border-radius: var(--radius-xs);
    color: var(--amber-highlight);
    cursor: pointer;
    font-size: 10.5px;
    font-weight: 600;
    transition: all 0.15s ease;
  }
  .revert-chip-btn:hover {
    background: var(--amber-highlight);
    color: var(--canvas-base);
  }

  .cta-buttons-row {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }
  .ai-main-btn {
    flex: 1;
    justify-content: center;
    padding: 9px 12px !important;
    font-size: 13px !important;
    background: linear-gradient(
      135deg,
      var(--amber-highlight),
      #c98234
    ) !important;
    color: #121214 !important;
    font-weight: 700 !important;
    border: 1px solid rgba(226, 157, 82, 0.95) !important;
    box-shadow: 0 2px 14px rgba(226, 157, 82, 0.28);
    transition: all 0.2s ease;
  }
  .ai-main-btn:hover:not(:disabled) {
    filter: brightness(1.08);
    box-shadow: 0 4px 18px rgba(226, 157, 82, 0.45);
  }
  .ai-main-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    filter: grayscale(0.5);
    box-shadow: none;
  }
  .batch-cta-btn {
    padding: 8px 10px !important;
    font-size: 11.5px !important;
    white-space: nowrap;
    justify-content: center;
    flex-shrink: 0;
  }
  .batch-cta-btn:hover:not(:disabled) {
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
  }
  .batch-stop-cta {
    justify-content: center;
    padding: 9px 12px !important;
    background: rgba(239, 68, 68, 0.16) !important;
    border-color: rgba(239, 68, 68, 0.55) !important;
    color: #fca5a5 !important;
    font-weight: 600;
  }
  .batch-stop-cta:hover {
    background: rgba(239, 68, 68, 0.3) !important;
    color: #fff !important;
  }

  .spin {
    animation: iconSpin 1.1s linear infinite;
  }
  @keyframes iconSpin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes termBlink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
</style>
