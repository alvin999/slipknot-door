<script lang="ts">
  import type { StyleKeywordEntry } from "$lib/services/ai/styleDirectives";
  import type { StyleKeywordId } from "$lib/services/ai/types";
  import { styleKeywordCatalog } from "$lib/stores/styleKeywordCatalog.svelte";
  import { toastStore } from "$lib/stores/toastStore.svelte";

  interface Props {
    isOpen?: boolean;
    initialMode?: "list" | "create";
    prefillPrompt?: string;
    onSavedCustomKeyword?: (entry: StyleKeywordEntry) => void;
    onKeywordHiddenOrDeleted?: (id: StyleKeywordId) => void;
    onClose?: () => void;
  }

  let {
    isOpen = $bindable(false),
    initialMode = "list",
    prefillPrompt = "",
    onSavedCustomKeyword,
    onKeywordHiddenOrDeleted,
    onClose,
  }: Props = $props();

  let editorMode = $state<"none" | "create" | "edit">("none");
  let editingTargetId = $state<StyleKeywordId | null>(null);
  let editingIsBuiltin = $state<boolean>(false);

  let formShortTag = $state<string>("");
  let formTooltip = $state<string>("");
  let formPrompt = $state<string>("");
  let formError = $state<string>("");
  let confirmDeleteId = $state<StyleKeywordId | null>(null);

  // 每次開啟 Modal 時依初始模式初始化表單
  $effect(() => {
    if (!isOpen) return;
    confirmDeleteId = null;
    formError = "";
    if (initialMode === "create") {
      openCreateForm(prefillPrompt);
    } else {
      editorMode = "none";
      editingTargetId = null;
    }
  });

  const customList = $derived(
    styleKeywordCatalog.allKeywords.filter((k) => k.isCustom),
  );
  const builtinList = $derived(
    styleKeywordCatalog.allKeywords.filter((k) => !k.isCustom),
  );

  function closeModal() {
    isOpen = false;
    editorMode = "none";
    editingTargetId = null;
    confirmDeleteId = null;
    onClose?.();
  }

  function openCreateForm(initialPromptText: string = "") {
    editorMode = "create";
    editingTargetId = null;
    editingIsBuiltin = false;
    formShortTag = "";
    formTooltip = "";
    formPrompt = initialPromptText.trim();
    formError = "";
    confirmDeleteId = null;
  }

  function openEditForm(entry: StyleKeywordEntry) {
    editorMode = "edit";
    editingTargetId = entry.id;
    editingIsBuiltin = !entry.isCustom;
    formShortTag = entry.shortTag;
    formTooltip = entry.tooltip;
    formPrompt = entry.promptEnglish;
    formError = "";
    confirmDeleteId = null;
  }

  function cancelForm() {
    editorMode = "none";
    editingTargetId = null;
    editingIsBuiltin = false;
    formError = "";
  }

  function handleSaveForm() {
    const shortTag = formShortTag.trim();
    const tooltip = formTooltip.trim();
    const promptEnglish = formPrompt.trim();

    if (!shortTag) {
      formError = "請輸入關鍵字標籤名稱";
      return;
    }
    if (!promptEnglish) {
      formError = "請輸入 AI 調色指令內容";
      return;
    }

    if (editorMode === "create") {
      const created = styleKeywordCatalog.addCustomKeyword({
        shortTag,
        tooltip,
        promptEnglish,
      });
      if (created) {
        toastStore.show(`已儲存自訂關鍵字「${created.shortTag}」`, "success");
        onSavedCustomKeyword?.(created);
        cancelForm();
      }
      return;
    }

    if (editorMode === "edit" && editingTargetId) {
      const ok = styleKeywordCatalog.updateKeyword(editingTargetId, {
        shortTag,
        tooltip,
        promptEnglish,
      });
      if (ok) {
        toastStore.show(`已儲存「${shortTag}」設定`, "success");
        cancelForm();
      }
    }
  }

  function handleRestoreEditingBuiltin() {
    if (!editingTargetId || !editingIsBuiltin) return;
    const def = styleKeywordCatalog.getBuiltinDefault(editingTargetId);
    if (!def) return;
    formShortTag = def.shortTag;
    formTooltip = def.tooltip;
    formPrompt = def.promptEnglish;
    formError = "";
  }

  function handleResetSingleBuiltin(entry: StyleKeywordEntry) {
    if (styleKeywordCatalog.resetBuiltinKeyword(entry.id)) {
      toastStore.show(`已還原預設關鍵字「${entry.shortTag}」`, "info");
      if (editingTargetId === entry.id) {
        cancelForm();
      }
    }
  }

  function handleResetAllBuiltins() {
    styleKeywordCatalog.resetAllBuiltins();
    toastStore.show("已將全部預設關鍵字還原為原廠設定", "info");
    if (editingIsBuiltin) {
      cancelForm();
    }
  }

  function handleToggleHide(entry: StyleKeywordEntry) {
    const willHide = !entry.hidden;
    styleKeywordCatalog.toggleHideBuiltin(entry.id);
    if (willHide) {
      onKeywordHiddenOrDeleted?.(entry.id);
    }
  }

  function handleConfirmDelete(entry: StyleKeywordEntry) {
    if (styleKeywordCatalog.deleteCustomKeyword(entry.id)) {
      onKeywordHiddenOrDeleted?.(entry.id);
      toastStore.show(`已刪除自訂關鍵字「${entry.shortTag}」`, "info");
      if (editingTargetId === entry.id) {
        cancelForm();
      }
    }
    confirmDeleteId = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen) {
      closeModal();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div class="kw-modal-backdrop" onclick={closeModal} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="kw-modal hairline-all"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="kw-modal-title"
    >
      <header class="kw-modal-header hairline-b">
        <div class="kw-title-group">
          <span class="material-symbols-outlined kw-header-icon">bookmarks</span>
          <div>
            <div id="kw-modal-title" class="kw-title font-headline">
              關鍵字儲存管理
            </div>
            <div class="kw-subtitle font-mono">
              STYLE KEYWORD VAULT // EXPLICIT LOCAL SAVE
            </div>
          </div>
        </div>
        <button
          type="button"
          class="kw-close-btn"
          onclick={closeModal}
          aria-label="關閉關鍵字管理視窗"
        >
          <span class="material-symbols-outlined" style="font-size: 16px;"
            >close</span
          >
        </button>
      </header>

      <div class="kw-modal-body custom-scroll">
        <!-- 新增／編修表單區（只有點擊「儲存」才寫入 localStorage） -->
        {#if editorMode !== "none"}
          <section class="kw-editor-card hairline-all">
            <div class="kw-editor-head">
              <span class="kw-editor-title font-mono">
                {#if editorMode === "create"}
                  ＋ 新增自訂調色關鍵字
                {:else if editingIsBuiltin}
                  編修預設關鍵字
                {:else}
                  編修自訂關鍵字
                {/if}
              </span>
              {#if editingIsBuiltin}
                <button
                  type="button"
                  class="kw-mini-btn font-mono"
                  onclick={handleRestoreEditingBuiltin}
                  title="將表單欄位帶回原廠預設內容（仍需點擊儲存才套用）"
                >
                  帶入原廠內容
                </button>
              {/if}
            </div>

            <div class="kw-field">
              <label class="kw-field-label font-mono" for="kw-short-tag">
                標籤名稱 <span class="kw-required">*</span>
              </label>
              <input
                id="kw-short-tag"
                type="text"
                class="kw-input font-body"
                maxlength="28"
                placeholder="例如：富士負片、清透青橙、港風夜色"
                bind:value={formShortTag}
              />
            </div>

            <div class="kw-field">
              <label class="kw-field-label font-mono" for="kw-tooltip">
                效果說明（選填，滑鼠懸停與明細顯示）
              </label>
              <input
                id="kw-tooltip"
                type="text"
                class="kw-input font-body"
                maxlength="120"
                placeholder="例如：暗部偏冷青、膚色通透暖調、高光柔和滾降"
                bind:value={formTooltip}
              />
            </div>

            <div class="kw-field">
              <label class="kw-field-label font-mono" for="kw-prompt">
                AI 調色指令 Prompt <span class="kw-required">*</span>
              </label>
              <textarea
                id="kw-prompt"
                class="kw-textarea font-mono"
                rows="3"
                placeholder="輸入注入 AI 的風格指令，例如：Clean daylight teal-orange separation, smooth highlight roll-off, warm skin tone"
                bind:value={formPrompt}
              ></textarea>
            </div>

            {#if formError}
              <div class="kw-form-error font-mono">{formError}</div>
            {/if}

            <div class="kw-editor-actions">
              <button
                type="button"
                class="archival-btn-secondary kw-btn font-mono"
                onclick={cancelForm}
              >
                取消
              </button>
              <button
                type="button"
                class="archival-btn-primary kw-btn font-mono"
                onclick={handleSaveForm}
              >
                <span class="material-symbols-outlined" style="font-size: 14px;"
                  >save</span
                >
                <span>儲存至本地</span>
              </button>
            </div>
          </section>
        {:else}
          <div class="kw-top-bar">
            <span class="kw-hint font-body">
              編輯或新增後需點擊「儲存」才會永久保存於此瀏覽器。
            </span>
            <button
              type="button"
              class="archival-btn-primary kw-add-btn font-mono"
              onclick={() => openCreateForm("")}
            >
              <span class="material-symbols-outlined" style="font-size: 14px;"
                >add</span
              >
              <span>新增關鍵字</span>
            </button>
          </div>
        {/if}

        <!-- 自訂關鍵字清單 -->
        <section class="kw-group">
          <div class="kw-group-header font-mono">
            <span>自訂關鍵字 ({customList.length})</span>
          </div>

          {#if customList.length === 0}
            <div class="kw-empty-box font-body">
              尚未儲存任何自訂關鍵字。可點擊上方「新增關鍵字」，或在暗房面板輸入描述後點「存為關鍵字」。
            </div>
          {:else}
            <div class="kw-list">
              {#each customList as entry (entry.id)}
                <div
                  class="kw-row hairline-all"
                  class:is-editing-row={editingTargetId === entry.id}
                >
                  <div class="kw-row-main">
                    <div class="kw-row-title-line">
                      <span class="kw-row-tag">{entry.shortTag}</span>
                      <span class="kw-badge custom font-mono">自訂</span>
                    </div>
                    {#if entry.tooltip}
                      <div class="kw-row-desc">{entry.tooltip}</div>
                    {/if}
                    <div class="kw-row-prompt font-mono">
                      {entry.promptEnglish}
                    </div>
                  </div>
                  <div class="kw-row-actions font-mono">
                    <button
                      type="button"
                      class="kw-icon-btn"
                      onclick={() => styleKeywordCatalog.moveKeywordOrder(entry.id, "up")}
                      title="上移"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      class="kw-icon-btn"
                      onclick={() => styleKeywordCatalog.moveKeywordOrder(entry.id, "down")}
                      title="下移"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      class="kw-mini-btn"
                      onclick={() => openEditForm(entry)}
                    >
                      編輯
                    </button>
                    {#if confirmDeleteId === entry.id}
                      <button
                        type="button"
                        class="kw-mini-btn danger-solid"
                        onclick={() => handleConfirmDelete(entry)}
                      >
                        確定刪除
                      </button>
                      <button
                        type="button"
                        class="kw-mini-btn"
                        onclick={() => (confirmDeleteId = null)}
                      >
                        取消
                      </button>
                    {:else}
                      <button
                        type="button"
                        class="kw-mini-btn danger"
                        onclick={() => (confirmDeleteId = entry.id)}
                      >
                        刪除
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </section>

        <!-- 內建預設關鍵字清單 -->
        <section class="kw-group">
          <div class="kw-group-header font-mono">
            <span>預設關鍵字 ({builtinList.length})</span>
            {#if styleKeywordCatalog.modifiedOrHiddenBuiltinCount > 0}
              <button
                type="button"
                class="kw-mini-btn font-mono"
                onclick={handleResetAllBuiltins}
              >
                全部還原預設 ({styleKeywordCatalog.modifiedOrHiddenBuiltinCount})
              </button>
            {/if}
          </div>

          <div class="kw-list">
            {#each builtinList as entry (entry.id)}
              <div
                class="kw-row hairline-all"
                class:is-hidden-row={entry.hidden}
                class:is-editing-row={editingTargetId === entry.id}
              >
                <div class="kw-row-main">
                  <div class="kw-row-title-line">
                    <span class="kw-row-tag">{entry.shortTag}</span>
                    {#if entry.isModified}
                      <span class="kw-badge modified font-mono">已編修</span>
                    {/if}
                    {#if entry.hidden}
                      <span class="kw-badge hidden-badge font-mono">已隱藏</span>
                    {/if}
                  </div>
                  {#if entry.tooltip}
                    <div class="kw-row-desc">{entry.tooltip}</div>
                  {/if}
                  <div class="kw-row-prompt font-mono">
                    {entry.promptEnglish}
                  </div>
                </div>
                <div class="kw-row-actions font-mono">
                  <button
                    type="button"
                    class="kw-icon-btn"
                    onclick={() => styleKeywordCatalog.moveKeywordOrder(entry.id, "up")}
                    title="上移"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class="kw-icon-btn"
                    onclick={() => styleKeywordCatalog.moveKeywordOrder(entry.id, "down")}
                    title="下移"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    class="kw-mini-btn"
                    onclick={() => openEditForm(entry)}
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    class="kw-mini-btn"
                    onclick={() => handleToggleHide(entry)}
                  >
                    {entry.hidden ? "顯示" : "隱藏"}
                  </button>
                  {#if entry.isModified || entry.hidden}
                    <button
                      type="button"
                      class="kw-mini-btn restore"
                      onclick={() => handleResetSingleBuiltin(entry)}
                    >
                      還原預設
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </section>
      </div>

      <footer class="kw-modal-footer hairline-t">
        <span class="kw-footer-status font-mono">
          已存 {styleKeywordCatalog.customCount} 組自訂 · 顯示 {styleKeywordCatalog.visibleKeywords.length}/{styleKeywordCatalog.allKeywords.length} 組關鍵字
        </span>
        <button
          type="button"
          class="archival-btn-secondary kw-btn font-mono"
          onclick={closeModal}
        >
          完成關閉
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .kw-modal-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.78);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1050;
  }
  .kw-modal {
    width: min(94vw, 680px);
    max-height: 86vh;
    background-color: var(--surface-panel);
    border: 1px solid var(--hairline-slate);
    border-radius: var(--radius-md);
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.88);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .kw-modal-header {
    padding: 14px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: var(--surface-elevated);
  }
  .kw-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .kw-header-icon {
    font-size: 21px;
    color: var(--amber-highlight);
  }
  .kw-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--parchment-bright);
    letter-spacing: 0.04em;
  }
  .kw-subtitle {
    font-size: 10px;
    color: var(--parchment-dim);
    letter-spacing: 0.08em;
  }
  .kw-close-btn {
    background: transparent;
    border: none;
    color: var(--parchment-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 4px;
    border-radius: 4px;
  }
  .kw-close-btn:hover {
    color: var(--parchment-bright);
    background-color: var(--surface-overlay);
  }
  .kw-modal-body {
    padding: 16px 18px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .kw-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .kw-hint {
    font-size: 12px;
    color: var(--parchment-muted);
  }
  .kw-add-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    font-size: 11.5px;
    cursor: pointer;
  }

  .kw-editor-card {
    background: rgba(0, 0, 0, 0.36);
    border: 1px solid rgba(226, 157, 82, 0.45);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .kw-editor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .kw-editor-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--amber-highlight);
  }
  .kw-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .kw-field-label {
    font-size: 11px;
    color: var(--parchment-muted);
  }
  .kw-required {
    color: var(--amber-highlight);
  }
  .kw-input,
  .kw-textarea {
    width: 100%;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-xs);
    padding: 7px 9px;
    font-size: 12px;
    color: var(--parchment-bright);
    outline: none;
  }
  .kw-input:focus,
  .kw-textarea:focus {
    border-color: var(--amber-highlight);
  }
  .kw-textarea {
    resize: vertical;
    line-height: 1.45;
  }
  .kw-form-error {
    font-size: 11px;
    color: #ef9a9a;
  }
  .kw-editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 2px;
  }
  .kw-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 13px;
    font-size: 11.5px;
    cursor: pointer;
  }

  .kw-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .kw-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    letter-spacing: 0.06em;
    color: var(--parchment-dim);
  }
  .kw-empty-box {
    padding: 12px;
    border-radius: var(--radius-xs);
    border: 1px dashed rgba(255, 255, 255, 0.12);
    font-size: 12px;
    color: var(--parchment-dim);
    text-align: center;
  }
  .kw-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .kw-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 11px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-xs);
  }
  .kw-row.is-editing-row {
    border-color: var(--amber-highlight);
    background: rgba(226, 157, 82, 0.08);
  }
  .kw-row.is-hidden-row {
    opacity: 0.56;
  }
  .kw-row-main {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .kw-row-title-line {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .kw-row-tag {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--parchment-bright);
  }
  .kw-badge {
    font-size: 9.5px;
    padding: 1px 5px;
    border-radius: 2px;
    border: 1px solid transparent;
  }
  .kw-badge.custom {
    color: var(--amber-highlight);
    background: rgba(226, 157, 82, 0.14);
    border-color: rgba(226, 157, 82, 0.35);
  }
  .kw-badge.modified {
    color: #90caf9;
    background: rgba(144, 202, 249, 0.12);
    border-color: rgba(144, 202, 249, 0.35);
  }
  .kw-badge.hidden-badge {
    color: var(--parchment-dim);
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
  }
  .kw-row-desc {
    font-size: 11.5px;
    color: var(--parchment-muted);
    line-height: 1.4;
  }
  .kw-row-prompt {
    font-size: 10.5px;
    color: var(--parchment-dim);
    line-height: 1.35;
    word-break: break-word;
  }
  .kw-row-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .kw-icon-btn,
  .kw-mini-btn {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 2px;
    padding: 2px 7px;
    font-size: 10px;
    color: var(--parchment-muted);
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .kw-icon-btn:hover,
  .kw-mini-btn:hover {
    border-color: var(--amber-highlight);
    color: var(--amber-highlight);
  }
  .kw-mini-btn.restore {
    border-color: rgba(144, 202, 249, 0.35);
    color: #90caf9;
  }
  .kw-mini-btn.restore:hover {
    background: rgba(144, 202, 249, 0.12);
  }
  .kw-mini-btn.danger:hover {
    border-color: #e57373;
    color: #e57373;
  }
  .kw-mini-btn.danger-solid {
    background: rgba(229, 115, 115, 0.2);
    border-color: #e57373;
    color: #ffcdd2;
  }
  .kw-modal-footer {
    padding: 12px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background-color: var(--surface-elevated);
  }
  .kw-footer-status {
    font-size: 10.5px;
    color: var(--parchment-dim);
  }
</style>

