'use strict';

const DEFAULT_TZ = 'Asia/Kolkata';

/** Minutes since local midnight in `timeZone` for the given instant. */
function minutesSinceMidnightInZone(date = new Date(), timeZone = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const h = +parts.find((p) => p.type === 'hour').value;
  const m = +parts.find((p) => p.type === 'minute').value;
  return h * 60 + m;
}

/**
 * @param {{ now?: Date, timeZone?: string, openHour?: number }} [opts]
 * @returns {boolean} true from openHour:00 until midnight (India time by default). Closed midnight–before open.
 */
function isRestaurantOpen(opts = {}) {
  const { now = new Date(), timeZone = DEFAULT_TZ, openHour = 11 } = opts;
  const t = minutesSinceMidnightInZone(now, timeZone);
  return t >= openHour * 60 && t < 24 * 60;
}

module.exports = { isRestaurantOpen, minutesSinceMidnightInZone };
