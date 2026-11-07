const start=document.getElementById('start'),pending=document.getElementById('pending'),status=document.getElementById('status'),retry=document.getElementById('retry');
let timer;
async function request(path,method='GET'){
  const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},credentials:'same-origin'});
  const data=await response.json();if(!response.ok)throw new Error(data.message||'Connection unavailable. Retry when online.');return data;
}
async function check(){
  clearTimeout(timer);
  try{
    const data=await request('/api/desktop-status');
    if(data.paired){status.textContent='Connected. Opening your saved pipeline…';location.replace('/admin/?page=newsletter');return;}
    if(data.pending){document.getElementById('code').textContent=data.code;document.getElementById('authorize').href=data.approve_url;pending.hidden=false;start.disabled=true;status.textContent='Waiting for you to approve this PC on the secure pairing page…';timer=setTimeout(check,3000);}
    else{status.textContent=data.message||'Ready to pair this PC.';start.disabled=false;pending.hidden=true;}
    retry.hidden=true;
  }catch(e){status.textContent=e.message;retry.hidden=false;start.disabled=false;}
}
start.addEventListener('click',async()=>{
  clearTimeout(timer);start.disabled=true;status.textContent='Starting a secure pairing request…';
  try{
    const data=await request('/api/desktop-pair','POST');
    document.getElementById('code').textContent=data.code;
    document.getElementById('authorize').href=data.approve_url;
    pending.hidden=false;await check();
  }catch(e){status.textContent=e.message;start.disabled=false;retry.hidden=false;}
});
retry.addEventListener('click',check);check();
