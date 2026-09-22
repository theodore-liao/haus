"use client";

import { useEffect } from "react";

const FLAG = "__hausConsoleTap";

/** In development, forward browser console errors and warnings to the local log. */
export function ConsoleTap() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as Window & { [FLAG]?: boolean };
    if (w[FLAG]) return;
    w[FLAG] = true;

    const seen = new Set<string>();
    const send = (level: "error" | "warning", message: string, stack?: string) => {
      const text = message.replace(/\s+/g, " ").trim().slice(0, 500);
      if (!text || text.includes("/api/dev-console")) return;
      const key = `${level}:${text}`;
      if (seen.has(key)) return;
      seen.add(key);
      const body = JSON.stringify({
        level,
        message: text,
        url: window.location.pathname,
        stack: stack?.slice(0, 800) ?? "",
      });
      void fetch("/api/dev-console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    };

    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...args: unknown[]) => {
      origError(...args);
      send("error", args.map(formatArg).join(" "), stackOf(args));
    };
    console.warn = (...args: unknown[]) => {
      origWarn(...args);
      send("warning", args.map(formatArg).join(" "), stackOf(args));
    };
    const onError = (event: ErrorEvent) => {
      send("error", event.message || "window error", event.error instanceof Error ? event.error.stack : undefined);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      send("error", reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      console.error = origError;
      console.warn = origWarn;
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      w[FLAG] = false;
    };
  }, []);
  return null;
}

function formatArg(value: unknown) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stackOf(args: unknown[]) {
  const error = args.find((value) => value instanceof Error);
  return error instanceof Error ? error.stack : undefined;
}
