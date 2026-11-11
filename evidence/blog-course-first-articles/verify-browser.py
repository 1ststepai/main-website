"""Local built-page QA using installed Chrome and Python websocket-client."""
import base64, json, subprocess, tempfile, time, urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import websocket
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
server=ThreadingHTTPServer(('127.0.0.1',8765),partial(SimpleHTTPRequestHandler,directory=str(ROOT/'dist')))
Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory(prefix='article-chrome-') as profile:
 chrome=subprocess.Popen([r'C:/Program Files/Google/Chrome/Application/chrome.exe','--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9225','--remote-allow-origins=*','--user-data-dir='+profile,'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  for _ in range(100):
   try:
    targets=json.load(urllib.request.urlopen('http://127.0.0.1:9225/json'));break
   except Exception:time.sleep(.1)
  ws=websocket.create_connection(next(t for t in targets if t['type']=='page')['webSocketDebuggerUrl']);seq=0
  def cdp(method,params={}):
   global seq
   seq+=1;ws.send(json.dumps(dict(id=seq,method=method,params=params)))
   while True:
    r=json.loads(ws.recv())
    if r.get('id')==seq:
     if 'error' in r:raise RuntimeError(r)
     return r.get('result',{})
  def js(s):
   r=cdp('Runtime.evaluate',dict(expression=s,returnByValue=True,awaitPromise=True))
   if 'exceptionDetails' in r: raise RuntimeError(r)
   return r['result'].get('value')
  cdp('Page.enable');results=[]
  slugs=['how-to-start-using-ai-in-your-small-business','ai-for-business-privacy-and-checking-answers']
  for slug,name in zip(slugs,['first-task','privacy']):
   cdp('Page.navigate',dict(url='http://127.0.0.1:8765/blog/'+slug+'/'))
   time.sleep(1)
   for width in [1440,1280,768,390,320]:
    height=1000 if width==1440 else 900 if width==1280 else 1024 if width==768 else 844
    cdp('Emulation.setDeviceMetricsOverride',dict(width=width,height=height,deviceScaleFactor=1,mobile=False))
    js('document.fonts.ready.then(()=>true)');time.sleep(.15)
    data=js("""(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,h1:document.querySelectorAll('h1').length,font:getComputedStyle(document.body).fontFamily,background:getComputedStyle(document.body).backgroundColor,byline:document.querySelector('.blog-byline').textContent,logoLoaded:document.querySelector('.brand img').naturalWidth>0,loopColumns:document.querySelector('.blog-review-loop ol')?getComputedStyle(document.querySelector('.blog-review-loop ol')).gridTemplateColumns:null,links:[...document.querySelectorAll('a[href^="/"]')].map(a=>a.getAttribute('href'))}))()""")
    assert data['scrollWidth']<=width,data
    assert data['logoLoaded'] and data['h1']==1 and 'Draft' not in data['byline']
    results.append(dict(slug=slug,**data))
    if width in [1440,390]:
     full=cdp('Page.getLayoutMetrics')['cssContentSize']
     shot=cdp('Page.captureScreenshot',dict(format='png',captureBeyondViewport=True,clip=dict(x=0,y=0,width=width,height=full['height'],scale=1)))
     (OUT/(name+('-desktop.png' if width==1440 else '-mobile.png'))).write_bytes(base64.b64decode(shot['data']))
    if width==390 and name=='first-task':
     box=js("(()=>{let r=document.querySelector('.blog-review-loop').getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()")
     shot=cdp('Page.captureScreenshot',dict(format='png',captureBeyondViewport=True,clip=box))
     (OUT/'review-loop-mobile.png').write_bytes(base64.b64decode(shot['data']))
   for link in set(data['links']):
    assert urllib.request.urlopen('http://127.0.0.1:8765'+link).status==200
  def lum(h):
   a=[int(h[i:i+2],16)/255 for i in (1,3,5)]
   a=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in a]
   return sum(v*w for v,w in zip(a,[.2126,.7152,.0722]))
  contrasts=[]
  for fg in ['#0059CC','#0B0D0E','#4B5563']:
   for bg in ['#FFFFFF','#F3F4F0']:
    l=sorted([lum(fg),lum(bg)]);ratio=(l[1]+.05)/(l[0]+.05)
    assert ratio>=4.5
    contrasts.append(dict(foreground=fg,background=bg,ratio=round(ratio,3)))
  (OUT/'browser-checks.json').write_text(json.dumps(dict(viewports=results,contrast=contrasts),indent=2)+'\n')
  print(json.dumps(dict(viewports=len(results),overflow='none',contrast=contrasts)))
 finally:
  chrome.terminate();chrome.wait();server.shutdown();time.sleep(1)

