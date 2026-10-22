// llm.ts — minimal Google Gemini API client using forced function calling,
// so the model must answer with JSON matching the tool's input_schema.
// The API key lives only in the edge function's secrets (never in the browser).
// Gemini has a free tier: get a key at https://aistudio.google.com/apikey.

export interface ToolDef {
  name: string
  description: string
  input_schema: unknown
}

export class LlmError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Used when the GEMINI_MODEL secret is not set; Google's alias for its current fast model on the free tier. */
export const DEFAULT_MODEL = 'gemini-flash-latest'

export async function callLlmTool(opts: {
  apiKey: string
  model: string
  system: string
  user: string
  tool: ToolDef
  maxTokens?: number
  fetchImpl?: typeof fetch
  /** Waits before each retry when Google is busy (5xx). */
  retryDelaysMs?: number[]
}): Promise<{ input: unknown; model: string }> {
  const model = opts.model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const send = () =>
    (opts.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: 'user', parts: [{ text: opts.user }] }],
        tools: [
          {
            functionDeclarations: [
              { name: opts.tool.name, description: opts.tool.description, parameters: opts.tool.input_schema },
            ],
          },
        ],
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [opts.tool.name] } },
        generationConfig: {
          temperature: 0,
          // 2.5 Flash can turn thinking off; newer models think by default, which spends the
          // output budget, so they get room for it on top of the answer.
          ...(model.startsWith('gemini-2.5-flash')
            ? { maxOutputTokens: opts.maxTokens ?? 1500, thinkingConfig: { thinkingBudget: 0 } }
            : { maxOutputTokens: (opts.maxTokens ?? 1500) + 8000 }),
        },
      }),
    })
  // Google answers 500/503 when the model is overloaded; that usually passes within seconds.
  let res = await send()
  for (const delay of opts.retryDelaysMs ?? [2000, 5000]) {
    if (res.status < 500) break
    await new Promise((r) => setTimeout(r, delay))
    res = await send()
  }
  if (!res.ok) throw new LlmError(res.status, `LLM API error ${res.status}`)
  const body = (await res.json()) as {
    modelVersion?: string
    candidates?: { content?: { parts?: { functionCall?: { name?: string; args?: unknown } }[] } }[]
  }
  const call = body.candidates?.[0]?.content?.parts?.find((p) => p.functionCall?.name === opts.tool.name)
  if (!call?.functionCall) throw new LlmError(502, 'Model returned no structured output')
  return { input: call.functionCall.args ?? {}, model: body.modelVersion ?? model }
}

/**
 * A plain-text answer that may use Google's own tools: url_context reads a
 * web page on Google's side (for pages that turn away a plain fetch) and
 * google_search looks things up. Returns '' when the model gives no text.
 */
export async function callLlmText(opts: {
  apiKey: string
  model: string
  system: string
  user: string
  googleTools?: ('url_context' | 'google_search')[]
  maxTokens?: number
  fetchImpl?: typeof fetch
  /** Waits before each retry when Google is busy (5xx). */
  retryDelaysMs?: number[]
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`
  const send = () =>
    (opts.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: 'user', parts: [{ text: opts.user }] }],
        tools: (opts.googleTools ?? []).map((t) => ({ [t]: {} })),
        generationConfig: { temperature: 0, maxOutputTokens: (opts.maxTokens ?? 3000) + 8000 },
      }),
    })
  let res = await send()
  for (const delay of opts.retryDelaysMs ?? [2000, 5000]) {
    if (res.status < 500) break
    await new Promise((r) => setTimeout(r, delay))
    res = await send()
  }
  if (!res.ok) {
    // Google's own reason (quota, unsupported tool…) goes into the logs.
    const detail = await res
      .json()
      .then((b: { error?: { message?: string } }) => b.error?.message ?? '')
      .catch(() => '')
    throw new LlmError(res.status, `LLM API error ${res.status}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`)
  }
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
  return (body.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim()
}
