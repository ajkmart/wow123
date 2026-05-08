import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { SortKey, SortDir } from "./constants";

export function SortHeader({ label, sortKey, currentSort, currentDir, onSort }: {
  label: string; sortKey: SortKey; currentSort: SortKey; currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentSort === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 font-semibold hover:text-foreground transition-colors group w-full text-left"
      aria-label={`Sort by ${label}`}
    >
      {label}
      <span className="shrink-0">
        {isActive ? (
          currentDir === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-primary" /> : <ArrowDown className="w-3.5 h-3.5 text-primary" />
        ) : (
          <ArrowUpDown className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
        )}
      </span>
    </button>
  );
}
