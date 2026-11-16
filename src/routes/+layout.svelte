<script lang="ts">
  import '../styles/design-tokens.css';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import PWAInstallPrompt from '$lib/components/PWAInstallPrompt.svelte';
  import { onMount } from 'svelte';
  import { pwaInstallService } from '$lib/services/pwaInstallService.svelte';

  let { children } = $props();

  onMount(() => {
    pwaInstallService.init();
  });
</script>

{@render children()}
<ToastContainer />
<PWAInstallPrompt />
