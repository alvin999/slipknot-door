<script lang="ts">
  import { AiSceneService } from '$lib/services/aiSceneService';

  export interface PhotoPlateItem {
    id: string;
    frameNo: string;
    filename: string;
    camera: string;
    appliedProfile: string;
    selected: boolean;
    flagged?: boolean;
    thumbnail?: string;
    gradedThumbnail?: string;
    tuning?: any;
    crop?: any;
  }

  export type ExportScope = 'picked' | 'edited' | 'selected' | 'all';

  interface Props {
    photos: PhotoPlateItem[];
    activePhoto?: PhotoPlateItem | null;
    exportMode: 'modeA' | 'modeB';
    isExporting: boolean;
    exportProgress: number;
    exportNotice: string;
    aiVisionTags?: string[];
    aiSceneTitle?: string;
    onSetExportMode: (m: 'modeA' | 'modeB') => void;
    onTriggerExport: (subset?: PhotoPlateItem[]) => void;
  }

  let {
    photos = [],
    activePhoto = null,
    exportMode,
    isExporting,
    exportProgress,
    exportNotice,
    aiVisionTags = [],
    aiSceneTitle = '',
    onSetExportMode,
    onTriggerExport
  }: Props = $props();

  let exportScope = $state<ExportScope>('picked');
  let previewLayout = $state<'strip' | 'grid'>('strip'); // 膠卷帶模式 or 網格展開模式

  function isPhotoEdited(p: PhotoPlateItem): boolean {
    const hasCustomProfile = p.appliedProfile && p.appliedProfile !== 'Profile_00_StandardNatural';
    const hasTuning = p.tuning && (
      p.tuning.exposure !== 0 ||
      p.tuning.contrast !== 0 ||
      p.tuning.lutIntensity !== 1 ||
      (p.tuning.clarity && p.tuning.clarity !== 0) ||
      (p.tuning.sharpness && p.tuning.sharpness !== 0)
    );
    const hasCrop = p.crop && (p.crop.width < 1 || p.crop.height < 1 || p.crop.rotation !== 0);
    return Boolean(hasCustomProfile || hasTuning || hasCrop);
  }

  let pickedPhotos = $derived(photos.filter(p => p.flagged));
  let editedPhotos = $derived(photos.filter(p => isPhotoEdited(p)));
  let selectedPhotos = $derived(activePhoto ? [activePhoto] : (photos.length > 0 ? [photos[0]] : []));
  let allPhotos = $derived(photos);

  // 當前作用的匯出清單：嚴格對應所選範疇
  let effectivePhotos = $derived<PhotoPlateItem[]>(
    exportScope === 'picked' ? pickedPhotos :
    exportScope === 'edited' ? editedPhotos :
    exportScope === 'selected' ? selectedPhotos :
    allPhotos
  );

  // 使用者手動排除的底片 ID 集合
  let excludedPhotoIds = $state<Set<string>>(new Set());

  // 切換範疇時重設排除名單
  $effect(() => {
    const _scope = exportScope;
    excludedPhotoIds = new Set();
  });

  // 實際將被輸出的最終底片清單 (排除了被使用者手動取消勾選的底片)
  let finalExportPhotos = $derived<PhotoPlateItem[]>(
    effectivePhotos.filter(p => !excludedPhotoIds.has(p.id))
  );

  function togglePhotoInclusion(id: string) {
    const next = new Set(excludedPhotoIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    excludedPhotoIds = next;
  }

  function selectAllInQueue() {
    excludedPhotoIds = new Set();
  }

  function deselectAllInQueue() {
    excludedPhotoIds = new Set(effectivePhotos.map(p => p.id));
  }

  const STORAGE_KEY_DIR = 'slipknot_export_target_dir';
  const STORAGE_KEY_DATE_SUBDIR = 'slipknot_export_date_subdir';
  const STORAGE_KEY_BACKUP_RAW = 'slipknot_export_backup_raw';

  // 讀取既有設定或預設路徑
  const initialDir = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_DIR)
    ? localStorage.getItem(STORAGE_KEY_DIR)!
    : '~/Pictures/Slipknot_Curatorial_Export';

  const initialDateSubdir = typeof localStorage !== 'undefined' 
    ? localStorage.getItem(STORAGE_KEY_DATE_SUBDIR) !== 'false'
    : true;

  const initialBackupRaw = typeof localStorage !== 'undefined'
    ? localStorage.getItem(STORAGE_KEY_BACKUP_RAW) === 'true'
    : false;

  let targetDirectory = $state<string>(initialDir);
  let autoDateSubdir = $state<boolean>(initialDateSubdir);
  let backupRawFiles = $state<boolean>(initialBackupRaw);
  let preserveExif = $state<boolean>(true);
  let colorSpace = $state<'sRGB' | 'DisplayP3' | 'ProPhotoRGB'>('DisplayP3');

  // 社群策展 Prompt 與 Groq 文案狀態
  let userSocialPrompt = $state<string>('');
  let aiSocialCaption = $state<string>('');
  let aiSocialHashtags = $state<string[]>([]);
  let aiIptcKeywords = $state<string[]>([]);
  let isGeneratingCopy = $state<boolean>(false);
  let socialNotice = $state<string>('');

  function saveSettings() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_DIR, targetDirectory);
      localStorage.setItem(STORAGE_KEY_DATE_SUBDIR, String(autoDateSubdir));
      localStorage.setItem(STORAGE_KEY_BACKUP_RAW, String(backupRawFiles));
    }
  }

  // 互動式選取資料夾
  async function handlePickTargetFolder() {
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        if (dirHandle && dirHandle.name) {
          targetDirectory = dirHandle.name.startsWith('/') || dirHandle.name.includes(':') 
            ? dirHandle.name 
            : `~/Pictures/${dirHandle.name}`;
          saveSettings();
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('選取資料夾失敗:', err);
        }
      }
    }
  }

  // 今日日期字串 YYYY-MM-DD
  const todayStr = new Date().toISOString().slice(0, 10);

  // 動態即時計算路徑預覽
  const previewPath = $derived(() => {
    const cleanBase = targetDirectory.trim().replace(/\/+$/, '') || '~/Pictures/Slipknot_Curatorial_Export';
    return autoDateSubdir ? `${cleanBase}/${todayStr}` : cleanBase;
  });

  // 匯出時呼叫 Groq 生成社群文案
  async function handleGenerateSocialCopy() {
    isGeneratingCopy = true;
    try {
      const firstPhoto = photos[0];
      const res = await AiSceneService.generateGroqCopywriting({
        tags: aiVisionTags.length > 0 ? aiVisionTags : ['底片攝影', '光影展演'],
        sceneTitle: aiSceneTitle || '底片光影顯影',
        userPrompt: userSocialPrompt,
        cameraModel: firstPhoto?.camera || 'Sony Alpha 數位底片機身',
        lensModel: '原生光學鏡頭',
        exifOptical: `${photos.length} 幀底片批次匯出`
      });
      aiSocialCaption = res.caption;
      aiSocialHashtags = res.hashtags;
      aiIptcKeywords = res.iptcKeywords;
    } catch (err) {
      console.warn('Social copywriting error:', err);
    } finally {
      isGeneratingCopy = false;
    }
  }

  // 分享至社群（系統原生分享 Web Share API 或貼心剪貼簿直達）
  async function handleShareSocial() {
    const shareText = aiSocialCaption 
      ? `${aiSocialCaption}\n\n${aiSocialHashtags.join(' ')}`
      : `底片顯影紀錄：共 ${photos.length} 張底片已就緒。`;

    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: 'Slipknot 底片顯影分享',
          text: shareText
        });
        socialNotice = '系統分享面板已啟動 ✓';
        setTimeout(() => { socialNotice = ''; }, 3000);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    // Fallback: 複製發文草稿至剪貼簿
    try {
      await navigator.clipboard.writeText(shareText);
      socialNotice = '文案已複製！可直接開啟 Threads / Instagram 發布 ✓';
      setTimeout(() => { socialNotice = ''; }, 3500);
    } catch {
      socialNotice = '已複製文案至剪貼簿';
      setTimeout(() => { socialNotice = ''; }, 2500);
    }
  }

  // 複製文案
  async function handleCopyCaption() {
    if (!aiSocialCaption) return;
    const shareText = `${aiSocialCaption}\n\n${aiSocialHashtags.join(' ')}`;
    try {
      await navigator.clipboard.writeText(shareText);
      socialNotice = '文案與標籤已複製 ✓';
      setTimeout(() => { socialNotice = ''; }, 2500);
    } catch {
      socialNotice = '複製失敗';
    }
  }

  // 包裝匯出動作：若使用者輸入了 prompt 且尚未產出文案，匯出時順便啟動文案生成
  function handleTriggerExportWithCopy() {
    if (userSocialPrompt && !aiSocialCaption) {
      handleGenerateSocialCopy();
    }
    onTriggerExport(finalExportPhotos);
  }
</script>

<div class="export-viewport">
  <header class="export-toolbar hairline-b font-mono">
    <div class="header-left">
      <span class="tool-title font-headline">批次雙軌匯出管線</span>
      <span class="counter-badge amber">
        {finalExportPhotos.length} FRAMES QUEUED
        {#if excludedPhotoIds.size > 0}
          <span class="counter-excluded">({excludedPhotoIds.size} EXCLUDED)</span>
        {/if}
      </span>
    </div>

    <!-- EXPORT SCOPE SELECTOR TABS -->
    <div class="scope-selector-group hairline-all font-mono">
      <span class="scope-label">匯出範疇：</span>
      <button 
        type="button" 
        class="scope-chip" 
        class:active={exportScope === 'picked'}
        onclick={() => exportScope = 'picked'}
        title="僅匯出有標記 Pick 旗標的相片"
      >
        <span>已挑選 (Picked)</span>
        <span class="scope-badge">{pickedPhotos.length}</span>
      </button>

      <button 
        type="button" 
        class="scope-chip" 
        class:active={exportScope === 'edited'}
        onclick={() => exportScope = 'edited'}
        title="匯出所有已調整光影或套用風格的相片 (即使未標記 Pick 也能一鍵導出)"
      >
        <span>所有已調色 (Edited)</span>
        <span class="scope-badge amber">{editedPhotos.length}</span>
      </button>

      <button 
        type="button" 
        class="scope-chip" 
        class:active={exportScope === 'selected'}
        onclick={() => exportScope = 'selected'}
        title="僅匯出目前畫面選中的單張底片"
      >
        <span>當前底片 (Selected)</span>
      </button>

      <button 
        type="button" 
        class="scope-chip" 
        class:active={exportScope === 'all'}
        onclick={() => exportScope = 'all'}
        title="匯出相卷中的全部底片"
      >
        <span>全量底片 (All)</span>
        <span class="scope-badge">{allPhotos.length}</span>
      </button>
    </div>
  </header>

  <div class="export-content custom-scroll">
    <div class="export-deck max-w-4xl">
      <!-- QUEUED FRAMES VISUAL INSPECTION DOCK (所選底片視覺檢視佇列) -->
      <section class="queued-gallery-section hairline-all">
        <div class="gallery-header font-mono">
          <div class="gallery-title-left">
            <span class="material-symbols-outlined icon">photo_library</span>
            <span class="gallery-title">QUEUED FRAMES TELEMETRY // 待匯出底片預覽</span>
            <span class="gallery-scope-tag">
              {#if exportScope === 'picked'}
                [已挑選 PICKED · {finalExportPhotos.length}/{effectivePhotos.length} 幀]
              {:else if exportScope === 'edited'}
                [所有已調色 EDITED · {finalExportPhotos.length}/{effectivePhotos.length} 幀]
              {:else if exportScope === 'selected'}
                [當前底片 SELECTED · {finalExportPhotos.length}/{effectivePhotos.length} 幀]
              {:else}
                [全量底片 ALL · {finalExportPhotos.length}/{effectivePhotos.length} 幀]
              {/if}
            </span>
          </div>

          <div class="gallery-controls-right">
            <!-- 勾選/排除快捷操作 -->
            {#if effectivePhotos.length > 0}
              <div class="selection-action-group hairline-all font-mono">
                <button 
                  type="button" 
                  class="select-action-btn" 
                  onclick={selectAllInQueue}
                  disabled={excludedPhotoIds.size === 0}
                  title="將目前範疇的所有底片全部納入匯出"
                >
                  <span class="material-symbols-outlined" style="font-size: 13px;">check_box</span>
                  <span>全選</span>
                </button>
                <button 
                  type="button" 
                  class="select-action-btn" 
                  onclick={deselectAllInQueue}
                  disabled={finalExportPhotos.length === 0}
                  title="暫時排除目前範疇的所有底片"
                >
                  <span class="material-symbols-outlined" style="font-size: 13px;">check_box_outline_blank</span>
                  <span>全不選</span>
                </button>
              </div>
            {/if}

            <div class="gallery-layout-toggle">
              <button 
                type="button" 
                class="layout-btn" 
                class:active={previewLayout === 'strip'} 
                onclick={() => previewLayout = 'strip'}
                title="橫向膠卷帶檢視"
              >
                <span class="material-symbols-outlined" style="font-size: 15px;">view_timeline</span>
                <span>膠卷帶</span>
              </button>
              <button 
                type="button" 
                class="layout-btn" 
                class:active={previewLayout === 'grid'} 
                onclick={() => previewLayout = 'grid'}
                title="網格展開檢視"
              >
                <span class="material-symbols-outlined" style="font-size: 15px;">grid_view</span>
                <span>網格</span>
              </button>
            </div>
          </div>
        </div>

        {#if effectivePhotos.length > 0}
          <div 
            class="gallery-scroll-container"
            class:is-strip={previewLayout === 'strip'}
            class:is-grid={previewLayout === 'grid'}
          >
            {#each effectivePhotos as photo (photo.id)}
              <div 
                class="queued-photo-card hairline-all"
                class:is-flagged={photo.flagged}
                class:is-edited={isPhotoEdited(photo)}
                class:is-excluded={excludedPhotoIds.has(photo.id)}
                onclick={() => togglePhotoInclusion(photo.id)}
                role="button"
                tabindex="0"
                onkeydown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    togglePhotoInclusion(photo.id);
                  }
                }}
                title={excludedPhotoIds.has(photo.id) ? '點擊納入匯出清單' : '點擊自本次匯出排除'}
              >
                <!-- 縮圖容器 -->
                <div class="card-thumb-wrapper">
                  {#if photo.gradedThumbnail || photo.thumbnail}
                    <img 
                      src={photo.gradedThumbnail || photo.thumbnail} 
                      alt={photo.filename} 
                      class="card-img" 
                      loading="lazy"
                    />
                  {:else}
                    <div class="thumb-placeholder font-mono">NO THUMB</div>
                  {/if}

                  <!-- 互動核取方塊 (Checkbox) -->
                  <div 
                    class="card-checkbox"
                    class:checked={!excludedPhotoIds.has(photo.id)}
                    title={excludedPhotoIds.has(photo.id) ? '未勾選（已排除）' : '已勾選（將匯出）'}
                  >
                    {#if !excludedPhotoIds.has(photo.id)}
                      <span class="material-symbols-outlined check-icon">check</span>
                    {/if}
                  </div>

                  <!-- 膠卷幀號徽章 -->
                  <span class="plate-frame-badge font-mono">#{photo.frameNo}</span>

                  <!-- 排除暗化遮罩標記 -->
                  {#if excludedPhotoIds.has(photo.id)}
                    <div class="excluded-overlay font-mono">
                      <span class="material-symbols-outlined" style="font-size: 14px;">block</span>
                      <span>已排除</span>
                    </div>
                  {/if}

                  <!-- 狀態標籤（Pick 旗標 / 已調色 / 裁切） -->
                  <div class="plate-status-badges font-mono">
                    {#if photo.flagged}
                      <span class="badge-flagged" title="已標記挑選 (Picked)">
                        <span class="material-symbols-outlined" style="font-size: 11px;">flag</span>
                        <span>PICK</span>
                      </span>
                    {/if}
                    {#if isPhotoEdited(photo)}
                      <span class="badge-edited" title="已調色顯影">
                        <span class="material-symbols-outlined" style="font-size: 11px;">auto_fix_high</span>
                        <span>EDITED</span>
                      </span>
                    {/if}
                    {#if photo.crop && (photo.crop.width < 1 || photo.crop.height < 1)}
                      <span class="badge-crop" title="自訂裁切比例">
                        <span class="material-symbols-outlined" style="font-size: 11px;">crop</span>
                        <span>{photo.crop.aspectRatio || 'CROP'}</span>
                      </span>
                    {/if}
                  </div>
                </div>

                <!-- 底片資訊 -->
                <div class="card-meta font-mono">
                  <span class="meta-filename truncate" title={photo.filename}>{photo.filename}</span>
                  <div class="meta-profile-row truncate">
                    <span class="profile-dot" style:background={isPhotoEdited(photo) ? 'var(--cyan-accent)' : 'var(--parchment-dim)'}></span>
                    <span class="meta-profile truncate">{photo.appliedProfile || '標準風格'}</span>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <!-- 空狀態引導面板 -->
          <div class="gallery-empty-slate font-mono hairline-all">
            <span class="material-symbols-outlined empty-icon">filter_none</span>
            <div class="empty-text">
              {#if exportScope === 'picked'}
                <strong>目前佇列無挑選底片</strong>
                <p>您尚未標記任何底片為 Pick。可切換至「所有已調色」或「全量底片」以匯出相片。</p>
                <div class="empty-actions">
                  <button type="button" class="empty-cta-btn" onclick={() => exportScope = 'edited'}>
                    切換至「所有已調色 ({editedPhotos.length})」
                  </button>
                  <button type="button" class="empty-cta-btn outline" onclick={() => exportScope = 'all'}>
                    切換至「全量底片 ({allPhotos.length})」
                  </button>
                </div>
              {:else if exportScope === 'edited'}
                <strong>目前佇列無調色底片</strong>
                <p>相片尚未進行暗房調色。您可以切換至全量底片，或前往暗房進行風格微調。</p>
                <div class="empty-actions">
                  <button type="button" class="empty-cta-btn" onclick={() => exportScope = 'all'}>
                    切換至「全量底片 ({allPhotos.length})」
                  </button>
                </div>
              {:else}
                <strong>目前目錄無底片</strong>
                <p>請先由「膠卷目錄」載入相簿以進行批次匯出。</p>
              {/if}
            </div>
          </div>
        {/if}
      </section>

      <!-- DUAL PIPELINE SELECTOR CARDS -->
      <div class="pipeline-cards-row">
        <!-- MODE A: 社群速報 -->
        <button 
          type="button" 
          class="pipeline-card hairline-all" 
          class:active={exportMode === 'modeA'}
          onclick={() => onSetExportMode('modeA')}
        >
          <div class="pipe-header font-mono">
            <span class="pipe-badge">MODE A // ~88MS</span>
            <span class="material-symbols-outlined icon">bolt</span>
          </div>
          <h3 class="pipe-title font-headline">社群速報模式</h3>
          <p class="pipe-subtitle font-mono amber">極速出圖 · 社群搶發首選</p>
          <p class="pipe-desc font-body">
            GPU 著色器離屏採樣 (Off-screen Sampling)，無損回寫原始相機 EXIF 光學元數據，Display P3 色彩精準直出，檔案輕巧適合快速發文。
          </p>
          <div class="pipe-specs font-mono">
            <span class="chip amber">⚡ ~88ms / 幀</span>
            <span class="chip">📱 社群直出</span>
            <span class="chip">Display P3</span>
          </div>
        </button>

        <!-- MODE B: 出版典藏 -->
        <button 
          type="button" 
          class="pipeline-card hairline-all" 
          class:active={exportMode === 'modeB'}
          onclick={() => onSetExportMode('modeB')}
        >
          <div class="pipe-header font-mono">
            <span class="pipe-badge">MODE B // ~420MS</span>
            <span class="material-symbols-outlined icon">diamond</span>
          </div>
          <h3 class="pipe-title font-headline">出版典藏模式</h3>
          <p class="pipe-subtitle font-mono indigo">極致畫質 · 印刷與母帶保存</p>
          <p class="pipe-desc font-body">
            16-bit 滿血無損像素轉譯，ProPhoto RGB 廣色域映射防止高動態色彩斷階 (Banding)，支援數位防洗稿盲水印與母帶保存。
          </p>
          <div class="pipe-specs font-mono">
            <span class="chip amber">💎 ~420ms / 幀</span>
            <span class="chip">🖨️ 商業送印</span>
            <span class="chip">16-bit 廣色域</span>
          </div>
        </button>
      </div>

      <!-- EXPORT PIPELINE SETTINGS -->
      <div class="settings-panel hairline-all">
        <h4 class="settings-title font-mono">PIPELINE CONFIGURATION // 匯出目錄與參數配置</h4>
        
        <div class="settings-grid font-mono">
          <!-- 目標目錄選擇與輸入 -->
          <div class="setting-item col-span-2">
            <span class="setting-label">EXPORT DESTINATION (目標目錄)</span>
            <div class="dest-input-row">
              <input 
                type="text" 
                bind:value={targetDirectory} 
                oninput={saveSettings}
                class="setting-input flex-1" 
                placeholder="請輸入或瀏覽選擇匯出目錄"
              />
              <button 
                type="button" 
                class="browse-btn hairline-all"
                onclick={handlePickTargetFolder}
                title="瀏覽本機資料夾"
              >
                <span class="material-symbols-outlined" style="font-size: 16px;">folder_open</span>
                <span>瀏覽目錄</span>
              </button>
            </div>
          </div>

          <div class="setting-item">
            <span class="setting-label">COLOR SPACE MAPPING (色彩空間)</span>
            <select bind:value={colorSpace} class="setting-input select">
              <option value="DisplayP3">Display P3 (Apple 寬色域標準 · 建議)</option>
              <option value="sRGB">sRGB (網路與傳統設備通用)</option>
              <option value="ProPhotoRGB">ProPhoto RGB (暗房典藏廣色域)</option>
            </select>
          </div>

          <div class="setting-item">
            <span class="setting-label">STORAGE LOGIC (儲存原則)</span>
            <div class="fixed-policy-tag">
              <span class="material-symbols-outlined" style="font-size: 14px; color: var(--amber-highlight);">lock</span>
              <span>固定目錄結構 · 杜絕 AI 任意分散分類</span>
            </div>
          </div>
        </div>

        <div class="setting-toggles font-mono">
          <!-- 自動建立今日日期目錄 -->
          <label class="toggle-row">
            <input 
              type="checkbox" 
              bind:checked={autoDateSubdir} 
              onchange={saveSettings}
            />
            <span class="toggle-text highlight">
              自動建立當日日期子資料夾 (/{todayStr})
            </span>
          </label>

          <!-- RAW 雙軌備份 -->
          <label class="toggle-row">
            <input 
              type="checkbox" 
              bind:checked={backupRawFiles} 
              onchange={saveSettings}
            />
            <span class="toggle-text">
              雙軌保存：同步備份原始相機 RAW 檔至獨立 Raw_Backup 資料夾
            </span>
          </label>

          <!-- 保留 EXIF -->
          <label class="toggle-row">
            <input type="checkbox" bind:checked={preserveExif} />
            <span class="toggle-text">完整保留相機光學 EXIF 元數據（機身、鏡頭、光圈、快門、ISO）</span>
          </label>
        </div>

        <!-- 即時路徑預覽 (LIVE PATH PREVIEW) -->
        <div class="path-preview-box hairline-all font-mono">
          <div class="preview-title">
            <span class="material-symbols-outlined" style="font-size: 14px;">terminal</span>
            <span>預計檔案儲存結構預覽</span>
          </div>
          <div class="preview-tree">
            <div class="tree-line">
              <span class="tree-branch">📁 {previewPath()}/</span>
            </div>
            <div class="tree-line indent">
              <span class="tree-leaf">├─ 🖼️ Final_JPG/</span>
              <span class="tree-hint">({exportMode === 'modeA' ? 'Mode A 社群速報成片' : 'Mode B 出版典藏成片'})</span>
            </div>
            {#if backupRawFiles}
              <div class="tree-line indent">
                <span class="tree-leaf amber">└─ 💾 Raw_Backup/</span>
                <span class="tree-hint amber">(原始數位底片零損保存)</span>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- CURATORIAL SOCIAL DISPATCH // 匯出社群文案與自訂備註 -->
      <div class="social-dispatch-panel hairline-all">
        <div class="dispatch-header font-mono">
          <div class="header-title-row">
            <span class="material-symbols-outlined icon-glow">campaign</span>
            <span class="dispatch-title">CURATORIAL SOCIAL DISPATCH // 匯出社群發布備註</span>
          </div>
          {#if socialNotice}
            <span class="social-status-tag font-mono">{socialNotice}</span>
          {/if}
        </div>

        <!-- 視覺標籤與個人 Prompt 輸入列 -->
        <div class="dispatch-body">
          {#if aiVisionTags.length > 0}
            <div class="vision-tags-row font-mono">
              <span class="tags-hint">Gemini 視覺特徵：</span>
              {#each aiVisionTags as tag}
                <span class="tag-pill">#{tag}</span>
              {/each}
            </div>
          {/if}

          <div class="prompt-input-row font-mono">
            <div class="input-with-label">
              <span class="input-label">本次拍攝現場備註 / 心情 (PROMPT)</span>
              <div class="input-action-wrap">
                <input 
                  type="text" 
                  bind:value={userSocialPrompt}
                  class="social-prompt-input"
                  placeholder="可寫入現場心情（如：首爾雨後街頭漫步、赤峰街斜陽咖啡館）..."
                  onkeydown={(e) => { if (e.key === 'Enter') handleGenerateSocialCopy(); }}
                />
                <button 
                  type="button" 
                  class="generate-copy-btn hairline-all"
                  onclick={handleGenerateSocialCopy}
                  disabled={isGeneratingCopy}
                  title="由 Groq 秒速生成客製文案與 Hashtags"
                >
                  <span class="material-symbols-outlined" style="font-size: 14px;">
                    {isGeneratingCopy ? 'progress_activity' : 'auto_fix_high'}
                  </span>
                  <span>{isGeneratingCopy ? '生成中...' : (aiSocialCaption ? '重新演繹' : '生成發文文案')}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- 文案預覽卡片 -->
          {#if aiSocialCaption}
            <div class="copy-result-card hairline-all">
              <p class="result-text font-body">{aiSocialCaption}</p>
              <div class="result-hashtags font-mono">
                {#each aiSocialHashtags as tag}
                  <span class="hashtag-tag">{tag}</span>
                {/each}
              </div>
              <div class="result-toolbar font-mono">
                <div class="toolbar-left">
                  <button type="button" class="btn-micro hairline-all" onclick={handleCopyCaption}>
                    <span class="material-symbols-outlined" style="font-size: 13px;">content_copy</span>
                    <span>複製文案</span>
                  </button>
                  <button type="button" class="btn-micro primary hairline-all" onclick={handleShareSocial}>
                    <span class="material-symbols-outlined" style="font-size: 13px;">share</span>
                    <span>分享至社群</span>
                  </button>
                </div>
                {#if aiIptcKeywords.length > 0}
                  <span class="iptc-counter" title={aiIptcKeywords.join(', ')}>
                    ✓ {aiIptcKeywords.length} 個 IPTC 檢索標籤
                  </span>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- QUEUE SUMMARY & ACTION -->
      <div class="action-dock hairline-all">
        <div class="queue-info font-mono">
          <span class="queue-count">
            {finalExportPhotos.length} 幀底片就緒
            {#if excludedPhotoIds.size > 0}
              <span class="queue-excluded-note">({excludedPhotoIds.size} 幀已排除)</span>
            {/if}
          </span>
          <span class="queue-mode">
            模式：{exportMode === 'modeA' ? 'Mode A (社群速報 · 極速離屏採樣)' : 'Mode B (出版典藏 · 16-bit 滿血轉譯)'}
            · 範疇：{exportScope === 'picked' ? '已挑選 (Picked)' : exportScope === 'edited' ? '已調色 (Edited)' : exportScope === 'selected' ? '當前單幀' : '全量底片'}
          </span>
        </div>

        {#if isExporting}
          <div class="progress-wrap font-mono">
            <div class="progress-bar-outer">
              <div class="progress-bar-inner" style:width="{exportProgress}%"></div>
            </div>
            <div class="progress-text">
              <span>{exportNotice}</span>
              <span>{exportProgress}%</span>
            </div>
          </div>
        {:else}
          <div class="button-row">
            {#if exportNotice}
              <span class="notice-text font-mono">✓ {exportNotice}</span>
            {/if}

            <!-- 匯出完成後快捷分享社群按鈕 -->
            {#if aiSocialCaption || exportNotice}
              <button 
                type="button" 
                class="archival-btn-secondary share-btn"
                onclick={handleShareSocial}
                title="分享匯出文案至 Instagram / Threads 或叫起系統分享"
              >
                <span class="material-symbols-outlined" style="font-size: 16px;">share</span>
                <span>分享至社群</span>
              </button>
            {/if}

            <button 
              type="button" 
              class="archival-btn-primary launch-btn" 
              onclick={handleTriggerExportWithCopy}
              disabled={finalExportPhotos.length === 0}
            >
              <span class="material-symbols-outlined" style="font-size: 18px;">play_arrow</span>
              <span>
                {#if effectivePhotos.length === 0}
                  目前範圍無底片 · 請切換範疇
                {:else if finalExportPhotos.length === 0}
                  全部底片已排除 · 請至少勾選 1 幀
                {:else}
                  啟動批次匯出 ({finalExportPhotos.length} 幀) ⚡
                {/if}
              </span>
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .export-viewport {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background-color: var(--canvas-base);
    overflow: hidden;
  }

  .export-toolbar {
    height: 48px;
    background-color: var(--surface-panel);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .scope-selector-group {
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: rgba(22, 23, 27, 0.85);
    padding: 3px 6px;
    border-radius: var(--radius-sm);
  }

  .scope-label {
    font-size: 11px;
    color: var(--parchment-dim);
    margin-right: 4px;
  }

  .scope-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-xs);
    color: var(--parchment-muted);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .scope-chip:hover {
    color: var(--parchment-bright);
    background-color: rgba(255, 255, 255, 0.05);
  }

  .scope-chip.active {
    background: rgba(212, 163, 115, 0.15);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    font-weight: 600;
  }

  .scope-badge {
    padding: 1px 5px;
    font-size: 10px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--parchment-bright);
  }
  .scope-badge.amber {
    background: rgba(212, 163, 115, 0.25);
    color: var(--amber-highlight);
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

  .export-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  .export-deck {
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .pipeline-cards-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .pipeline-card {
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    padding: 20px;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pipeline-card:hover {
    border-color: var(--parchment-dim);
    background-color: var(--surface-elevated);
  }

  .pipeline-card.active {
    border-color: var(--amber-highlight);
    background-color: var(--surface-elevated);
    box-shadow: 0 0 0 1px var(--amber-highlight);
  }

  .pipe-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .pipe-badge {
    font-size: 10px;
    color: var(--parchment-dim);
    background-color: var(--canvas-base);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
  }

  .pipeline-card.active .pipe-badge {
    color: var(--amber-highlight);
  }

  .pipe-header .icon {
    font-size: 20px;
    color: var(--parchment-dim);
  }

  .pipeline-card.active .icon {
    color: var(--amber-highlight);
  }

  .pipe-title {
    font-size: 18px;
    color: var(--parchment-bright);
    margin: 0;
  }

  .pipe-subtitle {
    font-size: 11px;
    letter-spacing: 0.05em;
    margin: 0;
    font-weight: 500;
  }

  .pipe-subtitle.amber {
    color: var(--amber-highlight);
  }

  .pipe-subtitle.indigo {
    color: #818cf8;
  }

  .pipe-desc {
    font-size: 12px;
    color: var(--parchment-muted);
    line-height: 1.5;
    margin: 0;
  }

  .pipe-specs {
    display: flex;
    gap: 6px;
    margin-top: auto;
  }

  .chip {
    font-size: 10px;
    background-color: var(--canvas-base);
    color: var(--parchment-dim);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
  }

  .chip.amber {
    color: var(--amber-highlight);
  }

  .settings-panel {
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .settings-title {
    font-size: 12px;
    color: var(--parchment-dim);
    letter-spacing: 0.08em;
    margin: 0;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }

  .col-span-2 {
    grid-column: span 2;
  }

  .setting-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .setting-label {
    font-size: 10px;
    color: var(--parchment-muted);
  }

  .dest-input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .setting-input {
    background-color: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    color: var(--parchment-bright);
    padding: 8px 12px;
    font-size: 12px;
    font-family: inherit;
    outline: none;
  }

  .setting-input.flex-1 {
    flex: 1;
  }

  .browse-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background-color: var(--surface-elevated);
    color: var(--parchment-bright);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    padding: 8px 14px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .browse-btn:hover {
    border-color: var(--parchment-dim);
    background-color: var(--canvas-base);
  }

  .fixed-policy-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background-color: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    padding: 8px 12px;
    font-size: 11px;
    color: var(--parchment-dim);
  }

  .setting-input:focus {
    border-color: var(--primary-indigo);
  }

  .setting-toggles {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--hairline-slate);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--parchment-muted);
    cursor: pointer;
  }

  .toggle-text.highlight {
    color: var(--parchment-bright);
    font-weight: 500;
  }

  /* 即時路徑預覽 (PATH PREVIEW) */
  .path-preview-box {
    background-color: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .preview-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: var(--parchment-muted);
    letter-spacing: 0.05em;
  }

  .preview-tree {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
  }

  .tree-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tree-line.indent {
    padding-left: 14px;
  }

  .tree-branch {
    color: var(--parchment-bright);
    font-weight: 500;
  }

  .tree-leaf {
    color: var(--parchment-dim);
  }

  .tree-leaf.amber {
    color: var(--amber-highlight);
  }

  .tree-hint {
    font-size: 10px;
    color: var(--parchment-muted);
  }

  .tree-hint.amber {
    color: var(--amber-highlight);
    opacity: 0.85;
  }

  /* CURATORIAL SOCIAL DISPATCH 面板樣式 */
  .social-dispatch-panel {
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    border-left: 3px solid #818cf8;
  }

  .dispatch-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .icon-glow {
    font-size: 16px;
    color: #818cf8;
  }

  .dispatch-title {
    font-size: 12px;
    color: var(--parchment-bright);
    letter-spacing: 0.06em;
  }

  .social-status-tag {
    font-size: 10px;
    background-color: rgba(129, 140, 248, 0.15);
    color: #a5b4fc;
    padding: 2px 8px;
    border-radius: var(--radius-xs);
  }

  .dispatch-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .vision-tags-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tags-hint {
    font-size: 10px;
    color: var(--parchment-muted);
  }

  .tag-pill {
    font-size: 10px;
    color: var(--amber-highlight);
    background-color: var(--canvas-base);
    border: 1px solid rgba(226, 157, 82, 0.3);
    padding: 1px 6px;
    border-radius: var(--radius-xs);
  }

  .prompt-input-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .input-with-label {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .input-label {
    font-size: 10px;
    color: var(--parchment-muted);
  }

  .input-action-wrap {
    display: flex;
    gap: 8px;
  }

  .social-prompt-input {
    flex: 1;
    background-color: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    color: var(--parchment-bright);
    padding: 8px 12px;
    font-size: 12px;
    outline: none;
    font-family: inherit;
  }

  .social-prompt-input:focus {
    border-color: #818cf8;
  }

  .generate-copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background-color: #1e1e2e;
    color: #a5b4fc;
    border: 1px solid rgba(129, 140, 248, 0.35);
    border-radius: var(--radius-xs);
    padding: 8px 14px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .generate-copy-btn:hover:not(:disabled) {
    background-color: #27273a;
    border-color: #818cf8;
    color: #ffffff;
  }

  .generate-copy-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .copy-result-card {
    background-color: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .result-text {
    font-size: 13px;
    color: var(--parchment-bright);
    line-height: 1.5;
    margin: 0;
    white-space: pre-line;
  }

  .result-hashtags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .hashtag-tag {
    font-size: 10px;
    color: #818cf8;
  }

  .result-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 8px;
    border-top: 1px solid var(--hairline-slate);
  }

  .toolbar-left {
    display: flex;
    gap: 8px;
  }

  .btn-micro {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    color: var(--parchment-dim);
    font-size: 10px;
    padding: 4px 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-micro:hover {
    color: var(--parchment-bright);
    border-color: var(--parchment-dim);
    background-color: var(--surface-elevated);
  }

  .btn-micro.primary {
    background-color: rgba(129, 140, 248, 0.15);
    border-color: rgba(129, 140, 248, 0.4);
    color: #a5b4fc;
  }

  .btn-micro.primary:hover {
    background-color: rgba(129, 140, 248, 0.25);
    border-color: #818cf8;
    color: #ffffff;
  }

  .iptc-counter {
    font-size: 10px;
    color: var(--parchment-muted);
  }

  .share-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background-color: rgba(129, 140, 248, 0.15) !important;
    border: 1px solid rgba(129, 140, 248, 0.4) !important;
    color: #a5b4fc !important;
    padding: 10px 16px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .share-btn:hover {
    background-color: rgba(129, 140, 248, 0.28) !important;
    border-color: #818cf8 !important;
    color: #ffffff !important;
  }

  .action-dock {
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .queue-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .queue-count {
    font-size: 14px;
    font-weight: 600;
    color: var(--parchment-bright);
  }

  .queue-mode {
    font-size: 11px;
    color: var(--amber-highlight);
  }

  .button-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .notice-text {
    font-size: 11px;
    color: var(--amber-highlight);
  }

  .launch-btn {
    padding: 10px 20px;
    font-size: 13px;
  }

  .progress-wrap {
    width: 320px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .progress-bar-outer {
    height: 6px;
    background-color: var(--canvas-base);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar-inner {
    height: 100%;
    background-color: var(--amber-highlight);
    transition: width 0.1s linear;
  }

  .progress-text {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--parchment-muted);
  }

  /* QUEUED FRAMES PREVIEW GALLERY */
  .queued-gallery-section {
    background-color: var(--surface-panel);
    border-radius: var(--radius-sm);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .gallery-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .gallery-title-left {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--parchment-bright);
    letter-spacing: 0.05em;
  }

  .gallery-title-left .icon {
    font-size: 16px;
    color: var(--amber-highlight);
  }

  .gallery-scope-tag {
    font-size: 11px;
    color: var(--amber-highlight);
    background: rgba(212, 163, 115, 0.12);
    padding: 1px 8px;
    border-radius: var(--radius-xs);
    border: 1px solid rgba(212, 163, 115, 0.3);
  }

  .gallery-controls-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .selection-action-group {
    display: flex;
    align-items: center;
    gap: 2px;
    background-color: var(--surface-elevated);
    padding: 2px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--hairline-slate);
  }

  .select-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 7px;
    background: transparent;
    border: none;
    border-radius: var(--radius-xs);
    color: var(--parchment-dim);
    font-size: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .select-action-btn:hover:not(:disabled) {
    color: var(--parchment-bright);
    background-color: rgba(255, 255, 255, 0.06);
  }

  .select-action-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .gallery-layout-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: var(--surface-elevated);
    padding: 2px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--hairline-slate);
  }

  .layout-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: transparent;
    border: none;
    border-radius: var(--radius-xs);
    color: var(--parchment-dim);
    font-size: 10.5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .layout-btn:hover {
    color: var(--parchment-bright);
  }

  .layout-btn.active {
    background-color: var(--surface-overlay);
    color: var(--amber-highlight);
  }

  /* 膠卷滾動帶模式 */
  .gallery-scroll-container.is-strip {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 8px;
    scroll-behavior: smooth;
  }

  /* 網格展開模式 */
  .gallery-scroll-container.is-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 12px;
    max-height: 280px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .queued-photo-card {
    flex: 0 0 130px;
    width: 130px;
    background-color: var(--surface-elevated);
    border-radius: var(--radius-xs);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    user-select: none;
    transition: transform 0.15s ease, border-color 0.15s ease, opacity 0.2s ease, filter 0.2s ease;
  }

  .gallery-scroll-container.is-grid .queued-photo-card {
    flex: 1 1 auto;
    width: 100%;
  }

  .queued-photo-card:hover {
    border-color: var(--amber-highlight);
    transform: translateY(-2px);
  }

  .queued-photo-card.is-flagged {
    border-color: rgba(212, 163, 115, 0.4);
  }

  /* 排除狀態卡片 */
  .queued-photo-card.is-excluded {
    opacity: 0.45;
    filter: grayscale(0.65);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .queued-photo-card.is-excluded:hover {
    opacity: 0.75;
    filter: grayscale(0.2);
    border-color: var(--hairline-slate);
  }

  .card-thumb-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 3 / 2;
    background-color: #0b0c0e;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .card-checkbox {
    position: absolute;
    top: 5px;
    left: 5px;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    background: rgba(18, 19, 22, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    z-index: 2;
  }

  .card-checkbox.checked {
    background: var(--amber-highlight);
    border-color: var(--amber-highlight);
  }

  .card-checkbox .check-icon {
    font-size: 13px;
    color: #121316;
    font-weight: 700;
  }

  .excluded-overlay {
    position: absolute;
    inset: 0;
    background: rgba(11, 12, 14, 0.7);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    color: var(--parchment-dim);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    z-index: 1;
    pointer-events: none;
  }

  .card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumb-placeholder {
    font-size: 9px;
    color: var(--parchment-dim);
  }

  .plate-frame-badge {
    position: absolute;
    bottom: 4px;
    left: 4px;
    font-size: 9px;
    background: rgba(18, 19, 22, 0.85);
    color: var(--parchment-bright);
    padding: 1px 4px;
    border-radius: 2px;
    border: 1px solid var(--hairline-slate);
    line-height: 1;
    z-index: 2;
  }

  .counter-excluded {
    font-size: 9.5px;
    color: var(--parchment-dim);
    margin-left: 3px;
  }

  .queue-excluded-note {
    font-size: 11px;
    color: var(--parchment-dim);
    font-weight: normal;
    margin-left: 4px;
  }

  .plate-status-badges {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: flex-end;
  }

  .badge-flagged, .badge-edited, .badge-crop {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 8.5px;
    padding: 1px 4px;
    border-radius: 2px;
    line-height: 1;
    font-weight: 600;
  }

  .badge-flagged {
    background: rgba(212, 163, 115, 0.9);
    color: #121316;
  }

  .badge-edited {
    background: rgba(94, 234, 212, 0.9);
    color: #121316;
  }

  .badge-crop {
    background: rgba(18, 19, 22, 0.85);
    color: var(--amber-highlight);
    border: 1px solid rgba(212, 163, 115, 0.4);
  }

  .card-meta {
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--surface-elevated);
  }

  .meta-filename {
    font-size: 10px;
    color: var(--parchment-bright);
    font-weight: 500;
  }

  .meta-profile-row {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    color: var(--parchment-dim);
  }

  .profile-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* 空狀態引導面板 */
  .gallery-empty-slate {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-xs);
    padding: 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    color: var(--parchment-muted);
  }

  .empty-icon {
    font-size: 32px;
    color: var(--amber-highlight);
    opacity: 0.7;
    flex-shrink: 0;
  }

  .empty-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .empty-text strong {
    font-size: 13px;
    color: var(--parchment-bright);
  }

  .empty-text p {
    font-size: 11px;
    color: var(--parchment-dim);
    margin: 0;
  }

  .empty-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .empty-cta-btn {
    padding: 4px 10px;
    font-size: 11px;
    border-radius: var(--radius-xs);
    background: rgba(212, 163, 115, 0.15);
    border: 1px solid var(--amber-highlight);
    color: var(--amber-highlight);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .empty-cta-btn:hover {
    background: rgba(212, 163, 115, 0.25);
  }

  .empty-cta-btn.outline {
    background: transparent;
    border-color: var(--hairline-slate);
    color: var(--parchment-muted);
  }

  .empty-cta-btn.outline:hover {
    color: var(--parchment-bright);
    border-color: var(--parchment-dim);
  }
</style>
