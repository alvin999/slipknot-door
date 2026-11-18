<script lang="ts">
  import '../styles/design-tokens.css';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import PWAInstallPrompt from '$lib/components/PWAInstallPrompt.svelte';
  import { onMount } from 'svelte';
  import { pwaInstallService } from '$lib/services/pwaInstallService.svelte';
  import { i18nStore, t } from '$lib/i18n';

  let { children } = $props();

  $effect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = i18nStore.locale;
    document.title = t('app.title');
  });

  onMount(() => {
    pwaInstallService.init();
  });
</script>

{@render children()}
<ToastContainer />
<PWAInstallPrompt />
