import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/evanp/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({executablePath:'C:/Users/evanp/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe',headless:true,chromiumSandbox:true});
const page=await browser.newPage();
const errors=[], api=[], checks=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{
 const u=new URL(route.request().url());
 if(u.hostname!=='127.0.0.1') return route.abort();
 if(u.pathname==='/api/course-signup') {api.push(u.pathname);return route.abort();}
 return route.continue();
});
try {
 for(const width of [1440,1280,768,390,320]) {
  await page.setViewportSize({width,height:1000});
  await page.goto('http://127.0.0.1:4197/course/',{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,targets:[...document.querySelectorAll('.date-chip,.date-reminders a')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))}));
  assert.ok(metrics.scroll<=width,JSON.stringify(metrics));
  assert.ok(metrics.targets.every(t=>t.height>=44&&t.width>=44));
  checks.push({viewport:width,...metrics});
  const dec=page.locator('input[value=dec13]'), jan=page.locator('input[value=jan3]'), none=page.locator('input[value=none]');
  await dec.check();await jan.check();assert.equal(await dec.isChecked(),true);
  await none.check();assert.equal(await dec.isChecked(),false);assert.equal(await jan.isChecked(),false);
  await dec.check();assert.equal(await none.isChecked(),false);
  await jan.focus();await page.keyboard.press('Space');assert.equal(await jan.isChecked(),true);
  assert.equal(await jan.evaluate(el=>el.matches(':focus-visible')),true);
  if([1440,390].includes(width)) {
   await page.locator('.hero').screenshot({style:'.skip:not(:focus) { visibility:hidden; }',path:`evidence/course-date-vote/hero-${width}.png`});
   await jan.focus();
   await page.locator('#waitlist').screenshot({style:'.skip:not(:focus) { visibility:hidden; }',path:`evidence/course-date-vote/waitlist-${width}-selected.png`});
  }
  await page.locator('#waitlist-email').fill('fictional@example.com');
  await page.locator('[name=courseUpdates]').check();
  await page.getByRole('button',{name:'Join the waitlist',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Local simulation saved'}).waitFor();
  let record=await page.evaluate(()=>JSON.parse(localStorage.getItem('firststep.course.local-draft.v1')));
  assert.deepEqual(record,{simulation:true,startDates:['dec13','jan3'],kind:'waitlist',courseUpdates:true});
  await dec.uncheck();await jan.uncheck();
  await page.getByRole('button',{name:'Join the waitlist',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('firststep.course.local-draft.v1')).startDates.length===0);
 }
 await page.goto('http://127.0.0.1:4197/course/library/',{waitUntil:'networkidle'});
 assert.equal(await page.locator('[name=startDates]').count(),0);
 assert.deepEqual(api,[]);assert.deepEqual(errors,[]);
 await writeFile('evidence/course-date-vote/browser-checks.json',JSON.stringify({checks,errors,courseApiCalls:api,results:'PASS: keyboard, exclusive-none UX, multiselect, optional empty submission, anonymous local persistence, library has no date controls'},null,2)+'\n');
} finally {await browser.close();}
