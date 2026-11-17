/* One compact shared daily plan. Local copy supports offline use. */
(function(root){'use strict';
 const KEY='ielts.reading.dailyPlan.v1',S=root.ReadingStudy;
 let ref=null,connected=false,onUpdate=()=>{},cache=null;
 function valid(p){return p&&typeof p.day==='string'&&Number.isInteger(p.goal)&&p.goal>=1&&p.goal<=200&&(p.ids===undefined||(Array.isArray(p.ids)&&p.ids.length<=200&&p.ids.every(id=>typeof id==='string'&&id.length<=300)))&&Number.isFinite(p.updatedAt)}
 function read(){try{let p=JSON.parse(localStorage.getItem(KEY)||'null');return valid(p)?p:null}catch(e){return null}}
 function store(p){p={...p,ids:p.ids||[]};cache=p;try{localStorage.setItem(KEY,JSON.stringify(p))}catch(e){}onUpdate(p)}
 function init(callback){onUpdate=callback;cache=read();if(cache)onUpdate(cache);try{
  const db=firebase.app('ielts-reading').database();ref=db.ref('ieltsReading/catalog/dailyPlan');
  ref.on('value',snap=>{const remote=snap.val();if(valid(remote)&&(!cache||remote.updatedAt>=cache.updatedAt))store(remote)},()=>{});
  db.ref('.info/connected').on('value',snap=>{connected=snap.val()===true;if(connected&&cache&&cache.pending){const candidate={...cache};delete candidate.pending;write(candidate)}});
 }catch(e){} }
 function write(proposal){store(proposal);if(!ref||!connected){store({...proposal,pending:true});return Promise.resolve(proposal)}
  return ref.transaction(current=>{if(valid(current)&&current.updatedAt>proposal.updatedAt)return current;return proposal},undefined,false).then(res=>{const v=res.snapshot?.val();if(valid(v))store(v);return valid(v)?v:proposal}).catch(()=>{store({...proposal,pending:true});return proposal});
 }
 function goal(){return valid(cache)?cache.goal:30}
 function fill(old,words,getRecord,limit,now,completed){
  const done=new Set(completed),active=new Set(words.map(w=>w.id));
  const existing=[...new Set(old||[])].filter(id=>active.has(id)||done.has(id));
  const finished=existing.filter(id=>done.has(id));
  const capacity=Math.max(0,limit-done.size);
  if(!capacity)return finished;
  const recovery=words.filter(w=>!done.has(w.id)&&S.priority(S.migrate(getRecord(w,now),now),now)===0);
  const urgent=recovery.length?S.select(recovery,getRecord,capacity,now):[];
  const selected=[...new Set([...urgent,...existing.filter(id=>!done.has(id))])].slice(0,capacity);
  const reserved=new Set([...done,...selected]);
  const room=capacity-selected.length;
  const extra=room?S.select(words.filter(w=>!reserved.has(w.id)),getRecord,room,now):[];
  return [...finished,...selected,...extra];
 }
 function preview(words,getRecord,now=Date.now(),completed=[]){
  const today=S.day(now);
  return fill(cache?.day===today?cache.ids:[],words,getRecord,goal(),now,completed);
 }
 async function ensure(words,getRecord,now=Date.now(),completed=[]){
  if(valid(cache)&&cache.day===S.day(now)){
   const ids=preview(words,getRecord,now,completed);
   if(ids.length!==cache.ids.length||ids.some((id,i)=>id!==cache.ids[i]))return write({...cache,ids,updatedAt:now});
   return cache;
  }
  const proposal={day:S.day(now),goal:goal(),ids:fill([],words,getRecord,goal(),now,completed),updatedAt:now};
  if(ref&&connected){try{const res=await ref.transaction(current=>valid(current)&&current.day===proposal.day?undefined:proposal,undefined,false);const v=res.snapshot?.val();if(valid(v)){store(v);return v}}catch(e){}}
  return write(proposal);
 }
 function setGoal(n,words,getRecord,now=Date.now(),completed=[]){
  n=Math.max(1,Math.min(200,Math.floor(Number(n))||30));
  const today=S.day(now),done=new Set(completed),old=valid(cache)&&cache.day===today?cache.ids:[];
  const doneSelected=old.filter(id=>done.has(id)),reserved=old.filter(id=>!done.has(id)&&words.some(w=>w.id===id)).slice(0,Math.max(0,n-done.size));
  return write({day:today,goal:n,ids:fill([...doneSelected,...reserved],words,getRecord,n,now,completed),updatedAt:now});
 }

 function current(){return cache}
 root.ReadingPlan=Object.freeze({init,ensure,setGoal,current,goal,preview});
})(window);
