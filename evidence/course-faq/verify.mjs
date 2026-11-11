import {readFile} from 'node:fs/promises';
// Uses the Playwright install already on Evan's Codex PC; falls back to a project install if present.
const { chromium } = await import('file:///C:/gh-runners/skillsprout/_work/skillsprout/skillsprout/node_modules/playwright-core/index.mjs').catch(() => import('playwright-core'));
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH || 'C:/Users/evanp/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe',headless:true,chromiumSandbox:true});
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
for (const path of ['course', 'course/library']) {
 await page.goto('http://127.0.0.1:4186/'+path+'/');
 const text=await page.locator('body').innerText();
 if(/LOCAL DRAFT|NOT LIVE|UNPUBLISHED|Local simulation only|Evan to decide|evidence pending/.test(text))throw Error('Draft label');
 if(await page.locator('meta[name=robots][content*=noindex]').count())throw Error('Noindex');
 if(!await page.locator('form a[href="/privacy.html"]').count())throw Error('Privacy link missing');
 if(!text.includes('No payment is taken'))throw Error('Payment status missing');
 if(path==='course')for(const answer of JSON.parse(await readFile(new URL('./approved-policy-answers.json',import.meta.url),'utf8')))if(!text.includes(answer))throw Error('Policy answer changed');
}
await page.goto('http://127.0.0.1:4186/course/');
if(await page.locator('.decision-marker').count()!==0)throw Error('Unexpected decision markers');
if(/Evan to decide/i.test(await page.locator('body').innerText()))throw Error('Unresolved owner decision text');
for(const question of [
 'What is the refund policy?',
 'What if I cannot attend a session? Will there be recordings?',
 'How many hours should I allow each week?',
 'Do I need paid AI tools? Are there extra costs?',
 'What feedback will I receive on my work?',
 'What can I access after the four workshops?',
 'Do I have to attend every session live?',
])if(await page.getByRole('heading',{name:question,exact:true}).count()!==1)throw Error('Missing policy question: '+question);
await page.locator('.signup a[href="/course/library/"]').click();
if(await page.locator('[name=courseUpdates]').isChecked())throw Error('Prechecked library consent');
await page.locator('[name=email]').fill('fictional@example.com');
const automaticDownload=page.waitForEvent('download');await page.locator('form button').click();
if((await automaticDownload).suggestedFilename()!=='business-prompt-library.md')throw Error('Automatic download failed');
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
