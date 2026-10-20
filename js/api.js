// Calls the Anthropic Messages API directly from the browser.
// This is acceptable for personal use because the key never leaves this
// device. Do not ship this to other people without a backend that hides the key.

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

// The model is asked for a single JSON object. Be forgiving if it adds fences
// or a short preamble, and fall back to treating the whole text as the reply.
export function parseTurn(raw) {
  const fallback = { reply: String(raw || '').trim(), translation: '', correction: '', mistakes: [] };
  if (!raw) return fallback;

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return fallback;

  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    return {
      reply: String(obj.reply || '').trim() || fallback.reply,
      translation: String(obj.translation || '').trim(),
      correction: String(obj.correction || '').trim(),
      mistakes: Array.isArray(obj.mistakes) ? obj.mistakes.slice(0, 3) : []
    };
  } catch {
    return fallback;
  }
}
