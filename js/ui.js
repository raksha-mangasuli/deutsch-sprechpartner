// Rendering helpers. All text goes through textContent, never innerHTML.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderEmpty({ hasKey, onStart }) {
  const box = el('div', 'empty');
  box.append(el('strong', '', 'Hallo! Bereit zum Sprechen?'));
  box.append(
    el(
      'p',
      '',
      hasKey
        ? 'Pick a topic, then let your partner open the conversation, or just type or speak your first sentence.'
        : 'Open the settings (gear icon) and add your Anthropic API key to begin.'
    )
  );
  if (hasKey) {
    const btn = el('button', 'primary', 'Start the conversation');
    btn.type = 'button';
    btn.addEventListener('click', onStart);
    box.append(btn);
  }
  return box;
}

function renderUser(item) {
  const wrap = el('div', 'msg user');
  wrap.append(el('div', 'bubble', item.text));
  return wrap;
}

function renderBot(item, { onSpeak }) {
  const wrap = el('div', 'msg bot');
  wrap.append(el('div', 'bubble', item.reply));

  const tools = el('div', 'tools');

  const say = el('button', 'tool', 'Listen');
  say.type = 'button';
  say.addEventListener('click', () => onSpeak(item.reply));
  tools.append(say);

  if (item.translation) {
    const tr = el('div', 'translation', item.translation);
    tr.hidden = !item.open;
    const toggle = el('button', 'tool', item.open ? 'Hide English' : 'English');
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      item.open = !item.open;
      tr.hidden = !item.open;
      toggle.textContent = item.open ? 'Hide English' : 'English';
    });
    tools.append(toggle);
    wrap.append(tools, tr);
  } else {
    wrap.append(tools);
  }

  if (item.correction) {
    const fix = el('div', 'fix');
    fix.append(el('b', '', 'Tip: '));
    fix.append(document.createTextNode(item.correction));
    wrap.append(fix);
  }
  return wrap;
}

export function renderChat(container, history, { hasKey, onStart, onSpeak }) {
  container.replaceChildren();
  const visible = history.filter((h) => !h.hidden);

  if (visible.length === 0) {
    container.append(renderEmpty({ hasKey, onStart }));
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
