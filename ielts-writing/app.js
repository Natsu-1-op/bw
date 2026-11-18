(function () {
  'use strict';
  const $ = id => document.getElementById(id), key = 'ielts-writing-progress-v1';
  const core = window.ReadingSyncCore, day = 86400000;
  let progress = {}, catalog = [], queue = [], current = null, results = [];
  try { progress = core.merge({}, JSON.parse(localStorage.getItem(key) || '{}')); } catch (_) {}
  function save() { localStorage.setItem(key, JSON.stringify(progress)); }
  const adapter = {get: () => ({progress, legacyProgress: {}}), merge(remote) {progress = core.merge(progress, remote.progress); save();}};
  window.ReadingCloud.init(adapter);
  function message(text) { $('notice').textContent = text; }
  function groupOptions() {
    $('group').replaceChildren(new Option('全部写作', ''));
    for (const name of [...new Set(catalog.map(x => x.book))].sort()) $('group').add(new Option(name, name));
  }
  async function load() {
    try {
      const db = firebase.app('ielts-writing').database();
      const data = (await db.ref('ieltsWriting/catalog/entries').once('value')).val() || {};
      catalog = Object.values(data).filter(x => x && !x.deletedAt && x.id && x.term && x.sentence);
      localStorage.setItem('ielts-writing-catalog-v1', JSON.stringify(catalog));
    } catch (_) { try { catalog = JSON.parse(localStorage.getItem('ielts-writing-catalog-v1') || '[]'); if (!catalog.length) { const response = await fetch('entries.json'); if (!response.ok) throw new Error('词库不可用'); catalog = await response.json(); } } catch (_) {} }
    groupOptions(); message(catalog.length ? `共有 ${catalog.length} 个词块。` : '词库尚未载入，请联网后重新打开。');
  }
  $('start').onclick = () => {
    const now = Date.now(), limit = Math.max(1, Math.min(50, Number($('limit').value) || 10));
    queue = catalog.filter(w => (!$('group').value || w.book === $('group').value) && (!progress[w.id] || progress[w.id].due <= now)).slice(0, limit);
    results = []; $('finish').classList.add('hidden');
    if (!queue.length) { message('目前没有到期词块。'); return; }
    next();
  };
  function next() {
    current = queue.shift(); $('input').value = ''; $('answer').classList.add('hidden'); $('reveal').classList.remove('hidden');
    if (!current) { finish(); return; }
    $('card').classList.remove('hidden');
    const mode = $('mode').value === 'mixed' ? (results.length % 2 ? 'blank' : 'recall') : $('mode').value;
    $('tag').textContent = `${current.book} · ${mode === 'blank' ? '原句填空' : '中文回忆英文'}`;
    $('prompt').textContent = mode === 'blank' ? current.sentence.replace(current.target, ' ______ ') : current.meaning;
    $('term').textContent = current.term; $('sentence').textContent = current.sentence;
    $('translation').textContent = current.translation || ''; $('note').textContent = current.note || '';
    message(`本轮剩余 ${queue.length + 1} 个`);
  }
  $('reveal').onclick = () => { $('answer').classList.remove('hidden'); $('reveal').classList.add('hidden'); };
  document.querySelectorAll('[data-rate]').forEach(button => button.onclick = () => {
    const now = Date.now(), old = progress[current.id] || {level: 0, reviews: 0, history: []}, rate = button.dataset.rate;
    let level = rate === 'good' ? Math.min(5, old.level + 1) : rate === 'hard' ? Math.max(0, old.level - 1) : 0;
    const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
    if (rate === 'good' && old.lastGoodDay === today) level = old.level;
    const due = rate === 'again' ? now + 5 * 60000 : rate === 'hard' ? now + day : now + [1, 3, 7, 14, 30][Math.max(0, level - 1)] * day;
    progress[current.id] = {level, due, reviews: old.reviews + 1, lastGoodDay: rate === 'good' ? today : old.lastGoodDay || '', dailyStamp: '', dailyCount: 0, history: [...(old.history || []), {at: now, rate, level}].slice(-30)};
    save(); window.ReadingCloud.changed(); results.push({word: current, rate}); next();
  });
  function finish() {
    $('card').classList.add('hidden'); $('finish').classList.remove('hidden'); message('本轮已完成。');
    $('summary').replaceChildren();
    for (const item of results) { const p = document.createElement('p'); p.textContent = `${item.word.term} · ${{good:'独立想起',hard:'模糊',again:'遗忘'}[item.rate]}`; $('summary').append(p); }
    const ext = results.find(x => x.word.extensions?.[0]?.translation)?.word.extensions[0];
    const box = $('transfer'); box.replaceChildren();
    if (ext) { const p = document.createElement('p'); p.textContent = `换个情景写一句：${ext.translation}`; const input = document.createElement('textarea'); const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = '写完查看参考'; const answer = document.createElement('p'); answer.textContent = ext.example; details.append(summary, answer); box.append(p, input, details); }
  }
  $('export').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({catalog, progress}, null, 2)], {type:'application/json'})); a.download = 'writing-review-backup.json'; a.click(); URL.revokeObjectURL(a.href); };
  $('import').onchange = async e => { try { const data = JSON.parse(await e.target.files[0].text()); progress = core.merge(progress, data.progress); save(); window.ReadingCloud.changed(); message('进度已导入并等待同步。'); } catch (_) { message('导入失败，请检查备份文件。'); } };
  load();
})();
