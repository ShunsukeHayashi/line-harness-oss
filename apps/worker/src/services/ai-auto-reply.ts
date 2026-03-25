/**
 * AI auto-reply service — calls Anthropic Claude to generate a response
 * for incoming LINE messages when no keyword rule matched.
 */

export interface CallClaudeOptions {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  userMessage: string;
}

export interface CallClaudeResult {
  text: string;
}

/**
 * Calls the Anthropic Messages API (non-streaming) and returns the reply text.
 * Throws on network or API errors.
 */
export async function callClaudeAutoReply(
  options: CallClaudeOptions,
): Promise<CallClaudeResult> {
  const { apiKey, model = 'claude-haiku-4-5', systemPrompt, userMessage } = options;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const json = await res.json<{
    content: { type: string; text: string }[];
  }>();

  const textBlock = json.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('No text block in Anthropic response');
  }

  return { text: textBlock.text };
}

const DEFAULT_SYSTEM_PROMPT =
  'あなたは親切なアシスタントです。ユーザーのメッセージに日本語で簡潔に回答してください。';

/**
 * Builds the system prompt to use: prefers DB setting, then env var, then default.
 */
export function resolveSystemPrompt(
  dbSystemPrompt: string | null | undefined,
  envSystemPrompt: string | null | undefined,
): string {
  if (dbSystemPrompt && dbSystemPrompt.trim()) return dbSystemPrompt.trim();
  if (envSystemPrompt && envSystemPrompt.trim()) return envSystemPrompt.trim();
  return DEFAULT_SYSTEM_PROMPT;
}
