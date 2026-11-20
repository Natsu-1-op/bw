(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const study = window.WritingStudy;
  const data = window.WritingData;
  const records = window.WritingRecords;
  const ratings = {good: '独立想起', hard: '模糊', again: '忘记了', skip: '跳过'};
  const settingsKey = 'ielts-writing-settings-v1';
  const draftKey = 'ielts-writing-drafts-v1';
  const paragraphKey = 'ielts-writing-paragraph-v1';
  const paragraphModeKey = 'ielts-writing-paragraph-mode-v1';
  const supportKey = 'ielts-writing-support-v1';
  const paragraphs = window.WritingPrompts;

  function readLocal(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeLocal(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  let catalog = [];
  let progress = {};
  let catalogReady = false;
  let groupSignature = '';
  let session = null;
  let workerRegistration;
  let sceneId;
  let paragraphIndex = paragraphs.findIndex(item => item.id === readLocal(paragraphKey, 'library'));
  if (paragraphIndex < 0) paragraphIndex = 0;
  const drafts = Object.assign(Object.create(null), readLocal(draftKey, {}));
  const supports = Object.assign(Object.create(null), readLocal(supportKey, {}));
  $('paragraph-mode').value = readLocal(paragraphModeKey, 'short') === 'body' ? 'body' : 'short';
  const settings = readLocal(settingsKey, {});
  let requestedGroup = typeof settings.group === 'string' ? settings.group : '';

  if (['recall', 'blank', 'mixed'].includes(settings.mode)) $('mode').value = settings.mode;
  if ([1, 2, 3, 5, 10].includes(Number(settings.limit))) $('limit').value = String(settings.limit);

  const group = () => $('group').value;
  const available = (selected, limit = catalog.length) =>
    catalog.length ? study.select(catalog, progress, {group: selected, limit, now: Date.now()}) : [];
  const label = (id, value) => {
    const element = $(id);
    if (element.textContent !== value) element.textContent = value;
  };
  const visible = (id, show) => { $(id).hidden = !show; };

  function updateOverview() {
    const names = [...new Set(catalog.map(word => word.book))].sort();
    const all = available('');
    const counts = new Map();
    for (const word of all) counts.set(word.book, (counts.get(word.book) || 0) + 1);
    const options = [['', '全部写作（' + all.length + ' 张可练）']];
    for (const name of names) options.push([name, name + '（' + (counts.get(name) || 0) + ' 张可练）']);
    const signature = JSON.stringify(options);
    if (signature !== groupSignature) {
      $('group').replaceChildren(...options.map(([value, title]) => new Option(title, value)));
      $('group').value = names.includes(requestedGroup) ? requestedGroup : '';
      groupSignature = signature;
    }

    const matching = group() ? catalog.filter(word => word.book === group()) : catalog;
    const due = group() ? counts.get(group()) || 0 : all.length;
    const total = matching.length;
    if (!total) {
      label('availability', catalogReady ? '词库暂无可用词块' : '正在读取词库…');
    } else {
      const soonest = Math.min(...matching.map(word => progress[word.id]?.due ?? 0).filter(time => time > Date.now()));
      const nextTime = Number.isFinite(soonest) ? ' · 下次 ' + formatTime(soonest) : '';
      label('availability', due ? '现在可练 ' + due + ' 张 · 共 ' + total + ' 张' : '暂时没有到期词块' + nextTime);
    }
    $('start').disabled = Boolean(session) || due === 0;
    visible('update-panel', Boolean(workerRegistration?.waiting) && !session);
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(timestamp));
  }

  function saveSettings() {
    requestedGroup = group();
    writeLocal(settingsKey, {group: requestedGroup, mode: $('mode').value, limit: Number($('limit').value)});
  }

  function markTarget(target, word) {
    const text = word.sentence;
    const matchAt = word.target ? text.toLowerCase().indexOf(word.target.toLowerCase()) : -1;
    if (matchAt < 0) {
      target.textContent = text;
      return;
    }
    const marker = document.createElement('mark');
    marker.textContent = text.slice(matchAt, matchAt + word.target.length);
    target.replaceChildren(text.slice(0, matchAt), marker, text.slice(matchAt + word.target.length));
  }

  function showCard() {
    const word = session.words[session.index];
    if (!word) {
      finishSession();
      return;
    }
    const mode = session.mode === 'mixed' ? (session.index % 2 === 0 ? 'recall' : 'blank') : session.mode;
    const gap = mode === 'blank' ? study.gap(word) : '';
    session.activeMode = gap && gap !== word.sentence ? 'blank' : 'recall';
    session.hinted = false;
    session.revealed = false;
    const type = session.activeMode === 'blank' ? '原句填空' : '中文回忆英文';
    label('tag', (session.index + 1) + ' / ' + session.words.length + ' · ' + type);
    label('prompt', session.activeMode === 'blank' ? gap : word.meaning);
    $('prompt').lang = session.activeMode === 'blank' ? 'en' : 'zh-Hans';
    $('input').value = '';
    $('input').readOnly = false;
    $('good').disabled = false;
    $('hint').disabled = false;
    visible('hint-text', false);
    visible('answer', false);
    visible('question-actions', true);
    visible('card', true);
    $('prompt').focus();
  }

  function startSession() {
    if (session) return;
    const words = available(group(), Number($('limit').value));
    if (!words.length) {
      updateOverview();
      return;
    }
    session = {words, mode: $('mode').value, index: 0, results: []};
    $('settings').open = false;
    for (const id of ['group', 'mode', 'limit']) $(id).disabled = true;
    visible('finish', false);
    updateOverview();
    showCard();
  }

  function reveal() {
    if (!session || session.revealed) return;
    const word = session.words[session.index];
    session.revealed = true;
    $('input').readOnly = true;
    visible('question-actions', false);
    label('term', session.activeMode === 'blank' ? word.target : word.term);
    markTarget($('sentence'), word);
    label('translation', word.translation || '');
    label('note', word.note || '');
    visible('hint-warning', session.hinted);
    visible('answer', true);
    $('term').focus();
  }

  function showHint() {
    if (!session || session.revealed || session.hinted) return;
    const word = session.words[session.index];
    const answer = session.activeMode === 'blank' ? word.target : word.term;
    session.hinted = true;
    $('good').disabled = true;
    $('hint').disabled = true;
    label('hint-text', '首字母：' + answer.trim().charAt(0));
    visible('hint-text', true);
    $('input').focus();
  }

  function recordAnswer(rate) {
    if (!session || (rate !== 'skip' && (!session.revealed || (rate === 'good' && session.hinted)))) return;
    const word = session.words[session.index];
    let next = null;
    if (rate !== 'skip') {
      next = study.rate(progress[word.id], rate, Date.now(), session.activeMode);
      data.saveReview(word.id, next);
    }
    session.results.push({word, rate, due: next?.due});
    session.index += 1;
    showCard();
  }

  function reviewItem(result) {
    const item = document.createElement('details');
    item.className = 'review-item';
    const summary = document.createElement('summary');
    const term = document.createElement('strong');
    term.lang = 'en';
    term.textContent = result.word.term;
    const status = document.createElement('span');
    status.className = 'sub';
    status.textContent = ratings[result.rate];
    summary.append(term, status);
    const meaning = document.createElement('p');
    meaning.textContent = result.word.meaning;
    const sentence = document.createElement('p');
    sentence.lang = 'en';
    markTarget(sentence, result.word);
    const note = document.createElement('p');
    note.className = 'sub';
    note.textContent = result.word.note || '';
    item.append(summary, meaning, sentence, note);
    return item;
  }

  function finishSession() {
    const results = session.results;
    session = null;
    for (const id of ['group', 'mode', 'limit']) $(id).disabled = false;
    visible('card', false);
    updateOverview();

    $('summary').replaceChildren(...results.map(reviewItem));
    const needsReview = results.filter(result => result.rate === 'hard' || result.rate === 'again');
    const next = needsReview.length ? Math.min(...needsReview.map(result => result.due)) : null;
    label('finish-note', results.length
      ? '已复习 ' + results.filter(result => result.rate !== 'skip').length + ' 张'
        + (needsReview.length && Number.isFinite(next) ? ' · 不熟词块最早 ' + formatTime(next) + ' 可重练' : '')
      : '本轮尚未作答，随时可以重新开始。');
    const example = results.find(result => result.rate !== 'skip' && usableExtension(result.word))?.word;
    visible('practice-recent', Boolean(example));
    $('practice-recent').onclick = () => {
      if (!example) return;
      showScene(example.id);
      $('scene').open = true;
      $('scene').querySelector('summary').focus();
    };
    visible('finish', true);
    $('finish-title').focus();
  }

  function usableExtension(word) {
    return Object.values(word?.extensions || {}).find(item =>
      typeof item?.translation === 'string' && item.translation
      && typeof item?.example === 'string' && item.example);
  }

  function scenePool() {
    return catalog.filter(word => (!group() || word.book === group()) && usableExtension(word));
  }

  function showScene(preferredId) {
    const pool = scenePool();
    const chosen = pool.find(word => word.id === preferredId) || pool[0];
    sceneId = chosen?.id;
    visible('scene-content', Boolean(chosen));
    visible('scene-empty', !chosen);
    if (!chosen) {
      label('scene-empty', catalogReady ? '这个分组暂无换情景练习。' : '正在读取词库…');
      return;
    }
    const extension = usableExtension(chosen);
    label('scene-prompt', extension.translation);
    label('scene-reference', extension.example);
    label('scene-note', chosen.note || '');
    $('scene-input').value = drafts['scene:' + sceneId] || '';
    $('scene-save').disabled = !$('scene-input').value.trim();
    $('scene-next').disabled = pool.length < 2;
    setReference('scene', false);
  }

  function showParagraph() {
    const item = paragraphs[paragraphIndex];
    const bodyMode = $('paragraph-mode').value === 'body';
    label('paragraph-prompt', item.prompt);
    label('paragraph-instruction', bodyMode
      ? '写一段正文。提出一个观点，解释为什么，再补一个具体情景或结果。'
      : '用英文写三句：给出一个观点，解释原因，说出一个具体结果。');
    label('reason-check', bodyMode ? '哪一个具体动作或变化能证明开头的理由？' : '第二句解释了第一句里的哪个想法？');
    label('result-check', bodyMode ? '从这个细节到结论，中间还需要解释哪一步？' : '最后的结果是怎么从原因推出来的？');
    label('paragraph-reference', bodyMode ? item.body : item.example);
    label('paragraph-check', item.check);
    $('paragraph-cues').open = false;
    $('paragraph-self-check').open = false;
    $('paragraph-cue-list').replaceChildren(...item.cues.map(text => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }));
    $('paragraph-input').value = drafts[paragraphDraftId()] || '';
    $('practice-focus').value = drafts['focus:' + paragraphDraftId()] || '';
    updateParagraphCount();
    setReference('paragraph', false);
  }

  function paragraphDraftId() {
    const kind = $('paragraph-mode').value === 'body' ? 'body' : 'paragraph';
    return kind + ':' + paragraphs[paragraphIndex].id;
  }

  function updateParagraphCount() {
    const text = $('paragraph-input').value;
    const words = text.match(/[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*/g) || [];
    label('paragraph-word-count', words.length + ' 词');
    $('paragraph-save').disabled = !text.trim();
  }

  function markSupport(draftId, flag) {
    supports[draftId] = (supports[draftId] || 0) | flag;
    writeLocal(supportKey, supports);
  }

  function setReference(exercise, show) {
    visible(exercise + '-answer', show);
    if (show) markSupport(exercise === 'scene' ? 'scene:' + sceneId : paragraphDraftId(), 2);
    $(exercise + '-reveal').setAttribute('aria-expanded', String(show));
    label(exercise + '-reveal', show ? '收起参考' : '查看参考');
  }

  function saveDraft(input, draftId) {
    const text = $(input).value;
    if (text) drafts[draftId] = text;
    else delete drafts[draftId];
    label('draft-status', writeLocal(draftKey, drafts)
      ? '自练草稿保存在本机。'
      : '浏览器暂时无法保存草稿，请先复制你写的内容。');
  }

  function savePractice(kind, draftId, prompt, text, focus = '') {
    if (!text.trim()) return;
    const support = ['', '中文要点', '参考示范', '中文要点和参考示范'][supports[draftId]] || '';
    label('draft-status', records.save({kind, prompt, text, focus, support})
      ? '这一版已保存在练习记录。'
      : '浏览器暂时无法保存练习，请先复制你写的内容。');
  }

  function importPractice(writing) {
    let retained = 0;
    if (writing?.drafts && typeof writing.drafts === 'object' && !Array.isArray(writing.drafts)) {
      for (const [key, value] of Object.entries(writing.drafts)) {
        if (typeof value !== 'string' || !value || value.length > 3000
          || !/^(focus:)?(scene|paragraph|body):.{1,320}$/u.test(key)) continue;
        if (!drafts[key]) drafts[key] = value;
        else if (drafts[key] !== value) retained++;
      }
    }
    if (writing?.supports && typeof writing.supports === 'object' && !Array.isArray(writing.supports)) {
      for (const [key, flag] of Object.entries(writing.supports)) {
        if (drafts[key] && Number.isInteger(flag) && flag >= 0 && flag <= 3) supports[key] = (supports[key] || 0) | flag;
      }
    }
    const writingSaved = records.import(writing?.records);
    const draftsSaved = writeLocal(draftKey, drafts);
    const supportsSaved = writeLocal(supportKey, supports);
    showScene(sceneId);
    showParagraph();
    return {saved: writingSaved && draftsSaved && supportsSaved, retained};
  }

  $('group').onchange = () => {
    saveSettings();
    updateOverview();
    showScene();
  };
  $('mode').onchange = saveSettings;
  $('limit').onchange = saveSettings;
  $('start').onclick = startSession;
  $('end').onclick = finishSession;
  $('reveal').onclick = reveal;
  $('hint').onclick = showHint;
  $('skip').onclick = () => recordAnswer('skip');
  document.querySelectorAll('[data-rate]').forEach(button => {
    button.onclick = () => recordAnswer(button.dataset.rate);
  });

  $('scene-reveal').onclick = () => setReference('scene', $('scene-answer').hidden);
  $('paragraph-reveal').onclick = () => setReference('paragraph', $('paragraph-answer').hidden);
  $('scene-input').oninput = () => {
    saveDraft('scene-input', 'scene:' + sceneId);
    $('scene-save').disabled = !$('scene-input').value.trim();
  };
  $('paragraph-input').oninput = () => {
    saveDraft('paragraph-input', paragraphDraftId());
    updateParagraphCount();
  };
  $('practice-focus').oninput = () => saveDraft('practice-focus', 'focus:' + paragraphDraftId());
  $('paragraph-cues').ontoggle = () => {
    if ($('paragraph-cues').open) markSupport(paragraphDraftId(), 1);
  };
  $('paragraph-mode').onchange = () => {
    writeLocal(paragraphModeKey, $('paragraph-mode').value);
    showParagraph();
  };
  $('scene-save').onclick = () => savePractice(
    'scene', 'scene:' + sceneId, $('scene-prompt').textContent, $('scene-input').value
  );
  $('paragraph-save').onclick = () => savePractice(
    $('paragraph-mode').value === 'body' ? 'body' : 'paragraph',
    paragraphDraftId(), paragraphs[paragraphIndex].prompt, $('paragraph-input').value, $('practice-focus').value
  );
  $('scene-next').onclick = () => {
    const pool = scenePool();
    if (pool.length < 2) return;
    const next = (pool.findIndex(word => word.id === sceneId) + 1) % pool.length;
    showScene(pool[next].id);
    $('scene-input').focus();
  };
  $('paragraph-next').onclick = () => {
    paragraphIndex = (paragraphIndex + 1) % paragraphs.length;
    writeLocal(paragraphKey, paragraphs[paragraphIndex].id);
    showParagraph();
    $('paragraph-input').focus();
  };

  $('export').onclick = () => {
    const payload = JSON.stringify({
      ...data.exportBackup(), writing: {drafts, supports, records: records.export()}
    }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'writing-review-backup.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    label('notice', '已生成备份文件。');
  };

  $('import').onclick = () => $('backup-file').click();
  $('backup-file').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      const saved = await data.importBackup(backup);
      const writing = importPractice(backup.writing);
      label('notice', !saved || !writing.saved
        ? '已读取备份，但部分内容未能保存在本机。请保留原文件。'
        : writing.retained ? '已导入备份。同题草稿有冲突时保留了本机版本。' : '已导入备份。');
    } catch {
      label('notice', '未能导入，请选择写作复习页导出的 JSON 备份。');
    } finally {
      event.target.value = '';
    }
  };

  $('cloudRetry').onclick = async () => {
    const button = $('cloudRetry');
    button.disabled = true;
    label('notice', '正在尝试同步…');
    try {
      await data.retry();
      label('notice', $('cloudStatus').textContent);
    } catch {
      label('notice', '同步暂不可用，请稍后再试。');
    } finally {
      button.disabled = false;
    }
  };

  async function enableOffline() {
    const workers = navigator.serviceWorker;
    if (!workers) return;
    let reloading = false;
    try {
      workerRegistration = await workers.register('./sw.js');
    } catch {
      return;
    }
    updateOverview();
    workerRegistration.addEventListener('updatefound', () => {
      workerRegistration.installing?.addEventListener('statechange', updateOverview);
    });
    workers.addEventListener('controllerchange', () => {
      if (reloading) window.location.reload();
      else updateOverview();
    });
    $('update').onclick = () => {
      const waiting = workerRegistration.waiting;
      if (!waiting || session || reloading) return;
      reloading = true;
      $('update').disabled = true;
      label('update-status', '更新中…');
      waiting.postMessage('ACTIVATE_UPDATE');
    };
  }

  showParagraph();
  enableOffline();
  data.init(state => {
    const previousCatalog = catalog;
    catalog = state.catalog;
    progress = state.progress;
    catalogReady = catalogReady || catalog.length > 0;
    label('cloudStatus', state.status + (state.localSaved === false ? ' · 本机保存不可用' : ''));
    updateOverview();
    if (previousCatalog !== catalog && (sceneId == null || !scenePool().some(word => word.id === sceneId))) {
      showScene();
    }
  });
  setInterval(updateOverview, 15_000);
})();
