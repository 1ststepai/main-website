import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { spawn, execFile } from "node:child_process";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLOUD = "https://www.1ststep.ai";
const PAIR_PATH = "/api/studio-desktop";
const ALLOWED = new Map([["/api/admin-newsletter-pipeline", ["GET", "POST"]], ["/api/admin-ugc-pipeline", ["GET", "POST"]], ["/api/admin-workspace", ["GET", "PUT"]]]);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon" };
function equal(a,b){const x=Buffer.from(a||""),y=Buffer.from(b||"");return x.length===y.length&&timingSafeEqual(x,y);}
export function validLocalRequest(req, origin, key) {
  return req.headers.host === new URL(origin).host
    && (!req.headers.origin || req.headers.origin === origin)
    && (!['POST','PUT','DELETE'].includes(req.method) || req.headers.origin === origin)
    && String(req.headers.cookie || '').split(';').some(v=>equal(v.trim(),`studio_local=${key}`));
}
function crypt(mode,input){return new Promise((yes,no)=>{
  const p=execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',resolve(HERE,'credential.ps1'),'-Mode',mode],{windowsHide:true,maxBuffer:1024*1024},(e,stdout)=>e?no(new Error('Windows credential protection failed.')):yes(stdout.trim()));
  p.stdin.end(input);
});}
async function loadProtected(name){try{return JSON.parse(await crypt('Unprotect',await readFile(resolve(ROOT,name),'utf8')));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function saveProtected(name,value){const path=resolve(ROOT,name),temp=path+'.'+randomBytes(8).toString('hex')+'.tmp';await writeFile(temp,await crypt('Protect',JSON.stringify(value)),{mode:0o600});await rename(temp,path);}
async function cloud(path,options={}){
  const response=await fetch(CLOUD+path,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>({message:'Cloud connection unavailable. Retry later.'}));
  if(!response.ok)throw Object.assign(new Error(data.message||'Cloud connection unavailable.'),{statusCode:response.status});return data;
}
function proof(c){return `StudioDevice ${c.id}.${c.secret}`;}
async function body(req){let count=0;const chunks=[];for await(const chunk of req){count+=chunk.length;if(count>2*1024*1024+1024)throw Object.assign(new Error('Update is too large.'),{statusCode:413});chunks.push(chunk);}return Buffer.concat(chunks);}
function respond(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
function openWindow(url){
  if(process.argv.includes('--window-url')){process.stdout.write(url+'\n');return;}
  const window=resolve(ROOT,'1stStep Studio.exe');
  if(existsSync(window)){const p=spawn(window,[],{detached:true,stdio:'ignore',windowsHide:false});p.unref();return;}
  const exe=resolve(process.env.PROGRAMFILES||'C:/Program Files','BraveSoftware/Brave-Browser/Application/brave.exe');
  const p=spawn(exe,['--profile-directory=Profile 2',`--app=${url}`],{detached:true,stdio:'ignore',windowsHide:false});p.unref();
}
export async function run(){
  await mkdir(ROOT,{recursive:true});
  const previous=await loadProtected('instance.dpapi');
  if(previous?.port&&previous?.key){
    try{const r=await fetch(`http://127.0.0.1:${previous.port}/launch`,{headers:{Authorization:`Bearer ${previous.key}`},signal:AbortSignal.timeout(1500)});const d=await r.json();if(r.ok&&d.service==='newsletter-studio'&&d.url.startsWith(`http://127.0.0.1:${previous.port}/bootstrap/`)){openWindow(d.url);return;}}catch{}
  }
  let credential=await loadProtected('connection.dpapi');
  const localKey=randomBytes(32).toString('base64url');
  const tickets=new Map();let origin;
  function ticket(){for(const [k,t]of tickets)if(t<Date.now())tickets.delete(k);if(tickets.size>8)tickets.clear();const key=randomBytes(32).toString('base64url');tickets.set(key,Date.now()+60000);return origin+'/bootstrap/'+key;}
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self' data:; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'");
    try{
      if(req.headers.host!==new URL(origin).host)return respond(res,403,{message:'Local host mismatch.'});
      const url=new URL(req.url,origin),path=url.pathname;
      if(path==='/launch'&&req.method==='GET'&&equal(req.headers.authorization,`Bearer ${localKey}`))return respond(res,200,{service:'newsletter-studio',url:ticket()});
      if(path.startsWith('/bootstrap/')&&req.method==='GET'){
        const key=path.slice('/bootstrap/'.length),until=tickets.get(key);tickets.delete(key);
        if(!until||until<Date.now())return respond(res,403,{message:'Open Newsletter Studio using the desktop shortcut.'});
        res.setHeader('Set-Cookie',`studio_local=${localKey}; Path=/; HttpOnly; SameSite=Strict`);
        res.writeHead(303,{Location:'/'});return res.end();
      }
      if(!validLocalRequest(req,origin,localKey))return respond(res,403,{message:'Open Newsletter Studio using its desktop shortcut.'});
      if(path==='/api/desktop-pair'&&req.method==='POST'){
        const secret=randomBytes(32).toString('base64url');
        const d=await cloud(PAIR_PATH+'?action=start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret_hash:createHash('sha256').update(secret).digest('hex')})});
        credential={id:d.pairing.id,secret,pending:true,code:d.pairing.code,expires_at:d.pairing.expires_at};await saveProtected('connection.dpapi',credential);
        return respond(res,200,{code:credential.code,approve_url:CLOUD+'/admin/?pair_device='+credential.id});
      }
      if(path==='/api/desktop-status'&&req.method==='GET'){
        if(!credential)return respond(res,200,{paired:false,pending:false});
        try{
          const d=await cloud(PAIR_PATH+'?action=status',{headers:{Authorization:proof(credential)}});
          if(d.paired&&credential.pending){credential={id:credential.id,secret:credential.secret,pending:false};await saveProtected('connection.dpapi',credential);}
          return respond(res,200,{paired:d.paired,pending:!d.paired,code:credential.code,approve_url:CLOUD+'/admin/?pair_device='+credential.id});
        }catch(e){if([401,410].includes(e.statusCode))return respond(res,200,{paired:false,pending:false,message:'Connection expired or disconnected. Pair this PC again.'});throw e;}
      }
      if(path==='/api/admin-session'){
        if(req.method==='GET')return respond(res,200,{ok:true,authenticated:!!credential&&!credential.pending,desktop_client:true,mfa_required:false});
        if(req.method==='DELETE'){
          if(credential)await cloud(PAIR_PATH+'?id='+credential.id,{method:'DELETE',headers:{Authorization:proof(credential)}}).catch(e=>{if(e.statusCode!==401)throw e;});
          credential=null;await saveProtected('connection.dpapi',null);return respond(res,200,{ok:true});
        }
        return respond(res,405,{message:'Pair this PC from the desktop connection screen.'});
      }
      if(path.startsWith('/api/')){
        if(!ALLOWED.get(path)?.includes(req.method))return respond(res,403,{message:'Use the secure website for sending, payments and other admin actions. Desktop access covers the pipeline and quote drafts.'});
        if(!credential||credential.pending)return respond(res,401,{message:'Pair this PC to reconnect to your cloud data.'});
        const data=await cloud(path,{method:req.method,headers:{Authorization:proof(credential),Origin:CLOUD,'Content-Type':'application/json'},...(['POST','PUT'].includes(req.method)?{body:await body(req)}:{})});
        return respond(res,200,data);
      }
      if(req.method!=='GET')return respond(res,405,{message:'Method not allowed.'});
      let file;
      if(path==='/'&&credential&&!credential.pending){res.writeHead(303,{Location:'/admin/?page=newsletter'});return res.end();}
      if(path==='/')file=resolve(HERE,'pair.html');
      else if(['/pair.js','/pair.css'].includes(path))file=resolve(HERE,path.slice(1));
      else if(path==='/app-icon.png')file=resolve(ROOT,'app-icon.png');
      else if(path.startsWith('/assets/')||path==='/admin/'||path==='/admin/index.html')file=resolve(ROOT,'site',path==='/admin/'?'admin/index.html':'.'+decodeURIComponent(path));
      else return respond(res,404,{message:'Page not found.'});
      const site=resolve(ROOT,'site')+sep;
      if(path.startsWith('/assets/')&&!file.startsWith(site))return respond(res,403,{message:'Path not allowed.'});
      const data=await readFile(file);res.setHeader('Content-Type',MIME[extname(file)]||'application/octet-stream');res.end(data);
    }catch(e){respond(res,e.statusCode||503,{message:e.statusCode&&e.statusCode<500?e.message:'Connection unavailable. Your cloud data is unchanged. Check internet access and retry.'});}
  });
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
  origin='http://127.0.0.1:'+server.address().port;
  await saveProtected('instance.dpapi',{port:server.address().port,key:localKey});
  openWindow(ticket());
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run().catch(()=>{writeFile(resolve(ROOT,'startup-error.txt'),'Newsletter Studio could not start. Check Windows credential protection and the installed browser; reopen the desktop shortcut.').finally(()=>process.exit(1));});
