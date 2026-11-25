// Version checks bypass the service-worker cache. Never interrupt an edit or save.
export function startUpdates({version,isSafe,save}){
  let registration,pending=null,checking=false,applying=false,lastInput=0;
  const newer=candidate=>{
    if(!/^\d+\.\d+\.\d+$/.test(candidate||''))return false;
    const a=candidate.split('.').map(Number),b=version.split('.').map(Number);
    for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];
    return false;
  };
  const safe=()=>!document.hidden&&navigator.onLine&&Date.now()-lastInput>5000&&isSafe();
  async function apply(){
    if(!pending||applying||registration?.installing||!safe())return;
    applying=true;
    try{
      await save();
      if(!safe()){applying=false;return;}
      if(registration?.waiting){
        await new Promise(resolve=>{
          const done=()=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',done);resolve()};
          const timer=setTimeout(done,5000);
          navigator.serviceWorker.addEventListener('controllerchange',done);
          registration.waiting.postMessage('ACTIVATE');
        });
        await save();
        if(!safe()){applying=false;return;}
      }
      const url=new URL(location.href);url.searchParams.set('v',pending);
      location.replace(url.href);
    }catch{applying=false;}
  }
  async function check(){
    if(checking||!navigator.onLine||document.hidden)return;
    checking=true;
    try{
      const url=new URL('./version.json',location.href);url.searchParams.set('check',Date.now());
      const response=await fetch(url,{cache:'no-store'});
      if(!response.ok)throw Error('Version unavailable');
      const {version:latest}=await response.json();
      if(newer(latest)){
        // A version manifest alone must not reload into a stale/partial deployment.
        const indexURL=new URL('./index.html',location.href);indexURL.searchParams.set('update',latest);
        const index=await fetch(indexURL,{cache:'no-store'});
        if(index.ok&&(await index.text()).includes(`./app.js?v=${latest}`))pending=latest;
      }
      await registration?.update();
      await apply();
    }catch{/* Offline, incomplete deployment or failed save: keep this app open. */}
    finally{checking=false;}
  }
  document.addEventListener('input',()=>{lastInput=Date.now()});
  if('serviceWorker'in navigator){
    navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>{
      registration=r;
      r.addEventListener('updatefound',()=>{
        r.installing?.addEventListener('statechange',()=>{
          if(r.waiting)check();
        });
      });
      check();
    }).catch(()=>{});
    // First-install claims and subsequent controller changes both recheck the
    // published version; neither can force a reload through an open editor.
    navigator.serviceWorker.addEventListener('controllerchange',()=>{check()});
  }
  window.addEventListener('focus',check);
  window.addEventListener('online',check);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
  setInterval(check,60000);
  setInterval(()=>{apply()},1000);
  check();
  return check;
}
