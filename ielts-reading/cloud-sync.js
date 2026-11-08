/* Single-user shared progress. Each response updates only its own record. */
(function(){'use strict';
 const Core=window.ReadingSyncCore;
 let adapter=null,ref=null,connected=false,ready=false,connecting=false,dirty=false,busy=false,timer=null,failures=0;
 let remote={progress:Object.create(null),legacyProgress:Object.create(null)};
 const status=t=>document.getElementById('cloudStatus').textContent=t;
 function differs(local,server){let merged=Core.merge(server,local);return Object.keys(merged).some(k=>JSON.stringify(merged[k])!==JSON.stringify(server[k]))}
 function snapshot(s){let v=s.val()||{};return {progress:Core.unpack(v.progress),legacyProgress:Core.unpack(v.legacyProgress)}}
 function schedule(delay=500){dirty=true;clearTimeout(timer);timer=setTimeout(flush,delay)}
 function changedChild(kind,s){let packed={};packed[s.key]=s.val();let decoded=Core.unpack(packed),keys=Object.keys(decoded);if(!keys.length)return;let k=keys[0];remote[kind][k]=decoded[k];adapter.merge({progress:kind==='progress'?decoded:{},legacyProgress:kind==='legacyProgress'?decoded:{}});if(ready&&differs(adapter.get()[kind],remote[kind]))schedule()}
 async function flush(){
  if(!ref||!ready||!connected||!dirty||busy)return;
  busy=true;dirty=false;status('正在同步…');
  try{
   let local=adapter.get(),writes=0;
   for(const kind of ['progress','legacyProgress'])for(const [key,value] of Object.entries(local[kind]||{})){
    const clean=Core.clean(value);if(!clean)continue;
    const current=remote[kind][key],candidate=Core.merge(current?{[key]:current}:{},{[key]:clean})[key];
    if(JSON.stringify(candidate)===JSON.stringify(current))continue;
    const id=Core.encode(key),child=ref.child(kind).child(id);
    const result=await child.transaction(old=>{
      let existing=Core.unpack({[id]:old})[key],winner=Core.merge(existing?{[key]:existing}:{},{[key]:clean})[key];
      if(!winner||JSON.stringify(winner)===JSON.stringify(existing))return;
      return Core.pack({[key]:winner})[id];
    },undefined,false);
    let snapshotValue=result.snapshot?.val();if(snapshotValue!=null)changedChild(kind,{key:id,val:()=>snapshotValue});if(result.committed)writes++;
   }
   if(writes)await ref.child('updatedAt').set(firebase.database.ServerValue.TIMESTAMP);
   failures=0;status('已同步 · '+new Date().toLocaleTimeString('zh-CN'));
  }catch(e){dirty=true;failures++;status('本机已保存，云端暂不可用')}
  finally{busy=false;if(dirty&&connected&&failures<3){clearTimeout(timer);timer=setTimeout(flush,failures?5000:500)}}
 }
 async function connect(){
  if(connecting)return;connecting=true;
  try{
   let snap=await ref.once('value');
   if(!snap.exists()){
    const result=await ref.transaction(current=>current||{version:2,updatedAt:firebase.database.ServerValue.TIMESTAMP},undefined,false);snap=result.snapshot;
   }
   remote=snapshot(snap);adapter.merge(remote);
   for(const kind of ['progress','legacyProgress']){
    const path=ref.child(kind);path.on('child_added',s=>changedChild(kind,s));path.on('child_changed',s=>changedChild(kind,s));
   }
   ready=true;const local=adapter.get();if(differs(local.progress,remote.progress)||differs(local.legacyProgress,remote.legacyProgress))schedule();else if(connected)status('已同步 · '+new Date().toLocaleTimeString('zh-CN'));
  }catch(e){ready=false;status('本机已保存，云端暂不可用')}finally{connecting=false}
 }
 window.ReadingCloud={changed(){if(adapter)schedule()},init(a){adapter=a;
  document.getElementById('cloudRetry').onclick=()=>{failures=0;if(!ready&&ref)connect();else schedule(0)};
  window.addEventListener('online',()=>{failures=0;if(!ready&&ref)connect();else schedule(0)});
  try{if(!window.firebase)throw Error('SDK unavailable');let app=firebase.initializeApp(window.READING_FIREBASE_CONFIG,'ielts-reading'),db=app.database();ref=db.ref('ieltsReading/v2');
   db.ref('.info/connected').on('value',snap=>{connected=snap.val()===true;if(connected&&ready&&dirty)schedule(0);else if(!connected)status('当前离线 · 进度保存在本机')});connect();
  }catch(e){status('本机模式 · 云端组件未载入，联网后刷新即可')}
 }};
})();
