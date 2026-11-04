/* Single-user shared progress; no account, login or sync code. */
(function () {
  'use strict';
  const Core=window.ReadingSyncCore;
  let adapter=null,ref=null,connected=false,ready=false,dirty=false,busy=false,timer=null,failures=0;
  const status=text=>document.getElementById('cloudStatus').textContent=text;
  function differs(local,remote){const merged=Core.merge(remote,local);return Object.keys(merged).some(k=>JSON.stringify(merged[k])!==JSON.stringify(remote[k]))}
  function read(snapshot){let v=snapshot.val()||{};return {progress:Core.unpack(v.progress),legacyProgress:Core.unpack(v.legacyProgress)}}
  function schedule(delay=500){dirty=true;clearTimeout(timer);timer=setTimeout(flush,delay)}
  async function flush(){
    if(!ref||!ready||!connected||!dirty||busy)return;
    busy=true;dirty=false;status('正在同步…');
    try{
      const result=await ref.transaction(current=>{
        let remote=current||{},local=adapter.get();
        return {version:2,updatedAt:firebase.database.ServerValue.TIMESTAMP,
          progress:Core.pack(Core.merge(Core.unpack(remote.progress),local.progress)),
          legacyProgress:Core.pack(Core.merge(Core.unpack(remote.legacyProgress),local.legacyProgress))};
      },undefined,false);
      if(result.committed){adapter.merge(read(result.snapshot));failures=0;status('已同步 · '+new Date().toLocaleTimeString('zh-CN'))}
      else{dirty=true;status('本机已保存，等待同步')}
    }catch(e){dirty=true;failures++;status('本机已保存，云端暂不可用')}
    finally{busy=false;if(dirty&&connected&&failures<3){clearTimeout(timer);timer=setTimeout(flush,failures?5000:500)}}
  }
  window.ReadingCloud={
    changed(){if(adapter)schedule()},
    init(a){adapter=a;
      document.getElementById('cloudRetry').onclick=()=>{failures=0;if(ref){ready=true;schedule(0)}};
      window.addEventListener('online',()=>{failures=0;schedule(0)});
      try{
        if(!window.firebase)throw Error('SDK unavailable');
        const app=firebase.initializeApp(window.READING_FIREBASE_CONFIG,'ielts-reading');
        const db=app.database();ref=db.ref('ieltsReading/v2');
        ref.on('value',snap=>{
          const remote=read(snap);adapter.merge(remote);ready=true;
          const local=adapter.get();
          if(differs(local.progress,remote.progress)||differs(local.legacyProgress,remote.legacyProgress)||!snap.exists())schedule();
          else if(connected)status('已同步 · '+new Date().toLocaleTimeString('zh-CN'));
        },()=>{ready=false;status('本机已保存，云端暂不可用')});
        db.ref('.info/connected').on('value',snap=>{
          connected=snap.val()===true;
          if(connected&&ready&&dirty)schedule(0);
          else if(!connected)status('当前离线 · 进度保存在本机');
        });
      }catch(e){status('本机模式 · 云端组件未载入，联网后刷新即可')}
    }
  };
})();
