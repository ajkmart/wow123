import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { ShoppingBag, Home, Search, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/CommandPalette";
import { safeLocalGet } from "@/lib/safeStorage";

interface RecentEntry {
  href: string;
  label: string;
}

const HISTORY_KEY = "ajkmart_admin_recent_pages";

function readRecent(): RecentEntry[] {
  try {
    const raw = safeLocalGet(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e: any) => e && typeof e.href === "string" && typeof e.label === "string")
      .slice(0, 3);
  } catch {
    return [];
  }
}

export default function NotFound() {
  const [location] = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  return (
    <>
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 px-4 py-10">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-5">
            <ShoppingBag className="w-8 h-8 text-white" />
          </div>

          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-indigo-500 mb-3">
            AJKMart Admin Console
          </p>

          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3">
            We couldn't find that page
          </h1>

          <p className="text-sm md:text-[15px] text-slate-500 leading-relaxed mb-8">
            The page <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{location}</span> doesn't exist or was moved.
            Use the dashboard or jump straight to a page from search.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/dashboard">
              <Button className="h-11 rounded-xl gap-2 px-6 w-full sm:w-auto">
                <Home className="w-4 h-4" />
                Go to Dashboard
              </Button>
            </Link>
            <Button
              variant="outline"
              className="h-11 rounded-xl gap-2 px-6 w-full sm:w-auto"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="w-4 h-4" />
              Open Search
            </Button>
          </div>

          {recent.length > 0 && (
            <div className="mt-10 text-left">
              <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-slate-400 mb-3 flex items-center gap-1.5">
                <Compass className="w-3 h-3" /> Recently visited
              </p>
              <div className="grid gap-1.5">
                {recent.map(entry => (
                  <Link key={entry.href} href={entry.href}>
                    <div className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-sm flex items-center justify-between cursor-pointer">
                      <span className="font-medium text-slate-700">{entry.label}</span>
                      <span className="text-xs text-slate-400 font-mono">{entry.href}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
