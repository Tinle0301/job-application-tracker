// anthropic.ts — minimal Claude Messages API client using forced tool use,
// so the model must answer with JSON matching the tool's input_schema.
// The API key lives only in the edge function's secrets (never in the browser).

export const DEFAULT_MODEL = 'claude-sonnet-5-5'

export interface ToolDef {
  name: string
  description: string
  input_schema: unknown
}

export class ClaudeError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function callClaudeTool(opts: {
  apiKey: string
  model?: string
  system: string
  user: string
  tool: ToolDef
  maxTokens?: number
  fetchImpl?: typeof fetch
}): Promise<{ input: unknown; model: string }> {
  const model = opts.model || DEFAULT_MODEL
  const res = await (opts.fetchImpl ?? fetch)('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      tools: [opts.tool],
      tool_choice: { type: 'tool', name: opts.tool.name },
      messages: [{ role: 'user', content: opts.user }],
    }),
  })
  if (!res.ok) throw new ClaudeError(res.status, `Claude API error ${res.status}`)
  const body = (await res.json()) as { model?: string; content?: { type: string; name?: string; input?: unknown }[] }
  const block = body.content?.find((c) => c.type === 'tool_use' && c.name === opts.tool.name)
  if (!block) throw new ClaudeError(502, 'Model returned no structured output')
  return { input: block.input, model: body.model ?? model }
}
