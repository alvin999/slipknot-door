<script lang="ts">
  import { type CustomLutRecord, parseCubeMetadata } from '$lib/services/customLutService';

  export interface ProfileItem {
    id: string;
    title: string;
    tone: string;
    badge: string;
    accent: string;
    description?: string;
    evDefault: number;
    contrastDefault?: number;
    highlightsDefault?: number;
    shadowLiftDefault?: number;
    shadowsDefault?: number;
    fadeDefault?: number;
    cyanSkyDefault?: number;
    foliageDefault?: number;
    lutIntensityDefault: number;
    clarityDefault?: number;
    sharpnessDefault?: number;
    recommendedScene: string;
    isCustom?: boolean;
    rawCustomLut?: CustomLutRecord;
  }

  interface Props {
    profiles: ProfileItem[];
    activeProfileId: string;
    activePhotoTitle?: string;
    onApplyProfile: (profileId: string) => void;
    onApplyToAll: (profileId: string) => void;
    onImportCustomLut?: (lut: CustomLutRecord) => Promise<void> | void;
    onUpdateCustomLut?: (lut: CustomLutRecord) => Promise<void> | void;
    onDeleteCustomLut?: (id: string) => Promise<void> | void;
    onGoToRetouch?: () => void;
    onGoToCatalog?: () => void;
  }

  let {
    profiles,
    activeProfileId,
    activePhotoTitle = '尚未選取底片',
    onApplyProfile,
    onApplyToAll,
    onImportCustomLut,
    onUpdateCustomLut,
    onDeleteCustomLut,
    onGoToRetouch,
    onGoToCatalog
  }: Props = $props();

  let toastMessage = $state<string>('');
  let fileInputRef: HTMLInputElement | null = null;

  const PALETTE_SWATCHES = [
    { name: '森綠', color: '#2e7d32' },
    { name: '草綠', color: '#4caf50' },
    { name: '金橘', color: '#e67e22' },
    { name: '琥珀', color: '#d35400' },
    { name: '海天藍', color: '#4a8fa8' },
    { name: '深青藍', color: '#1976d2' },
    { name: '暖陶粉', color: '#c97a5d' },
    { name: '正片紅', color: '#cf5c42' },
    { name: '深黑階', color: '#3d404d' },
    { name: '石板灰', color: '#8e929b' },
    { name: '典藏金', color: '#bfa15f' },
  ];

  // 匯入 Modal 狀態
  let showImportModal = $state<boolean>(false);
  let pendingCubeText = $state<string>('');
  let pendingFileName = $state<string>('');
  let customTitle = $state<string>('');
  let customPrompt = $state<string>('');
  let customScene = $state<string>('街拍人文 / 氛圍日常');
  let parsedLutSize = $state<number>(33);
  let customAccent = $state<string>('#bfa15f');
  let customLutRatio = $state<number>(0.85);

  // 編輯 Modal 狀態
  let showEditModal = $state<boolean>(false);
  let editingRecord = $state<CustomLutRecord | null>(null);
  let editTitle = $state<string>('');
  let editPrompt = $state<string>('');
  let editScene = $state<string>('');
  let editAccent = $state<string>('#bfa15f');
  let editLutRatio = $state<number>(0.85);

  function triggerFileInput() {
    if (fileInputRef) {
      fileInputRef.value = '';
      fileInputRef.click();
    }
  }

  async function handleFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;

    const file = target.files[0];
    try {
      const text = await file.text();
      const meta = parseCubeMetadata(text, file.name.replace(/\.cube$/i, ''));
      if (!meta.isValid) {
        toastMessage = '警告：.cube 檔案格式不完整或非標準 3D LUT';
        setTimeout(() => { toastMessage = ''; }, 4000);
        return;
      }

      pendingCubeText = text;
      pendingFileName = file.name;
      customTitle = meta.title || file.name.replace(/\.cube$/i, '');
      customPrompt = meta.suggestedPrompt;
      parsedLutSize = meta.lutSize;
      customAccent = meta.accent || '#bfa15f';
      customLutRatio = meta.suggestedLutIntensity || 0.85;
      showImportModal = true;
    } catch (err) {
      console.error('Failed to read .cube file:', err);
      toastMessage = '讀取 .cube 檔案失敗';
      setTimeout(() => { toastMessage = ''; }, 3000);
    }
  }

  async function confirmImport() {
    if (!pendingCubeText || !customTitle.trim()) return;

    const newRecord: CustomLutRecord = {
      id: `custom_${Date.now()}`,
      name: customTitle.trim(),
      cubeContent: pendingCubeText,
      lutSize: parsedLutSize,
      directiveDescription: customPrompt.trim(),
      recommendedScene: customScene.trim(),
      createdAt: Date.now(),
      accent: customAccent,
      lutIntensityDefault: customLutRatio,
    };

    if (onImportCustomLut) {
      await onImportCustomLut(newRecord);
    }

    showImportModal = false;
    pendingCubeText = '';
    toastMessage = `已成功匯入自訂 LUT「${newRecord.name}」並建立 AI 連動！`;
    setTimeout(() => { toastMessage = ''; }, 4000);
  }

  function handleOpenEdit(prof: ProfileItem) {
    if (!prof.rawCustomLut) return;
    editingRecord = prof.rawCustomLut;
    editTitle = prof.rawCustomLut.name;
    editPrompt = prof.rawCustomLut.directiveDescription;
    editScene = prof.rawCustomLut.recommendedScene || '';
    editAccent = prof.rawCustomLut.accent || prof.accent || '#bfa15f';
    editLutRatio = prof.rawCustomLut.lutIntensityDefault ?? 0.85;
    showEditModal = true;
  }

  async function confirmEdit() {
    if (!editingRecord || !editTitle.trim()) return;

    const updated: CustomLutRecord = {
      ...editingRecord,
      name: editTitle.trim(),
      directiveDescription: editPrompt.trim(),
      recommendedScene: editScene.trim(),
      accent: editAccent,
      lutIntensityDefault: editLutRatio,
    };

    if (onUpdateCustomLut) {
      await onUpdateCustomLut(updated);
    }

    showEditModal = false;
    editingRecord = null;
    toastMessage = `已成功更新「${updated.name}」之色彩代表色與 AI 連動！`;
    setTimeout(() => { toastMessage = ''; }, 4000);
  }

  function handleApplyAll(id: string) {
    onApplyToAll(id);
    toastMessage = `已將「${profiles.find(p => p.id === id)?.title}」批次指定至全相卷底片`;
    setTimeout(() => { toastMessage = ''; }, 3000);
  }

  async function handleDelete(id: string, name: string) {
    if (confirm(`確定要刪除自訂 LUT「${name}」嗎？`)) {
      if (onDeleteCustomLut) {
        await onDeleteCustomLut(id);
        toastMessage = `已刪除「${name}」`;
        setTimeout(() => { toastMessage = ''; }, 3000);
      }
    }
  }
</script>

<div class="profiles-viewport">
  <!-- 隱藏的 .cube 檔案選取元件 -->
  <input
    type="file"
    accept=".cube"
    bind:this={fileInputRef}
    onchange={handleFileSelected}
    style="display: none;"
  />

  <!-- HEADER -->
  <header class="profiles-toolbar hairline-b font-mono">
    <div class="header-left">
      <span class="tool-title font-headline">3D LUT 去識別化風格典藏庫</span>
      <span class="counter-badge">{profiles.length} PROFILES ({profiles.filter(p => p.isCustom).length} 自訂)</span>
    </div>
    <div class="header-right">
      {#if toastMessage}
        <span class="toast-chip font-mono">{toastMessage}</span>
      {/if}
      <button type="button" class="tool-btn highlight" onclick={triggerFileInput}>
        <span class="material-symbols-outlined" style="font-size: 15px;">file_upload</span>
        <span>匯入自訂 .cube LUT</span>
      </button>
    </div>
  </header>

  <!-- PROFILES GRID -->
  <div class="profiles-content custom-scroll">
    <div class="profiles-deck-grid">
      {#each profiles as prof}
        <div 
          class="profile-deck-card hairline-all" 
          class:active={activeProfileId === prof.id}
          class:is-custom={prof.isCustom}
        >
          <!-- Card Header & Badge -->
          <div class="deck-top">
            <div class="badge-row font-mono">
              <span class="badge-pill" class:custom-badge={prof.isCustom}>{prof.badge}</span>
              <div class="badge-actions">
                {#if prof.isCustom}
                  <button
                    type="button"
                    class="action-icon-btn edit-btn"
                    title="編輯風格代表色、比例與 AI 指令"
                    onclick={() => handleOpenEdit(prof)}
                  >
                    <span class="material-symbols-outlined" style="font-size: 15px;">edit</span>
                  </button>
                  <button
                    type="button"
                    class="action-icon-btn del-btn"
                    title="刪除此自訂 LUT"
                    onclick={() => handleDelete(prof.id, prof.title)}
                  >
                    <span class="material-symbols-outlined" style="font-size: 15px;">delete</span>
                  </button>
                {/if}
                {#if activeProfileId === prof.id}
                  <span class="active-pill font-mono">
                    <span class="dot"></span>
                    目前套用
                  </span>
                {/if}
              </div>
            </div>
            <h3 class="profile-card-title font-headline">{prof.title}</h3>
            <p class="profile-card-tone font-body">{prof.tone}</p>
          </div>

          <!-- Color Swatch Spectrum Strip -->
          <div class="color-spectrum-strip hairline-all">
            <span class="swatch" style:background={prof.accent}></span>
            <span class="swatch" style:background="color-mix(in srgb, {prof.accent} 70%, #000)"></span>
            <span class="swatch" style:background="color-mix(in srgb, {prof.accent} 40%, #fff)"></span>
            <span class="swatch" style:background="#202227"></span>
          </div>

          <!-- Parameter Specs -->
          <div class="specs-grid font-mono">
            <div class="spec-cell">
              <span class="spec-label">DEFAULT EV</span>
              <span class="spec-val">{prof.evDefault > 0 ? `+${prof.evDefault}` : prof.evDefault}</span>
            </div>
            <div class="spec-cell">
              <span class="spec-label">{prof.contrastDefault !== undefined ? 'CONTRAST' : 'SHADOW LIFT'}</span>
              <span class="spec-val">
                {prof.contrastDefault !== undefined
                  ? (prof.contrastDefault > 0 ? `+${Math.round(prof.contrastDefault * 100)}%` : `${Math.round(prof.contrastDefault * 100)}%`)
                  : `+${Math.round((prof.shadowLiftDefault || 0) * 100)}%`}
              </span>
            </div>
            <div class="spec-cell">
              <span class="spec-label">LUT RATIO</span>
              <span class="spec-val amber">{Math.round((prof.lutIntensityDefault ?? 0.85) * 100)}%</span>
            </div>
            <div class="spec-cell">
              <span class="spec-label">OPTIMAL SCENE</span>
              <span class="spec-val truncate">{prof.recommendedScene}</span>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="deck-actions font-mono">
            <button 
              type="button" 
              class="archival-btn-primary" 
              onclick={() => onApplyProfile(prof.id)}
            >
              <span class="material-symbols-outlined" style="font-size: 14px;">check</span>
              <span>套用至當前幀</span>
            </button>
            <button 
              type="button" 
              class="tool-btn" 
              onclick={() => handleApplyAll(prof.id)}
              title="將此色調風格指定至相卷內所有底片"
            >
              <span>套用至全卷</span>
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<!-- 匯入自訂 LUT 彈窗 (Modal) -->
{#if showImportModal}
  <div class="modal-backdrop">
    <div class="import-modal-card hairline-all font-mono">
      <div class="modal-header hairline-b">
        <span class="font-headline modal-title">匯入自訂 3D LUT 並建立 AI 連動</span>
        <button type="button" class="close-btn" onclick={() => showImportModal = false}>
          <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
        </button>
      </div>

      <div class="modal-body font-body">
        <div class="meta-preview hairline-all">
          <span class="meta-badge">.cube 來源：{pendingFileName}</span>
          <span class="meta-badge">維度尺寸：{parsedLutSize}×{parsedLutSize}×{parsedLutSize}</span>
        </div>

        <div class="input-group">
          <label for="custom-lut-title" class="input-label font-mono">風格顯示名稱</label>
          <input
            id="custom-lut-title"
            type="text"
            class="archival-input font-mono"
            bind:value={customTitle}
            placeholder="例如：Kodak Gold 200 / 暖調日落負片"
          />
        </div>

        <!-- 風格代表色自動識別與自訂 -->
        <div class="input-group">
          <label for="custom-color-picker" class="input-label font-mono">
            <span>風格特徵光譜色 (自動分析提取)</span>
            <span class="label-hint">已依據 .cube 3D 空間點雲色相偏移自動萃取，亦可手動微調</span>
          </label>
          <div class="color-picker-row hairline-all">
            <div class="spectrum-preview-box">
              <span class="swatch" style:background={customAccent}></span>
              <span class="swatch" style:background="color-mix(in srgb, {customAccent} 70%, #000)"></span>
              <span class="swatch" style:background="color-mix(in srgb, {customAccent} 40%, #fff)"></span>
              <span class="swatch" style:background="#202227"></span>
            </div>
            <div class="color-control">
              <input id="custom-color-picker" type="color" bind:value={customAccent} class="color-native-input" />
              <span class="color-hex-label font-mono">{customAccent.toUpperCase()}</span>
            </div>
          </div>
          <div class="swatch-palette-row">
            {#each PALETTE_SWATCHES as sw}
              <button
                type="button"
                class="swatch-bubble"
                class:active={customAccent.toLowerCase() === sw.color.toLowerCase()}
                style:background={sw.color}
                title={sw.name}
                onclick={() => (customAccent = sw.color)}
              ></button>
            {/each}
          </div>
        </div>

        <!-- 預設 LUT 套用強度 -->
        <div class="input-group">
          <div class="slider-header font-mono">
            <label for="custom-lut-ratio" class="input-label">預設套用強度 (LUT RATIO)</label>
            <span class="ratio-val amber font-mono">{Math.round(customLutRatio * 100)}%</span>
          </div>
          <input
            id="custom-lut-ratio"
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            bind:value={customLutRatio}
            class="archival-range-slider"
          />
        </div>

        <div class="input-group">
          <label for="custom-lut-prompt" class="input-label font-mono">
            <span>AI 連動光學風格指令 (Prompt Directive)</span>
            <span class="label-hint">AI 顯影時將參考此光學特徵進行動態曝光與色溫協同</span>
          </label>
          <textarea
            id="custom-lut-prompt"
            class="archival-textarea font-mono"
            rows="3"
            bind:value={customPrompt}
            placeholder="例如：Warm golden highlights, rich cyan shadow toe, vintage analog print density"
          ></textarea>
        </div>

        <div class="input-group">
          <label for="custom-lut-scene" class="input-label font-mono">適用建議場景</label>
          <input
            id="custom-lut-scene"
            type="text"
            class="archival-input font-mono"
            bind:value={customScene}
            placeholder="例如：金色時刻 / 人文街拍 / 室內人像"
          />
        </div>
      </div>

      <div class="modal-actions hairline-t">
        <button type="button" class="tool-btn" onclick={() => showImportModal = false}>
          取消
        </button>
        <button type="button" class="archival-btn-primary" onclick={confirmImport}>
          <span class="material-symbols-outlined" style="font-size: 15px;">check</span>
          <span>確認匯入並註冊至 AI</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- 編輯自訂 LUT 彈窗 (Modal) -->
{#if showEditModal && editingRecord}
  <div class="modal-backdrop">
    <div class="import-modal-card hairline-all font-mono">
      <div class="modal-header hairline-b">
        <span class="font-headline modal-title">編輯自訂 LUT 與 AI 連動指令</span>
        <button type="button" class="close-btn" onclick={() => showEditModal = false}>
          <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
        </button>
      </div>

      <div class="modal-body font-body">
        <div class="meta-preview hairline-all">
          <span class="meta-badge">LUT ID：{editingRecord.id}</span>
          <span class="meta-badge">維度尺寸：{editingRecord.lutSize}×{editingRecord.lutSize}×{editingRecord.lutSize}</span>
        </div>

        <div class="input-group">
          <label for="edit-lut-title" class="input-label font-mono">風格顯示名稱</label>
          <input
            id="edit-lut-title"
            type="text"
            class="archival-input font-mono"
            bind:value={editTitle}
            placeholder="風格顯示名稱"
          />
        </div>

        <!-- 編輯代表色 -->
        <div class="input-group">
          <label for="edit-color-picker" class="input-label font-mono">
            <span>風格特徵光譜色 (Accent Color)</span>
            <span class="label-hint">調整代表色以匹配卡片裝飾色條</span>
          </label>
          <div class="color-picker-row hairline-all">
            <div class="spectrum-preview-box">
              <span class="swatch" style:background={editAccent}></span>
              <span class="swatch" style:background="color-mix(in srgb, {editAccent} 70%, #000)"></span>
              <span class="swatch" style:background="color-mix(in srgb, {editAccent} 40%, #fff)"></span>
              <span class="swatch" style:background="#202227"></span>
            </div>
            <div class="color-control">
              <input id="edit-color-picker" type="color" bind:value={editAccent} class="color-native-input" />
              <span class="color-hex-label font-mono">{editAccent.toUpperCase()}</span>
            </div>
          </div>
          <div class="swatch-palette-row">
            {#each PALETTE_SWATCHES as sw}
              <button
                type="button"
                class="swatch-bubble"
                class:active={editAccent.toLowerCase() === sw.color.toLowerCase()}
                style:background={sw.color}
                title={sw.name}
                onclick={() => (editAccent = sw.color)}
              ></button>
            {/each}
          </div>
        </div>

        <!-- 編輯預設強度 -->
        <div class="input-group">
          <div class="slider-header font-mono">
            <label for="edit-lut-ratio" class="input-label">預設套用強度 (LUT RATIO)</label>
            <span class="ratio-val amber font-mono">{Math.round(editLutRatio * 100)}%</span>
          </div>
          <input
            id="edit-lut-ratio"
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            bind:value={editLutRatio}
            class="archival-range-slider"
          />
        </div>

        <div class="input-group">
          <label for="edit-lut-prompt" class="input-label font-mono">
            <span>AI 連動光學風格指令 (Prompt Directive)</span>
            <span class="label-hint">微調此指令將直接影響 AI 顯影推論時的光學平衡與色彩科學決策</span>
          </label>
          <textarea
            id="edit-lut-prompt"
            class="archival-textarea font-mono"
            rows="3"
            bind:value={editPrompt}
            placeholder="例如：Warm golden highlights, rich cyan shadow toe, vintage analog print density"
          ></textarea>
        </div>

        <div class="input-group">
          <label for="edit-lut-scene" class="input-label font-mono">適用建議場景</label>
          <input
            id="edit-lut-scene"
            type="text"
            class="archival-input font-mono"
            bind:value={editScene}
            placeholder="例如：金色時刻 / 人文街拍 / 室內人像"
          />
        </div>
      </div>

      <div class="modal-actions hairline-t">
        <button type="button" class="tool-btn" onclick={() => showEditModal = false}>
          取消
        </button>
        <button type="button" class="archival-btn-primary" onclick={confirmEdit}>
          <span class="material-symbols-outlined" style="font-size: 15px;">save</span>
          <span>儲存修改並更新 AI 連動</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .profiles-viewport {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background-color: var(--canvas-base);
    overflow: hidden;
  }

  .profiles-toolbar {
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

  .toast-chip {
    font-size: 11px;
    color: var(--amber-highlight);
    background-color: rgba(226, 157, 82, 0.12);
    padding: 4px 8px;
    border-radius: var(--radius-xs);
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
    border-color: var(--parchment-dim);
  }

  .tool-btn.highlight {
    border-color: rgba(226, 157, 82, 0.4);
    color: var(--amber-highlight);
  }

  .tool-btn.highlight:hover {
    background-color: rgba(226, 157, 82, 0.15);
    border-color: var(--amber-highlight);
  }

  .profiles-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  .profiles-deck-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 20px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .profile-deck-card {
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .profile-deck-card.is-custom {
    border-color: rgba(191, 161, 95, 0.4);
    background-color: rgba(26, 27, 32, 0.95);
  }

  .profile-deck-card:hover {
    border-color: var(--parchment-dim);
    transform: translateY(-2px);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4);
  }

  .profile-deck-card.active {
    border-color: var(--amber-highlight);
    box-shadow: 0 0 0 1px var(--amber-highlight), 0 12px 28px rgba(0, 0, 0, 0.5);
  }

  .badge-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .badge-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .action-icon-btn {
    background: transparent;
    border: none;
    color: var(--parchment-dim);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: var(--radius-xs);
    transition: all 0.15s ease;
  }

  .action-icon-btn:hover {
    background-color: var(--surface-overlay);
    color: var(--parchment-bright);
  }

  .action-icon-btn.edit-btn:hover {
    color: var(--amber-highlight);
  }

  .action-icon-btn.del-btn:hover {
    color: #e55353;
  }

  .badge-pill {
    font-size: 10px;
    color: var(--parchment-dim);
    background-color: var(--surface-elevated);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
  }

  .badge-pill.custom-badge {
    color: #e29d52;
    background-color: rgba(226, 157, 82, 0.15);
    border: 1px solid rgba(226, 157, 82, 0.3);
  }

  .active-pill {
    font-size: 10px;
    color: var(--amber-highlight);
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .active-pill .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--amber-highlight);
  }

  .profile-card-title {
    font-size: 18px;
    color: var(--parchment-bright);
    margin: 0 0 6px 0;
  }

  .profile-card-tone {
    font-size: 12px;
    color: var(--parchment-muted);
    line-height: 1.5;
    margin: 0;
  }

  .color-spectrum-strip {
    display: flex;
    height: 24px;
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .swatch {
    flex: 1;
    height: 100%;
  }

  .specs-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    background-color: var(--surface-elevated);
    padding: 10px 12px;
    border-radius: var(--radius-xs);
  }

  .spec-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .spec-label {
    font-size: 9px;
    color: var(--parchment-dim);
    letter-spacing: 0.05em;
  }

  .spec-val {
    font-size: 11px;
    color: var(--parchment-bright);
  }

  .spec-val.amber {
    color: var(--amber-highlight);
  }

  .deck-actions {
    display: flex;
    gap: 8px;
    margin-top: auto;
  }

  .deck-actions .archival-btn-primary {
    flex: 2;
    padding: 8px 12px;
    font-size: 11px;
  }

  .deck-actions .tool-btn {
    flex: 1;
    justify-content: center;
  }

  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Modal 樣式 */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
  }

  .import-modal-card {
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    width: 100%;
    max-width: 540px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
  }

  .modal-title {
    font-size: 15px;
    color: var(--parchment-bright);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--parchment-dim);
    cursor: pointer;
  }

  .close-btn:hover {
    color: var(--parchment-bright);
  }

  .modal-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .meta-preview {
    display: flex;
    gap: 10px;
    padding: 8px 12px;
    background-color: var(--surface-elevated);
    border-radius: var(--radius-xs);
  }

  .meta-badge {
    font-size: 11px;
    color: var(--amber-highlight);
  }

  .input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .input-label {
    font-size: 11px;
    color: var(--parchment-bright);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .label-hint {
    font-size: 10px;
    color: var(--parchment-dim);
  }

  .color-picker-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background-color: var(--canvas-base);
    border-radius: var(--radius-xs);
    gap: 12px;
  }

  .spectrum-preview-box {
    display: flex;
    flex: 1;
    height: 22px;
    border-radius: var(--radius-xs);
    overflow: hidden;
  }

  .color-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .color-native-input {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: var(--radius-xs);
    background: transparent;
    cursor: pointer;
    padding: 0;
  }

  .color-hex-label {
    font-size: 11px;
    color: var(--parchment-muted);
  }

  .swatch-palette-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    padding-top: 4px;
  }

  .swatch-bubble {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid var(--hairline-slate);
    cursor: pointer;
    transition: transform 0.15s ease, border-color 0.15s ease;
    padding: 0;
  }

  .swatch-bubble:hover {
    transform: scale(1.15);
    border-color: var(--parchment-bright);
  }

  .swatch-bubble.active {
    box-shadow: 0 0 0 2px var(--surface-panel), 0 0 0 4px var(--amber-highlight);
    transform: scale(1.1);
  }

  .slider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .ratio-val {
    font-size: 12px;
  }

  .archival-range-slider {
    width: 100%;
    accent-color: var(--amber-highlight);
    cursor: pointer;
  }

  .archival-input, .archival-textarea {
    background-color: var(--canvas-base);
    border: 1px solid var(--hairline-slate);
    color: var(--parchment-bright);
    padding: 8px 12px;
    border-radius: var(--radius-xs);
    font-size: 12px;
  }

  .archival-input:focus, .archival-textarea:focus {
    border-color: var(--amber-highlight);
    outline: none;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 20px;
  }
</style>
