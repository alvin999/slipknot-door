<script lang="ts">
  type MobileDrawer = "none" | "ai" | "tuning";

  interface Props {
    isHidden?: boolean;
    isAiAnalyzing: boolean;
    isBatchAiRunning: boolean;
    hasActivePhoto: boolean;
    hasCustomStylePrompt: boolean;
    totalPhotos: number;
    flaggedCount: number;
    batchProgress: { current: number; total: number } | null;
    activeMobileDrawer: MobileDrawer;
    onRunAiAnalysis: () => void;
    onCancelBatchAi: () => void;
    onRequestBatchAi: () => void;
    onToggleDrawer: (drawer: "ai" | "tuning") => void;
  }

  let {
    isHidden = false,
    isAiAnalyzing,
    isBatchAiRunning,
    hasActivePhoto,
    hasCustomStylePrompt,
    totalPhotos,
    flaggedCount,
    batchProgress,
    activeMobileDrawer,
    onRunAiAnalysis,
    onCancelBatchAi,
    onRequestBatchAi,
    onToggleDrawer,
  }: Props = $props();
</script>

<!-- 行動端暗房操作工具列：不開面板即可直接執行單張一鍵 AI 與批次 AI，並保留風格/微調抽屜入口 -->
<div
  class="mobile-retouch-action-bar hairline-t font-mono"
  class:split-hidden={isHidden}
>
  <button
    type="button"
    class="retouch-action-pill primary-ai"
    onclick={onRunAiAnalysis}
    disabled={isAiAnalyzing || isBatchAiRunning || !hasActivePhoto}
    title="不開面板直接以目前設定執行一鍵 AI 顯影"
  >
    <span
      class="material-symbols-outlined"
      class:spin={isAiAnalyzing && !isBatchAiRunning}
      style="font-size: 16px;"
    >
      {isAiAnalyzing && !isBatchAiRunning
        ? "progress_activity"
        : "auto_awesome"}
    </span>
    <span>
      {isAiAnalyzing && !isBatchAiRunning
        ? "顯影中..."
        : hasCustomStylePrompt
          ? "依意境 AI"
          : "一鍵 AI"}
    </span>
  </button>

  {#if totalPhotos > 1}
    {#if isBatchAiRunning}
      <button
        type="button"
        class="retouch-action-pill danger-stop"
        onclick={onCancelBatchAi}
        title="立即中止 AI 批次顯影"
      >
        <span class="material-symbols-outlined" style="font-size: 15px;"
          >stop_circle</span
        >
        <span
          >停止 ({batchProgress?.current || 1}/{batchProgress?.total ||
            totalPhotos})</span
        >
      </button>
    {:else}
      <button
        type="button"
        class="retouch-action-pill secondary-batch"
        onclick={onRequestBatchAi}
        disabled={isAiAnalyzing}
        title="以預設或當前風格進行 AI 批次調色"
      >
        <span class="material-symbols-outlined" style="font-size: 15px;"
          >auto_mode</span
        >
        <span>批次 ({flaggedCount > 0 ? flaggedCount : totalPhotos})</span>
      </button>
    {/if}
  {/if}

  <button
    type="button"
    class="retouch-action-pill compact"
    class:active={activeMobileDrawer === "ai"}
    onclick={() => onToggleDrawer("ai")}
    title="展開 AI 風格與意境關鍵字設定面板"
  >
    <span class="material-symbols-outlined" style="font-size: 15px;"
      >palette</span
    >
    <span>風格</span>
  </button>

  <button
    type="button"
    class="retouch-action-pill compact"
    class:active={activeMobileDrawer === "tuning"}
    onclick={() => onToggleDrawer("tuning")}
    title="展開光影與色彩參數微調面板"
  >
    <span class="material-symbols-outlined" style="font-size: 15px;">tune</span>
    <span>微調</span>
  </button>
</div>

<style>
  /* 桌面端預設隱藏手機專屬控制列 */
  .mobile-retouch-action-bar {
    display: none;
  }

  @media (max-width: 768px) {
    /* 行動端精修專屬操作固定工具列：置於底欄上方，提供一鍵 AI 與批次 AI 直接執行 */
    .mobile-retouch-action-bar {
      display: flex;
      height: 48px;
      background-color: var(--surface-panel);
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 8px;
      z-index: 890;
      border-top: 1px solid var(--hairline-slate);
      flex-shrink: 0;
    }

    /* 手機版精修分割視窗開啟時，暫時隱藏底部工具列以騰出預覽空間 */
    .mobile-retouch-action-bar.split-hidden {
      display: none;
    }

    .retouch-action-pill {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--hairline-slate);
      border-radius: 20px;
      padding: 6px 12px;
      font-size: 11.5px;
      color: var(--parchment-bright);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .retouch-action-pill:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .retouch-action-pill.primary-ai {
      flex: 1.25;
      background: linear-gradient(
        135deg,
        rgba(226, 157, 82, 0.24),
        rgba(212, 163, 115, 0.12)
      );
      border-color: rgba(226, 157, 82, 0.65);
      color: var(--amber-highlight);
      font-weight: 600;
    }

    .retouch-action-pill.secondary-batch {
      flex: 1;
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.18);
    }

    .retouch-action-pill.danger-stop {
      flex: 1.1;
      background: rgba(239, 68, 68, 0.16);
      border-color: rgba(239, 68, 68, 0.55);
      color: #fca5a5;
      font-weight: 600;
    }

    .retouch-action-pill.compact {
      padding: 6px 10px;
    }

    .retouch-action-pill.active {
      background: rgba(212, 163, 115, 0.15);
      border-color: var(--amber-highlight);
      color: var(--amber-highlight);
    }

    .retouch-action-pill .spin {
      animation: mobile-btn-spin 1.1s linear infinite;
    }

    @keyframes mobile-btn-spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  }
</style>

