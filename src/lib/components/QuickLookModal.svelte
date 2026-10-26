<script lang="ts">
  import type { CatalogPhotoItem } from '$lib/components/views/CatalogView.svelte';

  interface Props {
    isOpen?: boolean;
    photo: CatalogPhotoItem | null;
    onClose: () => void;
    onToggleFlag?: (photo: CatalogPhotoItem) => void;
    onNext?: () => void;
    onPrev?: () => void;
    hasNext?: boolean;
    hasPrev?: boolean;
  }

  let {
    isOpen = $bindable(false),
    photo = null,
    onClose,
    onToggleFlag,
    onNext,
    onPrev,
    hasNext = true,
    hasPrev = true
  }: Props = $props();

</script>

{#if isOpen && photo}
  <div 
    class="quicklook-backdrop" 
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <!-- Top Floating Curatorial HUD -->
    <header class="quicklook-header hairline-b font-mono">
      <div class="header-left">
        <span class="frame-tag amber hairline-all">{photo.frameNo}</span>
        <span class="file-title">{photo.filename}</span>
        <span class="sep">·</span>
        <span class="exif-telemetry">
          {photo.camera || 'RAW ARCHIVE'}
          {#if photo.lens} · {photo.lens}{/if}
          · ISO {photo.iso || '100'}
          · {photo.shutter || '1/125s'}
          · {photo.aperture || 'f/2.8'}
          {#if photo.focalLength} · {photo.focalLength}{/if}
        </span>
      </div>

      <div class="header-right">
        <!-- Pick / Flag Toggle Action Button -->
        <button 
          type="button" 
          class="pick-btn hairline-all" 
          class:picked={photo.flagged}
          onclick={() => onToggleFlag && onToggleFlag(photo)}
          title="按下鍵盤 P 鍵切換挑選狀態"
        >
          <span class="material-symbols-outlined icon">
            {photo.flagged ? 'bookmark_added' : 'bookmark_add'}
          </span>
          <span class="pick-label">{photo.flagged ? '已挑選 (PICKED)' : '挑選此幀'}</span>
          <kbd class="kbd-chip">P</kbd>
        </button>

        <button 
          type="button" 
          class="close-btn hairline-all" 
          onclick={onClose}
          title="關閉預覽 (Space 或 Esc)"
        >
          <span class="material-symbols-outlined">close</span>
          <kbd class="kbd-chip">Space</kbd>
        </button>
      </div>
    </header>

    <!-- Main Image Display Container -->
    <div class="quicklook-stage">
      <!-- Left Navigation Arrow -->
      <button 
        type="button" 
        class="nav-arrow left" 
        class:disabled={!hasPrev}
        onclick={onPrev}
        disabled={!hasPrev}
        title="上一張 (H 或 ←)"
      >
        <span class="material-symbols-outlined">chevron_left</span>
      </button>

      <!-- Central Full-Res Viewport -->
      <div class="image-wrapper">
        <img 
          src={photo.gradedThumbnail || photo.thumbnail} 
          alt={photo.filename}
          class="preview-img"
        />
        {#if photo.flagged}
          <div class="picked-watermark font-mono">
            <span class="material-symbols-outlined">bookmark</span>
            <span>PICKED</span>
          </div>
        {/if}
      </div>

      <!-- Right Navigation Arrow -->
      <button 
        type="button" 
        class="nav-arrow right" 
        class:disabled={!hasNext}
        onclick={onNext}
        disabled={!hasNext}
        title="下一張 (L 或 →)"
      >
        <span class="material-symbols-outlined">chevron_right</span>
      </button>
    </div>

    <!-- Bottom Telemetry & Navigation Guide Footer -->
    <footer class="quicklook-footer hairline-t font-mono">
      <div class="shortcuts-guide">
        <span class="guide-item">
          <kbd class="kbd-chip">H</kbd><kbd class="kbd-chip">L</kbd>
          <span class="guide-desc">翻頁瀏覽</span>
        </span>
        <span class="guide-sep">·</span>
        <span class="guide-item">
          <kbd class="kbd-chip">P</kbd>
          <span class="guide-desc">挑選 / 取消挑選</span>
        </span>
        <span class="guide-sep">·</span>
        <span class="guide-item">
          <kbd class="kbd-chip">Space</kbd> 或 <kbd class="kbd-chip">Esc</kbd>
          <span class="guide-desc">關閉大圖</span>
        </span>
      </div>
    </footer>
  </div>
{/if}

<style>
  .quicklook-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(6, 7, 9, 0.94);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    z-index: 2000;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    outline: none;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.99); }
    to { opacity: 1; transform: scale(1); }
  }

  .quicklook-header {
    height: 52px;
    padding: 0 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: rgba(20, 22, 26, 0.85);
    z-index: 10;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    color: var(--parchment-bright);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .frame-tag {
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 600;
    border-radius: var(--radius-xs);
    letter-spacing: 0.05em;
  }

  .frame-tag.amber {
    color: var(--amber-highlight);
    border-color: rgba(212, 163, 115, 0.4);
    background: rgba(212, 163, 115, 0.08);
  }

  .file-title {
    font-weight: 500;
    color: var(--parchment-bright);
  }

  .sep {
    color: var(--parchment-dim);
  }

  .exif-telemetry {
    color: var(--parchment-muted);
    font-size: 12px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .pick-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-radius: var(--radius-sm);
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-bright);
    font-size: 12px;
    font-family: var(--font-mono);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .pick-btn:hover {
    background-color: var(--surface-overlay);
    border-color: var(--amber-highlight);
  }

  .pick-btn.picked {
    background: rgba(212, 163, 115, 0.18);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    box-shadow: 0 0 16px rgba(212, 163, 115, 0.2);
  }

  .pick-btn .icon {
    font-size: 16px;
  }

  .close-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    background-color: transparent;
    border: 1px solid var(--hairline-dim);
    color: var(--parchment-muted);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    color: var(--parchment-bright);
    border-color: var(--hairline-slate);
    background-color: rgba(255, 255, 255, 0.05);
  }

  .kbd-chip {
    display: inline-block;
    padding: 1px 6px;
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--parchment-bright);
    background-color: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: var(--radius-xs);
  }

  .quicklook-stage {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    overflow: hidden;
  }

  .image-wrapper {
    position: relative;
    max-width: 90vw;
    max-height: calc(100vh - 120px);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.85);
    border-radius: var(--radius-xs);
    overflow: hidden;
    background-color: #0c0d0f;
  }

  .preview-img {
    max-width: 100%;
    max-height: calc(100vh - 120px);
    object-fit: contain;
    display: block;
    user-select: none;
  }

  .picked-watermark {
    position: absolute;
    top: 16px;
    right: 16px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background-color: rgba(18, 19, 22, 0.85);
    backdrop-filter: blur(6px);
    border: 1px solid var(--amber-highlight);
    color: var(--amber-highlight);
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  }

  .picked-watermark .material-symbols-outlined {
    font-size: 16px;
  }

  .nav-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 48px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(24, 25, 29, 0.6);
    border: 1px solid var(--hairline-dim);
    border-radius: var(--radius-sm);
    color: var(--parchment-bright);
    cursor: pointer;
    transition: all 0.2s ease;
    z-index: 5;
  }

  .nav-arrow:hover:not(:disabled) {
    background-color: rgba(32, 34, 39, 0.95);
    border-color: var(--parchment-dim);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  .nav-arrow:disabled {
    opacity: 0.2;
    cursor: not-allowed;
  }

  .nav-arrow.left {
    left: 20px;
  }

  .nav-arrow.right {
    right: 20px;
  }

  .quicklook-footer {
    height: 42px;
    padding: 0 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(20, 22, 26, 0.85);
    z-index: 10;
  }

  .shortcuts-guide {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 12px;
    color: var(--parchment-muted);
  }

  .guide-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .guide-desc {
    color: var(--parchment-bright);
  }

  .guide-sep {
    color: var(--parchment-dim);
  }
</style>
