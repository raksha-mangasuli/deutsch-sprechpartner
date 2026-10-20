// Rendering helpers. All text goes through textContent, never innerHTML.

import { plainText } from './text.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A small speaker, drawn here so it follows the text colour.
function speakerIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', 'M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z');
  svg.append(path);
  return svg;
}

function renderEmpty({ hasKey, partner, suggestions, onStart, onSuggest }) {
  const box = el('div', 'empty');
  box.append(el('strong', '', `Hallo! Ich bin ${partner.name}.`));
  box.append(el('p', '', partner.intro));

  if (!hasKey) {
    box.append(el('p', '', 'Open the settings (gear icon) and add your Anthropic API key to begin.'));
    return box;
  }

  box.append(
    el('p', '', `Say hi, or tell ${partner.name} what you would like to talk about. You can change the subject at any time.`)
  );

  const start = el('button', 'primary', `Let ${partner.name} start`);
  start.type = 'button';
  start.addEventListener('click', onStart);
  box.append(start);

  const chips = el('div', 'chips');
  for (const s of suggestions) {
    const chip = el('button', 'chip', s.label);
    chip.type = 'button';
    chip.addEventListener('click', () => onSuggest(s.say));
    chips.append(chip);
  }
  box.append(chips);
  return box;
}

function renderUser(item) {
  const wrap = el('div', 'msg user');
  wrap.append(el('div', 'bubble', item.text));
  return wrap;
}

function renderBot(item, { onSpeak }) {
  const wrap = el('div', 'msg bot');
  // Same clean-up as the voice gets, so the bubble shows exactly what is spoken.
  wrap.append(el('div', 'bubble', plainText(item.reply)));

  const say = el('button', 'listen');
  say.type = 'button';
  say.title = 'Listen';
  say.setAttribute('aria-label', 'Listen to this message');
  say.append(speakerIcon());
  say.addEventListener('click', () => onSpeak(item.reply));
  wrap.append(say);

  if (item.correction) {
    const fix = el('div', 'fix');
    fix.append(el('b', '', 'Tip: '));
    fix.append(document.createTextNode(item.correction));
    wrap.append(fix);
  }
  return wrap;
}

export function renderChat(container, history, { hasKey, partner, suggestions, onStart, onSuggest, onSpeak }) {
  container.replaceChildren();
  const visible = history.filter((h) => !h.hidden);

  if (visible.length === 0) {
    container.append(renderEmpty({ hasKey, partner, suggestions, onStart, onSuggest }));
    return;
  }

  for (const item of visible) {
    container.append(item.role === 'user' ? renderUser(item) : renderBot(item, { onSpeak }));
  }
  scrollToEnd(container);
}

export function showTyping(container) {
  const wrap = el('div', 'msg bot typing-row');
  wrap.append(el('div', 'bubble typing', '...'));
  container.append(wrap);
  scrollToEnd(container);
}

export function showError(container, message) {
  container.append(el('div', 'error-msg', message));
  scrollToEnd(container);
}

export function scrollToEnd(container) {
  container.scrollTop = container.scrollHeight;
}

export function setStatus(node, message) {
  node.textContent = message || '';
  node.hidden = !message;
}

export function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
}
