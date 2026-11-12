<script lang="ts">
  import { onMount } from 'svelte';
  import { KeyVaultService, type KeyEncryptionMode } from '$lib/services/keyVaultService';
  import {
    ModelDiscoveryService,
    PROVIDER_DEFAULT_MODELS,
    type DiscoveredModel,
  } from '$lib/services/modelDiscoveryService';
  import { AiEngineFactory } from '$lib/services/ai/engineFactory';
  import type { AiProviderId } from '$lib/services/ai/types';
  import { aiPipeline } from '$lib/stores/aiPipeline.svelte';
  import { toastStore } from '$lib/stores/toastStore.svelte';

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
  }

  let { isOpen = $bindable(false), onClose }: Props = $props();

  export interface ProviderMeta {
    id: AiProviderId;
    name: string;
    shortName: string;
    badge: string;
    keyPlaceholder: string;
    isLocal?: boolean;
    docHint?: string;
  }

  export const PROVIDER_REGISTRY: ProviderMeta[] = [
    {
      id: 'gemini',
      name: 'Google Gemini',
      shortName: 'Gemini',
      badge: '多模態首選',
      keyPlaceholder: 'AIzaSy...',
      docHint: '支援 Gemini 2.5 Flash / Pro 高速視覺與色彩分析',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      shortName: 'OpenAI',
      badge: 'GPT-4o / 4.1',
      keyPlaceholder: 'sk-proj-...',
      docHint: '支援 GPT-4o、GPT-4.1、o3 等主流視覺與推理模型',
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      shortName: 'Claude',
      badge: 'Sonnet 4 / 3.7',
      keyPlaceholder: 'sk-ant-...',
      docHint: '支援 Claude Sonnet / Haiku 細膩美學判讀與雙圖覆審',
    },
    {
      id: 'groq',
      name: 'Groq Cloud',
      shortName: 'Groq',
      badge: 'LPU 極速',
      keyPlaceholder: 'gsk_...',
      docHint: '支援 Llama 4 Vision 視覺與極速 LPU 社群文案生成',
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      shortName: 'OpenRouter',
      badge: '百模聚合',
      keyPlaceholder: 'sk-or-v1-...',
      docHint: '單一金鑰暢通 Qwen-VL、Mistral Pixtral、DeepSeek 等全系列模型',
    },
    {
      id: 'ollama',
      name: 'Ollama (本地端)',
      shortName: 'Ollama',
      badge: '免金鑰離線',
      keyPlaceholder: 'http://localhost:11434',
      isLocal: true,
      docHint: '100% 本機端私密推論，支援 Qwen2.5-VL、Gemma 3、Llama 3.2 Vision 等',
    },
  ];

  function getProviderMeta(id: AiProviderId | string | null | undefined): ProviderMeta {
    return PROVIDER_REGISTRY.find((p) => p.id === id) || PROVIDER_REGISTRY[0];
  }

  // ── 區塊 1：同頁直覺模型與任務指派狀態 (Single-Page Unified Role & Model Selection) ──
  let roleVisionProvider = $state<AiProviderId>('gemini');
  let roleVisionModelId = $state<string>('gemini-2.5-flash');

  let roleCopywritingProvider = $state<AiProviderId>('groq');
  let roleCopywritingModelId = $state<string>('llama-3.3-70b-versatile');

  let roleCriticUseCustom = $state<boolean>(false);
  let roleCriticProvider = $state<AiProviderId>('gemini');
  let roleCriticModelId = $state<string>('gemini-2.5-flash');

  // ── 區塊 2：供應商連線與金鑰管理狀態 ──
  let selectedProvider = $state<AiProviderId>('gemini');
  let currentProviderMeta = $derived(getProviderMeta(selectedProvider));
  let currentMode = $state<KeyEncryptionMode>('transparent');
  let apiKeyInput = $state<string>('');
  let ollamaUrlInput = $state<string>('http://localhost:11434');
  let masterPassword = $state<string>('');
  let showKey = $state<boolean>(false);
  let showOllamaCorsHelp = $state<boolean>(false);
  let statusMessage = $state<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  let isSaving = $state<boolean>(false);
  let isDiscoveringProvider = $state<Record<string, boolean>>({});

  // 各供應商目前已探測/快取之模型清單 Map（響應式更新，讓上方三個任務卡片即時連動）
  let providerModelsMap = $state<Record<AiProviderId, DiscoveredModel[]>>({
    gemini: [],
    openai: [],
    anthropic: [],
    groq: [],
    openrouter: [],
    ollama: [],
  });

  // 各家金鑰或端點就緒狀態（Ollama 須實際探測端點連通才亮綠燈）
  let ollamaReachable = $state<boolean>(false);
  let providerReadyMap = $state<Record<AiProviderId, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
    groq: false,
    openrouter: false,
    ollama: false,
  });

  let vaultStatus = $state<{ exists: boolean; mode: KeyEncryptionMode | null; updatedAt: string | null }>({
    exists: false,
    mode: null,
    updatedAt: null,
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

  onMount(async () => {
    reloadAllProviderCache();
    refreshStatus();
    loadTaskRoles();
    ollamaUrlInput = KeyVaultService.getOllamaEndpoint();
    await Promise.all([
      checkOllamaHealth(ollamaUrlInput),
      autoProbeReadyProviders(),
    ]);
  });

  async function checkOllamaHealth(url?: string): Promise<boolean> {
    const baseUrl = (url || KeyVaultService.getOllamaEndpoint()).trim().replace(/\/+$/, '');
    if (!baseUrl) {
      ollamaReachable = false;
      refreshStatus();
      return false;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
      ollamaReachable = res.ok;
    } catch {
      ollamaReachable = false;
    } finally {
      clearTimeout(timer);
      refreshStatus();
    }
    return ollamaReachable;
  }

  function reloadAllProviderCache() {
    const nextMap: Record<AiProviderId, DiscoveredModel[]> = {
      gemini: ModelDiscoveryService.getCachedModels('gemini'),
      openai: ModelDiscoveryService.getCachedModels('openai'),
      anthropic: ModelDiscoveryService.getCachedModels('anthropic'),
      groq: ModelDiscoveryService.getCachedModels('groq'),
      openrouter: ModelDiscoveryService.getCachedModels('openrouter'),
      ollama: ModelDiscoveryService.getCachedModels('ollama'),
    };
    providerModelsMap = nextMap;
  }

  function refreshStatus() {
    vaultStatus = KeyVaultService.getKeyStatus(selectedProvider);
    providerReadyMap = {
      gemini: KeyVaultService.getKeyStatus('gemini').exists,
      openai: KeyVaultService.getKeyStatus('openai').exists,
      anthropic: KeyVaultService.getKeyStatus('anthropic').exists,
      groq: KeyVaultService.getKeyStatus('groq').exists,
      openrouter: KeyVaultService.getKeyStatus('openrouter').exists,
      ollama: ollamaReachable,
    };
  }

  function getModelsForRole(prov: AiProviderId, visionOnly: boolean, currentModelId: string): DiscoveredModel[] {
    const rawList = providerModelsMap[prov] || [];
    const filtered = visionOnly ? rawList.filter((m) => m.isVisionCapable) : rawList;
    const baseList = filtered.length > 0 ? filtered : rawList;

    if (baseList.length === 0) {
      const defId = visionOnly
        ? PROVIDER_DEFAULT_MODELS[prov]?.vision
        : PROVIDER_DEFAULT_MODELS[prov]?.text;
      const items: DiscoveredModel[] = [];
      if (currentModelId) {
        items.push({
          id: currentModelId,
          displayName: currentModelId,
          provider: prov,
          isVisionCapable: true,
          score: 100,
        });
      }
      if (defId && defId !== currentModelId) {
        items.push({
          id: defId,
          displayName: `${defId} (預設推薦)`,
          provider: prov,
          isVisionCapable: true,
          score: 90,
        });
      }
      return items;
    }

    if (currentModelId && !baseList.some((m) => m.id === currentModelId)) {
      return [
        {
          id: currentModelId,
          displayName: currentModelId,
          provider: prov,
          isVisionCapable: true,
          score: 99,
        },
        ...baseList,
      ];
    }

    return baseList;
  }

  function loadTaskRoles() {
    const roles = AiEngineFactory.getTaskRoles();
    roleVisionProvider = (roles.vision.provider as AiProviderId) || 'gemini';
    roleVisionModelId =
      roles.vision.modelId ||
      getDefaultOrFirstModel(roleVisionProvider, true);

    roleCopywritingProvider = (roles.copywriting.provider as AiProviderId) || 'groq';
    roleCopywritingModelId =
      roles.copywriting.modelId ||
      getDefaultOrFirstModel(roleCopywritingProvider, false);

    roleCriticUseCustom = roles.critic?.useCustomModel ?? false;
    roleCriticProvider = (roles.critic?.provider as AiProviderId) || 'gemini';
    roleCriticModelId =
      roles.critic?.modelId ||
      getDefaultOrFirstModel(roleCriticProvider, true);

    // 預設選中目前視覺主引擎作為下方金鑰管理焦點
    selectedProvider = roleVisionProvider;
    refreshStatus();
  }

  function getDefaultOrFirstModel(prov: AiProviderId, visionOnly: boolean): string {
    const list = providerModelsMap[prov] || [];
    const candidates = visionOnly ? list.filter((m) => m.isVisionCapable) : list;
    if (candidates.length > 0) return candidates[0].id;
    if (list.length > 0) return list[0].id;
    return visionOnly
      ? PROVIDER_DEFAULT_MODELS[prov]?.vision || ''
      : PROVIDER_DEFAULT_MODELS[prov]?.text || '';
  }

  function handleVisionProviderChange(newProv: AiProviderId) {
    roleVisionProvider = newProv;
    roleVisionModelId = getDefaultOrFirstModel(newProv, true);
    // 同步將下方金鑰/端點配置區切換到該供應商，免切分頁即可一覽無遺
    selectProviderPill(newProv);
    if (providerModelsMap[newProv].length === 0) {
      probeProviderModels(newProv, false);
    }
  }

  function handleCopyProviderChange(newProv: AiProviderId) {
    roleCopywritingProvider = newProv;
    roleCopywritingModelId = getDefaultOrFirstModel(newProv, false);
    if (providerModelsMap[newProv].length === 0) {
      probeProviderModels(newProv, false);
    }
  }

  function handleCriticProviderChange(newProv: AiProviderId) {
    roleCriticProvider = newProv;
    roleCriticModelId = getDefaultOrFirstModel(newProv, true);
    if (providerModelsMap[newProv].length === 0) {
      probeProviderModels(newProv, false);
    }
  }

  function selectProviderPill(prov: AiProviderId) {
    selectedProvider = prov;
    apiKeyInput = '';
    masterPassword = '';
    statusMessage = null;
    if (prov === 'ollama') {
      ollamaUrlInput = KeyVaultService.getOllamaEndpoint();
    }
    refreshStatus();
  }

  async function autoProbeReadyProviders() {
    const activeProvs = new Set<AiProviderId>([
      roleVisionProvider,
      roleCopywritingProvider,
      selectedProvider,
    ]);
    for (const prov of activeProvs) {
      if (providerModelsMap[prov].length === 0) {
        await probeProviderModels(prov, false);
      }
    }
  }

  async function probeProviderModels(prov: AiProviderId, isManual: boolean) {
    let keyOrUrl = '';
    if (prov === 'ollama') {
      keyOrUrl = (selectedProvider === 'ollama' ? ollamaUrlInput : KeyVaultService.getOllamaEndpoint()).trim();
      KeyVaultService.setOllamaEndpoint(keyOrUrl);
    } else {
      if (selectedProvider === prov && apiKeyInput.trim()) {
        keyOrUrl = apiKeyInput.trim();
      } else {
        const st = KeyVaultService.getKeyStatus(prov);
        if (!st.exists || st.mode === 'password') {
          if (isManual && st.mode === 'password' && masterPassword) {
            const loaded = await KeyVaultService.loadKey(prov, masterPassword);
            keyOrUrl = loaded.apiKey || '';
          } else if (isManual) {
            statusMessage = {
              text: st.mode === 'password' ? '請先輸入主密碼以解鎖金鑰' : `請先輸入 ${getProviderMeta(prov).name} API Key`,
              type: 'info',
            };
            return;
          } else {
            return;
          }
        } else {
          const loaded = await KeyVaultService.loadKey(prov);
          keyOrUrl = loaded.apiKey || '';
        }
      }
    }

    if (prov !== 'ollama' && !keyOrUrl) return;

    isDiscoveringProvider = { ...isDiscoveringProvider, [prov]: true };
    if (isManual) {
      statusMessage = {
        text: `正在向 ${getProviderMeta(prov).name} 探測可用模型清單...`,
        type: 'info',
      };
    }

    try {
      const res = await ModelDiscoveryService.discoverModels(prov, keyOrUrl);
      if (res.error) {
        if (prov === 'ollama') {
          ollamaReachable = false;
          refreshStatus();
        }
        if (isManual) {
          statusMessage = { text: `連線或探測異常：${res.error}`, type: 'error' };
          toastStore.show(`${getProviderMeta(prov).name} 探測失敗：${res.error}`, 'error', 4200);
        }
      } else {
        if (prov === 'ollama') {
          ollamaReachable = true;
          refreshStatus();
        }
        providerModelsMap = { ...providerModelsMap, [prov]: res.models };
        // 若目前指派給該供應商的模型為空或不在清單內，自動填入推薦模型
        if (roleVisionProvider === prov && res.recommendedModelId) {
          const visionList = res.models.filter((m) => m.isVisionCapable);
          if (!roleVisionModelId || !res.models.some((m) => m.id === roleVisionModelId)) {
            roleVisionModelId = visionList[0]?.id || res.recommendedModelId;
          }
        }
        if (roleCopywritingProvider === prov && res.recommendedModelId) {
          if (!roleCopywritingModelId || !res.models.some((m) => m.id === roleCopywritingModelId)) {
            roleCopywritingModelId = res.recommendedModelId;
          }
        }
        if (roleCriticProvider === prov && res.recommendedModelId) {
          const visionList = res.models.filter((m) => m.isVisionCapable);
          if (!roleCriticModelId || !res.models.some((m) => m.id === roleCriticModelId)) {
            roleCriticModelId = visionList[0]?.id || res.recommendedModelId;
          }
        }
        if (isManual) {
          const visionCount = res.models.filter((m) => m.isVisionCapable).length;
          statusMessage = {
            text: `✓ ${getProviderMeta(prov).name} 連線成功！共載入 ${res.models.length} 個模型（含 ${visionCount} 個視覺多模態模型）`,
            type: 'success',
          };
          toastStore.show(
            `${getProviderMeta(prov).name} 已載入 ${res.models.length} 個可用模型 ✓`,
            'success',
            3000
          );
        }
      }
    } finally {
      isDiscoveringProvider = { ...isDiscoveringProvider, [prov]: false };
    }
  }

  let discoveryTimer: any = null;
  function handleKeyInputChange(newVal: string) {
    apiKeyInput = newVal;
    const detected = ModelDiscoveryService.detectProviderFromKey(newVal);
    if (detected && detected !== selectedProvider && detected !== 'ollama') {
      selectedProvider = detected;
      refreshStatus();
    }
    clearTimeout(discoveryTimer);
    if (newVal.trim().length > 10) {
      discoveryTimer = setTimeout(() => {
        probeProviderModels(selectedProvider, false);
      }, 650);
    }
  }

  async function handleSaveProviderKey() {
    if (selectedProvider === 'ollama') {
      KeyVaultService.setOllamaEndpoint(ollamaUrlInput);
      refreshStatus();
      await probeProviderModels('ollama', true);
      return;
    }

    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      statusMessage = { text: `請輸入 ${currentProviderMeta.name} API Key`, type: 'error' };
      return;
    }

    try {
      await KeyVaultService.saveKey(selectedProvider, trimmed, currentMode, masterPassword);
      apiKeyInput = '';
      masterPassword = '';
      refreshStatus();
      statusMessage = {
        text: `✓ ${currentProviderMeta.name} 金鑰已安全儲存（${getModeLabel(currentMode)}）`,
        type: 'success',
      };
      toastStore.show(`${currentProviderMeta.name} 金鑰已儲存 ✓`, 'success', 2500);
      await probeProviderModels(selectedProvider, false);
    } catch (err: any) {
      statusMessage = { text: err?.message || '金鑰儲存失敗', type: 'error' };
    }
  }

  async function handleSaveAll(autoClose = true) {
    if (isSaving) return;
    isSaving = true;

    try {
      // 若下方輸入框有尚未儲存的金鑰或 Ollama URL，順便一併存入
      if (selectedProvider === 'ollama' && ollamaUrlInput.trim()) {
        KeyVaultService.setOllamaEndpoint(ollamaUrlInput.trim());
      } else if (apiKeyInput.trim()) {
        await KeyVaultService.saveKey(selectedProvider, apiKeyInput.trim(), currentMode, masterPassword);
        apiKeyInput = '';
        masterPassword = '';
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`slipknot_model_${roleVisionProvider}`, roleVisionModelId);
        localStorage.setItem(`slipknot_model_${roleCopywritingProvider}`, roleCopywritingModelId);
        if (roleCriticUseCustom && roleCriticModelId) {
          localStorage.setItem(`slipknot_model_${roleCriticProvider}`, roleCriticModelId);
        }
      }

      const currentRoles = AiEngineFactory.getTaskRoles();
      AiEngineFactory.setTaskRoles({
        vision: {
          provider: roleVisionProvider,
          modelId: roleVisionModelId,
          temperature: currentRoles.vision.temperature,
        },
        copywriting: {
          provider: roleCopywritingProvider,
          modelId: roleCopywritingModelId,
          temperature: currentRoles.copywriting.temperature,
        },
        critic: {
          ...currentRoles.critic,
          useCustomModel: roleCriticUseCustom,
          provider: roleCriticProvider,
          modelId: roleCriticUseCustom ? roleCriticModelId : roleVisionModelId,
        },
      });

      refreshStatus();
      aiPipeline.reloadEngineSettings();
      toastStore.show('AI 模型指派與金鑰設定已同步生效 ✓', 'success', 2800);

      if (autoClose) {
        isOpen = false;
        onClose?.();
      }
    } catch (err: any) {
      statusMessage = { text: err?.message || '儲存失敗', type: 'error' };
    } finally {
      isSaving = false;
    }
  }

  function handleDeleteKey() {
    KeyVaultService.deleteKey(selectedProvider);
    refreshStatus();
    statusMessage = { text: `${currentProviderMeta.name} 設定已重設清除`, type: 'info' };
    apiKeyInput = '';
    masterPassword = '';
  }

  function getModeLabel(m: KeyEncryptionMode): string {
    switch (m) {
      case 'plain':
        return '無加密（明文）';
      case 'transparent':
        return '透明加密（本機安全綁定）';
      case 'password':
        return '密碼加密（PBKDF2）';
    }
  }

  function closeModal() {
    isOpen = false;
    onClose?.();
  }
</script>

{#if isOpen}
  <div class="modal-backdrop">
    <div class="modal-card hairline-all">
      <!-- Modal Header -->
      <div class="modal-header hairline-b">
        <div class="header-title-box">
          <span class="material-symbols-outlined vault-icon">hub</span>
          <div>
            <h2 class="modal-title font-headline">AI 模型調度中心與金鑰保險庫 (AI Model & Key Hub)</h2>
            <p class="modal-subtitle font-mono">
              管理雲端模型 (Gemini / OpenAI / Claude / Groq / OpenRouter) 與本地端 Ollama
            </p>
          </div>
        </div>
        <button type="button" class="close-btn" onclick={closeModal} title="關閉視窗">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <!-- Modal Body: 單頁上下整合（上方直接選任務與模型、下方集中管理連線與金鑰） -->
      <div class="modal-body custom-scroll">
        <!-- ════════════════════════════════════════════════════════════════
             第一區：任務引擎與模型同頁直選 (UNIFIED TASK & MODEL SELECTOR)
             ════════════════════════════════════════════════════════════════ -->
        <div class="section-block role-assign-block hairline-all">
          <div class="role-header-row">
            <div class="role-header font-mono">
              <span class="material-symbols-outlined role-header-icon">tune</span>
              <span>STEP 1 · 任務模型指派 (MODEL ASSIGNMENT)</span>
            </div>
          </div>

          <div class="roles-grid">
            <!-- 任務 1: 影像視覺顯影 (Vision) -->
            <div class="role-card hairline-all">
              <div class="role-card-top font-mono">
                <div class="role-title-left">
                  <span class="material-symbols-outlined" style="font-size: 15px; color: var(--amber-highlight);">camera</span>
                  <span>影像視覺顯影主引擎 (Vision Grading)</span>
                </div>
                <button
                  type="button"
                  class="mini-probe-btn font-mono"
                  onclick={() => probeProviderModels(roleVisionProvider, true)}
                  disabled={isDiscoveringProvider[roleVisionProvider]}
                  title="從該供應商端點刷新最新模型清單"
                >
                  <span class="material-symbols-outlined" class:spin={isDiscoveringProvider[roleVisionProvider]} style="font-size: 12px;">
                    refresh
                  </span>
                  <span>{isDiscoveringProvider[roleVisionProvider] ? '探測中' : '刷新模型'}</span>
                </button>
              </div>

              <div class="role-fields">
                <!-- 選擇供應商 -->
                <select
                  class="role-select font-mono"
                  value={roleVisionProvider}
                  onchange={(e) => handleVisionProviderChange((e.target as HTMLSelectElement).value as AiProviderId)}
                >
                  {#each PROVIDER_REGISTRY as prov}
                    <option value={prov.id}>
                      {prov.isLocal ? '🖥️ ' : '☁️ '}{prov.name} {providerReadyMap[prov.id] ? '●' : '○'}
                    </option>
                  {/each}
                </select>

                <!-- 同列直接選擇模型 (免切分頁) -->
                <select class="role-select model-picker font-mono" bind:value={roleVisionModelId}>
                  {#each getModelsForRole(roleVisionProvider, true, roleVisionModelId) as m}
                    <option value={m.id}>
                      {m.displayName || m.id} {m.recommendationTag ? `[${m.recommendationTag}]` : ''}
                    </option>
                  {/each}
                </select>
              </div>

              {#if roleVisionProvider === 'ollama'}
                <div class="inline-local-input font-mono">
                  <span class="local-tag">無清單時可手輸模型 ID：</span>
                  <input
                    type="text"
                    class="inline-model-input font-mono"
                    placeholder="例如 qwen2.5vl:latest 或 gemma3:12b"
                    bind:value={roleVisionModelId}
                  />
                </div>
              {/if}
            </div>

            <!-- 任務 2: 社群文案與目錄策展 (Copywriting & DAM) -->
            <div class="role-card hairline-all">
              <div class="role-card-top font-mono">
                <div class="role-title-left">
                  <span class="material-symbols-outlined" style="font-size: 15px; color: var(--amber-highlight);">edit_note</span>
                  <span>社群文案與智慧目錄規劃 (Text & IPTC)</span>
                </div>
                <button
                  type="button"
                  class="mini-probe-btn font-mono"
                  onclick={() => probeProviderModels(roleCopywritingProvider, true)}
                  disabled={isDiscoveringProvider[roleCopywritingProvider]}
                >
                  <span class="material-symbols-outlined" class:spin={isDiscoveringProvider[roleCopywritingProvider]} style="font-size: 12px;">
                    refresh
                  </span>
                  <span>{isDiscoveringProvider[roleCopywritingProvider] ? '探測中' : '刷新模型'}</span>
                </button>
              </div>

              <div class="role-fields">
                <select
                  class="role-select font-mono"
                  value={roleCopywritingProvider}
                  onchange={(e) => handleCopyProviderChange((e.target as HTMLSelectElement).value as AiProviderId)}
                >
                  {#each PROVIDER_REGISTRY as prov}
                    <option value={prov.id}>
                      {prov.isLocal ? '🖥️ ' : '☁️ '}{prov.name} {providerReadyMap[prov.id] ? '●' : '○'}
                    </option>
                  {/each}
                </select>

                <select class="role-select model-picker font-mono" bind:value={roleCopywritingModelId}>
                  {#each getModelsForRole(roleCopywritingProvider, false, roleCopywritingModelId) as m}
                    <option value={m.id}>
                      {m.displayName || m.id} {m.recommendationTag ? `[${m.recommendationTag}]` : ''}
                    </option>
                  {/each}
                </select>
              </div>
            </div>

            <!-- 任務 3: 雙圖閉環覆審模型指定 (Pass 2 Critic Model) -->
            <div class="role-card hairline-all">
              <div class="role-card-top font-mono">
                <div class="role-title-left">
                  <span class="material-symbols-outlined" style="font-size: 15px; color: var(--amber-highlight);">fact_check</span>
                  <span>雙圖覆審品控模型 (Pass 2 Critic · 開關與溫度於設定／暗房調整)</span>
                </div>
              </div>

              <div class="critic-radio-row font-mono">
                <label>
                  <input type="radio" name="critic_mode" value={false} bind:group={roleCriticUseCustom} />
                  <span>沿用上方視覺主引擎 ({roleVisionModelId})</span>
                </label>
                <label>
                  <input type="radio" name="critic_mode" value={true} bind:group={roleCriticUseCustom} />
                  <span>指定異質覆審模型 (Cross-Model Check)</span>
                </label>
              </div>

              {#if roleCriticUseCustom}
                <div class="role-fields">
                  <select
                    class="role-select font-mono"
                    value={roleCriticProvider}
                    onchange={(e) => handleCriticProviderChange((e.target as HTMLSelectElement).value as AiProviderId)}
                  >
                    {#each PROVIDER_REGISTRY as prov}
                      <option value={prov.id}>
                        {prov.isLocal ? '🖥️ ' : '☁️ '}{prov.name}
                      </option>
                    {/each}
                  </select>

                  <select class="role-select model-picker font-mono" bind:value={roleCriticModelId}>
                    {#each getModelsForRole(roleCriticProvider, true, roleCriticModelId) as m}
                      <option value={m.id}>
                        {m.displayName || m.id} {m.recommendationTag ? `[${m.recommendationTag}]` : ''}
                      </option>
                    {/each}
                  </select>
                </div>
              {/if}
            </div>
          </div>
        </div>

        <!-- ════════════════════════════════════════════════════════════════
             第二區：供應商金鑰與本地端 Ollama 連線配置 (PROVIDER CREDENTIALS & OLLAMA)
             ════════════════════════════════════════════════════════════════ -->
        <div class="section-block vault-config-block hairline-all">
          <div class="role-header-row">
            <div class="role-header font-mono">
              <span class="material-symbols-outlined role-header-icon">vpn_key</span>
              <span>STEP 2 · 供應商金鑰與本地端連線設定 (CREDENTIALS & ENDPOINT)</span>
            </div>
            <span class="provider-doc-hint font-body">{currentProviderMeta.docHint}</span>
          </div>

          <!-- 6 大供應商快速膠囊列 -->
          <div class="provider-pill-grid">
            {#each PROVIDER_REGISTRY as prov}
              <button
                type="button"
                class="prov-pill-btn font-mono"
                class:active={selectedProvider === prov.id}
                onclick={() => selectProviderPill(prov.id)}
              >
                <span
                  class="dot"
                  class:green={providerReadyMap[prov.id]}
                  class:gray={!providerReadyMap[prov.id]}
                ></span>
                <span class="prov-short">{prov.shortName}</span>
                <span class="prov-badge">{prov.badge}</span>
              </button>
            {/each}
          </div>

          {#if selectedProvider === 'ollama'}
            <!-- Ollama 專屬免金鑰設定介面 -->
            <div class="ollama-panel hairline-all">
              <div class="input-header font-mono">
                <span>🖥️ OLLAMA 伺服器端點 (LOCAL / LAN ENDPOINT)</span>
                <button
                  type="button"
                  class="text-toggle font-mono"
                  onclick={() => (showOllamaCorsHelp = !showOllamaCorsHelp)}
                >
                  {showOllamaCorsHelp ? '收合 CORS 指引' : '⚠️ 連線失敗？查看 CORS 設定'}
                </button>
              </div>

              <div class="ollama-url-row">
                <div class="input-wrap hairline-all flex-1">
                  <span class="material-symbols-outlined input-icon">dns</span>
                  <input
                    type="text"
                    placeholder="http://localhost:11434"
                    bind:value={ollamaUrlInput}
                    class="vault-input font-mono"
                  />
                </div>
                <button
                  type="button"
                  class="archival-btn-secondary font-mono"
                  onclick={handleSaveProviderKey}
                  disabled={isDiscoveringProvider['ollama']}
                >
                  <span class="material-symbols-outlined" class:spin={isDiscoveringProvider['ollama']} style="font-size: 14px;">
                    sync
                  </span>
                  <span>偵測本機模型</span>
                </button>
              </div>

              {#if showOllamaCorsHelp}
                <div class="cors-help-box font-mono hairline-all">
                  <div>1. 推薦下載視覺多模態模型：<code>ollama pull qwen2.5vl</code> 或 <code>ollama pull gemma3:12b</code></div>
                  <div>2. 允許瀏覽器跨域存取 (Windows PowerShell)：</div>
                  <code>[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "*", "User")</code>
                  <div>3. 若要讓手機透過區網連線電腦 Ollama，請額外設定對外監聽：</div>
                  <code>[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:11434", "User")</code>
                  <div>（設定後請完全關閉並重啟系統列 Ollama 圖示，手機端點填寫電腦區網 IP，例如 http://192.168.1.100:11434）</div>
                </div>
              {/if}
            </div>
          {:else}
            <!-- 雲端供應商 API Key 與三層加密設定 -->
            <div class="cloud-key-panel">
              <div class="status-inline-bar font-mono">
                <span>
                  {currentProviderMeta.name} 狀態：
                  {#if vaultStatus.exists}
                    <strong class="text-green">● 已儲存 ({getModeLabel(vaultStatus.mode!)})</strong>
                  {:else}
                    <span class="text-dim">○ 尚未設定金鑰</span>
                  {/if}
                </span>
                {#if vaultStatus.exists}
                  <button type="button" class="danger-link font-mono" onclick={handleDeleteKey}>
                    清除此金鑰
                  </button>
                {/if}
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

              <div class="key-input-action-row">
                <div class="input-wrap hairline-all flex-1">
                  <span class="material-symbols-outlined input-icon">vpn_key</span>
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder={`輸入 ${currentProviderMeta.name} API Key (${currentProviderMeta.keyPlaceholder})`}
                    value={apiKeyInput}
                    oninput={(e) => handleKeyInputChange((e.target as HTMLInputElement).value)}
                    class="vault-input font-mono"
                  />
                  <button type="button" class="text-toggle font-mono" onclick={() => (showKey = !showKey)}>
                    {showKey ? '隱藏' : '顯示'}
                  </button>
                </div>
                <button
                  type="button"
                  class="archival-btn-secondary font-mono"
                  onclick={() => probeProviderModels(selectedProvider, true)}
                  disabled={isDiscoveringProvider[selectedProvider]}
                >
                  <span class="material-symbols-outlined" class:spin={isDiscoveringProvider[selectedProvider]} style="font-size: 14px;">
                    network_check
                  </span>
                  <span>驗證並載入模型</span>
                </button>
              </div>

              {#if currentMode === 'password' || vaultStatus.mode === 'password'}
                <div class="input-wrap hairline-all" style="margin-top: 6px;">
                  <span class="material-symbols-outlined input-icon">pin</span>
                  <input
                    type="password"
                    placeholder="請輸入主密碼 (至少 4 字元，用於 PBKDF2 加密與解鎖)"
                    bind:value={masterPassword}
                    class="vault-input font-mono"
                  />
                </div>
              {/if}
            </div>
          {/if}
        </div>

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
        <span class="footer-active-summary font-mono">
          當前視覺：{getProviderMeta(roleVisionProvider).shortName} · {roleVisionModelId}
        </span>
        <div class="spacer"></div>
        <button type="button" class="archival-btn-secondary" onclick={closeModal}>
          取消
        </button>
        <button type="button" class="archival-btn-primary" onclick={() => handleSaveAll(true)} disabled={isSaving}>
          <span class="material-symbols-outlined" style="font-size: 15px;">{isSaving ? 'sync' : 'save'}</span>
          {isSaving ? '儲存中...' : '套用模型與儲存設定'}
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
    background-color: rgba(8, 9, 11, 0.78);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-card {
    position: relative;
    width: 680px;
    max-width: 94vw;
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    box-shadow: 0 20px 56px rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    padding: 14px 20px;
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
    margin: 2px 0 0 0;
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
    padding: 16px 20px;
    overflow-y: auto;
    max-height: 76vh;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .section-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .role-assign-block,
  .vault-config-block {
    background: rgba(24, 25, 29, 0.5);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
  }

  .role-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
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
  .provider-doc-hint {
    font-size: 11px;
    color: var(--parchment-dim);
  }

  .roles-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .role-card {
    background: var(--canvas-base);
    border-radius: var(--radius-xs);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .role-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: var(--parchment-bright);
    font-weight: 600;
  }
  .role-title-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .mini-probe-btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-muted);
    font-size: 10px;
    padding: 2px 8px;
    border-radius: var(--radius-xs);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .mini-probe-btn:hover {
    color: var(--amber-highlight);
    border-color: var(--amber-highlight);
  }

  .role-fields {
    display: grid;
    grid-template-columns: 185px 1fr;
    gap: 8px;
  }
  .role-select {
    width: 100%;
    background: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-bright);
    font-size: 11px;
    padding: 7px 10px;
    border-radius: var(--radius-xs);
    outline: none;
    cursor: pointer;
    color-scheme: dark;
  }
  .role-select:focus {
    border-color: var(--amber-highlight);
  }
  .role-select.model-picker {
    border-color: rgba(212, 163, 115, 0.35);
    font-weight: 600;
  }

  .inline-local-input {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: var(--parchment-dim);
  }
  .inline-model-input {
    flex: 1;
    background: var(--surface-elevated);
    border: 1px dashed var(--hairline-slate);
    color: var(--parchment-bright);
    padding: 4px 8px;
    border-radius: var(--radius-xs);
    font-size: 11px;
  }

  .role-params-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .param-slider-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-xs);
    padding: 5px 8px;
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

  .critic-switch-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 11px;
  }
  .critic-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }
  .critic-radio-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 11px;
    color: var(--parchment-muted);
  }
  .critic-radio-row label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }

  /* 6 Provider Pills */
  .provider-pill-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }
  .prov-pill-btn {
    background: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-xs);
    padding: 7px 6px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    transition: all 0.15s ease;
  }
  .prov-pill-btn:hover {
    border-color: rgba(212, 163, 115, 0.5);
  }
  .prov-pill-btn.active {
    background: rgba(212, 163, 115, 0.12);
    border-color: var(--amber-highlight);
  }
  .prov-short {
    font-size: 11px;
    font-weight: 600;
    color: var(--parchment-bright);
  }
  .prov-badge {
    font-size: 9px;
    color: var(--parchment-dim);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .dot.green {
    background-color: #4ade80;
    box-shadow: 0 0 6px rgba(74, 222, 128, 0.6);
  }
  .dot.gray {
    background-color: var(--parchment-dim);
  }

  .ollama-panel,
  .cloud-key-panel {
    background: var(--canvas-base);
    border-radius: var(--radius-xs);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ollama-url-row,
  .key-input-action-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .flex-1 {
    flex: 1;
  }
  .cors-help-box {
    background: rgba(212, 163, 115, 0.08);
    padding: 8px 10px;
    border-radius: var(--radius-xs);
    font-size: 10px;
    color: var(--parchment-muted);
    display: flex;
    flex-direction: column;
    gap: 4px;
    line-height: 1.45;
  }
  .cors-help-box code {
    color: var(--amber-highlight);
    background: rgba(0, 0, 0, 0.4);
    padding: 2px 5px;
    border-radius: 3px;
  }

  .status-inline-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--parchment-muted);
  }
  .text-green {
    color: #4ade80;
  }
  .text-dim {
    color: var(--parchment-dim);
  }
  .danger-link {
    background: transparent;
    border: none;
    color: #ff9999;
    font-size: 10px;
    cursor: pointer;
    text-decoration: underline;
  }

  .input-header {
    font-size: 10px;
    color: var(--parchment-dim);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .text-toggle {
    background: transparent;
    border: none;
    color: var(--amber-highlight);
    cursor: pointer;
    font-size: 10px;
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
    padding: 6px;
    border-radius: var(--radius-xs);
    font-size: 10px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
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
    font-size: 10px;
    color: var(--parchment-dim);
  }

  .input-wrap {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .input-icon {
    font-size: 15px;
    color: var(--parchment-dim);
  }
  .vault-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    padding: 7px 0;
    color: var(--parchment-bright);
    font-size: 12px;
  }

  .spin {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
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
    background-color: rgba(74, 222, 128, 0.12);
    border-color: #4ade80;
    color: #4ade80;
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
    padding: 12px 20px;
    background-color: var(--surface-elevated);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .footer-active-summary {
    font-size: 11px;
    color: var(--amber-highlight);
  }
  .spacer {
    flex: 1;
  }

  @media (max-width: 768px) {
    .provider-pill-grid {
      grid-template-columns: repeat(3, 1fr);
    }
    .role-fields,
    .role-params-grid {
      grid-template-columns: 1fr;
    }
    .ollama-url-row,
    .key-input-action-row {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
