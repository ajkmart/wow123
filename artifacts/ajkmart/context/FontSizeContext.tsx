import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const FONT_SIZE_KEY = "@ajkmart_font_size";

export type FontSizeLevel = "small" | "medium" | "large";

export const FONT_SIZE_MULTIPLIERS: Record<FontSizeLevel, number> = {
  small: 0.875,
  medium: 1,
  large: 1.15,
};

interface FontSizeContextValue {
  fontSizeLevel: FontSizeLevel;
  fontScale: number;
  setFontSizeLevel: (level: FontSizeLevel) => Promise<void>;
}

const FontSizeContext = createContext<FontSizeContextValue>({
  fontSizeLevel: "medium",
  fontScale: 1,
  setFontSizeLevel: async () => {},
});

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const [fontSizeLevel, setFontSizeLevelState] = useState<FontSizeLevel>("medium");

  useEffect(() => {
    AsyncStorage.getItem(FONT_SIZE_KEY)
      .then((stored) => {
        if (stored === "small" || stored === "medium" || stored === "large") {
          setFontSizeLevelState(stored as FontSizeLevel);
        }
      })
      .catch(() => {});
  }, []);

  const setFontSizeLevel = useCallback(async (level: FontSizeLevel) => {
    setFontSizeLevelState(level);
    try {
      await AsyncStorage.setItem(FONT_SIZE_KEY, level);
    } catch {}
  }, []);

  const fontScale = FONT_SIZE_MULTIPLIERS[fontSizeLevel];

  return (
    <FontSizeContext.Provider
      value={{
        fontSizeLevel,
        fontScale,
        setFontSizeLevel,
      }}
    >
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize() {
  return useContext(FontSizeContext);
}
