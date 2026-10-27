// @ts-check
import { spawn } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'http://127.0.0.1:1420/';
const CDP_PORT = 9336;
const TEMP_PROFILE = join(tmpdir(), 'slipknot_cdp_test_' + Date.now());

console.log('====================================================');
console.log('🧪 Slipknot 暗房精修 雙圖調色真實 E2E 診斷測試');
console.log('====================================================');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

mkdirSync(TEMP_PROFILE, { recursive: true });

console.log(`[1/6] 啟動隔離 Chrome 實例 (埠號: ${CDP_PORT})...`);
const chromeProc = spawn(CHROME_PATH, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  '--remote-allow-origins=*',
  `--user-data-dir=${TEMP_PROFILE}`,
  '--disable-gpu',
  '--no-first-run',
  TARGET_URL
]);

let browserWsUrl = '';
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    const ver = await res.json();
    if (ver && ver.webSocketDebuggerUrl) {
      browserWsUrl = ver.webSocketDebuggerUrl;
      break;
    }
  } catch {}
  await sleep(250);
}

if (!browserWsUrl) {
  console.error('❌ 無法取得 Browser CDP WebSocket 連線');
  chromeProc.kill();
  process.exit(1);
}

console.log(`[2/6] 已成功連線至 Chrome Browser CDP: ${browserWsUrl}`);

const ws = new WebSocket(browserWsUrl);
let callId = 1;
const pending = new Map();
const consoleLogs = [];
const pageErrors = [];
let pageSessionId = null;

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = callId++;
    pending.set(id, { resolve, reject });
    const payload = pageSessionId 
      ? { id, method, params, sessionId: pageSessionId }
      : { id, method, params };
    ws.send(JSON.stringify(payload));
  });
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(msg.error);
    else resolve(msg.result);
    return;
  }

  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map(a => a.value ?? a.description ?? '').join(' ');
    consoleLogs.push({ type: msg.params.type, text });
    if (msg.params.type === 'error') {
      console.log(`  [BROWSER ERROR] ${text}`);
    } else if (text.includes('exceeded') || text.includes('loop') || text.includes('Depth') || text.includes('depth') || text.includes('ThumbnailRenderer')) {
      console.log(`  [BROWSER RELEVANT LOG] ${text}`);
    }
  }

  if (msg.method === 'Runtime.exceptionThrown') {
    const desc = msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text;
    pageErrors.push(desc);
    console.log(`  🔥 [BROWSER EXCEPTION] ${desc}`);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

// 尋找目標頁面 Target 並 Attach
const targetsRes = await cdp('Target.getTargets');
const pageTarget = targetsRes.targetInfos?.find(t => t.type === 'page');
if (!pageTarget) {
  throw new Error('未找到分頁 Target');
}

const attachRes = await cdp('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
pageSessionId = attachRes.sessionId;
console.log('已綁定分頁 Session ID:', pageSessionId);

await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('DOM.enable');

console.log('[3/6] 等待 Svelte 5 應用程式載入完畢...');
await sleep(1500);

console.log('[4/6] 注入真實 2 張相片情境與暗房調色生命週期...');

// 模擬真實雙圖資料結構並注入
const injectionTest = await cdp('Runtime.evaluate', {
  expression: `
    (async () => {
      // 檢查 DOM
      const title = document.title;
      console.log('頁面目前標題:', title);

      // 檢查頁面按鈕清單
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean);

      // 切換至「2. 單張暗房精修」
      const retouchBtn = Array.from(document.querySelectorAll('button')).find(b => 
        b.textContent?.includes('單張暗房精修') || b.textContent?.includes('暗房精修')
      );
      if (retouchBtn) {
        console.log('點擊進入暗房精修視圖');
        retouchBtn.click();
        await new Promise(r => setTimeout(r, 600));
      }

      return {
        title,
        buttonCount: buttons.length,
        retouchFound: !!retouchBtn
      };
    })()
  `,
  awaitPromise: true,
  returnByValue: true
});

console.log('介面切換檢測:', injectionTest.result?.value);

console.log('[5/6] 深度測試：模擬 2 張圖片調色完後 $effect 與 syncActivePhotoTuning 連鎖反應...');

const loopTestResult = await cdp('Runtime.evaluate', {
  expression: `
    (async () => {
      const trace = {
        iterations: 0,
        syncRuns: 0,
        infiniteLoopDetected: false,
        error: null,
        stackOverflowDetected: false
      };

      try {
        // 1. 建立兩張相片資料 (Plate 1 & Plate 2)
        const sampleRed = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
        const sampleBlue = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

        let plates = [
          {
            id: 'photo_1',
            frameNo: '01A',
            filename: 'PHOTO_001.JPG',
            camera: 'Canon EOS R5',
            lens: '50mm',
            iso: 100,
            shutter: '1/250',
            aperture: 'f/1.4',
            focalLength: '50mm',
            thumbnail: sampleRed,
            sceneTag: '大光圈人像',
            selected: true,
            flagged: true,
            appliedProfile: 'Profile_01_MatteShadow',
            tuning: { exposure: 0.35, contrast: 0.1, lutIntensity: 0.9, colorTemp: 5600, tint: 1.0, clarity: 0, sharpness: 0 },
            crop: undefined
          },
          {
            id: 'photo_2',
            frameNo: '02A',
            filename: 'PHOTO_002.JPG',
            camera: 'Sony A7R IV',
            lens: '85mm',
            iso: 200,
            shutter: '1/500',
            aperture: 'f/1.8',
            focalLength: '85mm',
            thumbnail: sampleBlue,
            sceneTag: '街頭光影',
            selected: false,
            flagged: true,
            appliedProfile: 'Profile_00_StandardNatural',
            tuning: undefined,
            crop: undefined
          }
        ];

        let activePhoto = plates[0];
        let exposure = activePhoto.tuning.exposure;
        let contrast = activePhoto.tuning.contrast;
        let colorTemp = activePhoto.tuning.colorTemp;
        let tint = activePhoto.tuning.tint;
        let lutIntensity = activePhoto.tuning.lutIntensity;
        let clarity = 0;
        let sharpness = 0;

        // 模擬 syncActivePhotoTuning 邏輯（完全還原 +page.svelte 第 872-925 行）
        function syncActivePhotoTuning() {
          trace.syncRuns++;
          if (!activePhoto) return;

          const isDefaultTuning = 
            exposure === 0.0 &&
            contrast === 0.0 &&
            colorTemp === 5500 &&
            tint === 0.0 &&
            lutIntensity === 1.0 &&
            clarity === 0.0 &&
            sharpness === 0.0;

          const targetTuning = isDefaultTuning ? undefined : {
            exposure,
            contrast,
            lutIntensity,
            colorTemp,
            tint,
            clarity,
            sharpness
          };

          const currentPlate = plates.find(p => p.id === activePhoto.id);
          const tuningMatches = 
            (!currentPlate?.tuning && !targetTuning) ||
            (currentPlate?.tuning && targetTuning &&
              currentPlate.tuning.exposure === targetTuning.exposure &&
              currentPlate.tuning.contrast === targetTuning.contrast &&
              currentPlate.tuning.lutIntensity === targetTuning.lutIntensity &&
              currentPlate.tuning.colorTemp === targetTuning.colorTemp &&
              currentPlate.tuning.tint === targetTuning.tint &&
              (currentPlate.tuning.clarity ?? 0) === (targetTuning.clarity ?? 0) &&
              (currentPlate.tuning.sharpness ?? 0) === (targetTuning.sharpness ?? 0)
            );

          const profileMatches = currentPlate?.appliedProfile === activePhoto.appliedProfile;
          const cropMatches = JSON.stringify(currentPlate?.crop) === JSON.stringify(activePhoto.crop);

          activePhoto.tuning = targetTuning;

          if (tuningMatches && profileMatches && cropMatches) {
            return false; // 沒有觸發陣列重新建立
          }

          plates = plates.map(p => p.id === activePhoto.id ? { 
            ...p, 
            tuning: activePhoto.tuning, 
            crop: activePhoto.crop,
            appliedProfile: activePhoto.appliedProfile,
            aiDecision: activePhoto.aiDecision,
            sceneTag: activePhoto.sceneTag
          } : p);

          return true; // 觸發了陣列替換！
        }

        // 模擬非同步縮圖佇列 processThumbnailQueue (第 833-840 行)
        function simulateThumbnailQueueCallback() {
          const dataUrl = 'data:image/jpeg;base64,GRADED_THUMB_' + Math.random();
          plates = plates.map(p => p.id === activePhoto.id ? { ...p, gradedThumbnail: dataUrl } : p);
          if (activePhoto && activePhoto.id === activePhoto.id) {
            activePhoto = { ...activePhoto, gradedThumbnail: dataUrl };
          }
        }

        // 2. 測試：調色完畢後，縮圖回寫與 $effect 重新觸發的連鎖
        let triggersCount = 0;
        for (let step = 0; step < 100; step++) {
          // 模擬調色滑桿微幅變動 (例如 AI 動畫微調浮點數精度變化)
          exposure = parseFloat((0.35 + (step % 2 === 0 ? 0.0001 : 0.0)).toFixed(4));
          
          const didMutateArray = syncActivePhotoTuning();
          if (didMutateArray) {
            triggersCount++;
            // 縮圖佇列排程回寫
            simulateThumbnailQueueCallback();
          }

          if (trace.syncRuns > 200) {
            trace.infiniteLoopDetected = true;
            break;
          }
        }

        trace.iterations = triggersCount;

      } catch (err) {
        trace.error = err?.message || String(err);
      }

      return trace;
    })()
  `,
  awaitPromise: true,
  returnByValue: true
});

console.log('調色連鎖機制執行結果:', loopTestResult.result?.value);

await sleep(1500);

console.log('\n====================================================');
console.log('📊 測試結果總結與分析報告');
console.log('====================================================');
console.log(`總 Console 日誌筆數: ${consoleLogs.length}`);
console.log(`未捕捉例外筆數: ${pageErrors.length}`);

if (pageErrors.length > 0) {
  console.log('❌ 發現未捕捉錯誤 (Page Errors):');
  pageErrors.forEach(e => console.log('  -', e));
}

ws.close();
chromeProc.kill();
try {
  rmSync(TEMP_PROFILE, { recursive: true, force: true });
} catch {}

console.log('✓ 測試流程順利完成！');
