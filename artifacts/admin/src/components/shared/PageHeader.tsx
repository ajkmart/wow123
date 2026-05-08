import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Link } from "wouter";

/**
 * Shared page header used across the admin chrome.
 *
 * Replaces the ad-hoc `<div className="flex items-center justify-between">` +
 * inline icon-tile + `<h1 className="text-3xl font-display font-bold">` block
 * that every page used to redeclare. Pages can pass:
 *
 *   - `icon`     — a Lucide icon component (rendered in the standard
 *                   slate-100 / slate-600 tile);
 *   - `title`    — the H1;
 *   - `subtitle` — optional description below the title;
 *   - `breadcrumbs` — optional crumbs above the title (each crumb has a
 *                     label and an optional `href`);
 *   - `actions`  — optional ReactNode rendered on the right side
 *                   (responsive: stacks below on mobile).
 *
 * The component intentionally does no data fetching — keeps it cheap to
 * use everywhere.
 */

export interface BreadcrumbCrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: BreadcrumbCrumb[];
  actions?: ReactNode;
  /** Override the default slate-100 / slate-600 icon tile colours. */
  iconBgClass?: string;
  iconColorClass?: string;
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  breadcrumbs,
  actions,
  iconBgClass = "bg-slate-100",
  iconColorClass = "text-slate-600",
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBgClass} ${iconColorClass}`}
          >
            <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        )}
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground mb-0.5 flex-wrap"
            >
              {breadcrumbs.map((crumb, i) => (
                <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50" aria-hidden="true" />}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="hover:text-foreground admin-transition rounded-sm admin-focus-ring"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-foreground">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-display font-bold tracking-tight text-foreground truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}
