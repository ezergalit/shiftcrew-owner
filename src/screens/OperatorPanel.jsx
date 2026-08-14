import { useEffect, useState } from "react";
import { Loader2, Copy, Check, RefreshCw, Inbox } from "lucide-react";
import { supabase } from "../lib/supabase";

const db = supabase.schema("menu_app");

// The operator's control board — opened with ?operator=1, not linked from anywhere in
// the owner UI. One row per restaurant with its pending-request count ("סלון יווני +2"),
// and each request turns into a copy-ready message for a Claude Code chat: the operator
// pastes it there, the work happens in the session (no app-side AI credits), and the
// request is marked done — from here or from the session.
//
// Gate is knowledge-of-URL only, same security posture as the rest of menu_app (the
// anon key can already read this table); revisit together with the RLS rework.
export default function OperatorPanel() {
  const [rows, setRows] = useState(null); // [{restaurant, requests: []}]
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [err, setErr] = useState("");

  const load = async () => {
    setBusy(true); setErr("");
    try {
      const [{ data: rests, error: e1 }, { data: reqs, error: e2 }] = await Promise.all([
        db.from("restaurants").select("id, name, owner_code").order("name"),
        db.from("operator_requests").select("*").eq("status", "pending").order("created_at"),
      ]);
      if (e1 || e2) throw new Error((e1 || e2).message);
      const byRest = new Map();
      for (const r of reqs || []) {
        if (!byRest.has(r.restaurant_id)) byRest.set(r.restaurant_id, []);
        byRest.get(r.restaurant_id).push(r);
      }
      const list = (rests || []).map((rest) => ({ rest, requests: byRest.get(rest.id) || [] }));
      // Restaurants with waiting requests first — this is a to-do board, not a directory.
      list.sort((a, b) => b.requests.length - a.requests.length || a.rest.name.localeCompare(b.rest.name, "he"));
      setRows(list);
    } catch (e) { setErr("טעינה נכשלה: " + e.message); }
    finally { setBusy(false); }
  };

  useEffect(() => { load(); }, []);

  // Self-contained message — pasteable into a fresh Claude Code session with zero extra
  // context: which restaurant, which request row, what to do when finished.
  const claudeMessage = (rest, req) =>
    `בקשת מפעיל מהאפליקציה:\n` +
    `מסעדה: ${rest.name} (owner_code: ${rest.owner_code})\n` +
    `בקשה: ${req.request}\n` +
    `נשלחה: ${new Date(req.created_at).toLocaleString("he-IL")}\n` +
    `אחרי הטיפול: update menu_app.operator_requests set status='done', handled_at=now(), operator_note='...' where id='${req.id}';`;

  const copyForClaude = async (rest, req) => {
    try {
      await navigator.clipboard.writeText(claudeMessage(rest, req));
      setCopiedId(req.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { setErr("ההעתקה נכשלה — העתיקו ידנית מהטקסט."); }
  };

  const markDone = async (req) => {
    const { error } = await db.from("operator_requests")
      .update({ status: "done", handled_at: new Date().toISOString() }).eq("id", req.id);
    if (error) { setErr("סימון נכשל: " + error.message); return; }
    load();
  };

  const totalPending = (rows || []).reduce((n, r) => n + r.requests.length, 0);

  return (
    <div className="min-h-screen bg-[#0c0d10] text-[#eef0f6] max-w-md mx-auto flex flex-col" dir="rtl">
      <div className="px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-4 border-b border-[#22252b] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">דף בקרה — מפעיל</h1>
          <p className="text-xs text-[#8a8aa0] mt-0.5">
            {rows === null ? "טוען…" : totalPending === 0 ? "אין בקשות ממתינות 🎉" : `${totalPending} בקשות ממתינות`}
          </p>
        </div>
        <button onClick={load} disabled={busy} className="p-2 rounded-lg bg-[#16181c] border border-[#22252b] text-[#8a8aa0] hover:text-[#a79bff] transition" aria-label="רענון">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {err && <p className="text-xs font-bold text-[#e0315a]">{err}</p>}
        {rows === null && <p className="text-sm text-[#8a8aa0] text-center py-8">טוען את המסעדות…</p>}

        {(rows || []).map(({ rest, requests }) => (
          <div key={rest.id} className={`bg-[#16181c] rounded-2xl border p-4 space-y-3 ${requests.length ? "border-[#6d5efc]/50" : "border-[#22252b]"}`}>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-bold text-[#eef0f6] truncate">{rest.name}</p>
                <p className="text-[10px] text-[#8a8aa0]" dir="ltr">{rest.owner_code}</p>
              </div>
              {requests.length ? (
                <span className="bg-[#6d5efc] text-white text-xs font-black px-2.5 py-1 rounded-full shrink-0">+{requests.length}</span>
              ) : (
                <span className="text-[10px] text-[#5a5a6e] font-bold shrink-0">0 הודעות</span>
              )}
            </div>

            {requests.map((req) => (
              <div key={req.id} className="bg-[#0c0d10] border border-[#22252b] rounded-xl p-3 space-y-2">
                <p className="text-sm text-[#eef0f6] leading-relaxed">{req.request}</p>
                <p className="text-[10px] text-[#8a8aa0]">{new Date(req.created_at).toLocaleString("he-IL")}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyForClaude(rest, req)}
                    className="flex-1 bg-[#6d5efc]/15 border border-[#6d5efc]/50 text-[#a79bff] font-bold py-2 rounded-lg text-xs hover:bg-[#6d5efc]/25 transition flex items-center justify-center gap-1.5"
                  >
                    {copiedId === req.id ? <><Check size={13} /> הועתק — הדביקו בצ'אט</> : <><Copy size={13} /> העתק לקלוד</>}
                  </button>
                  <button
                    onClick={() => markDone(req)}
                    className="bg-[#22252b] text-[#22c08c] font-bold py-2 px-3 rounded-lg text-xs hover:bg-[#2c2e35] transition"
                  >
                    ✓ טופל
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {rows !== null && rows.length === 0 && (
          <div className="text-center py-10 text-[#8a8aa0]">
            <Inbox size={28} className="mx-auto mb-2" />
            <p className="text-sm">אין עדיין מסעדות.</p>
          </div>
        )}
      </div>
    </div>
  );
}
