// "בוקר טוב, דנה" — the app opening the way a person would.
//
// Hebrew has a real greeting for each part of the day, and using the wrong one is more
// noticeable than using none. The bands below follow ordinary Israeli usage rather than
// clock quarters: mornings run late, "צהריים" is a narrow window around midday, and the
// evening starts well before dark.
export function greetingFor(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "בוקר טוב";
  if (h >= 12 && h < 16) return "צהריים טובים";
  if (h >= 16 && h < 18) return "אחר צהריים טובים";
  if (h >= 18 && h < 22) return "ערב טוב";
  return "לילה טוב";
}

export default function Greeting({ name }) {
  const now = new Date();
  const date = now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="px-1">
      {/* Wraps rather than truncates. A long name clipped in RTL cuts the START of any
          Latin word — "מסעדת הדגמה — CrewMenu" came out as "…wMenu", which reads as a bug
          rather than as an abbreviation. Two lines is the lesser evil, and most names fit
          on one anyway. */}
      <p className="text-[19px] font-black text-[#eef0f6] leading-tight line-clamp-2">
        {greetingFor(now)}{name ? <>, {name}</> : ""}
      </p>
      <p className="text-[11px] text-[#8a8aa0] mt-0.5">{date}</p>
    </div>
  );
}
