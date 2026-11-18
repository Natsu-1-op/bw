/* Pure data functions shared by the browser and regression checks. */
(function (root) {
  'use strict';
  const safeKey = key => typeof key === 'string' && key.length <= 300 && !['__proto__', 'constructor', 'prototype'].includes(key);
  const time = r => r?.history?.at(-1)?.at || 0;
  function valid(r) {
    return !!r && Number.isInteger(r.level) && r.level >= 0 && r.level <= 5 && Number.isFinite(r.due) && r.due >= 0 &&
      Number.isInteger(r.reviews) && r.reviews >= 0 && Array.isArray(r.history) && r.history.length <= 30 &&
      r.history.every(h => Number.isFinite(h.at) && ['again', 'hard', 'good'].includes(h.rate) && Number.isInteger(h.level) && h.level >= 0 && h.level <= 5);
  }
  function clean(r) {
    if (!r || typeof r !== 'object') return null;
    let history = Array.isArray(r.history) ? r.history : Object.values(r.history || {});
    history = history.sort((a,b) => a.at - b.at).slice(-30).map(h => ({at:h.at,rate:h.rate,level:h.level,mode:typeof h.mode==='string'?h.mode:'context',hinted:!!h.hinted}));
    let value = {level:r.level,due:r.due,reviews:r.reviews,history,lastGoodDay:typeof r.lastGoodDay==='string'?r.lastGoodDay:'',dailyStamp:typeof r.dailyStamp==='string'?r.dailyStamp:'',dailyCount:Number.isInteger(r.dailyCount)&&r.dailyCount>=0?r.dailyCount:0,lastAnswer:typeof r.lastAnswer==='string'?r.lastAnswer.slice(0,300):''};
    if (r.studyV === 1 && ['learning','review'].includes(r.phase) && Number.isInteger(r.streak) && r.streak>=0 && r.streak<=3 && Number.isFinite(r.lastFail) && r.lastFail>=0 && Number.isFinite(r.lastStep) && r.lastStep>=0 && Number.isInteger(r.lapses) && r.lapses>=0) Object.assign(value,{studyV:1,phase:r.phase,streak:r.streak,lastFail:r.lastFail,lastStep:r.lastStep,lapses:r.lapses});
    return valid(value) ? value : null;
  }
  function merge(left={},right={}) {
    const result = Object.create(null);
    for (let source of [left,right]) for (let [key,value] of Object.entries(source||{})) {
      if (!safeKey(key)) continue;
      let r = clean(value); if (!r) continue;
      let old = result[key];
      // A newer response wins per expression and skill, never for the whole profile.
      if (!old || time(r)>time(old) || (time(r)===time(old) && r.reviews>old.reviews)) result[key]=r;
    }
    return result;
  }
  const encode = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  function decode(s) {return decodeURIComponent(escape(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4))))}
  function pack(map) {const result={};for(let [key,r] of Object.entries(merge({},map))) result[encode(key)]=r;return result}
  function unpack(map) {const result=Object.create(null);for(let [key,r] of Object.entries(map||{}))try{let id=decode(key),v=clean(r);if(safeKey(id)&&v)result[id]=v}catch(_){}return result}
  root.ReadingSyncCore=Object.freeze({valid,clean,merge,pack,unpack,encode});
})(typeof window!=='undefined'?window:globalThis);
