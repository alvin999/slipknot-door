<script lang="ts">
  import { aiPipeline } from "$lib/stores/aiPipeline.svelte";

  type ModuleTab = "catalog" | "retouch" | "profiles" | "export" | "devices";

  interface Props {
    activeTab: ModuleTab;
    activePhotoId?: string;
    onFocusPhoto?: () => void;
  }

  let { activeTab, activePhotoId, onFocusPhoto }: Props = $props();

  const isVisible = $derived(
    aiPipeline.isAiAnalyzing || aiPipeline.isBatchAiRunning,
  );
  const targetPhoto = $derived(aiPipeline.analyzingPhoto);
  const phase = $derived(aiPipeline.analyzingPhase);
  const isTwoPhase = $derived(aiPipeline.isTwoPhaseActive);
  const batchProgress = $derived(aiPipeline.batchProgress);

  const phaseBadge = $derived.by(() => {
    if (batchProgress?.countdown && batchProgress.countdown > 0 && !aiPipeline.isAiAnalyzing) {
      return `${batchProgress.countdown}s`;
    }
    if (isTwoPhase) {
      return phase === "pass2_critic" ? "P2" : "P1";
    }
    return "AI";
  });

  const phaseLabel = $derived.by(() => {
    if (batchProgress?.countdown && batchProgress.countdown > 0 && !aiPipeline.isAiAnalyzing) {
      return `冷卻等待中 (${batchProgress.countdown}s)`;
    }
    if (isTwoPhase) {
      if (phase === "pass1_geometry") return "Phase 1/2 · 幾何構圖";
      if (phase === "pass2_critic") return "Phase 2/2 · 審美精修";
      return "Phase 1/2 · 視覺調色";
    }
    if (phase === "pass1_geometry") return "幾何構圖分析中";
    return "AI 視覺顯影中";
  });

  const progressPct = $derived.by(() => {
    if (batchProgress) {
      const base = (batchProgress.current - 1) / Math.max(1, batchProgress.total);
      const sub =
        phase === "pass2_critic"
          ? 0.72
          : phase === "pass1_color"
            ? 0.42
            : 0.18;
      return Math.min(98, Math.round((base + sub / Math.max(1, batchProgress.total)) * 100));
    }
    if (isTwoPhase) {
      if (phase === "pass1_geometry") return 28;
      if (phase === "pass1_color") return 55;
      if (phase === "pass2_critic") return 86;
    }
    return phase === "pass1_geometry" ? 45 : 70;
  });

  const isViewingDifferent = $derived(
    Boolean(targetPhoto && (activeTab !== "retouch" || activePhotoId !== targetPhoto.id)),
  );
</script>

{#if isVisible}
  <div
    class="ai-progress-hud hairline-all"
    class:is-retouch-tab={activeTab === "retouch"}
    class:is-phase2={phase === "pass2_critic"}
    role="status"
    aria-live="polite"
  >
    <button
      type="button"
      class="hud-main-btn"
      onclick={() => {
        if (aiPipeline.focusAnalyzingPhoto()) {
          onFocusPhoto?.();
        }
      }}
      title={targetPhoto
        ? `點擊跳轉檢視正在顯影的相片：${targetPhoto.filename}`
        : "AI 顯影進行中"}
    >
      <div class="hud-thumb-wrap">
        {#if targetPhoto?.gradedThumbnail || targetPhoto?.thumbnail}
          <img
            src={targetPhoto.gradedThumbnail || targetPhoto.thumbnail}
            alt={targetPhoto.filename}
            class="hud-thumb-img"
          />
        {:else}
          <div class="hud-thumb-placeholder">
            <span class="material-symbols-outlined spin" style="font-size: 16px;"
              >progress_activity</span
            >
          </div>
        {/if}
        <span class="hud-phase-badge font-mono" class:p2={phase === "pass2_critic"}>
          {phaseBadge}
        </span>
      </div>

      <div class="hud-meta">
        <div class="hud-top-row font-mono">
          <span class="hud-phase-text">{phaseLabel}</span>
          {#if batchProgress}
            <span class="hud-batch-pill">
              {batchProgress.current}/{batchProgress.total}
            </span>
          {/if}
        </div>
        <div class="hud-file-row">
          <span class="hud-filename truncate">
            {#if targetPhoto}
              #{targetPhoto.frameNo} · {targetPhoto.filename}
            {:else}
              準備下一張底片...
            {/if}
          </span>
          {#if isViewingDifferent}
            <span class="hud-jump-hint font-mono">查看 →</span>
          {/if}
        </div>
      </div>
    </button>

    {#if aiPipeline.isBatchAiRunning}
      <button
        type="button"
        class="hud-stop-btn font-mono"
        onclick={(e) => {
          e.stopPropagation();
          aiPipeline.cancelBatchAi();
        }}
        title="中止批次顯影"
      >
        <span class="material-symbols-outlined" style="font-size: 15px;"
          >stop_circle</span
        >
      </button>
    {/if}

    <div class="hud-progress-track">
      <div class="hud-progress-fill" style:width={`${progressPct}%`}></div>
    </div>
  </div>
{/if}

<style>
  .ai-progress-hud {
    position: absolute;
    bottom: 16px;
    left: 16px;
    z-index: 420;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px 9px 8px;
    border-radius: 10px;
    background: rgba(18, 20, 26, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(226, 157, 82, 0.45);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
    max-width: 310px;
    min-width: 230px;
    overflow: hidden;
    animation: hud-slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .ai-progress-hud.is-retouch-tab {
    bottom: 134px;
  }

  .ai-progress-hud.is-phase2 {
    border-color: rgba(96, 165, 250, 0.55);
  }

  .hud-main-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    background: transparent;
    border: none;
    padding: 0;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .hud-thumb-wrap {
    position: relative;
    width: 42px;
    height: 42px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
    background: var(--surface-elevated);
    border: 1px solid rgba(226, 157, 82, 0.55);
    box-shadow: 0 0 10px rgba(226, 157, 82, 0.2);
  }

  .ai-progress-hud.is-phase2 .hud-thumb-wrap {
    border-color: rgba(96, 165, 250, 0.65);
    box-shadow: 0 0 10px rgba(96, 165, 250, 0.25);
  }

  .hud-thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .hud-thumb-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--amber-highlight);
  }

  .hud-phase-badge {
    position: absolute;
    right: 2px;
    bottom: 2px;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 3px;
    background: rgba(15, 17, 22, 0.88);
    color: var(--amber-highlight);
    border: 1px solid rgba(226, 157, 82, 0.5);
  }

  .hud-phase-badge.p2 {
    color: #93c5fd;
    border-color: rgba(96, 165, 250, 0.6);
  }

  .hud-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .hud-top-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10.5px;
    letter-spacing: 0.02em;
  }

  .hud-phase-text {
    color: var(--amber-highlight);
    font-weight: 600;
    white-space: nowrap;
  }

  .ai-progress-hud.is-phase2 .hud-phase-text {
    color: #93c5fd;
  }

  .hud-batch-pill {
    padding: 0 5px;
    border-radius: 4px;
    font-size: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--parchment-muted);
  }

  .hud-file-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-width: 0;
  }

  .hud-filename {
    font-size: 11.5px;
    color: var(--parchment-bright);
    opacity: 0.9;
  }

  .hud-jump-hint {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--amber-highlight);
    opacity: 0.85;
  }

  .hud-stop-btn {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid rgba(239, 68, 68, 0.45);
    background: rgba(239, 68, 68, 0.14);
    color: #fca5a5;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .hud-stop-btn:hover {
    background: rgba(239, 68, 68, 0.28);
  }

  .hud-progress-track {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2.5px;
    background: rgba(255, 255, 255, 0.08);
  }

  .hud-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #e29d52, #f59e0b);
    transition: width 0.35s ease;
  }

  .ai-progress-hud.is-phase2 .hud-progress-fill {
    background: linear-gradient(90deg, #e29d52, #60a5fa);
  }

  .spin {
    animation: hud-spin 1s linear infinite;
  }

  @keyframes hud-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes hud-slide-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 768px) {
    /* 精修頁改由畫布下方內建 mobile-ai-status-pill 顯示縮圖與進度，避免重複 */
    .ai-progress-hud.is-retouch-tab {
      display: none;
    }

    /* 其他分頁貼齊底部導航列上方，化身為全寬單行縮圖進度條 */
    .ai-progress-hud {
      position: fixed;
      left: 10px;
      right: 10px;
      bottom: calc(60px + env(safe-area-inset-bottom, 0px));
      max-width: none;
      min-width: 0;
      padding: 6px 10px 8px 8px;
    }

    .hud-thumb-wrap {
      width: 34px;
      height: 34px;
    }
  }
</style>
