<script lang="ts">
  import { onMount } from 'svelte';

  // Active module tabs
  type ModuleTab = 'catalog' | 'retouch' | 'profiles' | 'export' | 'devices';
  let activeTab = $state<ModuleTab>('retouch');

  // Sample Photographic Plates (Simulating 50ms embedded extraction from DCIM)
  interface PhotoPlate {
    id: string;
    frameNo: string;
    filename: string;
    camera: string;
    lens: string;
    iso: number;
    shutter: string;
    aperture: string;
    focalLength: string;
    thumbnail: string;
    sceneTag: string;
    selected: boolean;
    appliedProfile: string;
  }

  let photoPlates = $state<PhotoPlate[]>([
    {
      id: 'p1',
      frameNo: '01A',
      filename: 'DSC08291.ARW',
      camera: 'Sony Alpha 7R V',
      lens: 'FE 50mm F1.2 GM',
      iso: 400,
      shutter: '1/320s',
      aperture: 'f/1.4',
      focalLength: '50mm',
      thumbnail: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=600&auto=format&fit=crop&q=80',
      sceneTag: '城市街景 · 暮光',
      selected: true,
      appliedProfile: 'Profile_01_MatteShadow'
    },
    {
      id: 'p2',
      frameNo: '02A',
      filename: 'DSC08292.ARW',
      camera: 'Sony Alpha 7R V',
      lens: 'FE 50mm F1.2 GM',
      iso: 800,
      shutter: '1/250s',
      aperture: 'f/1.8',
      focalLength: '50mm',
      thumbnail: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
      sceneTag: '室內空間 · 暖光',
      selected: false,
      appliedProfile: 'Profile_03_TungstenSoft'
    },
    {
      id: 'p3',
      frameNo: '03A',
      filename: 'DSC08293.ARW',
      camera: 'Sony Alpha 7R V',
      lens: 'FE 24-70mm F2.8 GM II',
      iso: 100,
      shutter: '1/800s',
      aperture: 'f/4.0',
      focalLength: '35mm',
      thumbnail: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&auto=format&fit=crop&q=80',
      sceneTag: '幾何建築 · 冷冽',
      selected: false,
      appliedProfile: 'Profile_02_TealEmerald'
    },
    {
      id: 'p4',
      frameNo: '04A',
      filename: 'DSC08294.ARW',
      camera: 'Sony Alpha 7R V',
      lens: 'FE 85mm F1.4 GM',
      iso: 200,
      shutter: '1/500s',
      aperture: 'f/1.4',
      focalLength: '85mm',
      thumbnail: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
      sceneTag: '紀實人像 · 自然光',
      selected: false,
      appliedProfile: 'Profile_03_TungstenSoft'
    },
    {
      id: 'p5',
      frameNo: '05A',
      filename: 'DSC08295.ARW',
      camera: 'Sony Alpha 7R V',
      lens: 'FE 24-70mm F2.8 GM II',
      iso: 1600,
      shutter: '1/160s',
      aperture: 'f/2.8',
      focalLength: '70mm',
      thumbnail: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80',
      sceneTag: '光影交錯 · 高反差',
      selected: false,
      appliedProfile: 'Profile_04_HighContrastMono'
    }
  ]);

  let activePhoto = $state<PhotoPlate>(photoPlates[0]);

  // Darkroom Tuning Sliders
  let exposure = $state<number>(0.15);
  let shadowLift = $state<number>(0.24);
  let lutIntensity = $state<number>(0.85);
  let colorTemp = $state<number>(5400);
  let showABComparison = $state<boolean>(false);

  // De-identified 3D LUT Profiles
  const profiles = [
    {
      id: 'Profile_01_MatteShadow',
      title: 'MatteShadow · 啞光微膠卷',
      tone: '低黑階抬升 · 低飽和綠色調 · 柔和高反差',
      badge: 'FILM_LOOK_01',
      accent: '#6082b6'
    },
    {
      id: 'Profile_02_TealEmerald',
      title: 'TealEmerald · 冷青翡翠',
      tone: '陰影注入冷青 · 高光溫潤偏暖 · 膚色隔離保護',
      badge: 'COLOR_GRADE_02',
      accent: '#4b6b94'
    },
    {
      id: 'Profile_03_TungstenSoft',
      title: 'TungstenSoft · 溫潤人像',
      tone: '鎢絲燈光感 · 洋紅微量相移 · 高光滾降過渡',
      badge: 'PORTRAIT_03',
      accent: '#d4a373'
    },
    {
      id: 'Profile_04_HighContrastMono',
      title: 'HighContrastMono · 高反差單色',
      tone: '紅橙濾鏡感 · 暗部深邃沈穩 · 經典銀鹽紀實',
      badge: 'MONO_SILVER_04',
      accent: '#e8e4dc'
    }
  ];

  // AI Inference Simulation
  let isAiAnalyzing = $state<boolean>(false);
  let aiConfidence = $state<number>(0.94);
  let aiSuggestedScene = $state<string>('urban_geometry / outdoor_street');
  let aiRecommendedProfile = $state<string>('Profile_01_MatteShadow');

  function selectPhoto(plate: PhotoPlate) {
    activePhoto = plate;
    photoPlates.forEach(p => p.selected = (p.id === plate.id));
  }

  function applyProfile(profileId: string) {
    activePhoto.appliedProfile = profileId;
    if (profileId === 'Profile_01_MatteShadow') {
      exposure = 0.1;
      shadowLift = 0.25;
      lutIntensity = 0.85;
    } else if (profileId === 'Profile_02_TealEmerald') {
      exposure = -0.1;
      shadowLift = 0.15;
      lutIntensity = 0.9;
    } else if (profileId === 'Profile_03_TungstenSoft') {
      exposure = 0.2;
      shadowLift = 0.3;
      lutIntensity = 0.8;
    } else if (profileId === 'Profile_04_HighContrastMono') {
      exposure = 0.0;
      shadowLift = -0.1;
      lutIntensity = 1.0;
    }
  }

  function runAiAnalysis() {
    isAiAnalyzing = true;
    setTimeout(() => {
      isAiAnalyzing = false;
      aiConfidence = 0.96;
      aiSuggestedScene = 'urban_street_ambient (黃昏街景光線)';
      aiRecommendedProfile = 'Profile_01_MatteShadow';
      applyProfile(aiRecommendedProfile);
    }, 600);
  }

  // Export Pipeline State
  let exportMode = $state<'modeA' | 'modeB'>('modeA');
  let exportProgress = $state<number>(100);
  let isExporting = $state<boolean>(false);
  let exportNotice = $state<string>('');

  function triggerExport() {
    isExporting = true;
    exportProgress = 0;
    exportNotice = '著色器離屏採樣中...';
    const interval = setInterval(() => {
      exportProgress += 25;
      if (exportProgress >= 100) {
        clearInterval(interval);
        isExporting = false;
        exportNotice = exportMode === 'modeA' 
          ? '已寫入系統相簿 (88ms 極速完成)' 
          : '16-bit 滿血無損 JPEG 已儲存至典藏目錄 (420ms)';
        setTimeout(() => { exportNotice = ''; }, 3500);
      }
    }, 50);
  }
</script>

<div class="workspace-container">
  <!-- TOP HEADER / TELEMETRY STATUS BAR -->
  <header class="top-nav hairline-b">
    <div class="brand-block">
      <span class="material-symbols-outlined brand-icon">lens_blur</span>
      <div class="brand-titles">
        <h1 class="brand-title font-headline">大相無形</h1>
        <span class="brand-sub font-mono">SLIPKNOTTING ON HEAVEN'S DOOR · V2.0</span>
      </div>
    </div>

    <!-- Active Hardware Ingestion Indicator -->
    <div class="device-telemetry hairline-all">
      <span class="status-dot"></span>
      <span class="device-name font-mono">Sony A7R V // Type-C 隨插即讀</span>
      <span class="divider">|</span>
      <span class="device-metric font-mono">342 幀 61MP RAW</span>
    </div>

    <!-- Right Controls -->
    <div class="top-actions">
      <div class="archival-chip font-mono">
        <span class="material-symbols-outlined" style="font-size: 14px;">memory</span>
        GPU SHADER 60FPS
      </div>
      <button 
        class="archival-btn-primary" 
        onclick={triggerExport}
        disabled={isExporting}
      >
        <span class="material-symbols-outlined" style="font-size: 16px;">
          {exportMode === 'modeA' ? 'bolt' : 'hd'}
        </span>
        <span>{isExporting ? '匯出中...' : '即時匯出'}</span>
      </button>
    </div>
  </header>

  <!-- MAIN CURATORIAL WORKSPACE -->
  <main class="main-body">
    <!-- LEFT SIDEBAR: WORKFLOW MODULES -->
    <aside class="left-sidebar hairline-r">
      <div class="sidebar-heading font-mono">WORKFLOW MODULES</div>
      
      <nav class="nav-menu">
        <button 
          class="nav-item" 
          class:active={activeTab === 'catalog'} 
          onclick={() => activeTab = 'catalog'}
        >
          <span class="material-symbols-outlined">grid_view</span>
          <span class="nav-label">膠卷目錄與挑圖</span>
          <span class="nav-badge font-mono">342</span>
        </button>

        <button 
          class="nav-item" 
          class:active={activeTab === 'retouch'} 
          onclick={() => activeTab = 'retouch'}
        >
          <span class="material-symbols-outlined">tonality</span>
          <span class="nav-label">單張暗房精修</span>
        </button>

        <button 
          class="nav-item" 
          class:active={activeTab === 'profiles'} 
          onclick={() => activeTab = 'profiles'}
        >
          <span class="material-symbols-outlined">palette</span>
          <span class="nav-label">3D LUT 風格庫</span>
          <span class="nav-badge font-mono">4</span>
        </button>

        <button 
          class="nav-item" 
          class:active={activeTab === 'export'} 
          onclick={() => activeTab = 'export'}
        >
          <span class="material-symbols-outlined">output_circle</span>
          <span class="nav-label">批次匯出管線</span>
        </button>

        <button 
          class="nav-item" 
          class:active={activeTab === 'devices'} 
          onclick={() => activeTab = 'devices'}
        >
          <span class="material-symbols-outlined">settings_input_component</span>
          <span class="nav-label">設備與存儲設定</span>
        </button>
      </nav>

      <!-- AI Scene Assistant Quick Dock -->
      <div class="ai-assistant-dock hairline-t">
        <div class="ai-header">
          <span class="material-symbols-outlined ai-sparkle">auto_awesome</span>
          <span class="font-headline ai-title">AI 視覺判讀</span>
        </div>
        <p class="ai-desc">512px 微型 Payload · 本機安全金鑰</p>
        
        <div class="ai-status-card hairline-all">
          <div class="ai-row">
            <span class="ai-label font-mono">SCENE</span>
            <span class="ai-val font-mono">{aiSuggestedScene}</span>
          </div>
          <div class="ai-row">
            <span class="ai-label font-mono">CONFIDENCE</span>
            <span class="ai-val font-mono amber">{(aiConfidence * 100).toFixed(0)}%</span>
          </div>
          <div class="ai-row">
            <span class="ai-label font-mono">MATCH</span>
            <span class="ai-val font-mono indigo">{activePhoto.appliedProfile}</span>
          </div>
        </div>

        <button 
          class="archival-btn-secondary w-full" 
          onclick={runAiAnalysis}
          disabled={isAiAnalyzing}
        >
          <span class="material-symbols-outlined" style="font-size: 16px;">
            {isAiAnalyzing ? 'progress_activity' : 'psychology'}
          </span>
          <span>{isAiAnalyzing ? '正在視覺判讀...' : '重新分析當前幀'}</span>
        </button>
      </div>
    </aside>

    <!-- CENTER STAGE: PHOTOGRAPHIC PLATE VIEWPORT -->
    <section class="center-stage">
      <!-- Image Stage Container -->
      <div class="photo-stage-viewport">
        <!-- Notification Banner -->
        {#if exportNotice}
          <div class="export-notice-banner hairline-all font-mono">
            <span class="material-symbols-outlined" style="color: var(--amber-highlight); font-size: 18px;">check_circle</span>
            {exportNotice}
          </div>
        {/if}

        <div class="plate-canvas-wrapper hairline-all">
          <img 
            src={activePhoto.thumbnail} 
            alt={activePhoto.filename} 
            class="plate-render-img"
            style:filter={showABComparison 
              ? 'none' 
              : `brightness(${1 + exposure * 0.4}) contrast(${1 + (lutIntensity - 0.5) * 0.3})`}
          />

          <!-- Overlaid Plate Framing Tag -->
          <div class="plate-tag-bar font-mono">
            <div class="plate-id-badge">
              <span class="film-code">PLATE #{activePhoto.frameNo}</span>
              <span class="film-file">{activePhoto.filename}</span>
            </div>
            <div class="plate-profile-badge">
              <span class="profile-dot" style:background={activePhoto.appliedProfile ? 'var(--amber-highlight)' : 'var(--parchment-dim)'}></span>
              <span>{activePhoto.appliedProfile}</span>
            </div>
          </div>

          <!-- A/B Comparison Toggle Floater -->
          <button 
            type="button"
            class="ab-toggle-btn hairline-all font-mono" 
            onmousedown={() => showABComparison = true}
            onmouseup={() => showABComparison = false}
            onmouseleave={() => showABComparison = false}
          >
            <span class="material-symbols-outlined" style="font-size: 15px;">compare</span>
            <span>{showABComparison ? '原始本相 (RAW)' : '按住 A/B 比對'}</span>
          </button>
        </div>
      </div>

      <!-- PERSISTENT BOTTOM CONTACT SHEET LIGHT-TABLE STRIP -->
      <footer class="contact-sheet-strip hairline-t">
        <div class="strip-header font-mono">
          <span class="strip-label">CONTACT SHEET // EXPOSURE RACK</span>
          <span class="strip-count">{photoPlates.length} FRAMES</span>
        </div>
        <div class="strip-frames-scroll">
          {#each photoPlates as plate}
            <button 
              type="button"
              class="film-frame-card" 
              class:selected={plate.selected}
              onclick={() => selectPhoto(plate)}
            >
              <div class="film-frame-outer">
                <img src={plate.thumbnail} alt={plate.filename} class="film-frame-thumb" />
              </div>
              <div class="film-frame-meta font-mono">
                <span class="frame-num">{plate.frameNo}</span>
                <span class="frame-tag">{plate.camera.split(' ')[0]}</span>
              </div>
            </button>
          {/each}
        </div>
      </footer>
    </section>

    <!-- RIGHT SIDEBAR: DARKROOM TELEMETRY & COLOR DOCK -->
    <aside class="right-telemetry hairline-l">
      <!-- EXIF Optical Telemetry -->
      <div class="telemetry-box hairline-b">
        <div class="box-title font-mono">EXIF OPTICAL TELEMETRY</div>
        <div class="optical-grid font-mono">
          <div class="optical-chip">
            <span class="opt-label">APERTURE</span>
            <span class="opt-val">{activePhoto.aperture}</span>
          </div>
          <div class="optical-chip">
            <span class="opt-label">SHUTTER</span>
            <span class="opt-val">{activePhoto.shutter}</span>
          </div>
          <div class="optical-chip">
            <span class="opt-label">ISO SPEED</span>
            <span class="opt-val amber">ISO {activePhoto.iso}</span>
          </div>
          <div class="optical-chip">
            <span class="opt-label">FOCAL</span>
            <span class="opt-val">{activePhoto.focalLength}</span>
          </div>
        </div>
        <div class="lens-line font-mono">
          <span class="material-symbols-outlined" style="font-size: 14px;">camera_alt</span>
          <span class="truncate">{activePhoto.lens}</span>
        </div>
      </div>

      <!-- Color Adjustment Sliders -->
      <div class="telemetry-box hairline-b">
        <div class="box-title font-mono">TUNING CONTROLS</div>

        <!-- Slider 1: Exposure -->
        <div class="control-row">
          <div class="control-header font-mono">
            <span>EXPOSURE (EV)</span>
            <span class="control-val">{exposure > 0 ? `+${exposure.toFixed(2)}` : exposure.toFixed(2)}</span>
          </div>
          <input 
            type="range" 
            min="-2.0" 
            max="2.0" 
            step="0.05" 
            bind:value={exposure} 
            class="darkroom-slider"
          />
        </div>

        <!-- Slider 2: Shadow Lift -->
        <div class="control-row">
          <div class="control-header font-mono">
            <span>SHADOW LIFT</span>
            <span class="control-val">{Math.round(shadowLift * 100)}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            bind:value={shadowLift} 
            class="darkroom-slider"
          />
        </div>

        <!-- Slider 3: LUT Intensity -->
        <div class="control-row">
          <div class="control-header font-mono">
            <span>LUT INTENSITY</span>
            <span class="control-val amber">{Math.round(lutIntensity * 100)}%</span>
          </div>
          <input 
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            bind:value={lutIntensity} 
            class="darkroom-slider"
          />
        </div>

        <!-- Slider 4: Color Temp -->
        <div class="control-row">
          <div class="control-header font-mono">
            <span>KELVIN SCALE</span>
            <span class="control-val">{colorTemp}K</span>
          </div>
          <input 
            type="range" 
            min="2800" 
            max="8500" 
            step="50" 
            bind:value={colorTemp} 
            class="darkroom-slider"
          />
        </div>
      </div>

      <!-- 3D LUT Vault Quick Select -->
      <div class="telemetry-box">
        <div class="box-title font-mono">3D LUT PROFILES (ANONYMIZED)</div>
        <div class="profile-cards-list">
          {#each profiles as prof}
            <button 
              type="button"
              class="profile-card hairline-all" 
              class:active={activePhoto.appliedProfile === prof.id}
              onclick={() => applyProfile(prof.id)}
            >
              <div class="prof-card-top">
                <span class="prof-title font-headline">{prof.title}</span>
                <span class="prof-badge font-mono">{prof.badge}</span>
              </div>
              <div class="prof-tone font-body">{prof.tone}</div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Export Mode Toggle -->
      <div class="telemetry-box hairline-t mt-auto">
        <div class="box-title font-mono">EXPORT PIPELINE SPEC</div>
        <div class="export-mode-toggle hairline-all">
          <button 
            class="mode-btn font-mono" 
            class:active={exportMode === 'modeA'}
            onclick={() => exportMode = 'modeA'}
          >
            MODE A (100ms 極速)
          </button>
          <button 
            class="mode-btn font-mono" 
            class:active={exportMode === 'modeB'}
            onclick={() => exportMode = 'modeB'}
          >
            MODE B (16-bit 滿血)
          </button>
        </div>
        <div class="export-meta-desc font-body">
          {exportMode === 'modeA' 
            ? '離屏 WebGL 重新採樣，直出 95% 高品質 JPEG，極速省電。' 
            : '調用原生 LibRaw 16-bit 解碼矩陣運算，高解析典藏交付。'}
        </div>
      </div>
    </aside>
  </main>
</div>

<style>
  .workspace-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background-color: var(--canvas-base);
    color: var(--parchment-bright);
    overflow: hidden;
  }

  /* TOP NAVIGATION */
  .top-nav {
    height: 52px;
    background-color: var(--surface-panel);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }

  .brand-block {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .brand-icon {
    color: var(--amber-highlight);
    font-size: 24px;
  }
  .brand-titles {
    display: flex;
    flex-direction: column;
  }
  .brand-title {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: 0.05em;
  }
  .brand-sub {
    font-size: 9px;
    color: var(--parchment-dim);
    letter-spacing: 0.08em;
  }

  .device-telemetry {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 4px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--primary-indigo);
    box-shadow: 0 0 6px var(--primary-indigo);
  }
  .device-name {
    color: var(--parchment-bright);
  }
  .divider {
    color: var(--parchment-ghost);
  }
  .device-metric {
    color: var(--amber-highlight);
  }

  .top-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* MAIN WORKSPACE LAYOUT */
  .main-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* LEFT SIDEBAR */
  .left-sidebar {
    width: var(--sidebar-width);
    background-color: var(--surface-panel);
    display: flex;
    flex-direction: column;
    padding: 14px 10px;
    flex-shrink: 0;
  }

  .sidebar-heading {
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--parchment-dim);
    padding: 0 8px 10px 8px;
  }

  .nav-menu {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: var(--parchment-muted);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    width: 100%;
  }
  .nav-item:hover {
    background-color: var(--surface-elevated);
    color: var(--parchment-bright);
  }
  .nav-item.active {
    background-color: var(--surface-overlay);
    color: var(--parchment-bright);
    border-left: 2px solid var(--primary-indigo);
  }
  .nav-label {
    flex: 1;
  }
  .nav-badge {
    font-size: 10px;
    padding: 2px 6px;
    background-color: var(--canvas-base);
    border-radius: var(--radius-xs);
    color: var(--parchment-dim);
  }

  .ai-assistant-dock {
    margin-top: auto;
    padding-top: 14px;
  }
  .ai-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }
  .ai-sparkle {
    color: var(--amber-highlight);
    font-size: 16px;
  }
  .ai-title {
    font-size: 13px;
    font-weight: 600;
  }
  .ai-desc {
    font-size: 11px;
    color: var(--parchment-dim);
    margin-bottom: 10px;
  }
  .ai-status-card {
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    margin-bottom: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ai-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }
  .ai-label {
    color: var(--parchment-dim);
  }
  .ai-val {
    color: var(--parchment-bright);
  }
  .ai-val.amber {
    color: var(--amber-highlight);
  }
  .ai-val.indigo {
    color: var(--primary-indigo);
  }
  .w-full {
    width: 100%;
    justify-content: center;
  }

  /* CENTER STAGE */
  .center-stage {
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: var(--canvas-base);
    overflow: hidden;
    position: relative;
  }

  .photo-stage-viewport {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    position: relative;
    overflow: hidden;
  }

  .export-notice-banner {
    position: absolute;
    top: 16px;
    background-color: var(--surface-overlay);
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--parchment-bright);
    z-index: 10;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  }

  .plate-canvas-wrapper {
    position: relative;
    max-height: 100%;
    max-width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--surface-panel);
    border-radius: 0; /* Strictly 0px sharp frame per Alexandria specs */
  }

  .plate-render-img {
    max-height: calc(100vh - 200px);
    max-width: 100%;
    object-fit: contain;
    display: block;
    user-select: none;
    -webkit-user-drag: none;
    transition: filter 0.1s ease;
  }

  .plate-tag-bar {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    display: flex;
    justify-content: space-between;
    pointer-events: none;
  }
  .plate-id-badge {
    background-color: rgba(18, 19, 22, 0.85);
    border: 1px solid var(--hairline-slate);
    padding: 4px 8px;
    border-radius: var(--radius-xs);
    font-size: 11px;
    display: flex;
    gap: 8px;
  }
  .film-code {
    color: var(--amber-highlight);
  }
  .film-file {
    color: var(--parchment-bright);
  }

  .plate-profile-badge {
    background-color: rgba(18, 19, 22, 0.85);
    border: 1px solid var(--hairline-slate);
    padding: 4px 8px;
    border-radius: var(--radius-xs);
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--parchment-bright);
  }
  .profile-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .ab-toggle-btn {
    position: absolute;
    bottom: 12px;
    right: 12px;
    background-color: rgba(24, 25, 29, 0.9);
    color: var(--parchment-bright);
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    transition: all 0.15s ease;
  }
  .ab-toggle-btn:hover {
    background-color: var(--primary-indigo);
    color: var(--canvas-base);
  }

  /* BOTTOM CONTACT SHEET STRIP */
  .contact-sheet-strip {
    height: var(--contact-strip-height);
    background-color: var(--surface-panel);
    display: flex;
    flex-direction: column;
    padding: 6px 12px;
    flex-shrink: 0;
  }
  .strip-header {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: var(--parchment-dim);
    margin-bottom: 4px;
    letter-spacing: 0.08em;
  }
  .strip-frames-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .film-frame-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    flex-shrink: 0;
    background: transparent;
    border: none;
    padding: 0;
    outline: none;
  }
  .film-frame-outer {
    width: 64px;
    height: 48px;
    border: 1px solid var(--hairline-slate);
    overflow: hidden;
    position: relative;
    border-radius: 0;
  }
  .film-frame-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .film-frame-card.selected .film-frame-outer {
    border: 1.5px solid var(--amber-highlight);
    outline: 1px solid var(--canvas-base);
  }
  .film-frame-meta {
    display: flex;
    gap: 4px;
    font-size: 9px;
    color: var(--parchment-dim);
    margin-top: 2px;
  }
  .film-frame-card.selected .frame-num {
    color: var(--amber-highlight);
    font-weight: 600;
  }

  /* RIGHT TELEMETRY SIDEBAR */
  .right-telemetry {
    width: var(--telemetry-width);
    background-color: var(--surface-panel);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .telemetry-box {
    padding: 14px;
  }
  .box-title {
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--parchment-dim);
    margin-bottom: 10px;
  }

  .optical-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-bottom: 8px;
  }
  .optical-chip {
    background-color: var(--surface-elevated);
    border: 1px solid var(--hairline-slate);
    padding: 6px 8px;
    border-radius: var(--radius-xs);
    display: flex;
    flex-direction: column;
  }
  .opt-label {
    font-size: 9px;
    color: var(--parchment-dim);
  }
  .opt-val {
    font-size: 13px;
    color: var(--parchment-bright);
  }
  .opt-val.amber {
    color: var(--amber-highlight);
  }
  .lens-line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--parchment-muted);
  }
  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* CONTROLS */
  .control-row {
    margin-bottom: 12px;
  }
  .control-header {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--parchment-muted);
    margin-bottom: 4px;
  }
  .control-val {
    color: var(--parchment-bright);
  }
  .control-val.amber {
    color: var(--amber-highlight);
  }

  /* PROFILES LIST */
  .profile-cards-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .profile-card {
    background-color: var(--surface-elevated);
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid var(--hairline-slate);
    width: 100%;
    text-align: left;
    outline: none;
    font-family: inherit;
  }
  .profile-card:hover {
    background-color: var(--surface-overlay);
  }
  .profile-card.active {
    border-color: var(--amber-highlight);
    background-color: var(--surface-overlay);
  }
  .prof-card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 3px;
  }
  .prof-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--parchment-bright);
  }
  .prof-badge {
    font-size: 9px;
    color: var(--parchment-dim);
    background-color: var(--canvas-base);
    padding: 1px 4px;
    border-radius: var(--radius-xs);
  }
  .prof-tone {
    font-size: 10px;
    color: var(--parchment-muted);
    line-height: 1.3;
  }

  /* EXPORT TOGGLE */
  .export-mode-toggle {
    display: flex;
    background-color: var(--surface-elevated);
    border-radius: var(--radius-sm);
    padding: 2px;
    margin-bottom: 8px;
  }
  .mode-btn {
    flex: 1;
    background: transparent;
    border: none;
    padding: 6px 4px;
    font-size: 10px;
    color: var(--parchment-muted);
    cursor: pointer;
    border-radius: var(--radius-xs);
    transition: all 0.15s ease;
  }
  .mode-btn.active {
    background-color: var(--primary-indigo);
    color: var(--canvas-base);
    font-weight: 600;
  }
  .export-meta-desc {
    font-size: 10px;
    color: var(--parchment-dim);
    line-height: 1.4;
  }
  .mt-auto {
    margin-top: auto;
  }
</style>
