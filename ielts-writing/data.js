(function () {
  'use strict';

  const sync = window.WritingSyncCore;
  const progressKey = 'ielts-writing-progress-v1';
  const catalogKey = 'ielts-writing-catalog-v1';
  let bundled = [], catalog = mergeWords(readLocal(catalogKey, []));
  let progress = sync.merge({}, readLocal(progressKey, {}));
  let localSaved = true, observer;

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

  function mergedCatalog() {
    // Published cards may have revised prompts. Keep explicit deletions and backup-only cards.
    return mergeWords(catalog, bundled, catalog.filter(word => word.deletedAt));
  }

  function emit() {
    observer?.({catalog: mergedCatalog().filter(word => !word.deletedAt), progress, localSaved});
  }

  function saveProgress() {
    progress = sync.merge(readLocal(progressKey, {}), progress);
    localSaved = writeLocal(progressKey, progress);
  }

  async function loadBundled() {
    try {
      const result = await fetch('entries.json', {cache: 'no-cache'});
      if (result.ok) {
        bundled = mergeWords(await result.json());
        const latest = mergedCatalog();
        if (JSON.stringify(latest) !== JSON.stringify(catalog)) {
          catalog = latest;
          writeLocal(catalogKey, catalog);
          window.WritingCloud.schedule();
        }
        emit();
      }
    } catch (_) { /* A previously cached catalog remains available. */ }
  }

  window.WritingData = Object.freeze({
    init(callback) {
      observer = callback;
      emit();
      loadBundled();
      window.addEventListener('online', loadBundled);
      window.addEventListener('storage', event => {
        if (event.key === progressKey) progress = sync.merge(readLocal(progressKey, {}), progress);
        else if (event.key === catalogKey) catalog = mergeWords(readLocal(catalogKey, []));
        else return;
        emit();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') loadBundled();
      });
    },
    saveReview(id, record) {
      progress = sync.merge(progress, {[id]: record});
      saveProgress();
      emit();
      window.WritingCloud.schedule();
      return localSaved;
    },
    exportBackup() {
      return {version: 1, catalog: mergedCatalog(), progress};
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
      window.WritingCloud.schedule();
      return localSaved;
    }
  });
})();
