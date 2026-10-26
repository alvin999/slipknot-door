<script lang="ts">
  import { onMount } from 'svelte';
  import { KeyVaultService, type KeyEncryptionMode } from '$lib/services/keyVaultService';
  import { ModelDiscoveryService, type DiscoveredModel } from '$lib/services/modelDiscoveryService';

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
  }

  let { isOpen = $bindable(false), onClose }: Props = $props();

  let selectedProvider = $state<'gemini' | 'groq'>('gemini');
  let currentMode = $state<KeyEncryptionMode>('transparent');
  let apiKeyInput = $state<string>('');
  let masterPassword = $state<string>('');
  let showKey = $state<boolean>(false);
  let statusMessage = $state<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Dynamic Model Discovery States
  let discoveredModels = $state<DiscoveredModel[]>([]);
  let selectedModelId = $state<string | null>(null);
  let isDiscoveringModels = $state<boolean>(false);
  let discoveryTimer: any = null;

  // Stored key status
  let vaultStatus = $state<{ exists: boolean; mode: KeyEncryptionMode | null; updatedAt: string | null }>({
    exists: false,
    mode: null,
    updatedAt: null
  });

  onMount(async () => {
    refreshStatus();
    loadStoredModelSelection();
    await autoLoadModelsForSavedKey();
  });

  function refreshStatus() {
    vaultStatus = KeyVaultService.getKeyStatus(selectedProvider);
  }

  function loadStoredModelSelection() {
    if (typeof localStorage !== 'undefined') {
      selectedModelId = localStorage.getItem(`slipknot_model_${selectedProvider}`) || null;
    } else {
      selectedModelId = null;
    }
  }

  /**
   * Switch provider tab cleanly without erasing user input accidentally
   */
  async function switchProvider(prov: 'gemini' | 'groq') {
    if (selectedProvider === prov) return;
    selectedProvider = prov;
    apiKeyInput = '';
    masterPassword = '';
    discoveredModels = [];
    statusMessage = null;
    refreshStatus();
    loadStoredModelSelection();
    await autoLoadModelsForSavedKey();
  }

  /**
   * Automatically query models if a key is already securely stored in vault
   */
  async function autoLoadModelsForSavedKey() {
    if (!vaultStatus.exists || vaultStatus.mode === 'password') return;
    try {
      const loaded = await KeyVaultService.loadKey(selectedProvider);
      if (loaded.apiKey) {
        await executeDiscovery(selectedProvider, loaded.apiKey, false);
      }
    } catch {
      // Background auto-load failure is silently handled
    }
  }

  /**
   * Handle user input in API Key field
   */
  function handleKeyInputChange(newVal: string) {
    apiKeyInput = newVal;

    // Auto-detect provider if key matches signature
    const detected = ModelDiscoveryService.detectProviderFromKey(newVal);
    if (detected && detected !== selectedProvider) {
      selectedProvider = detected;
      refreshStatus();
      loadStoredModelSelection();
    }

    // Debounced dynamic model discovery
    clearTimeout(discoveryTimer);
    if (newVal.trim().length > 10) {
      isDiscoveringModels = true;
      discoveryTimer = setTimeout(async () => {
        await executeDiscovery(selectedProvider, newVal.trim(), false);
      }, 600);
    } else {
      discoveredModels = [];
    }
  }

  /**
   * Core execution for model discovery & live endpoint validation
   */
  async function executeDiscovery(prov: 'gemini' | 'groq', key: string, isManualTest: boolean) {
    isDiscoveringModels = true;
    if (isManualTest) {
      statusMessage = { text: `正在連線 ${prov.toUpperCase()} 端點驗證金鑰與探測多模態視覺模型...`, type: 'info' };
    }

    try {
      const res = await ModelDiscoveryService.discoverModels(prov, key);

      if (res.error) {
        if (isManualTest) {
          statusMessage = { text: `連線失敗：${res.error}`, type: 'error' };
        }
        discoveredModels = [];
      } else {
        discoveredModels = res.models;
        if (res.models.length > 0) {
          if (!selectedModelId || !res.models.some(m => m.id === selectedModelId)) {
            selectedModelId = res.recommendedModelId;
          }
          if (isManualTest) {
            statusMessage = {
              text: `連線成功！已動態載入 ${res.models.length} 個視覺模型（建議首選：${res.recommendedModelId}）`,
              type: 'success'
            };
          }
        } else {
          if (isManualTest) {
            statusMessage = {
              text: `連線成功，但該金鑰未匹配到多模態視覺模型（如 ${prov === 'groq' ? 'llama-3.2-vision' : 'gemini-flash'}）`,
              type: 'error'
            };
          }
        }
      }
    } catch (err: any) {
      if (isManualTest) {
        statusMessage = { text: `連線異常：${err.message || '未知錯誤'}`, type: 'error' };
      }
    } finally {
      isDiscoveringModels = false;
    }
  }

  /**
   * Manual test connection button trigger
   */
  async function handleTestConnection() {
    let keyToTest = apiKeyInput.trim();

    // If input is empty, fallback to stored key in vault
    if (!keyToTest && vaultStatus.exists) {
      try {
        const loaded = await KeyVaultService.loadKey(selectedProvider, masterPassword);
        if (loaded.requiresPassword) {
          statusMessage = { text: '此金鑰受密碼保護，請在下方輸入主密碼後再點擊測試連線', type: 'info' };
          return;
        }
        if (loaded.apiKey) {
          keyToTest = loaded.apiKey;
        }
      } catch (err: any) {
        statusMessage = { text: `無法載入已存金鑰：${err.message}`, type: 'error' };
        return;
      }
    }

    if (!keyToTest) {
      statusMessage = { text: '請先輸入 API Key 後再點擊測試連線', type: 'error' };
      return;
    }

    await executeDiscovery(selectedProvider, keyToTest, true);
  }

  async function handleSave() {
    let keyToSave = apiKeyInput.trim();

    // If apiKeyInput is empty but already exists and user is just changing model selection
    if (!keyToSave && vaultStatus.exists) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('slipknot_active_provider', selectedProvider);
        if (selectedModelId) {
          localStorage.setItem(`slipknot_model_${selectedProvider}`, selectedModelId);
        }
      }
      statusMessage = {
        text: `設定已更新${selectedModelId ? ` · 已綁定模型：${selectedModelId}` : ''}`,
        type: 'success'
      };
      return;
    }

    if (!keyToSave) {
      statusMessage = { text: '請輸入有效的 API Key', type: 'error' };
      return;
    }

    try {
      await KeyVaultService.saveKey(
        selectedProvider,
        keyToSave,
        currentMode,
        masterPassword
      );
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('slipknot_active_provider', selectedProvider);
        if (selectedModelId) {
          localStorage.setItem(`slipknot_model_${selectedProvider}`, selectedModelId);
        }
      }
      refreshStatus();
      statusMessage = {
        text: `金鑰已成功安全儲存（${getModeLabel(currentMode)}）${selectedModelId ? ` · 已綁定模型：${selectedModelId}` : ''}`,
        type: 'success'
      };
      apiKeyInput = '';
      masterPassword = '';
    } catch (err: any) {
      statusMessage = { text: err.message || '儲存失敗', type: 'error' };
    }
  }

  function handleDelete() {
    KeyVaultService.deleteKey(selectedProvider);
    refreshStatus();
    discoveredModels = [];
    selectedModelId = null;
    statusMessage = { text: '金鑰已自本機保險庫徹底清除', type: 'info' };
    apiKeyInput = '';
    masterPassword = '';
  }

  function getModeLabel(m: KeyEncryptionMode): string {
    switch (m) {
      case 'plain': return '無加密（純文字）';
      case 'transparent': return '透明加密（本機安全綁定）';
      case 'password': return '密碼加密（主密碼 PBKDF2）';
    }
  }
</script>

{#if isOpen}
  <div class="modal-backdrop">
    <div class="modal-card hairline-all">
      <!-- Modal Header -->
      <div class="modal-header hairline-b">
        <div class="header-title-box">
          <span class="material-symbols-outlined vault-icon">lock</span>
          <div>
            <h2 class="modal-title font-headline">AI 金鑰安全保險庫 (Key Vault)</h2>
            <p class="modal-subtitle font-mono">端對端本機安全存儲 · 支援三層級防護架構</p>
          </div>
        </div>
        <button 
          type="button" 
          class="close-btn" 
          onclick={() => { isOpen = false; onClose?.(); }}
        >
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body">
        <!-- Model Provider Tabs -->
        <div class="provider-switch hairline-all">
          <button 
            type="button" 
            class="prov-btn font-mono" 
            class:active={selectedProvider === 'gemini'}
            onclick={() => switchProvider('gemini')}
          >
            Google Gemini Flash Vision
          </button>
          <button 
            type="button" 
            class="prov-btn font-mono" 
            class:active={selectedProvider === 'groq'}
            onclick={() => switchProvider('groq')}
          >
            Groq Llama-Vision
          </button>
        </div>

        <!-- Current Key Status Readout -->
        <div class="vault-status-box hairline-all">
          <div class="status-row">
            <span class="status-label font-mono">當前儲存狀態</span>
            {#if vaultStatus.exists}
              <span class="status-badge font-mono active">
                <span class="dot green"></span>
                已儲存 · {getModeLabel(vaultStatus.mode!)}
              </span>
            {:else}
              <span class="status-badge font-mono empty">
                <span class="dot gray"></span>
                尚未設定金鑰
              </span>
            {/if}
          </div>
          {#if vaultStatus.updatedAt}
            <div class="status-row mt-1">
              <span class="status-label font-mono">更新時間</span>
              <span class="status-time font-mono">{new Date(vaultStatus.updatedAt).toLocaleString('zh-TW')}</span>
            </div>
          {/if}
        </div>

        <!-- Encryption Tier Selector (User Request) -->
        <div class="section-block">
          <div class="section-label font-mono">選擇金鑰防護架構 (ENCRYPTION TIER)</div>
          <div class="tiers-container">
            <!-- Tier 1: Plain -->
            <label class="tier-card hairline-all" class:active={currentMode === 'plain'}>
              <input type="radio" name="enc_mode" value="plain" bind:group={currentMode} />
              <div class="tier-content">
                <div class="tier-title font-mono">1. 無加密 (Plain)</div>
                <div class="tier-desc font-body">明文儲存於本機安全區段，免除加解密負載，適合個人信任設備與本機開發測試。</div>
              </div>
            </label>

            <!-- Tier 2: Transparent -->
            <label class="tier-card hairline-all" class:active={currentMode === 'transparent'}>
              <input type="radio" name="enc_mode" value="transparent" bind:group={currentMode} />
              <div class="tier-content">
                <div class="tier-title font-mono">2. 透明加密 (Transparent · 建議)</div>
                <div class="tier-desc font-body">透過本機設備指紋動態派生 AES-256-GCM 金鑰，日常使用無須密碼，檔案被拷貝至外機則無法解讀。</div>
              </div>
            </label>

            <!-- Tier 3: Password Protected -->
            <label class="tier-card hairline-all" class:active={currentMode === 'password'}>
              <input type="radio" name="enc_mode" value="password" bind:group={currentMode} />
              <div class="tier-content">
                <div class="tier-title font-mono">3. 密碼加密 (Password-Protected)</div>
                <div class="tier-desc font-body">以主密碼經 PBKDF2（100,000 次雜湊）派生密鑰，極致防護。密碼不落盤，每次啟動需主密碼解鎖。</div>
              </div>
            </label>
          </div>
        </div>

        <!-- Key Input Field -->
        <div class="section-block">
          <div class="input-header font-mono">
            <span>API KEY 輸入</span>
            <button type="button" class="text-toggle font-mono" onclick={() => showKey = !showKey}>
              {showKey ? '隱藏' : '顯示'}
            </button>
          </div>
          <div class="input-wrap hairline-all">
            <span class="material-symbols-outlined input-icon">vpn_key</span>
            <input 
              type={showKey ? 'text' : 'password'} 
              placeholder={`請輸入 ${selectedProvider === 'gemini' ? 'AIza...' : 'gsk_...'} API Key`}
              value={apiKeyInput}
              oninput={(e) => handleKeyInputChange((e.target as HTMLInputElement).value)}
              class="vault-input font-mono"
            />
          </div>
        </div>

        <!-- Dynamic Vision Model Discovery (Non-hardcoded) -->
        <div class="section-block">
          <div class="section-label font-mono">
            <span>自動適配視覺模型 (DYNAMIC VISION DISCOVERY)</span>
            <div class="model-action-right">
              {#if isDiscoveringModels}
                <span class="detecting-label">
                  <span class="material-symbols-outlined spin" style="font-size: 12px;">sync</span>
                  動態探測中...
                </span>
              {:else}
                <button type="button" class="text-toggle font-mono" onclick={handleTestConnection} title="重新連線探測可用模型">
                  <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">refresh</span>
                  重新探測
                </button>
              {/if}
            </div>
          </div>

          {#if discoveredModels.length > 0}
            <div class="model-select-wrapper hairline-all">
              <select 
                class="model-dropdown font-mono" 
                bind:value={selectedModelId}
              >
                {#each discoveredModels as model}
                  <option value={model.id}>
                    {model.displayName || model.id} {model.recommendationTag ? `[${model.recommendationTag}]` : ''}
                  </option>
                {/each}
              </select>
            </div>

            <!-- Active Selected Model Card -->
            {#if selectedModelId}
              {@const currentModel = discoveredModels.find(m => m.id === selectedModelId)}
              {#if currentModel}
                <div class="selected-model-pill hairline-all">
                  <div class="pill-top">
                    <span class="pill-name font-mono">{currentModel.displayName}</span>
                    {#if currentModel.recommendationTag}
                      <span class="recommend-tag font-mono">⚡ {currentModel.recommendationTag}</span>
                    {/if}
                  </div>
                  {#if currentModel.description}
                    <div class="pill-desc font-body">{currentModel.description}</div>
                  {/if}
                </div>
              {/if}
            {/if}
          {:else if (apiKeyInput.length > 10 || vaultStatus.exists) && !isDiscoveringModels}
            <div class="model-hint-box hairline-all font-mono">
              <span class="material-symbols-outlined" style="font-size: 14px; color: var(--amber-highlight);">info</span>
              <span>可點擊「重新探測」或下方「測試連線」即時連線端點載入模型。</span>
            </div>
          {:else}
            <div class="model-hint-box hairline-all font-mono">
              <span class="material-symbols-outlined" style="font-size: 14px; color: var(--parchment-dim);">troubleshoot</span>
              <span>輸入 API Key 後將自動經由端點動態探測可用的多模態視覺模型（非寫死名稱）。</span>
            </div>
          {/if}
        </div>

        <!-- Master Password Input (If Password Mode or Decrypting) -->
        {#if currentMode === 'password' || vaultStatus.mode === 'password'}
          <div class="section-block">
            <div class="input-header font-mono">
              <span>主密碼 (MASTER PASSWORD)</span>
              <span class="pwd-hint">用於 PBKDF2 加密與解鎖</span>
            </div>
            <div class="input-wrap hairline-all">
              <span class="material-symbols-outlined input-icon">pin</span>
              <input 
                type="password" 
                placeholder="請輸入主密碼 (至少 4 字元)"
                bind:value={masterPassword}
                class="vault-input font-mono"
              />
            </div>
          </div>
        {/if}

        <!-- Status Message Banner -->
        {#if statusMessage}
          <div class="status-banner font-mono {statusMessage.type} hairline-all">
            <span class="material-symbols-outlined" style="font-size: 16px;">
              {statusMessage.type === 'success' ? 'check_circle' : statusMessage.type === 'error' ? 'error' : 'info'}
            </span>
            <span>{statusMessage.text}</span>
          </div>
        {/if}
      </div>

      <!-- Modal Footer Actions -->
      <div class="modal-footer hairline-t">
        {#if vaultStatus.exists}
          <button type="button" class="archival-btn-secondary danger" onclick={handleDelete}>
            <span class="material-symbols-outlined" style="font-size: 15px;">delete</span>
            清除金鑰
          </button>
        {/if}
        <button 
          type="button" 
          class="archival-btn-secondary" 
          onclick={handleTestConnection}
          disabled={isDiscoveringModels}
        >
          <span class="material-symbols-outlined" style="font-size: 15px;">
            {isDiscoveringModels ? 'sync' : 'network_check'}
          </span>
          {isDiscoveringModels ? '連線中...' : '測試連線'}
        </button>
        <div class="spacer"></div>
        <button type="button" class="archival-btn-secondary" onclick={() => { isOpen = false; onClose?.(); }}>
          關閉
        </button>
        <button type="button" class="archival-btn-primary" onclick={handleSave}>
          <span class="material-symbols-outlined" style="font-size: 15px;">save</span>
          儲存設定
        </button>
      </div>
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
    background-color: rgba(8, 9, 11, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-card {
    width: 580px;
    max-width: 90vw;
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8);
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
  .header-title-box {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .vault-icon {
    font-size: 24px;
    color: var(--amber-highlight);
  }
  .modal-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--parchment-bright);
    margin: 0;
  }
  .modal-subtitle {
    font-size: 10px;
    color: var(--parchment-dim);
    margin: 0;
  }
  .close-btn {
    background: transparent;
    border: none;
    color: var(--parchment-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
  }
  .close-btn:hover {
    color: var(--parchment-bright);
  }

  .modal-body {
    padding: 20px;
    overflow-y: auto;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .provider-switch {
    display: flex;
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 2px;
  }
  .prov-btn {
    flex: 1;
    background: transparent;
    border: none;
    padding: 8px 12px;
    font-size: 11px;
    color: var(--parchment-muted);
    cursor: pointer;
    border-radius: var(--radius-xs);
    transition: all 0.15s ease;
  }
  .prov-btn.active {
    background-color: var(--surface-overlay);
    color: var(--parchment-bright);
    border: 1px solid var(--hairline-slate);
    font-weight: 600;
  }

  .vault-status-box {
    background-color: var(--surface-elevated);
    padding: 10px 14px;
    border-radius: var(--radius-sm);
  }
  .status-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
  }
  .status-label {
    color: var(--parchment-dim);
  }
  .status-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
  }
  .status-badge.active {
    color: var(--primary-indigo);
  }
  .status-badge.empty {
    color: var(--parchment-dim);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .dot.green {
    background-color: var(--primary-indigo);
    box-shadow: 0 0 6px var(--primary-indigo);
  }
  .dot.gray {
    background-color: var(--parchment-dim);
  }
  .status-time {
    color: var(--parchment-muted);
    font-size: 10px;
  }
  .mt-1 {
    margin-top: 4px;
  }

  .section-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .section-label, .input-header {
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--parchment-dim);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .text-toggle {
    background: transparent;
    border: none;
    color: var(--primary-indigo);
    cursor: pointer;
    font-size: 10px;
  }
  .pwd-hint {
    color: var(--parchment-ghost);
    font-size: 9px;
  }

  .tiers-container {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tier-card {
    background-color: var(--surface-elevated);
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .tier-card:hover {
    background-color: var(--surface-overlay);
  }
  .tier-card.active {
    border-color: var(--amber-highlight);
    background-color: var(--surface-overlay);
  }
  .tier-card input[type="radio"] {
    margin-top: 3px;
    accent-color: var(--amber-highlight);
  }
  .tier-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tier-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--parchment-bright);
  }
  .tier-desc {
    font-size: 10px;
    color: var(--parchment-muted);
    line-height: 1.35;
  }

  .input-wrap {
    background-color: var(--canvas-base);
    border-radius: var(--radius-sm);
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .input-icon {
    font-size: 16px;
    color: var(--parchment-dim);
  }
  .vault-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    padding: 8px 0;
    color: var(--parchment-bright);
    font-size: 12px;
  }

  /* Dynamic Model Discovery Styling */
  .detecting-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--amber-highlight);
    font-size: 10px;
  }
  .spin {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .model-select-wrapper {
    background-color: var(--canvas-base);
    border-radius: var(--radius-sm);
    padding: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
  }
  .model-dropdown {
    width: 100%;
    appearance: none;
    -webkit-appearance: none;
    -moz-appearance: none;
    background-color: var(--canvas-base);
    border: none;
    color: var(--parchment-bright);
    font-size: 12px;
    padding: 8px 36px 8px 12px;
    outline: none;
    cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23d4a373' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    color-scheme: dark;
    transition: box-shadow 0.15s ease;
  }
  .model-dropdown:focus {
    box-shadow: inset 0 0 0 1px var(--amber-highlight);
  }
  .model-dropdown option {
    background-color: #18191d;
    color: #e8e4dc;
    padding: 8px;
  }

  .selected-model-pill {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pill-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .pill-name {
    font-size: 11px;
    color: var(--parchment-bright);
    font-weight: 600;
  }
  .recommend-tag {
    font-size: 9px;
    color: var(--amber-highlight);
    background-color: rgba(212, 163, 115, 0.15);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
  }
  .pill-desc {
    font-size: 10px;
    color: var(--parchment-dim);
    line-height: 1.35;
  }

  .model-hint-box {
    background-color: var(--canvas-base);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: var(--parchment-muted);
  }

  .status-banner {
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  }
  .status-banner.success {
    background-color: rgba(96, 130, 182, 0.15);
    border-color: var(--primary-indigo);
    color: var(--primary-indigo);
  }
  .status-banner.error {
    background-color: rgba(201, 74, 74, 0.15);
    border-color: var(--alert-red);
    color: #ff9999;
  }
  .status-banner.info {
    background-color: rgba(212, 163, 115, 0.15);
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
  }

  .modal-footer {
    padding: 14px 20px;
    background-color: var(--surface-elevated);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .danger {
    color: #ff9999;
  }
  .danger:hover {
    border-color: var(--alert-red);
  }
  .spacer {
    flex: 1;
  }
</style>
