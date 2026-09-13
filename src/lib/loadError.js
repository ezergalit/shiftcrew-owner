// Makes a failed read VISIBLE instead of silently empty.
//
// ⚠️ The bug this exists to kill. Across both apps ~30 queries were written as
// `const { data } = await db.from(...)` — the error was destructured away. When such a
// read failed, `data` came back undefined, state was set to [], and the screen rendered
// an empty list. An empty list from a broken query looks EXACTLY like an empty list from
// a restaurant with no data. That is how the owner's team tab sat blank for every
// restaurant without anyone noticing, and the same shape hid a blank waiter menu.
//
// An expired app-session has the same signature: RLS resolves the token to nothing and
// returns [] with no error at all. So "empty" alone can never be trusted — the UI has to
// be told when a read actually failed.
//
// Every guarded query calls reportLoadError(). Screens subscribe to hear about it.

const listeners = new Set();

/** Subscribe to load failures. Returns an unsubscribe function. */
export function onLoadError(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Called by every guarded query when its read failed.
 * Always logs; notifies any subscribed screen so it can show a real message.
 */
export function reportLoadError(source, error) {
  if (!error) return;
  // Kept as console.error on purpose: without it a failure leaves no trace at all, and
  // there is no crash reporting in these apps yet.
  console.error(`[load:${source}]`, error.message || error, error.code || "", error.hint || "");
  for (const fn of listeners) {
    try { fn(source, error); } catch { /* a broken listener must not break the read */ }
  }
}

/** True when the browser knows it is offline — the most common cause of a failed read. */
export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
