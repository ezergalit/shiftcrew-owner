import { useRef, useState } from "react";
import { Play, SkipForward, Volume2, VolumeX, BookOpen, Users } from "lucide-react";

// The restaurant's own tour video, shown once to a new manager in place of the guided
// tour (user, 2026-08-29). Which restaurants get one is data, not code:
// restaurants.owner_welcome_video_url. Same shape as the waiter's WelcomeVideo — two
// apps that show the same kind of thing should show it the same way.
//
// ⚠️ Muted + playsInline is the only combination iOS Safari will autoplay without a
// gesture, so it starts muted with a one-tap unmute. The play button covers the browsers
// that refuse anyway, and "skip" is always visible: a manager opening this mid-service
// must never be held by a 44-second video.
export default function OwnerWelcomeVideo({ restaurant, onDone }) {
  const ref = useRef(null);
  const [ended, setEnded] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [muted, setMuted] = useState(true);

  return (
    <div className="h-full max-w-md mx-auto flex flex-col bg-[#0c0d10] text-[#eef0f6]" dir="rtl">
      <div className="px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <p className="text-[15px] font-black">
          ברוכים הבאים{restaurant?.name ? ` — ${restaurant.name}` : ""} 👋
        </p>
        <p className="text-[11.5px] text-[#8a8aa0] mt-0.5">
          {ended ? "זהו — אפשר להתחיל" : "סרטון קצר שמראה איך עובדים עם האפליקציה · אפשר להפעיל קול 🔊"}
        </p>
      </div>

      {ended ? (
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3">
          <div className="rounded-2xl p-4 text-[#EEF0F6]" style={{ background: "linear-gradient(135deg,#0F5C46,#0a3d2f)" }}>
            <p className="text-[19px] font-black leading-tight">{restaurant?.name || "המסעדה שלכם"}</p>
            <p className="text-[14px] leading-relaxed mt-2 text-[#EEF0F6]/90">
              התפריט כבר בפנים. מכאן העבודה שלכם היא לתקן מה שצריך — כל השאר קורה לבד.
            </p>
          </div>

          <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-3.5 flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-[#22c08c]/15 flex items-center justify-center flex-shrink-0">
              <Users size={15} className="text-[#22c08c]" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-black text-[#eef0f6]">קודם כל — לצרף את הצוות</p>
              <p className="text-[11.5px] text-[#8a8aa0] leading-relaxed mt-0.5">
                קוד ההצטרפות נמצא בהגדרות. כל מלצר נכנס עם הקוד ועם השם שלו, ומופיע אצלכם מיד.
              </p>
            </div>
          </div>

          <div className="bg-[#16181c] border border-[#22252b] rounded-2xl p-3.5 flex items-start gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-[#22c08c]/15 flex items-center justify-center flex-shrink-0">
              <BookOpen size={15} className="text-[#22c08c]" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-black text-[#eef0f6]">התפריט הוא מה שהצוות לומד</p>
              <p className="text-[11.5px] text-[#8a8aa0] leading-relaxed mt-0.5">
                תיאור, מרכיבים ואלרגיות של כל מנה הם מה שבונה את השאלות. תיקון קטן שם משפר את כל התרגול.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          <video
            ref={ref}
            src={restaurant?.owner_welcome_video_url}
            className="w-full h-full object-contain"
            autoPlay
            muted={muted}
            playsInline
            controls
            onEnded={() => setEnded(true)}
            onError={() => setEnded(true)}   // a video that won't load must not trap anyone
            onPlay={() => setNeedsTap(false)}
            onLoadedData={(e) => { e.currentTarget.play().catch(() => setNeedsTap(true)); }}
          />
          <button
            onClick={() => { const v = ref.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); }}
            className="absolute top-3 left-3 w-11 h-11 rounded-full bg-black/60 text-[#eef0f6] flex items-center justify-center"
            aria-label={muted ? "הפעלת קול" : "השתקה"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          {needsTap && (
            <button
              onClick={() => ref.current?.play().catch(() => setEnded(true))}
              className="absolute inset-0 flex items-center justify-center bg-black/40"
              aria-label="הפעלה"
            >
              <span className="w-16 h-16 rounded-full bg-[#22c08c] text-[#06231a] flex items-center justify-center">
                <Play size={26} />
              </span>
            </button>
          )}
        </div>
      )}

      <div className="px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          onClick={onDone}
          className={`w-full py-3.5 min-h-[52px] rounded-2xl font-black text-sm ${
            ended ? "bg-[#22c08c] text-[#06231a]" : "bg-[#16181c] border border-[#22252b] text-[#c4c4d4]"
          }`}
        >
          {ended ? "יאללה, מתחילים" : (
            <span className="flex items-center justify-center gap-1.5">
              <SkipForward size={15} />לדלג ולהתחיל
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
