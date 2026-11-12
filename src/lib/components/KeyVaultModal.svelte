<script lang="ts">
  import { onMount } from 'svelte';
  import { KeyVaultService, type KeyEncryptionMode } from '$lib/services/keyVaultService';
  import { ModelDiscoveryService, type DiscoveredModel } from '$lib/services/modelDiscoveryService';
  import { AiEngineFactory } from '$lib/services/ai/engineFactory';
  import { aiPipeline } from '$lib/stores/aiPipeline.svelte';
  import { toastStore } from '$lib/stores/toastStore.svelte';

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
  }

  let { isOpen = $bindable(false), onClose }: Props = $props();

  export interface ProviderMeta {
    id: 'gemini' | 'groq';
    name: string;
    tabLabel: string;
    keyPlaceholder: string;
    category: 'vision' | 'text';
    categoryLabel: string;
  }

  export const PROVIDER_REGISTRY: ProviderMeta[] = [
    {
      id: 'gemini',
      name: 'Google Gemini',
      tabLabel: 'Google Gemini (多模態視覺)',
      keyPlaceholder: 'AIza...',
      category: 'vision',
      categoryLabel: '自動適配視覺模型 (DYNAMIC VISION DISCOVERY)'
    },
    {
      id: 'groq',
      name: 'Groq',
      tabLabel: 'Groq (極速社群文案與標籤)',
      keyPlaceholder: 'gsk_...',
      category: 'text',
      categoryLabel: '自動適配文字模型 (DYNAMIC TEXT MODELS)'
    }
  ];

  function getProviderMeta(id: 'gemini' | 'groq' | null | undefined): ProviderMeta {
    return PROVIDER_REGISTRY.find(p => p.id === id) || PROVIDER_REGISTRY[0];
  }

  function getProviderName(id: 'gemini' | 'groq' | null | undefined): string {
    return getProviderMeta(id).name;
  }

  let selectedProvider = $state<'gemini' | 'groq'>('gemini');
  let currentProviderMeta = $derived(getProviderMeta(selectedProvider));
  let currentMode = $state<KeyEncryptionMode>('transparent');
  let apiKeyInput = $state<string>('');
  let masterPassword = $state<string>('');
  let showKey = $state<boolean>(false);
  let statusMessage = $state<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  let isSaving = $state<boolean>(false);

  // Dynamic Model Discovery States
  let discoveredModels = $state<DiscoveredModel[]>([]);
  let selectedModelId = $state<string | null>(null);
  let isDiscoveringModels = $state<boolean>(false);
  let discoveryTimer: any = null;
  let showUnsavedPrompt = $state<boolean>(false);
  let unsavedActionType = $state<'close' | 'switch'>('close');
  let pendingProviderTarget = $state<'gemini' | 'groq' | null>(null);

  // 當前選取 Provider 之完整模型清單（100% 端點動態探測與本機快取，零 Hardcode）
  let currentModelList = $derived(
    discoveredModels.length > 0
      ? discoveredModels
      : ModelDiscoveryService.getCachedModels(selectedProvider)
  );

  function getDynamicModelsForProvider(prov: string): DiscoveredModel[] {
    const p = (prov === 'groq' ? 'groq' : 'gemini') as 'gemini' | 'groq';
    if (selectedProvider === p && discoveredModels.length > 0) {
      return discoveredModels;
    }
    return ModelDiscoveryService.getCachedModels(p);
  }

  // 任務職責指派狀態 (Task Roles: 只需指定負責服務，模型採用該服務已選定之模型)
  let roleVisionProvider = $state<string>('gemini');
  let roleVisionTemp = $state<number>(0.4);
  let roleTuningStrength = $state<number>(1.0);
  let roleCopywritingProvider = $state<string>('groq');
  let roleCopywritingTemp = $state<number>(0.7);
  let roleCriticEnabled = $state<boolean>(false);
  let roleCriticUseCustom = $state<boolean>(false);
  let roleCriticProvider = $state<string>('gemini');
  let roleCriticModelId = $state<string>('');
  let roleCriticTemp = $state<number>(0.2);

  // 各家金鑰即時就緒狀態（供分頁燈號與儲存邏輯判定）
  let providerReadyMap = $state<{ gemini: boolean; groq: boolean }>({
    gemini: false,
    groq: false,
  });

  const ENCRYPTION_TIER_META: {
    id: KeyEncryptionMode;
    shortLabel: string;
    badge?: string;
    desc: string;
  }[] = [
    {
      id: 'plain',
      shortLabel: '1. 無加密',
      desc: '明文儲存於本機安全區段，免除加解密負載，適合個人信任設備與測試。',
    },
    {
      id: 'transparent',
      shortLabel: '2. 透明加密',
      badge: '建議',
      desc: '透過本機設備指紋動態派生 AES-256-GCM 金鑰，無須密碼且跨機無法解讀。',
    },
    {
      id: 'password',
      shortLabel: '3. 主密碼保護',
      desc: '以主密碼經 PBKDF2（100,000 次雜湊）派生密鑰，密碼不落盤，每次啟動需解鎖。',
    },
  ];
  let activeTierDesc = $derived(
    ENCRYPTION_TIER_META.find((t) => t.id === currentMode)?.desc || ''
  );

  function onCriticProviderChange(newProv: string) {
    roleCriticProvider = newProv;
    const models = getDynamicModelsForProvider(newProv);
    roleCriticModelId = models[0]?.id || getAssignedModelDisplay(newProv);
  }

  /**
   * 取得指定 Provider 當前已選取或預設推薦之模型名稱
   */
  function getAssignedModelDisplay(prov: string): string {
    const p = prov as 'gemini' | 'groq';
    let modelId = '';
    if (selectedProvider === p && selectedModelId) {
      modelId = selectedModelId;
    } else if (typeof localStorage !== 'undefined') {
      modelId = localStorage.getItem(`slipknot_model_${p}`) || '';
    }
    if (!modelId) {
      const cached = ModelDiscoveryService.getCachedModels(p);
      modelId = cached[0]?.id || (p === 'gemini' ? 'gemini-flash-lite-latest' : 'llama-3.3-70b-versatile');
    }
    return modelId;
  }

  // Stored key status
  let vaultStatus = $state<{ exists: boolean; mode: KeyEncryptionMode | null; updatedAt: string | null }>({
    exists: false,
    mode: null,
    updatedAt: null
  });

  onMount(async () => {
    refreshStatus();
    loadStoredModelSelection();
    loadTaskRoles();
    await autoLoadModelsForSavedKey();
  });

  function refreshStatus() {
    vaultStatus = KeyVaultService.getKeyStatus(selectedProvider);
    providerReadyMap = {
      gemini: KeyVaultService.getKeyStatus('gemini').exists,
      groq: KeyVaultService.getKeyStatus('groq').exists,
    };
  }

  function loadTaskRoles() {
    const roles = AiEngineFactory.getTaskRoles();
    roleVisionProvider = roles.vision.provider || 'gemini';
    roleVisionTemp = roles.vision.temperature ?? 0.4;
    roleTuningStrength = roles.tuningStrength ?? 1.0;
    roleCopywritingProvider = roles.copywriting.provider || 'groq';
    roleCopywritingTemp = roles.copywriting.temperature ?? 0.7;
    roleCriticEnabled = roles.critic?.enabled ?? false;
    roleCriticUseCustom = roles.critic?.useCustomModel ?? false;
    roleCriticProvider = roles.critic?.provider || 'gemini';
    roleCriticModelId = roles.critic?.modelId || '';
    roleCriticTemp = roles.critic?.temperature ?? 0.2;
    if (!roleCriticModelId) {
      const models = getDynamicModelsForProvider(roleCriticProvider);
      roleCriticModelId = models[0]?.id || getAssignedModelDisplay(roleCriticProvider);
    }
  }

  function loadStoredModelSelection() {
    if (typeof localStorage !== 'undefined') {
      selectedModelId = localStorage.getItem(`slipknot_model_${selectedProvider}`) || '';
    } else {
      selectedModelId = '';
    }
  }

  /**
   * Intercept provider tab switching if there is an unsaved API Key
   */
  async function handleTabClick(prov: 'gemini' | 'groq') {
    if (selectedProvider === prov) return;
    if (apiKeyInput.trim().length > 0) {
      pendingProviderTarget = prov;
      unsavedActionType = 'switch';
      showUnsavedPrompt = true;
      return;
    }
    await switchProvider(prov);
  }

  /**
   * Switch provider tab cleanly
   */
  async function switchProvider(prov: 'gemini' | 'groq') {
    selectedProvider = prov;
    apiKeyInput = '';
    masterPassword = '';
    discoveredModels = [];
    statusMessage = null;
    showUnsavedPrompt = false;
    pendingProviderTarget = null;
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
    const meta = getProviderMeta(prov);
    if (isManualTest) {
      statusMessage = { text: `正在連線 ${meta.name} 端點驗證金鑰與探測可用模型...`, type: 'info' };
      toastStore.show(`正在連線 ${meta.name} 驗證金鑰...`, 'info', 2000);
    }

    try {
      const res = await ModelDiscoveryService.discoverModels(prov, key);

      if (res.error) {
        if (isManualTest) {
          statusMessage = { text: `端點連線失敗：${res.error}`, type: 'error' };
          toastStore.show(`端點連線失敗：${res.error}`, 'error', 4500);
        }
        discoveredModels = [];
      } else {
        discoveredModels = res.models;
        if (res.models.length > 0) {
          if (!selectedModelId || !res.models.some(m => m.id === selectedModelId)) {
            selectedModelId = res.recommendedModelId;
          }
        }

        // 若為手動點擊「測試連線」，進一步執行端對端真實推論診斷（Session 診斷）
        if (isManualTest) {
          let targetModel = selectedModelId || res.recommendedModelId || (res.models[0]?.id ?? '');
          let cleanTarget = targetModel.replace(/^models\//, '');
          statusMessage = { text: `正在使用當前 Session 對 [${cleanTarget}] 進行推論回應測試...`, type: 'info' };
          const t0 = Date.now();
          if (prov === 'gemini') {
            let testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cleanTarget}:generateContent?key=${key}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: 'Ping: Reply OK' }] }] })
            });
            const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
            if (!testRes.ok) {
              const errJson = await testRes.json().catch(() => null);
              const detail = errJson?.error?.message || `HTTP ${testRes.status}`;
              statusMessage = { text: `❌ Gemini 端點推論失敗 (${detail})`, type: 'error' };
              toastStore.show(`Gemini 端點推論失敗：${detail}`, 'error', 4500);
            } else {
              statusMessage = { text: `🎉 Gemini 視覺引擎測試成功！(端點耗時: ${elapsed}s · 模型: ${cleanTarget})`, type: 'success' };
              toastStore.show(`Gemini 測試成功！(${elapsed}s · ${cleanTarget})`, 'success', 3500);
            }
          } else {
            const testRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
              body: JSON.stringify({
                model: targetModel,
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 5
              })
            });
            const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
            if (!testRes.ok) {
              const errJson = await testRes.json().catch(() => null);
              const detail = errJson?.error?.message || `HTTP ${testRes.status}`;
              statusMessage = { text: `❌ Groq 文案端點失敗 (${detail})`, type: 'error' };
              toastStore.show(`Groq 文案端點失敗：${detail}`, 'error', 4500);
            } else {
              statusMessage = { text: `🎉 Groq 極速文案測試成功！(極速回應: ${elapsed}s · 模型: ${targetModel})`, type: 'success' };
              toastStore.show(`Groq 測試成功！(${elapsed}s · ${targetModel})`, 'success', 3500);
            }
          }
        }
      }
    } catch (err: any) {
      if (isManualTest) {
        statusMessage = { text: `連線異常：${err.message || '未知錯誤'}`, type: 'error' };
        toastStore.show(`連線異常：${err.message || '未知錯誤'}`, 'error', 4500);
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
          toastStore.show('此金鑰受密碼保護，請輸入主密碼後再測試', 'warning', 3500);
          return;
        }
        if (loaded.apiKey) {
          keyToTest = loaded.apiKey;
        }
      } catch (err: any) {
        statusMessage = { text: `無法載入已存金鑰：${err.message}`, type: 'error' };
        toastStore.show(`無法載入金鑰：${err.message}`, 'error', 4000);
        return;
      }
    }

    if (!keyToTest) {
      statusMessage = { text: '請先輸入 API Key 後再點擊測試連線', type: 'error' };
      toastStore.show('請先輸入 API Key 後再點擊測試連線', 'warning', 3500);
      return;
    }

    await executeDiscovery(selectedProvider, keyToTest, true);
  }

  async function handleSave(autoClose: boolean = true) {
    if (isSaving) return false;
    isSaving = true;
    let keyToSave = apiKeyInput.trim();

    // 持久化儲存任務職責指派 (Task Roles) 與溫度/強度參數
    AiEngineFactory.setTaskRoles({
      vision: {
        provider: roleVisionProvider,
        modelId: getAssignedModelDisplay(roleVisionProvider),
        temperature: roleVisionTemp,
      },
      copywriting: {
        provider: roleCopywritingProvider,
        modelId: getAssignedModelDisplay(roleCopywritingProvider),
        temperature: roleCopywritingTemp,
      },
      critic: {
        enabled: roleCriticEnabled,
        useCustomModel: roleCriticUseCustom,
        provider: roleCriticProvider,
        modelId: roleCriticUseCustom
          ? (roleCriticModelId || getAssignedModelDisplay(roleCriticProvider))
          : getAssignedModelDisplay(roleVisionProvider),
        temperature: roleCriticTemp,
      },
      tuningStrength: roleTuningStrength,
    });
    aiPipeline.reloadEngineSettings();

    // If apiKeyInput is empty and at least one key exists, save model/role/temp changes cleanly
    if (!keyToSave && (vaultStatus.exists || providerReadyMap.gemini || providerReadyMap.groq)) {
      if (typeof localStorage !== 'undefined') {
        if (vaultStatus.exists) {
          localStorage.setItem('slipknot_active_provider', selectedProvider);
        }
        if (selectedModelId) {
          localStorage.setItem(`slipknot_model_${selectedProvider}`, selectedModelId);
        }
      }
      toastStore.show('AI 任務職責、模型與溫度設定已更新', 'success');
      isSaving = false;
      if (autoClose) {
        forceClose();
      }
      return true;
    }

    if (!keyToSave) {
      statusMessage = { text: '請輸入有效的 API Key', type: 'error' };
      isSaving = false;
      return false;
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
      aiPipeline.reloadEngineSettings();
      toastStore.show(`金鑰已成功安全儲存（${getModeLabel(currentMode)}）· 任務模型已生效`, 'success');
      apiKeyInput = '';
      masterPassword = '';
      if (autoClose) {
        forceClose();
      }
      return true;
    } catch (err: any) {
      statusMessage = { text: err.message || '儲存失敗', type: 'error' };
      return false;
    } finally {
      isSaving = false;
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

  function requestClose() {
    if (apiKeyInput.trim().length > 0) {
      unsavedActionType = 'close';
      showUnsavedPrompt = true;
      return;
    }
    forceClose();
  }

  function forceClose() {
    showUnsavedPrompt = false;
    apiKeyInput = '';
    masterPassword = '';
    pendingProviderTarget = null;
    isOpen = false;
    onClose?.();
  }

  async function handleDiscardAndProceed() {
    if (unsavedActionType === 'switch' && pendingProviderTarget) {
      await switchProvider(pendingProviderTarget);
    } else {
      forceClose();
    }
  }

  async function handleSaveAndProceed() {
    const isSwitch = unsavedActionType === 'switch' && pendingProviderTarget;
    const ok = await handleSave(!isSwitch);
    if (ok && isSwitch && pendingProviderTarget) {
      await switchProvider(pendingProviderTarget);
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
          onclick={requestClose}
          title="關閉保險庫"
        >
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body">
        <!-- Model Provider Tabs (Data-driven / Extensible) -->
        <div class="provider-switch hairline-all">
          {#each PROVIDER_REGISTRY as prov}
            <button 
              type="button" 
              class="prov-btn font-mono" 
              class:active={selectedProvider === prov.id}
              onclick={() => handleTabClick(prov.id)}
            >
              <span class="dot" class:green={providerReadyMap[prov.id]} class:gray={!providerReadyMap[prov.id]}></span>
              <span>{prov.tabLabel}</span>
            </button>
          {/each}
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

        <!-- Encryption Tier Selector (Compact Segmented Control) -->
        <div class="section-block">
          <div class="section-label font-mono">
            <span>金鑰防護架構 (ENCRYPTION TIER)</span>
          </div>
          <div class="tier-segmented hairline-all">
            {#each ENCRYPTION_TIER_META as tier}
              <button
                type="button"
                class="tier-seg-btn font-mono"
                class:active={currentMode === tier.id}
                onclick={() => (currentMode = tier.id)}
              >
                <span>{tier.shortLabel}</span>
                {#if tier.badge}
                  <span class="tier-rec-badge">{tier.badge}</span>
                {/if}
              </button>
            {/each}
          </div>
          <p class="tier-inline-desc font-body">{activeTierDesc}</p>
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
              placeholder={`請輸入 ${currentProviderMeta.name} (${currentProviderMeta.keyPlaceholder}) API Key`}
              value={apiKeyInput}
              oninput={(e) => handleKeyInputChange((e.target as HTMLInputElement).value)}
              class="vault-input font-mono"
            />
          </div>
        </div>

        <!-- Dynamic Model Configuration (下拉選單，照原本列出，免除手打) -->
        <div class="section-block">
          <div class="section-label font-mono">
            <span>{currentProviderMeta.categoryLabel}</span>
            <div class="model-action-right">
              {#if isDiscoveringModels}
                <span class="detecting-label">
                  <span class="material-symbols-outlined spin" style="font-size: 12px;">sync</span>
                  動態探測中...
                </span>
              {:else}
                <button type="button" class="text-toggle font-mono" onclick={handleTestConnection} title="向 API 查詢最新相容模型">
                  <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">refresh</span>
                  即時探測模型
                </button>
              {/if}
            </div>
          </div>

          <div class="model-select-wrapper hairline-all">
            <select 
              class="model-dropdown font-mono" 
              bind:value={selectedModelId}
            >
              {#each currentModelList as m}
                <option value={m.id}>
                  {m.displayName || m.id} {m.recommendationTag ? `[${m.recommendationTag}]` : ''}
                </option>
              {/each}
            </select>
          </div>

          <!-- Active Selected Model Card -->
          {#if selectedModelId}
            {@const currentModel = currentModelList.find(m => m.id === selectedModelId)}
            {#if currentModel}
              <div class="selected-model-pill hairline-all">
                <div class="pill-top">
                  <span class="pill-name font-mono">{currentModel.displayName || currentModel.id}</span>
                  {#if currentModel.recommendationTag}
                    <span class="recommend-tag font-mono">⚡ {currentModel.recommendationTag}</span>
                  {/if}
                </div>
                {#if (currentModel as any).description}
                  <div class="pill-desc font-body">{(currentModel as any).description}</div>
                {/if}
              </div>
            {/if}
          {/if}
        </div>

        <!-- Role Assignment (AI 任務職責指派 - 僅選服務，模型由上方直接套用) -->
        <div class="section-block role-assign-block hairline-all">
          <div class="role-header font-mono">
            <span class="material-symbols-outlined role-header-icon">tune</span>
            <span class="role-header-title">AI 任務職責指派 (ROLE ASSIGNMENT)</span>
          </div>
          <p class="role-desc font-body">
            分別指派負責「相片視覺顯影」與「社群文字文案」的引擎服務，模型自動採用上方該服務已選定之模型。
          </p>

          <div class="roles-grid">
            <!-- 任務 1: 影像視覺顯影 -->
            <div class="role-card hairline-all">
              <div class="role-card-top font-mono">
                <span class="material-symbols-outlined" style="font-size: 14px; color: var(--amber-highlight);">camera</span>
                <span>影像視覺顯影 (Vision)</span>
              </div>
              <div class="role-fields">
                <select class="role-select font-mono" bind:value={roleVisionProvider}>
                  <option value="gemini">Google Gemini</option>
                  <option value="groq">Groq Vision</option>
                </select>
                <div class="role-model-badge font-mono" title="已於上方選取之模型">
                  <span class="material-symbols-outlined" style="font-size: 12px; color: var(--amber-highlight);">verified</span>
                  <span class="badge-text">{getAssignedModelDisplay(roleVisionProvider)}</span>
                </div>
              </div>
              <div class="role-params-grid">
                <div class="param-slider-item">
                  <div class="param-head font-mono">
                    <span>創意溫度 (Temp)</span>
                    <span class="param-val">{roleVisionTemp.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="1.2" step="0.05" bind:value={roleVisionTemp} class="param-range" />
                </div>
                <div class="param-slider-item">
                  <div class="param-head font-mono">
                    <span>調色干預強度</span>
                    <span class="param-val">{Math.round(roleTuningStrength * 100)}%</span>
                  </div>
                  <input type="range" min="0.5" max="1.5" step="0.05" bind:value={roleTuningStrength} class="param-range" />
                </div>
              </div>
            </div>

            <!-- 任務 2: 文字社群文案 -->
            <div class="role-card hairline-all">
              <div class="role-card-top font-mono">
                <span class="material-symbols-outlined" style="font-size: 14px; color: var(--amber-highlight);">edit_note</span>
                <span>社群文案與 IPTC (Text)</span>
              </div>
              <div class="role-fields">
                <select class="role-select font-mono" bind:value={roleCopywritingProvider}>
                  <option value="groq">Groq (極速推薦)</option>
                  <option value="gemini">Google Gemini</option>
                </select>
                <div class="role-model-badge font-mono" title="已於上方選取之模型">
                  <span class="material-symbols-outlined" style="font-size: 12px; color: var(--amber-highlight);">verified</span>
                  <span class="badge-text">{getAssignedModelDisplay(roleCopywritingProvider)}</span>
                </div>
              </div>
              <div class="param-slider-item" style="margin-top: 2px;">
                <div class="param-head font-mono">
                  <span>文案創意溫度 (Temp · 建議 0.6~0.9)</span>
                  <span class="param-val">{roleCopywritingTemp.toFixed(2)}</span>
                </div>
                <input type="range" min="0" max="1.2" step="0.05" bind:value={roleCopywritingTemp} class="param-range" />
              </div>
            </div>

            <!-- 任務 3: 雙圖閉環覆審 (Critic) -->
            <div class="role-card hairline-all" style="grid-column: 1 / -1; margin-top: 4px;">
              <div class="role-card-top font-mono" style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="material-symbols-outlined" style="font-size: 14px; color: var(--amber-highlight);">fact_check</span>
                  <span>雙圖閉環覆審 (Pass 2 Two-Pass Refinement)</span>
                </div>
                <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px;">
                  <input type="checkbox" bind:checked={roleCriticEnabled} style="accent-color: var(--amber-highlight); cursor: pointer;" />
                  <span>啟用雙圖閉環覆審</span>
                </label>
              </div>

              {#if roleCriticEnabled}
                <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 10px;">
                  <div style="display: flex; gap: 16px; align-items: center; font-size: 11px;">
                    <label style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                      <input type="radio" name="critic_mode" value={false} bind:group={roleCriticUseCustom} style="accent-color: var(--amber-highlight);" />
                      <span>同起草模型 (推薦 Flash-Lite 極速無感)</span>
                    </label>
                    <label style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                      <input type="radio" name="critic_mode" value={true} bind:group={roleCriticUseCustom} style="accent-color: var(--amber-highlight);" />
                      <span>自訂專用覆審模型 (異質品控 Cross-check)</span>
                    </label>
                  </div>

                  {#if roleCriticUseCustom}
                    {@const criticModels = getDynamicModelsForProvider(roleCriticProvider)}
                    <div class="role-fields" style="display: flex; gap: 8px;">
                      <select 
                        class="role-select font-mono" 
                        style="width: 140px; flex-shrink: 0;"
                        value={roleCriticProvider}
                        onchange={(e) => onCriticProviderChange((e.target as HTMLSelectElement).value)}
                      >
                        <option value="gemini">Google Gemini</option>
                        <option value="groq">Groq Vision</option>
                      </select>

                      <select 
                        class="role-select font-mono" 
                        style="flex: 1;"
                        bind:value={roleCriticModelId}
                      >
                        {#each criticModels as m}
                          <option value={m.id}>
                            {m.displayName || m.id} {m.recommendationTag ? `[${m.recommendationTag}]` : ''}
                          </option>
                        {/each}
                        {#if !criticModels.some(m => m.id === roleCriticModelId) && roleCriticModelId}
                          <option value={roleCriticModelId}>
                            {roleCriticModelId}
                          </option>
                        {/if}
                      </select>
                    </div>
                  {:else}
                    <div class="role-model-badge font-mono" style="align-self: flex-start;">
                      <span class="material-symbols-outlined" style="font-size: 12px; color: var(--amber-highlight);">sync</span>
                      <span class="badge-text">自動沿用影像視覺模型：{getAssignedModelDisplay(roleVisionProvider)}</span>
                    </div>
                  {/if}
                  <div class="param-slider-item">
                    <div class="param-head font-mono">
                      <span>覆審品控溫度 (Critic Temp · 建議 0.1~0.3)</span>
                      <span class="param-val">{roleCriticTemp.toFixed(2)}</span>
                    </div>
                    <input type="range" min="0" max="0.8" step="0.05" bind:value={roleCriticTemp} class="param-range" />
                  </div>
                  <p style="font-size: 11px; color: var(--text-muted); margin: 0; line-height: 1.4;">
                    說明：第一階段起草完成後，本地 WebGL 著色器即時渲染出成品，與原圖一同回傳 AI 比對，專門修正 Shadow Lift 浮灰死黑與色溫偏差。
                  </p>
                </div>
              {/if}
            </div>
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
        <button type="button" class="archival-btn-secondary" onclick={requestClose}>
          關閉
        </button>
        <button type="button" class="archival-btn-primary" onclick={() => handleSave(true)} disabled={isSaving}>
          <span class="material-symbols-outlined" style="font-size: 15px;">{isSaving ? 'sync' : 'save'}</span>
          {isSaving ? '儲存中...' : '儲存設定'}
        </button>
      </div>

      <!-- Unsaved Changes Prompt Dialog -->
      {#if showUnsavedPrompt}
        <div class="unsaved-modal-overlay">
          <div class="unsaved-modal-box hairline-all">
            <div class="unsaved-header font-mono">
              <span class="material-symbols-outlined unsaved-warn-icon">warning</span>
              <span>
                {unsavedActionType === 'switch' ? '切換標籤前有未儲存的金鑰' : '未儲存的金鑰變更'}
              </span>
            </div>
            <p class="unsaved-text font-body">
              {#if unsavedActionType === 'switch'}
                您目前在 <strong>{getProviderName(selectedProvider)}</strong> 標籤已輸入 API Key 但尚未儲存。若直接切換至 <strong>{getProviderName(pendingProviderTarget)}</strong>，剛才輸入的金鑰將會遺失。
              {:else}
                您已在輸入框鍵入 API Key，尚未點擊「儲存設定」。若直接關閉畫面，剛才輸入的內容將會遺失。
              {/if}
            </p>
            <div class="unsaved-actions">
              <button 
                type="button" 
                class="archival-btn-secondary" 
                onclick={() => { showUnsavedPrompt = false; pendingProviderTarget = null; }}
              >
                繼續編輯
              </button>
              <button 
                type="button" 
                class="archival-btn-secondary danger" 
                onclick={handleDiscardAndProceed}
              >
                {unsavedActionType === 'switch' ? '放棄並切換' : '放棄離開'}
              </button>
              <button 
                type="button" 
                class="archival-btn-primary" 
                onclick={handleSaveAndProceed}
              >
                <span class="material-symbols-outlined" style="font-size: 14px;">save</span>
                {unsavedActionType === 'switch' ? '儲存並切換' : '儲存並關閉'}
              </button>
            </div>
          </div>
        </div>
      {/if}
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
    position: relative;
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
    padding: 8px 10px;
    font-size: 11px;
    color: var(--parchment-muted);
    cursor: pointer;
    border-radius: var(--radius-xs);
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
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

  .tier-segmented {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 3px;
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
  }
  .tier-seg-btn {
    background: transparent;
    border: 1px solid transparent;
    color: var(--parchment-muted);
    padding: 7px 6px;
    border-radius: var(--radius-xs);
    font-size: 11px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: all 0.15s ease;
  }
  .tier-seg-btn:hover {
    color: var(--parchment-bright);
    background: rgba(255, 255, 255, 0.04);
  }
  .tier-seg-btn.active {
    background-color: var(--surface-overlay);
    border-color: var(--amber-highlight);
    color: var(--parchment-bright);
    font-weight: 600;
  }
  .tier-rec-badge {
    font-size: 9px;
    padding: 0 4px;
    border-radius: 3px;
    background: rgba(212, 163, 115, 0.18);
    color: var(--amber-highlight);
  }
  .tier-inline-desc {
    margin: 0;
    font-size: 11px;
    color: var(--parchment-muted);
    line-height: 1.4;
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

  .model-hint-row {
    margin-top: 4px;
    font-size: 10px;
    display: flex;
    justify-content: space-between;
  }
  .hint-count { color: #52b788; }
  .hint-muted { color: var(--parchment-dim); }

  .role-assign-block {
    background: rgba(24, 25, 29, 0.4);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    margin-top: 6px;
  }
  .role-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--amber-highlight);
    font-weight: 600;
  }
  .role-header-icon {
    font-size: 15px;
  }
  .role-desc {
    font-size: 11px;
    color: var(--parchment-dim);
    margin: 4px 0 8px 0;
    line-height: 1.4;
  }
  .roles-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
  }
  .role-card {
    background: var(--canvas-base);
    border-radius: var(--radius-xs);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
  }
  .role-card-top {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--parchment-bright);
    font-weight: 600;
  }
  .role-fields {
    display: grid;
    grid-template-columns: 130px 1fr;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
  }
  .role-select {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    background: var(--surface-elevated);
    border: 1px solid var(--hairline-color);
    color: var(--parchment-bright);
    font-size: 11px;
    padding: 6px 8px;
    border-radius: var(--radius-xs);
    outline: none;
    cursor: pointer;
  }
  .role-select:focus {
    border-color: var(--amber-highlight);
  }
  .role-model-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(24, 25, 29, 0.6);
    border: 1px dashed var(--hairline-color);
    border-radius: var(--radius-xs);
    padding: 4px 8px;
    font-size: 11px;
    color: var(--parchment-dim);
    overflow: hidden;
  }
  .role-model-badge .badge-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .role-params-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-top: 2px;
  }
  .param-slider-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-xs);
    padding: 6px 8px;
  }
  .param-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    color: var(--parchment-muted);
  }
  .param-val {
    color: var(--amber-highlight);
    font-weight: 600;
  }
  .param-range {
    width: 100%;
    accent-color: var(--amber-highlight);
    cursor: pointer;
    height: 4px;
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

  /* Unsaved confirmation dialog */
  .unsaved-modal-overlay {
    position: absolute;
    inset: 0;
    background-color: rgba(5, 6, 8, 0.85);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: 50;
  }
  .unsaved-modal-box {
    width: 420px;
    max-width: 100%;
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.9);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    border: 1px solid var(--border-hairline);
  }
  .unsaved-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--amber-highlight);
  }
  .unsaved-warn-icon {
    font-size: 20px;
  }
  .unsaved-text {
    font-size: 13px;
    line-height: 1.6;
    color: var(--parchment-dim);
    margin: 0;
  }
  .unsaved-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }

  @media (max-width: 768px) {
    .modal-backdrop {
      align-items: flex-end;
    }
    .modal-card {
      width: 100%;
      max-width: 100%;
      max-height: 92dvh;
      border-radius: 16px 16px 0 0;
    }
    .modal-body {
      max-height: calc(92dvh - 125px);
      padding: 14px;
      gap: 12px;
    }
    .provider-switch {
      flex-direction: column;
    }
    .tier-seg-btn {
      font-size: 10px;
      padding: 7px 4px;
    }
    .role-fields,
    .role-params-grid {
      grid-template-columns: 1fr;
    }
    .modal-footer {
      flex-wrap: wrap;
      padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px));
    }
  }
</style>
