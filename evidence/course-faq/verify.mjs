import { chromium } from 'file:///C:/gh-runners/skillsprout/_work/skillsprout/skillsprout/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({executablePath:'C:/Users/evanp/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe',headless:true,chromiumSandbox:true});
const page = await browser.newPage();
const errors=[], external=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'){external.push(u.origin);return route.abort();}return route.continue();});
for(const [name,width,height] of [['desktop',1440,1000],['laptop',1280,900],['tablet',768,1024],['mobile',390,844],['small',320,844]]){
 await page.setViewportSize({width,height});
 for(const path of ['course','course/library']){
  await page.goto('http://127.0.0.1:4186/'+path+'/', {waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Overflow '+path+' '+width);
  console.log(path,name,await page.evaluate(()=>({width:innerWidth,height:document.documentElement.scrollHeight,title:document.title})));
  await page.screenshot({path:'evidence/course-faq/'+path.replace('/','-')+'-'+name+'.png',fullPage:true});
  if(['desktop','mobile'].includes(name))for(const selector of path==='course'?['.lesson','#workshops','#practice','.instructor','.faq','.signup']:['.resource']){
   await page.locator(selector).scrollIntoViewIfNeeded();await page.screenshot({path:'evidence/course-faq/'+path.replace('/','-')+'-'+name+'-'+selector.replace(/[.#]/g,'')+'.png'});
  }
 }
}
for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
 await page.setViewportSize({width,height}); await page.goto('http://127.0.0.1:4186/course/',{waitUntil:'networkidle'});
 for(const [label,selector] of [['answers','.faq h2'],['policies','.faq-decisions']]){await page.locator(selector).evaluate(el=>el.scrollIntoView({behavior:'instant'}));await page.screenshot({path:`evidence/course-faq/faq-${name}-${label}.png`});}
}
await page.goto('http://127.0.0.1:4186/course/');
if(await page.locator('.decision-marker').count()!==7)throw Error('Missing owner decision markers');
await page.locator('.signup a').click();
if(await page.locator('[name=courseUpdates]').isChecked())throw Error('Prechecked library consent');
await page.locator('[name=email]').fill('fictional@example.com');await page.locator('form button').click();
await page.getByRole('status').filter({hasText:'Course-update choice: no.'}).waitFor();
await page.locator('[name=courseUpdates]').check();await page.locator('form button').click();
await page.getByRole('status').filter({hasText:'Course-update choice: yes'}).waitFor();
await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('blocked')}});
await page.locator('form button').click();await page.getByRole('status').filter({hasText:'not saved'}).waitFor();
if(await page.locator('[name=email]').inputValue()!=='fictional@example.com')throw Error('Input lost');
await page.goto('http://127.0.0.1:4186/course');await page.evaluate(()=>localStorage.clear());
if(await page.locator('[name=courseUpdates]').isChecked())throw Error('Prechecked waitlist consent');
await page.locator('[name=email]').fill('fictional@example.com');await page.locator('form button').click();
if(await page.evaluate(()=>localStorage.length))throw Error('Unchecked waitlist saved');
await page.locator('[name=courseUpdates]').check();await page.locator('form button').click();await page.getByRole('status').filter({hasText:'Local simulation saved'}).waitFor();
await page.goto('http://127.0.0.1:4186/course/library/');
const downloadEvent=page.waitForEvent('download');await page.locator('[data-library-download]').click();const download=await downloadEvent;
if(download.suggestedFilename()!=='business-prompt-library.md')throw Error('Download failed');
if(errors.length || external.length) throw Error('Browser errors or external requests');
console.log(JSON.stringify({screenshots:28,overflow:'none at 320,390,768,1280,1440',consent:'library off/on passed; waitlist initially unchecked, unchecked blocked, checked saved',persistenceFailure:'passed; input retained',download:'passed',pageErrors:errors,externalRequests:external}));
await browser.close();
