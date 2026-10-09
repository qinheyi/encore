import { NextResponse } from "next/server";
import { PlanRequest } from "@/lib/encore/types";
import { buildPlan } from "@/lib/encore/pipeline";
import { isMockMode } from "@/lib/qloo";
import { mockPlan } from "@/lib/mock/fixtures";

export async function POST(req: Request) {
  const parsed = PlanRequest.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    if (isMockMode()) return NextResponse.json(mockPlan(parsed.data.artist, parsed.data.shows));
    // TODO(agent): wrap pipeline functions as tools for an LLM agent (e.g. Vercel AI SDK)
    // that writes the per-city "why" + promo playbook, citing Qloo affinity numbers.
    return NextResponse.json(await buildPlan(parsed.data));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
