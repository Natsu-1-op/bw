const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('node:path');const root=path.resolve(__dirname,'..');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const code=html.split('<script>')[1].split('</script>')[0];
let stored=null;const els={},rates=['again','hard','good'].map(rate=>({dataset:{rate},disabled:false}));
function el(id){return els[id]||(els[id]={value:id==='mode'?'context':id==='scope'?'due':'',classList:{add(){},remove(){}},style:{},append(){},textContent:'',innerHTML:'',disabled:false})}
const c=vm.createContext({document:{getElementById:el,querySelectorAll:()=>rates,querySelector:()=>rates[2],createElement:()=>({})},localStorage:{getItem:()=>stored,setItem(k,v){stored=v}},console,Blob,URL,setTimeout});
const run=s=>vm.runInContext(s,c);c.window=c;c.ReadingCloud={init(){},changed(){}};vm.runInContext(fs.readFileSync(path.join(root,'sync-core.js'),'utf8'),c);vm.runInContext(code,c);
assert.equal(run('WORDS.length'),35);assert.equal(run('new Set(WORDS.map(w=>w.id)).size'),35);
assert(run('WORDS.every(w=>w.sentence.includes(w.target)||w.sentence.toLowerCase().includes(w.target.toLowerCase()))'));
el('start').onclick();assert.equal(run('queue.length'),10);assert.equal(run('new Set(queue.map(t=>t.w.id)).size'),10);
run('globalThis.testWord=current.w');el('reveal').onclick();rates[2].onclick();assert.equal(run('rec(testWord,"recognition").level'),1);assert.equal(run('rec(testWord,"recall").level'),0);
run('current={w:testWord,mode:"context",d:"recognition"};revealed=true;hinted=false;spellingMismatch=false');rates[2].onclick();assert.equal(run('rec(testWord,"recognition").level'),1);
run('queue=[{w:testWord,mode:"context",d:"recognition"}];index=0;show()');el('hintBtn').onclick();el('reveal').onclick();assert(rates[2].disabled);let snap=run('JSON.stringify(state)');rates[2].onclick();assert.equal(run('JSON.stringify(state)'),snap);el('skip').onclick();assert.equal(run('JSON.stringify(state)'),snap);
run('testWord=WORDS.find(w=>w.term==="attend to");queue=[{w:testWord,mode:"cloze",d:"recall"}];index=0;show()');el('guess').value='attended to';el('reveal').onclick();assert(!rates[2].disabled);rates[2].onclick();assert.equal(run('rec(testWord,"recall").level'),1);
run('queue=[{w:testWord,mode:"cloze",d:"recall"}];index=0;show()');el('guess').value='attend';el('reveal').onclick();assert(rates[2].disabled);rates[1].onclick();assert.equal(run('rec(testWord,"recall").level'),0);
run('queue=[{w:testWord,mode:"extension",d:"transfer"}];index=0;show()');el('reveal').onclick();rates[2].onclick();assert.equal(run('rec(testWord,"transfer").level'),1);assert.equal(run('rec(testWord,"recognition").level'),0);
for(let i=0;i<35;i++){run('current={w:testWord,mode:"context",d:"recognition"};revealed=true;hinted=false;spellingMismatch=false');rates[0].onclick()}
assert.equal(run('rec(testWord,"recognition").history.length'),30);assert.equal(run('rec(testWord,"recognition").reviews'),35);assert(run('rec(testWord,"recognition").due-Date.now()>299000'));
(async()=>{
 const rid=run('WORDS[0].id'),old={level:2,due:1,reviews:1,history:[{at:1,rate:'good',level:2}]};
 await el('file').onchange({target:{files:[{text:async()=>JSON.stringify({version:1,progress:{[rid]:old}})}],value:'x'}});
 assert.equal(run('Object.keys(legacy).length'),1);
 let before=run('JSON.stringify(state)');const k=rid+'::recognition',bad={version:2,progress:{[k]:{...old,dailyCount:1,dailyStamp:'2026-11-04',lastGoodDay:'2026-11-04'},[run('WORDS[1].id')+'::recall']:{...old,level:99}}};
 await el('file').onchange({target:{files:[{text:async()=>JSON.stringify(bad)}],value:'x'}});assert.equal(run('JSON.stringify(state)'),before);
 assert.equal(JSON.parse(stored).version,2);assert.equal(Object.keys(JSON.parse(stored).legacyProgress).length,1);
 console.log('通过：35词原句完整、填空词形、提示/拼错限制、三维独立、同日升级限制、跳过、历史上限、旧版保留、导入原子性、v2本地保存。');
})().catch(e=>{console.error(e);process.exit(1)});
