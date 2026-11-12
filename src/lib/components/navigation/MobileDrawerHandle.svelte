<script lang="ts">
  type MobileDrawer = "none" | "ai" | "tuning";

  interface Props {
    variant?: "split" | "drag";
    activeMobileDrawer?: MobileDrawer;
    isExpanded?: boolean;
    onSelectDrawer?: (drawer: MobileDrawer) => void;
    onToggleExpand?: () => void;
    onClose: () => void;
  }

  let {
    variant = "drag",
    activeMobileDrawer = "none",
    isExpanded = false,
    onSelectDrawer,
    onToggleExpand,
    onClose,
  }: Props = $props();
</script>

<!-- 行動端抽屜收合把手 (Mobile Drawer Handle) -->
{#if variant === "split"}
  <div class="mobile-drawer-handle-bar split-header">
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
        <span>風格</span>
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
        <span>微調</span>
      </button>
    </div>
    <div class="mobile-drawer-right-actions">
      {#if onToggleExpand}
        <button
          type="button"
          class="drawer-expand-btn font-mono"
          class:active={isExpanded}
          onclick={onToggleExpand}
          title={isExpanded ? "切換回半高預覽" : "展開較高面板"}
        >
          <span class="material-symbols-outlined" style="font-size: 13px;">
            {isExpanded ? "close_fullscreen" : "open_in_full"}
          </span>
          <span>{isExpanded ? "半高" : "展開"}</span>
        </button>
      {/if}
      <button type="button" class="drawer-close-btn font-mono" onclick={onClose}>
        <span>收合</span>
        <span class="material-symbols-outlined" style="font-size: 15px;"
          >keyboard_arrow_down</span
        >
      </button>
    </div>
  </div>
{:else}
  <div class="mobile-drawer-handle-bar">
    <div class="drawer-drag-pill"></div>
    <button type="button" class="drawer-close-btn font-mono" onclick={onClose}>
      <span>收合面板</span>
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
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0 6px;
      margin-bottom: 6px;
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

