import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { startDesktopPair, approveDesktopPair, desktopPairReview, desktopPairStatus, isDesktopAuthenticated, revokeDesktopDevice, listDesktopDevices, secretHash } from '../lib/admin/desktopDevice.js';
import pairHandler from '../api/studio-desktop.js';
import pipelineHandler from '../api/admin-newsletter-pipeline.js';
import workspaceHandler from '../api/admin-workspace.js';
import { createAdminSessionToken, ADMIN_COOKIE_NAME, ADMIN_SESSION_TTL_SECONDS } from '../lib/admin/auth.js';
import { validLocalRequest } from '../desktop/desktop.mjs';

test('one-time desktop pairing, revocation and existing auth boundaries', async () => {
  const original=globalThis.fetch,db=new Map(),index=new Set();
  process.env.KV_REST_API_URL='https://desktop-test.invalid';process.env.KV_REST_API_TOKEN='test-only';process.env.FIRSTSTEP_ADMIN_SESSION_SECRET='test-desktop-session-secret-never-production-123456';
  globalThis.fetch=async (_url,options)=>{
    const p=JSON.parse(options.body);let result;
    if(p[0]==='GET')result=db.get(p[1])??null;
    else if(p[0]==='SET'){if(p.includes('NX')&&db.has(p[1]))result=null;else{db.set(p[1],p[2]);result='OK';}}
    else if(p[0]==='SMEMBERS')result=[...index];
    else if(p[0]==='EVAL'&&p[1].includes('SADD')){if(db.get(p[3])!==p[5])result=0;else{db.set(p[3],p[6]);index.add(p[7]);result=1;}}
    else if(p[0]==='EVAL'&&p[1].includes('SREM')){db.delete(p[3]);index.delete(p[5]);result=1;}
    else throw new Error('Unexpected test command '+p[0]);
    return {ok:true,json:async()=>({result})};
  };
  function invoke(handler,request){return new Promise((yes,no)=>{const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(raw){yes({status:this.statusCode,headers:this.headers,body:JSON.parse(raw)})}};Promise.resolve(handler(request,res)).catch(no);});}
  const secret=randomBytes(32).toString('base64url'),base={method:'GET',url:'/api/studio-desktop?action=status',headers:{host:'www.1ststep.ai'}};
  try{
    assert.equal(ADMIN_SESSION_TTL_SECONDS,7200,'website login duration unchanged');
    await assert.rejects(startDesktopPair('not-a-hash'));
    const pair=await startDesktopPair(secretHash(secret));
    assert.match(pair.id,/^[a-f0-9]{32}$/);assert.match(pair.code,/^\d{6}$/);
    const req={...base,headers:{...base.headers,authorization:`StudioDevice ${pair.id}.${secret}`}};
    assert.equal((await desktopPairStatus(req)).paired,false);
    assert.equal(await isDesktopAuthenticated(req,'pipeline'),false);
    await assert.rejects(approveDesktopPair(pair.id,pair.code==='000000'?'000001':'000000'));
    await assert.rejects(approveDesktopPair(pair.id,pair.code,pair.expires_at));
    await assert.rejects(desktopPairReview(pair.id,pair.expires_at));
    assert.equal((await invoke(pairHandler,{...base,url:`/api/studio-desktop?action=review&id=${pair.id}`})).status,401);
    assert.equal((await invoke(pairHandler,{method:'POST',url:'/api/studio-desktop?action=approve',headers:{host:'www.1ststep.ai','content-type':'application/json'},body:{id:pair.id,code:pair.code}})).status,401);
    const cookie=`${ADMIN_COOKIE_NAME}=${createAdminSessionToken()}`;
    assert.equal((await invoke(pairHandler,{method:'POST',url:'/api/studio-desktop?action=approve',headers:{host:'www.1ststep.ai',cookie,origin:'https://evil.invalid','content-type':'application/json'},body:{id:pair.id,code:pair.code}})).status,403);
    const approved=await invoke(pairHandler,{method:'POST',url:'/api/studio-desktop?action=approve',headers:{host:'www.1ststep.ai',cookie,origin:'https://www.1ststep.ai','content-type':'application/json'},body:{id:pair.id,code:pair.code}});
    assert.equal(approved.status,200);
    assert.equal((await desktopPairStatus(req)).paired,true);
    assert.equal(await isDesktopAuthenticated(req,'pipeline'),true);
    assert.equal(await isDesktopAuthenticated(req,'workspace'),true);
    assert.equal(await isDesktopAuthenticated(req,'send-email'),false);
    assert.equal(await isDesktopAuthenticated(req,'payment'),false);
    assert.equal(await isDesktopAuthenticated({...base,headers:{authorization:`StudioDevice ${pair.id}.${randomBytes(32).toString('base64url')}`}},'pipeline'),false);
    await assert.rejects(approveDesktopPair(pair.id,pair.code),'pairing cannot be replayed');
    assert.equal((await listDesktopDevices()).length,1);
    assert.equal(JSON.stringify([...db.values()]).includes(secret),false,'raw connection secret never stored in cloud');
    const anonymous={method:'GET',url:'/api/admin-newsletter-pipeline',headers:{host:'www.1ststep.ai'}};
    assert.equal((await invoke(pipelineHandler,anonymous)).status,401);
    assert.equal((await invoke(workspaceHandler,anonymous)).status,401);
    assert.equal((await invoke(pairHandler,{...req,method:'DELETE',url:'/api/studio-desktop?id='+randomBytes(16).toString('hex')})).status,403,'device cannot revoke another PC');
    await revokeDesktopDevice(pair.id);
    assert.equal(await isDesktopAuthenticated(req,'pipeline'),false);
    await assert.rejects(desktopPairStatus(req));
    assert.equal((await listDesktopDevices()).length,0);
  } finally { globalThis.fetch=original; }
});
test('loopback host, cookie and CSRF boundaries',()=>{
  const key=randomBytes(32).toString('base64url'),origin='http://127.0.0.1:5619';
  const req={method:'GET',headers:{host:'127.0.0.1:5619',cookie:`studio_local=${key}`}};
  assert.equal(validLocalRequest(req,origin,key),true);
  assert.equal(validLocalRequest({...req,headers:{...req.headers,host:'evil.invalid'}},origin,key),false);
  assert.equal(validLocalRequest({...req,headers:{...req.headers,origin:'https://evil.invalid'}},origin,key),false);
  assert.equal(validLocalRequest({...req,headers:{host:req.headers.host}},origin,key),false);
  assert.equal(validLocalRequest({...req,method:'POST'},origin,key),false);
  assert.equal(validLocalRequest({...req,method:'POST',headers:{...req.headers,origin}},origin,key),true);
});
test('Windows DPAPI roundtrip keeps the credential out of plaintext storage',{skip:process.platform!=='win32'},async()=>{
  const value=JSON.stringify({secret:randomBytes(32).toString('base64url')});
  function crypt(mode,input){return new Promise((yes,no)=>{const p=execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',resolve('desktop/credential.ps1'),'-Mode',mode],{windowsHide:true},(e,out)=>e?no(e):yes(out.trim()));p.stdin.end(input);});}
  const encrypted=await crypt('Protect',value);assert.ok(encrypted.length>value.length);assert.ok(!encrypted.includes(value));assert.equal(await crypt('Unprotect',encrypted),value);
});
