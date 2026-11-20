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
async function importFiles(input) {
  let count = 0, first;
  const buttons = [el('pick'), el('folder')];
  buttons.forEach(b => b.disabled = true);
  try {
    for (const file of input.files) {
      message('正在导入 ' + file.name);
      let entries;
      if (/\.zip$/i.test(file.name)) {
        const contents = fflate.unzipSync(new Uint8Array(await file.arrayBuffer()), {
          filter: f => /\.(pdf|mp3)$/i.test(f.name) && !f.name.includes('__MACOSX/')
        });
        entries = Object.entries(contents).map(([path, bytes]) => {
          const name = path.split('/').pop();
          return entry(new File([bytes], name, {type:/\.pdf$/i.test(name)?'application/pdf':'audio/mpeg'}), path + '/' + file.name);
        }).filter(Boolean);
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
