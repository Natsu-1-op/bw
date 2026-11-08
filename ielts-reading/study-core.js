/* Scheduling and daily selection. No network or DOM dependencies. */
(function(root){'use strict';
 const DAY=86400000, MIN=60000, STEP=3*MIN, INTERVALS=[1,3,7,14,30];
 const day=at=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
 const base=()=>({level:0,due:0,reviews:0,history:[],lastGoodDay:'',dailyStamp:'',dailyCount:0,studyV:1,phase:'review',streak:0,lastFail:0,lastStep:0,lapses:0});
 function migrate(record){
  const r={...base(),...(record||{})};r.history=Array.isArray(r.history)?r.history:[];
  if(record && record.studyV===1)return r;
  r.studyV=1;r.phase='review';r.streak=0;r.lastFail=0;r.lastStep=0;r.lapses=0;
  // Only the last known attempt is used. Never infer old same-day repetitions.
  const last=r.history.at(-1);if(last&&(last.rate==='again'||last.rate==='hard')){r.phase='learning';r.lastFail=last.at;r.lastStep=last.at;r.lapses=1;r.due=Math.max(r.due||0,last.at+STEP)}
  return r;
 }
 function answer(record,rate,now,mode='',hinted=false,answerText=''){
  if(!['good','again'].includes(rate)||!Number.isFinite(now))throw Error('Invalid response');
  const r=migrate(record),today=day(now),oldDue=r.due||0;let message='';
  if(rate==='again'){
   r.level=0;r.phase='learning';r.streak=0;r.lastFail=now;r.lastStep=now;r.lapses=(r.lapses||0)+1;r.due=now+STEP;message='3分钟后开始巩固，连续记得3次。';
  }else if(r.phase==='learning'){
   if(now<oldDue){message='还没到本次巩固时间；这次不计入次数。';}
   else if(r.streak<3){r.streak++;r.lastStep=now;if(r.streak===3){r.due=Math.max(r.lastFail+DAY,now+STEP);message='三次巩固完成；间隔24小时后再检验。'}else{r.due=now+STEP;message=`已完成 ${r.streak}/3 次巩固，3分钟后继续。`}}
   else if(now<r.lastFail+DAY){message='距离上次忘记还不足24小时，不计为记住。';}
   else{r.phase='review';r.streak=0;r.level=1;r.lastGoodDay=today;r.due=now+DAY;message='通过跨天回忆，1天后复习。'}
  }else if(r.reviews===0||oldDue===0||now>=oldDue){
   if(r.lastGoodDay===today&&r.reviews>0){message='今天已完成这一阶段；下次按计划复习。'}
   else{r.level=Math.min(5,r.level+1);r.lastGoodDay=today;r.due=now+INTERVALS[r.level-1]*DAY;message=`已记住，${INTERVALS[r.level-1]}天后复习。`}
  }else message='尚未到复习时间，本次不提前升级。';
  r.reviews++;r.dailyCount=(r.dailyStamp===today?r.dailyCount||0:0)+1;r.dailyStamp=today;r.lastAnswer=String(answerText).slice(0,300);
  r.history=[...r.history,{at:now,rate,level:r.level,mode,hinted:!!hinted}].slice(-30);
  return {record:r,message};
 }
 // Deterministic weighted lottery: same word/day has same draw, but varied by day.
 function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0)/4294967296}
 function select(words,getRecord,goal,now){
  goal=Math.max(1,Math.min(200,Math.floor(goal)||30));let buckets={new:[],forgot:[],due:[]};
  for(const w of words){const r=migrate(getRecord(w));const endOfDay=Date.parse(day(now)+'T00:00:00+08:00')+DAY;if(r.reviews&&r.due>=endOfDay)continue;
   let type=r.phase==='learning'||r.lapses>0?'forgot':r.reviews===0?'new':'due';
   const overdue=r.due?Math.max(0,(now-r.due)/DAY):0;
   const weight=(type==='new'?(w.addedAt?5:3):type==='forgot'?4:1)+Math.min(4,overdue/3)+(type==='forgot'?Math.min(3,r.lapses||1):0);
   const u=Math.max(1e-9,hash(day(now)+'|'+w.id));buckets[type].push({w,rank:-Math.log(u)/weight});
  }
  for(const v of Object.values(buckets))v.sort((a,b)=>a.rank-b.rank);
  // Reserve some space for previously forgotten and regular due words; fill unused slots globally.
  const picked=[],take=(name,n)=>{while(n-->0&&buckets[name].length&&picked.length<goal)picked.push(buckets[name].shift())};
  if(goal>=3){take('forgot',Math.min(buckets.forgot.length,Math.max(1,Math.floor(goal*.2))));take('due',Math.min(buckets.due.length,Math.max(1,Math.floor(goal*.2))))}
  let rest=[...buckets.new,...buckets.forgot,...buckets.due].sort((a,b)=>a.rank-b.rank);picked.push(...rest.slice(0,goal-picked.length));
  return picked.map(x=>x.w.id);
 }
 function shuffle(items,random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
 root.ReadingStudy=Object.freeze({DAY,STEP,day,base,migrate,answer,select,shuffle});
})(typeof window!=='undefined'?window:globalThis);
