const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),code=html.rsplit?null:html.split('<script>').at(-1).split('</script>')[0];
let now=Date.UTC(2026,10,8,10),storage=new Map(),els={},rates=['again','good'].map(rate=>({dataset:{rate},disabled:false}));
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
function el(id){return els[id]||(els[id]={value:id==='mode'?'context':id==='scope'?'due':'',selectedOptions:[{textContent:id==='mode'?'原句认义':'全部套题'}],classList:{add(){},remove(){}},style:{},append(){},textContent:'',innerHTML:'',disabled:false,open:false,blur(){},scrollIntoView(){}})}
const c=vm.createContext({Date:Clock,Intl,Math,document:{body:{classList:{add(){},remove(){}}},getElementById:el,querySelectorAll:()=>rates,querySelector:()=>rates[1],createElement:()=>({})},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},console,Blob,URL,AbortController,setTimeout:(fn,ms)=>{let id=setTimeout(fn,ms);id.unref();return id},clearTimeout,setInterval(){},fetch:async()=>({ok:true,json:async()=>null})});c.window=c;c.addEventListener=()=>{};c.matchMedia=()=>({matches:false});c.ReadingCloud={init(){},changed(){}};vm.runInContext(fs.readFileSync(path.join(root,'sync-core.js'),'utf8'),c);vm.runInContext(fs.readFileSync(path.join(root,'study-core.js'),'utf8'),c);c.ReadingPlan={current:()=>({day:c.ReadingStudy.day(now),ids:vm.runInContext('WORDS.map(w=>w.id)',c),goal:30}),goal:()=>30,preview:()=>vm.runInContext('WORDS.map(w=>w.id)',c),ensure:async()=>{},setGoal:async()=>{},init:fn=>fn()};vm.runInContext(fs.readFileSync(path.join(root,'phonetics.js'),'utf8'),c);vm.runInContext(code,c);
const run=s=>vm.runInContext(s,c);async function init(){for(let i=0;i<8;i++)await Promise.resolve()}
function task(w){c.testWord=w;run('queue=[{w:testWord,mode:"context",d:"recognition"}];index=0;show()')}
(async()=>{await init();assert.equal(run('WORDS.length'),82);
assert(run('WORDS.every(w => !w.phonetic && ReadingPhonetics.fallback(w.term))'), 'built-in words use the static IPA table');
assert.equal(run('ReadingPhonetics.forWord({term:"  CONSTRUCT "})'), 'ˈkɒnstrʌkt');
assert.equal(run('ReadingPhonetics.forWord({term:"construct",phonetic:" /kənˈstrʌkt/ "})'), 'kənˈstrʌkt');
assert.equal(run('ReadingPhonetics.fallback("toString")'), '');
for (const mode of ['context', 'extension', 'cloze', 'zh']) {
  c.testMode = mode;
  run('queue=[{w:WORDS.find(w=>w.term==="construct"), mode:testMode, d:dim(testMode)}];index=0;show()');
  assert.equal(el('phonetic').innerHTML.includes('/ˈkɒnstrʌkt/'), mode === 'context' || mode === 'extension', mode);
  el('reveal').onclick();
  assert(el('answer').innerHTML.includes('/ˈkɒnstrʌkt/'), mode);
}
c.testWord={...run('WORDS[0]'),term:'intuition',target:'human instinct',sentence:'Experimentation and human instinct lead to new ideas.'};
task(c.testWord);
assert.equal(el('prompt').textContent,'intuition');
assert.match(el('sentence').innerHTML,/词条：.*intuition.*原文高亮：.*<mark>human instinct<\/mark>/);
assert.match(run('details(testWord)'),/原文高亮：/);
for(const [mode,answer,incorrect] of [['cloze','human instinct','intuition'],['zh','intuition','human instinct']]){
  c.testMode=mode;
  for(const guess of [incorrect,answer]){
    run('queue=[{w:testWord,mode:testMode,d:dim(testMode)}];index=0;show()');
    assert(!el('sentence').innerHTML.includes(answer));
    el('guess').value=guess;
    el('reveal').onclick();
    assert.equal(rates[1].disabled,guess===incorrect);
  }
}
const previewAll=c.ReadingPlan.preview;
c.ReadingPlan.preview=()=>run('WORDS.slice(0,1).map(w=>w.id)');
run('stats()');
assert.equal(el('due').textContent,1);
assert(el('availability').textContent.includes('81'));
el('book').value='unmatched source';
run('stats()');
assert.equal(el('due').textContent,0);
assert.equal(el('allToday').hidden,false);
el('allToday').onclick();
assert.equal(el('book').value,'');
assert.equal(el('due').textContent,1);
c.ReadingPlan.preview=previewAll;
await el('start').onclick();assert.equal(run('queue.length'),10);assert.equal(run('new Set(queue.map(t=>t.w.id)).size'),10);
el('dailyGoal').value='60';el('dailyGoal').oninput();run('stats()');assert.equal(el('dailyGoal').value,'60','sync refresh must not replace edits');
const w=run('WORDS[0]');task(w);el('reveal').onclick();rates[0].onclick();assert.equal(run('rec(testWord,"recognition").phase'),'learning');assert.equal(run('rec(testWord,"recognition").due'),now+180000);assert.equal(el('today').textContent,1);
for(let i=1;i<=3;i++){now+=180000;task(w);el('reveal').onclick();rates[1].onclick();assert.equal(run('rec(testWord,"recognition").streak'),i===3?0:i);assert.equal(run('rec(testWord,"recognition").level'),i===3?1:0);assert.equal(el('today').textContent,1)}
now=Date.UTC(2026,10,9,10);task(w);el('reveal').onclick();rates[1].onclick();assert.equal(run('rec(testWord,"recognition").phase'),'review');assert.equal(run('rec(testWord,"recognition").level'),2);assert.equal(run('rec(testWord,"recall").reviews'),0);
task(w);el('reveal').onclick();assert(!rates[1].disabled);assert(!html.includes('id="hintBtn"'));assert(!html.includes('id="skip"'));assert(run("reviewGroups([{w:WORDS[0],rate:'skip',d:'recognition'}])").includes('跳过'), 'old skipped results remain visible');
now+=86400000;c.ReadingPlan.goal=()=>1;run('sessionResults=[];queue=[{w:WORDS[0],mode:"context",d:"recognition"},{w:WORDS[1],mode:"context",d:"recognition"}];index=0;show()');el('reveal').onclick();rates[1].onclick();assert.equal(run('!!current'),false,'goal reached during a group must not add a new word');assert.equal(run('sessionResults.length'),1);
console.log('PASS: group selection, two ratings, 3 spaced recalls, unique daily count, next-day review, dimensions and legacy recaps');})().catch(e=>{console.error(e);process.exitCode=1});
