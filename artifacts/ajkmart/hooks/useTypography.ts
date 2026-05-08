import { useLanguage } from "@/context/LanguageContext";
import { getTypography, getFontFamily } from "@/constants/colors";
import { useFontSize } from "@/context/FontSizeContext";
import { useScaledTypography } from "@/constants/typography";

export function useTypography() {
  const { language } = useLanguage();
  const { fontScale } = useFontSize();
  const base = getTypography(language);
  if (fontScale === 1) return base;
  const scaled: typeof base = {} as typeof base;
  for (const key in base) {
    const k = key as keyof typeof base;
    const entry = base[k] as { fontFamily?: string; fontSize?: number; lineHeight?: number };
    scaled[k] = {
      ...entry,
      ...(entry.fontSize != null ? { fontSize: Math.round(entry.fontSize * fontScale * 10) / 10 } : {}),
      ...(entry.lineHeight != null ? { lineHeight: Math.round(entry.lineHeight * fontScale * 10) / 10 } : {}),
    } as (typeof base)[typeof k];
  }
  return scaled;
}

export function useFontFamily() {
  const { language } = useLanguage();
  return getFontFamily(language);
}

export { useScaledTypography };
