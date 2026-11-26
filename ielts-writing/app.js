(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const study = window.WritingStudy;
  const data = window.WritingData;
  const records = window.WritingRecords;
  const ratings = {good: '认识', again: '忘记', skip: '跳过'};
  const DAILY_GOAL = 5;
  const DAILY_NEW_LIMIT = 6;
  const DAY = 86400000;
  const settingsKey = 'ielts-writing-settings-v1';
  const lastRoundKey = 'ielts-writing-last-round-v1';
  const draftKey = 'ielts-writing-drafts-v1';
  const paragraphKey = 'ielts-writing-paragraph-v1';
  const paragraphModeKey = 'ielts-writing-paragraph-mode-v1';
  const supportKey = 'ielts-writing-support-v1';
  const paragraphs = window.WritingPrompts;
  const errorCards = window.WritingErrorCards || [];

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
      window.WritingCloud.schedule();
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
  let errorSession = null;
  let lastErrorRoundIds = [];
  let workerRegistration;
  let sceneId;
  let paragraphIndex = paragraphs.findIndex(item => item.id === readLocal(paragraphKey, 'library'));
  if (paragraphIndex < 0) paragraphIndex = 0;
  const drafts = Object.assign(Object.create(null), readLocal(draftKey, {}));
  const supports = Object.assign(Object.create(null), readLocal(supportKey, {}));
  $('paragraph-mode').value = readLocal(paragraphModeKey, 'short') === 'body' ? 'body' : 'short';
  const settings = readLocal(settingsKey, {});
  const urlGroupParam = new URLSearchParams(window.location.search).get('group') || '';
  let requestedGroup = typeof settings.group === 'string' ? settings.group : '';
  let urlGroupApplied = false;

  if ([1, 2, 3, 5, 10].includes(Number(settings.limit))) $('limit').value = String(settings.limit);

  const group = () => $('group').value;
  const available = (selected, limit = catalog.length) =>
    catalog.length ? study.select(catalog, progress, {group: selected, limit, now: Date.now()}) : [];
  function countNewDoneToday(now = Date.now()) {
    const todayKey = study.dayKey(now);
    let count = 0;
    for (const word of catalog) {
      const firstReal = (progress[word.id]?.history || []).find(item => item.rate !== 'skip');
      if (firstReal && study.dayKey(firstReal.at) === todayKey) count++;
    }
    return count;
  }
  const remainingNewQuota = (now = Date.now()) => Math.max(0, DAILY_NEW_LIMIT - countNewDoneToday(now));
  const label = (id, value) => {
    const element = $(id);
    if (element.textContent !== value) element.textContent = value;
  };
  const visible = (id, show) => { $(id).hidden = !show; };

  function resolveGroupParam(names, raw) {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (names.includes(trimmed)) return trimmed;
    const prefixed = trimmed.startsWith('写作-') ? trimmed : '写作-' + trimmed;
    if (names.includes(prefixed)) return prefixed;
    return names.find(name => name.toLowerCase() === prefixed.toLowerCase()) || '';
  }

  function updateOverview() {
    const names = [...new Set(catalog.map(word => word.book))].sort();
    const now = Date.now();
    if (urlGroupParam && !urlGroupApplied && names.length) {
      const resolved = resolveGroupParam(names, urlGroupParam);
      if (resolved) requestedGroup = resolved;
      urlGroupApplied = true;
    }
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
    const dueWords = group() ? all.filter(word => word.book === group()) : all;
    const learnedDue = dueWords.filter(word => progress[word.id]).length;
    const due = learnedDue + Math.min(dueWords.length - learnedDue, remainingNewQuota(now));
    const total = matching.length;
    if (!total) {
      label('availability', catalogReady ? '词库暂无可用词块' : '正在读取词库…');
    } else {
      const soonest = Math.min(...matching.map(word => study.migrate(progress[word.id], now).due || 0).filter(time => time > now));
      const nextTime = Number.isFinite(soonest) ? ' · 下次 ' + formatTime(soonest) : '';
      label('availability', due ? '现在可练 ' + due + ' 张 · 共 ' + total + ' 张' : '暂时没有到期词块' + nextTime);
    }

    if (catalog.length) {
      const todayKey = study.dayKey(now);
      let doneToday = 0;
      let maxOverdueDays = 0;
      for (const word of catalog) {
        const raw = progress[word.id];
        if (!raw) continue;
        const state = study.migrate(raw, now);
        if ((state.history || []).some(item => item.rate !== 'skip' && study.dayKey(item.at) === todayKey)) {
          doneToday++;
        }
        if (state.phase === 'review' && (state.due || 0) <= now && (state.due || 0) > 0) {
          const days = Math.floor((now - state.due) / DAY);
          if (days > maxOverdueDays) maxOverdueDays = days;
        }
      }
      const newCount = matching.filter(word => !progress[word.id]).length;
      const remainingNew = remainingNewQuota(now);
      label('daily-goal', '今日目标 ' + DAILY_GOAL + ' 张 · 已完成 ' + doneToday + ' 张');
      $('daily-goal').classList.toggle('is-done', doneToday >= DAILY_GOAL);
      if (newCount > 0) {
        if (remainingNew > 0) {
          label('start-new', '新卡待学 ' + newCount + ' 张 · 今日可学 ' + Math.min(newCount, remainingNew) + ' 张');
          $('start-new').disabled = Boolean(session) || Boolean(errorSession);
        } else {
          label('start-new', '今日新卡已达上限（' + DAILY_NEW_LIMIT + '张）');
          $('start-new').disabled = true;
        }
        visible('start-new', true);
      } else {
        visible('start-new', false);
      }
      if (maxOverdueDays >= 1) {
        label('overdue-pill', '最长已过期 ' + maxOverdueDays + ' 天');
        visible('overdue-pill', true);
      } else {
        visible('overdue-pill', false);
      }
      visible('review-stats', true);
    } else {
      visible('review-stats', false);
    }

    $('start').disabled = Boolean(session) || Boolean(errorSession) || due === 0;
    if (errorCards.length) {
      const errorDue = study.select(errorCards, progress, {limit: errorCards.length, now});
      const soonestError = Math.min(...errorCards.map(card => study.migrate(progress[card.id], now).due || 0).filter(t => t > now));
      const nextErrTime = Number.isFinite(soonestError) ? ' · 下次 ' + formatTime(soonestError) : '';
      label('error-availability', errorDue.length
        ? '现在可练 ' + errorDue.length + ' 张 · 共 ' + errorCards.length + ' 张'
        : '暂时没有到期错句' + nextErrTime);
      $('error-start').disabled = Boolean(session) || Boolean(errorSession) || errorDue.length === 0;
    }
    visible('update-panel', Boolean(workerRegistration?.waiting) && !session && !errorSession);
    label('catalog-count', catalog.length ? '共 ' + catalog.length + ' 张' : '');
    if ($('catalog-panel')?.open) renderCatalogList();
  }

  function renderCatalogList() {
    const container = $('catalog-list');
    if (!container) return;
    const query = ($('catalog-search')?.value || '').trim().toLowerCase();
    const now = Date.now();
    const items = catalog.filter(word => !query ||
      word.term.toLowerCase().includes(query) ||
      word.meaning.toLowerCase().includes(query) ||
      word.book.toLowerCase().includes(query));
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'sub';
      empty.textContent = catalog.length ? '没有匹配的词块。' : '正在读取词库…';
      container.replaceChildren(empty);
      return;
    }
    container.replaceChildren(...items.map(word => {
      const raw = progress[word.id];
      const state = raw ? study.migrate(raw, now) : null;
      const item = document.createElement('details');
      item.className = 'review-item';
      const summary = document.createElement('summary');
      const term = document.createElement('strong');
      term.lang = 'en';
      term.textContent = word.term;
      const pill = document.createElement('span');
      pill.className = 'level-pill';
      if (!state) {
        pill.textContent = '新卡';
        pill.classList.add('is-due');
      } else if (state.phase === 'learning') {
        pill.textContent = '待巩固 ' + state.streak + '/3' + ((state.due || 0) <= now ? ' · 可练' : ' · ' + formatTime(state.due));
        pill.classList.add('is-due');
      } else if ((state.due || 0) <= now) {
        pill.textContent = 'Lv.' + (state.level || 0) + ' · 待练';
        pill.classList.add('is-due');
      } else {
        pill.textContent = 'Lv.' + (state.level || 0) + ' · ' + formatTime(state.due);
        if ((state.level || 0) >= 3) pill.classList.add('is-strong');
      }
      summary.append(term, pill);
      const meta = document.createElement('p');
      meta.className = 'sub';
      meta.textContent = word.book + ' · ' + word.meaning;
      const sentence = document.createElement('p');
      sentence.lang = 'en';
      markTarget(sentence, word);
      const note = document.createElement('p');
      note.className = 'sub';
      note.textContent = word.note || '';
      item.append(summary, meta, sentence);
      if (word.note) item.append(note);
      return item;
    }));
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(timestamp));
  }

  function saveSettings() {
    requestedGroup = group();
    writeLocal(settingsKey, {group: requestedGroup, limit: Number($('limit').value)});
  }

  function markTarget(target, word, customText, customMatch) {
    const text = customText ?? word.sentence;
    const needle = customMatch ?? word.target ?? word.term;
    const matchAt = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
    if (matchAt < 0) {
      target.textContent = text;
      return;
    }
    const marker = document.createElement('mark');
    marker.textContent = text.slice(matchAt, matchAt + needle.length);
    target.replaceChildren(text.slice(0, matchAt), marker, text.slice(matchAt + needle.length));
  }

  function renderClozeSentence(container, clozeEn) {
    if (!clozeEn) {
      container.replaceChildren();
      container.hidden = true;
      return;
    }
    const blank = '________';
    const idx = clozeEn.indexOf(blank);
    if (idx < 0) {
      container.textContent = clozeEn;
    } else {
      const span = document.createElement('span');
      span.className = 'blank';
      span.textContent = '________';
      container.replaceChildren(clozeEn.slice(0, idx), span, clozeEn.slice(idx + blank.length));
    }
    container.hidden = false;
  }

  function showCard() {
    const word = session.words[session.index];
    if (!word) {
      finishSession();
      return;
    }
    const now = Date.now();
    const rec = study.migrate(progress[word.id], now);
    const cloze = study.buildCloze(word, rec.reviews || 0);
    const stage = rec.phase === 'learning'
      ? '待巩固 ' + rec.streak + '/3'
      : rec.reviews === 0 ? '新卡' : 'Lv.' + rec.level;
    session.cloze = cloze;
    session.revealed = false;
    label('tag', (session.index + 1) + ' / ' + session.words.length + ' · ' + stage);
    label('card-meaning', '目标表达提示：' + word.meaning);
    label('prompt', cloze.zh || word.meaning);
    $('prompt').lang = 'zh-Hans';
    renderClozeSentence($('cloze-sentence'), cloze.clozeEn);
    visible('answer', false);
    visible('question-actions', true);
    visible('card', true);
    $('prompt').focus();
  }

  function startSession(onlyNew = false) {
    if (session || errorSession) return;
    const selectedGroup = group();
    const limit = Number($('limit').value);
    const now = Date.now();
    const remainingNew = remainingNewQuota(now);
    let words;
    if (onlyNew) {
      if (remainingNew === 0) {
        updateOverview();
        return;
      }
      const pool = catalog.filter(word => (!selectedGroup || word.book === selectedGroup) && !progress[word.id]);
      words = pool.slice(0, Math.min(limit, remainingNew));
    } else {
      const previous = readLocal(lastRoundKey, {});
      let allowedNew = remainingNew;
      const eligible = available(selectedGroup).filter(word => {
        if (progress[word.id]) return true;
        if (allowedNew > 0) {
          allowedNew--;
          return true;
        }
        return false;
      });
      words = study.round(eligible, progress, limit,
        previous.group === selectedGroup ? previous.ids : [], now);
    }
    if (!words.length) {
      updateOverview();
      return;
    }
    writeLocal(lastRoundKey, {group: selectedGroup, ids: words.map(word => word.id)});
    session = {words, index: 0, results: []};
    $('settings').open = false;
    visible('rate-status', false);
    for (const id of ['group', 'limit']) $(id).disabled = true;
    visible('finish', false);
    updateOverview();
    showCard();
  }

  function reveal() {
    if (!session || session.revealed) return;
    const word = session.words[session.index];
    const cloze = session.cloze || study.buildCloze(word, progress[word.id]?.reviews || 0);
    session.revealed = true;
    visible('question-actions', false);
    label('term', cloze.expected || word.term);
    markTarget($('sentence'), word, cloze.en || word.sentence, cloze.expected);
    label('translation', cloze.zh || word.translation || '');
    label('note', word.note || '');
    visible('answer', true);
    $('term').focus();
  }

  function recordAnswer(rate) {
    if (!session || (rate !== 'skip' && !session.revealed)) return;
    const word = session.words[session.index];
    let due = null;
    if (rate !== 'skip') {
      const res = study.rate(progress[word.id], rate, Date.now(), session.cloze?.clozeEn ? 'cloze' : 'recall');
      data.saveReview(word.id, res.record);
      due = res.record.due;
      label('rate-status', res.message);
      visible('rate-status', Boolean(res.message));
    }
    session.results.push({word, rate, due});
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
    status.textContent = ratings[result.rate] || result.rate;
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
    for (const id of ['group', 'limit']) $(id).disabled = false;
    visible('card', false);
    updateOverview();

    $('summary').replaceChildren(...results.map(reviewItem));
    const needsReview = results.filter(result => result.rate === 'again');
    const next = needsReview.length ? Math.min(...needsReview.map(result => result.due)) : null;
    label('finish-note', results.length
      ? '已复习 ' + results.filter(result => result.rate !== 'skip').length + ' 张'
        + (needsReview.length && Number.isFinite(next) ? ' · 忘记词块将在 ' + formatTime(next) + ' 进入巩固' : '')
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

  function showErrorCard() {
    const card = errorSession.words[errorSession.index];
    if (!card) {
      finishErrorSession();
      return;
    }
    const now = Date.now();
    const rec = study.migrate(progress[card.id], now);
    const stage = rec.phase === 'learning'
      ? '待巩固 ' + rec.streak + '/3'
      : rec.reviews === 0 ? '新错句' : 'Lv.' + rec.level;
    errorSession.revealed = false;
    label('error-tag', (errorSession.index + 1) + ' / ' + errorSession.words.length + ' · ' + card.tag + ' · ' + stage);
    label('error-wrong', card.wrong);
    visible('error-answer', false);
    visible('error-question-actions', true);
    visible('error-card', true);
    $('error-wrong').focus();
  }

  function startErrorSession() {
    if (session || errorSession || !errorCards.length) return;
    const now = Date.now();
    const eligible = study.select(errorCards, progress, {limit: errorCards.length, now});
    const words = study.round(eligible, progress, 5, lastErrorRoundIds, now);
    if (!words.length) {
      updateOverview();
      return;
    }
    lastErrorRoundIds = words.map(card => card.id);
    errorSession = {words, index: 0, results: [], revealed: false};
    visible('error-rate-status', false);
    visible('error-finish', false);
    updateOverview();
    showErrorCard();
  }

  function revealErrorCard() {
    if (!errorSession || errorSession.revealed) return;
    const card = errorSession.words[errorSession.index];
    errorSession.revealed = true;
    visible('error-question-actions', false);
    label('error-right', card.right);
    label('error-note', card.note);
    visible('error-answer', true);
    $('error-right').focus();
  }

  function recordErrorAnswer(rate) {
    if (!errorSession || (rate !== 'skip' && !errorSession.revealed)) return;
    const card = errorSession.words[errorSession.index];
    let due = null;
    if (rate !== 'skip') {
      const res = study.rate(progress[card.id], rate, Date.now(), 'error');
      data.saveReview(card.id, res.record);
      due = res.record.due;
      label('error-rate-status', res.message);
      visible('error-rate-status', Boolean(res.message));
    }
    errorSession.results.push({card, rate, due});
    errorSession.index += 1;
    showErrorCard();
  }

  function errorReviewItem(result) {
    const item = document.createElement('details');
    item.className = 'review-item';
    const summary = document.createElement('summary');
    const title = document.createElement('strong');
    title.textContent = result.card.tag;
    const status = document.createElement('span');
    status.className = 'sub';
    status.textContent = ratings[result.rate] || result.rate;
    summary.append(title, status);
    const wrong = document.createElement('p');
    wrong.className = 'sub';
    wrong.lang = 'en';
    wrong.textContent = '原：' + result.card.wrong;
    const right = document.createElement('p');
    right.lang = 'en';
    right.textContent = '改：' + result.card.right;
    const note = document.createElement('p');
    note.className = 'sub';
    note.textContent = result.card.note;
    item.append(summary, wrong, right, note);
    return item;
  }

  function finishErrorSession() {
    const results = errorSession.results;
    errorSession = null;
    visible('error-card', false);
    updateOverview();
    $('error-summary').replaceChildren(...results.map(errorReviewItem));
    const needsReview = results.filter(result => result.rate === 'again');
    const next = needsReview.length ? Math.min(...needsReview.map(result => result.due)) : null;
    label('error-finish-note', results.length
      ? '已过 ' + results.filter(result => result.rate !== 'skip').length + ' 张错句'
        + (needsReview.length && Number.isFinite(next) ? ' · 忘记错句将在 ' + formatTime(next) + ' 进入巩固' : '')
      : '本轮尚未作答，随时可以重新开始。');
    visible('error-finish', true);
    $('error-finish-title').focus();
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
    const sentences = text.trim()
      ? text.trim().split(/[.!?。！？]+/).filter(part => /[A-Za-z0-9\u4e00-\u9fff]/.test(part)).length
      : 0;
    label('paragraph-word-count', sentences + ' 句 · ' + words.length + ' 词');
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
      ? '草稿已保存。'
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
  $('limit').onchange = saveSettings;
  $('start').onclick = () => startSession(false);
  $('start-new').onclick = () => startSession(true);
  $('end').onclick = finishSession;
  $('reveal').onclick = reveal;
  $('skip').onclick = () => recordAnswer('skip');
  document.querySelectorAll('[data-rate]').forEach(button => {
    button.onclick = () => recordAnswer(button.dataset.rate);
  });
  $('error-start').onclick = startErrorSession;
  $('error-end').onclick = finishErrorSession;
  $('error-reveal').onclick = revealErrorCard;
  $('error-skip').onclick = () => recordErrorAnswer('skip');
  document.querySelectorAll('[data-error-rate]').forEach(button => {
    button.onclick = () => recordErrorAnswer(button.dataset.errorRate);
  });
  document.addEventListener('keydown', event => {
    if ((!session && !errorSession) || event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
    if (errorSession) {
      if (!errorSession.revealed) {
        if (event.key === ' ' || event.key === 'Enter') {
          if (tag === 'BUTTON') return;
          event.preventDefault();
          revealErrorCard();
        }
        return;
      }
      if (event.key === '1') { event.preventDefault(); recordErrorAnswer('again'); }
      else if (event.key === '2') { event.preventDefault(); recordErrorAnswer('good'); }
      return;
    }
    if (!session.revealed) {
      if (event.key === ' ' || event.key === 'Enter') {
        if (tag === 'BUTTON') return;
        event.preventDefault();
        reveal();
      }
      return;
    }
    if (event.key === '1') { event.preventDefault(); recordAnswer('again'); }
    else if (event.key === '2') { event.preventDefault(); recordAnswer('good'); }
  });
  $('catalog-panel')?.addEventListener('toggle', () => {
    if ($('catalog-panel').open) renderCatalogList();
  });
  $('catalog-search')?.addEventListener('input', renderCatalogList);

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

  async function enableOffline() {
    const workers = navigator.serviceWorker;
    if (!workers) return;
    let reloading = false;
    try {
      workerRegistration = await workers.register('./sw.js');
    } catch {
      return;
    }
    if (!workerRegistration) return;
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

  window.addEventListener('storage', event => {
    if (event.key === draftKey) {
      for (const key of Object.keys(drafts)) delete drafts[key];
      Object.assign(drafts, readLocal(draftKey, {}));
      showScene(sceneId);
      showParagraph();
    } else if (event.key === supportKey) {
      for (const key of Object.keys(supports)) delete supports[key];
      Object.assign(supports, readLocal(supportKey, {}));
    }
  });
  showParagraph();
  enableOffline();
  data.init(state => {
    const previousCatalog = catalog;
    catalog = state.catalog;
    progress = state.progress;
    catalogReady = catalogReady || catalog.length > 0;
    if (!state.localSaved) label('notice', '本机保存不可用，请检查浏览器存储。');
    updateOverview();
    if (previousCatalog !== catalog && (sceneId == null || !scenePool().some(word => word.id === sceneId))) {
      showScene();
    }
  });
  setInterval(updateOverview, 15_000);
})();
