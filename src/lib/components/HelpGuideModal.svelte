<script lang="ts">
  interface Props {
    isOpen?: boolean;
    onClose: () => void;
  }

  let { isOpen = $bindable(false), onClose }: Props = $props();

  let activeSection = $state<'guide' | 'workflow'>('guide');
  let isMobile = $state<boolean>(false);

  interface MobileGuideItem {
    action: string;
    title: string;
    desc: string;
    highlight?: boolean;
    tone?: 'amber' | 'cyan' | 'green';
  }

  interface MobileGuideGroup {
    badge: string;
    title: string;
    items: MobileGuideItem[];
  }

  const mobileOperationGroups: MobileGuideGroup[] = [
    {
      badge: 'STEP 01',
      title: '膠卷目錄挑圖 (CATALOG)',
      items: [
        {
          action: '輕點相片',
          title: '進入單張暗房精修',
          desc: '點擊任一張底片縮圖，立即開啟暗房精修工作台',
          highlight: true,
          tone: 'amber',
        },
        {
          action: '點擊書籤圖示',
          title: '挑選 / 取消挑選底片',
          desc: '點選卡片右上角書籤標記納入佇列，再點一次立即取消',
          highlight: true,
          tone: 'amber',
        },
        {
          action: '長按並滑動',
          title: '多選與滑刷連選底片',
          desc: '長按相片進入多選模式並可直接滑過連選，使用底部工具列批次挑選、排除或刪除',
        },
        {
          action: '上方工具列',
          title: '載入與追加相片來源',
          desc: '切換「更換目錄」、「追加目錄」或「追加相片」，亦可直接載入相機記憶卡',
        },
      ],
    },
    {
      badge: 'STEP 02',
      title: '單張暗房精修 (RETOUCH)',
      items: [
        {
          action: '畫布左右滑動',
          title: '切換上一張 / 下一張底片',
          desc: '在非放大狀態下左右滑動預覽畫布，依序檢視相卷底片',
        },
        {
          action: '雙擊畫布',
          title: '放大檢視細節 / 恢復全幅',
          desc: '快速點兩下畫布可局部放大確認合焦，再點兩下還原全幅檢視',
          highlight: true,
          tone: 'amber',
        },
        {
          action: '按住比對原圖',
          title: 'A/B 原始本相即時對比',
          desc: '長按畫布浮動「比對原圖」按鈕檢視 RAW 原圖，放開即恢復調色成果',
          highlight: true,
          tone: 'cyan',
        },
        {
          action: '底部暗房操作列',
          title: '一鍵 AI 顯影與抽屜面板',
          desc: '直接點擊「一鍵 AI」或「批次」顯影，或開啟「風格」／「微調」抽屜調整細節',
          highlight: true,
          tone: 'amber',
        },
        {
          action: '雙擊滑桿或數值',
          title: '單項參數快速歸零',
          desc: '點兩下參數名稱、數值或軌道可重設為基準值；輕點數值亦可直接輸入調整',
        },
      ],
    },
    {
      badge: 'STEP 03',
      title: '導出與社群分享 (EXPORT)',
      items: [
        {
          action: '底部導航列',
          title: '切換各階段工作視圖',
          desc: '隨時於「挑圖」、「精修」、「導出/分享」、「風格庫」與「設定」之間切換',
        },
        {
          action: '選擇輸出規格',
          title: '社群分享 / 高畫質 / 無損原圖',
          desc: '可依用途挑選快速預設，或自由調整 JPG / PNG / WebP 格式、畫質與長邊尺寸',
          highlight: true,
          tone: 'green',
        },
        {
          action: '生成文案與分享',
          title: '一鍵匯出或呼叫系統分享',
          desc: '產生 AI 策展文案後直接匯出成品，或點擊分享開啟手機原生分享面板',
        },
      ],
    },
  ];

  $effect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    isMobile = mq.matches;
    const handleChange = (e: MediaQueryListEvent) => {
      isMobile = e.matches;
    };
    mq.addEventListener?.('change', handleChange);
    return () => mq.removeEventListener?.('change', handleChange);
  });

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;

    if (e.key === 'Escape' || e.key === '?') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div 
    class="modal-backdrop" 
    onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    onkeydown={(e) => { if (e.key === 'Escape' && e.target === e.currentTarget) onClose(); }}
    role="dialog" 
    aria-modal="true"
    tabindex="-1"
  >
    <div class="modal-card hairline-all">
      <!-- Modal Header -->
      <header class="modal-header hairline-b">
        <div class="header-title-box">
          <span class="material-symbols-outlined help-icon">help_outline</span>
          <div>
            <h2 class="title font-headline">
              {isMobile ? '大相無形 · 系統操作說明' : '大相無形 · 系統操作與快捷鍵指南'}
            </h2>
            <p class="subtitle font-mono">
              {isMobile ? 'CURATORIAL WORKFLOW & OPERATION GUIDE' : 'CURATORIAL WORKFLOW & KEYBOARD CHEAT SHEET'}
            </p>
          </div>
        </div>

        <button
          type="button"
          class="close-btn"
          onclick={onClose}
          title={isMobile ? '關閉說明' : '關閉 (Esc 或 ?)'}
        >
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>

      <!-- Section Tabs -->
      <div class="section-tabs hairline-b font-mono">
        <button 
          type="button" 
          class="tab-btn" 
          class:active={activeSection === 'guide'}
          onclick={() => activeSection = 'guide'}
        >
          <span class="material-symbols-outlined tab-icon">{isMobile ? 'touch_app' : 'keyboard'}</span>
          <span>{isMobile ? '操作說明 (OPERATIONS)' : '鍵盤快捷鍵速查 (SHORTCUTS)'}</span>
        </button>
        <button 
          type="button" 
          class="tab-btn" 
          class:active={activeSection === 'workflow'}
          onclick={() => activeSection = 'workflow'}
        >
          <span class="material-symbols-outlined tab-icon">schema</span>
          <span>3 步驟流水線指引 (WORKFLOW)</span>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body custom-scroll">
        {#if activeSection === 'guide' && isMobile}
          <!-- 手機版操作說明 -->
          <div class="shortcuts-container">
            {#each mobileOperationGroups as group}
              <div class="shortcut-group hairline-all">
                <div class="group-header font-mono">
                  <span class="group-badge">{group.badge}</span>
                  <span class="group-title">{group.title}</span>
                </div>
                <div class="shortcut-list">
                  {#each group.items as item}
                    <div class="shortcut-row" class:highlight={item.highlight}>
                      <div class="keys">
                        <span
                          class="op-badge font-mono"
                          class:amber={item.tone === 'amber'}
                          class:cyan={item.tone === 'cyan'}
                          class:green={item.tone === 'green'}
                        >
                          {item.action}
                        </span>
                      </div>
                      <div class="action-desc">
                        <span class="desc-main">{item.title}</span>
                        <span class="desc-sub font-mono">{item.desc}</span>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {:else if activeSection === 'guide'}
          <!-- 快捷鍵對照表 -->
          <div class="shortcuts-container">
            <!-- 模組 1: 膠卷目錄挑圖 -->
            <div class="shortcut-group hairline-all">
              <div class="group-header font-mono">
                <span class="group-badge">STEP 01</span>
                <span class="group-title">膠卷目錄挑圖矩陣 (CATALOG)</span>
              </div>
              <div class="shortcut-list">
                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">H</kbd>
                    <kbd class="kbd-chip">L</kbd>
                    <span class="or">或</span>
                    <kbd class="kbd-chip">←</kbd>
                    <kbd class="kbd-chip">→</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">前後切換照片</span>
                    <span class="desc-sub font-mono">Vim 式左/右移動遊標</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">J</kbd>
                    <kbd class="kbd-chip">K</kbd>
                    <span class="or">或</span>
                    <kbd class="kbd-chip">↓</kbd>
                    <kbd class="kbd-chip">↑</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">跨列跳轉照片</span>
                    <span class="desc-sub font-mono">依網格排版上下翻動一整列</span>
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">Space</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">大圖即時預覽 (Quick Look)</span>
                    <span class="desc-sub font-mono">彈出高畫質大圖審查合焦，再按一次關閉</span>
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">P</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">挑選 / 取消挑選 (Toggle Pick)</span>
                    <span class="desc-sub font-mono">單鍵標記入隊，再按一次立即取消</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip font-mono">Ctrl</kbd>
                    <span class="or">+</span>
                    <span class="action-mouse">點選</span>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">個別多選 / 退選底片</span>
                    <span class="desc-sub font-mono">按住 Ctrl (或 macOS ⌘) 點擊相片，不連續加選或單獨剔除</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip font-mono">Shift</kbd>
                    <span class="or">+</span>
                    <span class="action-mouse">點選</span>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">連續區間範圍連選</span>
                    <span class="desc-sub font-mono">按住 Shift 點擊相片，一次選取與起點之間的整段底片</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip font-mono">Ctrl</kbd>
                    <span class="or">+</span>
                    <kbd class="kbd-chip font-mono">A</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">全選所有底片 (Select All)</span>
                    <span class="desc-sub font-mono">一鍵全選相卷所有相片，進入多選批次工作列</span>
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip">Del</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">Backspace</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">排除底片 / 剔除淘汰 (Remove / Cull)</span>
                    <span class="desc-sub font-mono">自相卷工作區排除並自動移至下一張（保留磁碟原檔，附帶 5 秒一鍵復原 ↺）</span>
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">⇧</kbd>
                    <span class="or">+</span>
                    <kbd class="kbd-chip amber">Del</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">實體刪除磁碟檔案 (Delete from Disk)</span>
                    <span class="desc-sub font-mono">彈出二次確認後將磁碟 RAW/照片移入資源回收筒 / 廢紙簍（支援多選批次刪除）</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Enter</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">進入下一步 ➔ 一鍵暗房精修</span>
                    <span class="desc-sub font-mono">將已選底片（或全量）載入精修工作台</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 模組 2: 單張暗房精修 -->
            <div class="shortcut-group hairline-all">
              <div class="group-header font-mono">
                <span class="group-badge">STEP 02</span>
                <span class="group-title">單張暗房精修 (RETOUCH)</span>
              </div>
              <div class="shortcut-list">
                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">H</kbd>
                    <kbd class="kbd-chip">L</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">切換精修底片</span>
                    <span class="desc-sub font-mono">依序檢視隊列中的下一張底片</span>
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip cyan">Space</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">A/B 原始本相即時對比</span>
                    <span class="desc-sub font-mono">瞬間切換 RAW 原始狀態與顯影調色成果</span>
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">Ctrl+Z</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">⌘Z</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">復原上一步調色 (Undo)</span>
                    <span class="desc-sub font-mono">復原上一步曝光、對比、陰影、色溫或構圖調整</span>
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">Ctrl+Y</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">⌘⇧Z</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">重做下一步調色 (Redo)</span>
                    <span class="desc-sub font-mono">重做調色步進（亦支援 Ctrl+Shift+Z / ⌘Shift+Z）</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">雙擊滑桿</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">單項參數快速歸零 (Reset to Default)</span>
                    <span class="desc-sub font-mono">點兩下滑桿標籤、數值或軌道即刻還原標準基準值</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">滾輪</kbd>
                    <kbd class="kbd-chip">⇧</kbd>
                    <kbd class="kbd-chip">⌥</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">懸停滾輪微調 (Wheel Scrubbing)</span>
                    <span class="desc-sub font-mono">滑鼠懸停滾輪微調，按住 Shift (5x 快速) / Alt (0.2x 細微)</span>
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">⌘E</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">Ctrl+E</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">快速匯出這張相片 (Quick Export)</span>
                    <span class="desc-sub font-mono">跳出快速匯出視窗（按 1 社群分享 / 2 高畫質 / 3 無損原圖），免進批次頁面即可儲存</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Enter</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">進入下一步 ➔ 前往批次導出</span>
                    <span class="desc-sub font-mono">帶著所有調色參數進入匯出隊列</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Del</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">Backspace</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">自工作區排除此幀</span>
                    <span class="desc-sub font-mono">剔除底片並自動推進至下一張（支援一鍵復原 ↺）</span>
                  </div>
                </div>

                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip amber">⇧</kbd>
                    <span class="or">+</span>
                    <kbd class="kbd-chip amber">Del</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">實體刪除此底片 (Delete from Disk)</span>
                    <span class="desc-sub font-mono">彈出二次確認後將磁碟原檔移至資源回收筒 / 廢紙簍</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Esc</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">返回上一步 ➔ 膠卷目錄</span>
                    <span class="desc-sub font-mono">回到挑圖矩陣重新選片</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 模組 3: 相片匯出設定 -->
            <div class="shortcut-group hairline-all">
              <div class="group-header font-mono">
                <span class="group-badge">STEP 03</span>
                <span class="group-title">相片匯出設定 (EXPORT)</span>
              </div>
              <div class="shortcut-list">
                <div class="shortcut-row highlight">
                  <div class="keys">
                    <kbd class="kbd-chip green">Enter</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">開始匯出已選相片</span>
                    <span class="desc-sub font-mono">依所選格式（JPG / PNG / WebP）、畫質與長邊尺寸立即輸出並歸檔</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Del</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">Backspace</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">自工作區排除此幀</span>
                    <span class="desc-sub font-mono">剔除底片並自動推進至下一張（支援一鍵復原 ↺）</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Esc</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">返回上一步 ➔ 暗房精修</span>
                    <span class="desc-sub font-mono">繼續微調光影或更換 LUT 風格</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 全域通用 -->
            <div class="shortcut-group hairline-all">
              <div class="group-header font-mono">
                <span class="group-badge">GLOBAL</span>
                <span class="group-title">全域輔助與導航</span>
              </div>
              <div class="shortcut-list">
                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">?</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">開啟 / 關閉此指南</span>
                    <span class="desc-sub font-mono">隨時叫出操作指引與快捷鍵速查</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Del</kbd>
                    <span class="or">/</span>
                    <kbd class="kbd-chip">Backspace</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">自工作區排除此幀</span>
                    <span class="desc-sub font-mono">剔除底片並自動推進至下一張（支援一鍵復原 ↺）</span>
                  </div>
                </div>

                <div class="shortcut-row">
                  <div class="keys">
                    <kbd class="kbd-chip">Esc</kbd>
                  </div>
                  <div class="action-desc">
                    <span class="desc-main">關閉彈窗 / 返回上一層</span>
                    <span class="desc-sub font-mono">優先關閉浮層（大圖、說明、金鑰金庫）</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {:else}
          <!-- 3 步驟流水線指引 -->
          <div class="workflow-container font-mono">
            <div class="workflow-step-card hairline-all">
              <div class="step-num-badge">01</div>
              <div class="step-content">
                <h3 class="step-title font-headline">相機連線與膠卷挑圖 (Ingestion & Curation)</h3>
                {#if isMobile}
                  <p class="step-desc">
                    載入相機記憶卡或本機相片資料夾後，於膠卷目錄中瀏覽底片縮圖。
                    點擊卡片右上角 <span class="highlight-text">書籤圖示</span> 加入挑選清單，或 <span class="highlight-text">長按並滑動</span> 進行批次選取；輕點任一相片即可直接進入暗房精修。
                  </p>
                {:else}
                  <p class="step-desc">
                    插入相機記憶卡或連接傳輸線，系統即插即讀自動探測 DCIM 目錄與 RAW 檔案。
                    在目錄矩陣中，利用右手 <span class="highlight-text">HJKL</span> 瀏覽底片，
                    按下 <span class="highlight-text">Space</span> 叫出 Quick Look 審視合焦細節，
                    左手按下 <span class="highlight-text">P</span> 鍵加入挑選清單。挑選完畢後按 <span class="highlight-text">Enter</span> 順暢進入暗房。
                  </p>
                {/if}
              </div>
            </div>

            <div class="workflow-arrow">↓</div>

            <div class="workflow-step-card hairline-all">
              <div class="step-num-badge">02</div>
              <div class="step-content">
                <h3 class="step-title font-headline">單張暗房精修 (Darkroom Retouch)</h3>
                {#if isMobile}
                  <p class="step-desc">
                    暗房工作台具備 60FPS WebGL 2.0 即時 3D LUT 色彩模擬，可透過底部操作列執行 <span class="highlight-text">一鍵 AI</span> 或 <span class="highlight-text">批次顯影</span>，並隨時展開「風格」與「微調」抽屜。
                    左右滑動畫布可切換底片、雙擊可放大檢視，按住 <span class="highlight-text">比對原圖</span> 即可檢視 A/B 原始本相效果。
                  </p>
                {:else}
                  <p class="step-desc">
                    暗房工作台載入挑選底片，具備 60FPS WebGL 2.0 即時 3D LUT 色彩模擬。
                    支援多模態 AI 智慧顯影調色與獨立微型快捷動作（AI 裁切、AI 拉平、AI 白平衡、AI 光比）。
                    修圖過程中長按或按一下 <span class="highlight-text">Space</span> 進行 A/B 原始本相對比。滿意後按 <span class="highlight-text">Enter</span> 推進至導出。
                  </p>
                {/if}
              </div>
            </div>

            <div class="workflow-arrow">↓</div>

            <div class="workflow-step-card hairline-all">
              <div class="step-num-badge">03</div>
              <div class="step-content">
                <h3 class="step-title font-headline">智慧分類與批次匯出 (Export & Archive)</h3>
                {#if isMobile}
                  <p class="step-desc">
                    點選底部導航切換至「導出/分享」，自由挑選 <span class="highlight-text">社群分享、高畫質相片或無損典藏</span> 預設，亦可自訂格式（JPG / PNG / WebP）、畫質與長邊尺寸。
                    內建 AI 策展文案與資料夾自動分類，確認設定後點擊匯出或使用系統分享面板即可完成。
                  </p>
                {:else}
                  <p class="step-desc">
                    自由挑選 <span class="highlight-text">社群分享、高畫質相片或無損典藏</span> 用途預設，亦可自訂格式（JPG / PNG / WebP）、畫質百分比與長邊像素限制。
                    支援 AI 場景資料夾分類與 RAW 備份，確認後按下 <span class="highlight-text">Enter</span> 立即開始匯出。
                  </p>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Modal Footer -->
      <footer class="modal-footer hairline-t font-mono">
        <div class="footer-tip">
          <span class="material-symbols-outlined tip-icon">tips_and_updates</span>
          {#if isMobile}
            <span>提示：點擊右上角「?」圖示可隨時開啟或關閉此操作說明。</span>
          {:else}
            <span>提示：在任何介面隨時按下 <kbd class="kbd-chip">?</kbd> 鍵即可快速叫出或關閉此說明視窗。</span>
          {/if}
        </div>
        <button type="button" class="archival-btn-primary" onclick={onClose}>
          <span>{isMobile ? '瞭解並關閉' : '瞭解並關閉 (Esc)'}</span>
        </button>
      </footer>
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
    background-color: rgba(8, 9, 11, 0.82);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2100;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.99); }
    to { opacity: 1; transform: scale(1); }
  }

  .modal-card {
    width: 720px;
    max-width: 92vw;
    max-height: 85vh;
    background-color: var(--surface-panel);
    border-radius: var(--radius-md);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    padding: 18px 24px;
    background-color: var(--surface-elevated);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-title-box {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .help-icon {
    font-size: 26px;
    color: var(--amber-highlight);
  }

  .title {
    font-size: 16px;
    font-weight: 600;
    color: var(--parchment-bright);
    letter-spacing: 0.02em;
  }

  .subtitle {
    font-size: 10px;
    color: var(--parchment-dim);
    letter-spacing: 0.1em;
    margin-top: 2px;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--parchment-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    border-radius: var(--radius-sm);
    transition: all 0.15s;
  }

  .close-btn:hover {
    color: var(--parchment-bright);
    background-color: rgba(255, 255, 255, 0.08);
  }

  .section-tabs {
    display: flex;
    background-color: rgba(20, 22, 26, 0.6);
    padding: 0 20px;
    gap: 12px;
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--parchment-muted);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-btn .tab-icon {
    font-size: 16px;
  }

  .tab-btn:hover {
    color: var(--parchment-bright);
  }

  .tab-btn.active {
    color: var(--amber-highlight);
    border-bottom-color: var(--amber-highlight);
  }

  .modal-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
  }

  /* Shortcuts Table */
  .shortcuts-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .shortcut-group {
    background-color: rgba(28, 30, 36, 0.4);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    background-color: rgba(35, 38, 45, 0.5);
    font-size: 11px;
    border-bottom: 1px solid var(--hairline-dim);
  }

  .group-badge {
    padding: 1px 6px;
    background-color: rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-xs);
    color: var(--parchment-bright);
    font-size: 10px;
  }

  .group-title {
    color: var(--parchment-bright);
    font-weight: 500;
  }

  .shortcut-list {
    display: flex;
    flex-direction: column;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--hairline-dim);
    transition: background-color 0.1s;
  }

  .shortcut-row:last-child {
    border-bottom: none;
  }

  .shortcut-row:hover {
    background-color: rgba(255, 255, 255, 0.02);
  }

  .shortcut-row.highlight {
    background-color: rgba(212, 163, 115, 0.04);
  }

  .keys {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 180px;
  }

  .keys .or {
    font-size: 11px;
    color: var(--parchment-dim);
    font-family: var(--font-mono);
  }

  .kbd-chip {
    display: inline-block;
    padding: 2px 8px;
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--parchment-bright);
    background-color: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: var(--radius-xs);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  .kbd-chip.amber {
    color: var(--amber-highlight);
    border-color: rgba(212, 163, 115, 0.5);
    background-color: rgba(212, 163, 115, 0.12);
  }

  .kbd-chip.cyan {
    color: #5ce1e6;
    border-color: rgba(92, 225, 230, 0.5);
    background-color: rgba(92, 225, 230, 0.12);
  }

  .kbd-chip.green {
    color: var(--success-green);
    border-color: rgba(86, 143, 107, 0.5);
    background-color: rgba(86, 143, 107, 0.12);
  }

  .action-desc {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .desc-main {
    font-size: 13px;
    color: var(--parchment-bright);
  }

  .desc-sub {
    font-size: 11px;
    color: var(--parchment-muted);
  }

  /* Workflow View */
  .workflow-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
  }

  .workflow-step-card {
    display: flex;
    gap: 16px;
    padding: 16px 20px;
    background-color: rgba(28, 30, 36, 0.4);
    border-radius: var(--radius-sm);
    width: 100%;
  }

  .step-num-badge {
    font-size: 20px;
    font-weight: 700;
    color: var(--amber-highlight);
    background: rgba(212, 163, 115, 0.1);
    border: 1px solid rgba(212, 163, 115, 0.3);
    border-radius: var(--radius-xs);
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .step-content {
    flex: 1;
  }

  .step-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--parchment-bright);
    margin-bottom: 6px;
  }

  .step-desc {
    font-size: 12px;
    color: var(--parchment-muted);
    line-height: 1.6;
  }

  .highlight-text {
    color: var(--amber-highlight);
    font-weight: 600;
  }

  .workflow-arrow {
    color: var(--parchment-dim);
    font-size: 16px;
  }

  /* Modal Footer */
  .modal-footer {
    padding: 16px 24px;
    background-color: var(--surface-elevated);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .footer-tip {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--parchment-muted);
  }

  .tip-icon {
    font-size: 16px;
    color: var(--amber-highlight);
  }

  .archival-btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border-radius: var(--radius-sm);
    background-color: var(--primary-indigo);
    border: 1px solid var(--primary-hover);
    color: var(--parchment-bright);
    font-size: 12px;
    font-family: var(--font-mono);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .archival-btn-primary:hover {
    background-color: var(--primary-hover);
  }

  .op-badge {
    display: inline-block;
    padding: 3px 10px;
    font-size: 11px;
    color: var(--parchment-bright);
    background-color: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: var(--radius-xs);
    white-space: nowrap;
  }

  .op-badge.amber {
    color: var(--amber-highlight);
    border-color: rgba(212, 163, 115, 0.5);
    background-color: rgba(212, 163, 115, 0.12);
  }

  .op-badge.cyan {
    color: #5ce1e6;
    border-color: rgba(92, 225, 230, 0.5);
    background-color: rgba(92, 225, 230, 0.12);
  }

  .op-badge.green {
    color: var(--success-green);
    border-color: rgba(86, 143, 107, 0.5);
    background-color: rgba(86, 143, 107, 0.12);
  }

  @media (max-width: 768px) {
    .modal-card {
      max-width: 94vw;
      max-height: 88vh;
    }

    .modal-header {
      padding: 14px 16px;
    }

    .title {
      font-size: 15px;
    }

    .section-tabs {
      padding: 0 12px;
      gap: 6px;
    }

    .tab-btn {
      padding: 10px 10px;
      font-size: 11px;
      gap: 6px;
    }

    .modal-body {
      padding: 14px;
    }

    .shortcut-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      padding: 12px 14px;
    }

    .keys {
      min-width: 0;
    }

    .action-desc {
      align-items: flex-start;
    }

    .desc-sub {
      line-height: 1.5;
    }

    .workflow-step-card {
      padding: 14px;
      gap: 12px;
    }

    .step-num-badge {
      width: 36px;
      height: 36px;
      font-size: 16px;
    }

    .modal-footer {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
      padding: 14px 16px;
    }

    .footer-tip {
      font-size: 11px;
      line-height: 1.45;
    }

    .archival-btn-primary {
      justify-content: center;
      width: 100%;
    }
  }
</style>
