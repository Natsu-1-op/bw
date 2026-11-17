const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'daily-plan.js'),'utf8'),core=fs.readFileSync(path.join(root,'study-core.js'),'utf8');let remote=null,listeners=[],online=true;const snap=v=>({val:()=>v});const shared={on(event,fn){listeners.push(fn);fn(snap(remote))},async transaction(update){let v=update(remote);if(v===undefined)return{committed:false,snapshot:snap(remote)};remote=JSON.parse(JSON.stringify(v));for(const f of listeners)f(snap(remote));return{committed:true,snapshot:snap(remote)}}};let connectedFns=[];
function device(){const mem=new Map(),c=vm.createContext({Date,Intl,Math,JSON,localStorage:{getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)},firebase:{app:()=>({database:()=>({ref:p=>p==='.info/connected'?{on(e,fn){connectedFns.push(fn);fn({val:()=>online})}}:shared})})}});c.window=c;vm.runInContext(core,c);vm.runInContext(source,c);let last;c.ReadingPlan.init(p=>last=p);return {p:c.ReadingPlan,get:()=>last}}
(async()=>{let a=device(),b=device(),t=Date.UTC(2026,10,8,10),words=Array.from({length:50},(_,i)=>({id:'w'+i})),rec=()=>null;let plan=await a.p.ensure(words,rec,t);assert.equal(plan.ids.length,30);assert.equal(b.get().ids.length,30);let other=await b.p.ensure(words,rec,t);assert.deepEqual(Array.from(plan.ids),Array.from(other.ids));await b.p.setGoal(12,words,rec,t+100);assert.equal(a.get().goal,12);assert.equal(a.get().ids.length,12);let [finished,removed]=a.get().ids;
let active=words.filter(w=>w.id!==finished&&w.id!==removed);
let repaired=await a.p.ensure(active,rec,t+200,[finished]);
assert.equal(repaired.ids.length,12);
assert(repaired.ids.includes(finished),'a deleted word already reviewed still counts');
assert(!repaired.ids.includes(removed),'an unfinished deleted word must be replaced');
assert.deepEqual(Array.from(b.get().ids),Array.from(repaired.ids));
const urgent=active.find(w=>!repaired.ids.includes(w.id));
const getRecord=w=>w.id===urgent.id?{studyV:1,phase:'learning',due:t+300,reviews:1}:null;
let preview=a.p.preview(active,getRecord,t+300,[finished]);
assert(preview.includes(urgent.id),'an overdue recovery replaces an unreviewed word in a full plan');
assert(preview.includes(finished),'replacement preserves today’s completed count');
assert.equal(preview.length,12);
assert(!remote.ids.includes(urgent.id),'preview does not write remotely');
assert.deepEqual(Array.from((await a.p.ensure(active,getRecord,t+300,[finished])).ids),Array.from(preview));
let tomorrow=await a.p.ensure(words,rec,t+86400000);assert.equal(tomorrow.day,'2026-11-09');assert.equal(tomorrow.ids.length,12);
online=false;for(const f of connectedFns)f({val:()=>false});await b.p.setGoal(15,words,rec,t+86400000+100);assert.equal(remote.goal,12);online=true;for(const f of connectedFns)f({val:()=>true});for(let i=0;i<8;i++)await Promise.resolve();assert.equal(remote.goal,15);assert.equal(a.get().goal,15);let completed=words.slice(0,20).map(w=>w.id);let capped=await a.p.ensure(words,rec,t+2*86400000,completed);assert.equal(capped.ids.length,0,'no new words after reaching target');console.log('PASS: shared daily plan, goal changes, next day and offline recovery');})().catch(e=>{console.error(e);process.exitCode=1});
