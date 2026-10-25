<script lang="ts">
  interface ProfileItem {
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
  }

  interface Props {
    profiles: ProfileItem[];
    activeProfileId: string;
    activePhotoTitle?: string;
    onApplyProfile: (profileId: string) => void;
    onApplyToAll: (profileId: string) => void;
  }

  let {
    profiles,
    activeProfileId,
    activePhotoTitle = '尚未選取底片',
    onApplyProfile,
    onApplyToAll
  }: Props = $props();

  let toastMessage = $state<string>('');

  function handleImportCube() {
    toastMessage = '已就緒：支援讀取標準 Adobe / DaVinci Resolve .cube 3D LUT 紋理';
    setTimeout(() => { toastMessage = ''; }, 3000);
  }

  function handleApplyAll(id: string) {
    onApplyToAll(id);
    toastMessage = `已將「${profiles.find(p => p.id === id)?.title}」批次指定至全相卷底片`;
    setTimeout(() => { toastMessage = ''; }, 3000);
  }
</script>

<div class="profiles-viewport">
  <!-- HEADER -->
  <header class="profiles-toolbar hairline-b font-mono">
    <div class="header-left">
      <span class="tool-title font-headline">3D LUT 去識別化風格典藏庫</span>
      <span class="counter-badge">{profiles.length} CURATED PROFILES</span>
    </div>
    <div class="header-right">
      {#if toastMessage}
        <span class="toast-chip font-mono">{toastMessage}</span>
      {/if}
      <button type="button" class="tool-btn" onclick={handleImportCube}>
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
        >
          <!-- Card Header & Badge -->
          <div class="deck-top">
            <div class="badge-row font-mono">
              <span class="badge-pill">{prof.badge}</span>
              {#if activeProfileId === prof.id}
                <span class="active-pill font-mono">
                  <span class="dot"></span>
                  目前套用
                </span>
              {/if}
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
              <span class="spec-val amber">{Math.round(prof.lutIntensityDefault * 100)}%</span>
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

  .badge-pill {
    font-size: 10px;
    color: var(--parchment-dim);
    background-color: var(--surface-elevated);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
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
</style>
