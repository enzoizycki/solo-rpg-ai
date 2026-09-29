// Minimal Google Gemini (Generative Language API) client with streaming + tools.

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
}

// Ordered list of models to try; the first is the configured/default one.
// Fallbacks are used automatically when a model is overloaded (503) or gone (404).
function modelCandidates(): string[] {
  const primary = geminiModel();
  const fallbacks = ["gemini-flash-lite-latest", "gemini-3.5-flash", "gemini-flash-latest"];
  return [primary, ...fallbacks.filter((m) => m !== primary)];
}

export function hasGemini(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

// ---- Types ----
export type GeminiPart =
  | { text: string }
  | {
      functionCall: { name: string; args: Record<string, unknown>; id?: string };
      // Must live on the SAME part as the functionCall when echoed back.
      thoughtSignature?: string;
    }
  | {
      functionResponse: {
        name: string;
        response: Record<string, unknown>;
        id?: string;
      };
    }
  // thoughtSignature must be echoed back with function-call turns.
  | { thoughtSignature: string };

export type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

export type FunctionDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type StreamEvent =
  | { type: "text"; text: string }
  | {
      type: "functionCall";
      name: string;
      args: Record<string, unknown>;
      id?: string;
      thoughtSignature?: string;
    };

/**
 * Stream a Gemini generateContent call, yielding text chunks and function calls.
 */
export async function* streamGemini(opts: {
  system: string;
  contents: GeminiContent[];
  tools: FunctionDeclaration[];
  temperature?: number;
}): AsyncGenerator<StreamEvent> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY não configurada");

  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    tools:
      opts.tools.length > 0
        ? [{ functionDeclarations: opts.tools }]
        : undefined,
    generationConfig: {
      temperature: opts.temperature ?? 0.85,
    },
  };

  let res: Response | null = null;
  let lastErr = "";
  let lastStatus = 0;

  // Try each candidate model, retrying transient errors before moving on.
  outer: for (const model of modelCandidates()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`${BASE}/${model}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": key },
        body: JSON.stringify(body),
      });
      if (res.ok && res.body) break outer;
      lastStatus = res.status;
      lastErr = await res.text().catch(() => "");
      if (res.status === 503 || res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue; // retry same model
      }
      // 404 (model gone) or other: move to next candidate model.
      break;
    }
  }

  if (!res || !res.ok || !res.body) {
    throw new Error(`Gemini erro ${lastStatus || "?"}: ${lastErr.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;

      let json: {
        candidates?: {
          content?: { parts?: (Record<string, unknown>)[] };
        }[];
      };
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }

      const parts = json.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const thoughtSignature =
          typeof part.thoughtSignature === "string"
            ? part.thoughtSignature
            : undefined;
        if (typeof part.text === "string" && part.text.length > 0) {
          yield { type: "text", text: part.text };
        } else if (part.functionCall) {
          const fc = part.functionCall as {
            name: string;
            args?: Record<string, unknown>;
            id?: string;
          };
          yield {
            type: "functionCall",
            name: fc.name,
            args: fc.args ?? {},
            id: fc.id,
            thoughtSignature,
          };
        }
      }
    }
  }
}

/** Non-streaming helper for one-shot JSON tasks. */
export async function generateGemini(opts: {
  system?: string;
  prompt: string;
  temperature?: number;
  json?: boolean;
}): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY não configurada");

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.9,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  let res: Response | null = null;
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(`${BASE}/${geminiModel()}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": key },
      body: JSON.stringify(body),
    });
    if (res.ok) break;
    lastErr = await res.text().catch(() => "");
    if (res.status === 503 || res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    break;
  }
  if (!res || !res.ok) {
    throw new Error(`Gemini erro ${res?.status ?? "?"}: ${lastErr.slice(0, 300)}`);
  }
  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
}
