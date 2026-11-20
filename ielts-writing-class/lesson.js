'use strict';

const $ = id => document.getElementById(id);
const key = 'ielts-writing-class-v1';
const limit = 3_000_000;
let data = {active: '', lessons: {}, drafts: {}};
let lesson;
const status = message => { $('status').textContent = message; };

function save() {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    status('浏览器暂时无法保存。请保留这一页，或导出本课记录。');
    return false;
  }
}

function string(value, max) {
  return typeof value === 'string' && value.trim() && value.length <= max;
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
  if (existing && (
      existing.prompt !== incoming.prompt || existing.task !== incoming.task ||
      !existing.rounds.slice(0, incoming.rounds.length).every(
        (round, i) => JSON.stringify(round) === JSON.stringify(incoming.rounds[i]))
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
    ? '已打开本课较新的记录。' : incoming.rounds.length ? '已载入批注和下一步任务。' : '已载入练习。');
  return true;
}

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function renderRound(round, index, latest) {
  const item = element('details', '', 'card');
  item.open = latest;
  item.append(element('summary', index === 0 ? '初稿的批注' : '第 ' + index + ' 次改稿的批注'));

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
  item.append(original);
  for (const note of round.notes) {
    const annotation = element('div', '', 'annotation');
    const quote = element('blockquote', note.quote);
    quote.lang = 'en';
    annotation.append(quote, element('p', note.comment));
    item.append(annotation);
  }
  item.append(element('p', '当时的下一步\n' + round.next, 'review-task'));
  return item;
}

function draftKey() {
  return lesson.id + ':' + lesson.rounds.length;
}

function updateCount() {
  const text = $('draft').value;
  $('copy').disabled = !text.trim();
  const words = text.match(/[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*/g) || [];
  $('count').textContent = words.length + ' 词';
}

function render() {
  lesson = data.lessons[data.active];
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
  $('draft').value = data.drafts[draftKey()] ?? last?.draft ?? '';
  updateCount();
  $('history').hidden = !last;
  $('rounds').replaceChildren(...lesson.rounds.map((round, i) =>
    renderRound(round, i, i === lesson.rounds.length - 1)).reverse());
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
$('file').onchange = async () => {
  const file = $('file').files[0];
  if (!file) return;
  try {
    if (file.size > limit) throw new Error('这份练习文件太大。');
    accept(JSON.parse(await file.text()));
  } catch (error) {
    status(error instanceof SyntaxError ? '请选择有效的练习 JSON 文件。' : error.message);
  } finally {
    $('file').value = '';
  }
};
$('draft').oninput = () => {
  data.drafts[draftKey()] = $('draft').value;
  if (save()) status('');
  updateCount();
};
$('editor').onsubmit = async event => {
  event.preventDefault();
  const context = '练习：' + lesson.id + '\n' + $('draft-label').textContent + '\n\n';
  try {
    await navigator.clipboard.writeText(context + $('draft').value);
    status('已复制。把草稿粘贴到聊天中，老师就能基于原文批注。');
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
window.addEventListener('hashchange', openLink);
render();
openLink();
