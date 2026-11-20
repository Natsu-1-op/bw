'use strict';
const el = id => document.getElementById(id);
const audio = document.querySelector('audio');
const frame = document.querySelector('iframe');
const message = value => { el('msg').textContent = value; };
const db = new Promise((resolve, reject) => {
  const req = indexedDB.open('ielts-speaking-library', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('files');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
let keys = [], trackURL, pdfURL, trackRequest = 0, docRequest = 0;
let onlineCourses = new Map();
let activeDay = 0;
let opening = false;
const courseStatus = value => { el('course-status').textContent = value; };
async function read(method, ...args) {
  const database = await db;
  return new Promise((resolve, reject) => {
    const req = database.transaction('files').objectStore('files')[method](...args);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function save(entries) {
  const database = await db;
  return new Promise((resolve, reject) => {
    const tx = database.transaction('files', 'readwrite');
    for (const {day, file} of entries) tx.objectStore('files').put(file, [day, file.name]);
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
  });
}
function options(select, items) {
  select.replaceChildren(...items.map(([value, label]) => new Option(label, value)));
}
function entry(file, path) {
  if (!/\.(mp3|pdf)$/i.test(file.name) || file.name.startsWith('.')) return;
  const match = file.name.match(/^day\s*(\d+)/i) || path.match(/(?:^|\/)day\s*(\d+)(?:\/|\.)/i);
  if (match) return {day:Number(match[1]), file};
}
function unpackCourse(bytes, filename) {
  const contents = fflate.unzipSync(bytes, {
    filter: item => /\.(pdf|mp3)$/i.test(item.name) && !item.name.includes('__MACOSX/')
  });
  return Object.entries(contents).map(([path, contents]) => {
    const name = path.split('/').pop();
    const type = /\.pdf$/i.test(name) ? 'application/pdf' : 'audio/mpeg';
    return entry(new File([contents], name, {type}), path + '/' + filename);
  }).filter(Boolean);
}
async function importFiles(input) {
  let count = 0, first;
  const buttons = [el('pick'), el('folder')];
  buttons.forEach(b => b.disabled = true);
  try {
    for (const file of input.files) {
      message('正在导入 ' + file.name);
      let entries;
      if (/\.zip$/i.test(file.name)) {
        entries = unpackCourse(new Uint8Array(await file.arrayBuffer()), file.name);
      } else entries = [entry(file, file.webkitRelativePath || file.name)].filter(Boolean);
      if (entries.length) {
        await save(entries);
        count += entries.length;
        first ??= entries[0].day;
      }
    }
    message(count ? '已保存 ' + count + ' 个文件。' : '没有找到带 Day 编号的 MP3 或 PDF。');
  } catch (e) { message('导入中断，已保存 ' + count + ' 个文件。请检查课程包和设备空间后重试。'); }
  finally {
    input.value = '';
    buttons.forEach(b => b.disabled = false);
    await library(first);
  }
}
function hasLocalCourse(day) {
  return keys.some(key => key[0] === day);
}

function showCourses() {
  const localDays = new Set(keys.map(key => key[0]));
  const days = [...new Set([...localDays, ...onlineCourses.keys()])].sort((a, b) => a - b);
  const select = el('days');
  options(select, [
    ['', days.length ? '选择课程' : '暂无课程'],
    ...days.map(day => [day, 'Day ' + day + (localDays.has(day) ? ' · 已保存' : '')])
  ]);
  select.value = activeDay || '';
  select.disabled = opening || !days.length;
  if (!days.length) courseStatus('在下方课程管理连接 GitHub 或导入课程。');
  else if (!opening) courseStatus('');
}

async function library(day) {
  keys = await read('getAllKeys');
  const recent = Number(day || localStorage.getItem('speaking-day'));
  activeDay = hasLocalCourse(recent) ? recent : keys[0]?.[0] || 0;
  showCourses();
  if (activeDay) await lesson();
}

async function lesson() {
  localStorage.setItem('speaking-day', activeDay);
  const names = keys.filter(key => key[0] === activeDay).map(key => key[1]);
  const tracks = names.filter(name => /\.mp3$/i.test(name));
  options(el('tracks'), tracks.map(name => [name, name.replace(/^day\s*\d+\s*/i, '').replace(/[（）()]/g, '').replace(/\.mp3$/i, '')]));
  const normal = tracks.find(name => name.includes('常速跟读'));
  if (normal) el('tracks').value = normal;
  el('track-field').hidden = !tracks.length;
  el('playback').hidden = !tracks.length;

  const documents = names.filter(name => /\.pdf$/i.test(name));
  options(el('docs'), documents.map(name => [name, name.includes('打印版') ? '打印版' : '讲义']));
  el('notes').hidden = !documents.length;
  el('doc-field').hidden = documents.length < 2;
  el('lesson').hidden = false;
  await Promise.all([track(), doc()]);
}
async function track() {
  const id = ++trackRequest;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  URL.revokeObjectURL(trackURL);
  if (!el('tracks').value) return;
  const blob = await read('get',[activeDay,el('tracks').value]);
  if (id === trackRequest) audio.src = trackURL = URL.createObjectURL(blob.slice(0,blob.size,'audio/mpeg'));
}
async function doc() {
  const id = ++docRequest;
  frame.removeAttribute('src');
  frame.hidden = true;
  el('open').hidden = true;
  el('open').removeAttribute('href');
  URL.revokeObjectURL(pdfURL);
  if (!el('notes').open || !el('docs').value) return;
  const blob = await read('get',[activeDay,el('docs').value]);
  if (id !== docRequest) return;
  frame.src = el('open').href = pdfURL = URL.createObjectURL(blob.slice(0,blob.size,'application/pdf'));
  frame.hidden = el('open').hidden = false;
}
el('pick').onclick = () => el('files').click();
el('folder').onclick = () => el('folders').click();
el('folder').hidden = !('webkitdirectory' in el('folders'));
for (const input of [el('files'),el('folders')]) input.onchange = () => importFiles(input);
el('tracks').onchange = track;
el('docs').onchange = doc;
el('notes').ontoggle = doc;
el('back').onclick = () => { if (audio.readyState) audio.currentTime = Math.max(0,audio.currentTime-5); };
el('loop').onchange = () => audio.loop = el('loop').checked;
library().catch(() => courseStatus('无法读取设备存储，请用普通浏览器窗口打开。'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

const repositoryAPI = 'https://api.github.com/repos/Natsu-1-op/ielts-speaking-materials';
const sessionKey = 'ielts-speaking-read-token';
let accessToken = '';
const remoteStatus = text => { el('remote-status').textContent = text; };

async function github(path, token, accept = 'application/vnd.github+json') {
  const response = await fetch(repositoryAPI + path, {
    headers: {Authorization: 'Bearer ' + token, Accept: accept},
    cache: 'no-store',
    redirect: 'error'
  });
  if ([401, 403, 404].includes(response.status)) {
    throw new Error('GitHub 无法读取课程。请检查令牌有效期，以及仓库的 Contents 只读权限。');
  }
  if (!response.ok) throw new Error('GitHub 读取失败，请稍后再试。');
  return response;
}

el('connect').onsubmit = async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  const token = el('token').value.trim();
  if (!token.startsWith('github_pat_')) {
    remoteStatus('请输入 GitHub 的细粒度访问令牌。');
    button.disabled = false;
    return;
  }
  remoteStatus('正在读取课程目录…');
  if (!activeDay) courseStatus('正在读取 GitHub 课程…');
  try {
    const response = await github('/contents/packs', token);
    const files = await response.json();
    const courses = files.filter(file => /^Day\d+\.zip$/.test(file.name) && /^[a-f0-9]{40}$/.test(file.sha));
    if (!courses.length) throw new Error('仓库里没有找到课程。');
    onlineCourses = new Map(courses.map(file => [Number(file.name.match(/\d+/)[0]), file.sha]));
    accessToken = token;
    sessionStorage.setItem(sessionKey, token);
    el('token').value = '';
    el('connect').hidden = true;
    el('connected').hidden = false;
    el('management').open = false;
    remoteStatus('');
    showCourses();
  } catch (error) {
    remoteStatus(error instanceof TypeError ? '连接失败，请检查网络后重试。' : error.message);
    if (!activeDay) courseStatus('请在课程管理检查 GitHub 连接。');
  } finally { button.disabled = false; }
};

el('days').onchange = async event => {
  const day = Number(event.target.value);
  if (!day) {
    event.target.value = activeDay || '';
    return;
  }
  if (hasLocalCourse(day)) {
    activeDay = day;
    await lesson();
    courseStatus('');
    return;
  }

  opening = true;
  event.target.disabled = true;
  el('disconnect').disabled = true;
  audio.pause();
  courseStatus('正在打开 Day ' + day + '…');
  try {
    const response = await github('/git/blobs/' + onlineCourses.get(day), accessToken, 'application/vnd.github.raw+json');
    const entries = unpackCourse(new Uint8Array(await response.arrayBuffer()), 'Day ' + day + '.zip');
    if (!entries.length) throw new Error('课程包没有可用的音频或讲义。');
    await save(entries);
    await library(day);
    courseStatus('');
  } catch (error) {
    event.target.value = activeDay || '';
    courseStatus(error instanceof TypeError ? '读取课程失败，请检查网络或设备空间后重试。' : error.message);
  } finally {
    opening = false;
    event.target.disabled = false;
    el('disconnect').disabled = false;
  }
};

el('disconnect').onclick = () => {
  accessToken = '';
  onlineCourses.clear();
  sessionStorage.removeItem(sessionKey);
  el('connected').hidden = true;
  el('connect').hidden = false;
  remoteStatus('');
  showCourses();
};

const savedToken = sessionStorage.getItem(sessionKey);
if (savedToken && navigator.onLine) {
  el('token').value = savedToken;
  el('connect').requestSubmit();
}
