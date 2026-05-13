'use strict';

/** Emoji accent for menu category titles (WhatsApp text + admin HTML). */
function menuCategoryEmoji(catTitle) {
  const t = String(catTitle).toLowerCase();
  if (t.includes('thali')) return '🍽️';
  if (t.includes('momo')) return '🥟';
  if (t.includes('bread')) return '🫓';
  if (t.includes('rice') && !t.includes('noodle')) return '🍚';
  if (t.includes('snack')) return '🍴';
  if (t.includes('indian main')) return '🍛';
  if (t.includes('salad') || t.includes('raita')) return '🥬';
  if (t.includes('south indian')) return '🥘';
  if (t.includes('noodle')) return '🍜';
  if (t.includes('chinese main')) return '🍲';
  if (t === 'chinese' || (t.includes('chinese') && !t.includes('main'))) return '🥡';
  if (t.includes('tandoor')) return '🔥';
  if (t.includes('pasta') || t.includes('pizza')) return '🍕';
  if (t.includes('soup') || t.includes('shorba')) return '🥣';
  return '✨';
}

module.exports = { menuCategoryEmoji };
