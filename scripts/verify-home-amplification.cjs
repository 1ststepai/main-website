// Uses an existing Playwright installation. Candidate: 4176; approved f47b1b1 baseline: 4175.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
fs.mkdirSync('output/playwright', { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const width of [1440, 1280, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.goto('http://127.0.0.1:4175/');
      await page.evaluate(() => document.fonts.ready);
      const baselineHeight = await page.evaluate(() => document.body.scrollHeight);
      await page.goto('http://127.0.0.1:4176/');
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('main > section').count(), 6);
      assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some(e => /nova-public|job-agent-public/.test(e.name))), false, 'additional captures only load on selection');
      const products = [];
      for (const key of ['daysetgo', 'job-agent', 'nova']) {
        await page.locator(`button[data-product="${key}"]`).click();
        await page.waitForFunction(key => document.querySelector('.product-stage').dataset.product === key && !document.querySelector('.product-stage').hasAttribute('aria-busy'), key);
        const state = await page.evaluate(() => ({height:document.body.scrollHeight, overflow:document.documentElement.scrollWidth > innerWidth}));
        assert.equal(state.overflow, false);
        assert.ok(state.height <= baselineHeight + 1, `${width} ${key}: homepage length grew (${state.height} > ${baselineHeight})`);
        assert.equal(await page.locator(`button[data-product="${key}"]`).getAttribute('aria-pressed'), 'true');
        if(key === 'job-agent') assert.match(await page.locator('.product-stage figcaption').innerText(), /requires sign-in/);
        if(key === 'nova') assert.match(await page.locator('.product-stage figcaption').innerText(), /No email was entered/);
        products.push({key,...state});
      }
      await page.locator('button[data-product="nova"]').focus();
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => document.querySelector('.product-stage').dataset.product === 'job-agent');
      assert.equal(await page.locator('button[data-product="job-agent"]').evaluate(e => getComputedStyle(e).outlineWidth), '3px');
      for(let step=1;step<=6;step++) {
        await page.locator('#machine-next').click();
        assert.equal(await page.locator('.build-machine').getAttribute('data-step'), String(step));
        if(step===6) {
          await page.waitForTimeout(1300); // Measure the settled, finite handoff animation.
          assert.equal(await page.locator('.owner-handoff').evaluate(e => getComputedStyle(e).opacity), '1');
          await page.locator('.build-machine').screenshot({path:`output/playwright/handoff-${width}.png`});
        }
      }
      await page.locator('#machine-reset').click();
      await page.locator('.motion-toggle').click();
      await page.locator('button[data-product="nova"]').click();
      await page.waitForFunction(() => document.querySelector('.product-stage').dataset.product === 'nova');
      assert.equal(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length), 0);
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.locator('[data-path-choice="finish_build"]').click();
      assert.equal(await page.locator('.plane-front').evaluate(e => getComputedStyle(e).transitionDuration), '0s');
      results.push({width,baselineHeight,products,keyboard:true,pause:true,reducedMotion:true});
      await page.close();
    }
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:4176/');
    const initialImage = await page.locator('.product-screen img').getAttribute('src');
    await page.route('**/nova-public-gate-20260922.webp', route => route.abort());
    await page.locator('button[data-product="nova"]').click();
    await page.waitForFunction(() => document.querySelector('.product-stage figcaption').textContent.includes('could not load'));
    assert.equal(await page.locator('.product-screen img').getAttribute('src'), initialImage);
    assert.equal(await page.locator('button[data-product="daysetgo"]').getAttribute('aria-pressed'), 'true');
    await page.unroute('**/nova-public-gate-20260922.webp');
    await page.locator('button[data-product="nova"]').click();
    await page.waitForFunction(() => document.querySelector('.product-stage').dataset.product === 'nova');
    await page.close();
    const nojs = await browser.newPage({javaScriptEnabled:false});
    await nojs.goto('http://127.0.0.1:4176/');
    assert.equal(await nojs.locator('.product-switcher noscript a').count(),2);
    assert.equal(await nojs.locator('.path-selector noscript a').count(),3);
    await nojs.close();
    const report={results,assetFailureAndRetry:true,noJS:true,baseline:'f47b1b19a689ec4c854409c08b263c8a75244f25'};
    fs.writeFileSync('output/amplification-results.json',JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
