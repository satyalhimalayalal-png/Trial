"use client";

import { useLayoutEffect } from "react";
import { usePreferences } from "@/hooks/usePreferences";

const STORAGE_KEYS = {
  theme: "cheqlist-theme",
  accent: "cheqlist-accent",
  textSize: "cheqlist-text-size",
  spacing: "cheqlist-spacing",
  columns: "cheqlist-columns",
} as const;

function applyRootTheme(attrs: {
  theme: string;
  accent: string;
  textSize: string;
  spacing: string;
  columns: string;
}) {
  const root = document.documentElement;
  root.setAttribute("data-theme", attrs.theme);
  root.setAttribute("data-accent", attrs.accent);
  root.setAttribute("data-text-size", attrs.textSize);
  root.setAttribute("data-spacing", attrs.spacing);
  root.setAttribute("data-columns", attrs.columns);
}

export function ThemeBridge() {
  const { preferences, ready } = usePreferences();

  useLayoutEffect(() => {
    const cachedTheme = localStorage.getItem(STORAGE_KEYS.theme);
    const cachedAccent = localStorage.getItem(STORAGE_KEYS.accent);
    const cachedTextSize = localStorage.getItem(STORAGE_KEYS.textSize);
    const cachedSpacing = localStorage.getItem(STORAGE_KEYS.spacing);
    const cachedColumns = localStorage.getItem(STORAGE_KEYS.columns);

    if (!cachedTheme || !cachedAccent || !cachedTextSize || !cachedSpacing || !cachedColumns) return;

    applyRootTheme({
      theme: cachedTheme,
      accent: cachedAccent,
      textSize: cachedTextSize,
      spacing: cachedSpacing,
      columns: cachedColumns,
    });
  }, []);

  useLayoutEffect(() => {
    if (!ready) return;

    const attrs = {
      theme: preferences.theme,
      accent: preferences.accentColor,
      textSize: preferences.textSize,
      spacing: preferences.spacing,
      columns: String(preferences.columns),
    };

    applyRootTheme(attrs);

    localStorage.setItem(STORAGE_KEYS.theme, attrs.theme);
    localStorage.setItem(STORAGE_KEYS.accent, attrs.accent);
    localStorage.setItem(STORAGE_KEYS.textSize, attrs.textSize);
    localStorage.setItem(STORAGE_KEYS.spacing, attrs.spacing);
    localStorage.setItem(STORAGE_KEYS.columns, attrs.columns);
  }, [
    ready,
    preferences.theme,
    preferences.accentColor,
    preferences.textSize,
    preferences.spacing,
    preferences.columns,
  ]);

  return null;
}
