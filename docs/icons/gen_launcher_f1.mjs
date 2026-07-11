// Финальный экспорт лаунчер-иконки Astra из варианта f1 «треугольник» (выбор владелицы 2026-07-12).
// Слои: full (legacy+web) / fg (эмблема, прозрачный) / bg (космос) / mono (белый).
// Рендер PNG всех плотностей через headless Chrome.
import { writeFileSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const C = 256, R = 150;
const pt = (deg, r = R) => ({
  x: +(C + r * Math.sin((deg * Math.PI) / 180)).toFixed(1),
  y: +(C - r * Math.cos((deg * Math.PI) / 180)).toFixed(1),
});
const P = (deg, r = R) => { const p = pt(deg, r); return `${p.x} ${p.y}`; };
const stroke = (color, w) => `fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const line = (a, b, color, w = 10) => `<path d="M${P(a)} L${P(b)}" ${stroke(color, w)}/>`;
const node = (deg, fill, rad) => { const p = pt(deg); return `<circle cx="${p.x}" cy="${p.y}" r="${rad}" fill="${fill}"/>`; };
const spark = (x, y, s, fill, op = 0.95) =>
  `<path d="M${x} ${y - s} c${s * 0.1} ${s * 0.58} ${s * 0.42} ${s * 0.9} ${s} ${s} c-${s * 0.58} ${s * 0.1} -${s * 0.9} ${s * 0.42} -${s} ${s} c-${s * 0.1} -${s * 0.58} -${s * 0.42} -${s * 0.9} -${s} -${s} c${s * 0.58} -${s * 0.1} ${s * 0.9} -${s * 0.42} ${s} -${s} z" fill="${fill}" opacity="${op}"/>`;
const ticks = (color, op) => {
  let out = `<g ${stroke(color, 6)} opacity="${op}">`;
  for (let d = 0; d < 360; d += 30) out += `<path d="M${P(d, 141)} L${P(d, 159)}"/>`;
  return out + '</g>';
};

const DEFS = `
  <radialGradient id="bg" cx="38%" cy="26%" r="95%">
    <stop offset="0%" stop-color="#1a2150"/><stop offset="52%" stop-color="#0d1230"/><stop offset="100%" stop-color="#070a1c"/>
  </radialGradient>
  <radialGradient id="av" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#9b8cff" stop-opacity="0.36"/><stop offset="100%" stop-color="#9b8cff" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="ac" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#7fd0ff" stop-opacity="0.24"/><stop offset="100%" stop-color="#7fd0ff" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#cdd6ff"/><stop offset="100%" stop-color="#9b8cff"/>
  </linearGradient>
  <radialGradient id="sun" cx="38%" cy="34%" r="80%">
    <stop offset="0%" stop-color="#fff4d6"/><stop offset="55%" stop-color="#f3c969"/><stop offset="100%" stop-color="#e8a03e"/>
  </radialGradient>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#f3c969" stop-opacity="0.5"/><stop offset="100%" stop-color="#f3c969" stop-opacity="0"/>
  </radialGradient>`;

const BG_LAYER = `
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="148" cy="118" r="195" fill="url(#av)"/>
  <circle cx="394" cy="410" r="215" fill="url(#ac)"/>
  <g fill="#cdd6ff"><circle cx="92" cy="128" r="4" opacity="0.75"/><circle cx="430" cy="96" r="3" opacity="0.55"/>
  <circle cx="452" cy="286" r="3.4" opacity="0.6"/><circle cx="70" cy="356" r="3" opacity="0.5"/><circle cx="368" cy="452" r="3.6" opacity="0.6"/></g>
  ${spark(400, 140, 15, '#cdd6ff')} ${spark(120, 416, 11, '#f3c969', 0.85)}`;

const sunP = pt(0);
const EMBLEM = `
  <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="url(#ring)" stroke-width="13"/>
  ${ticks('#cdd6ff', 0.55)}
  ${line(240, 60, '#7fd0ff', 11)}
  <path d="M${P(0)} L${P(120)} L${P(240)} Z" ${stroke('#f3c969', 13)}/>
  <circle cx="${sunP.x}" cy="${sunP.y}" r="37" fill="url(#halo)"/>
  <circle cx="${sunP.x}" cy="${sunP.y}" r="21" fill="url(#sun)"/>
  ${node(120, '#7fd0ff', 14)} ${node(240, '#cdd6ff', 14)} ${node(60, '#9b8cff', 10)}`;

const MONO = `
  <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#fff" stroke-width="13"/>
  ${line(240, 60, '#fff', 11)}
  <path d="M${P(0)} L${P(120)} L${P(240)} Z" ${stroke('#fff', 13)}/>
  <circle cx="${sunP.x}" cy="${sunP.y}" r="21" fill="#fff"/>
  ${node(120, '#fff', 14)} ${node(240, '#fff', 14)} ${node(60, '#fff', 10)}`;

const wrap = (inner, defs = true) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs ? `<defs>${DEFS}</defs>` : ''}${inner}</svg>`;

const SVGS = {
  full: wrap(BG_LAYER + EMBLEM),
  fg: wrap(EMBLEM),
  bg: wrap(BG_LAYER),
  mono: wrap(MONO, false),
};
mkdirSync('launcher_out', { recursive: true });
for (const [k, v] of Object.entries(SVGS)) writeFileSync(`launcher_out/f1-${k}.svg`, v);

// ── рендер PNG ──
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
async function render(svg, size, out, { round = false, transparent = false } = {}) {
  await p.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  const radius = round ? 'border-radius:50%;overflow:hidden;' : '';
  await p.setContent(`<body style="margin:0"><div style="width:${size}px;height:${size}px;${radius}">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body>`);
  await p.screenshot({ path: out, clip: { x: 0, y: 0, width: size, height: size }, omitBackground: transparent });
}
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [dpi, s] of Object.entries(LEGACY)) {
  await render(SVGS.full, s, `launcher_out/ic_launcher_${dpi}.png`);
  await render(SVGS.full, s, `launcher_out/ic_launcher_round_${dpi}.png`, { round: true, transparent: true });
}
for (const [dpi, s] of Object.entries(ADAPTIVE)) {
  await render(SVGS.fg, s, `launcher_out/ic_launcher_foreground_${dpi}.png`, { transparent: true });
  await render(SVGS.bg, s, `launcher_out/ic_launcher_bg_${dpi}.png`);
  await render(SVGS.mono, s, `launcher_out/ic_launcher_monochrome_${dpi}.png`, { transparent: true });
}
// веб: PWA/favicon SVG + большая PNG на всякий (og/512)
await render(SVGS.full, 512, 'launcher_out/icon-512.png');
await b.close();
console.log('done: legacy+round+adaptive(fg/bg/mono)+512');
