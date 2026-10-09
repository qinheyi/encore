/**
 * Minimal OpenAI-compatible chat client with two providers:
 *
 * - StepFun (阶跃星辰)  https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create
 * - MiniMax (China)     https://platform.minimaxi.com/docs/api-reference/text-chat-openai
 *
 * The LLM is OFF unless ENCORE_LLM is "stepfun" or "minimax" AND that provider's
 * key is set, so development never spends credits by accident.
 */
export type ProviderId = "stepfun" | "minimax";

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
  [extra: string]: unknown; // provider-specific fields we must echo back (e.g. MiniMax reasoning_details)
}
export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface ChatResult {
  /** Assistant message exactly as returned (echo this back in tool loops). */
  message: ChatMessage;
  /** Answer text with any <think>…</think> reasoning removed. */
  text: string;
  finishReason?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface ProviderSpec {
  id: ProviderId;
  label: string;
  keyEnv: string;
  baseUrl: string;
  model: string;
  /** Supports response_format {type:"json_object"}. */
  jsonMode: boolean;
  /** Extra request-body fields. */
  extraBody: (model: string) => Record<string, unknown>;
  tokenParam: "max_tokens" | "max_completion_tokens";
  /** Echo the raw assistant message (incl. reasoning fields) back in tool loops. */
  echoRawAssistant: boolean;
}

const PROVIDERS: Record<ProviderId, () => ProviderSpec> = {
  stepfun: () => ({
    id: "stepfun",
    label: "StepFun",
    keyEnv: "STEPFUN_API_KEY",
    baseUrl: process.env.STEPFUN_BASE_URL || "https://api.stepfun.com/v1",
    model: process.env.STEPFUN_MODEL || "step-3.5-flash",
    jsonMode: true,
    extraBody: () => ({}),
    tokenParam: "max_tokens",
    echoRawAssistant: false,
  }),
  minimax: () => ({
    id: "minimax",
    label: "MiniMax",
    keyEnv: "MINIMAX_API_KEY",
    // China site per current docs; https://api.minimaxi.com/v1 also answers.
    baseUrl: process.env.MINIMAX_BASE_URL || "https://api.minimax.cn/v1",
    model: process.env.MINIMAX_MODEL || "MiniMax-M3",
    jsonMode: false, // response_format is not in MiniMax's schema — JSON is enforced by prompt + parser
    extraBody: (model) => ({
      reasoning_split: true, // keep thinking out of `content` (we still strip <think> defensively)
      // Only MiniMax-M3 honours "disabled" (faster/cheaper); M2.x always think.
      ...(/^MiniMax-M3$/i.test(model) && process.env.MINIMAX_THINKING !== "adaptive" ? { thinking: { type: "disabled" } } : {}),
    }),
    tokenParam: "max_completion_tokens",
    echoRawAssistant: true,
  }),
};

export function llmConfig() {
  const choice = (process.env.ENCORE_LLM || "").toLowerCase();
  const id: ProviderId | undefined = choice === "stepfun" || choice === "minimax" ? choice : undefined;
  const spec = id ? PROVIDERS[id]() : undefined;
  const hasKey = !!(spec && process.env[spec.keyEnv]);
  return {
    enabled: !!spec && hasKey,
    spec,
    provider: spec?.label,
    model: spec?.model,
    baseUrl: spec?.baseUrl.replace(/\/+$/, ""),
    maxSteps: Math.max(1, Math.min(4, Number(process.env.ENCORE_AGENT_MAX_STEPS) || 1)),
    disabledReason: !spec
      ? "LLM disabled (set ENCORE_LLM=minimax or stepfun to enable)"
      : !hasKey
        ? `${spec.keyEnv} not set`
        : undefined,
  };
}

/** Remove <think>…</think> blocks (and a dangling unclosed <think>) from model text. */
export function stripThinking(text: string | null | undefined): string {
  if (!text) return "";
  let t = text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "");
  // Stray closing tag (opening tag cut off): keep only what follows the last one.
  let end = -1;
  for (const m of t.matchAll(/<\/think(?:ing)?>/gi)) end = (m.index ?? 0) + m[0].length;
  if (end >= 0) t = t.slice(end);
  // Unclosed opening tag: the rest is reasoning — drop it.
  const open = t.search(/<think(?:ing)?>/i);
  if (open >= 0) t = t.slice(0, open);
  return t.trim();
}

export async function chatCompletion(opts: {
  messages: ChatMessage[];
  tools?: ToolDef[];
  jsonMode?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<ChatResult> {
  const cfg = llmConfig();
  if (!cfg.spec) throw new Error("no LLM provider selected");
  const spec = cfg.spec;
  const key = process.env[spec.keyEnv];
  if (!key) throw new Error(`${spec.keyEnv} not set`);

  const body: Record<string, unknown> = {
    model: spec.model,
    messages: opts.messages,
    temperature: 0.7,
    [spec.tokenParam]: opts.maxTokens ?? 12000,
    ...spec.extraBody(spec.model),
  };
  if (opts.tools?.length) body.tools = opts.tools;
  if (opts.jsonMode && spec.jsonMode) body.response_format = { type: "json_object" };

  const ctrl = new AbortController();
  const envTimeout = Number(process.env.LLM_TIMEOUT_MS || process.env.STEPFUN_TIMEOUT_MS) || 110_000;
  const timer = setTimeout(() => ctrl.abort(), Math.min(envTimeout, opts.timeoutMs ?? envTimeout));
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`${spec.label} HTTP ${res.status}: ${raw.slice(0, 300)}`);
    const data = JSON.parse(raw);
    // MiniMax reports some errors (e.g. 1008 insufficient balance) as HTTP 200 + base_resp.
    const br = data.base_resp;
    if (br && typeof br.status_code === "number" && br.status_code !== 0) {
      throw new Error(`${spec.label} error ${br.status_code}: ${String(br.status_msg ?? "").slice(0, 200)}`);
    }
    const choice = data.choices?.[0];
    if (!choice?.message) throw new Error(`${spec.label} response had no choices[0].message`);
    const message = choice.message as ChatMessage;
    return {
      message: spec.echoRawAssistant ? message : { role: "assistant", content: message.content ?? "", tool_calls: message.tool_calls },
      text: stripThinking(typeof message.content === "string" ? message.content : ""),
      finishReason: choice.finish_reason,
      usage: data.usage,
    };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error(`${spec.label} request timed out`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull the agent's JSON object out of model text. Handles <think> blocks,
 * ```json fences, leading/trailing prose, several brace groups and trailing commas.
 */
export function extractJson(text: string | null | undefined): unknown {
  const cleaned = stripThinking(text);
  if (!cleaned) throw new Error("empty model content");
  const candidates: string[] = [];
  for (const m of cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidates.push(m[1]);
  candidates.push(cleaned);

  for (const c of candidates) {
    for (const obj of balancedObjects(c)) {
      for (const attempt of [obj, obj.replace(/,\s*([}\]])/g, "$1")]) {
        try {
          const v = JSON.parse(attempt);
          if (v && typeof v === "object" && !Array.isArray(v)) return v;
        } catch { /* try next */ }
      }
    }
  }
  throw new Error("no JSON object in model content");
}

/** Yield top-level {...} substrings, largest-first by position, respecting strings/escapes. */
function* balancedObjects(s: string): Generator<string> {
  for (let start = s.indexOf("{"); start >= 0; start = s.indexOf("{", start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) { yield s.slice(start, i + 1); break; }
    }
  }
}
