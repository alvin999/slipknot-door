<script lang="ts">
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
    onSetExportMode: (m: 'modeA' | 'modeB') => void;
    onTriggerExport: () => void;
  }

  let {
    photos,
    exportMode,
    isExporting,
    exportProgress,
    exportNotice,
    onSetExportMode,
    onTriggerExport
  }: Props = $props();

  let targetDirectory = $state<string>('~/Pictures/Slipknot_Curatorial_Export');
  let preserveExif = $state<boolean>(true);
  let colorSpace = $state<'sRGB' | 'DisplayP3' | 'ProPhotoRGB'>('DisplayP3');
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
        <!-- MODE A -->
        <button 
          type="button" 
          class="pipeline-card hairline-all" 
          class:active={exportMode === 'modeA'}
          onclick={() => onSetExportMode('modeA')}
        >
          <div class="pipe-header font-mono">
            <span class="pipe-badge">MODE A // 88MS</span>
            <span class="material-symbols-outlined icon">bolt</span>
          </div>
          <h3 class="pipe-title font-headline">極速出圖模式</h3>
          <p class="pipe-desc font-body">
            GPU 著色器離屏採樣 (Off-screen Sampling)，無損回寫原始相機 EXIF 光學元數據，直接寫入系統相簿。
          </p>
          <div class="pipe-specs font-mono">
            <span class="chip">著色器採樣</span>
            <span class="chip amber">~88ms / 幀</span>
            <span class="chip">直入相簿</span>
          </div>
        </button>

        <!-- MODE B -->
        <button 
          type="button" 
          class="pipeline-card hairline-all" 
          class:active={exportMode === 'modeB'}
          onclick={() => onSetExportMode('modeB')}
        >
          <div class="pipe-header font-mono">
            <span class="pipe-badge">MODE B // 420MS</span>
            <span class="material-symbols-outlined icon">hd</span>
          </div>
          <h3 class="pipe-title font-headline">極致典藏模式</h3>
          <p class="pipe-desc font-body">
            16-bit 滿血無損 JPEG / TIFF 轉譯，ProPhoto RGB 廣色域映射，注入防洗稿數位水印與典藏目錄儲存。
          </p>
          <div class="pipe-specs font-mono">
            <span class="chip">16-bit 滿血解碼</span>
            <span class="chip amber">~420ms / 幀</span>
            <span class="chip">ProPhoto RGB</span>
          </div>
        </button>
      </div>

      <!-- EXPORT PIPELINE SETTINGS -->
      <div class="settings-panel hairline-all">
        <h4 class="settings-title font-mono">PIPELINE CONFIGURATION // 匯出參數配置</h4>
        
        <div class="settings-grid font-mono">
          <div class="setting-item">
            <span class="setting-label">EXPORT DESTINATION (目標目錄)</span>
            <input 
              type="text" 
              bind:value={targetDirectory} 
              class="setting-input" 
              placeholder="請輸入或選擇匯出資料夾"
            />
          </div>

          <div class="setting-item">
            <span class="setting-label">COLOR SPACE MAPPING (色彩空間)</span>
            <select bind:value={colorSpace} class="setting-input select">
              <option value="DisplayP3">Display P3 (Apple 寬色域標準 · 建議)</option>
              <option value="sRGB">sRGB (網路與傳統設備通用)</option>
              <option value="ProPhotoRGB">ProPhoto RGB (暗房典藏廣色域)</option>
            </select>
          </div>
        </div>

        <div class="setting-toggles font-mono">
          <label class="toggle-row">
            <input type="checkbox" bind:checked={preserveExif} />
            <span>完整保留相機光學 EXIF 元數據（機身、鏡頭、光圈、快門、ISO）</span>
          </label>
        </div>
      </div>

      <!-- QUEUE SUMMARY & ACTION -->
      <div class="action-dock hairline-all">
        <div class="queue-info font-mono">
          <span class="queue-count">{photos.length} 幀底片就緒</span>
          <span class="queue-mode">
            模式：{exportMode === 'modeA' ? 'Mode A (極速著色器採樣)' : 'Mode B (16-bit 典藏輸出)'}
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
            <button 
              type="button" 
              class="archival-btn-primary launch-btn" 
              onclick={onTriggerExport}
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

  .setting-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .setting-label {
    font-size: 10px;
    color: var(--parchment-muted);
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
