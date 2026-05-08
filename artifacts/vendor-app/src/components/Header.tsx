import { type ReactNode } from "react";

interface HeaderProps {
  children: ReactNode;
  className?: string;
  /** extra bottom padding (default pb-5) */
  pb?: string;
}

/**
 * Full-bleed gradient header that respects Android status bar safe area.
 * Use this instead of raw <div className="bg-gradient..."> for all page headers.
 */
export function Header({ children, className = "", pb = "pb-5" }: HeaderProps) {
  return (
    <div
      className={`bg-gradient-to-br from-orange-500 to-amber-600 relative overflow-hidden ${pb} ${className}`}
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 2.5rem)" }}
    >
      {/* Decorative circles */}
      <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />
      <div className="absolute -bottom-6 -left-6 w-28 h-28 bg-white/10 rounded-full pointer-events-none" />
      <div className="relative px-5">{children}</div>
    </div>
  );
}
