// Shared by the API routes: reading what a request sent, and telling a stale id apart from a real failure.
import { NextResponse } from "next/server";
import { z } from "zod";
import { isCalendarDay } from "./range";

/** The request's JSON body, or null when it is missing or isn't JSON. A bad body is the sender's mistake, not a crash. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** The `id` a request names, when it is a non-empty string. */
export function bodyId(body: unknown): string | null {
  const id = body && typeof body === "object" ? (body as { id?: unknown }).id : undefined;
  return typeof id === "string" && id.trim() ? id : null;
}

/** Prisma found no row for the id an update named: another device removed it, or the page was open from before. */
export function isMissingRow(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2025";
}

/** The answer for a change to something that is no longer there. */
export function goneResponse() {
  return NextResponse.json({ error: "This was removed, maybe on another device. Reload the page." }, { status: 404 });
}

/** Runs an update by id, answering 404 rather than crashing when the row is gone. */
export async function updateOrGone<T>(run: () => Promise<T>): Promise<T | Response> {
  try {
    return await run();
  } catch (e) {
    if (isMissingRow(e)) return goneResponse();
    throw e;
  }
}

/** A calendar day as YYYY-MM-DD that exists, so it never becomes an Invalid Date in the database. */
export const calendarDay = z.string().refine(isCalendarDay, "Enter a real date.");
