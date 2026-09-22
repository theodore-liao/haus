"use client";

import { useEffect, useState } from "react";

export const UI_SCALE_KEY = "haus.uiScale";
const UI_SCALE_VERSION_KEY = "haus.uiScaleV";
const UI_SCALE_VERSION = "2";
/** Former 130% is the new 100%. The slider is a fraction of that size. */
const UI_SCALE_BASIS = 1.3;
export const UI_SCALE_MIN = 0.75;
export const UI_SCALE_MAX = 1.5;
export const UI_SCALE_DEFAULT = 1;

export function clampUiScale(n: number) {
  if (!Number.isFinite(n)) return UI_SCALE_DEFAULT;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, n));
}

/** Read the slider fraction. Values saved before v2 were the raw root font-size multiplier. */
export function readUiScale(raw: number, version: string | null) {
  if (!Number.isFinite(raw) || raw <= 0) return UI_SCALE_DEFAULT;
  if (version === UI_SCALE_VERSION) return clampUiScale(raw);
  return clampUiScale(raw / UI_SCALE_BASIS);
}

export function applyUiScale(scale: number) {
  const s = clampUiScale(scale);
  document.documentElement.style.fontSize = `${s * UI_SCALE_BASIS * 100}%`;
}

function loadStoredScale() {
  const raw = Number(localStorage.getItem(UI_SCALE_KEY));
  const version = localStorage.getItem(UI_SCALE_VERSION_KEY);
  const scale = readUiScale(raw, version);
  if (version !== UI_SCALE_VERSION && Number.isFinite(raw) && raw > 0) {
    localStorage.setItem(UI_SCALE_KEY, String(scale));
    localStorage.setItem(UI_SCALE_VERSION_KEY, UI_SCALE_VERSION);
  }
  return scale;
}

export function UiScaleSync() {
  useEffect(() => {
    try {
      applyUiScale(loadStoredScale());
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
      setScale(loadStoredScale());
    } catch {
      /* keep default */
    }
  }, []);

  function onChange(v: number) {
    const next = clampUiScale(v);
    setScale(next);
    try {
      localStorage.setItem(UI_SCALE_KEY, String(next));
      localStorage.setItem(UI_SCALE_VERSION_KEY, UI_SCALE_VERSION);
    } catch {
      /* ignore */
    }
    applyUiScale(next);
  }

  return (
    <div className="min-w-[12rem]">
      <div className="flex items-center justify-between text-sm">
        <span>Text size</span>
        <span className="num text-muted-foreground">{Math.round(scale * 100)}%</span>
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
