import * as T from 'three';
// All labels share one atlas and one draw call; positions follow semantic modules.
export function createLabels(scene, texts) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 64 * texts.length;
  const ctx = canvas.getContext('2d');
  ctx.font = '28px monospace'; ctx.textAlign = 'center';
  texts.forEach((text,i) => { ctx.fillStyle=text==='HUMAN CONTROL'?'#cbf5df':'#c7e7ef'; ctx.fillText(text.replace("HANDOFF ",""),256,i*64+43); });
  const texture=new T.CanvasTexture(canvas);
  texture.minFilter=T.LinearFilter; texture.generateMipmaps=false;
  const positions=new Float32Array(texts.length*18), uvs=new Float32Array(texts.length*12);
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
  geometry.setAttribute('uv',new T.BufferAttribute(uvs,2));
  const material=new T.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
  const batch=new T.Mesh(geometry,material);batch.frustumCulled=false;batch.renderOrder=100;scene.add(batch);
  const entries=[], center=new T.Vector3(), right=new T.Vector3(), up=new T.Vector3();
  const corners=[[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]];
  return {
    texture,
    label(text,size=.2) {
      const anchor=new T.Object3D();const index=texts.indexOf(text);
      entries.push({anchor,size,index});
      corners.forEach(([x,y],j)=>{uvs[index*12+j*2]=(x+1)/2;uvs[index*12+j*2+1]=1-(index+(1-y)/2)/texts.length;});
      geometry.attributes.uv.needsUpdate=true;return anchor;
    },
    update(camera) {
      right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);
      for(const {anchor,size,index} of entries){
        let visible=true;for(let p=anchor;p;p=p.parent)if(!p.visible)visible=false;
        anchor.getWorldPosition(center);
        const scale=anchor.matrixWorld.elements;const factor=Math.hypot(scale[0],scale[1],scale[2]);
        corners.forEach(([x,y],j)=>{const at=index*18+j*3;for(let k=0;k<3;k++)positions[at+k]=visible?center.getComponent(k)+right.getComponent(k)*x*size*4*factor+up.getComponent(k)*y*size*.5*factor:0;});
      }
      geometry.attributes.position.needsUpdate=true;
    },
  };
}
