// Calls the Anthropic Messages API directly from the browser.
// This is acceptable for personal use because the key never leaves this
// device. Do not ship this to other people without a backend that hides the key.

import { plainText } from './text.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MAX_HISTORY = 24;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Keep the request small and make sure it starts with a user turn.
function trimHistory(messages) {
  let out = messages.slice(-MAX_HISTORY);
  while (out.length && out[0].role !== 'user') out = out.slice(1);
  return out;
}

export async function ask({ apiKey, model, system, messages, maxTokens = 600 }) {
  if (!apiKey) throw new ApiError('Add your API key in Settings first.', 0);

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: trimHistory(messages)
      })
    });
  } catch {
    throw new ApiError('No connection. Check your internet and try again.', 0);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message || '';
    } catch {
      /* ignore */
    }
    if (res.status === 401) throw new ApiError('The API key was rejected. Check it in Settings.', 401);
    if (res.status === 429) throw new ApiError('Rate limit reached. Wait a moment and try again.', 429);
    if (res.status === 400 && /credit/i.test(detail)) {
      throw new ApiError('Your API credit balance is empty. Add credit in the Anthropic Console.', 400);
    }
    if (res.status === 404) throw new ApiError('Model not found. Check the model name in Settings.', 404);
    throw new ApiError(detail || `Request failed (${res.status}).`, res.status);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return text;
}

// Pull the "reply" string out of JSON that is cut off or malformed, so the raw
// braces and key names are never shown or read aloud.
function salvageReply(raw) {
  const m = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)("|$)/);
  if (!m) return '';
  // A cut-off string can end in a lone backslash, which JSON.parse would reject.
  const body = m[1].replace(/\\$/, '');
  try {
    return JSON.parse('"' + body + '"');
  } catch {
    return body;
  }
}

// The model is asked for a single JSON object. Be forgiving if it adds fences
// or a short preamble, and fall back to treating the whole text as the reply.
export function parseTurn(raw) {
  const text = String(raw || '').trim();
  const fallback = { reply: plainText(text), correction: '', mistakes: [] };
  if (!text) return fallback;

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1) return fallback;

  if (end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      return {
        reply: plainText(obj.reply) || fallback.reply,
        correction: String(obj.correction || '').trim(),
        mistakes: Array.isArray(obj.mistakes) ? obj.mistakes.slice(0, 3) : []
      };
    } catch {
      /* fall through to salvage */
    }
  }

  const salvaged = plainText(salvageReply(text.slice(start)));
  return salvaged ? { ...fallback, reply: salvaged } : fallback;
}
