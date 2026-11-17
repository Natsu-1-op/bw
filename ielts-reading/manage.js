'use strict';
(()=>{
 const $=id=>document.getElementById(id), fields=['book','term','meaning','phonetic','source','sentence','target','translation','page','note'];
 const key=id=>btoa(String.fromCharCode(...new TextEncoder().encode(id))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 let entries={},selected='',ready=false,busy=false;
 const activeWord = () => entries[selected]?.deletedAt ? null : entries[selected];
 function updateButtons() {
  $('restoreWord').disabled = !ready || busy || !entries[$('deletedWord').value]?.deletedAt;
  $('save').disabled = !ready || busy;
  $('deleteWord').disabled = !ready || busy || !activeWord();
 }
 const status=s=>$('status').textContent=s;
 function previewPhonetic() {
  const fallback = window.ReadingPhonetics?.fallback($('term').value);
  $('phonetic').placeholder = fallback ? '/' + fallback + '/' : '例如 ɪnˈskraɪb';
 }
 function fill(w){for(const f of fields)$(f).value=w?.[f]??'';previewPhonetic();const e=w?.extensions?.[0]||{};$('extMeaning').value=e.meaning||'';$('extExample').value=e.example||'';$('extTranslation').value=e.translation||'';$('idHelp').textContent=w?'词条 ID：'+w.id+'（保持不变以保留熟练度）':'新词条的 ID 由套题和表达生成。'}
 function options(){let q=$('search').value.trim().toLowerCase();$('choose').replaceChildren(new Option('＋ 添加新词条',''));for(const [k,w] of Object.entries(entries).sort((a,b)=>a[1].id.localeCompare(b[1].id))){if(!w.deletedAt&&(!q||(w.term+' '+w.book).toLowerCase().includes(q)))$('choose').add(new Option(w.term+' · '+w.book,k))}if(selected&&entries[selected]&&[...$('choose').options].some(o=>o.value===selected))$('choose').value=selected}
 function renderDeleted() {
  const select=$('deletedWord'), previous=select.value;
  select.replaceChildren(new Option('选择词条',''));
  for(const [id,word] of Object.entries(entries).filter(([,word])=>word.deletedAt).sort((a,b)=>b[1].deletedAt-a[1].deletedAt)){
   select.add(new Option(word.term+' · '+word.book,id));
  }
  if(entries[previous]?.deletedAt)select.value=previous;
 }
 $('deletedWord').onchange=updateButtons;
 $('term').oninput=previewPhonetic;$('search').oninput=options;$('choose').onchange=()=>{selected=$('choose').value;fill(activeWord());updateButtons()};$('reset').onclick=()=>{selected='';$('choose').value='';fill(null);updateButtons()};
 try{const app=firebase.initializeApp(window.READING_FIREBASE_CONFIG,'ielts-catalog-manager'),ref=app.database().ref('ieltsReading/catalog/entries');
  ref.on('value',snap=>{entries=snap.val()||{};ready=true;if(selected&&!activeWord())$('reset').onclick();options();renderDeleted();updateButtons();if(!busy)status('已连接 · '+Object.values(entries).filter(w=>!w.deletedAt).length+' 个表达')},()=>{ready=false;updateButtons();status('词库连接失败，请检查网络后刷新。')});
  $('restoreWord').onclick=async()=>{
   const id=$('deletedWord').value;
   if(!ready||busy||!entries[id]?.deletedAt)return;
   busy=true;
   updateButtons();
   status('正在恢复…');
   try{
    await ref.child(id).update({deletedAt:null});
    status('已恢复 · 联网刷新复习页后生效');
   }catch(error){
    status('恢复失败，请检查网络后重试。');
   }finally{
    busy=false;
    updateButtons();
   }
  };
  $('deleteWord').onclick = async () => {
   const word = activeWord();
   if (!ready || busy || !word || !window.confirm('删除「' + word.term + '」？该词将从复习词库移除。')) return;
   const wordKey = selected;
   busy = true;
   updateButtons();
   status('正在删除…');
   try {
    await ref.child(wordKey).update({deletedAt: firebase.database.ServerValue.TIMESTAMP});
    if (selected === wordKey) $('reset').onclick();
    status('已删除 · 联网刷新复习页后生效');
   } catch (error) {
    status('删除失败，请检查网络后重试。');
   } finally {
    busy = false;
    updateButtons();
   }
  };
  $('form').onsubmit=async e=>{e.preventDefault();if(!ready||busy||(selected&&!activeWord()))return;const v={};for(const f of fields)v[f]=$(f).value.trim();if(!v.sentence.toLowerCase().includes(v.target.toLowerCase())){status('原句中找不到对应形式，请检查。');return}const id=selected?entries[selected].id:v.book+':'+v.term.toLowerCase(),k=key(id);if(!selected&&entries[k]){status(entries[k].deletedAt?'同名词条已删除，请在“已删除的词条”中恢复。':'该套题已有同名词条，请选择它进行修改。');return}const ext={meaning:$('extMeaning').value.trim(),example:$('extExample').value.trim(),translation:$('extTranslation').value.trim()};const w={...entries[selected],...v,id,addedAt:entries[selected]?.addedAt||Date.now(),extensions:[ext,...(entries[selected]?.extensions||[]).slice(1)]};
  w.phonetic = window.ReadingPhonetics?.normalize(v.phonetic) ?? v.phonetic;
  if (!w.phonetic) delete w.phonetic;
  const editing=Boolean(selected);busy=true;updateButtons();status('正在保存…');try{if(editing)await ref.child(k).update({...w,phonetic:w.phonetic||null});else await ref.child(k).set(w);selected=k;if(activeWord()){options();fill(activeWord())}else $('reset').onclick();status('已保存 · 复习页刷新后可见')}catch(err){status('保存失败，请检查网络后重试。')}finally{busy=false;updateButtons()}};
 }catch(e){status('词库组件未载入，请联网后刷新。')}
})();
