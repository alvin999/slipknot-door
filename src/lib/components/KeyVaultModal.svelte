<script lang="ts">
  import { onMount } from 'svelte';
  import { KeyVaultService, type KeyEncryptionMode } from '$lib/services/keyVaultService';

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

  // Stored key status
  let vaultStatus = $state<{ exists: boolean; mode: KeyEncryptionMode | null; updatedAt: string | null }>({
    exists: false,
    mode: null,
    updatedAt: null
  });

  onMount(() => {
    refreshStatus();
  });

  function refreshStatus() {
    vaultStatus = KeyVaultService.getKeyStatus(selectedProvider);
    statusMessage = null;
  }

  $effect(() => {
    if (selectedProvider) {
      refreshStatus();
      apiKeyInput = '';
      masterPassword = '';
    }
  });

  async function handleSave() {
    if (!apiKeyInput.trim()) {
      statusMessage = { text: '請輸入有效的 API Key', type: 'error' };
      return;
    }

    try {
      await KeyVaultService.saveKey(
        selectedProvider,
        apiKeyInput.trim(),
        currentMode,
        masterPassword
      );
      refreshStatus();
      statusMessage = {
        text: `金鑰已成功儲存（${getModeLabel(currentMode)}）`,
        type: 'success'
      };
      apiKeyInput = '';
      masterPassword = '';
    } catch (err: any) {
      statusMessage = { text: err.message || '儲存失敗', type: 'error' };
    }
  }

  async function handleTestDecrypt() {
    try {
      const res = await KeyVaultService.loadKey(selectedProvider, masterPassword);
      if (res.requiresPassword) {
        statusMessage = { text: '此金鑰受密碼保護，請在下方輸入主密碼以解鎖', type: 'info' };
      } else if (res.apiKey) {
        const masked = res.apiKey.slice(0, 4) + '••••••••' + res.apiKey.slice(-4);
        statusMessage = { text: `解密成功！金鑰：${masked}（模式：${getModeLabel(res.mode!)}）`, type: 'success' };
      } else {
        statusMessage = { text: '本機尚未儲存此提供商之金鑰', type: 'info' };
      }
    } catch (err: any) {
      statusMessage = { text: err.message || '解密失敗', type: 'error' };
    }
  }

  function handleDelete() {
    KeyVaultService.deleteKey(selectedProvider);
    refreshStatus();
    statusMessage = { text: '金鑰已自本機保險庫徹底清除', type: 'info' };
    apiKeyInput = '';
    masterPassword = '';
  }

  function getModeLabel(m: KeyEncryptionMode): string {
    switch (m) {
      case 'plain': return '無加密（純文字）';
      case 'transparent': return '透明加密（設備指紋綁定 AES-GCM）';
      case 'password': return '密碼加密（主密碼 PBKDF2 保護）';
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
            onclick={() => selectedProvider = 'gemini'}
          >
            Google Gemini Flash Vision
          </button>
          <button 
            type="button" 
            class="prov-btn font-mono" 
            class:active={selectedProvider === 'groq'}
            onclick={() => selectedProvider = 'groq'}
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
              bind:value={apiKeyInput}
              class="vault-input font-mono"
            />
          </div>
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
          <button type="button" class="archival-btn-secondary" onclick={handleTestDecrypt}>
            <span class="material-symbols-outlined" style="font-size: 15px;">verified_user</span>
            驗證解密
          </button>
        {/if}
        <div class="spacer"></div>
        <button type="button" class="archival-btn-secondary" onclick={() => { isOpen = false; onClose?.(); }}>
          關閉
        </button>
        <button type="button" class="archival-btn-primary" onclick={handleSave}>
          <span class="material-symbols-outlined" style="font-size: 15px;">save</span>
          加密儲存
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
