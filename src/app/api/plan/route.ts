import { NextResponse } from "next/server";
import { PlanRequest } from "@/lib/encore/types";
import { buildTourPlan } from "@/lib/encore/plan";
import { isMockMode } from "@/lib/qloo";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Qloo playbooks + optional LLM

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = PlanRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const plan = await buildTourPlan(parsed.data);
    return NextResponse.json(plan);
  } catch (e) {
    const msg = (e as Error).message || "Plan failed";
    console.error("plan error:", msg, "mock=", isMockMode());
    const status = /not found/i.test(msg) ? 404 : /Invalid|must be/i.test(msg) ? 400 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
