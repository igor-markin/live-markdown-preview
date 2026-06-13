import { DEFAULT_PREFERENCES } from "./defaults";
import { defaultColorSchemeForTheme, getColorScheme, isColorSchemeId } from "./colorSchemes";
import type { Preferences, Theme } from "./types";

export const MIN_SPLIT_RATIO = 30;
export const MAX_SPLIT_RATIO = 70;

export function clampSplitRatio(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return DEFAULT_PREFERENCES.splitRatio;
  }

  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, Math.round(numeric)));
}

export function normalizePreferences(value: Partial<Preferences> | null | undefined): Preferences {
  const theme = isTheme(value?.theme) ? value.theme : DEFAULT_PREFERENCES.theme;
  const colorScheme = isColorSchemeId(value?.colorScheme) ? value.colorScheme : defaultColorSchemeForTheme(theme);

  return {
    theme: getColorScheme(colorScheme).theme,
    colorScheme,
    outlineVisible:
      typeof value?.outlineVisible === "boolean" ? value.outlineVisible : DEFAULT_PREFERENCES.outlineVisible,
    splitRatio: clampSplitRatio(value?.splitRatio ?? DEFAULT_PREFERENCES.splitRatio)
  };
}

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}
