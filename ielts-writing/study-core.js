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

  function gap({sentence, target}) {
    if (!target) return sentence;
    const start = sentence.toLowerCase().indexOf(target.toLowerCase());
    return start < 0 ? sentence : sentence.slice(0, start) + '______' + sentence.slice(start + target.length);
  }

  root.WritingStudy = Object.freeze({select, rate, gap});
})(typeof window === 'undefined' ? globalThis : window);
