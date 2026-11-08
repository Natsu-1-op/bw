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
 async function ensure(words,getRecord,now=Date.now()){
  if(valid(cache)&&cache.day===S.day(now)&&cache.ids.length){
   if(cache.ids.length<cache.goal){const ids=[...new Set([...cache.ids,...S.select(words,getRecord,cache.goal,now)])].slice(0,cache.goal);if(ids.length>cache.ids.length)return write({...cache,ids,updatedAt:now})}
   return cache;
  }
  const proposal={day:S.day(now),goal:goal(),ids:S.select(words,getRecord,goal(),now),updatedAt:now};
  // Adopt an already-created same-day plan; first connected device creates it.
  if(ref&&connected){try{const res=await ref.transaction(current=>valid(current)&&current.day===proposal.day&&current.ids?.length?undefined:proposal,undefined,false);const v=res.snapshot?.val();if(valid(v)){store(v);return v}}catch(e){}}
  return write(proposal);
 }
 function setGoal(n,words,getRecord,now=Date.now()){
  n=Math.max(1,Math.min(200,Math.floor(Number(n))||30));
  const today=S.day(now),old=valid(cache)&&cache.day===today?cache.ids:[];
  // Existing selected words keep their place; a higher limit adds newly eligible words.
  let chosen=[...new Set([...old,...S.select(words,getRecord,200,now)])].slice(0,n);
  return write({day:today,goal:n,ids:chosen,updatedAt:now});
 }
 function current(){return cache}
 root.ReadingPlan=Object.freeze({init,ensure,setGoal,current,goal});
})(window);
