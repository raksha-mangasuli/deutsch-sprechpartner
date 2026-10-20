// Text clean-up shared by the chat bubble and the voice, so what is written is
// what is spoken. A voice reads emoji by name and says "asterisk" for markdown,
// which sounds like words nobody wrote.

const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️⃣]/gu;
const URL = /https?:\/\/\S+|www\.\S+/gi;
const MARKUP = /[*_`#~^|<>\\]/g;
const ARROWS = /(?:-+>|=+>|<-+|<=+|[←-⇿⟵-⟿])/g;

export function plainText(text) {
  return String(text || '')
    .replace(URL, ' ')
    .replace(EMOJI, '')
    .replace(ARROWS, ' ')
    .replace(MARKUP, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}
