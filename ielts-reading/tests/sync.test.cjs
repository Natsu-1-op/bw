const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),coreCtx=vm.createContext({btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary')});
vm.runInContext(fs.readFileSync(path.join(root,'sync-core.js'),'utf8'),coreCtx);
const C=coreCtx.ReadingSyncCore;
const rec=(at,level=1)=>({level,due:at+100,reviews:1,history:[{at,rate:'good',level}],dailyStamp:'2026-11-04',dailyCount:1,lastGoodDay:'2026-11-04',lastAnswer:''});
const ids=['C14T3:perform a task::recognition','C14T4:词.条/含特殊字符::recall'];
let combined=C.merge({[ids[0]]:rec(100,2)},{[ids[0]]:rec(50),[ids[1]]:rec(150)});
assert.equal(combined[ids[0]].level,2);assert.equal(Object.keys(combined).length,2);
assert.deepEqual(JSON.parse(JSON.stringify(C.unpack(C.pack(combined)))),JSON.parse(JSON.stringify(combined)));
assert(Object.keys(C.pack(combined)).every(k=>!/[.#$\[\]/]/.test(k)));
assert.equal(C.clean({...rec(1),level:99}),null);
const statuses=[],timers=new Map();let timerId=0,callback,connectionCallback,remote=null,writes=0,local={progress:{},legacyProgress:{}};
const snapshot=()=>({val:()=>remote,exists:()=>!!remote});
const db={ref(p){return p==='.info/connected'?{on(e,fn){connectionCallback=fn;fn({val:()=>true})}}:{on(e,fn){callback=fn;fn(snapshot())},async transaction(fn){const result=fn(remote);if(result===undefined)return {committed:false};remote=result;remote.updatedAt=1000;writes++;callback(snapshot());return {committed:true,snapshot:snapshot()}}}}};
const cloudCtx=vm.createContext({window:null,ReadingSyncCore:C,document:{getElementById:()=>({set textContent(s){statuses.push(s)}})},firebase:{initializeApp(){return {database:()=>db}},database:{ServerValue:{TIMESTAMP:{'.sv':'timestamp'}}}},setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout(id){timers.delete(id)},Date});
cloudCtx.window=cloudCtx;cloudCtx.addEventListener=()=>{};cloudCtx.READING_FIREBASE_CONFIG={};
vm.runInContext(fs.readFileSync(path.join(root,'cloud-sync.js'),'utf8'),cloudCtx);
cloudCtx.ReadingCloud.init({get:()=>local,merge(v){local={progress:C.merge(local.progress,v.progress),legacyProgress:C.merge(local.legacyProgress,v.legacyProgress)}}});
async function drain(){let count=0;while(timers.size){assert(++count<8,'sync write loop');let [id,fn]=timers.entries().next().value;timers.delete(id);await fn()}}
(async()=>{
 await drain();assert.equal(writes,1,'one bootstrap write');
 local.progress[ids[0]]=rec(100,2);cloudCtx.ReadingCloud.changed();await drain();assert.equal(writes,2);assert.equal(C.unpack(remote.progress)[ids[0]].level,2);
 remote.progress=C.pack(C.merge(C.unpack(remote.progress),{[ids[1]]:rec(150)}));callback(snapshot());await drain();assert.equal(writes,2,'remote-only changes do not echo');assert(local.progress[ids[1]]);
 connectionCallback({val:()=>false});local.progress[ids[0]]=rec(200,3);cloudCtx.ReadingCloud.changed();await drain();assert.equal(writes,2,'offline records stay local');
 connectionCallback({val:()=>true});await drain();assert.equal(writes,3);assert.equal(C.unpack(remote.progress)[ids[0]].level,3);
 assert.equal(Object.keys(C.unpack(remote.progress)).length,2);
 console.log('PASS: Firebase key encoding, per-word merge, no sync loop, remote updates, offline recovery.');
})().catch(e=>{console.error(e);process.exitCode=1});
