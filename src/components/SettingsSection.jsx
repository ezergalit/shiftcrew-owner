import { ChevronDown } from "lucide-react";

// Settings used to be one long scroll: eight cards, all expanded, so finding the pass
// threshold meant scrolling past the menu health review and the restaurant details.
// Now every section is collapsed and the header carries its own summary — the owner can
// read what each one is set to without opening any of them (user request, 2026-08-20).
//
// One section open at a time, controlled by the parent: two open panels reintroduce
// exactly the scrolling this was meant to remove.
export default function SettingsSection({ icon, title, summary, open, onToggle, children }) {
  return (
    <div className={`border-b border-[#1e2128] last:border-b-0 ${open ? "bg-[#1a1d23]" : ""}`}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-3.5 text-right hover:bg-[#1a1d23] transition"
      >
        <span
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition ${
            open ? "bg-[#6d5efc]/20" : "bg-[#20232b]"
          }`}
        >
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-black text-[#eef0f6]">{title}</span>
          {summary && (
            <span
              className={`block text-[10.5px] mt-0.5 leading-snug ${
                open ? "text-[#a79bff]" : "text-[#5a5a6e] truncate"
              }`}
            >
              {summary}
            </span>
          )}
        </span>
        <ChevronDown
          size={15}
          className={`flex-shrink-0 transition-transform ${open ? "rotate-180 text-[#a79bff]" : "text-[#5a5a6e]"}`}
        />
      </button>
      {/* Rendered only when open: these panels each run their own queries, and mounting
          all eight on every settings visit was the other half of the slowness. */}
      {open && <div className="px-3.5 pb-3.5">{children}</div>}
    </div>
  );
}
