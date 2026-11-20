(function () {
  'use strict';

  const STORAGE_KEY = 'ielts-writing-practice-v1';
  const PAGE_SIZE = 10;
  const KINDS = {
    scene: '写一句',
    sentence: '写一句',
    mini: '三句短段',
    paragraph: '三句短段',
    body: '正文段',
    'body-paragraph': '正文段'
  };
  const SUPPORT_OPTIONS = new Set(['', '中文要点', '参考示范', '中文要点和参考示范']);
  const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric'
  });
  const list = document.getElementById('practice-list');
  const count = document.getElementById('practice-count');
  let visibleCount = PAGE_SIZE;
  let records = load();

  function cleanDraft(value) {
    if (!value || typeof value !== 'object') return null;
    const {kind, prompt, text, focus = '', support = ''} = value;
    if (![kind, prompt, text, focus].every(field => typeof field === 'string')) return null;
    if (!kind.trim() || !prompt.trim() || !text.trim()
      || kind.length > 60 || prompt.length > 500 || text.length > 20000 || focus.length > 300
      || !SUPPORT_OPTIONS.has(support)) return null;
    return {kind: kind.trim(), prompt: prompt.trim(), text: text.trim(), focus: focus.trim(), support};
  }

  function cleanRecord(value) {
    const draft = cleanDraft(value);
    if (!draft || typeof value.id !== 'string' || !value.id || value.id.length > 120
      || !Number.isSafeInteger(value.at) || value.at <= 0 || value.at > 8640000000000000) return null;
    return {id: value.id, at: value.at, ...draft};
  }

  function merge(first, second) {
    const byId = new Map(first.map(record => [record.id, record]));
    for (const record of second) {
      if (!byId.has(record.id)) byId.set(record.id, record);
    }
    return [...byId.values()].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(raw) ? merge([], raw.map(cleanRecord).filter(Boolean)) : [];
    } catch {
      return [];
    }
  }

  function store(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.WritingCloud.schedule();
    } catch {
      return false;
    }
    records = next;
    render();
    return true;
  }

  function element(tag, content, className) {
    const node = document.createElement(tag);
    node.textContent = content;
    if (className) node.className = className;
    return node;
  }

  function kindLabel(kind) {
    return Object.hasOwn(KINDS, kind) ? KINDS[kind] : '写作练习';
  }

  function recordItem(record) {
    const item = element('details', '', 'review-item');
    const date = dateFormatter.format(record.at);
    const kind = kindLabel(record.kind);
    const heading = element('summary', '');
    heading.append(element('strong', record.prompt), element('span', date, 'sub'));

    const writing = element('p', record.text, 'record-text');
    writing.lang = 'en';
    item.append(heading, element('p', record.support ? kind + ' · 参考了' + record.support : kind, 'sub'), writing);
    if (record.focus) item.append(element('p', '下次留意：' + record.focus, 'sub'));

    const actions = element('div', '', 'actions');
    const copy = element('button', '复制记录', 'quiet');
    copy.type = 'button';
    const status = element('span', '', 'sub');
    status.setAttribute('role', 'status');
    copy.onclick = async () => {
      const lines = [date + ' · ' + kind, record.prompt, record.text];
      if (record.support) lines.push('参考了' + record.support);
      if (record.focus) lines.push('下次留意：' + record.focus);
      try {
        await navigator.clipboard.writeText(lines.join('\n\n'));
        status.textContent = '已复制。';
      } catch {
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(writing);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        status.textContent = '自动复制不可用，可以手动复制正文。';
      }
    };
    actions.append(copy, status);
    item.append(actions);
    return item;
  }

  function render() {
    if (count) count.textContent = records.length ? '（' + records.length + '）' : '';
    if (!list) return;
    if (!records.length) {
      list.replaceChildren(element('p', '保存写完的句子或短段后，可以在这里回看。', 'sub'));
      return;
    }
    const earlierButton = document.activeElement?.id === 'practice-earlier';
    const items = records.slice(0, visibleCount).map(recordItem);
    list.replaceChildren(...items);
    if (items.length < records.length) {
      const earlier = element('button', '显示更早的记录', 'quiet');
      earlier.id = 'practice-earlier';
      earlier.type = 'button';
      earlier.onclick = () => {
        visibleCount += PAGE_SIZE;
        render();
        if (!document.getElementById(earlier.id)) list.querySelector('details:last-child summary')?.focus();
      };
      list.append(earlier);
      if (earlierButton) earlier.focus();
    }
  }

  function save(value) {
    const draft = cleanDraft(value);
    if (!draft) return false;
    const current = merge(load(), records);
    const at = Date.now();
    const duplicate = current.some(record => dateFormatter.format(record.at) === dateFormatter.format(at)
      && record.kind === draft.kind && record.prompt === draft.prompt
      && record.text === draft.text && record.focus === draft.focus && record.support === draft.support);
    if (duplicate) {
      records = current;
      render();
      return true;
    }
    const id = window.crypto?.randomUUID?.() || at + '-' + Math.random().toString(36).slice(2);
    return store(merge(current, [{id, at, ...draft}]));
  }

  function importRecords(values) {
    if (values === undefined) return true;
    if (!Array.isArray(values)) return false;
    const incoming = Array.from(values, cleanRecord);
    if (incoming.some(record => !record)) return false;
    const current = merge(load(), records);
    return store(merge(current, incoming));
  }

  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    records = merge(load(), records);
    render();
  });
  window.WritingRecords = Object.freeze({
    save,
    export: () => merge(load(), records).map(record => ({...record})),
    import: importRecords
  });
  render();
})();
