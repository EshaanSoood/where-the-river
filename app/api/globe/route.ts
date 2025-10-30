import { NextResponse } from "next/server";
import { getPublicGlobeSnapshot } from "@/server/globe/publicSnapshot";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") || "all";
    const snapshot = await getPublicGlobeSnapshot(filter === "30d" ? "30d" : filter === "7d" ? "7d" : "all");
    return NextResponse.json({ nodes: snapshot.nodes, links: snapshot.links }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}



