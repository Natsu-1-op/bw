(function (root) {
  'use strict';

  const DAY = 86400000;
  const SHANGHAI_OFFSET = 8 * 3600000;
  const INTERVALS = [1, 3, 7, 14, 30];
  const dayKey = time => new Date(time + SHANGHAI_OFFSET).toISOString().slice(0, 10);
  const nextDay = time => Date.parse(dayKey(time) + 'T00:00:00+08:00') + DAY;

  function select(catalog, progress, {group = '', limit = 3, now = Date.now()} = {}) {
    const priority = record => record?.history.at(-1)?.rate === 'again' ? 0 : record ? 1 : 2;
    return catalog
      .filter(word => (!group || word.book === group) && (progress[word.id]?.due || 0) <= now)
      .sort((a, b) => priority(progress[a.id]) - priority(progress[b.id])
        || (progress[a.id]?.due || 0) - (progress[b.id]?.due || 0))
      .slice(0, limit);
  }

  function rate(previous, rating, now = Date.now(), mode = 'recall') {
    if (!['good', 'hard', 'again'].includes(rating)) throw new Error('Invalid rating');
    const old = previous || {level: 0, reviews: 0, history: []};
    const today = dayKey(now);
    let level = old.level;
    let due = old.due;
    let lastGoodDay = old.lastGoodDay || '';
    if (rating === 'again') {
      level = 0;
      due = now + 5 * 60000;
    } else if (rating === 'hard') {
      level = Math.max(0, level - 1);
      due = nextDay(now);
    } else if ((due || 0) <= now) {
      if (lastGoodDay !== today) {
        level = Math.min(5, level + 1);
        lastGoodDay = today;
      }
      due = nextDay(now) + (INTERVALS[Math.max(0, level - 1)] - 1) * DAY;
    }
    return {
      level, due, lastGoodDay, reviews: old.reviews + 1,
      history: [...old.history, {at: now, rate: rating, level, mode}].slice(-30)
    };
  }

  function shuffle(words) {
    const shuffled = [...words];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function round(eligible, progress, limit, previous = []) {
    const priority = word => progress[word.id]?.history.at(-1)?.rate === 'again' ? 0 : progress[word.id] ? 2 : 1;
    const pool = shuffle(eligible).sort((a, b) => priority(a) - priority(b));
    const words = shuffle(pool.slice(0, limit));
    if (!Array.isArray(previous) || words.length !== previous.length
      || !words.every((word, index) => word.id === previous[index])) return words;
    if (words.length > 1) words.push(words.shift());
    else if (words.length === 1) {
      const alternative = pool.find(word => word.id !== words[0].id && priority(word) === priority(words[0]));
      if (alternative) return [alternative];
    }
    return words;
  }

  function findMatch(sentence, target, term) {
    if (typeof sentence !== 'string' || !sentence) return null;
    const lower = sentence.toLowerCase();
    for (const candidate of [target, term]) {
      if (typeof candidate !== 'string' || !candidate) continue;
      const idx = lower.indexOf(candidate.toLowerCase());
      if (idx >= 0) return {index: idx, length: candidate.length, text: sentence.slice(idx, idx + candidate.length)};
    }
    return null;
  }

  function buildCloze(word, reviewCount = 0) {
    const candidates = [];
    const primaryMatch = findMatch(word?.sentence, word?.target, word?.term);
    if (primaryMatch && word?.translation) {
      candidates.push({
        zh: word.translation,
        en: word.sentence,
        expected: primaryMatch.text,
        clozeEn: word.sentence.slice(0, primaryMatch.index) + '________' + word.sentence.slice(primaryMatch.index + primaryMatch.length),
      });
    }
    for (const ext of Object.values(word?.extensions || {})) {
      if (typeof ext?.example !== 'string' || typeof ext?.translation !== 'string' || !ext.translation) continue;
      const match = findMatch(ext.example, word?.target, word?.term);
      if (match) {
        candidates.push({
          zh: ext.translation,
          en: ext.example,
          expected: match.text,
          clozeEn: ext.example.slice(0, match.index) + '________' + ext.example.slice(match.index + match.length),
        });
      }
    }
    if (!candidates.length) {
      return {
        zh: word?.meaning || '',
        en: word?.sentence || '',
        clozeEn: '',
        expected: word?.target || word?.term || '',
        meaning: word?.meaning || '',
      };
    }
    const picked = candidates[Math.abs(Number(reviewCount) || 0) % candidates.length];
    return {...picked, meaning: word?.meaning || ''};
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/[’‘`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[.,!?;:]+|[.,!?;:]+$/g, '')
      .toLowerCase();
  }

  function tokenizeWords(normalized) {
    if (!normalized) return [];
    return normalized.split(' ').map(w => w.replace(/^[.,!?;:]+|[.,!?;:]+$/g, '')).filter(Boolean);
  }

  function compareAnswer(input, expected) {
    const inputNorm = normalizeText(input);
    const expectedNorm = normalizeText(expected);
    if (!inputNorm) {
      return {empty: true, exact: false, expected: String(expected || ''), inputNorm: '', diffs: []};
    }
    if (inputNorm === expectedNorm) {
      return {empty: false, exact: true, expected: String(expected || ''), inputNorm, diffs: []};
    }
    const actualWords = tokenizeWords(inputNorm);
    const expectedWords = tokenizeWords(expectedNorm);
    const m = actualWords.length;
    const n = expectedWords.length;
    const dp = Array.from({length: m + 1}, () => Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        dp[i][j] = actualWords[i] === expectedWords[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const diffs = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (actualWords[i] === expectedWords[j]) {
        diffs.push({kind: 'ok', text: expectedWords[j]});
        i++;
        j++;
      } else if (dp[i + 1][j] === dp[i][j + 1] && i + 1 <= m && j + 1 <= n) {
        diffs.push({kind: 'wrong', actual: actualWords[i], expected: expectedWords[j]});
        i++;
        j++;
      } else if (dp[i + 1][j] > dp[i][j + 1]) {
        diffs.push({kind: 'extra', text: actualWords[i]});
        i++;
      } else {
        diffs.push({kind: 'missing', text: expectedWords[j]});
        j++;
      }
    }
    while (i < m) diffs.push({kind: 'extra', text: actualWords[i++]});
    while (j < n) diffs.push({kind: 'missing', text: expectedWords[j++]});
    return {empty: false, exact: false, expected: String(expected || ''), inputNorm, diffs};
  }

  root.WritingStudy = Object.freeze({select, rate, round, dayKey, buildCloze, compareAnswer});
})(typeof window === 'undefined' ? globalThis : window);
