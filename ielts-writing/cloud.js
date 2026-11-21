(function () {
  'use strict';

  const keyPrefix = 'ielts-writing-';
  const keys = {
    progress: keyPrefix + 'progress-v1',
    catalog: keyPrefix + 'catalog-v1',
    drafts: keyPrefix + 'drafts-v1',
    supports: keyPrefix + 'support-v1',
    records: keyPrefix + 'practice-v1',
    classroom: keyPrefix + 'class-v1',
    settings: keyPrefix + 'settings-v1',
    paragraph: keyPrefix + 'paragraph-v1',
    paragraphMode: keyPrefix + 'paragraph-mode-v1'
  };
  const baseKey = keyPrefix + 'cloud-base-v1';
  const config = window.WRITING_FIREBASE_CONFIG;
  const endpoint = config.databaseURL + '/ieltsWriting/snapshot.json';
  const sync = window.WritingSyncCore;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  const get = key => {
    try { return JSON.parse(localStorage.getItem(key)) ?? undefined; }
    catch { return undefined; }
  };
  const readLocal = () => Object.fromEntries(Object.entries(keys).flatMap(([field, key]) => {
    const value = get(key);
    return value === undefined ? [] : [[field, value]];
  }));

  function reconcile(base, local, remote) {
    const copies = {...remote.copies};
    function merge(before, here, there, path) {
      if (same(here, before)) return there;
      if (same(there, before) || same(here, there)) return here;
      if (path === 'progress') return sync.merge(there, here);
      if (path === 'records' || path === 'catalog') {
        return [...new Map([...(there || []), ...(here || [])].map(item => [item.id, item])).values()];
      }
      if (plain(here) && plain(there) && !path.startsWith('classroom/lessons/')) {
        const fields = new Set([...Object.keys(there), ...Object.keys(here)]);
        return Object.fromEntries([...fields].flatMap(key => {
          const value = merge(before?.[key], here[key], there[key], path + '/' + key);
          return value === undefined ? [] : [[key, value]];
        }));
      }
      if (path.startsWith('classroom/lessons/') && !here?.rounds && there?.rounds) return there;
      if (/^(drafts\/|classroom\/(drafts|lessons)\/)/.test(path)) {
        const preferRemote = path.startsWith('classroom/lessons/') && (there?.rounds?.length || 0) > (here?.rounds?.length || 0);
        const selected = preferRemote ? there : here;
        const alternate = preferRemote ? here : there;
        if (alternate !== undefined && !Object.values(copies).some(copy => copy.path === path && same(copy.value, alternate))) {
          copies[crypto.randomUUID()] = {path, value: alternate, at: Date.now()};
        }
        return selected;
      }
      return here;
    }
    const result = {};
    for (const field of Object.keys(keys)) {
      const value = merge(base[field], local[field], remote[field], field);
      if (value !== undefined) result[field] = value;
    }
    if (Object.keys(copies).length) result.copies = copies;
    return result;
  }

  let baseline = get(baseKey) || {};
  let running = false;
  let applying = false;
  let timer;
  const panel = document.getElementById('cloud-panel');
  const state = panel.querySelector('output');
  const button = panel.querySelector('[data-sync]');
  const exportCopy = panel.querySelector('[data-conflicts]');
  const show = message => { state.textContent = message; };

  function apply(snapshot) {
    applying = true;
    try {
      for (const [field, key] of Object.entries(keys)) {
        const old = localStorage.getItem(key);
        const value = snapshot[field] === undefined ? null : JSON.stringify(snapshot[field]);
        if (old === value) continue;
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
        window.dispatchEvent(new StorageEvent('storage', {key, oldValue:old, newValue:value}));
      }
    } finally { applying = false; }
  }

  async function api(options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    let response;
    try {
      response = await fetch(endpoint, {
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
        ...options
      });
    } finally { clearTimeout(timeout); }
    if ([401, 403].includes(response.status)) {
      throw new Error('Firebase 拒绝了同步。请稍后重试。');
    }
    if (!response.ok && response.status !== 412) {
      throw new Error('Firebase 暂时无法同步，请稍后重试。');
    }
    return response;
  }

  async function exchange() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await api({headers: {'X-Firebase-ETag': 'true'}});
      const value = await result.json();
      const remote = value === null ? {version: 1, data: {}} : JSON.parse(value);
      if (remote.version !== 1 || !plain(remote.data)) throw new Error('无法读取云端写作档案。');
      const snapshot = readLocal();
      const next = reconcile(baseline, snapshot, remote.data);
      if (!same(remote.data, next)) {
        const version = result.headers.get('ETag');
        if (!version) throw new Error('无法核对云端版本，请稍后重试。');
        const saved = await api({
          method: 'PUT',
          headers: {'Content-Type': 'application/json', 'If-Match': version},
          body: JSON.stringify(JSON.stringify({version: 1, data: next}))
        });
        if (saved.status === 412) continue;
      }
      const incoming = reconcile(snapshot, readLocal(), next);
      apply(incoming);
      baseline = next;
      localStorage.setItem(baseKey, JSON.stringify(next));
      exportCopy.hidden = !Object.keys(next.copies || {}).length;
      if (!same(incoming, next)) schedule();
      return;
    }
    throw new Error('另一台设备正在同步。请稍后重试。');
  }

  async function run() {
    if (running) return;
    if (!navigator.onLine) { show('离线 · 写作保存在本机'); return; }
    running = true;
    button.disabled = true;
    show('正在同步写作…');
    try {
      await exchange();
      show('写作已同步 · ' + new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'}));
    } catch (error) {
      show(error instanceof TypeError || error.name === 'AbortError' ? '网络不可用 · 写作保存在本机' : error.message);
      panel.open = true;
    } finally {
      running = false;
      button.disabled = false;
    }
  }

  function schedule() {
    if (applying) return;
    clearTimeout(timer);
    timer = setTimeout(() => running ? schedule() : run(), 4000);
  }

  button.onclick = run;
  exportCopy.onclick = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(baseline.copies, null, 2)], {type:'application/json'}));
    link.download = '写作冲突副本.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  window.addEventListener('storage', event => {
    if (Object.values(keys).includes(event.key)) schedule();
    if (event.key === baseKey) baseline = get(baseKey) || {};
  });
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
  setInterval(() => { if (document.visibilityState === 'visible') run(); }, 60000);
  exportCopy.hidden = !Object.keys(baseline.copies || {}).length;
  window.WritingCloud = Object.freeze({schedule, run});
  run();
})();
