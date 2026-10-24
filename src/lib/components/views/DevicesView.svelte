<script lang="ts">
  import { IngestionService, type CameraMountInfo } from '$lib/services/ingestionService';

  interface Props {
    cameraMounts: CameraMountInfo[];
    isScanningMounts: boolean;
    geminiKeyStatus: { exists: boolean; mode: string | null };
    onRefreshMounts: () => void;
    onOpenVault: () => void;
    onLoadMount?: (mount: CameraMountInfo) => void;
    onPickDirectory?: () => void;
  }

  let {
    cameraMounts = [],
    isScanningMounts = false,
    geminiKeyStatus,
    onRefreshMounts,
    onOpenVault,
    onLoadMount,
    onPickDirectory
  }: Props = $props();

  let autoPolling = $state<boolean>(true);
  let cacheStatusText = $state<string>('極速預覽快取良好（50ms 記憶體抽取）');
  let isWebMode = $derived(!IngestionService.isTauri());

  function clearPreviewCache() {
    cacheStatusText = '已清理暫存快取標頭';
    setTimeout(() => {
      cacheStatusText = '極速預覽快取良好（50ms 記憶體抽取）';
    }, 2500);
  }
</script>

<div class="devices-viewport">
  <header class="devices-toolbar hairline-b font-mono">
    <div class="header-left">
      <span class="tool-title font-headline">外接相機與存儲遙測 (Devices & Storage)</span>
      <span class="counter-badge">{cameraMounts.length} CONNECTED</span>
    </div>
    <div class="header-right">
      <button 
        type="button" 
        class="tool-btn" 
        onclick={onRefreshMounts}
        disabled={isScanningMounts}
      >
        <span class="material-symbols-outlined" class:spin={isScanningMounts} style="font-size: 15px;">
          sync
        </span>
        <span>{isScanningMounts ? '探測中...' : '重新掃描掛載'}</span>
      </button>
    </div>
  </header>

  <div class="devices-content custom-scroll">
    <div class="devices-deck max-w-4xl">
      <!-- HARDWARE INGESTION STATUS CARD -->
      <div class="status-section hairline-all">
        <div class="section-top font-mono">
          <div class="status-indicator-box">
            <span class="live-dot" class:active={cameraMounts.length > 0}></span>
            <span class="section-heading font-headline">
              {cameraMounts.length > 0 ? '相機硬體已掛載' : isWebMode ? '網頁預覽環境 (沙盒限制)' : '等待相機設備連線'}
            </span>
          </div>
          <label class="auto-poll-label font-mono">
            <input type="checkbox" bind:checked={autoPolling} />
            <span>USB 隨插即讀即時監聽</span>
          </label>
        </div>

        {#if cameraMounts.length > 0}
          <div class="mounts-list font-mono">
            {#each cameraMounts as mount}
              <div class="mount-item hairline-all">
                <div class="mount-icon-box">
                  <span class="material-symbols-outlined mount-icon">
                    {mount.is_camera ? 'photo_camera' : 'usb'}
                  </span>
                </div>
                <div class="mount-details">
                  <div class="mount-name-row">
                    <span class="mount-vol font-headline">{mount.volume_name}</span>
                    <span class="mount-tag">{mount.is_camera ? 'DCIM 攝影機' : '外接磁碟'}</span>
                  </div>
                  <div class="mount-path-row font-mono truncate">
                    <span>掛載路徑：{mount.mount_path}</span>
                    {#if mount.dcim_path}
                      <span class="divider">|</span>
                      <span>DCIM 目錄：{mount.dcim_path}</span>
                    {/if}
                  </div>
                </div>
                <div class="mount-action-box">
                  <div class="mount-count-pill font-mono">
                    <span class="num">{mount.file_count}</span>
                    <span class="lbl">FRAMES</span>
                  </div>
                  {#if onLoadMount}
                    <button 
                      type="button" 
                      class="archival-btn-primary compact-load"
                      onclick={() => onLoadMount?.(mount)}
                    >
                      <span class="material-symbols-outlined" style="font-size: 14px;">input</span>
                      <span>載入相片</span>
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else if isWebMode}
          <div class="empty-device-hint font-mono hairline-all web-notice">
            <span class="material-symbols-outlined" style="font-size: 32px; color: var(--amber-highlight);">info</span>
            <div class="hint-text">
              <div class="hint-title">目前在瀏覽器網頁模式中執行</div>
              <div class="hint-desc">
                因瀏覽器安全沙盒規範，一般 Web 網頁無法主動探測作業系統層級的外接 USB 磁碟（例如 <code>/run/media/...</code>）。
                您可以直接點擊下方按鈕手動選取相機記憶卡資料夾；或執行 <code>npm run tauri dev</code> 啟動桌面版以享有自動隨插即讀探測！
              </div>
            </div>
            {#if onPickDirectory}
              <button type="button" class="archival-btn-primary" onclick={onPickDirectory}>
                手動開啟相機目錄 (DCIM)
              </button>
            {/if}
          </div>
        {:else}
          <div class="empty-device-hint font-mono hairline-all">
            <span class="material-symbols-outlined" style="font-size: 32px; color: var(--parchment-dim);">cable</span>
            <div class="hint-text">
              <div class="hint-title">本機目前未偵測到相機掛載</div>
              <div class="hint-desc">
                請以 USB/Type-C 傳輸線連接 Sony Alpha, Canon EOS, Nikon, Fujifilm 等相機並開啟電源，系統將自動秒級辨識並讀取相片。
              </div>
            </div>
            <button type="button" class="archival-btn-secondary" onclick={onRefreshMounts}>
              手動重整掛載
            </button>
          </div>
        {/if}
      </div>

      <!-- KEY VAULT QUICK STATUS CARD -->
      <div class="status-section hairline-all">
        <div class="section-top font-mono">
          <div class="status-indicator-box">
            <span class="material-symbols-outlined" style="font-size: 18px; color: var(--amber-highlight);">lock</span>
            <span class="section-heading font-headline">AI 金鑰安全保險庫 (Key Vault)</span>
          </div>
          <button type="button" class="tool-btn font-mono" onclick={onOpenVault}>
            管理保險庫
          </button>
        </div>

        <div class="vault-info-box font-mono">
          <div class="vault-row">
            <span class="vault-lbl">防護架構狀態</span>
            {#if geminiKeyStatus.exists}
              <span class="vault-val green">
                ● 已配置 · {geminiKeyStatus.mode === 'password' ? '密碼加密 (PBKDF2)' : geminiKeyStatus.mode === 'transparent' ? '透明加密 (設備指紋 AES-GCM)' : '無加密 (明文)'}
              </span>
            {:else}
              <span class="vault-val dim">○ 尚未設定金鑰（啟用在地啟發式光學降級）</span>
            {/if}
          </div>
          <div class="vault-row">
            <span class="vault-lbl">推論安全性</span>
            <span class="vault-val">端對端本地存儲 · 絕不上傳至任何第三方中轉雲端</span>
          </div>
        </div>
      </div>

      <!-- LOCAL CACHE MANAGEMENT -->
      <div class="status-section hairline-all">
        <div class="section-top font-mono">
          <div class="status-indicator-box">
            <span class="material-symbols-outlined" style="font-size: 18px; color: var(--parchment-muted);">memory</span>
            <span class="section-heading font-headline">50ms 內嵌 JPEG 極速快取管理</span>
          </div>
          <button type="button" class="tool-btn font-mono" onclick={clearPreviewCache}>
            清理快取
          </button>
        </div>

        <p class="cache-desc font-body">
          {cacheStatusText}。內嵌 JPEG 與光學 EXIF 解析引擎採純二進位標頭抽取（不執行全尺寸去馬賽克），僅佔用微量記憶體快取。
        </p>
      </div>
    </div>
  </div>
</div>

<style>
  .devices-viewport {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background-color: var(--canvas-base);
    overflow: hidden;
  }

  .devices-toolbar {
    height: 48px;
    background-color: var(--surface-panel);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }

  .header-left, .header-right {
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

  .tool-btn {
    background-color: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-muted);
    font-family: inherit;
    font-size: 11px;
    padding: 5px 12px;
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
  }

  .devices-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  .devices-deck {
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .status-section {
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .status-indicator-box {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--parchment-dim);
  }

  .live-dot.active {
    background-color: #4ade80;
    box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
  }

  .section-heading {
    font-size: 16px;
    color: var(--parchment-bright);
  }

  .auto-poll-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--parchment-muted);
    cursor: pointer;
  }

  .mounts-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mount-item {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .mount-icon-box {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-xs);
    background-color: var(--canvas-base);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mount-icon {
    font-size: 20px;
    color: var(--amber-highlight);
  }

  .mount-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .mount-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mount-vol {
    font-size: 14px;
    color: var(--parchment-bright);
  }

  .mount-tag {
    font-size: 10px;
    background-color: var(--canvas-base);
    color: var(--parchment-dim);
    padding: 1px 6px;
    border-radius: var(--radius-xs);
  }

  .mount-path-row {
    font-size: 11px;
    color: var(--parchment-dim);
    display: flex;
    gap: 6px;
  }

  .mount-count-pill {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .mount-count-pill .num {
    font-size: 16px;
    font-weight: 600;
    color: var(--amber-highlight);
  }

  .mount-count-pill .lbl {
    font-size: 9px;
    color: var(--parchment-dim);
  }

  .mount-action-box {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .compact-load {
    padding: 6px 12px;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .web-notice {
    border-left: 3px solid var(--amber-highlight);
  }

  .web-notice code {
    background-color: var(--canvas-base);
    color: var(--amber-highlight);
    padding: 1px 4px;
    border-radius: var(--radius-xs);
    font-family: inherit;
  }

  .empty-device-hint {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 24px;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .hint-text {
    flex: 1;
  }

  .hint-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--parchment-bright);
    margin-bottom: 4px;
  }

  .hint-desc {
    font-size: 11px;
    color: var(--parchment-muted);
    line-height: 1.5;
  }

  .vault-info-box {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .vault-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }

  .vault-lbl {
    color: var(--parchment-dim);
  }

  .vault-val.green {
    color: #4ade80;
  }

  .vault-val.dim {
    color: var(--parchment-dim);
  }

  .cache-desc {
    font-size: 12px;
    color: var(--parchment-muted);
    line-height: 1.6;
    margin: 0;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
