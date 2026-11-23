<script lang="ts">
  import { t } from "$lib/i18n";

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
    onSwipeOpen?: () => void;
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
    onSwipeOpen,
  }: Props = $props();

  // 從底部精修工具列往上滑直接拉開面板
  let swipePointerId: number | null = null;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeTriggered = false;
  let suppressNextClick = false;

  function handleBarPointerDown(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipePointerId = e.pointerId;
    swipeStartX = e.clientX;
    swipeStartY = e.clientY;
    swipeTriggered = false;
  }

  function handleBarPointerMove(e: PointerEvent) {
    if (swipePointerId !== e.pointerId || swipeTriggered) return;
    const dx = e.clientX - swipeStartX;
    const dy = e.clientY - swipeStartY;

    if (Math.abs(dy) > 10) {
      suppressNextClick = true;
    }

    // 明確向上滑動超過 24px 即開啟上次使用的精修面板
    if (dy < -24 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      swipeTriggered = true;
      swipePointerId = null;
      onSwipeOpen?.();
      setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }
  }

  function handleBarPointerEnd(e: PointerEvent) {
    if (swipePointerId !== e.pointerId) return;
    swipePointerId = null;
    if (suppressNextClick) {
      setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }
  }

  function handleBarClickCapture(e: MouseEvent) {
    if (suppressNextClick) {
      e.preventDefault();
      e.stopPropagation();
      suppressNextClick = false;
    }
  }
</script>

<!-- 行動端暗房操作工具列：不開面板即可直接執行單張一鍵 AI 與批次 AI，並保留風格/微調抽屜入口 -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="mobile-retouch-action-bar hairline-t font-mono"
  class:split-hidden={isHidden}
  onpointerdown={handleBarPointerDown}
  onpointermove={handleBarPointerMove}
  onpointerup={handleBarPointerEnd}
  onpointercancel={handleBarPointerEnd}
  onclickcapture={handleBarClickCapture}
>
  <button
    type="button"
    class="retouch-action-pill primary-ai"
    onclick={onRunAiAnalysis}
    disabled={isAiAnalyzing || isBatchAiRunning || !hasActivePhoto}
    title={t("mobileRetouch.aiDevelopTitle")}
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
        ? t("mobileRetouch.developing")
        : hasCustomStylePrompt
          ? t("mobileRetouch.aiWithVibe")
          : t("mobileRetouch.aiOneClick")}
    </span>
  </button>

  {#if totalPhotos > 1}
    {#if isBatchAiRunning}
      <button
        type="button"
        class="retouch-action-pill danger-stop"
        onclick={onCancelBatchAi}
        title={t("mobileRetouch.stopBatchTitle")}
      >
        <span class="material-symbols-outlined" style="font-size: 15px;"
          >stop_circle</span
        >
        <span
          >{t("mobileRetouch.stopBatch", {
            current: batchProgress?.current || 1,
            total: batchProgress?.total || totalPhotos,
          })}</span
        >
      </button>
    {:else}
      <button
        type="button"
        class="retouch-action-pill secondary-batch"
        onclick={onRequestBatchAi}
        disabled={isAiAnalyzing}
        title={t("mobileRetouch.batchTitle")}
      >
        <span class="material-symbols-outlined" style="font-size: 15px;"
          >auto_mode</span
        >
        <span>{t("mobileRetouch.batch", { count: flaggedCount > 0 ? flaggedCount : totalPhotos })}</span>
      </button>
    {/if}
  {/if}

  <button
    type="button"
    class="retouch-action-pill compact"
    class:active={activeMobileDrawer === "ai"}
    onclick={() => onToggleDrawer("ai")}
    title={t("mobileRetouch.styleTitle")}
  >
    <span class="material-symbols-outlined" style="font-size: 15px;"
      >palette</span
    >
    <span>{t("mobileRetouch.style")}</span>
  </button>

  <button
    type="button"
    class="retouch-action-pill compact"
    class:active={activeMobileDrawer === "tuning"}
    onclick={() => onToggleDrawer("tuning")}
    title={t("mobileRetouch.tuningTitle")}
  >
    <span class="material-symbols-outlined" style="font-size: 15px;">tune</span>
    <span>{t("mobileRetouch.tuning")}</span>
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
      touch-action: pan-x;
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

