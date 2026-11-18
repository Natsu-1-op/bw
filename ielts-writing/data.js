(function () {
  'use strict';

  const sync = window.WritingSyncCore;
  const progressKey = 'ielts-writing-progress-v1';
  const catalogKey = 'ielts-writing-catalog-v1';
  const database = 'https://class-optic-default-rtdb.asia-southeast1.firebasedatabase.app/ieltsWriting';
  const progressPath = 'v2/progress';
  let bundled = [], catalog = readLocal(catalogKey, []);
  let progress = sync.merge({}, readLocal(progressKey, {}));
  let localSaved = true, observer, running = false, pending = false, timer;
  let status = '正在连接云端';

  function readLocal(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch (_) { return fallback; }
  }

  function writeLocal(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (_) { return false; }
  }

  function validWord(word) {
    return word && typeof word.id === 'string' && word.id.length <= 300
      && ['book', 'term', 'meaning', 'sentence', 'target'].every(key => typeof word[key] === 'string' && word[key])
      && word.sentence.toLowerCase().includes(word.target.toLowerCase());
  }

  function mergeWords(...lists) {
    const byId = new Map();
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const word of list) if (validWord(word)) byId.set(word.id, word);
    }
    return [...byId.values()];
  }

  function activeCatalog() {
    return mergeWords(bundled, catalog).filter(word => !word.deletedAt);
  }

  function emit() {
    observer?.({catalog: activeCatalog(), progress, status, localSaved});
  }

  function saveProgress() {
    progress = sync.merge(readLocal(progressKey, {}), progress);
    localSaved = writeLocal(progressKey, progress);
  }

  function setStatus(value) {
    status = value;
    emit();
  }

  async function loadBundled() {
    try {
      const result = await fetch('entries.json');
      if (result.ok) {
        bundled = mergeWords(await result.json());
        emit();
      }
    } catch (_) { /* A previously cached catalog remains available. */ }
  }

  async function request(path, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${database}/${path}.json`, {
        cache: 'no-store', ...options, signal: controller.signal
      });
      if (response.status === 401 || response.status === 403) {
        const error = new Error('Cloud permission denied');
        error.denied = true;
        throw error;
      }
      if (!response.ok && response.status !== 412) throw new Error('Cloud request failed');
      return {etag: response.headers.get('ETag'), status: response.status, value: await response.json()};
    } finally { clearTimeout(timeout); }
  }

  async function mergeCard(id, incoming) {
    const key = sync.encode(id);
    const path = `${progressPath}/${key}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await request(path, {headers: {'X-Firebase-ETag': 'true'}});
      const server = sync.clean(current.value);
      const winner = sync.merge({[id]: server}, {[id]: incoming})[id];
      if (JSON.stringify(winner) === JSON.stringify(server)) return winner;
      if (!current.etag) throw new Error('Cloud version unavailable');
      const result = await request(path, {
        method: 'PUT',
        headers: {'If-Match': current.etag, 'Content-Type': 'application/json'},
        body: JSON.stringify(winner)
      });
      if (result.status !== 412) return winner;
    }
    throw new Error('Concurrent cloud updates');
  }

  async function connect() {
    if (running) { pending = true; return; }
    if (!navigator.onLine) { setStatus('离线 · 本机练习'); return; }
    running = true;
    pending = false;
    setStatus('正在同步');
    try {
      const [words, records] = await Promise.allSettled([
        request('catalog/entries'), request(progressPath)
      ]);
      if (words.status === 'fulfilled') {
        const source = Object.values(words.value.value || {});
        catalog = mergeWords(catalog, source);
        writeLocal(catalogKey, catalog);
      }
      if (records.status === 'rejected') throw records.reason;
      const remote = sync.unpack(records.value.value);
      progress = sync.merge(remote, progress);
      saveProgress();
      for (const [id, record] of Object.entries(progress)) {
        if (JSON.stringify(record) === JSON.stringify(remote[id])) continue;
        const winner = await mergeCard(id, record);
        progress = sync.merge({[id]: winner}, progress);
        saveProgress();
      }
      setStatus(words.status === 'fulfilled' ? '进度已同步' : '进度已同步 · 使用本机词库');
    } catch (error) {
      setStatus(error.denied ? '本机模式 · 云端未开通' : '本机模式 · 暂未同步');
    } finally {
      running = false;
      if (pending) schedule();
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(connect, 500);
  }

  window.WritingData = Object.freeze({
    init(callback) {
      observer = callback;
      emit();
      loadBundled();
      connect();
      window.addEventListener('online', connect);
      window.addEventListener('offline', () => setStatus('离线 · 本机练习'));
      window.addEventListener('storage', event => {
        if (event.key !== progressKey) return;
        progress = sync.merge(readLocal(progressKey, {}), progress);
        emit();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') schedule();
      });
      navigator.serviceWorker?.register('./sw.js').catch(() => {});
    },
    saveReview(id, record) {
      progress = sync.merge(progress, {[id]: record});
      saveProgress();
      emit();
      schedule();
      return localSaved;
    },
    exportBackup() {
      return {version: 1, catalog: mergeWords(bundled, catalog), progress};
    },
    importBackup(backup) {
      if (!backup || (backup.version !== undefined && backup.version !== 1)
        || !Array.isArray(backup.catalog) || !backup.progress
        || typeof backup.progress !== 'object' || Array.isArray(backup.progress)) {
        throw new Error('Invalid backup');
      }
      catalog = mergeWords(backup.catalog, catalog);
      progress = sync.merge(progress, backup.progress);
      saveProgress();
      localSaved = writeLocal(catalogKey, catalog) && localSaved;
      emit();
      schedule();
      return localSaved;
    },
    retry: connect
  });
})();
