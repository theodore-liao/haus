"use client";

import { useEffect, useState } from "react";

export const UI_SCALE_KEY = "haus.uiScale";
export const UI_SCALE_MIN = 0.85;
export const UI_SCALE_MAX = 1.3;
export const UI_SCALE_DEFAULT = 1;

export function clampUiScale(n: number) {
  if (!Number.isFinite(n)) return UI_SCALE_DEFAULT;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, n));
}

export function applyUiScale(scale: number) {
  const s = clampUiScale(scale);
  if (s === 1) document.documentElement.style.removeProperty("font-size");
  else document.documentElement.style.fontSize = `${s * 100}%`;
}

export function UiScaleSync() {
  useEffect(() => {
    try {
      const raw = Number(localStorage.getItem(UI_SCALE_KEY));
      if (Number.isFinite(raw) && raw > 0) applyUiScale(raw);
    } catch {
      /* keep default */
    }
  }, []);
  return null;
}

export function UiScaleSlider() {
  const [scale, setScale] = useState(UI_SCALE_DEFAULT);

  useEffect(() => {
    try {
      const raw = Number(localStorage.getItem(UI_SCALE_KEY));
      if (Number.isFinite(raw) && raw > 0) setScale(clampUiScale(raw));
    } catch {
      /* keep default */
    }
  }, []);

  function onChange(v: number) {
    const next = clampUiScale(v);
    setScale(next);
    try {
      localStorage.setItem(UI_SCALE_KEY, String(next));
    } catch {
      /* ignore */
    }
    applyUiScale(next);
  }

  return (
    <div className="min-w-[12rem]">
      <div className="flex items-center justify-between text-sm">
        <span>Text size</span>
        <span className="font-mono tabular-nums text-muted-foreground">{Math.round(scale * 100)}%</span>
      </div>
      <input
        type="range"
        min={UI_SCALE_MIN}
        max={UI_SCALE_MAX}
        step={0.05}
        value={scale}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full cursor-pointer accent-primary"
        aria-label="Text size"
      />
    </div>
  );
}
