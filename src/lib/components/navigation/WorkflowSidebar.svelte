<script lang="ts">
  type ModuleTab = 'catalog' | 'retouch' | 'profiles' | 'export' | 'devices';

  interface Props {
    activeTab: ModuleTab;
    totalPhotos: number;
    flaggedCount: number;
    activeQueueLength: number;
    profilesCount: number;
    onTabChange: (tab: ModuleTab) => void;
    onOpenHelp: () => void;
  }

  let {
    activeTab,
    totalPhotos,
    flaggedCount,
    activeQueueLength,
    profilesCount,
    onTabChange,
    onOpenHelp
  }: Props = $props();
</script>

<div class="sidebar-heading font-mono">WORKFLOW MODULES</div>

<nav class="nav-menu">
  <button
    class="nav-item"
    class:active={activeTab === 'catalog'}
    onclick={() => onTabChange('catalog')}
  >
    <span class="material-symbols-outlined">grid_view</span>
    <span class="nav-label">1. 膠卷目錄挑圖</span>
    <span class="nav-badge font-mono">{totalPhotos}</span>
  </button>

  <button
    class="nav-item"
    class:active={activeTab === 'retouch'}
    onclick={() => onTabChange('retouch')}
  >
    <span class="material-symbols-outlined">tonality</span>
    <span class="nav-label">2. 單張暗房精修</span>
    {#if flaggedCount > 0}
      <span class="nav-badge font-mono amber">{flaggedCount}</span>
    {/if}
  </button>

  <button
    class="nav-item"
    class:active={activeTab === 'export'}
    onclick={() => onTabChange('export')}
  >
    <span class="material-symbols-outlined">output_circle</span>
    <span class="nav-label">3. 批次匯出管線</span>
    <span class="nav-badge font-mono">{activeQueueLength}</span>
  </button>

  <button
    class="nav-item"
    class:active={activeTab === 'profiles'}
    onclick={() => onTabChange('profiles')}
  >
    <span class="material-symbols-outlined">palette</span>
    <span class="nav-label">3D LUT 風格庫</span>
    <span class="nav-badge font-mono">{profilesCount}</span>
  </button>

  <button
    class="nav-item"
    class:active={activeTab === 'devices'}
    onclick={() => onTabChange('devices')}
  >
    <span class="material-symbols-outlined">settings_input_component</span>
    <span class="nav-label">設備與存儲設定</span>
  </button>

  <button
    type="button"
    class="nav-item help-nav-btn"
    onclick={onOpenHelp}
    title="開啟系統操作與快捷鍵速查 (按 ?)"
  >
    <span class="material-symbols-outlined">help</span>
    <span class="nav-label">操作說明與快速鍵</span>
    <kbd class="kbd-chip">?</kbd>
  </button>
</nav>

<style>
  .sidebar-heading {
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--parchment-dim);
    padding: 0 8px 10px 8px;
  }

  .nav-menu {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: var(--parchment-muted);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    width: 100%;
  }
  .nav-item:hover {
    background-color: var(--surface-elevated);
    color: var(--parchment-bright);
  }
  .nav-item.active {
    background-color: var(--surface-overlay);
    color: var(--parchment-bright);
    border-left: 2px solid var(--primary-indigo);
  }
  .nav-label {
    flex: 1;
  }
  .nav-badge {
    font-size: 10px;
    padding: 2px 6px;
    background-color: var(--canvas-base);
    border-radius: var(--radius-xs);
    color: var(--parchment-dim);
  }
  .nav-badge.amber {
    color: var(--amber-highlight);
    border-color: rgba(226, 157, 82, 0.3);
    background-color: rgba(226, 157, 82, 0.1);
  }
  .help-nav-btn {
    margin-top: 8px;
    border-top: 1px dashed var(--hairline-dim);
    color: var(--parchment-muted);
  }
  .help-nav-btn:hover {
    color: var(--amber-highlight) !important;
  }
  .kbd-chip {
    background: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 9px;
    color: var(--amber-highlight);
  }
</style>

