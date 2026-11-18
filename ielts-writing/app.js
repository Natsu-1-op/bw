(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const study = window.WritingStudy;
  const data = window.WritingData;
  const ratings = {good: '独立想起', hard: '模糊', again: '忘记了', skip: '跳过'};
  const settingsKey = 'ielts-writing-settings-v1';
  const draftKey = 'ielts-writing-drafts-v1';
  const paragraphKey = 'ielts-writing-paragraph-v1';

  const paragraphs = [
    {
      id: 'library',
      prompt: '你认为社区图书馆应该延长开放时间吗？',
      example: 'Public libraries should stay open later. Many adults work during the day and cannot get to the library before it closes. With longer opening hours, they could borrow books or study after work.',
      check: '第二句交代了上班的人为什么赶不上。第三句说清延长开放时间后，他们能做什么。',
    },
    {
      id: 'sports',
      prompt: '你认为大学应该在周末开放体育馆吗？',
      example: 'Universities should keep their sports halls open at weekends. Some students have classes or part-time jobs on weekdays and struggle to find time for exercise. Opening the sports halls at weekends would give them more chances to stay active.',
      check: '第二句解释了工作日为什么难以锻炼。第三句把周末开放和增加锻炼机会连了起来。',
    },
    {
      id: 'fees',
      prompt: '你认为博物馆应该向学生免收门票吗？',
      example: 'Museums should offer free admission to students. Students often have limited budgets and may find regular visits too expensive. With free admission, they could visit more often and explore different exhibitions.',
      check: '第二句交代费用如何影响学生参观。第三句具体说明免票后会有什么变化。',
    },
  ];

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
  let sceneId;
  let paragraphIndex = paragraphs.findIndex(item => item.id === readLocal(paragraphKey, 'library'));
  if (paragraphIndex < 0) paragraphIndex = 0;
  const drafts = Object.assign(Object.create(null), readLocal(draftKey, {}));
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
    $('scene-next').disabled = pool.length < 2;
    setReference('scene', false);
  }

  function showParagraph() {
    const item = paragraphs[paragraphIndex];
    label('paragraph-prompt', item.prompt);
    label('paragraph-reference', item.example);
    label('paragraph-check', item.check);
    $('paragraph-input').value = drafts['paragraph:' + item.id] || '';
    setReference('paragraph', false);
  }

  function setReference(exercise, show) {
    visible(exercise + '-answer', show);
    $(exercise + '-reveal').setAttribute('aria-expanded', String(show));
    const closedLabel = exercise === 'scene' ? '查看参考' : '查看自查与示范';
    label(exercise + '-reveal', show ? '收起参考' : closedLabel);
  }

  function saveDraft(input, draftId) {
    const text = $(input).value;
    if (text) drafts[draftId] = text;
    else delete drafts[draftId];
    label('draft-status', writeLocal(draftKey, drafts)
      ? '自练草稿保存在本机。'
      : '浏览器暂时无法保存草稿，请先复制你写的内容。');
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
  $('scene-input').oninput = () => saveDraft('scene-input', 'scene:' + sceneId);
  $('paragraph-input').oninput = () => saveDraft('paragraph-input', 'paragraph:' + paragraphs[paragraphIndex].id);
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
    const payload = JSON.stringify(data.exportBackup(), null, 2);
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
      const saved = await data.importBackup(JSON.parse(await file.text()));
      label('notice', saved === false ? '已读取备份，但本机保存失败。请保留原文件。' : '已导入备份。');
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

  showParagraph();
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
