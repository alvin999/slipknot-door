<script lang="ts">
  import { AiSceneService } from '$lib/services/aiSceneService';

  interface PhotoPlateItem {
    id: string;
    frameNo: string;
    filename: string;
    camera: string;
    appliedProfile: string;
    selected: boolean;
  }

  interface Props {
    photos: PhotoPlateItem[];
    exportMode: 'modeA' | 'modeB';
    isExporting: boolean;
    exportProgress: number;
    exportNotice: string;
    aiVisionTags?: string[];
    aiSceneTitle?: string;
    onSetExportMode: (m: 'modeA' | 'modeB') => void;
    onTriggerExport: () => void;
  }

  let {
    photos,
    exportMode,
    isExporting,
    exportProgress,
    exportNotice,
    aiVisionTags = [],
    aiSceneTitle = '',
    onSetExportMode,
    onTriggerExport
  }: Props = $props();

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
    onTriggerExport();
  }
</script>

<div class="export-viewport">
  <header class="export-toolbar hairline-b font-mono">
    <div class="header-left">
      <span class="tool-title font-headline">批次雙軌匯出管線 (Dual Pipeline)</span>
      <span class="counter-badge">{photos.length} FRAMES QUEUED</span>
    </div>
  </header>

  <div class="export-content custom-scroll">
    <div class="export-deck max-w-4xl">
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
          <span class="queue-count">{photos.length} 幀底片就緒</span>
          <span class="queue-mode">
            模式：{exportMode === 'modeA' ? 'Mode A (社群速報 · 極速離屏採樣)' : 'Mode B (出版典藏 · 16-bit 滿血轉譯)'}
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
              disabled={photos.length === 0}
            >
              <span class="material-symbols-outlined" style="font-size: 18px;">play_arrow</span>
              <span>{photos.length === 0 ? '相卷為空 · 請先載入相片' : '啟動批次雙軌匯出'}</span>
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
</style>
