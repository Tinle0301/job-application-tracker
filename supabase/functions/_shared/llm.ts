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
}): Promise<{ input: unknown; model: string }> {
  const model = opts.model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const res = await (opts.fetchImpl ?? fetch)(url, {
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
  if (!res.ok) throw new LlmError(res.status, `LLM API error ${res.status}`)
  const body = (await res.json()) as {
    modelVersion?: string
    candidates?: { content?: { parts?: { functionCall?: { name?: string; args?: unknown } }[] } }[]
  }
  const call = body.candidates?.[0]?.content?.parts?.find((p) => p.functionCall?.name === opts.tool.name)
  if (!call?.functionCall) throw new LlmError(502, 'Model returned no structured output')
  return { input: call.functionCall.args ?? {}, model: body.modelVersion ?? model }
}
