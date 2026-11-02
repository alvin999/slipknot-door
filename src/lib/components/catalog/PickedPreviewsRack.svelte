<script lang="ts">
  interface Props {
    flaggedPhotos: any[];
    activePhotoId?: string;
    totalPhotos: number;
    onSelectPhoto: (photo: any) => void;
    onOpenRetouch: (photo: any) => void;
    onToggleFlag: (photo: any, event: MouseEvent) => void;
    onClearAllFlags: () => void;
    onGoToRetouch: () => void;
  }

  let {
    flaggedPhotos,
    activePhotoId,
    totalPhotos,
    onSelectPhoto,
    onOpenRetouch,
    onToggleFlag,
    onClearAllFlags,
    onGoToRetouch
  }: Props = $props();

  let flaggedCount = $derived(flaggedPhotos.length);
</script>

<div class="telemetry-box curatorial-preview-box">
  <div class="curatorial-preview-header">
    <div class="box-title font-mono" style="margin-bottom: 0;">
      PICKED PREVIEWS ({flaggedCount} 幀)
    </div>
    {#if flaggedCount > 0}
      <button
        type="button"
        class="clear-flags-btn font-mono"
        onclick={onClearAllFlags}
        title="清空所有挑圖勾選"
      >
        清空勾選
      </button>
    {/if}
  </div>

  {#if flaggedCount > 0}
    <div class="curatorial-thumbs-list">
      {#each flaggedPhotos as item (item.id)}
        <div
          class="curatorial-thumb-item hairline-all"
          class:active={activePhotoId === item.id}
          onclick={() => onSelectPhoto(item)}
          ondblclick={() => onOpenRetouch(item)}
          title="點擊聚焦預覽，雙擊前往精修"
          role="button"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === 'Enter') onOpenRetouch(item);
          }}
        >
          <div class="thumb-img-wrapper">
            <img
              src={item.gradedThumbnail || item.thumbnail}
              alt={item.filename}
              class="thumb-img"
              loading="lazy"
            />
            <span class="thumb-frame-tag font-mono">#{item.frameNo}</span>
          </div>
          <div class="thumb-info font-mono">
            <div class="thumb-filename truncate">{item.filename}</div>
            <div class="thumb-meta">
              <span>{item.shutter}</span>
              <span>{item.aperture}</span>
              <span>ISO {item.iso}</span>
            </div>
          </div>
          <button
            type="button"
            class="thumb-unflag-btn"
            onclick={(e) => onToggleFlag(item, e)}
            title="取消勾選此張相片"
          >
            <span class="material-symbols-outlined" style="font-size: 14px;">close</span>
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <!-- Empty state when no photo is flagged yet -->
    <div class="empty-curatorial-card hairline-all font-mono">
      <span class="material-symbols-outlined empty-guide-icon">bookmarks</span>
      <div class="empty-guide-title">尚未勾選任何相片</div>
      <p class="empty-guide-desc">
        在目錄中按 <kbd class="kbd-chip">Space</kbd> 或點擊右上角書籤標記挑圖。
      </p>
      <div class="empty-guide-sub">
        ※ 若未特別勾選，前往精修時將自動帶入全部 ({totalPhotos} 幀)
      </div>
    </div>
  {/if}
</div>

<!-- 下一個步驟是前往精修 -->
<div class="telemetry-box hairline-t mt-auto">
  <button
    type="button"
    class="archival-btn-primary w-full step-cta-btn"
    onclick={onGoToRetouch}
    disabled={totalPhotos === 0}
    title="下一個步驟：前往暗房精修"
  >
    <span class="material-symbols-outlined" style="font-size: 16px;">tonality</span>
    <span>
      {flaggedCount > 0
        ? `前往暗房精修 (已選 ${flaggedCount} 幀) →`
        : `前往暗房精修 (全量 ${totalPhotos} 幀) →`}
    </span>
  </button>
</div>

<style>
  .telemetry-box {
    padding: 14px;
  }
  .box-title {
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--parchment-dim);
    margin-bottom: 10px;
  }
  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mt-auto {
    margin-top: auto;
  }
  .w-full {
    width: 100%;
    justify-content: center;
  }

  /* CURATORIAL PICKED PREVIEW (CATALOG MODE RIGHT SIDEBAR) */
  .curatorial-preview-box {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .curatorial-preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .clear-flags-btn {
    background: transparent;
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    color: var(--parchment-dim);
    font-size: 10px;
    padding: 2px 7px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .clear-flags-btn:hover {
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
  }
  .curatorial-thumbs-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    max-height: calc(100vh - 380px);
    padding-right: 4px;
  }
  .curatorial-thumb-item {
    display: flex;
    align-items: center;
    gap: 10px;
    background-color: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-sm);
    padding: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }
  .curatorial-thumb-item:hover {
    background-color: var(--surface-overlay);
    border-color: var(--parchment-muted);
  }
  .curatorial-thumb-item.active {
    border-color: var(--amber-highlight);
    background-color: var(--surface-overlay);
  }
  .thumb-img-wrapper {
    position: relative;
    width: 52px;
    height: 52px;
    flex-shrink: 0;
    border-radius: var(--radius-xs);
    overflow: hidden;
    background-color: var(--canvas-base);
  }
  .thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .thumb-frame-tag {
    position: absolute;
    bottom: 2px;
    right: 2px;
    font-size: 9px;
    background: rgba(0, 0, 0, 0.7);
    color: var(--parchment-bright);
    padding: 1px 3px;
    border-radius: 2px;
  }
  .thumb-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .thumb-filename {
    font-size: 11px;
    color: var(--parchment-bright);
    font-weight: 500;
  }
  .thumb-meta {
    font-size: 9px;
    color: var(--parchment-dim);
    display: flex;
    gap: 6px;
  }
  .thumb-unflag-btn {
    background: transparent;
    border: none;
    color: var(--parchment-dim);
    padding: 4px;
    cursor: pointer;
    border-radius: var(--radius-xs);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: all 0.15s ease;
  }
  .thumb-unflag-btn:hover {
    opacity: 1;
    color: #ff6b6b;
    background: rgba(255, 107, 107, 0.15);
  }
  .empty-curatorial-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px 14px;
    background-color: var(--surface-elevated);
    border: 1px dashed var(--hairline-slate);
    border-radius: var(--radius-sm);
    color: var(--parchment-muted);
    gap: 8px;
  }
  .empty-guide-icon {
    font-size: 28px;
    color: var(--parchment-dim);
  }
  .empty-guide-title {
    font-size: 12px;
    color: var(--parchment-bright);
    font-weight: 600;
  }
  .empty-guide-desc {
    font-size: 10px;
    color: var(--parchment-dim);
    line-height: 1.5;
    margin: 0;
  }
  .kbd-chip {
    background: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 9px;
    color: var(--amber-highlight);
  }
  .empty-guide-sub {
    font-size: 9px;
    color: var(--parchment-dim);
    opacity: 0.8;
    margin-top: 4px;
  }
  .step-cta-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 14px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
  }
</style>

