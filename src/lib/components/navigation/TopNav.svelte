<script lang="ts">
  import { IngestionService, type CameraMountInfo } from '$lib/services/ingestionService';

  type ModuleTab = 'catalog' | 'retouch' | 'profiles' | 'export' | 'devices';

  interface Props {
    activeTab: ModuleTab;
    cameraMounts: CameraMountInfo[];
    isScanningMounts: boolean;
    latestExtractionMs: number;
    flaggedCount: number;
    totalPhotos: number;
    activeQueueLength: number;
    exportMode: 'modeA' | 'modeB';
    isExporting: boolean;
    onSelectMount: () => void;
    onGoToCatalog: () => void;
    onGoToRetouch: () => void;
    onGoToExport: () => void;
    onOpenQuickExport: () => void;
    onTriggerExport: () => void;
    onOpenHelp: () => void;
  }

  let {
    activeTab,
    cameraMounts,
    isScanningMounts,
    latestExtractionMs,
    flaggedCount,
    totalPhotos,
    activeQueueLength,
    exportMode,
    isExporting,
    onSelectMount,
    onGoToCatalog,
    onGoToRetouch,
    onGoToExport,
    onOpenQuickExport,
    onTriggerExport,
    onOpenHelp
  }: Props = $props();
</script>

<header class="top-nav hairline-b">
  <div class="brand-block">
    <img src="/favicon.png" alt="大相無形 Logo" class="brand-icon-img" />
    <div class="brand-titles">
      <h1 class="brand-title font-headline">大相無形</h1>
      <span class="brand-sub font-mono">SLIPKNOTTING ON HEAVEN'S DOOR · 0.1.0</span>
    </div>
  </div>

  <!-- Active Hardware Ingestion Indicator -->
  <button
    type="button"
    class="device-telemetry hairline-all"
    onclick={onSelectMount}
    title={cameraMounts.length > 0
      ? '點擊一鍵載入相機 DCIM 底片'
      : !IngestionService.isTauri()
        ? '瀏覽器環境：點擊手動選取相機資料夾 (或執行桌面版自動偵測)'
        : '點擊重新偵測相機外接裝置'}
  >
    <span
      class="status-dot"
      class:scanning={isScanningMounts}
      class:connected={cameraMounts.length > 0}
    ></span>
    <span class="device-name font-mono">
      {#if cameraMounts.length > 0}
        {cameraMounts[0].volume_name} // 隨插即讀已連線
      {:else if !IngestionService.isTauri()}
        瀏覽器模式 // 點擊開啟相機目錄 (RAW/JPG)
      {:else}
        未偵測到相機掛載
      {/if}
    </span>
    <span class="divider">|</span>
    <span class="device-metric font-mono">
      {#if cameraMounts.length > 0}
        載入 {cameraMounts[0].file_count} 幀 RAW ↵
      {:else if !IngestionService.isTauri()}
        支援手動載入
      {:else}
        等待接線
      {/if}
    </span>
  </button>

  <!-- 3-STEP SEQUENTIAL WORKFLOW BUTTONS -->
  <div class="stepper-pipeline hairline-all font-mono">
    <!-- Step 1: Catalog Selection -->
    <button
      type="button"
      class="stepper-step"
      class:active={activeTab === 'catalog'}
      onclick={onGoToCatalog}
      title="按鈕一：目錄挑選底片"
    >
      <span class="step-num">01</span>
      <span class="step-label">目錄挑選</span>
      {#if flaggedCount > 0}
        <span class="step-tag amber">{flaggedCount} 幀</span>
      {:else if totalPhotos > 0}
        <span class="step-tag">{totalPhotos} 幀</span>
      {/if}
    </button>

    <span class="stepper-sep">➔</span>

    <!-- Step 2: Darkroom Retouch -->
    <button
      type="button"
      class="stepper-step"
      class:active={activeTab === 'retouch'}
      onclick={onGoToRetouch}
      title="按鈕二：單張暗房精修（若有選取則僅出現選取底片，未選取則全部顯示）"
    >
      <span class="step-num">02</span>
      <span class="step-label">一鍵精修</span>
      {#if activeQueueLength > 0}
        <span class="step-tag" class:amber={flaggedCount > 0}>
          {activeQueueLength} 幀 {flaggedCount > 0 ? '(挑選)' : '(全量)'}
        </span>
      {/if}
    </button>

    <span class="stepper-sep">➔</span>

    <!-- Step 3: Batch Export -->
    <button
      type="button"
      class="stepper-step"
      class:active={activeTab === 'export'}
      onclick={onGoToExport}
      title="按鈕三：批次導出管線"
    >
      <span class="step-num">03</span>
      <span class="step-label">批次導出</span>
      {#if activeQueueLength > 0}
        <span class="step-tag">{activeQueueLength} 幀</span>
      {/if}
    </button>
  </div>

  <!-- Right Controls: Dynamic Sequential Action Button -->
  <div class="top-actions">
    <div class="archival-chip font-mono amber">
      <span class="material-symbols-outlined" style="font-size: 14px;">bolt</span>
      RAW 預覽 {latestExtractionMs}MS
    </div>
    <div class="archival-chip font-mono">
      <span class="material-symbols-outlined" style="font-size: 14px;">memory</span>
      GPU 著色器 60FPS
    </div>

    {#if activeTab === 'catalog'}
      <!-- STEP 1 PRIMARY ACTION -->
      <button
        class="archival-btn-primary stepper-cta amber-glow"
        onclick={onGoToRetouch}
        disabled={totalPhotos === 0}
        title="步驟一動作：一鍵進入暗房精修（若有選取則僅精修選取幀，未選取則精修全部）"
      >
        <span class="material-symbols-outlined" style="font-size: 16px;">tonality</span>
        <span class="btn-text-full">
          {#if flaggedCount > 0}
            一鍵精修 ({flaggedCount} 幀) →
          {:else}
            一鍵精修 (全部) →
          {/if}
        </span>
        <span class="btn-text-short">
          {#if flaggedCount > 0}
            精修 ({flaggedCount}) →
          {:else}
            精修 (全) →
          {/if}
        </span>
      </button>
    {:else if activeTab === 'retouch'}
      <button
        class="archival-btn-secondary"
        onclick={onOpenQuickExport}
        title="單張即時出圖 (⌘E)"
        style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: var(--radius-xs); border: 1px solid var(--hairline-slate); background: var(--surface-panel); color: var(--amber-highlight); cursor: pointer; font-size: 11px; white-space: nowrap; flex-shrink: 0;"
      >
        <span class="material-symbols-outlined" style="font-size: 15px;">bolt</span>
        <span class="btn-text-full">即時出圖 (⌘E)</span>
        <span class="btn-text-short">即時出圖</span>
      </button>
      <!-- STEP 2 PRIMARY ACTION -->
      <button
        class="archival-btn-primary stepper-cta cyan-glow"
        onclick={onGoToExport}
        title="步驟二動作：完成調色，前往批次導出"
      >
        <span class="material-symbols-outlined" style="font-size: 16px;">output_circle</span>
        <span class="btn-text-full">完成精修，前往導出 ({activeQueueLength} 幀) →</span>
        <span class="btn-text-short">導出 ({activeQueueLength}) →</span>
      </button>
    {:else}
      <!-- STEP 3 PRIMARY ACTION -->
      <button
        class="archival-btn-primary stepper-cta"
        onclick={onTriggerExport}
        disabled={isExporting || activeQueueLength === 0}
        title="步驟三動作：執行批次出圖管線"
      >
        <span class="material-symbols-outlined" style="font-size: 16px;">
          {exportMode === 'modeA' ? 'bolt' : 'hd'}
        </span>
        <span class="btn-text-full">{isExporting ? '匯出中...' : `批次導出 (${activeQueueLength} 幀) ⚡`}</span>
        <span class="btn-text-short">{isExporting ? '匯出中' : `導出 (${activeQueueLength}) ⚡`}</span>
      </button>
    {/if}

    <!-- Help & Shortcuts Button -->
    <button
      type="button"
      class="help-trigger-btn hairline-all font-mono"
      onclick={onOpenHelp}
      title="系統操作與鍵盤快捷鍵指南 (按 ?)"
      aria-label="系統操作與鍵盤快捷鍵指南"
    >
      <span class="material-symbols-outlined icon">help_outline</span>
    </button>
  </div>
</header>

<style>
  .top-nav {
    height: 52px;
    background-color: var(--surface-panel);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }

  .brand-block {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
  .brand-icon-img {
    width: 24px;
    height: 24px;
    object-fit: contain;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.45));
    user-select: none;
    -webkit-user-drag: none;
  }
  .brand-titles {
    display: flex;
    flex-direction: column;
    white-space: nowrap;
  }
  .brand-title {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }
  .brand-sub {
    font-size: 9px;
    color: var(--parchment-dim);
    letter-spacing: 0.08em;
  }

  .device-telemetry {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    cursor: pointer;
    border: 1px solid var(--hairline-slate);
    color: inherit;
    transition: all 0.15s ease;
  }
  .device-telemetry:hover {
    border-color: var(--primary-indigo);
    background-color: var(--surface-overlay);
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--primary-indigo);
    box-shadow: 0 0 6px var(--primary-indigo);
  }
  .status-dot.scanning {
    background-color: var(--amber-highlight);
    box-shadow: 0 0 6px var(--amber-highlight);
    animation: dotPulse 0.8s ease-in-out infinite alternate;
  }
  @keyframes dotPulse {
    from {
      opacity: 0.4;
    }
    to {
      opacity: 1;
    }
  }
  .device-name {
    color: var(--parchment-bright);
  }
  .divider {
    color: var(--parchment-ghost);
  }
  .device-metric {
    color: var(--amber-highlight);
  }

  .top-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .help-trigger-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-sm);
    color: var(--parchment-muted);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .help-trigger-btn:hover {
    color: var(--parchment-bright);
    border-color: var(--amber-highlight);
    background-color: var(--surface-overlay);
  }
  .help-trigger-btn .icon {
    font-size: 18px;
    color: var(--amber-highlight);
  }

  /* 3-STEP SEQUENTIAL PIPELINE */
  .stepper-pipeline {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: rgba(22, 23, 26, 0.85);
    padding: 3px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--hairline-slate);
    user-select: none;
  }

  .stepper-step {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--parchment-dim);
    padding: 4px 8px;
    border-radius: var(--radius-xs);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .stepper-step:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-elevated);
  }

  .stepper-step.active {
    background-color: var(--surface-overlay);
    color: var(--parchment-bright);
    border-color: var(--hairline-slate);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
  }

  .step-num {
    color: var(--primary-indigo);
    font-weight: 700;
    font-size: 10px;
  }

  .stepper-step.active .step-num {
    color: var(--amber-highlight);
  }

  .step-label {
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .step-tag {
    font-size: 10px;
    background-color: var(--surface-elevated);
    color: var(--parchment-dim);
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .step-tag.amber {
    color: var(--amber-highlight);
    border-color: rgba(226, 157, 82, 0.3);
    background-color: rgba(226, 157, 82, 0.1);
  }

  .stepper-sep {
    font-size: 10px;
    color: var(--parchment-ghost);
    opacity: 0.6;
  }

  /* 按鈕長短文案切換（預設桌面版顯示完整文案） */
  .btn-text-full {
    display: inline;
    white-space: nowrap;
  }
  .btn-text-short {
    display: none;
    white-space: nowrap;
  }

  /* STEPPER CTA HIGHLIGHTS */
  .stepper-cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .amber-glow {
    background: linear-gradient(135deg, var(--amber-highlight), #d48b3b) !important;
    color: #121214 !important;
    border: 1px solid rgba(226, 157, 82, 0.9) !important;
    box-shadow: 0 0 14px rgba(226, 157, 82, 0.3);
  }

  .amber-glow:hover {
    filter: brightness(1.1);
    box-shadow: 0 0 18px rgba(226, 157, 82, 0.45);
  }

  .cyan-glow {
    background: linear-gradient(135deg, #4b92b6, #2d6b8c) !important;
    color: #ffffff !important;
    border: 1px solid rgba(75, 146, 182, 0.9) !important;
    box-shadow: 0 0 14px rgba(75, 146, 182, 0.3);
  }

  .cyan-glow:hover {
    filter: brightness(1.1);
    box-shadow: 0 0 18px rgba(75, 146, 182, 0.45);
  }

  /* ── 行動端頂部列響應式 (Mobile TopNav Layout) ── */
  @media (max-width: 768px) {
    .top-nav {
      height: 48px;
      padding: 0 10px;
    }

    .brand-sub,
    .device-metric,
    .divider,
    .stepper-pipeline,
    .archival-chip,
    .btn-text-full {
      display: none;
    }

    .btn-text-short {
      display: inline;
    }

    .brand-title {
      font-size: 14px;
    }

    .device-telemetry {
      padding: 4px 8px;
      font-size: 10px;
      max-width: 130px;
    }

    .device-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .top-actions {
      gap: 6px;
      flex-shrink: 0;
    }
  }

  @media (max-width: 480px) {
    .top-nav {
      padding: 0 8px;
    }

    .brand-block {
      gap: 6px;
    }

    .brand-title {
      font-size: 13px;
    }

    .device-telemetry {
      max-width: 72px;
      padding: 3px 6px;
      font-size: 9px;
    }

    .help-trigger-btn {
      width: 28px;
      height: 28px;
    }

    .help-trigger-btn .icon {
      font-size: 16px;
    }
  }
</style>

