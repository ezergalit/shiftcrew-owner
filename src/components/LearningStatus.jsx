import { useEffect, useMemo, useState } from "react";
import { Clock, Eye, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { MemberRow } from "./MemberSheet";
import { lastSeenNote } from "./aurora/bits";

const db = supabase.schema("menu_app");

// "סטטוס למידה" — the owner's daily read on the team. Two lists only (user, 2026-08-23):
//   1. who studied today, and how much
//   2. who read the daily brief or marked shift tasks today
//
// There is deliberately NO "everyone else" list ("whoever didn't study is obvious because
// it shows who did") — the 2/7 headline already sizes the gap, and the full roster lives
// in "התקדמות ומבחנים". An empty group says so explicitly instead of hiding.
//
// Read-only; nothing here can disturb the menu editor.

const DAY_MS = 86400000;
const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const isSameDay = (a, b) => a && startOfDay(new Date(a)).getTime() === startOfDay(b).getTime();

const fmtMins = (secs) => {
  if (!secs) return "0 דק׳";
  const m = Math.round(secs / 60);
  return m >= 60 ? `${(m / 60).toFixed(1)} ש׳` : `${m} דק׳`;
};

const pctColor = (p) => (p >= 75 ? "#22c08c" : p >= 45 ? "#f3c14b" : "#e0315a");

// `variant="aurora"` swaps ONLY the rendering. The query above is shared, so the manager's
// home screen and the old status card can never disagree about the same waiter — and a
// restaurant without the skin renders exactly what it rendered before, byte for byte.
export default function LearningStatus({ restaurant, onSelectMember, onRows, onMessage, messagedToday, variant, onInvite }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!restaurant?.id) return;
      const since = new Date(Date.now() - 7 * DAY_MS).toISOString();
      const todayStr = new Date().toLocaleDateString("en-CA");
      const [members, menu, snaps, board, reads] = await Promise.all([
        db.from("team_members")
          .select("id, name, first_name, last_name, total_seconds, baseline_pct, last_seen_at, created_at")
          .eq("restaurant_id", restaurant.id),
        db.from("published_menu").select("source_item_id").eq("restaurant_id", restaurant.id),
        db.from("progress_snapshots").select("team_member_id, taken_at, seconds_delta, points")
          .eq("restaurant_id", restaurant.id).gte("taken_at", since),
        db.from("leaderboard").select("team_member_id, points, streak").eq("restaurant_id", restaurant.id),
        db.from("daily_brief_reads").select("team_member_id")
          .eq("restaurant_id", restaurant.id).eq("date", todayStr),
      ]);
      if (!alive) return;

      const ids = (members.data || []).map((m) => m.id);
      // Percentage from menu_progress, the same sum/(n*5) formula the waiter app and the
      // team tab use. Kept consistent on purpose — two screens disagreeing about the same
      // waiter's score is worse than either number being slightly off.
      const [{ data: progress }, { data: taskMarks }] = ids.length
        ? await Promise.all([
            db.from("menu_progress").select("team_member_id, mastery, source_item_id").in("team_member_id", ids),
            db.from("shift_task_done").select("team_member_id").in("team_member_id", ids).eq("done_date", todayStr),
          ])
        : [{ data: [] }, { data: [] }];
      if (!alive) return;
      const readToday = new Set((reads.data || []).map((r) => r.team_member_id));
      const tasksBy = new Map();
      for (const t of taskMarks || []) tasksBy.set(t.team_member_id, (tasksBy.get(t.team_member_id) || 0) + 1);

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
          readBrief: readToday.has(m.id),
          tasksDone: tasksBy.get(m.id) || 0,
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
      // Read the brief or marked shift tasks today. NOT filtered against the studied
      // list: someone who studied AND read appears in both, otherwise this group's
      // "nobody read yet" line contradicts the read-board below it (caught live
      // 2026-08-23 — a waiter read at 11:35 but also studied, so the line claimed nobody).
      engaged: list.filter((r) => r.readBrief || r.tasksDone > 0),
    };
  }, [rows]);

  if (variant === "aurora")
    return (
      <AuroraStatus
        rows={rows}
        onSelectMember={onSelectMember}
        onMessage={onMessage}
        messagedToday={messagedToday}
        onInvite={onInvite}
      />
    );

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
  const TONE = { studied: "#22c08c", engaged: "#38bdf8" };
  const Row = ({ r, tone }) => (
    <MemberRow
      name={r.name}
      pct={Math.round(r.pct)}
      color={pctColor(r.pct)}
      dot={TONE[tone]}
      note={
        tone === "studied"
          ? fmtMins(r.studiedTodaySeconds)
          : [r.readBrief ? "עדכון ✓" : null, r.tasksDone ? (r.tasksDone === 1 ? "משימה אחת" : `${r.tasksDone} משימות`) : null]
              .filter(Boolean).join(" · ")
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
        icon={Eye} title="קראו את העדכון או סימנו משימות" count={groups.engaged.length} color="#38bdf8"
        empty="אף אחד עדיין לא קרא את העדכון או סימן משימות היום"
      >
        <div>{groups.engaged.map((r) => <Row key={r.id} r={r} tone="engaged" />)}</div>
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


// ── «אורורה»: one card, three states ──────────────────────────────────────────────
//
// The unskinned card has two lists — who studied, and who read the brief or ticked shift
// tasks. Under this skin there IS no brief and there are no tasks (`features.tasks:false`),
// so the second list would always be empty. The three states that remain are the ones a
// manager actually acts on: learned today, opened the app without learning, did not open it.
//
// ⚠️ Wording is deliberately genderless. `team_members` stores no gender, and "למדה"/"למד"
// guessed from a name is worse than a noun phrase that is right for everyone.
function AuroraStatus({ rows, onSelectMember, onMessage, messagedToday, onInvite }) {
  if (rows === null)
    return <p className="text-[12.5px] text-[#8a919e] py-6 text-center">טוען את סטטוס הצוות…</p>;

  if (!rows.length)
    return (
      <div className="text-center py-3">
        <p className="text-[14px] font-black text-[#eef0f6]">עדיין אין חברי צוות</p>
        <p className="text-[12px] text-[#8a919e] mt-1 mb-3 leading-relaxed">
          ברגע שמלצר נכנס עם קוד ההצטרפות, הוא יופיע כאן עם ההתקדמות שלו
        </p>
        {onInvite && (
          <button type="button" className="au-pill" onClick={onInvite}>
            לקוד ההצטרפות
          </button>
        )}
      </div>
    );

  const studied = rows.filter((r) => r.studiedToday);
  const seen = rows.filter((r) => !r.studiedToday && r.seenToday);
  const away = rows.filter((r) => !r.studiedToday && !r.seenToday);

  const note = (r) => {
    if (r.studiedToday) return `${fmtMins(r.studiedTodaySeconds)} לימוד היום`;
    if (r.seenToday) return "כניסה היום · עדיין בלי לימוד";
    return lastSeenNote(r.lastSeen);
  };
  const dot = (r) => (r.studiedToday ? "#22c08c" : r.seenToday ? "#E8B93E" : "rgba(238,240,246,.3)");

  // Weakest first within each group: this list is a to-do, not a leaderboard.
  const byPct = (a, b) => a.pct - b.pct;
  const ordered = [...studied.sort(byPct), ...seen.sort(byPct), ...away.sort(byPct)];

  return (
    <>
      <div className="au-cardhead">
        <b>מי למד היום</b>
      </div>
      <p className="text-[12px] text-[#8a919e] -mt-2 mb-1.5 leading-relaxed">
        {`למדו היום ${studied.length} · נכנסו ולא למדו ${seen.length} · לא נכנסו ${away.length}`}
      </p>
      {ordered.map((r) => (
        <div key={r.id} className="au-member">
          <span className="av" aria-hidden>{auInitials(r.name)}</span>
          <button
            type="button"
            onClick={() => onSelectMember?.(r)}
            className="flex-1 min-w-0 text-right bg-transparent border-0 p-0 font-inherit text-inherit cursor-pointer"
          >
            <span className="nm block truncate">{r.name}</span>
            <span className="st block" style={r.seenToday && !r.studiedToday ? { color: "var(--amber)" } : undefined}>
              {note(r)}
            </span>
          </button>
          {/* The nudge sits only next to someone who has not learned today — that is the
              entire point of the button, and the group it belongs to. */}
          {!r.studiedToday && onMessage && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMessage(r); }}
              title={messagedToday?.[r.id] ? "כבר נשלחה תזכורת היום" : "שליחת תזכורת"}
              aria-label={messagedToday?.[r.id] ? `כבר נשלחה תזכורת ל${r.name}` : `שליחת תזכורת ל${r.name}`}
              className="au-star"
              style={messagedToday?.[r.id] ? { color: "var(--em)" } : undefined}
            >
              {messagedToday?.[r.id] ? "✓" : "✉"}
            </button>
          )}
          <span className="pc" style={{ color: pctColor(r.pct) }}>
            {Math.round(r.pct)}%
            <i style={{ background: dot(r) }} />
          </span>
        </div>
      ))}
      <p className="text-[11px] text-[#6b7280] text-center pt-2.5">לחצו על שם לפרטים המלאים</p>
    </>
  );
}

const auInitials = (name) =>
  String(name || "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
