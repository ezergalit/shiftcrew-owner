// The one definition of "today" in this app.
//
// ⚠️ Why this file exists. Until 2026-08-24 both apps carried TWO date implementations
// side by side: `toISOString().slice(0,10)` (the **UTC** date) and a
// getFullYear/getMonth/getDate builder (the **local** date). Israel is UTC+2/+3, so
// between midnight and 02:00–03:00 local they disagree by a full day.
//
// It matters across the app boundary too: the waiter writes `daily_brief_reads.date` and
// this app reads it back. If one side says UTC and the other says local, a brief read at
// 00:30 lands on a date the manager's board never looks at.
//
// A restaurant day is a LOCAL day. Nothing here should call toISOString() for a calendar
// date again. Keep this file identical in meaning to shiftcrew-waiter/src/lib/appDate.js.

/** Local calendar date of `d` as YYYY-MM-DD. */
export const dateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Today's local calendar date as YYYY-MM-DD. */
export const todayStr = () => dateStr(new Date());

/** Local midnight of `d` — the day-bucket a timestamp belongs to. */
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** First day of `d`'s month, as YYYY-MM-DD. */
export const monthStartStr = (d = new Date()) => dateStr(new Date(d.getFullYear(), d.getMonth(), 1));

/**
 * Start of the week containing `d`, as YYYY-MM-DD.
 * ⚠️ Weeks start on SUNDAY, matching `weekly_scores` and the waiter side. One week
 * boundary for the whole product, or the two halves disagree about "this week".
 */
export const weekStartStr = (d = new Date()) => {
  const s = startOfDay(d);
  s.setDate(s.getDate() - s.getDay()); // getDay() 0 = Sunday
  return dateStr(s);
};

/** `n` days from today (negative for the past), as YYYY-MM-DD. */
export const daysFromTodayStr = (n, d = new Date()) => {
  const s = startOfDay(d);
  s.setDate(s.getDate() + n);
  return dateStr(s);
};
