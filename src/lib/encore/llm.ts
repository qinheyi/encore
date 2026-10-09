/**
 * Minimal OpenAI-compatible chat client for StepFun (阶跃星辰).
 * Docs: https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create
 *
 * The LLM is OFF unless ENCORE_LLM=stepfun and STEPFUN_API_KEY are both set,
 * so development never spends model credits by accident.
 */
export const STEPFUN_DEFAULT_BASE_URL = "https://api.stepfun.com/v1";
export const STEPFUN_DEFAULT_MODEL = "step-3.5-flash";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface ChatResult {
  message: ChatMessage;
  finishReason?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export function llmConfig() {
  const enabled = process.env.ENCORE_LLM === "stepfun" && !!process.env.STEPFUN_API_KEY;
  return {
    enabled,
    provider: "StepFun",
    baseUrl: (process.env.STEPFUN_BASE_URL || STEPFUN_DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: process.env.STEPFUN_MODEL || STEPFUN_DEFAULT_MODEL,
    maxSteps: Math.max(1, Math.min(4, Number(process.env.ENCORE_AGENT_MAX_STEPS) || 1)),
    disabledReason: !process.env.STEPFUN_API_KEY
      ? "STEPFUN_API_KEY not set"
      : process.env.ENCORE_LLM !== "stepfun"
        ? "LLM disabled (set ENCORE_LLM=stepfun to enable)"
        : undefined,
  };
}

export async function chatCompletion(opts: {
  messages: ChatMessage[];
  tools?: ToolDef[];
  jsonMode?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<ChatResult> {
  const cfg = llmConfig();
  const key = process.env.STEPFUN_API_KEY;
  if (!key) throw new Error("STEPFUN_API_KEY not set");
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: opts.messages,
    temperature: 0.4,
    max_tokens: opts.maxTokens ?? 12000,
  };
  if (opts.tools?.length) body.tools = opts.tools;
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? (Number(process.env.STEPFUN_TIMEOUT_MS) || 100_000));
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`StepFun HTTP ${res.status}: ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    const choice = data.choices?.[0];
    if (!choice?.message) throw new Error("StepFun response had no choices[0].message");
    return { message: choice.message, finishReason: choice.finish_reason, usage: data.usage };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("StepFun request timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull a JSON object out of model text (handles ```json fences / leading prose). */
export function extractJson(text: string | null | undefined): unknown {
  if (!text) throw new Error("empty model content");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in model content");
  return JSON.parse(raw.slice(start, end + 1));
}
