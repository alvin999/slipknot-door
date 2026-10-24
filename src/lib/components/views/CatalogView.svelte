<script lang="ts">
  export interface CatalogPhotoItem {
    id: string;
    frameNo: string;
    filename: string;
    camera: string;
    lens: string;
    iso: number;
    shutter: string;
    aperture: string;
    focalLength: string;
    thumbnail: string;
    sceneTag: string;
    selected: boolean;
    flagged?: boolean;
    appliedProfile: string;
  }

  interface Props {
    photos: CatalogPhotoItem[];
    activePhoto: CatalogPhotoItem | null;
    isLoadingPhotos: boolean;
    onSelectPhoto: (p: CatalogPhotoItem) => void;
    onOpenRetouch: (p: CatalogPhotoItem) => void;
    onPickDirectory: () => void;
    onRefreshMounts: () => void;
  }

  let {
    photos = [],
    activePhoto = null,
    isLoadingPhotos = false,
    onSelectPhoto,
    onOpenRetouch,
    onPickDirectory,
    onRefreshMounts
  }: Props = $props();

  // Grid density: 'small' (dense) | 'medium' (standard) | 'large' (spacious)
  let gridDensity = $state<'small' | 'medium' | 'large'>('medium');
  let filterFlaggedOnly = $state<boolean>(false);

  // Derived filtered photos
  let displayedPhotos = $derived(
    filterFlaggedOnly ? photos.filter(p => p.flagged) : photos
  );

  let flaggedCount = $derived(
    photos.filter(p => p.flagged).length
  );

  function toggleFlag(photo: CatalogPhotoItem, event: MouseEvent) {
    event.stopPropagation();
    photo.flagged = !photo.flagged;
  }

  function selectAll() {
    photos.forEach(p => p.flagged = true);
  }

  function clearAllFlags() {
    photos.forEach(p => p.flagged = false);
  }
</script>

<div class="catalog-viewport">
  <!-- CATALOG CURATORIAL SUB-HEADER TOOLBAR -->
  <header class="catalog-toolbar hairline-b font-mono">
    <div class="tool-group">
      <span class="tool-title font-headline">膠卷目錄與挑圖矩陣</span>
      <span class="counter-badge">{photos.length} FRAMES</span>
      {#if flaggedCount > 0}
        <span class="counter-badge amber">已標記 {flaggedCount} 幀</span>
      {/if}
    </div>

    <div class="tool-group actions">
      <!-- Flagging Controls -->
      <button 
        type="button" 
        class="tool-btn" 
        class:active={filterFlaggedOnly}
        onclick={() => filterFlaggedOnly = !filterFlaggedOnly}
        title="僅顯示已標記挑圖底片"
      >
        <span class="material-symbols-outlined" style="font-size: 14px;">bookmark</span>
        <span>{filterFlaggedOnly ? '顯示全部' : '僅看已標記'}</span>
      </button>

      {#if photos.length > 0}
        <button type="button" class="tool-btn" onclick={selectAll} title="將全部底片加入標記">
          <span class="material-symbols-outlined" style="font-size: 14px;">select_all</span>
          <span>全選</span>
        </button>
        <button type="button" class="tool-btn" onclick={clearAllFlags} title="清除所有標記">
          <span class="material-symbols-outlined" style="font-size: 14px;">deselect</span>
          <span>清除標記</span>
        </button>
      {/if}

      <!-- Grid Density Selector -->
      <div class="density-switch hairline-all">
        <button 
          type="button" 
          class="density-btn" 
          class:active={gridDensity === 'small'}
          onclick={() => gridDensity = 'small'}
          title="緊密網格 (6 欄)"
        >
          <span class="material-symbols-outlined" style="font-size: 14px;">grid_on</span>
        </button>
        <button 
          type="button" 
          class="density-btn" 
          class:active={gridDensity === 'medium'}
          onclick={() => gridDensity = 'medium'}
          title="標準網格 (4 欄)"
        >
          <span class="material-symbols-outlined" style="font-size: 14px;">grid_view</span>
        </button>
        <button 
          type="button" 
          class="density-btn" 
          class:active={gridDensity === 'large'}
          onclick={() => gridDensity = 'large'}
          title="大圖檢視 (3 欄)"
        >
          <span class="material-symbols-outlined" style="font-size: 14px;">splitscreen</span>
        </button>
      </div>

      <!-- Action Button -->
      <button type="button" class="archival-btn-primary compact" onclick={onPickDirectory} disabled={isLoadingPhotos}>
        <span class="material-symbols-outlined" style="font-size: 14px;">folder_open</span>
        <span>{isLoadingPhotos ? '解析中...' : '載入相片目錄'}</span>
      </button>
    </div>
  </header>

  <!-- MAIN GRID BODY -->
  <div class="catalog-grid-container custom-scroll">
    {#if displayedPhotos.length > 0}
      <div class="film-grid {gridDensity}">
        {#each displayedPhotos as photo}
          <div 
            class="film-card hairline-all" 
            class:selected={activePhoto?.id === photo.id}
            class:flagged={photo.flagged}
            role="button"
            tabindex="0"
            onclick={() => onSelectPhoto(photo)}
            ondblclick={() => onOpenRetouch(photo)}
            onkeydown={(e) => {
              if (e.key === 'Enter') onOpenRetouch(photo);
              if (e.key === ' ') toggleFlag(photo, e as any);
            }}
          >
            <!-- 35mm Film Top Sprocket Bar -->
            <div class="sprocket-strip top font-mono">
              <span class="sprocket-hole"></span>
              <span class="film-stock-stamp">ALX-400</span>
              <span class="sprocket-hole"></span>
              <span class="sprocket-hole"></span>
              <span class="frame-tag-num">{photo.frameNo}</span>
              <span class="sprocket-hole"></span>
            </div>

            <!-- Photo Canvas Frame -->
            <div class="film-card-image-wrap">
              <img src={photo.thumbnail} alt={photo.filename} class="film-thumb-img" loading="lazy" />
              
              <!-- Quick Flag Button Floating on Top-Right -->
              <button 
                type="button" 
                class="flag-btn" 
                class:active={photo.flagged}
                onclick={(e) => toggleFlag(photo, e)}
                title="標記此幀"
              >
                <span class="material-symbols-outlined">
                  {photo.flagged ? 'bookmark' : 'bookmark_border'}
                </span>
              </button>

              <!-- Applied Profile Pill Floating on Bottom-Left -->
              <div class="applied-profile-pill font-mono">
                <span class="profile-dot" style:background={photo.appliedProfile ? 'var(--amber-highlight)' : 'var(--parchment-dim)'}></span>
                <span class="truncate">{photo.appliedProfile}</span>
              </div>
            </div>

            <!-- 35mm Film Bottom Sprocket Bar & Optical Telemetry -->
            <div class="sprocket-strip bottom font-mono">
              <span class="sprocket-hole"></span>
              <span class="telemetry-compact truncate">
                {photo.aperture} · {photo.shutter} · ISO {photo.iso}
              </span>
              <span class="sprocket-hole"></span>
            </div>

            <!-- Footer Meta Bar -->
            <div class="film-card-footer font-mono">
              <span class="filename-text truncate">{photo.filename}</span>
              <span class="hint-dblclick">雙擊精修 ↵</span>
            </div>
          </div>
        {/each}
      </div>
    {:else if photos.length > 0 && filterFlaggedOnly}
      <div class="catalog-empty-box hairline-all font-mono">
        <span class="material-symbols-outlined empty-icon">bookmark_border</span>
        <h4 class="empty-title">目前無標記底片</h4>
        <p class="empty-sub">點擊底片右上角書籤圖示進行標記挑圖，或關閉「僅看已標記」過濾器。</p>
        <button type="button" class="archival-btn-secondary" onclick={() => filterFlaggedOnly = false}>
          顯示所有相卷底片
        </button>
      </div>
    {:else}
      <!-- Empty Catalog Guidance -->
      <div class="catalog-empty-box hairline-all">
        <span class="material-symbols-outlined empty-icon">photo_library</span>
        <h3 class="font-headline empty-title">尚未載入膠卷底片</h3>
        <p class="font-body empty-sub">
          請連接外接相機 USB/Type-C 隨插即讀設備，或由本機選取 DCIM / RAW 相片資料夾展開挑圖。
        </p>
        <div class="empty-actions">
          <button type="button" class="archival-btn-primary" onclick={onPickDirectory} disabled={isLoadingPhotos}>
            <span class="material-symbols-outlined" style="font-size: 16px;">folder_open</span>
            <span>{isLoadingPhotos ? '正在解析 RAW/JPG...' : '開啟相片目錄 (RAW / JPG)'}</span>
          </button>
          <button type="button" class="archival-btn-secondary" onclick={onRefreshMounts}>
            <span class="material-symbols-outlined" style="font-size: 16px;">cable</span>
            <span>重新偵測隨插即讀設備</span>
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .catalog-viewport {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    min-height: 0;
    min-width: 0;
    background-color: var(--canvas-base);
    overflow: hidden;
  }

  /* TOOLBAR */
  .catalog-toolbar {
    height: 48px;
    background-color: var(--surface-panel);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }

  .tool-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .tool-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--parchment-bright);
    letter-spacing: 0.05em;
  }

  .counter-badge {
    font-size: 11px;
    background-color: var(--surface-elevated);
    color: var(--parchment-dim);
    padding: 2px 8px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--hairline-slate);
  }

  .counter-badge.amber {
    color: var(--amber-highlight);
    border-color: rgba(226, 157, 82, 0.4);
    background-color: rgba(226, 157, 82, 0.1);
  }

  .tool-btn {
    background-color: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-muted);
    font-family: inherit;
    font-size: 11px;
    padding: 5px 10px;
    border-radius: var(--radius-xs);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .tool-btn:hover {
    background-color: var(--surface-overlay);
    color: var(--parchment-bright);
    border-color: var(--parchment-dim);
  }

  .tool-btn.active {
    background-color: var(--primary-indigo);
    color: var(--canvas-base);
    border-color: var(--primary-indigo);
    font-weight: 600;
  }

  /* DENSITY SWITCH */
  .density-switch {
    display: flex;
    background-color: var(--surface-elevated);
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .density-btn {
    background: transparent;
    border: none;
    color: var(--parchment-dim);
    padding: 5px 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .density-btn:hover {
    color: var(--parchment-bright);
  }

  .density-btn.active {
    background-color: var(--surface-overlay);
    color: var(--amber-highlight);
  }

  /* COMPACT BUTTON */
  .archival-btn-primary.compact {
    padding: 6px 12px;
    font-size: 11px;
  }

  /* MAIN GRID CONTAINER */
  .catalog-grid-container {
    flex: 1;
    min-height: 0;
    overflow-y: scroll;
    overflow-x: hidden;
    scrollbar-gutter: stable;
    padding: 20px;
  }

  /* FILM GRID LAYOUTS */
  .film-grid {
    display: grid;
    gap: 16px;
    width: 100%;
  }

  .film-grid.small {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }

  .film-grid.medium {
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }

  .film-grid.large {
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  }

  /* FILM CARD STYLING */
  .film-card {
    background-color: var(--surface-panel);
    border-radius: var(--radius-sm);
    overflow: hidden;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    user-select: none;
  }

  .film-card:hover {
    transform: translateY(-2px);
    border-color: var(--parchment-dim);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }

  .film-card.selected {
    border-color: var(--amber-highlight);
    box-shadow: 0 0 0 1px var(--amber-highlight), 0 8px 24px rgba(0, 0, 0, 0.6);
  }

  .film-card.flagged {
    border-left: 3px solid var(--amber-highlight);
  }

  /* 35MM SPROCKET STRIP */
  .sprocket-strip {
    height: 18px;
    background-color: #0b0c0e;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    font-size: 9px;
    color: var(--parchment-dim);
    letter-spacing: 0.05em;
  }

  .sprocket-hole {
    width: 5px;
    height: 7px;
    background-color: var(--canvas-base);
    border-radius: 1px;
    opacity: 0.8;
  }

  .film-stock-stamp {
    color: rgba(226, 157, 82, 0.6);
    font-size: 8px;
  }

  .frame-tag-num {
    color: var(--amber-highlight);
    font-weight: 600;
  }

  .telemetry-compact {
    font-size: 9px;
    color: var(--parchment-dim);
  }

  /* IMAGE WRAPPER */
  .film-card-image-wrap {
    width: 100%;
    aspect-ratio: 3 / 2;
    background-color: #000;
    position: relative;
    overflow: hidden;
  }

  .film-thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.25s ease;
  }

  .film-card:hover .film-thumb-img {
    transform: scale(1.02);
  }

  /* FLOATING CONTROLS ON CARD */
  .flag-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: rgba(18, 19, 22, 0.75);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .flag-btn:hover {
    background-color: var(--surface-overlay);
    color: var(--parchment-bright);
  }

  .flag-btn.active {
    background-color: var(--amber-highlight);
    color: var(--canvas-base);
    border-color: var(--amber-highlight);
  }

  .flag-btn span {
    font-size: 16px;
  }

  .applied-profile-pill {
    position: absolute;
    bottom: 6px;
    left: 6px;
    background-color: rgba(18, 19, 22, 0.85);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    padding: 2px 6px;
    font-size: 10px;
    color: var(--parchment-bright);
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 80%;
  }

  .profile-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }

  /* FOOTER */
  .film-card-footer {
    padding: 6px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: var(--surface-panel);
    font-size: 10px;
  }

  .filename-text {
    color: var(--parchment-muted);
  }

  .hint-dblclick {
    color: var(--parchment-dim);
    font-size: 9px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .film-card:hover .hint-dblclick {
    opacity: 0.8;
  }

  /* EMPTY GUIDANCE */
  .catalog-empty-box {
    margin: 60px auto;
    max-width: 500px;
    padding: 48px 32px;
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .empty-icon {
    font-size: 54px;
    color: var(--parchment-dim);
    margin-bottom: 16px;
    opacity: 0.7;
  }

  .empty-title {
    font-size: 20px;
    color: var(--parchment-bright);
    margin: 0 0 8px 0;
  }

  .empty-sub {
    font-size: 13px;
    color: var(--parchment-muted);
    line-height: 1.6;
    margin: 0 0 24px 0;
  }

  .empty-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
