import { useFontSize } from "@/context/FontSizeContext";

export { typography, getTypography, getFontFamily } from "./colors";
export type { } from "./colors";

export const T = {
  h1: { fontFamily: "Inter_700Bold" as const, fontSize: 28, lineHeight: 34 },
  h2: { fontFamily: "Inter_700Bold" as const, fontSize: 22, lineHeight: 28 },
  h3: { fontFamily: "Inter_700Bold" as const, fontSize: 18, lineHeight: 24 },
  subtitle: { fontFamily: "Inter_600SemiBold" as const, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: "Inter_400Regular" as const, fontSize: 14, lineHeight: 20 },
  bodyMedium: { fontFamily: "Inter_500Medium" as const, fontSize: 14, lineHeight: 20 },
  bodySemiBold: { fontFamily: "Inter_600SemiBold" as const, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: "Inter_400Regular" as const, fontSize: 12, lineHeight: 16 },
  captionMedium: { fontFamily: "Inter_500Medium" as const, fontSize: 12, lineHeight: 16 },
  captionBold: { fontFamily: "Inter_700Bold" as const, fontSize: 12, lineHeight: 16 },
  small: { fontFamily: "Inter_400Regular" as const, fontSize: 11, lineHeight: 14 },
  smallMedium: { fontFamily: "Inter_500Medium" as const, fontSize: 11, lineHeight: 14 },
  smallBold: { fontFamily: "Inter_700Bold" as const, fontSize: 11, lineHeight: 14 },
  tiny: { fontFamily: "Inter_700Bold" as const, fontSize: 10, lineHeight: 12 },
  button: { fontFamily: "Inter_600SemiBold" as const, fontSize: 15, lineHeight: 20 },
  buttonMedium: { fontFamily: "Inter_600SemiBold" as const, fontSize: 14, lineHeight: 20 },
  buttonSmall: { fontFamily: "Inter_600SemiBold" as const, fontSize: 13, lineHeight: 18 },
  tabLabel: { fontFamily: "Inter_500Medium" as const, fontSize: 11, lineHeight: 14 },
  price: { fontFamily: "Inter_700Bold" as const, fontSize: 17, lineHeight: 22 },
  title: { fontFamily: "Inter_700Bold" as const, fontSize: 20, lineHeight: 26 },
} as const;

export const Font = {
  regular: "Inter_400Regular" as const,
  medium: "Inter_500Medium" as const,
  semiBold: "Inter_600SemiBold" as const,
  bold: "Inter_700Bold" as const,
} as const;

type TypEntry = { fontFamily: string; fontSize: number; lineHeight: number };
type ScaledTypography = { [K in keyof typeof T]: TypEntry };

function scaleTypography(scale: number): ScaledTypography {
  return Object.fromEntries(
    (Object.keys(T) as (keyof typeof T)[]).map((key) => {
      const entry = T[key];
      return [
        key,
        {
          fontFamily: entry.fontFamily,
          fontSize: Math.round(entry.fontSize * scale * 10) / 10,
          lineHeight: Math.round(entry.lineHeight * scale * 10) / 10,
        },
      ];
    })
  ) as ScaledTypography;
}

export function useScaledTypography(): ScaledTypography {
  const { fontScale } = useFontSize();
  return scaleTypography(fontScale);
}
