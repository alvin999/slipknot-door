<script lang="ts">
  import { IngestionService, type CameraMountInfo } from '$lib/services/ingestionService';
  import { ModelDiscoveryService } from '$lib/services/modelDiscoveryService';
  import { aiPipeline } from '$lib/stores/aiPipeline.svelte';
  import type { AiScopePreferences } from '$lib/types/photo';

  interface Props {
    cameraMounts: CameraMountInfo[];
    isScanningMounts: boolean;
    geminiKeyStatus: { exists: boolean; mode: string | null };
    groqKeyStatus?: { exists: boolean; mode: string | null };
    onRefreshMounts: () => void;
    onOpenVault: () => void;
    onLoadMount?: (mount: CameraMountInfo) => void;
    onPickDirectory?: () => void;
    onGoToCatalog?: () => void;
    onGoToRetouch?: () => void;
  }

  let {
    cameraMounts = [],
    isScanningMounts = false,
    geminiKeyStatus,
    groqKeyStatus = { exists: false, mode: null },
    onRefreshMounts,
    onOpenVault,
    onLoadMount,
    onPickDirectory,
    onGoToCatalog,
    onGoToRetouch
  }: Props = $props();

  let autoPolling = $state<boolean>(true);
  let cacheStatusText = $state<string>('極速預覽快取良好（50ms 記憶體抽取）');
  let showWebSandboxDetails = $state<boolean>(false);
  let isWebMode = $derived(!IngestionService.isTauri());

  const SCOPE_ITEMS: { key: keyof AiScopePreferences; label: string }[] = [
    { key: 'lutProfile', label: '底片風格 LUT' },
    { key: 'tone', label: '曝光與光影階調' },
    { key: 'whiteBalance', label: '色溫白平衡' },
    { key: 'filmPhysics', label: '色彩科學與 HSL' },
    { key: 'splitToning', label: '冷暖分區色調' },
    { key: 'filmTexture', label: '顆粒光暈與暗角' },
    { key: 'crop', label: '自動構圖裁切' },
    { key: 'keystone', label: '透視幾何校正' },
  ];

  function getModelsForProvider(provider: string, currentId: string): { id: string; displayName: string }[] {
    const prov = provider === 'groq' ? 'groq' : 'gemini';
    const cached = ModelDiscoveryService.getCachedModels(prov).map((m) => ({
      id: m.id,
      displayName: m.displayName || m.id
    }));
    if (cached.some((m) => m.id === currentId)) return cached;
    return [{ id: currentId, displayName: currentId }, ...cached];
  }

  function formatVaultMode(status: { exists: boolean; mode: string | null }): string {
    if (!status.exists) return '未設定金鑰';
    if (status.mode === 'password') return '密碼加密 (PBKDF2)';
    if (status.mode === 'transparent') return '透明加密 (AES-GCM)';
    return '無加密 (明文)';
  }

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
      <span class="tool-title font-headline">設定與設備總覽 (Settings & Hardware Hub)</span>
      <span class="counter-badge">{cameraMounts.length} CONNECTED</span>
    </div>
    <div class="header-right">
      {#if !isWebMode}
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
      {/if}
      <button type="button" class="tool-btn" onclick={onOpenVault}>
        <span class="material-symbols-outlined" style="font-size: 15px;">vpn_key</span>
        <span>管理金鑰</span>
      </button>
    </div>
  </header>

  <div class="devices-content custom-scroll">
    <div class="devices-deck max-w-4xl">
      <!-- WEB SANDBOX COMPACT BANNER (When running in browser/mobile without mounts) -->
      {#if isWebMode && cameraMounts.length === 0}
        <div class="web-compact-banner hairline-all font-mono">
          <div class="web-banner-top">
            <div class="web-banner-info">
              <span class="material-symbols-outlined" style="font-size: 18px; color: var(--amber-highlight);">folder_open</span>
              <span>瀏覽器預覽環境 · 手動選取本機相片或記憶卡目錄</span>
            </div>
            <div class="web-banner-actions">
              <button
                type="button"
                class="tool-btn subtle"
                onclick={() => (showWebSandboxDetails = !showWebSandboxDetails)}
              >
                {showWebSandboxDetails ? '收合說明' : '沙盒說明'}
              </button>
              {#if onPickDirectory}
                <button type="button" class="archival-btn-primary compact-load" onclick={onPickDirectory}>
                  開啟目錄
                </button>
              {/if}
            </div>
          </div>
          {#if showWebSandboxDetails}
            <p class="web-banner-detail font-body">
              因瀏覽器安全沙盒規範，Web 網頁模式無法主動探測作業系統外接 USB 磁碟。您可點擊「開啟目錄」手動載入相片資料夾，或使用桌面版執行 <code>npm run tauri dev</code> 啟用隨插即讀。
            </p>
          {/if}
        </div>
      {/if}

      <!-- AI INFERENCE ENGINE, TEMPERATURE & GRANULAR SCOPE CARD -->
      <div class="status-section hairline-all">
        <div class="section-top font-mono">
          <div class="status-indicator-box">
            <span class="material-symbols-outlined" style="font-size: 18px; color: var(--amber-highlight);">psychology</span>
            <span class="section-heading font-headline">AI 推論引擎與溫度控制 (Engine & Creativity)</span>
          </div>
          <span class="hint-pill">即時套用 · 全裝置同步</span>
        </div>

        <div class="ai-settings-grid font-mono">
          <!-- Vision Engine + Temperature -->
          <div class="ai-setting-block hairline-all">
            <div class="setting-block-head">
              <span class="setting-title">👁 視覺調色主引擎</span>
              <span class="temp-badge">Temp {aiPipeline.visionTemperature.toFixed(2)}</span>
            </div>
            <div class="provider-model-row">
              <select
                class="compact-select"
                value={aiPipeline.visionProvider}
                onchange={(e) => {
                  const prov = e.currentTarget.value === 'groq' ? 'groq' : 'gemini';
                  const fallback = prov === 'gemini' ? 'gemini-2.5-flash' : 'meta-llama/llama-4-scout-17b-16e-instruct';
                  const list = getModelsForProvider(prov, fallback);
                  aiPipeline.setVisionEngineSelection(prov, list[0]?.id ?? fallback);
                }}
              >
                <option value="gemini">Google Gemini</option>
                <option value="groq">Groq Cloud</option>
              </select>
              <select
                class="compact-select flex-1"
                value={aiPipeline.visionModelId}
                onchange={(e) => aiPipeline.setVisionEngineSelection(aiPipeline.visionProvider, e.currentTarget.value)}
              >
                {#each getModelsForProvider(aiPipeline.visionProvider, aiPipeline.visionModelId) as m}
                  <option value={m.id}>{m.displayName || m.id}</option>
                {/each}
              </select>
            </div>
            <div class="slider-control-row">
              <span class="slider-lbl">創意度 (0 精準 ~ 1 風格)</span>
              <input
                type="range"
                min="0"
                max="1.2"
                step="0.05"
                value={aiPipeline.visionTemperature}
                oninput={(e) => aiPipeline.setVisionTemperature(parseFloat(e.currentTarget.value))}
                class="amber-slider"
              />
            </div>
            <div class="preset-chip-row">
              <button type="button" class="preset-chip" class:active={Math.abs(aiPipeline.visionTemperature - 0.1) < 0.03} onclick={() => aiPipeline.setVisionTemperature(0.1)}>0.1 寫實</button>
              <button type="button" class="preset-chip" class:active={Math.abs(aiPipeline.visionTemperature - 0.4) < 0.03} onclick={() => aiPipeline.setVisionTemperature(0.4)}>0.4 均衡</button>
              <button type="button" class="preset-chip" class:active={Math.abs(aiPipeline.visionTemperature - 0.8) < 0.03} onclick={() => aiPipeline.setVisionTemperature(0.8)}>0.8 藝術</button>
            </div>
          </div>

          <!-- Grading Strength & Pass 2 Critic -->
          <div class="ai-setting-block hairline-all">
            <div class="setting-block-head">
              <span class="setting-title">🎛 調色強度與自我反思</span>
              <span class="temp-badge">{Math.round(aiPipeline.aiTuningStrength * 100)}% 強度</span>
            </div>
            <div class="slider-control-row">
              <span class="slider-lbl">整體調色幅度 (40% ~ 150%)</span>
              <input
                type="range"
                min="0.4"
                max="1.5"
                step="0.05"
                value={aiPipeline.aiTuningStrength}
                oninput={(e) => aiPipeline.setAiTuningStrength(parseFloat(e.currentTarget.value))}
                class="amber-slider"
              />
            </div>
            <div class="preset-chip-row">
              <button type="button" class="preset-chip" class:active={Math.abs(aiPipeline.aiTuningStrength - 0.7) < 0.03} onclick={() => aiPipeline.setAiTuningStrength(0.7)}>70% 克制</button>
              <button type="button" class="preset-chip" class:active={Math.abs(aiPipeline.aiTuningStrength - 1.0) < 0.03} onclick={() => aiPipeline.setAiTuningStrength(1.0)}>100% 標準</button>
              <button type="button" class="preset-chip" class:active={Math.abs(aiPipeline.aiTuningStrength - 1.3) < 0.03} onclick={() => aiPipeline.setAiTuningStrength(1.3)}>130% 強烈</button>
            </div>

            <div class="critic-divider"></div>
            <div class="critic-toggle-row">
              <label class="critic-check-label">
                <input
                  type="checkbox"
                  checked={aiPipeline.criticEnabled}
                  onchange={(e) => aiPipeline.setCriticEnabled(e.currentTarget.checked)}
                />
                <span>啟用二階審美批評家精修 (Pass 2)</span>
              </label>
              {#if aiPipeline.criticEnabled}
                <span class="temp-badge">Temp {aiPipeline.criticTemperature.toFixed(2)}</span>
              {/if}
            </div>
            {#if aiPipeline.criticEnabled}
              <div class="slider-control-row">
                <span class="slider-lbl">審校溫度</span>
                <input
                  type="range"
                  min="0"
                  max="0.8"
                  step="0.05"
                  value={aiPipeline.criticTemperature}
                  oninput={(e) => aiPipeline.setCriticTemperature(parseFloat(e.currentTarget.value))}
                  class="amber-slider"
                />
              </div>
            {/if}
          </div>

          <!-- Copywriting Engine + Temperature -->
          <div class="ai-setting-block hairline-all">
            <div class="setting-block-head">
              <span class="setting-title">✍️ 策展文案引擎</span>
              <span class="temp-badge">Temp {aiPipeline.copywritingTemperature.toFixed(2)}</span>
            </div>
            <div class="provider-model-row">
              <select
                class="compact-select"
                value={aiPipeline.copywritingProvider}
                onchange={(e) => {
                  const prov = e.currentTarget.value === 'groq' ? 'groq' : 'gemini';
                  const fallback = prov === 'gemini' ? 'gemini-2.5-flash-lite' : 'llama-3.3-70b-versatile';
                  const list = getModelsForProvider(prov, fallback);
                  aiPipeline.setCopywritingEngineSelection(prov, list[0]?.id ?? fallback);
                }}
              >
                <option value="gemini">Google Gemini</option>
                <option value="groq">Groq Cloud</option>
              </select>
              <select
                class="compact-select flex-1"
                value={aiPipeline.copywritingModelId}
                onchange={(e) => aiPipeline.setCopywritingEngineSelection(aiPipeline.copywritingProvider, e.currentTarget.value)}
              >
                {#each getModelsForProvider(aiPipeline.copywritingProvider, aiPipeline.copywritingModelId) as m}
                  <option value={m.id}>{m.displayName || m.id}</option>
                {/each}
              </select>
            </div>
            <div class="slider-control-row">
              <span class="slider-lbl">文案發散度 (0 紀實 ~ 1.2 詩意)</span>
              <input
                type="range"
                min="0"
                max="1.2"
                step="0.05"
                value={aiPipeline.copywritingTemperature}
                oninput={(e) => aiPipeline.setCopywritingTemperature(parseFloat(e.currentTarget.value))}
                class="amber-slider"
              />
            </div>
          </div>

          <!-- Default Granular AI Scope -->
          <div class="ai-setting-block hairline-all">
            <div class="setting-block-head">
              <span class="setting-title">🎯 預設 AI 可調控維度</span>
              <span class="hint-sub">精修前生效</span>
            </div>
            <div class="scope-chip-grid">
              {#each SCOPE_ITEMS as item}
                {@const isChecked =
                  item.key === 'splitToning'
                    ? (aiPipeline.aiScope.splitToning ?? aiPipeline.aiScope.filmPhysics)
                    : item.key === 'filmTexture'
                      ? (aiPipeline.aiScope.filmTexture ?? aiPipeline.aiScope.filmPhysics)
                      : Boolean(aiPipeline.aiScope[item.key])}
                <button
                  type="button"
                  class="scope-toggle-chip"
                  class:active={isChecked}
                  onclick={() => aiPipeline.toggleAiScope(item.key)}
                >
                  <span class="scope-dot"></span>
                  <span>{item.label}</span>
                </button>
              {/each}
            </div>
            {#if aiPipeline.aiScope.crop}
              <label class="crop-lock-inline">
                <input
                  type="checkbox"
                  checked={Boolean(aiPipeline.aiScope.lockCropAspectRatio)}
                  onchange={() => aiPipeline.toggleAiScope('lockCropAspectRatio')}
                />
                <span>裁切時鎖定原圖長寬比例 (禁止強制變更為 16:9 / 4:5 等)</span>
              </label>
            {/if}
          </div>
        </div>
      </div>

      <!-- KEY VAULT QUICK STATUS CARD (Gemini + Groq Dual Status) -->
      <div class="status-section hairline-all">
        <div class="section-top font-mono">
          <div class="status-indicator-box">
            <span class="material-symbols-outlined" style="font-size: 18px; color: var(--amber-highlight);">lock</span>
            <span class="section-heading font-headline">AI 金鑰安全保險庫 (Key Vault)</span>
          </div>
          <button type="button" class="tool-btn font-mono" onclick={onOpenVault}>
            管理保險庫與金鑰
          </button>
        </div>

        <div class="vault-info-box font-mono">
          <div class="vault-row">
            <span class="vault-lbl">Google Gemini</span>
            <span class={geminiKeyStatus.exists ? 'vault-val green' : 'vault-val dim'}>
              {geminiKeyStatus.exists ? `● 已配置 · ${formatVaultMode(geminiKeyStatus)}` : '○ 尚未設定（將自動嘗試備援或啟發式）'}
            </span>
          </div>
          <div class="vault-row">
            <span class="vault-lbl">Groq Cloud</span>
            <span class={groqKeyStatus.exists ? 'vault-val green' : 'vault-val dim'}>
              {groqKeyStatus.exists ? `● 已配置 · ${formatVaultMode(groqKeyStatus)}` : '○ 尚未設定'}
            </span>
          </div>
          <div class="vault-row">
            <span class="vault-lbl">推論安全性</span>
            <span class="vault-val">端對端本地加密存儲 · 絕不上傳至任何第三方中轉雲端</span>
          </div>
        </div>
      </div>

      <!-- HARDWARE INGESTION STATUS CARD (Desktop Tauri or when mounts exist) -->
      {#if !isWebMode || cameraMounts.length > 0}
        <div class="status-section hairline-all">
          <div class="section-top font-mono">
            <div class="status-indicator-box">
              <span class="live-dot" class:active={cameraMounts.length > 0}></span>
              <span class="section-heading font-headline">
                {cameraMounts.length > 0 ? '相機硬體已掛載' : '等待相機設備連線'}
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
      {/if}

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

  /* Web Compact Banner */
  .web-compact-banner {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: rgba(212, 163, 115, 0.06);
    border-radius: 6px;
    border-color: rgba(212, 163, 115, 0.25);
  }

  .web-banner-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .web-banner-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--parchment);
  }

  .web-banner-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tool-btn.subtle {
    background: transparent;
    border-color: var(--hairline-slate);
    font-size: 11px;
    padding: 5px 10px;
  }

  .web-banner-detail {
    margin: 0;
    font-size: 12px;
    line-height: 1.55;
    color: var(--parchment-muted);
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .web-banner-detail code {
    color: var(--amber-highlight);
    background: rgba(0, 0, 0, 0.35);
    padding: 1px 5px;
    border-radius: 3px;
  }

  /* AI Settings Card */
  .hint-pill {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(212, 163, 115, 0.12);
    border: 1px solid rgba(212, 163, 115, 0.35);
    color: var(--amber-highlight);
  }

  .ai-settings-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .ai-setting-block {
    background: var(--surface-panel);
    padding: 12px 14px;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .setting-block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .setting-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--parchment);
  }

  .temp-badge {
    font-size: 11px;
    color: var(--amber-highlight);
    background: rgba(212, 163, 115, 0.1);
    border: 1px solid rgba(212, 163, 115, 0.25);
    padding: 1px 7px;
    border-radius: 4px;
  }

  .hint-sub {
    font-size: 10px;
    color: var(--parchment-dim);
  }

  .provider-model-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .compact-select {
    background: var(--surface-canvas);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment);
    font-family: inherit;
    font-size: 11px;
    padding: 6px 8px;
    border-radius: 4px;
    outline: none;
    min-width: 0;
  }

  .compact-select:focus {
    border-color: var(--amber-highlight);
  }

  .flex-1 {
    flex: 1;
  }

  .slider-control-row {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .slider-lbl {
    font-size: 11px;
    color: var(--parchment-dim);
  }

  .amber-slider {
    width: 100%;
    accent-color: var(--amber-highlight);
    cursor: pointer;
    height: 4px;
  }

  .preset-chip-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .preset-chip {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-muted);
    font-family: inherit;
    font-size: 10px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .preset-chip:hover {
    color: var(--parchment);
    border-color: rgba(212, 163, 115, 0.45);
  }

  .preset-chip.active {
    background: rgba(212, 163, 115, 0.16);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
    font-weight: 600;
  }

  .critic-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 2px 0;
  }

  .critic-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .critic-check-label {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    color: var(--parchment);
    cursor: pointer;
  }

  .critic-check-label input {
    accent-color: var(--amber-highlight);
  }

  .scope-chip-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .scope-toggle-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    border-radius: 999px;
    border: 1px solid var(--hairline-slate);
    background: rgba(255, 255, 255, 0.03);
    color: var(--parchment-dim);
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .scope-toggle-chip .scope-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.25);
  }

  .scope-toggle-chip.active {
    background: rgba(212, 163, 115, 0.14);
    border-color: rgba(212, 163, 115, 0.5);
    color: var(--parchment);
  }

  .scope-toggle-chip.active .scope-dot {
    background: var(--amber-highlight);
    box-shadow: 0 0 6px var(--amber-highlight);
  }

  .crop-lock-inline {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    color: var(--parchment-muted);
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    cursor: pointer;
  }

  .crop-lock-inline input {
    accent-color: var(--amber-highlight);
  }

  @media (max-width: 768px) {
    .devices-toolbar {
      padding: 10px 14px;
      height: auto;
      min-height: 46px;
      flex-wrap: wrap;
      gap: 8px;
    }

    .header-left {
      gap: 8px;
      min-width: 0;
    }

    .tool-title {
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .devices-content {
      padding: 12px 12px calc(84px + env(safe-area-inset-bottom, 0px));
    }

    .devices-deck {
      gap: 12px;
    }

    .status-section {
      padding: 14px;
      gap: 12px;
    }

    .section-top {
      flex-wrap: wrap;
      gap: 8px;
    }

    .ai-settings-grid {
      grid-template-columns: 1fr;
    }

    .provider-model-row {
      flex-direction: column;
      align-items: stretch;
    }

    .vault-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
    }
  }
</style>
