// @ts-nocheck
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Page from '../src/routes/+page.svelte';

describe('暗房精修雙圖調色真實現況掛載測試 (+page.svelte Mount & Develop Test)', () => {
  it('真實掛載 +page.svelte，模擬暗房調色與多圖操作，檢測無窮迴圈', async () => {
    // 捕獲所有 console.error 與 warning
    const errors: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => {
      errors.push(args.map(a => String(a?.message || a)).join(' '));
      origError(...args);
    };

    const container = document.createElement('div');
    document.body.appendChild(container);

    let app: any;
    try {
      app = mount(Page, { target: container });
      flushSync();
    } catch (err: any) {
      console.log('掛載階段拋出錯誤:', err.message);
    }

    console.log('元件成功掛載至 DOM，檢查目前畫面按鈕數量...');
    const buttons = Array.from(container.querySelectorAll('button')).map(b => b.textContent?.trim());
    console.log('發現按鈕:', buttons.slice(0, 10));

    // 切換至暗房精修視圖
    const retouchBtn = Array.from(container.querySelectorAll('button')).find(b => 
      b.textContent?.includes('單張暗房精修') || b.textContent?.includes('暗房精修')
    );

    if (retouchBtn) {
      console.log('點擊切換至「單張暗房精修」...');
      retouchBtn.click();
      flushSync();
    }

    // 檢查暗房視圖下的滑桿
    const sliders = container.querySelectorAll('input[type="range"]');
    console.log(`暗房滑桿數量: ${sliders.length}`);

    // 模擬調色滑桿拉動
    if (sliders.length > 0) {
      const exposureSlider = sliders[0] as HTMLInputElement;
      console.log('模擬連續推拉調色滑桿 (觸發 Svelte 5 $effect)...');
      for (let i = 0; i < 20; i++) {
        exposureSlider.value = String((i * 0.05).toFixed(2));
        exposureSlider.dispatchEvent(new Event('input', { bubbles: true }));
        exposureSlider.dispatchEvent(new Event('change', { bubbles: true }));
        flushSync();
      }
    }

    // 檢查是否有 Svelte 5 update depth 相關錯誤
    console.log('攔截到的 console.error 列表:', errors);

    const hasLoopError = errors.some(e => 
      e.includes('Maximum update depth exceeded') || 
      e.includes('effect_update_depth_exceeded') ||
      e.includes('maximum recursive updates')
    );

    if (app) {
      unmount(app);
    }
    console.error = origError;

    expect(hasLoopError).toBe(false);
  });
});
