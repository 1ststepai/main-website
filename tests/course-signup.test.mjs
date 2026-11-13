import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeCourseSignup, courseTags} from '../lib/course/normalizeCourseSignup.js';
import {deliverCourseSignup} from '../lib/course/goHighLevel.js';
import {createCourseSignupHandler} from '../api/course-signup.js';
import {createCourseApiAdapter} from '../src/course/api-adapter.js';
const signup = {kind:'library',email:'person@example.com',courseUpdates:false};
const token = 'fake-test-token';
const env = {COURSE_GHL_TOKEN:token};
let ip = 0;
async function invoke(body=signup, extra={}, options={env:{}}) {
 const req={method:'POST',headers:{'content-type':'application/json','x-real-ip':`198.51.100.${(++ip % 200) + 1}`},body,...extra};
 const res={headers:{},setHeader(k,v){this.headers[k]=v},getHeader(k){return this.headers[k]},end(s){this.body=s ? JSON.parse(s):null}};
 await createCourseSignupHandler(options)(req,res);return res;
}
test('normalization, boolean consent, kind and email validation',()=>{
 assert.equal(normalizeCourseSignup({...signup,email:' Person@EXAMPLE.com '}).email,signup.email);
 for(const [body,code] of [[{...signup,kind:'other'},'invalid-request'],[{...signup,courseUpdates:'true'},'invalid-request'],[{...signup,email:'bad'},'invalid-email'],[{...signup,email:'a'.repeat(255)+'@x.com'},'invalid-email'],[{...signup,kind:'waitlist'},'consent-required']]) assert.throws(()=>normalizeCourseSignup(body),e=>e.code===code);
});
test('each signup applies only its selected tags after upsert',async()=>{
 for(const body of [signup,{...signup,courseUpdates:true},{...signup,kind:'waitlist',courseUpdates:true}]) {
  const calls=[]; const result=await deliverCourseSignup(body,{env,fetchImpl:async(url,options)=>{calls.push({url,...options,body:JSON.parse(options.body)});return {ok:true,json:async()=>({contact:{id:'contact-id'}})}}});
  assert.equal(result.statusCode,201); assert.deepEqual(calls[0].body,{locationId:'ER85bbRj2EUSuMtO0uFQ',email:body.email,source:body.kind==='library'?'1ststep.ai /course/library':'1ststep.ai /course'});
  assert.equal('tags' in calls[0].body,false);assert.match(calls[1].url,/\/contacts\/contact-id\/tags$/);
  const expected=body.kind==='waitlist'?['course-waitlist']:body.courseUpdates?['course-prompt-library','course-waitlist']:['course-prompt-library'];
  assert.deepEqual(courseTags(body),expected);assert.deepEqual(calls[1].body,{tags:expected});
  assert.equal(calls[0].headers.Version,'2021-07-28');
 }
});
test('unconfigured, upstream error, timeout, missing id and tag failure never report success or leak',async()=>{
 assert.equal((await invoke()).statusCode,503);
 for(const failure of ['upsert','timeout','id','tags']) {
  let calls=0;
  const res=await invoke(signup,{}, {env,fetchImpl:async()=>{calls++;if(failure==='timeout')throw Error(token+' RAW_ERROR');return {ok: !(failure==='upsert'||failure==='tags'&&calls===2),json:async()=>failure==='id'?{}:{contact:{id:'id'},error:token+' RAW_ERROR'}}}});
  assert.equal(res.statusCode,502);assert.equal(res.body.ok,false);assert.equal(res.body.code,'delivery_unavailable');assert.doesNotMatch(JSON.stringify(res.body),/fake-test-token|RAW_ERROR/);
 }
});
test('handler enforces method, JSON, body size, validation, CORS and no-store',async()=>{
 for(const [extra,body,status] of [[{method:'GET'},signup,405],[{headers:{'content-type':'text/plain'}},signup,415],[{},'x'.repeat(4097),413],[{},'{',400],[{},{...signup,kind:'wrong'},400],[{headers:{origin:'https://bad.example','content-type':'application/json'}},signup,403]]) {
 const res=await invoke(body,extra);assert.equal(res.statusCode,status);assert.equal(res.headers['Cache-Control'],'no-store');
 }
 assert.equal((await invoke(signup,{method:'OPTIONS'})).statusCode,204);
});
test('idempotent retries send once; different payload conflicts; rate limit enforced',async()=>{
 let calls=0;const options={env,fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({contact:{id:'id'}})}}};
 const headers={'content-type':'application/json','idempotency-key':'course-test-replay'};
 assert.equal((await invoke(signup,{headers},options)).statusCode,201);
 assert.equal((await invoke(signup,{headers},options)).headers['Idempotency-Replayed'],'true');assert.equal(calls,2);
 assert.equal((await invoke({...signup,courseUpdates:true},{headers},options)).statusCode,409);
 let res;for(let i=0;i<13;i++)res=await invoke(signup,{headers:{'content-type':'application/json','x-real-ip':'203.0.113.201'}});
 assert.equal(res.statusCode,429);
});
test('browser adapter uses same-origin JSON and rejects unsuccessful responses',async()=>{
 let call; const adapter=createCourseApiAdapter({fetchImpl:async(...args)=>{call=args;return {ok:true,json:async()=>({ok:true,...signup})}}});
 assert.equal((await adapter.submit(signup)).ok,true);assert.equal(call[0],'/api/course-signup');assert.ok(call[1].headers['Idempotency-Key']);assert.deepEqual(JSON.parse(call[1].body),signup);
 assert.equal((await createCourseApiAdapter({fetchImpl:async()=>({ok:false,json:async()=>({code:'rate_limited'})})}).submit(signup)).code,'rate_limited');
});
test('course pages are indexable with privacy, closed payments and build/route wiring',async()=>{
 const vite=await readFile('vite.config.js','utf8');const vercel=JSON.parse(await readFile('vercel.json','utf8'));
 for(const path of ['course','course/library']) {
 const html=await readFile(path+'/index.html','utf8');assert.doesNotMatch(html,/LOCAL DRAFT|NOT LIVE|noindex|firststep-no-site-analytics|simulation only|evidence pending|subject to approval|Evan to decide|first-article-visual-brief/i);assert.match(html,/href="\/privacy.html"/);assert.match(html,/No payment is taken/);if(path==='course/library') assert.match(html,/Dates are not announced yet/); else { assert.match(html,/start date is being chosen by a waitlist vote/); assert.match(html,/Pick every date that works/); }assert.ok(vite.includes(path+'/index.html'));
 for(const suffix of ['', '/'])assert.ok(vercel.rewrites.some(r=>r.source==='/'+path+suffix&&r.destination==='/'+path+'/index.html'));
 }
});

test('seven approved policy answers remain verbatim',async()=>{
 const answers=JSON.parse(await readFile('evidence/course-faq/approved-policy-answers.json','utf8'));
 assert.equal(answers.length,7);const html=await readFile('course/index.html','utf8');for(const answer of answers)assert.ok(html.includes('<p>'+answer+'</p>'));
});

test('waitlist dates canonicalize, map only allowlisted tags and reject invalid input', async()=>{
 const base={...signup,kind:'waitlist',courseUpdates:true};
 for(const dates of [undefined,[],['dec13'],['jan3'],['jan10'],['none'],['none','jan3','dec13','jan3']]) {
  const normalized=normalizeCourseSignup({...base,startDates:dates});
  const expected=['dec13','jan3','jan10','none'].filter(key=>dates?.includes(key));
  assert.deepEqual(normalized.startDates,expected);
  assert.deepEqual(courseTags(normalized),['course-waitlist',...expected.map(key=>'course-date-'+key)]);
  const calls=[];
  await deliverCourseSignup(normalized,{env,fetchImpl:async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({contact:{id:'id'}})}}});
  assert.deepEqual(calls[1],{tags:courseTags(normalized)});
 }
 for(const dates of [null,'dec13',{},[1],['DEC13'],['other'],['dec13',null]]) {
  const response=await invoke({...base,startDates:dates});
  assert.equal(response.statusCode,400);assert.equal(response.body.code,'invalid-request');
 }
 for(const dates of [['dec13'],['none'],null,'bad']) {
  const normalized=normalizeCourseSignup({...signup,courseUpdates:true,startDates:dates});
  assert.equal('startDates' in normalized,false);
  assert.deepEqual(courseTags(normalized),['course-prompt-library','course-waitlist']);
 }
});
test('date votes participate in canonical idempotency hashing',async()=>{
 const headers={'content-type':'application/json','idempotency-key':'course-date-vote-test'};
 const body={...signup,kind:'waitlist',courseUpdates:true,startDates:['jan3','dec13']};
 let calls=0;const options={env,fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({contact:{id:'id'}})}}};
 assert.equal((await invoke(body,{headers},options)).statusCode,201);
 assert.equal((await invoke({...body,startDates:['dec13','jan3','jan3']},{headers},options)).headers['Idempotency-Replayed'],'true');
 assert.equal((await invoke({...body,startDates:['none']},{headers},options)).statusCode,409);
 assert.equal(calls,2);
});
