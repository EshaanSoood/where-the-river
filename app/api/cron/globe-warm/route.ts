import { NextResponse } from "next/server";

import { getCachedGlobeSnapshot, getPublicGlobeSnapshot } from "@/server/globe/publicSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Run every 4 minutes to keep the globe snapshot warm without piling load on Supabase.
export const event = {
  schedule: "*/4 * * * *",
};

const SAFETY_BUFFER_MS = 2 * 60 * 1000; // Refresh when cache has <2 minutes left.
const DEFAULT_BASE_URL = "https://riverflowseshaan.vercel.app";

async function warmSnapshot() {
  const startedAt = Date.now();
  const cached = getCachedGlobeSnapshot("all");
  const timeRemaining = cached ? cached.expiresAt - Date.now() : null;

  let warmed = false;
  let nodesCount: number | null = cached?.data?.nodes.length ?? null;
  let linksCount: number | null = cached?.data?.links.length ?? null;

  if (!cached || timeRemaining === null || timeRemaining <= SAFETY_BUFFER_MS) {
    const snapshot = await getPublicGlobeSnapshot("all");
    warmed = true;
    nodesCount = snapshot.nodes.length;
    linksCount = snapshot.links.length;
  }

  const boatStartedAt = Date.now();
  const baseUrl = (process.env.PUBLIC_APP_BASE_URL || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  const version = process.env.NEXT_PUBLIC_BOAT_ASSET_VERSION || "1";
  const boatUrl = new URL(`/paper_boat.glb?v=${encodeURIComponent(version)}`, baseUrl).toString();

  let boatStatus: number | null = null;
  let boatOk = false;
  try {
    const res = await fetch(boatUrl, { method: "HEAD", cache: "no-store" });
    boatStatus = res.status;
    boatOk = res.ok;
  } catch {
    boatStatus = null;
  }

  return {
    warmed,
    nodes: nodesCount,
    links: linksCount,
    durationMs: Date.now() - startedAt,
    boatWarmed: boatOk,
    boatStatus,
    boatDurationMs: Date.now() - boatStartedAt,
    cacheTimeRemainingMs: timeRemaining ?? null,
  };
}

export async function GET() {
  const result = await warmSnapshot();
  return NextResponse.json(result);
}

export default async function handler() {
  await warmSnapshot();
}

