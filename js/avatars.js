// Tutor avatars. Each one is a flat illustration with a few animated parts drawn
// on top: eyelids for blinking and four open-mouth shapes for talking. All
// animation lives in css/avatar.css and is driven only by data-state on .avatar.

import { PERSONAS } from './personas.js';

const W = 300;
const H = 399;

export const AVATAR_STATES = ['idle', 'listening', 'thinking', 'speaking'];

// Coordinates are in image pixels. A mouth is the centre line of the smile:
// left end, right end and how far it sags below the ends.
const SOURCES = {
  g: {
    skin: '#f8c49e',
    eyes: [
      { cx: 118, cy: 143, rx: 6.5, ry: 10.5 },
      { cx: 184.5, cy: 144, rx: 7, ry: 10.5 }
    ],
    mouth: { lx: 132, ly: 187, rx: 171, ry: 186, sag: 7 },
    ink: '#3a2416',
    inner: '#4d1f16',
    tongue: '#e8806e'
  },
  i: {
    skin: '#fab68c',
    eyes: [],
    mouth: { lx: 131, ly: 191, rx: 168, ry: 191, sag: 6 },
    ink: '#d5764a',
    inner: '#8a3a28',
    tongue: '#ee9a85'
  },
  k: {
    skin: '#f8c39b',
    eyes: [
      { cx: 113, cy: 155.5, rx: 7.5, ry: 11.5 },
      { cx: 183, cy: 154, rx: 7.5, ry: 11.5 }
    ],
    mouth: { lx: 127, ly: 203, rx: 172, ry: 203, sag: 6.5 },
    ink: '#3a2416',
    inner: '#4d1f16',
    tongue: '#e8806e'
  }
};

function eyelid(eye, skin, ink) {
  const { cx, cy, rx, ry } = eye;
  const lineY = cy + ry * 0.2;
  return (
    `<g class="lid">` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx + 2}" ry="${ry + 2}" fill="${skin}"/>` +
    `<path d="M${cx - rx} ${lineY} Q${cx} ${lineY + 4} ${cx + rx} ${lineY}" fill="none" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/>` +
    `</g>`
  );
}

// Geometry shared by the mouth shapes.
function mouthParts(src) {
  const { lx, ly, rx, ry, sag } = src.mouth;
  const mid = (lx + rx) / 2;
  const half = (rx - lx) / 2;
  const topCtrl = (ly + ry) / 2 + sag * 2;
  return { lx, ly, rx, ry, sag, mid, half, topCtrl, baseY: (ly + ry) / 2 + sag };
}

// A soft skin patch that hides the smile line of the artwork under an open mouth.
function patch(src, p) {
  return `<ellipse cx="${p.mid}" cy="${p.baseY - 2}" rx="${p.half + 9}" ry="${p.sag + 12}" fill="${src.skin}" filter="url(#av-soft)"/>`;
}

// Open mouth whose top edge follows the smile line.
function lens(src, id, widthScale, depth, tongue, teeth) {
  const clip = `av-${id}-clip-${depth}`;
  const p = mouthParts(src);
  const lx = p.mid - p.half * widthScale;
  const rx = p.mid + p.half * widthScale;
  const topCtrl = p.topCtrl;
  const lowCtrl = topCtrl + depth * 2;
  const shape = `M${lx} ${p.ly} Q${p.mid} ${topCtrl} ${rx} ${p.ry} Q${p.mid} ${lowCtrl} ${lx} ${p.ly}Z`;
  const tongueY = p.baseY + depth - 1;
  return (
    patch(src, p) +
    `<path d="${shape}" fill="${src.inner}"/>` +
    (teeth
      ? `<path d="M${lx + 3} ${p.ly + 1} Q${p.mid} ${topCtrl + 2} ${rx - 3} ${p.ry + 1} L${rx - 5} ${p.ry + 4.5} Q${p.mid} ${topCtrl + 6.5} ${lx + 5} ${p.ly + 4.5}Z" fill="#fbf6ee" clip-path="url(#${clip})"/>`
      : '') +
    (tongue
      ? `<ellipse cx="${p.mid}" cy="${tongueY}" rx="${p.half * 0.5}" ry="${Math.max(2, depth * 0.4)}" fill="${src.tongue}" clip-path="url(#${clip})"/>`
      : '') +
    `<clipPath id="${clip}"><path d="${shape}"/></clipPath>` +
    `<path d="${shape}" fill="none" stroke="${src.ink}" stroke-width="4.4" stroke-linejoin="round"/>`
  );
}

// Round "o" mouth.
function round(src) {
  const p = mouthParts(src);
  const rx = p.half * 0.34;
  const ry = p.half * 0.4;
  const cy = p.baseY + 4;
  return (
    patch(src, p) +
    `<ellipse cx="${p.mid}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${src.inner}"/>` +
    `<ellipse cx="${p.mid}" cy="${cy + ry * 0.55}" rx="${rx * 0.6}" ry="${ry * 0.38}" fill="${src.tongue}"/>` +
    `<ellipse cx="${p.mid}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${src.ink}" stroke-width="4.2"/>`
  );
}

function buildSvg(id, src, image) {
  const lids = src.eyes.map((e) => eyelid(e, src.skin, src.ink)).join('');
  return (
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tutor avatar" focusable="false">` +
    `<defs><filter id="av-soft" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="1.4"/></filter></defs>` +
    `<g class="sway">` +
    `<image href="${image}" width="${W}" height="${H}"/>` +
    lids +
    // Closed mouth: the smile already in the artwork.
    `<g class="c"></g>` +
    `<g class="m m1">${lens(src, id, 0.82, 4, false, false)}</g>` +
    `<g class="m m2">${lens(src, id, 1, 10, true, true)}</g>` +
    `<g class="m m3">${round(src)}</g>` +
    `<g class="m m4">${lens(src, id, 1.1, 7, false, false)}</g>` +
    `</g></svg>`
  );
}

export const AVATARS = Object.fromEntries(
  Object.entries(SOURCES).map(([id, src]) => {
    const image = `assets/avatars/${id}.png`;
    return [id, { name: PERSONAS[id].name, image, svg: buildSvg(id, src, image) }];
  })
);

export const AVATAR_IDS = Object.keys(AVATARS);
export const DEFAULT_AVATAR = 'g';

// Draws an avatar into the container. This rebuilds the SVG, which restarts
// every animation, so call it once per avatar choice and never on state changes.
// The current state is carried over to the new avatar.
export function mountAvatar(container, id) {
  const key = AVATAR_IDS.includes(id) ? id : DEFAULT_AVATAR;
  const avatar = AVATARS[key];
  const previous = container.querySelector('.avatar')?.dataset.state;

  const frame = document.createElement('div');
  frame.className = 'avatar';
  frame.dataset.state = AVATAR_STATES.includes(previous) ? previous : 'idle';
  // The markup comes from the constants above, never from user input.
  frame.innerHTML = avatar.svg;

  container.replaceChildren(frame);
  container.dataset.avatar = key;
}

// Only sets data-state. Setting the value it already has is skipped so a
// running animation is never disturbed.
export function setAvatarState(container, state) {
  const frame = container.querySelector('.avatar');
  const next = AVATAR_STATES.includes(state) ? state : 'idle';
  if (frame && frame.dataset.state !== next) frame.dataset.state = next;
}
