'use strict';
(()=>{
 const $=id=>document.getElementById(id), fields=['book','term','meaning','phonetic','source','sentence','target','translation','page','note'];
 const key=id=>btoa(String.fromCharCode(...new TextEncoder().encode(id))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 let entries={},selected='',ready=false;
 const status=s=>$('status').textContent=s;
 function fill(w){for(const f of fields)$(f).value=w?.[f]??'';if(!$('phonetic').value)$('phonetic').value=(window.READING_PHONETICS||{})[String($('term').value||'').toLowerCase()]||'';const e=w?.extensions?.[0]||{};$('extMeaning').value=e.meaning||'';$('extExample').value=e.example||'';$('extTranslation').value=e.translation||'';$('idHelp').textContent=w?'词条 ID：'+w.id+'（保持不变以保留熟练度）':'新词条的 ID 由套题和表达生成。'}
 function options(){let q=$('search').value.trim().toLowerCase();$('choose').replaceChildren(new Option('＋ 添加新词条',''));for(const [k,w] of Object.entries(entries).sort((a,b)=>a[1].id.localeCompare(b[1].id))){if(!q||(w.term+' '+w.book).toLowerCase().includes(q))$('choose').add(new Option(w.term+' · '+w.book,k))}if(selected&&entries[selected]&&[...$('choose').options].some(o=>o.value===selected))$('choose').value=selected}
 $('term').oninput=()=>{if(!$('phonetic').value)$('phonetic').value=(window.READING_PHONETICS||{})[String($('term').value||'').toLowerCase()]||''};$('search').oninput=options;$('choose').onchange=()=>{selected=$('choose').value;fill(entries[selected])};$('reset').onclick=()=>{selected='';$('choose').value='';fill(null)};
 try{const app=firebase.initializeApp(window.READING_FIREBASE_CONFIG,'ielts-catalog-manager'),ref=app.database().ref('ieltsReading/catalog/entries');
  ref.on('value',snap=>{entries=snap.val()||{};ready=true;$('save').disabled=false;options();status('已连接 · '+Object.keys(entries).length+' 个表达')},()=>{ready=false;$('save').disabled=true;status('词库连接失败，请检查网络后刷新。')});
  $('form').onsubmit=async e=>{e.preventDefault();if(!ready)return;const v={};for(const f of fields)v[f]=$(f).value.trim();if(!v.sentence.toLowerCase().includes(v.target.toLowerCase())){status('原句中找不到对应形式，请检查。');return}const id=selected?entries[selected].id:v.book+':'+v.term.toLowerCase(),k=key(id);if(!selected&&entries[k]){status('该套题已有同名词条，请选择它进行修改。');return}const ext={meaning:$('extMeaning').value.trim(),example:$('extExample').value.trim(),translation:$('extTranslation').value.trim()};const w={...entries[selected],...v,id,addedAt:entries[selected]?.addedAt||Date.now(),extensions:[ext,...(entries[selected]?.extensions||[]).slice(1)]};$('save').disabled=true;status('正在保存…');try{await ref.child(k).set(w);selected=k;options();fill(w);status('已保存 · 复习页刷新后可见')}catch(err){status('保存失败，请检查网络后重试。')}finally{$('save').disabled=false}};
 }catch(e){status('词库组件未载入，请联网后刷新。')}
})();
