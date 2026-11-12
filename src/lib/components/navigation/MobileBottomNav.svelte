<script lang="ts">
  type ModuleTab = "catalog" | "retouch" | "profiles" | "export" | "devices";

  interface Props {
    activeTab: ModuleTab;
    flaggedCount: number;
    isHidden?: boolean;
    onSelectTab: (tab: ModuleTab) => void;
  }

  let { activeTab, flaggedCount, isHidden = false, onSelectTab }: Props =
    $props();

  const navItems: { id: ModuleTab; icon: string; label: string }[] = [
    { id: "catalog", icon: "grid_view", label: "挑圖" },
    { id: "retouch", icon: "photo_filter", label: "精修" },
    { id: "export", icon: "ios_share", label: "導出/分享" },
    { id: "profiles", icon: "palette", label: "風格庫" },
    { id: "devices", icon: "settings", label: "設定" },
  ];
</script>

<!-- 行動端底部導航列 (Mobile Bottom Navigation Bar) -->
<nav
  class="mobile-bottom-nav hairline-t font-mono"
  class:split-hidden={isHidden}
>
  {#each navItems as item (item.id)}
    <button
      type="button"
      class="mobile-nav-item"
      class:active={activeTab === item.id}
      onclick={() => onSelectTab(item.id)}
    >
      <span class="material-symbols-outlined">{item.icon}</span>
      <span class="nav-text">{item.label}</span>
      {#if item.id === "catalog" && flaggedCount > 0}
        <span class="nav-badge">{flaggedCount}</span>
      {/if}
    </button>
  {/each}
</nav>

<style>
  /* 桌面端預設隱藏手機專屬底欄 */
  .mobile-bottom-nav {
    display: none;
  }

  @media (max-width: 768px) {
    /* 行動端底部導航列 */
    .mobile-bottom-nav {
      display: flex;
      height: 52px;
      background-color: var(--surface-panel);
      z-index: 900;
      align-items: center;
      justify-content: space-around;
      padding: 0 6px;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      flex-shrink: 0;
    }

    /* 手機版精修分割視窗開啟時，暫時隱藏底部導航列以騰出預覽空間 */
    .mobile-bottom-nav.split-hidden {
      display: none;
    }

    .mobile-nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: var(--parchment-dim);
      padding: 4px 10px;
      cursor: pointer;
      position: relative;
      font-size: 10px;
      gap: 2px;
      transition: color 0.15s ease;
    }

    .mobile-nav-item .material-symbols-outlined {
      font-size: 20px;
    }

    .mobile-nav-item.active {
      color: var(--amber-highlight);
    }

    .nav-badge {
      position: absolute;
      top: 2px;
      right: 6px;
      background-color: var(--amber-highlight);
      color: #121316;
      font-size: 9px;
      font-weight: 700;
      padding: 0 4px;
      border-radius: 8px;
    }
  }
</style>

