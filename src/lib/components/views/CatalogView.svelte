<script lang="ts">
  import { onMount } from 'svelte';
  import QuickLookModal from '$lib/components/QuickLookModal.svelte';
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
    gradedThumbnail?: string;
    aiDecision?: any;
  }

  interface Props {
    photos: CatalogPhotoItem[];
    activePhoto: CatalogPhotoItem | null;
    isLoadingPhotos: boolean;
    onSelectPhoto: (p: CatalogPhotoItem) => void;
    onOpenRetouch: (p: CatalogPhotoItem) => void;
    onGoToRetouch?: () => void;
    hasApiKey?: boolean;
    onOpenVault?: () => void;
    onPickDirectory: () => void;
    onRefreshMounts: () => void;
    onToggleFlag?: (p: CatalogPhotoItem) => void;
  }

  let {
    photos = [],
    activePhoto = null,
    isLoadingPhotos = false,
    hasApiKey = false,
    onOpenVault,
    onSelectPhoto,
    onOpenRetouch,
    onGoToRetouch,
    onPickDirectory,
    onRefreshMounts,
    onToggleFlag
  }: Props = $props();

  // Grid density: 'small' (dense) | 'medium' (standard) | 'large' (spacious)
  let gridDensity = $state<'small' | 'medium' | 'large'>('medium');
  let filterFlaggedOnly = $state<boolean>(false);
  let isQuickLookOpen = $state<boolean>(false);

  // ── 裝置與指標能力動態感應 (Adaptive Input & Device Sensing) ──
  let isCoarsePointer = $state(false);
  let hasDetectedPhysicalKeyboard = $state(false);
  const showKeyboardHints = $derived(!isCoarsePointer || hasDetectedPhysicalKeyboard);

  // ── 多選模式與批次選取狀態 (Multi-Select & Batch Action Mode) ──
  let isMultiSelectMode = $state(false);
  let selectedBatchIds = $state<string[]>([]);
  let isSwipeSelecting = $state(false);
  let swipeSelectAction = $state<'select' | 'deselect'>('select');
  let gridContainerElement: HTMLElement | null = $state(null);
  let autoScrollRafId: number | null = null;
  let currentTouchClientX = 0;
  let currentTouchClientY = 0;

  function toggleBatchSelect(photoId: string) {
    if (selectedBatchIds.includes(photoId)) {
      selectedBatchIds = selectedBatchIds.filter(id => id !== photoId);
    } else {
      selectedBatchIds = [...selectedBatchIds, photoId];
    }
  }

  function enterMultiSelect(photo: CatalogPhotoItem, autoStartSwipe = false) {
    isMultiSelectMode = true;
    if (!selectedBatchIds.includes(photo.id)) {
      selectedBatchIds = [...selectedBatchIds, photo.id];
      swipeSelectAction = 'select';
    } else {
      swipeSelectAction = 'deselect';
    }
    if (autoStartSwipe) {
      isSwipeSelecting = true;
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(40); } catch (_) {}
    }
  }

  function exitMultiSelect() {
    stopAutoScroll();
    isSwipeSelecting = false;
    isMultiSelectMode = false;
    selectedBatchIds = [];
  }

  function selectAllBatch() {
    selectedBatchIds = displayedPhotos.map(p => p.id);
  }

  function deselectAllBatch() {
    selectedBatchIds = [];
  }

  function batchSetFlagged(flagVal: boolean) {
    let changed = false;
    photos.forEach(p => {
      if (selectedBatchIds.includes(p.id)) {
        if (p.flagged !== flagVal) {
          p.flagged = flagVal;
          changed = true;
        }
      }
    });
    if (changed && photos.length > 0) {
      onToggleFlag?.(photos[0]);
    }
  }

  // ── 邊緣自動平滑滾動 (Edge Auto-scrolling on Swipe Select) ──
  function checkAndStartAutoScroll() {
    if (!gridContainerElement || !isSwipeSelecting) return;
    const rect = gridContainerElement.getBoundingClientRect();
    const topThreshold = rect.top + 65;
    const bottomThreshold = rect.bottom - 65;

    if (currentTouchClientY < topThreshold || currentTouchClientY > bottomThreshold) {
      if (!autoScrollRafId) {
        autoScrollLoop();
      }
    } else {
      stopAutoScroll();
    }
  }

  function autoScrollLoop() {
    if (!gridContainerElement || !isSwipeSelecting) {
      stopAutoScroll();
      return;
    }
    const rect = gridContainerElement.getBoundingClientRect();
    const topThreshold = rect.top + 65;
    const bottomThreshold = rect.bottom - 65;

    if (currentTouchClientY < topThreshold) {
      const intensity = Math.min(1, Math.max(0.2, (topThreshold - currentTouchClientY) / 65));
      gridContainerElement.scrollTop -= Math.round(3 + intensity * 12);
    } else if (currentTouchClientY > bottomThreshold) {
      const intensity = Math.min(1, Math.max(0.2, (currentTouchClientY - bottomThreshold) / 65));
      gridContainerElement.scrollTop += Math.round(3 + intensity * 12);
    } else {
      stopAutoScroll();
      return;
    }

    // 捲動同時檢測滑過的底片元素進行連選
    processSwipeHover(currentTouchClientX, currentTouchClientY);
    autoScrollRafId = requestAnimationFrame(autoScrollLoop);
  }

  function stopAutoScroll() {
    if (autoScrollRafId) {
      cancelAnimationFrame(autoScrollRafId);
      autoScrollRafId = null;
    }
  }

  function processSwipeHover(clientX: number, clientY: number) {
    if (!clientX || !clientY) return;
    const elem = document.elementFromPoint(clientX, clientY);
    const card = elem?.closest<HTMLElement>('.film-card');
    if (card && card.dataset.photoId) {
      const pid = card.dataset.photoId;
      if (swipeSelectAction === 'select') {
        if (!selectedBatchIds.includes(pid)) {
          selectedBatchIds = [...selectedBatchIds, pid];
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(10); } catch (_) {}
          }
        }
      } else {
        if (selectedBatchIds.includes(pid)) {
          selectedBatchIds = selectedBatchIds.filter(id => id !== pid);
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(10); } catch (_) {}
          }
        }
      }
    }
  }

  // 觸控手勢管理：長按進入多選模式並可連帶滑動連選；單擊直接進入精修 (多選時為切換)
  let touchStartX = 0;
  let touchStartY = 0;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let didTriggerLongPress = false;

  function handleTouchStart(photo: CatalogPhotoItem, e: TouchEvent) {
    if (!isCoarsePointer) return;
    didTriggerLongPress = false;
    isSwipeSelecting = false;
    stopAutoScroll();

    if (e.touches.length > 0) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      currentTouchClientX = touchStartX;
      currentTouchClientY = touchStartY;
    }
    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }

    // Why: 在多選狀態下長按 180ms 即可立即啟動滑刷選取；非多選狀態下 420ms 避免一般快速滑動被誤判
    const delay = isMultiSelectMode ? 180 : 420;
    longPressTimer = setTimeout(() => {
      didTriggerLongPress = true;
      enterMultiSelect(photo, true);
    }, delay);
  }

  function handleTouchMove(e: TouchEvent) {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    currentTouchClientX = touch.clientX;
    currentTouchClientY = touch.clientY;

    if (isSwipeSelecting) {
      // 處於滑動多選模式中：阻止頁面原生捲動，接管為滑刷選取
      if (e.cancelable) e.preventDefault();
      processSwipeHover(touch.clientX, touch.clientY);
      checkAndStartAutoScroll();
      return;
    }

    if (longPressTimer) {
      const diffX = Math.abs(touch.clientX - touchStartX);
      const diffY = Math.abs(touch.clientY - touchStartY);
      // 移動超過 10px 視為一般捲動瀏覽，立即取消長按定時器
      if (diffX > 10 || diffY > 10) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }
  }

  function handleTouchEnd(photo: CatalogPhotoItem, e: TouchEvent) {
    if (!isCoarsePointer) return;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    stopAutoScroll();

    if (isSwipeSelecting) {
      isSwipeSelecting = false;
      if (e.cancelable) e.preventDefault();
      return;
    }

    if (didTriggerLongPress) {
      didTriggerLongPress = false;
      if (e.cancelable) e.preventDefault();
      return;
    }

    if (isMultiSelectMode) {
      toggleBatchSelect(photo.id);
    } else {
      // 單擊：零延遲直接進入暗房精修
      onSelectPhoto(photo);
      onOpenRetouch(photo);
    }
  }

  // Derived filtered photos
  let displayedPhotos = $derived(
    filterFlaggedOnly ? photos.filter(p => p.flagged) : photos
  );

  let flaggedCount = $derived(
    photos.filter(p => p.flagged).length
  );

  // Columns calculation for HJKL grid navigation (fallback)
  let columns = $derived(
    gridDensity === 'small' ? 6 : gridDensity === 'medium' ? 4 : 3
  );

  let gridElement: HTMLElement | null = $state(null);

  // 動態依據 DOM 實際排版偵測當前視窗寬度下的每列欄數
  function getCurrentColumns(): number {
    if (!gridElement) return columns;
    const cards = gridElement.querySelectorAll<HTMLElement>('.film-card');
    if (cards.length <= 1) return 1;
    const firstTop = cards[0].offsetTop;
    for (let i = 1; i < cards.length; i++) {
      if (cards[i].offsetTop > firstTop + 5) {
        return i; // 超過第一行 offsetTop 的位置即為換行點，得到每列欄數
      }
    }
    return cards.length;
  }

  function toggleFlag(photo: CatalogPhotoItem, event?: MouseEvent | KeyboardEvent) {
    if (event) {
      event.stopPropagation();
      if ('target' in event && event.target && typeof (event.target as HTMLElement).blur === 'function') {
        (event.target as HTMLElement).blur();
      }
    }
    photo.flagged = !photo.flagged;
    onToggleFlag?.(photo);
  }

  function selectAll() {
    photos.forEach(p => p.flagged = true);
    if (photos.length > 0) onToggleFlag?.(photos[0]);
  }

  function clearAllFlags() {
    photos.forEach(p => p.flagged = false);
    if (photos.length > 0) onToggleFlag?.(photos[0]);
  }

  function scrollToPhoto(photoId: string) {
    const el = document.getElementById(`film-card-${photoId}`);
    if (el) {
      // Why: 使用 'auto' 達成零延遲即時滾動，避免長按 J/K 鍵時因 smooth 動畫覆蓋導致卡頓延遲
      el.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    }
  }

  // 從暗房按 Esc 返回目錄時，自動恢復捲軸與焦點至上一次選中的相片
  onMount(() => {
    if (activePhoto?.id) {
      setTimeout(() => {
        scrollToPhoto(activePhoto.id);
      }, 60);

    }

    if (typeof window !== 'undefined') {
      const coarseMq = window.matchMedia('(pointer: coarse)');
      isCoarsePointer = coarseMq.matches || (navigator.maxTouchPoints > 0);

      const updatePointer = (e: MediaQueryListEvent) => {
        isCoarsePointer = e.matches;
      };
      coarseMq.addEventListener?.('change', updatePointer);

      // 動態偵測：一旦使用者在平板或電腦按下實體鍵盤，立即點亮快捷鍵導引
      const onFirstKey = (e: KeyboardEvent) => {
        if (!['Shift', 'Alt', 'Control', 'Meta'].includes(e.key)) {
          hasDetectedPhysicalKeyboard = true;
        }
      };
      window.addEventListener('keydown', onFirstKey, { passive: true });

      return () => {
        coarseMq.removeEventListener?.('change', updatePointer);
        window.removeEventListener('keydown', onFirstKey);
      };

    }
  });

  function selectNextPhoto() {
    if (displayedPhotos.length === 0) return;
    const currentIndex = displayedPhotos.findIndex(p => p.id === activePhoto?.id);
    const nextIndex = currentIndex >= 0 
      ? (currentIndex < displayedPhotos.length - 1 ? currentIndex + 1 : 0)
      : 0;
    const targetPhoto = displayedPhotos[nextIndex];
    onSelectPhoto(targetPhoto);
    scrollToPhoto(targetPhoto.id);
  }

  function selectPrevPhoto() {
    if (displayedPhotos.length === 0) return;
    const currentIndex = displayedPhotos.findIndex(p => p.id === activePhoto?.id);
    const prevIndex = currentIndex >= 0
      ? (currentIndex > 0 ? currentIndex - 1 : displayedPhotos.length - 1)
      : 0;
    const targetPhoto = displayedPhotos[prevIndex];
    onSelectPhoto(targetPhoto);
    scrollToPhoto(targetPhoto.id);
  }

  // Vim Style (HJKL) Keyboard Navigation & Spacebar QuickLook & P Pick
  function handleKeyNavigation(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    if (displayedPhotos.length === 0) return;

    // === 狀態一：快速大圖開啟中 ===
    if (isQuickLookOpen) {
      // 1. 空白鍵或 Esc 關閉大圖
      if (e.key === ' ' || e.code === 'Space' || e.key === 'Escape') {
        e.preventDefault();
        isQuickLookOpen = false;
        return;
      }
      // 2. H / Left 鍵切換上一張
      if (e.key === 'h' || e.key === 'ArrowLeft') {
        e.preventDefault();
        selectPrevPhoto();
        return;
      }
      // 3. L / Right 鍵切換下一張
      if (e.key === 'l' || e.key === 'ArrowRight') {
        e.preventDefault();
        selectNextPhoto();
        return;
      }
      // 4. P 鍵切換挑選
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (activePhoto) {
          toggleFlag(activePhoto);
        }
        return;
      }
      return;
    }

    // === 狀態二：目錄網格瀏覽中 ===
    const currentIndex = displayedPhotos.findIndex(p => p.id === activePhoto?.id);

    // Space: 開啟快速大圖預覽
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      // 確保黃框所選取的相片為大圖預覽對象
      if (!activePhoto && displayedPhotos.length > 0) {
        onSelectPhoto(displayedPhotos[0]);
      }
      isQuickLookOpen = true;
      return;
    }
    // P: Toggle Pick / Flag selection
    else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      const current = currentIndex >= 0 ? displayedPhotos[currentIndex] : displayedPhotos[0];
      if (current) {
        toggleFlag(current);
      }
    } 
    // H / Left Arrow: Previous photo
    else if (e.key === 'h' || e.key === 'ArrowLeft') {
      e.preventDefault();
      selectPrevPhoto();
    } 
    // L / Right Arrow: Next photo
    else if (e.key === 'l' || e.key === 'ArrowRight') {
      e.preventDefault();
      selectNextPhoto();
    } 
    // K / Up Arrow: Up one row
    else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      const current = currentIndex >= 0 ? currentIndex : 0;
      const step = getCurrentColumns();
      const nextIndex = Math.max(0, current - step);
      const targetPhoto = displayedPhotos[nextIndex];
      onSelectPhoto(targetPhoto);
      scrollToPhoto(targetPhoto.id);
    } 
    // J / Down Arrow: Down one row
    else if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      const current = currentIndex >= 0 ? currentIndex : 0;
      const step = getCurrentColumns();
      const nextIndex = Math.min(displayedPhotos.length - 1, current + step);
      const targetPhoto = displayedPhotos[nextIndex];
      onSelectPhoto(targetPhoto);
      scrollToPhoto(targetPhoto.id);
    } 
    // Enter: Trigger Step 1 action (進入暗房精修焦點底片)
    else if (e.key === 'Enter') {
      e.preventDefault();
      const current = currentIndex >= 0 ? displayedPhotos[currentIndex] : (activePhoto || displayedPhotos[0]);
      if (current) {
        onOpenRetouch(current);
      } else if (onGoToRetouch) {
        onGoToRetouch();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeyNavigation} />

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
      <!-- Vim Keyboard Shortcuts Hint: 在純觸控環境隱藏，外接鍵盤時動態點亮 -->
      {#if showKeyboardHints}
      <div class="vim-nav-indicator hairline-all" title="鍵盤導航：HJKL 移動，P 挑選/取消，空白鍵大圖審查，Enter 一鍵進入精修">
        <span class="material-symbols-outlined" style="font-size: 13px; color: var(--amber-highlight);">keyboard</span>
        <span class="key-cap">HJKL</span>
        <span class="key-desc">移動</span>
        <span class="key-sep">·</span>
        <span class="key-cap">P</span>
        <span class="key-desc">挑選</span>
        <span class="key-sep">·</span>
        <span class="key-cap">Space</span>
        <span class="key-desc">大圖</span>
        <span class="key-sep">·</span>
        <span class="key-cap">Enter</span>
        <span class="key-desc">精修</span>
      </div>

      {/if}

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

      <!-- Directory Open Button -->
      <button type="button" class="tool-btn" onclick={onPickDirectory} disabled={isLoadingPhotos} title="載入相片目錄">
        <span class="material-symbols-outlined" style="font-size: 14px;">folder_open</span>
        <span>{isLoadingPhotos ? '解析中...' : '載入目錄'}</span>
      </button>

      {#if !hasApiKey && onOpenVault}
        <button
          type="button"
          class="tool-btn key-guide-badge"
          onclick={onOpenVault}
          title="尚未配置 AI 雲端金鑰，點擊前往保險庫設定"
        >
          <span class="material-symbols-outlined" style="font-size: 14px; color: var(--amber-highlight);">vpn_key_alert</span>
          <span class="badge-text amber">未配置金鑰</span>
        </button>
      {/if}

      <!-- SEQUENTIAL STEP 1 ACTION: ONE-CLICK ENTER RETOUCH -->
      {#if photos.length > 0}
        <button 
          type="button" 
          class="archival-btn-primary step-btn-highlight" 
          onclick={() => {
            if (onGoToRetouch) {
              onGoToRetouch();
            } else if (activePhoto) {
              onOpenRetouch(activePhoto);
            }
          }}
          title="步驟一：一鍵進入暗房精修（若有選取則僅精修選取幀，未選取則精修全部）"
        >
          <span class="material-symbols-outlined" style="font-size: 15px;">tonality</span>
          <span>
            {#if flaggedCount > 0}
              一鍵進入精修 (已選 {flaggedCount} 幀) →
            {:else}
              一鍵進入精修 (全部 {photos.length} 幀) →
            {/if}
          </span>
        </button>
      {/if}
    </div>
  </header>

  <!-- MAIN GRID BODY -->
  <div 
    bind:this={gridContainerElement} 
    class="catalog-grid-container custom-scroll"
    class:swipe-selecting={isSwipeSelecting}
  >
    {#if displayedPhotos.length > 0}
      <div bind:this={gridElement} class="film-grid {gridDensity}">
        {#each displayedPhotos as photo (photo.id + '_' + (photo.gradedThumbnail ? 'graded' : 'raw'))}
          <div 
            id={`film-card-${photo.id}`}
            data-photo-id={photo.id}
            class="film-card hairline-all" 
            class:selected={activePhoto?.id === photo.id}
            class:batch-selected={selectedBatchIds.includes(photo.id)}
            class:flagged={photo.flagged}
            role="gridcell"
            tabindex="0"
            onclick={(e) => {
              if (isCoarsePointer) return;
              (e.currentTarget as HTMLElement).blur();
              onSelectPhoto(photo);
            }}
            ontouchstart={(e) => handleTouchStart(photo, e)}
            ontouchmove={handleTouchMove}
            ontouchend={(e) => handleTouchEnd(photo, e)}
            ontouchcancel={(e) => handleTouchEnd(photo, e)}
            ondblclick={() => {
              if (isCoarsePointer) return;
              onOpenRetouch(photo);
            }}
            onkeydown={(e) => {
              if (e.key === 'Enter') onOpenRetouch(photo);
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
              <img src={photo.gradedThumbnail || photo.thumbnail} alt={photo.filename} class="film-thumb-img" loading="lazy" />
              
              <!-- Multi-Select Checkbox Floating on Top-Left -->
              {#if isMultiSelectMode}
                <div class="batch-checkbox" class:checked={selectedBatchIds.includes(photo.id)}>
                  <span class="material-symbols-outlined">
                    {selectedBatchIds.includes(photo.id) ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                </div>
              {/if}

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
                {#if photo.sceneTag && photo.sceneTag !== '本機相簿幀'}
                  <span style="opacity: 0.6; margin: 0 2px;">·</span>
                  <span class="truncate" style="color: var(--amber-highlight);">{photo.sceneTag}</span>
                {/if}
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
              {#if showKeyboardHints}
                <span class="hint-dblclick">雙擊精修 ↵</span>
              {:else if isMultiSelectMode}
                <span class="hint-dblclick" class:amber={selectedBatchIds.includes(photo.id)}>
                  {selectedBatchIds.includes(photo.id) ? '已選取 ✓' : '輕點或滑動選取'}
                </span>
              {:else}
                <span class="hint-dblclick" class:amber={photo.flagged}>
                  {photo.flagged ? '已挑選 🔖' : '輕點精修 · 長按多選'}
                </span>
              {/if}
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

        {#if !hasApiKey && onOpenVault}
          <div class="key-vault-empty-banner hairline-all font-mono">
            <div class="banner-left">
              <span class="material-symbols-outlined banner-icon">vpn_key_alert</span>
              <div class="banner-texts">
                <span class="banner-title">尚未配置 AI 雲端金鑰</span>
                <span class="banner-desc">可預先配置 Gemini / Groq API 金鑰，載入相片後隨即可享受 AI 智慧光學顯影</span>
              </div>
            </div>
            <button type="button" class="banner-action-btn font-mono" onclick={onOpenVault}>
              <span>立即配置 🔑</span>
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Floating Multi-Select Batch Action Bar -->
  {#if isMultiSelectMode}
    <div class="batch-action-bar hairline-all font-mono">
      <div class="batch-bar-left">
        <span class="material-symbols-outlined batch-icon">checklist</span>
        <span class="batch-count-label">
        已選取 <strong>{selectedBatchIds.length}</strong> 幀
        {#if isSwipeSelecting}
          <span class="swipe-indicator">⚡ 滑動連選中</span>
        {/if}
      </span>
      </div>
      <div class="batch-bar-actions">
        <button 
          type="button" 
          class="batch-tool-btn primary" 
          onclick={() => batchSetFlagged(true)} 
          disabled={selectedBatchIds.length === 0}
          title="將所選相片批次標記為挑選"
        >
          <span class="material-symbols-outlined">bookmark</span>
          <span>批次標記</span>
        </button>
        <button 
          type="button" 
          class="batch-tool-btn" 
          onclick={() => batchSetFlagged(false)} 
          disabled={selectedBatchIds.length === 0}
          title="取消所選相片的標記"
        >
          <span class="material-symbols-outlined">bookmark_remove</span>
          <span>取消標記</span>
        </button>
        <button 
          type="button" 
          class="batch-tool-btn" 
          onclick={selectedBatchIds.length === displayedPhotos.length ? deselectAllBatch : selectAllBatch}
        >
          <span class="material-symbols-outlined">
            {selectedBatchIds.length === displayedPhotos.length ? 'deselect' : 'select_all'}
          </span>
          <span>{selectedBatchIds.length === displayedPhotos.length ? '取消全選' : '全選'}</span>
        </button>
        <button 
          type="button" 
          class="batch-done-btn" 
          onclick={exitMultiSelect}
        >
          <span>完成</span>
        </button>
      </div>
    </div>
  {/if}
</div>

<!-- Quick Look Instant Fullscreen Preview Modal -->
<QuickLookModal 
  bind:isOpen={isQuickLookOpen}
  photo={activePhoto}
  onClose={() => isQuickLookOpen = false}
  onToggleFlag={(p) => toggleFlag(p)}
  onNext={selectNextPhoto}
  onPrev={selectPrevPhoto}
  hasNext={displayedPhotos.length > 1}
  hasPrev={displayedPhotos.length > 1}
/>

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

  /* VIM KEYBOARD SHORTCUTS INDICATOR */
  .vim-nav-indicator {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background-color: rgba(22, 22, 24, 0.85);
    padding: 3px 8px;
    border-radius: var(--radius-xs);
    font-size: 11px;
    color: var(--parchment-dim);
    border: 1px solid var(--hairline-slate);
    user-select: none;
  }

  .key-cap {
    color: var(--amber-highlight);
    background-color: rgba(226, 157, 82, 0.15);
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 600;
  }

  .key-desc {
    color: var(--parchment-muted);
  }

  .key-sep {
    color: var(--parchment-dim);
    opacity: 0.5;
  }

  /* STEP 1 HIGHLIGHT BUTTON */
  .step-btn-highlight {
    background: linear-gradient(135deg, var(--amber-highlight), #d48b3b) !important;
    color: #121214 !important;
    font-weight: 600 !important;
    box-shadow: 0 0 12px rgba(226, 157, 82, 0.25);
    border: 1px solid rgba(226, 157, 82, 0.8) !important;
    padding: 5px 12px !important;
    gap: 6px;
    cursor: pointer;
  }

  .step-btn-highlight:hover {
    filter: brightness(1.1);
    box-shadow: 0 0 16px rgba(226, 157, 82, 0.4);
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

  .film-card.batch-selected {
    border-color: var(--amber-highlight) !important;
    box-shadow: 0 0 0 2px var(--amber-highlight), 0 8px 24px rgba(0, 0, 0, 0.7);
  }

  /* MULTI-SELECT CHECKBOX & FLOATING BATCH BAR */
  .batch-checkbox {
    position: absolute;
    top: 6px;
    left: 6px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: rgba(18, 19, 22, 0.85);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-dim);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3;
    transition: all 0.15s ease;
    pointer-events: none;
  }

  .batch-checkbox.checked {
    background-color: var(--amber-highlight);
    color: var(--canvas-base);
    border-color: var(--amber-highlight);
  }

  .batch-checkbox span {
    font-size: 20px;
  }

  .batch-action-bar {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background-color: rgba(22, 24, 29, 0.96);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--amber-highlight);
    border-radius: var(--radius-md);
    padding: 8px 14px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(226, 157, 82, 0.3);
    width: min(94%, 580px);
    animation: slideUpBatch 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideUpBatch {
    from {
      opacity: 0;
      transform: translate(-50%, 20px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  .batch-bar-left {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--parchment-bright);
    white-space: nowrap;
  }

  .batch-bar-left .batch-icon {
    font-size: 18px;
    color: var(--amber-highlight);
  }

  .batch-bar-left strong {
    color: var(--amber-highlight);
  }

  .swipe-indicator {
    display: inline-block;
    margin-left: 6px;
    font-size: 11px;
    color: var(--amber-highlight);
    background: rgba(226, 157, 82, 0.15);
    padding: 1px 6px;
    border-radius: var(--radius-xs);
    animation: pulseSwipe 1s infinite alternate;
  }

  @keyframes pulseSwipe {
    from { opacity: 0.6; }
    to { opacity: 1; }
  }

  .catalog-grid-container.swipe-selecting {
    user-select: none;
    -webkit-user-select: none;
  }

  .batch-bar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .batch-tool-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--surface-overlay);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-dim);
    padding: 6px 10px;
    border-radius: var(--radius-xs);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .batch-tool-btn span.material-symbols-outlined {
    font-size: 16px;
  }

  .batch-tool-btn:hover:not(:disabled) {
    background: rgba(226, 157, 82, 0.15);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
  }

  .batch-tool-btn.primary:not(:disabled) {
    background: rgba(226, 157, 82, 0.2);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
  }

  .batch-tool-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .batch-done-btn {
    background: var(--amber-highlight);
    border: none;
    color: var(--canvas-base);
    font-weight: 600;
    padding: 6px 14px;
    border-radius: var(--radius-xs);
    font-size: 12px;
    cursor: pointer;
    transition: opacity 0.15s ease;
    white-space: nowrap;
  }

  .batch-done-btn:hover {
    opacity: 0.9;
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
  .hint-dblclick.amber {
    color: var(--amber-highlight);
    font-weight: 600;
  }

  /* KEY VAULT GUIDANCE BANNER & TOOLBAR BADGE */
  .key-vault-empty-banner {
    margin-top: 24px;
    width: 100%;
    padding: 12px 16px;
    background: rgba(226, 157, 82, 0.08);
    border: 1px dashed rgba(226, 157, 82, 0.35);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    text-align: left;
    box-sizing: border-box;
  }
  .key-vault-empty-banner .banner-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .key-vault-empty-banner .banner-icon {
    font-size: 20px;
    color: var(--amber-highlight);
    flex-shrink: 0;
  }
  .key-vault-empty-banner .banner-texts {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .key-vault-empty-banner .banner-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--amber-highlight);
    letter-spacing: 0.04em;
  }
  .key-vault-empty-banner .banner-desc {
    font-size: 11px;
    color: var(--parchment-muted);
    line-height: 1.4;
  }
  .key-vault-empty-banner .banner-action-btn {
    padding: 6px 12px;
    background: var(--amber-highlight);
    color: #121214;
    border: none;
    border-radius: var(--radius-xs);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .key-vault-empty-banner .banner-action-btn:hover {
    background: #f0a855;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(226, 157, 82, 0.3);
  }
  .tool-btn.key-guide-badge {
    border-color: rgba(226, 157, 82, 0.4);
    background: rgba(226, 157, 82, 0.08);
  }
  .tool-btn.key-guide-badge:hover {
    border-color: var(--amber-highlight);
    background: rgba(226, 157, 82, 0.16);
  }
  .tool-btn.key-guide-badge .badge-text.amber {
    color: var(--amber-highlight);
    font-weight: 600;
  }

  /* ── 觸控設備與行動端專屬佈局 (Mobile & Coarse Pointer Layout) ── */
  @media (pointer: coarse), (max-width: 768px) {
    .key-vault-empty-banner {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
      padding: 14px;
    }
    .key-vault-empty-banner .banner-action-btn {
      width: 100%;
      padding: 10px;
      font-size: 12px;
      text-align: center;
    }
    .catalog-toolbar {
      padding: 6px 10px;
      flex-wrap: wrap;
      gap: 6px;
    }

    .tool-title {
      font-size: 13px;
    }

    .density-switch {
      display: none; /* 行動端與純觸控自適應 2 欄大縮圖 */
    }

    .catalog-grid-container {
      padding: 8px;
    }

    .film-grid {
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 8px;
    }

    .film-card {
      -webkit-touch-callout: none;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
    }

    .flag-btn {
      width: 36px;
      height: 36px;
      top: 4px;
      right: 4px;
    }

    .batch-action-bar {
      padding: 6px 10px;
      gap: 6px;
      bottom: 12px;
    }

    .batch-tool-btn {
      padding: 5px 8px;
      font-size: 11px;
    }

    .batch-done-btn {
      padding: 5px 10px;
      font-size: 11px;
    }

    .sprocket-strip {
      height: 12px;
      padding: 0 4px;
    }

    .sprocket-hole {
      width: 4px;
      height: 4px;
    }

    .telemetry-compact {
      font-size: 8px;
    }
  }
</style>
