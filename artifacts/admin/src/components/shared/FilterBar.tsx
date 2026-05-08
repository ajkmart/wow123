import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Shared filter bar used across list/table pages.
 *
 * Renders a search input on the left plus arbitrary filter controls
 * (selects, toggles, date pickers) on the right. Stacks on mobile.
 *
 * Usage:
 *   <FilterBar
 *     search={q}
 *     onSearch={setQ}
 *     placeholder="Search users…"
 *     filters={<>
 *       <Select …>…</Select>
 *     </>}
 *   />
 */

export interface FilterBarProps {
  search?: string;
  onSearch?: (value: string) => void;
  placeholder?: string;
  filters?: ReactNode;
  className?: string;
}

export function FilterBar({
  search = "",
  onSearch,
  placeholder = "Search…",
  filters,
  className = "",
}: FilterBarProps) {
  return (
    <div className={`flex flex-col sm:flex-row gap-2 ${className}`}>
      {onSearch !== undefined && (
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={placeholder}
            className="pl-9 h-10 rounded-xl bg-white"
            aria-label={placeholder}
          />
        </div>
      )}
      {filters && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {filters}
        </div>
      )}
    </div>
  );
}
