import { NextResponse } from "next/server";
import { PlanRequest } from "@/lib/encore/types";
import { buildTourPlan } from "@/lib/encore/plan";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // reasoning model + one tool round-trip

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
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
