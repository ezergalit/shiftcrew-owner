import { useState } from "react";
import LearningStatus from "../LearningStatus";
import WaiterPreview from "../WaiterPreview";
import { greetingFor } from "../Greeting";
import { Tile } from "./bits";

// The manager's home screen under the «אורורה» skin.
//
// There is nothing to tick off here. `features.tasks === false` means this product is the
// menu and the service, so the home screen answers the only two questions the job actually
// has: is the menu ready to be taught, and is the team learning it. Both are derived —
// the owner is never asked to fill anything in (partner ledger #8, "automation before work").

export default function OwnerHome({
  restaurant,
  items,
  teamMembers,
  onBroadcast,
  onGoSettings,
  onSelectMember,
  onRows,
  onMessage,
  messagedToday,
}) {
  // LearningStatus owns the query; home borrows the result rather than running it again.
  // Two screens counting the same team from two queries is how they end up disagreeing.
  const [rows, setRows] = useState(null);

  const studied = rows ? rows.filter((r) => r.studiedToday).length : null;
  const avgPct = rows?.length ? rows.reduce((a, r) => a + r.pct, 0) / rows.length : null;
  const today = new Date().toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
  });
  const who = restaurant?.owner_name || restaurant?.logged_in_as_name || "";

  return (
    <div className="space-y-3.5">
      <div className="au-head">
        <div className="flex-1 min-w-0">
          <h1>{greetingFor()}{who ? `, ${who}` : ""}</h1>
          <p className="sub truncate">
            {restaurant?.name}
            {restaurant?.name ? " · " : ""}
            {today}
          </p>
        </div>
        <WaiterPreview teamCode={restaurant?.team_code} variant="aurora" />
      </div>

      {/* The three numbers that describe the day. Not links: three tiles that all navigate
          turn a summary into a menu. */}
      <div className="au-tiles">
        <div className="glass">
          <b style={avgPct == null ? undefined : { color: "var(--em)" }}>
            {avgPct == null ? "—" : `${Math.round(avgPct)}%`}
          </b>
          <span>שליטה בתפריט</span>
        </div>
        {/* Menu size is not waiter data; the menu has its own tab. */}
        <Tile value={rows == null ? "—" : rows.length} label="חברי צוות" />
        <Tile
          value={studied == null ? "—" : studied}
          sub={studied == null ? "" : `/${rows.length}`}
          label="למדו היום"
        />
      </div>

      {/* 🚫 REMOVED FOR NOW (user, 29.8): "בריאות התפריט" and "מה הצוות מתקשה בו" both
          lived here. Both were derived and both were accurate — and both asked the manager
          to do a job they told us is theirs, not the app's: *"its my job. remove it. i want
          them to have a clear home page only with waiter data."*
          The home screen answers one question now: how is the team doing.
          The bulk-fix tool still exists in settings → בדיקת בריאות התפריט for whoever wants
          it; it is just no longer something the home screen demands. The card markup is in
          git if this comes back — see this commit's parent. */}

      <div className="glass">
        <LearningStatus
          variant="aurora"
          restaurant={restaurant}
          onSelectMember={onSelectMember}
          onRows={(r) => { setRows(r); onRows?.(r); }}
          onMessage={onMessage}
          messagedToday={messagedToday}
          onInvite={onGoSettings}
        />
        {/* The per-waiter nudge sits on each row; this is the "everyone" megaphone. It is
            the only thing from the old 📊 team screen worth keeping here — the rest of
            that screen was the brief read-board and the shift tasks, neither of which
            exists under this skin. */}
        {teamMembers.length > 0 && onBroadcast && (
          <button type="button" className="au-wide mt-3" onClick={onBroadcast}>
            ✉️ הודעה לכל הצוות
          </button>
        )}
      </div>

      {teamMembers.length === 0 && (
        <button type="button" onClick={onGoSettings} className="glass w-full text-right">
          <p className="text-[14px] font-black text-[#eef0f6]">לצרף את הצוות</p>
          <p className="text-[12px] text-[#8a919e] mt-1 leading-relaxed">
            שתפו את קוד ההצטרפות — כל מלצר נכנס עם הקוד והשם שלו, וזהו
          </p>
        </button>
      )}

    </div>
  );
}
