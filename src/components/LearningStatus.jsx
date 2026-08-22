import { useEffect, useMemo, useState } from "react";
import { Clock, AlertCircle, Eye, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { MemberRow } from "./MemberSheet";

const db = supabase.schema("menu_app");

// "סטטוס למידה" — the owner's daily read on the team. It answers, in order:
//   1. who studied today, and how much
//   2. who still needs to
//   3. who merely opened the app without learning anything
//
// That third group is the one a progress-only view hides: a waiter who logs in every day
// and learns nothing looks exactly like one who never showed up. `team_members.last_seen_at`
// records presence; `progress_snapshots` records actual study, and the gap between them is
// the signal.
//
// Read-only and mounted on its own tab, so nothing here can disturb the menu editor.

const DAY_MS = 86400000;
const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const isSameDay = (a, b) => a && startOfDay(new Date(a)).getTime() === startOfDay(b).getTime();

const fmtMins = (secs) => {
  if (!secs) return "0 דק׳";
  const m = Math.round(secs / 60);
  return m >= 60 ? `${(m / 60).toFixed(1)} ש׳` : `${m} דק׳`;
};

const pctColor = (p) => (p >= 75 ? "#22c08c" : p >= 45 ? "#f3c14b" : "#e0315a");

export default function LearningStatus({ restaurant, onSelectMember, onRows, onMessage, messagedToday }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!restaurant?.id) return;
      const since = new Date(Date.now() - 7 * DAY_MS).toISOString();
      const [members, menu, snaps, board] = await Promise.all([
        db.from("team_members")
          .select("id, name, first_name, last_name, total_seconds, baseline_pct, last_seen_at, created_at")
          .eq("restaurant_id", restaurant.id),
        db.from("published_menu").select("source_item_id").eq("restaurant_id", restaurant.id),
        db.from("progress_snapshots").select("team_member_id, taken_at, seconds_delta, points")
          .eq("restaurant_id", restaurant.id).gte("taken_at", since),
        db.from("leaderboard").select("team_member_id, points, streak").eq("restaurant_id", restaurant.id),
      ]);
      if (!alive) return;

      const ids = (members.data || []).map((m) => m.id);
      // Percentage from menu_progress, the same sum/(n*5) formula the waiter app and the
      // team tab use. Kept consistent on purpose — two screens disagreeing about the same
      // waiter's score is worse than either number being slightly off.
      const { data: progress } = ids.length
        ? await db.from("menu_progress").select("team_member_id, mastery, source_item_id").in("team_member_id", ids)
        : { data: [] };
      if (!alive) return;

      const total = (menu.data || []).length;
      const today = startOfDay();
      const byMember = new Map();
      for (const p of progress || []) {
        const e = byMember.get(p.team_member_id) || { sum: 0, mastered: 0, weak: 0 };
        e.sum += p.mastery || 0;
        if ((p.mastery || 0) >= 4) e.mastered++;
        else if ((p.mastery || 0) > 0) e.weak++;
        byMember.set(p.team_member_id, e);
      }
      const snapsBy = new Map();
      for (const s of snaps.data || []) {
        const arr = snapsBy.get(s.team_member_id) || [];
        arr.push(s);
        snapsBy.set(s.team_member_id, arr);
      }
      const lb = new Map((board.data || []).map((b) => [b.team_member_id, b]));

      const out = (members.data || []).map((m) => {
        const p = byMember.get(m.id) || { sum: 0, mastered: 0, weak: 0 };
        const mine = snapsBy.get(m.id) || [];
        const todaySnaps = mine.filter((s) => isSameDay(s.taken_at, today));
        const week = [...Array(7)].map((_, i) => {
          const day = startOfDay(new Date(Date.now() - (6 - i) * DAY_MS));
          return mine
            .filter((s) => isSameDay(s.taken_at, day))
            .reduce((a, s) => a + Math.round((s.seconds_delta || 0) / 60), 0);
        });
        return {
          id: m.id,
          name: m.name || `${m.first_name || ""} ${m.last_name || ""}`.trim(),
          pct: total ? (p.sum / (total * 5)) * 100 : 0,
          mastered: p.mastered,
          untouched: Math.max(0, total - p.mastered - p.weak),
          baseline: m.baseline_pct,
          totalSeconds: m.total_seconds || 0,
          streak: lb.get(m.id)?.streak || 0,
          points: lb.get(m.id)?.points || 0,
          studiedTodaySeconds: todaySnaps.reduce((a, s) => a + (s.seconds_delta || 0), 0),
          studiedToday: todaySnaps.length > 0,
          seenToday: isSameDay(m.last_seen_at, today),
          lastSeen: m.last_seen_at,
          week,
          weekMinutes: week.reduce((a, b) => a + b, 0),
        };
      });
      setRows(out);
      // Today's minutes and the weekly bars are computed only here. Handing them up lets
      // the detail sheet look the same whichever home list the owner tapped from — two
      // versions of one person's sheet would just make the owner wonder which is right.
      onRows?.(out);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id]);

  const groups = useMemo(() => {
    const list = rows || [];
    return {
      studied: list.filter((r) => r.studiedToday).sort((a, b) => b.studiedTodaySeconds - a.studiedTodaySeconds),
      // Opened the app today but produced no study time — the group worth a nudge.
      seenOnly: list.filter((r) => !r.studiedToday && r.seenToday),
      absent: list.filter((r) => !r.studiedToday && !r.seenToday).sort((a, b) => a.pct - b.pct),
    };
  }, [rows]);

  if (rows === null) return <p className="text-xs text-[#8a8aa0] py-8 text-center">טוען סטטוס למידה…</p>;
  if (!rows.length)
    return (
      <div className="bg-[#16181c] border border-[#22252b] rounded-xl p-6 text-center">
        <p className="text-sm font-black text-[#eef0f6] mb-1">אין עדיין חברי צוות</p>
        <p className="text-xs text-[#8a8aa0]">שתפו את קוד הצוות כדי שיתחילו ללמוד</p>
      </div>
    );

  const teamMinutesToday = Math.round(groups.studied.reduce((a, r) => a + r.studiedTodaySeconds, 0) / 60);
  const avgPct = rows.reduce((a, r) => a + r.pct, 0) / rows.length;

  // One line per person. The chart, the wrong dishes and the exam chips that used to sit
  // in every card moved into MemberSheet, one tap away — at fifty waiters a card each is
  // a wall nobody reads (user, 2026-08-20).
  const TONE = { studied: "#22c08c", seen: "#f3c14b", absent: "#5a5a6e" };
  const Row = ({ r, tone }) => (
    <MemberRow
      name={r.name}
      pct={Math.round(r.pct)}
      color={pctColor(r.pct)}
      dot={TONE[tone]}
      note={
        tone === "studied" ? fmtMins(r.studiedTodaySeconds)
          : tone === "seen" ? "לא למד/ה"
            : r.lastSeen ? new Date(r.lastSeen).toLocaleDateString("he-IL") : "טרם נכנס/ה"
      }
      onClick={() => onSelectMember?.(r)}
      // The nudge button appears only next to someone who did not study today — that is
      // the whole point of the button, and the group it belongs to.
      onMessage={tone === "studied" ? undefined : () => onMessage?.(r)}
      // The record itself, not a boolean: MemberRow needs `readAt` to tell "sent" from
      // "read". `!!` here quietly collapsed that distinction and every nudge read as unread.
      messaged={messagedToday?.[r.id]}
    />
  );

  const Section = ({ icon: Icon, title, count, color, children, empty }) => (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon size={13} style={{ color }} />
        <p className="text-xs font-black" style={{ color }}>{title}</p>
        <span className="text-[10px] font-bold text-[#8a8aa0]">({count})</span>
      </div>
      {count === 0 ? <p className="text-[11px] text-[#8a8aa0] pr-5">{empty}</p> : children}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Headline: the whole team in one line, before any per-person detail. */}
      <div className="bg-gradient-to-l from-[#1b1740] to-[#16181c] border border-[#6d5efc]/40 rounded-xl p-4">
        <p className="text-[10px] font-black text-[#a79bff] mb-2">היום</p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-2xl font-black text-[#eef0f6]">
              {groups.studied.length}<span className="text-sm text-[#8a8aa0]">/{rows.length}</span>
            </p>
            <p className="text-[10px] font-bold text-[#8a8aa0]">למדו היום</p>
          </div>
          <div className="flex-1">
            <p className="text-2xl font-black text-[#22c08c]">{teamMinutesToday}</p>
            <p className="text-[10px] font-bold text-[#8a8aa0]">דקות לימוד</p>
          </div>
          <div className="flex-1">
            <p className="text-2xl font-black" style={{ color: pctColor(avgPct) }}>{Math.round(avgPct)}%</p>
            <p className="text-[10px] font-bold text-[#8a8aa0]">ידע ממוצע</p>
          </div>
        </div>
      </div>

      {/* Who did learn comes first, then who didn't (user, 2026-08-20). The good news is
          the shorter list on a healthy day, and the order makes the gap obvious. */}
      <Section
        icon={CheckCircle2} title="למדו היום" count={groups.studied.length} color="#22c08c"
        empty="אף אחד עדיין לא למד היום"
      >
        <div>{groups.studied.map((r) => <Row key={r.id} r={r} tone="studied" />)}</div>
      </Section>

      <Section
        icon={Eye} title="נכנסו אבל לא למדו" count={groups.seenOnly.length} color="#f3c14b"
        empty="כל מי שנכנס היום גם למד"
      >
        <div>{groups.seenOnly.map((r) => <Row key={r.id} r={r} tone="seen" />)}</div>
      </Section>

      <Section
        icon={AlertCircle} title="צריכים ללמוד" count={groups.absent.length} color="#8a8aa0"
        empty="כל הצוות היה פעיל היום 🎉"
      >
        {/* Weakest first: this list is a to-do, so the person who needs it most is on top. */}
        <div>{groups.absent.map((r) => <Row key={r.id} r={r} tone="absent" />)}</div>
      </Section>

      <div className="flex items-center gap-1.5 justify-center pt-1">
        <Clock size={10} className="text-[#5a5a6e]" />
        <p className="text-[9px] text-[#5a5a6e] font-bold">
          לחצו על עובד לפרטים מלאים · 7 הימים האחרונים
        </p>
      </div>
    </div>
  );
}
