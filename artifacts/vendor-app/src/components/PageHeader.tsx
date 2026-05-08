import { type ReactNode } from "react";
import { Header } from "./Header";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  mobileContent?: ReactNode;
}

/**
 * Responsive page header:
 * - Mobile: full-bleed orange gradient (same as before)
 * - Desktop: clean white top bar with title + actions
 */
export function PageHeader({ title, subtitle, actions, mobileContent }: PageHeaderProps) {
  return (
    <>
      {/* ── Mobile Header (gradient) ── */}
      <Header pb="pb-5" className="md:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-white">{title}</h1>
            {subtitle && <p className="text-orange-100 text-sm mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        {mobileContent && <div className="mt-3">{mobileContent}</div>}
      </Header>

      {/* ── Desktop Header (clean) ── */}
      <div className="hidden md:flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
        {mobileContent && <div className="flex-1 max-w-sm ml-6">{mobileContent}</div>}
      </div>
    </>
  );
}
