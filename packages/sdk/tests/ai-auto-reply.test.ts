import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callClaudeAutoReply, resolveSystemPrompt } from '../../../apps/worker/src/services/ai-auto-reply.js'

describe('resolveSystemPrompt', () => {
  it('DB setting takes precedence over env var', () => {
    const result = resolveSystemPrompt('DB prompt', 'env prompt')
    expect(result).toBe('DB prompt')
  })

  it('env var used when DB setting is null', () => {
    const result = resolveSystemPrompt(null, 'env prompt')
    expect(result).toBe('env prompt')
  })

  it('env var used when DB setting is empty string', () => {
    const result = resolveSystemPrompt('', 'env prompt')
    expect(result).toBe('env prompt')
  })

  it('default prompt used when both are null/empty', () => {
    const result = resolveSystemPrompt(null, null)
    expect(result).toContain('アシスタント')
  })

  it('default prompt used when both are undefined', () => {
    const result = resolveSystemPrompt(undefined, undefined)
    expect(result).toContain('アシスタント')
  })

  it('trims whitespace', () => {
    const result = resolveSystemPrompt('  DB prompt  ', undefined)
    expect(result).toBe('DB prompt')
  })
})

describe('callClaudeAutoReply', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns text from Anthropic API response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: 'text', text: 'こんにちは！' }],
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await callClaudeAutoReply({
      apiKey: 'test-key',
      systemPrompt: 'You are helpful.',
      userMessage: 'Hello',
    })

    expect(result.text).toBe('こんにちは！')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    )
  })

  it('uses provided model', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: 'text', text: 'OK' }],
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await callClaudeAutoReply({
      apiKey: 'test-key',
      model: 'claude-sonnet-4-5',
      systemPrompt: 'System',
      userMessage: 'Hello',
    })

    const callArg = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(callArg.model).toBe('claude-sonnet-4-5')
  })

  it('defaults to claude-haiku-4-5 when model is not provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: 'text', text: 'OK' }],
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await callClaudeAutoReply({
      apiKey: 'test-key',
      systemPrompt: 'System',
      userMessage: 'Hello',
    })

    const callArg = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(callArg.model).toBe('claude-haiku-4-5')
  })

  it('throws on non-ok API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      }),
    )

    await expect(
      callClaudeAutoReply({
        apiKey: 'bad-key',
        systemPrompt: 'System',
        userMessage: 'Hello',
      }),
    ).rejects.toThrow('Anthropic API error 401')
  })

  it('throws when no text block in response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: [] }),
      }),
    )

    await expect(
      callClaudeAutoReply({
        apiKey: 'test-key',
        systemPrompt: 'System',
        userMessage: 'Hello',
      }),
    ).rejects.toThrow('No text block')
  })
})
