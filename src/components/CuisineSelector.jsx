import { useState, useRef, useEffect } from "react";
import { X, Plus, Search } from "lucide-react";
import { searchCuisines, CUISINE_TYPES } from "../lib/cuisineTypes";

// Reusable search + autocomplete + multi-select chips for cuisine/restaurant types.
// Used in onboarding (step 1) and in the restaurant Details tab.
export default function CuisineSelector({ selected = [], onChange, placeholder = "חפשו סוג מטבח... (סושי, יוונית, אסייתית)" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const suggestions = searchCuisines(query, selected);
  const exactMatch = CUISINE_MATCH(query, selected);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const addCuisine = (value) => {
    const v = value.trim();
    if (!v || selected.includes(v)) return;
    onChange([...selected, v]);
    setQuery("");
    setOpen(false);
  };

  const removeCuisine = (value) => {
    onChange(selected.filter((c) => c !== value));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) addCuisine(suggestions[0]);
      else if (query.trim()) addCuisine(query);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selected.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1.5 bg-[#6d5efc]/15 border border-[#6d5efc]/40 text-[#a79bff] text-xs font-bold px-2.5 py-1.5 rounded-full"
            >
              {c}
              <button
                type="button"
                onClick={() => removeCuisine(c)}
                className="hover:text-white transition"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8aa0]" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          dir="rtl"
          className="w-full bg-[#0c0d10] border border-[#22252b] rounded-xl pr-9 pl-3 py-3 text-sm text-[#eef0f6] placeholder:text-[#8a8aa0] focus:outline-none focus:border-[#6d5efc]"
        />
      </div>

      {/* Dropdown suggestions */}
      {open && query.trim() && (
        <div className="absolute z-10 mt-1.5 w-full bg-[#16181c] border border-[#22252b] rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {suggestions.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => addCuisine(c)}
              className="w-full text-right px-4 py-2.5 text-sm text-[#eef0f6] hover:bg-[#1c1e22] transition border-b border-[#22252b] last:border-0"
            >
              {c}
            </button>
          ))}
          {!exactMatch && query.trim() && (
            <button
              type="button"
              onClick={() => addCuisine(query)}
              className="w-full text-right px-4 py-2.5 text-sm text-[#6d5efc] font-bold hover:bg-[#1c1e22] transition flex items-center gap-2 justify-end"
            >
              <Plus size={14} /> הוסף "{query.trim()}" כסוג מותאם אישית
            </button>
          )}
          {suggestions.length === 0 && !query.trim() && (
            <p className="px-4 py-3 text-xs text-[#8a8aa0]">התחילו להקליד לחיפוש</p>
          )}
        </div>
      )}
    </div>
  );
}

// True when the typed text already exists as an option — either in the standard list or
// among what's already picked. Used to hide "add as a custom type": offering to invent
// "ביסטרו" while the real "ביסטרו" sits right above it produces duplicate, near-identical
// tags across restaurants, which is exactly what the shared list is meant to prevent.
function CUISINE_MATCH(query, selected) {
  const q = (query || "").trim();
  if (!q) return true;
  return selected.includes(q) || CUISINE_TYPES.includes(q);
}
