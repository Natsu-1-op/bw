'use strict';

const $ = id => document.getElementById(id);
const key = 'ielts-writing-class-v1';
const limit = 3_000_000;
let data = {active: '', lessons: {}, drafts: {}};
let lesson;
let copyFeedbackTimer;
const status = message => { $('status').textContent = message; };

function save() {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    window.WritingCloud.schedule();
    return true;
  } catch {
    status('浏览器暂时无法保存。请保留这一页，或导出本课记录。');
    return false;
  }
}

function string(value, max) {
  return typeof value === 'string' && value.trim() && value.length <= max;
}

function countWords(text) {
  return (text.match(/[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*/g) || []).length;
}

function countSentences(text) {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/[.!?。！？]+/).filter(part => /[A-Za-z0-9\u4e00-\u9fff]/.test(part)).length;
}

function extractJsonText(raw) {
  const text = String(raw || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function readLesson(raw) {
  if (raw?.version !== 1 || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(raw.id || '') ||
      !string(raw.title, 200) || !string(raw.prompt, 5000) || !string(raw.task, 5000) ||
      !Array.isArray(raw.rounds) || raw.rounds.length > 100) {
    throw new Error('无法读取这份练习文件。');
  }
  const rounds = raw.rounds.map(round => {
    if (!string(round?.draft, 16000) || !string(round.next, 5000) ||
        !Array.isArray(round.notes) || !round.notes.length || round.notes.length > 30) {
      throw new Error('批注需要包含原稿、至少一条反馈和下一步任务。');
    }
    const notes = round.notes.map(note => {
      if (!string(note?.quote, 16000) || !round.draft.includes(note.quote) ||
          !string(note.comment, 5000)) throw new Error('有一条批注找不到对应的原文。');
      return {quote: note.quote, comment: note.comment};
    });
    return {draft: round.draft, notes, next: round.next};
  });
  return {version: 1, id: raw.id, title: raw.title, prompt: raw.prompt, task: raw.task, rounds};
}

function accept(raw) {
  const incoming = readLesson(raw);
  const existing = Object.hasOwn(data.lessons, incoming.id) ? data.lessons[incoming.id] : null;
  const sameRounds = existing && existing.rounds.slice(0, incoming.rounds.length).every(
    (round, i) => JSON.stringify(round) === JSON.stringify(incoming.rounds[i]));
  const sameDrafts = existing && incoming.rounds.length === existing.rounds.length &&
    existing.rounds.every((round, i) => round.draft === incoming.rounds[i].draft);
  if (existing && (
      existing.prompt !== incoming.prompt || existing.task !== incoming.task ||
      (!sameRounds && !sameDrafts)
  )) throw new Error('这份文件与本机已保存的练习内容有冲突，请核对后重新导入。');

  if (!existing || incoming.rounds.length >= existing.rounds.length) data.lessons[incoming.id] = incoming;
  const savedKey = incoming.id + ':' + incoming.rounds.length;
  const previousDraft = existing && data.drafts[incoming.id + ':' + existing.rounds.length];
  if (existing && incoming.rounds.length === existing.rounds.length + 1 &&
      previousDraft && previousDraft !== incoming.rounds.at(-1).draft && !Object.hasOwn(data.drafts, savedKey)) {
    data.drafts[savedKey] = previousDraft;
  }
  const exportedDraft = raw.pending;
  if (string(exportedDraft, 16000) && !Object.hasOwn(data.drafts, savedKey)) {
    data.drafts[savedKey] = exportedDraft;
  }
  data.active = incoming.id;
  render();
  if (!save()) return false;
  status(existing && incoming.rounds.length < existing.rounds.length
    ? '已打开本课较新的记录。' : incoming.rounds.length ? '已载入最新批注和下一步任务。' : '已载入练习。');
  return true;
}

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function renderRound(round, index) {
  const item = element('details', '', 'card');
  const words = countWords(round.draft);
  const heading = (index === 0 ? '初稿的批注' : '第 ' + index + ' 次改稿的批注') + '（' + words + ' 词）';
  item.append(element('summary', heading));
  item.append(renderOriginal(round), ...renderNotes(round, false));
  item.append(element('p', '当时的下一步\n' + round.next, 'review-task'));
  return item;
}

function renderOriginal(round) {
  const original = element('p', '', 'english record-text');
  original.lang = 'en';
  const quotes = round.notes
    .map(note => ({quote: note.quote, start: round.draft.indexOf(note.quote)}))
    .sort((a, b) => a.start - b.start || b.quote.length - a.quote.length);
  let offset = 0;
  for (const {quote, start} of quotes) {
    if (start < offset) continue;
    original.append(round.draft.slice(offset, start), element('mark', quote));
    offset = start + quote.length;
  }
  original.append(round.draft.slice(offset));
  return original;
}

function renderNotes(round, interactive = true) {
  return round.notes.map((note, index) => {
    const annotation = element('div', '', 'annotation');
    const head = element('div', '', 'annotation-head');
    head.append(element('span', '批注 ' + (index + 1) + '/' + round.notes.length, 'note-index'));
    if (interactive) {
      const badge = element('span', '✓ 已修改', 'note-badge');
      badge.hidden = true;
      head.append(badge);
      annotation.dataset.quote = note.quote;
    }
    const quote = element('blockquote', note.quote);
    quote.lang = 'en';
    annotation.append(head, quote, element('p', note.comment));
    return annotation;
  });
}

function syncAnnotationStates() {
  const notes = [...$('active-notes').querySelectorAll('.annotation[data-quote]')];
  if (!notes.length) {
    $('notes-progress').textContent = '';
    $('notes-progress').classList.remove('is-all-done');
    return;
  }
  const text = $('draft').value;
  let done = 0;
  for (const note of notes) {
    const isModified = !text.includes(note.dataset.quote);
    note.classList.toggle('is-done', isModified);
    const badge = note.querySelector('.note-badge');
    if (badge) badge.hidden = !isModified;
    if (isModified) done++;
  }
  const progress = $('notes-progress');
  const allDone = done === notes.length;
  progress.classList.toggle('is-all-done', allDone);
  progress.textContent = allDone
    ? '✓ 本轮 ' + notes.length + ' 条已全部修改'
    : '已改 ' + done + ' / ' + notes.length + ' 条';
}

function scrollToOffset(textarea, offset) {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement('div');
  mirror.style.cssText = [
    'position:absolute', 'left:-9999px', 'top:0', 'visibility:hidden',
    'white-space:pre-wrap', 'overflow-wrap:break-word',
    'width:' + textarea.clientWidth + 'px',
    'font:' + style.font,
    'line-height:' + style.lineHeight,
    'padding:' + style.padding,
    'border:' + style.borderWidth + ' solid transparent',
    'box-sizing:border-box'
  ].join(';');
  mirror.textContent = textarea.value.slice(0, offset);
  document.body.append(mirror);
  const height = mirror.getBoundingClientRect().height;
  mirror.remove();
  textarea.scrollTop = Math.max(0, height - textarea.clientHeight / 3);
}

function selectQuote(quote) {
  const textarea = $('draft');
  const start = textarea.value.indexOf(quote);
  if (start < 0) return false;
  textarea.focus();
  textarea.setSelectionRange(start, start + quote.length);
  scrollToOffset(textarea, start);
  return true;
}

function draftKey() {
  return lesson.id + ':' + lesson.rounds.length;
}

function copyButtonDefaultText() {
  return lesson && lesson.rounds.length ? '复制改稿发给老师' : '复制初稿发给老师';
}

function updateRestore() {
  const last = lesson && lesson.rounds.at(-1);
  $('restore').hidden = !last || !last.draft || $('draft').value === last.draft;
}

function updateCount() {
  const text = $('draft').value;
  $('copy').disabled = !text.trim();
  const words = countWords(text);
  const sentences = countSentences(text);
  $('count').textContent = sentences + ' 句 · ' + words + ' 词';
}

function render() {
  lesson = data.lessons[data.active] || Object.values(data.lessons)[0];
  if (lesson) data.active = lesson.id;
  $('lessons').replaceChildren(...Object.values(data.lessons).map(entry => new Option(entry.title, entry.id)));
  $('lesson-select').hidden = !lesson;
  $('lesson').hidden = !lesson;
  $('export').hidden = !lesson;
  $('empty').hidden = Boolean(lesson);
  if (!lesson) return;
  $('lessons').value = lesson.id;
  $('title').textContent = lesson.title;
  $('prompt').textContent = lesson.prompt;
  const last = lesson.rounds.at(-1);
  $('task').textContent = last ? last.next : lesson.task;
  $('draft-label').textContent = last ? '我的第 ' + lesson.rounds.length + ' 次改稿' : '我的初稿';
  clearTimeout(copyFeedbackTimer);
  $('copy').textContent = copyButtonDefaultText();
  $('draft').value = data.drafts[draftKey()] ?? last?.draft ?? '';
  updateCount();
  updateRestore();
  $('review').hidden = !last;
  $('review-original').open = false;
  $('active-notes').replaceChildren(...(last ? renderNotes(last, true) : []));
  $('active-original').replaceChildren(...(last ? [renderOriginal(last)] : []));
  syncAnnotationStates();
  $('history').hidden = !last;
  $('rounds').replaceChildren(...lesson.rounds.map(renderRound).reverse());
}

function openLink() {
  const payload = new URLSearchParams(location.hash.slice(1)).get('lesson');
  if (!payload) return;
  try {
    if (payload.length > limit) throw new Error('练习链接太长，请使用 JSON 文件。');
    if (accept(JSON.parse(payload))) history.replaceState(null, '', location.pathname + location.search);
  } catch (error) {
    status(error instanceof SyntaxError ? '练习链接无法读取，请重新打开老师发给你的链接。' : error.message);
  }
}

try {
  const stored = JSON.parse(localStorage.getItem(key));
  if (stored?.lessons && stored.drafts) data = stored;
} catch {
  status('浏览器未能读取上次的记录。可以重新导入本课文件。');
}

$('lessons').onchange = event => {
  data.active = event.target.value;
  render();
  if (save()) status('');
};
$('load').onclick = () => $('file').click();

function importText(text) {
  try {
    if (text.length > limit) throw new Error('这份练习内容太大。');
    const cleaned = extractJsonText(text);
    return accept(JSON.parse(cleaned));
  } catch (error) {
    status(error instanceof SyntaxError ? '请提供有效的练习 JSON（支持直接复制聊天里的代码块）。' : error.message);
    return false;
  }
}

$('paste-clipboard').onclick = async () => {
  if (!navigator.clipboard?.readText) {
    $('paste-panel').open = true;
    $('payload').focus();
    status('请把老师发来的 JSON 粘贴到下方输入框。');
    return;
  }
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      $('paste-panel').open = true;
      $('payload').focus();
      status('剪贴板是空的，请先复制老师发来的 JSON。');
      return;
    }
    if (!importText(text)) {
      $('paste-panel').open = true;
      $('payload').value = text;
      $('payload').focus();
    } else {
      $('paste-panel').open = false;
    }
  } catch {
    $('paste-panel').open = true;
    $('payload').focus();
    status('浏览器未授予剪贴板读取权限，请在下方粘贴。');
  }
};

$('file').onchange = async () => {
  const file = $('file').files[0];
  if (!file) return;
  try {
    if (file.size > limit) throw new Error('这份练习文件太大。');
    importText(await file.text());
  } catch (error) {
    status(error.message);
  } finally {
    $('file').value = '';
  }
};
$('paste').onsubmit = event => {
  event.preventDefault();
  if (!importText($('payload').value)) return;
  $('payload').value = '';
  $('paste-panel').open = false;
};
$('draft').oninput = () => {
  data.drafts[draftKey()] = $('draft').value;
  if (save()) status('');
  updateCount();
  updateRestore();
  syncAnnotationStates();
};
$('restore').onclick = () => {
  const last = lesson && lesson.rounds.at(-1);
  if (!last) return;
  $('draft').value = last.draft;
  data.drafts[draftKey()] = last.draft;
  if (save()) updateCount();
  updateRestore();
  syncAnnotationStates();
  status('已恢复为本轮原文，按批注继续改。');
};
$('active-notes').addEventListener('click', event => {
  const note = event.target.closest('.annotation');
  if (!note || !note.dataset.quote) return;
  for (const other of $('active-notes').querySelectorAll('.annotation.is-active')) {
    other.classList.remove('is-active');
  }
  note.classList.add('is-active');
  if (!selectQuote(note.dataset.quote)) {
    $('review-original').open = true;
    status('这句已经修改过了，可在下方「对照上一版原文」查看原句。');
    return;
  }
  if (window.innerWidth < 760) {
    $('editor').scrollIntoView({block: 'center', behavior: 'smooth'});
  }
});
$('editor').onsubmit = async event => {
  event.preventDefault();
  const context = '练习：' + lesson.id + '\n' + $('draft-label').textContent + '\n\n';
  try {
    await navigator.clipboard.writeText(context + $('draft').value);
    status('已复制。把草稿粘贴到聊天中，老师就能基于原文批注。');
    $('copy').textContent = '✓ 已复制，去聊天粘贴';
    clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = setTimeout(() => { $('copy').textContent = copyButtonDefaultText(); }, 2200);
  } catch {
    $('draft').focus();
    $('draft').select();
    status('已选中草稿，请手动复制到聊天中。');
  }
};
$('export').onclick = () => {
  const record = {...lesson, pending: $('draft').value};
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], {type:'application/json'}));
  const link = element('a');
  link.href = url;
  link.download = lesson.id + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener('storage', event => {
  if (event.key !== key || !event.newValue) return;
  const stored = JSON.parse(event.newValue);
  if (stored?.lessons && stored.drafts) {
    data = stored;
    render();
  }
});
window.addEventListener('hashchange', openLink);
render();
openLink();
