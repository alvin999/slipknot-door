<script lang="ts">
  import { ExportService } from '$lib/services/exportService';

  interface PhotoInfo {
    id: string;
    filename: string;
    frameNo?: string;
    thumbnail: string;
    gradedThumbnail?: string;
    camera?: string;
    appliedProfile?: string;
    colorSpace?: string;
  }

  interface Props {
    isOpen?: boolean;
    photo: PhotoInfo | null;
    exportMode?: 'modeA' | 'modeB';
    targetDir?: string;
    onClose: () => void;
    onExport: (mode: 'modeA' | 'modeB') => Promise<void> | void;
  }

  const initialDir = typeof localStorage !== 'undefined' && localStorage.getItem('slipknot_export_target_dir')
    ? localStorage.getItem('slipknot_export_target_dir')!
    : './Exports';

  let {
    isOpen = $bindable(false),
    photo = null,
    exportMode = 'modeA',
    targetDir = initialDir,
    onClose,
    onExport
  }: Props = $props();

  let selectedMode = $state<'modeA' | 'modeB'>('modeA');
  let isProcessing = $state<boolean>(false);
  let resultSuccess = $state<boolean>(false);
  let resolvedTargetDir = $state<string>(targetDir);

  // 同步外部傳入的 exportMode 與目標路徑解析
  $effect(() => {
    selectedMode = exportMode;
    ExportService.resolveExportPath(targetDir).then((res) => {
      resolvedTargetDir = res;
    });
  });

  async function handleConfirmExport() {
    if (!photo || isProcessing) return;
    isProcessing = true;
    try {
      await onExport(selectedMode);
      resultSuccess = true;
      setTimeout(() => {
        resultSuccess = false;
        isProcessing = false;
        onClose();
      }, 900);
    } catch {
      isProcessing = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleConfirmExport();
    } else if (e.key === '1' || e.key === 'a' || e.key === 'A') {
      selectedMode = 'modeA';
    } else if (e.key === '2' || e.key === 'b' || e.key === 'B') {
      selectedMode = 'modeB';
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen && photo}
  <div 
    class="modal-backdrop" 
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="export-modal-card hairline-all">
      <!-- Modal Header -->
      <header class="modal-header hairline-b font-mono">
        <div class="header-title">
          <span class="material-symbols-outlined bolt-icon">bolt</span>
          <div>
            <h3 class="title font-headline">單張即時出圖 (Quick Export)</h3>
            <span class="subtitle font-mono">INSTANT WEBGPU/WEBGL DIRECT DISPATCH</span>
          </div>
        </div>
        <button type="button" class="close-btn" onclick={onClose} title="關閉 (Esc)">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>

      <!-- Modal Body -->
      <div class="modal-body">
        <div class="preview-column">
          <div class="thumb-frame hairline-all">
            <img 
              src={photo.gradedThumbnail || photo.thumbnail} 
              alt={photo.filename} 
              class="thumb-img"
            />
            {#if photo.frameNo}
              <span class="frame-tag font-mono">{photo.frameNo}</span>
            {/if}
          </div>
          <span class="filename-text font-mono truncate">{photo.filename}</span>
        </div>

        <div class="config-column font-mono">
          <!-- Pipeline Mode Selector -->
          <div class="section-title">選擇出圖模式 (PIPELINE MODE)</div>
          <div class="mode-options-grid">
            <button 
              type="button" 
              class="mode-card hairline-all" 
              class:active={selectedMode === 'modeA'}
              onclick={() => selectedMode = 'modeA'}
            >
              <div class="mode-head">
                <span class="material-symbols-outlined icon amber">bolt</span>
                <span class="mode-badge amber">MODE A</span>
              </div>
              <div class="mode-name">社群極速直出</div>
              <div class="mode-sub">~88ms · 所見即所得 JPEG · Display P3</div>
              <kbd class="kbd-micro">按 1</kbd>
            </button>

            <button 
              type="button" 
              class="mode-card hairline-all" 
              class:active={selectedMode === 'modeB'}
              onclick={() => selectedMode = 'modeB'}
            >
              <div class="mode-head">
                <span class="material-symbols-outlined icon indigo">diamond</span>
                <span class="mode-badge indigo">MODE B</span>
              </div>
              <div class="mode-name">出版典藏母帶</div>
              <div class="mode-sub">16-bit 滿血無損 · ProPhoto RGB 印刷級</div>
              <kbd class="kbd-micro">按 2</kbd>
            </button>
          </div>

          <!-- Metadata & Destination Details -->
          <div class="metadata-box hairline-all">
            <div class="meta-row">
              <span class="label">儲存目錄：</span>
              <span class="val truncate" title={resolvedTargetDir || targetDir}>{resolvedTargetDir || targetDir}</span>
            </div>
            <div class="meta-row">
              <span class="label">匯出檔名：</span>
              <span class="val amber truncate">{photo.filename.replace(/\.[^/.]+$/, '')}_graded.jpg</span>
            </div>
            <div class="meta-row">
              <span class="label">套用風格：</span>
              <span class="val">{photo.appliedProfile || '標準自然 (Natural)'}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <footer class="modal-footer hairline-t font-mono">
        <div class="footer-hint">
          <kbd class="kbd-chip">Enter</kbd>
          <span>立即匯出</span>
          <span class="sep">·</span>
          <kbd class="kbd-chip">Esc</kbd>
          <span>取消</span>
        </div>

        <div class="footer-actions">
          <button type="button" class="archival-btn-secondary" onclick={onClose} disabled={isProcessing}>
            取消
          </button>
          <button 
            type="button" 
            class="archival-btn-primary dispatch-btn" 
            class:success={resultSuccess}
            onclick={handleConfirmExport}
            disabled={isProcessing}
          >
            <span class="material-symbols-outlined">
              {resultSuccess ? 'check_circle' : isProcessing ? 'sync' : 'download'}
            </span>
            <span>
              {resultSuccess ? '✓ 已完成匯出！' : isProcessing ? '正在輸出中...' : '立即匯出當前幀 ↵'}
            </span>
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(8, 9, 11, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2200;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.98); }
    to { opacity: 1; transform: scale(1); }
  }

  .export-modal-card {
    width: 620px;
    max-width: 90vw;
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    padding: 16px 20px;
    background-color: var(--surface-elevated);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .bolt-icon {
    font-size: 24px;
    color: var(--amber-highlight);
  }

  .title {
    font-size: 15px;
    font-weight: 600;
    color: var(--parchment-bright);
  }

  .subtitle {
    font-size: 9px;
    color: var(--parchment-dim);
    letter-spacing: 0.1em;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--parchment-muted);
    cursor: pointer;
    display: flex;
    padding: 4px;
    border-radius: var(--radius-sm);
  }
  .close-btn:hover {
    color: var(--parchment-bright);
    background-color: rgba(255, 255, 255, 0.08);
  }

  .modal-body {
    display: flex;
    gap: 20px;
    padding: 20px;
  }

  .preview-column {
    width: 170px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .thumb-frame {
    width: 170px;
    height: 120px;
    background-color: #0b0c0e;
    border-radius: var(--radius-xs);
    overflow: hidden;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .thumb-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .frame-tag {
    position: absolute;
    top: 6px;
    left: 6px;
    padding: 2px 6px;
    font-size: 10px;
    background: rgba(18, 19, 22, 0.85);
    border: 1px solid var(--amber-highlight);
    color: var(--amber-highlight);
    border-radius: var(--radius-xs);
  }

  .filename-text {
    font-size: 11px;
    color: var(--parchment-bright);
    max-width: 170px;
    text-align: center;
  }

  .config-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-title {
    font-size: 11px;
    color: var(--parchment-dim);
    letter-spacing: 0.08em;
  }

  .mode-options-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .mode-card {
    padding: 12px;
    background-color: rgba(26, 28, 34, 0.4);
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    flex-direction: column;
    gap: 4px;
    position: relative;
  }

  .mode-card:hover {
    background-color: rgba(35, 38, 45, 0.6);
    border-color: var(--parchment-dim);
  }

  .mode-card.active {
    background-color: rgba(212, 163, 115, 0.08);
    border-color: var(--amber-highlight);
    box-shadow: 0 0 12px rgba(212, 163, 115, 0.15);
  }

  .mode-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .mode-head .icon {
    font-size: 18px;
  }
  .icon.amber { color: var(--amber-highlight); }
  .icon.indigo { color: var(--primary-indigo); }

  .mode-badge {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: var(--radius-xs);
  }
  .mode-badge.amber {
    background: rgba(212, 163, 115, 0.15);
    color: var(--amber-highlight);
  }
  .mode-badge.indigo {
    background: rgba(96, 130, 182, 0.15);
    color: var(--primary-indigo);
  }

  .mode-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--parchment-bright);
    margin-top: 2px;
  }

  .mode-sub {
    font-size: 10px;
    color: var(--parchment-muted);
    line-height: 1.4;
  }

  .kbd-micro {
    position: absolute;
    bottom: 8px;
    right: 8px;
    font-size: 9px;
    color: var(--parchment-dim);
    background: rgba(255, 255, 255, 0.05);
    padding: 1px 4px;
    border-radius: 2px;
  }

  .metadata-box {
    padding: 10px 14px;
    background-color: rgba(20, 22, 26, 0.6);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
  }

  .meta-row {
    display: flex;
    gap: 8px;
    overflow: hidden;
  }

  .meta-row .label {
    color: var(--parchment-dim);
    flex-shrink: 0;
  }

  .meta-row .val {
    color: var(--parchment-bright);
  }
  .meta-row .val.amber {
    color: var(--amber-highlight);
  }

  .modal-footer {
    padding: 14px 20px;
    background-color: var(--surface-elevated);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .footer-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--parchment-muted);
  }

  .kbd-chip {
    padding: 1px 5px;
    font-size: 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 2px;
    color: var(--parchment-bright);
  }

  .sep { color: var(--parchment-dim); }

  .footer-actions {
    display: flex;
    gap: 10px;
  }

  .dispatch-btn {
    min-width: 140px;
    justify-content: center;
  }

  .dispatch-btn.success {
    background-color: var(--success-green) !important;
    border-color: var(--success-green) !important;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
