import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import React from "react";
import type { Language } from "@workspace/i18n";
import { LANGUAGE_OPTIONS, isRTL } from "@workspace/i18n";
import { api } from "./api";

const STORAGE_KEY = "ajkmart_rider_language";
const VALID_LANGS = new Set<string>(LANGUAGE_OPTIONS.map(o => o.value));

function getStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_LANGS.has(stored)) return stored as Language;
  } catch {}
  return null;
}

/* P3: Cache the last-applied direction so we don't double-write the `dir`
   attribute on the document during the initial sync (caused a brief LTR→RTL
   flicker in the original code where applyRTL ran twice in quick succession). */
let _lastAppliedDir: string | null = null;
function applyRTL(lang: Language) {
  const dir = isRTL(lang) ? "rtl" : "ltr";
  if (_lastAppliedDir === dir + "|" + lang) return;
  _lastAppliedDir = dir + "|" + lang;
  document.documentElement.setAttribute("dir", dir);
  document.documentElement.setAttribute("lang", lang === "ur" || lang === "en_ur" ? "ur" : "en");
}

interface LanguageCtx {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  loading: boolean;
  initialised: boolean;
}

const LanguageContext = createContext<LanguageCtx>({
  language: "en",
  setLanguage: async () => {},
  loading: false,
  initialised: false,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [loading, setLoading] = useState(false);
  const [initialised, setInitialised] = useState(false);

  /* P3: Track whether the user has explicitly picked a language locally so we
     never silently overwrite that choice from the server. The server-side
     `language` is treated as a default for first-run only; once the rider has
     made a deliberate pick (either via setLanguage or by a previous local
     storage entry), we leave it alone. */
  const localPickRef = useRef<boolean>(getStoredLanguage() !== null);

  useEffect(() => {
    const local = getStoredLanguage();
    if (local) {
      setLanguageState(local);
      applyRTL(local);
      setInitialised(true);
      /* P3: Do NOT overwrite the local choice from the server. We still fetch
         settings (other UI may consume it via React Query later) but ignore
         the server `language` field for an explicit-pick rider. */
      api.getSettings().catch(() => {});
    } else {
      api.getSettings()
        .then((data: { language?: string }) => {
          /* If the user has set a language between fetch start and resolution,
             skip the server overwrite. */
          if (localPickRef.current) return;
          const serverLang = data?.language;
          if (serverLang && VALID_LANGS.has(serverLang)) {
            setLanguageState(serverLang as Language);
            applyRTL(serverLang as Language);
            try { localStorage.setItem(STORAGE_KEY, serverLang); } catch {}
          }
        })
        .catch(() => {})
        .finally(() => setInitialised(true));
    }
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    setLoading(true);
    setLanguageState(lang);
    applyRTL(lang);
    /* P3: Mark that the user has made an explicit pick so any in-flight
       getSettings() resolution from the init effect does not overwrite it. */
    localPickRef.current = true;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    try {
      await api.updateSettings({ language: lang });
    } catch {}
    setLoading(false);
  }, []);

  return React.createElement(
    LanguageContext.Provider,
    { value: { language, setLanguage, loading, initialised } },
    children
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
