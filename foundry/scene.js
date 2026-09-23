import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
// One procedural instrument: ten semantic cassettes dock around an inspectable core.
export function createFoundry(host){
 const mobile=matchMedia('(max-width:760px)').matches;
 const renderer=new T.WebGLRenderer({antialias:!mobile,alpha:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1:1.5));renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.45;host.append(renderer.domElement);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1,.1,80),root=new T.Group();scene.add(root);
 const environment=new RoomEnvironment();const pmrem=new T.PMREMGenerator(renderer);const env=pmrem.fromScene(environment,.04);scene.environment=env.texture;environment.dispose();pmrem.dispose();
 scene.add(new T.HemisphereLight(0xbce4ff,0x080a14,2));
 for(const [color,power,x,y,z]of [[0xc5eaff,100,2,6,6],[0x7b67ff,75,-5,0,3],[0x6dcaff,110,3,-3,2]]){const l=new T.PointLight(color,power);l.position.set(x,y,z);scene.add(l)}
 const steel=new T.MeshStandardMaterial({color:0x425462,metalness:.82,roughness:.27});
 const black=new T.MeshStandardMaterial({color:0x101b25,metalness:.65,roughness:.3});
 const signal=new T.MeshBasicMaterial({color:0x91e5fa});
 
 const labels=['UI','DATA','AUTH','AI','AUTOMATION','INTEGRATIONS','ANALYTICS','DEPLOYMENT','EVIDENCE','DOCUMENTATION'];
 const textures=[];
 function label(text,size=.2,color='#c7e7ef'){const c=document.createElement('canvas');c.width=512;c.height=64;const ctx=c.getContext('2d');ctx.font='28px monospace';ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,256,43);const t=new T.CanvasTexture(c);textures.push(t);const s=new T.Sprite(new T.SpriteMaterial({map:t,transparent:true,depthTest:false}));s.scale.set(size*8,size,1);return s}
 function mesh(geo,mat,parent=root){const m=new T.Mesh(geo,mat);parent.add(m);return m}
 function ring(radius,tube,mat,parent=root){return mesh(new T.TorusGeometry(radius,tube,8,mobile?64:120),mat,parent)}
 function sector(inner,outer,start,length,depth){const s=new T.Shape();s.absarc(0,0,outer,start,start+length,false);s.absarc(0,0,inner,start+length,start,true);s.closePath();return new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.035,bevelThickness:.025,curveSegments:12})}
 const core=new T.Group();root.add(core);
 ring(1.72,.085,steel,core);ring(1.61,.012,signal,core);ring(1.25,.026,steel,core).position.z=.16;
 for(let i=0;i<48;i++){let a=i/48*Math.PI*2;const tooth=mesh(new T.BoxGeometry(.025,.12,.07),i%4===0?signal:steel,core);tooth.position.set(Math.cos(a)*1.79,Math.sin(a)*1.79,.05);tooth.rotation.z=a-Math.PI/2}
 const iris=[];for(let i=0;i<8;i++){const blade=mesh(sector(.38,1.18,i*Math.PI/4,.69,.035),steel,core);blade.position.z=.02*i;iris.push(blade)}
 const modules=[];for(let i=0;i<10;i++){const g=new T.Group();root.add(g);const a=i*Math.PI/5;mesh(sector(2,2.66,a,.49,.22),steel,g);mesh(sector(2.08,2.57,a+.035,.42,.03),black,g).position.z=.245;mesh(sector(2.05,2.07,a+.02,.45,.012),signal,g).position.z=.29;
 for(let j=0;j<5;j++){const ang=a+.085+j*.07;const fin=mesh(new T.BoxGeometry(.018,.3,.11),steel,g);fin.position.set(Math.cos(ang)*2.33,Math.sin(ang)*2.33,.3);fin.rotation.z=ang-Math.PI/2}
 const text=label(labels[i],.14);text.position.set(Math.cos(a+.24)*3,Math.sin(a+.24)*3,.3);g.add(text);modules.push({g,a});}
 const hoops=new T.Group();root.add(hoops);ring(3.18,.015,steel,hoops);ring(3.28,.006,signal,hoops);hoops.rotation.x=.24;
 const scan=mesh(new T.PlaneGeometry(6,.022),new T.MeshBasicMaterial({color:0x9aeaff,transparent:true,opacity:.7}));scan.position.z=.5;
 const traces=[];for(let i=0;i<10;i++){const a=i*Math.PI/5+.24;const points=[new T.Vector3(Math.cos(a)*2.05,Math.sin(a)*2.05,.25),new T.Vector3(Math.cos(a)*1.92,Math.sin(a)*1.92,.62),new T.Vector3(Math.cos(a)*1.4,Math.sin(a)*1.4,.62)];const line=mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),12,.013,4,false),signal);traces.push(line)}
 const product=new T.Group();root.add(product);mesh(new T.BoxGeometry(3.7,2.63,.13),black,product);const screenMat=new T.MeshBasicMaterial({color:0xffffff});const screen=mesh(new T.PlaneGeometry(3.56,2.47),screenMat,product);screen.position.z=.08;
 let disposed=false;
 new T.TextureLoader().load('/assets/foundry/product.webp',texture=>{if(disposed){texture.dispose();return}texture.colorSpace=T.SRGBColorSpace;textures.push(texture);screenMat.map=texture;screenMat.needsUpdate=true;wake()});product.visible=false;
 // Merge static meshes within each moving assembly to reduce draw calls.
 for(const group of [...modules.map(m=>m.g),core]){
  for(const material of [steel,black,signal]){
   const items=group.children.filter(o=>o.isMesh&&o.material===material&&!iris.includes(o));
   if(items.length<2)continue;
   const parts=items.map(o=>{o.updateMatrix();return o.geometry.clone().applyMatrix4(o.matrix)});
   const joined=mergeGeometries(parts);parts.forEach(g=>g.dispose());
   if(joined){items.forEach(o=>{group.remove(o);o.geometry.dispose()});mesh(joined,material,group)}
  }
 }
 const owners=new T.Group();root.add(owners);const owner=ring(.63,.035,signal,owners);owner.position.set(0,0,1.1);const ot=label('OWNER',.23);ot.position.set(0,0,1.2);owners.add(ot);const tokens=[];for(let i=0;i<6;i++){const g=new T.Group();owners.add(g);mesh(sector(.14,.32,0,Math.PI*2,.09),steel,g);const t=label(['SOURCE','INFRASTRUCTURE','ACCESS','DATA','DOCUMENTATION','EVIDENCE'][i],.13);t.position.set(0,-.46,.2);g.add(t);tokens.push(g)}
 const human=label('HUMAN CONTROL',.18,'#cbf5df');human.position.set(0,-1.12,.9);root.add(human);
 let target=0,current=0,path='build',phase=0,raf=0,visible=true,settled=0,px=0,py=0,slow=0,last=0,quality=mobile?'mobile':'full';
 const clamp=(v)=>Math.min(1,Math.max(0,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
 function frame(now){raf=0;if(disposed||document.hidden||!visible)return;const delta=Math.min(.05,(now-last)/1000||.016);if(last&&now-last>40)slow++;last=now;if(slow>12&&quality==='full'){quality='economy';renderer.setPixelRatio(1);host.dataset.quality=quality}current+=(target-current)*(1-Math.exp(-delta*9));phase+=delta;
 const assemble=smooth((current-.16)/.36),reveal=smooth((current-.55)/.13),handoff=smooth((current-.79)/.2);
 root.scale.setScalar(mobile?.58:1);root.position.set(mobile?.15:1.75,mobile?-.6:0,0);root.rotation.set(.52*(1-reveal)+py*.035,(-.6+Math.sin(current*Math.PI)*.45)*(1-reveal)+px*.06,.16*(1-reveal));
 for(const [index,{g,a}]of modules.entries()){const scatter=1-assemble;const gap=path==='finish'?.28:path==='automate'?1.8:1.1;g.position.set(Math.cos(a)*(scatter*gap+handoff*.8),Math.sin(a)*(scatter*gap+handoff*.8),scatter*(Math.sin(a*3)*1.4)+handoff*-.6);if(path==='automate'){g.position.x+=scatter*((index%3-1)*1.7-Math.cos(a));g.position.y+=scatter*((Math.floor(index/3)-1.5)*.55);g.position.z+=scatter*(index%2?1:-1)}g.rotation.set(scatter*(path==='automate'?Math.cos(a)*.9:.13),scatter*Math.sin(a)*.55,scatter*(path==='finish'?.02:.13));g.scale.setScalar(1-handoff*.14);g.visible=reveal<.95||handoff>0}
 iris.forEach((b,i)=>{b.position.z=.02*i+(1-assemble)*(i-4)*.2;b.rotation.z=reveal*.75;b.scale.setScalar(1-reveal*.55)});
 core.scale.setScalar(1-reveal*.2);hoops.rotation.y=.15+current*.55;hoops.scale.setScalar(1+handoff*.25);
 traces.forEach((t,i)=>{t.visible=assemble>(i/15)&&reveal<.9});scan.visible=path==='finish'&&current>.1&&current<.58;scan.position.y=Math.sin(current*24)*2.6;
 human.visible=path==='automate'&&handoff<.4;product.visible=reveal>.01&&handoff<.9;product.scale.setScalar(Math.max(.001,reveal*(1-handoff*.9)));product.position.z=.7+reveal*.6-handoff;
 owners.visible=handoff>.001;owners.scale.setScalar(Math.max(.001,handoff));tokens.forEach((g,i)=>{const a=i*Math.PI/3;const r=2.4-smooth((handoff-.3)/.7)*1.35;g.position.set(Math.cos(a)*r,Math.sin(a)*r,1+handoff*.2);g.rotation.z=(1-handoff)*.8});
 const distance=mobile?14.5:12.5;camera.position.set(.45+px*.12,(1-reveal)*.9+py*.08,distance-assemble*1.1+handoff*1.2);camera.lookAt(mobile?0:.4,mobile?-.3:0,0);renderer.render(scene,camera);host.dataset.progress=current.toFixed(3);host.dataset.quality=quality;
 if(Math.abs(target-current)>.0002||settled<20){settled++;raf=requestAnimationFrame(frame)} }
 function wake(){settled=0;if(!raf&&!disposed&&visible&&!document.hidden){last=0;raf=requestAnimationFrame(frame)}}
 function resize(){renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();wake()}
 function pointer(e){px=(e.clientX/innerWidth-.5);py=(e.clientY/innerHeight-.5);wake()}
 function visibility(){if(document.hidden){cancelAnimationFrame(raf);raf=0}else wake()}
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible){cancelAnimationFrame(raf);raf=0}else wake()});observer.observe(host);addEventListener('resize',resize);addEventListener('pointermove',pointer,{passive:true});document.addEventListener('visibilitychange',visibility);renderer.domElement.addEventListener('webglcontextlost',lost);
 function lost(e){e.preventDefault();document.body.classList.remove('webgl');cancelAnimationFrame(raf);raf=0;disposed=true;document.querySelector('#status').textContent='3D context lost. Static view is available; use the view control to restart.'}
 resize();return{set(p,mode){target=p;path=mode;wake()},dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();removeEventListener('resize',resize);removeEventListener('pointermove',pointer);document.removeEventListener('visibilitychange',visibility);scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of(Array.isArray(o.material)?o.material:[o.material]))m.dispose()}});textures.forEach(t=>t.dispose());env.dispose();renderer.dispose();renderer.domElement.remove()}};
}
