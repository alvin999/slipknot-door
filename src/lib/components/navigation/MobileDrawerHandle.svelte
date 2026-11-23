<script lang="ts">
  import { t } from "$lib/i18n";

  type MobileDrawer = "none" | "ai" | "tuning";

  interface Props {
    variant?: "split" | "drag";
    activeMobileDrawer?: MobileDrawer;
    isExpanded?: boolean;
    onSelectDrawer?: (drawer: MobileDrawer) => void;
    onToggleExpand?: () => void;
    onClose: () => void;
    onDragStart?: () => void;
    onDragMove?: (deltaY: number) => void;
    onDragEnd?: (deltaY: number, velocityY: number) => void;
  }

  let {
    variant = "drag",
    activeMobileDrawer = "none",
    isExpanded = false,
    onSelectDrawer,
    onToggleExpand,
    onClose,
    onDragStart,
    onDragMove,
    onDragEnd,
  }: Props = $props();

  // 把手列垂直拖曳手勢狀態（供手機版分割視窗即時跟手縮放與吸附）
  let dragPointerId = $state<number | null>(null);
  let dragStartY = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocityY = 0;
  let isDragging = $state(false);
  let suppressNextClick = false;

  function handlePointerDown(e: PointerEvent) {
    if (variant !== "split") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragPointerId = e.pointerId;
    dragStartY = e.clientY;
    lastY = e.clientY;
    lastTime = performance.now();
    velocityY = 0;
    isDragging = false;
  }

  function handlePointerMove(e: PointerEvent) {
    if (dragPointerId !== e.pointerId) return;
    const deltaY = e.clientY - dragStartY;

    // 位移超過 6px 才進入拖曳模式，避免影響正常點擊按鈕
    if (!isDragging) {
      if (Math.abs(deltaY) < 6) return;
      isDragging = true;
      suppressNextClick = true;
      (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
      onDragStart?.();
    }

    const now = performance.now();
    const dt = now - lastTime;
    if (dt > 0) {
      // 平滑化垂直速度 (px/ms)，供放開後的慣性吸附判定
      const instantVelocity = (e.clientY - lastY) / dt;
      velocityY = velocityY * 0.4 + instantVelocity * 0.6;
    }
    lastY = e.clientY;
    lastTime = now;

    onDragMove?.(deltaY);
  }

  function finishDrag(e: PointerEvent, cancelled = false) {
    if (dragPointerId !== e.pointerId) return;
    const wasDragging = isDragging;
    const deltaY = e.clientY - dragStartY;
    const finalVelocity = cancelled ? 0 : velocityY;

    if (wasDragging) {
      (e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId);
      onDragEnd?.(deltaY, finalVelocity);
      // 下一個 tick 清除點擊攔截，避免剛放開拖曳時誤觸按鈕
      setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }

    dragPointerId = null;
    isDragging = false;
  }

  function handleClickCapture(e: MouseEvent) {
    if (suppressNextClick) {
      e.preventDefault();
      e.stopPropagation();
      suppressNextClick = false;
    }
  }
</script>

<!-- 行動端抽屜收合把手 (Mobile Drawer Handle) -->
{#if variant === "split"}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="mobile-drawer-handle-bar split-header"
    class:is-dragging={isDragging}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={(e) => finishDrag(e, false)}
    onpointercancel={(e) => finishDrag(e, true)}
    onclickcapture={handleClickCapture}
  >
    <div class="drawer-drag-pill split-pill" aria-hidden="true"></div>
    <div class="split-header-controls">
      <div class="mobile-drawer-switch-group font-mono">
        <button
          type="button"
          class="drawer-switch-pill"
          class:active={activeMobileDrawer === "ai"}
          onclick={() => onSelectDrawer?.("ai")}
        >
          <span class="material-symbols-outlined" style="font-size: 13px;"
            >palette</span
          >
          <span>{t("mobileDrawer.style")}</span>
        </button>
        <button
          type="button"
          class="drawer-switch-pill"
          class:active={activeMobileDrawer === "tuning"}
          onclick={() => onSelectDrawer?.("tuning")}
        >
          <span class="material-symbols-outlined" style="font-size: 13px;"
            >tune</span
          >
          <span>{t("mobileDrawer.tuning")}</span>
        </button>
      </div>
      <div class="mobile-drawer-right-actions">
        {#if onToggleExpand}
          <button
            type="button"
            class="drawer-expand-btn font-mono"
            class:active={isExpanded}
            onclick={onToggleExpand}
            title={isExpanded ? t("mobileDrawer.collapseHalfTitle") : t("mobileDrawer.expandFullTitle")}
          >
            <span class="material-symbols-outlined" style="font-size: 13px;">
              {isExpanded ? "close_fullscreen" : "open_in_full"}
            </span>
            <span>{isExpanded ? t("mobileDrawer.half") : t("mobileDrawer.expand")}</span>
          </button>
        {/if}
        <button type="button" class="drawer-close-btn font-mono" onclick={onClose}>
          <span>{t("mobileDrawer.collapse")}</span>
          <span class="material-symbols-outlined" style="font-size: 15px;"
            >keyboard_arrow_down</span
          >
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="mobile-drawer-handle-bar">
    <div class="drawer-drag-pill"></div>
    <button type="button" class="drawer-close-btn font-mono" onclick={onClose}>
      <span>{t("mobileDrawer.collapsePanel")}</span>
      <span class="material-symbols-outlined" style="font-size: 14px;"
        >keyboard_arrow_down</span
      >
    </button>
  </div>
{/if}

<style>
  /* 桌面端預設隱藏手機專屬抽屜把手 */
  .mobile-drawer-handle-bar {
    display: none;
  }

  @media (max-width: 768px) {
    /* 行動端抽屜收合把手 */
    .mobile-drawer-handle-bar {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-bottom: 8px;
      margin-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      position: sticky;
      top: 0;
      background-color: var(--surface-panel);
      z-index: 10;
    }

    .drawer-drag-pill {
      width: 36px;
      height: 4px;
      background-color: rgba(255, 255, 255, 0.25);
      border-radius: 2px;
      margin-bottom: 6px;
    }

    .drawer-close-btn {
      background: none;
      border: none;
      color: var(--parchment-dim);
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .drawer-close-btn:hover {
      color: var(--amber-highlight);
    }

    /* 手機版精修分割視窗頂部切換列 */
    .mobile-drawer-handle-bar.split-header {
      flex-direction: column;
      align-items: stretch;
      padding: 6px 0;
      margin-bottom: 6px;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      cursor: grab;
    }

    .mobile-drawer-handle-bar.split-header.is-dragging {
      cursor: grabbing;
    }

    .drawer-drag-pill.split-pill {
      align-self: center;
      margin-bottom: 5px;
      transition: background-color 0.15s ease, width 0.15s ease;
    }

    .mobile-drawer-handle-bar.split-header.is-dragging .drawer-drag-pill.split-pill {
      width: 48px;
      background-color: var(--amber-highlight);
    }

    .split-header-controls {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      width: 100%;
    }

    .mobile-drawer-switch-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .drawer-switch-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 14px;
      border: 1px solid var(--hairline-slate);
      background: rgba(255, 255, 255, 0.04);
      color: var(--parchment-dim);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .drawer-switch-pill.active {
      background: rgba(212, 163, 115, 0.16);
      border-color: var(--amber-highlight);
      color: var(--amber-highlight);
      font-weight: 600;
    }

    .mobile-drawer-right-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .drawer-expand-btn {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.04);
      color: var(--parchment-dim);
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .drawer-expand-btn.active,
    .drawer-expand-btn:hover {
      border-color: var(--amber-highlight);
      color: var(--amber-highlight);
      background: rgba(212, 163, 115, 0.1);
    }
  }
</style>

