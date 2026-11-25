(function (root) {
  'use strict';

  const DAY = 86400000;
  const STEP = 3 * 60000;
  const INTERVALS = [1, 3, 7, 14, 30];
  const dayKey = at => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(at));
  const midnightAfter = at => Date.parse(dayKey(at) + 'T00:00:00+08:00') + DAY;
  const base = () => ({
    level: 0, due: 0, reviews: 0, history: [], lastGoodDay: '',
    studyV: 1, phase: 'review', streak: 0, lastFail: 0, lastStep: 0, lapses: 0
  });

  function migrate(record, now = Date.now()) {
    const r = {...base(), ...(record || {})};
    r.history = Array.isArray(r.history) ? r.history : [];
    if (record?.studyV !== 1) {
      r.studyV = 1;
      r.phase = 'review';
      r.streak = 0;
      r.lastFail = 0;
      r.lastStep = 0;
      r.lapses = 0;
      const last = r.history.at(-1);
      if (last && (last.rate === 'again' || last.rate === 'hard')) {
        r.phase = 'learning';
        r.lastFail = last.at;
        r.lastStep = last.at;
        r.lapses = 1;
        r.due = Math.max(r.due || 0, last.at + STEP);
      }
    }
    const lastPractice = r.lastStep || r.lastFail;
    if (r.phase === 'learning' && lastPractice && now >= midnightAfter(lastPractice)) {
      r.level = 0;
      r.streak = 0;
      r.due = midnightAfter(lastPractice);
    }
    if (r.phase === 'review' && r.level > 0 && r.due) {
      r.due = Date.parse(dayKey(r.due) + 'T00:00:00+08:00');
    }
    return r;
  }

  function select(catalog, progress, {group = '', limit = 3, now = Date.now()} = {}) {
    const priority = r => r.phase === 'learning' ? 0 : r.reviews === 0 ? 1 : 2;
    return catalog
      .filter(word => !group || word.book === group)
      .map(word => ({word, rec: migrate(progress[word.id], now)}))
      .filter(({rec}) => (rec.due || 0) <= now)
      .sort((a, b) => priority(a.rec) - priority(b.rec) || (a.rec.due || 0) - (b.rec.due || 0))
      .slice(0, limit)
      .map(({word}) => word);
  }

  function rate(previous, rating, now = Date.now(), mode = 'cloze') {
    if (!['good', 'again'].includes(rating) || !Number.isFinite(now)) throw new Error('Invalid rating');
    const r = migrate(previous, now);
    const today = dayKey(now);
    const oldDue = r.due || 0;
    let message = '';
    if (rating === 'again') {
      r.level = 0;
      r.phase = 'learning';
      r.streak = 0;
      r.lastFail = now;
      r.lastStep = now;
      r.lapses = (r.lapses || 0) + 1;
      r.due = now + STEP;
      message = '3分钟后开始巩固，连续认识3次。';
    } else if (r.phase === 'learning') {
      if (now < oldDue) {
        message = '还没到本次巩固时间；这次不计入次数。';
      } else {
        r.streak++;
        r.lastStep = now;
        if (r.streak >= 3) {
          r.phase = 'review';
          r.streak = 0;
          r.level = 1;
          r.lastGoodDay = today;
          r.due = midnightAfter(now);
          message = '今天已完成3次巩固，明天复习。';
        } else {
          r.due = now + STEP;
          message = '已完成 ' + r.streak + '/3 次巩固，3分钟后继续。';
        }
      }
    } else if (r.reviews === 0 || oldDue === 0 || now >= oldDue) {
      if (r.lastGoodDay === today && r.reviews > 0) {
        message = '今天已完成这一阶段；下次按计划复习。';
      } else {
        r.level = Math.min(5, r.level + 1);
        r.lastGoodDay = today;
        r.due = midnightAfter(now) + (INTERVALS[r.level - 1] - 1) * DAY;
        message = '已认识，' + INTERVALS[r.level - 1] + '天后复习。';
      }
    } else {
      message = '尚未到复习时间，本次不提前升级。';
    }
    r.reviews++;
    r.history = [...r.history, {at: now, rate: rating, level: r.level, mode}].slice(-30);
    return {record: r, message};
  }

  function shuffle(words) {
    const shuffled = [...words];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function round(eligible, progress, limit, previous = [], now = Date.now()) {
    const priority = word => {
      const r = migrate(progress[word.id], now);
      return r.phase === 'learning' ? 0 : r.reviews === 0 ? 1 : 2;
    };
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

  root.WritingStudy = Object.freeze({DAY, STEP, dayKey, midnightAfter, migrate, select, rate, round, buildCloze});
})(typeof window === 'undefined' ? globalThis : window);
