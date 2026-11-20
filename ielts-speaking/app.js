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
async function library(day) {
  keys = await read('getAllKeys');
  const days = [...new Set(keys.map(k => k[0]))];
  options(el('days'), days.map(n => [n,'Day ' + n]));
  if (!days.length) return;
  const recent = Number(day || localStorage.getItem('speaking-day'));
  if (days.includes(recent)) el('days').value = recent;
  el('lesson').hidden = false;
  await lesson();
}
async function lesson() {
  const day = Number(el('days').value);
  localStorage.setItem('speaking-day', day);
  const names = keys.filter(k => k[0] === day).map(k => k[1]);
  const tracks = names.filter(n => /\.mp3$/i.test(n));
  options(el('tracks'), tracks.map(n => [n,n.replace(/^day\s*\d+\s*/i,'').replace(/[（）()]/g,'').replace(/\.mp3$/i,'')]));
  const normal = tracks.find(n => n.includes('常速跟读'));
  if (normal) el('tracks').value = normal;
  options(el('docs'), names.filter(n => /\.pdf$/i.test(n)).map(n => [n,n.replace(/\.pdf$/i,'')]));
  el('notes').hidden = !el('docs').length;
  await Promise.all([track(), doc()]);
}
async function track() {
  const id = ++trackRequest;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  URL.revokeObjectURL(trackURL);
  if (!el('tracks').value) return;
  const blob = await read('get',[Number(el('days').value),el('tracks').value]);
  if (id === trackRequest) audio.src = trackURL = URL.createObjectURL(blob.slice(0,blob.size,'audio/mpeg'));
}
async function doc() {
  const id = ++docRequest;
  frame.removeAttribute('src');
  el('open').removeAttribute('href');
  URL.revokeObjectURL(pdfURL);
  if (!el('notes').open || !el('docs').value) return;
  const blob = await read('get',[Number(el('days').value),el('docs').value]);
  if (id !== docRequest) return;
  frame.src = el('open').href = pdfURL = URL.createObjectURL(blob.slice(0,blob.size,'application/pdf'));
}
el('pick').onclick = () => el('files').click();
el('folder').onclick = () => el('folders').click();
el('folder').hidden = !('webkitdirectory' in el('folders'));
for (const input of [el('files'),el('folders')]) input.onchange = () => importFiles(input);
el('days').onchange = lesson;
el('tracks').onchange = track;
el('docs').onchange = doc;
el('notes').ontoggle = doc;
el('back').onclick = () => { if (audio.readyState) audio.currentTime = Math.max(0,audio.currentTime-5); };
el('loop').onchange = () => audio.loop = el('loop').checked;
library().catch(() => message('无法读取设备存储，请用普通浏览器窗口打开。'));
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
  try {
    const response = await github('/contents/packs', token);
    const files = await response.json();
    const courses = files.filter(file => /^Day\d+\.zip$/.test(file.name) && /^[a-f0-9]{40}$/.test(file.sha));
    if (!courses.length) throw new Error('仓库里没有找到课程。');
    options(el('remote-days'), courses.map(file => [file.sha, file.name.replace(/^Day(\d+)\.zip$/, 'Day $1')]));
    accessToken = token;
    sessionStorage.setItem(sessionKey, token);
    el('token').value = '';
    el('connect').hidden = true;
    el('remote').hidden = false;
    remoteStatus('已连接。选一课即可播放，打开过的课可离线复习。');
  } catch (error) {
    remoteStatus(error instanceof TypeError ? '连接失败，请检查网络后重试。' : error.message);
  } finally { button.disabled = false; }
};

el('remote').onsubmit = async event => {
  event.preventDefault();
  const button = el('remote-open');
  const selection = el('remote-days').selectedOptions[0];
  const label = selection.textContent;
  const day = Number(label.split(' ')[1]);
  button.disabled = true;
  el('disconnect').disabled = true;
  remoteStatus('正在打开 ' + label + '…');
  try {
    const response = await github('/git/blobs/' + selection.value, accessToken, 'application/vnd.github.raw+json');
    const entries = unpackCourse(new Uint8Array(await response.arrayBuffer()), label + '.zip');
    if (!entries.length) throw new Error('课程包没有可用的音频或讲义。');
    await save(entries);
    await library(day);
    remoteStatus(label + ' 已打开，并已保存在本机课程。');
    el('lesson').scrollIntoView();
  } catch (error) {
    remoteStatus(error instanceof TypeError ? '读取课程失败，请检查网络或设备空间后重试。' : error.message);
  } finally {
    button.disabled = false;
    el('disconnect').disabled = false;
  }
};

el('disconnect').onclick = () => {
  accessToken = '';
  sessionStorage.removeItem(sessionKey);
  el('remote').hidden = true;
  el('connect').hidden = false;
  remoteStatus('已断开 GitHub 连接。');
};

const savedToken = sessionStorage.getItem(sessionKey);
if (savedToken && navigator.onLine) {
  el('token').value = savedToken;
  el('connect').requestSubmit();
}
