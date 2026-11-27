import * as THREE from 'three';
import { emblemHalo, frameBody, frameDefs, frameFinish, mix } from '../art/cardFrame';
import { crestHooded } from '../art/emblems';
import { Noise2 } from '../gfx/noise';
import type { Mats } from '../world/materials';
import { box, cyl } from '../world/props';
import type { Mutation } from './catalog';

// ====================================================================== heraldic crests (SVG, centred at 0,0, ~100 units)

export function crest(kind: string, c: string): string {
  switch (kind) {
    case 'moon':
      return `<path d="M 14,-44 A 46 46 0 1 0 14,44 A 34 34 0 1 1 14,-44 Z" fill="${c}"/>`;
    case 'stag':
      return `<g fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"><path d="M -10,-4 C -30,-20 -34,-40 -30,-56 M -24,-30 L -44,-38 M -30,-46 L -46,-58 M 10,-4 C 30,-20 34,-40 30,-56 M 24,-30 L 44,-38 M 30,-46 L 46,-58"/></g><path d="M -16,-8 C -18,14 -8,40 0,48 C 8,40 18,14 16,-8 C 8,-14 -8,-14 -16,-8 Z" fill="${c}"/><path d="M -16,-6 L -30,-12 L -18,2 Z M 16,-6 L 30,-12 L 18,2 Z" fill="${c}"/>`;
    case 'raven':
      return `<path d="M -46,10 C -30,-8 -10,-16 10,-14 C 22,-30 36,-34 46,-28 L 34,-22 C 40,-16 38,-6 30,0 C 40,6 44,18 36,30 C 20,18 4,16 -10,22 C -22,28 -36,30 -46,40 C -40,28 -42,18 -46,10 Z" fill="${c}"/><circle cx="30" cy="-24" r="3" fill="#000" opacity=".6"/>`;
    case 'crown':
      return `<path d="M -42,24 L -46,-22 L -22,2 L 0,-38 L 22,2 L 46,-22 L 42,24 Z" fill="${c}"/><rect x="-44" y="26" width="88" height="14" rx="4" fill="${c}"/><circle cx="0" cy="-42" r="6" fill="${c}"/><circle cx="-46" cy="-26" r="5" fill="${c}"/><circle cx="46" cy="-26" r="5" fill="${c}"/>`;
    case 'dragon':
      return `<path d="M -40,40 C -40,10 -20,-6 0,-10 L -10,-22 C 6,-24 18,-16 26,-6 L 44,-2 C 46,4 42,8 36,8 L 22,10 L 34,18 C 30,24 22,24 16,20 C 10,30 0,38 -6,48 Z" fill="${c}"/><path d="M -6,-14 L -22,-40 L 2,-20 Z M 8,-18 L 2,-46 L 16,-20 Z" fill="${c}"/>`;
    case 'snowflake':
      return `<g stroke="${c}" stroke-width="6" stroke-linecap="round" fill="none">${[0, 60, 120].map((a) => `<g transform="rotate(${a})"><path d="M 0,-48 L 0,48 M -12,-36 L 0,-26 L 12,-36 M -12,36 L 0,26 L 12,36"/></g>`).join('')}</g>`;
    case 'sun':
      return `<circle r="22" fill="${c}"/>${Array.from({ length: 12 }, (_, i) => `<path transform="rotate(${i * 30})" d="M -6,-28 L 0,${i % 2 ? -44 : -52} L 6,-28 Z" fill="${c}"/>`).join('')}`;
    case 'eye':
      return `<path d="M -48,0 C -24,-32 24,-32 48,0 C 24,32 -24,32 -48,0 Z" fill="${c}"/><circle r="18" fill="#000"/><circle r="9" fill="${c}"/><circle cx="-6" cy="-6" r="4" fill="#fff"/>`;
    case 'stag2':
      return crest('stag', c);
    case 'none':
      return '';
    case 'hooded':
    default:
      return `<g transform="scale(0.36) translate(-250,-330)">${crestHooded(c)}</g>`;
  }
}

function pattern(kind: string, accent: string): string {
  switch (kind) {
    case 'stars':
      return `<pattern id="pat" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M 15,8 L 17,14 L 23,15 L 17,17 L 15,23 L 13,17 L 7,15 L 13,14 Z M 45,38 L 46.5,42 L 51,43 L 46.5,44.5 L 45,49 L 43.5,44.5 L 39,43 L 43.5,42 Z" fill="${accent}" opacity="0.3"/><circle cx="40" cy="12" r="1.5" fill="${accent}" opacity="0.4"/><circle cx="10" cy="44" r="1.2" fill="${accent}" opacity="0.4"/></pattern>`;
    case 'vines':
      return `<pattern id="pat" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M 0,40 C 20,10 60,70 80,40" fill="none" stroke="${accent}" stroke-width="2" opacity="0.28"/><ellipse cx="22" cy="30" rx="7" ry="3.5" transform="rotate(-30 22 30)" fill="${accent}" opacity="0.28"/><ellipse cx="58" cy="50" rx="7" ry="3.5" transform="rotate(-30 58 50)" fill="${accent}" opacity="0.28"/></pattern>`;
    case 'fleur':
      return `<pattern id="pat" width="56" height="64" patternUnits="userSpaceOnUse"><g fill="${accent}" opacity="0.22"><path transform="translate(14,16) scale(1.1)" d="M 0,-11 C 3,-7 4,-3 2,1 C 5,-1 9,-1 10,3 C 8,4 5,4 3,3 L 2,6 L 5,6 L 5,8 L -5,8 L -5,6 L -2,6 L -3,3 C -5,4 -8,4 -10,3 C -9,-1 -5,-1 -2,1 C -4,-3 -3,-7 0,-11 Z"/><path transform="translate(42,48) scale(1.1)" d="M 0,-11 C 3,-7 4,-3 2,1 C 5,-1 9,-1 10,3 C 8,4 5,4 3,3 L 2,6 L 5,6 L 5,8 L -5,8 L -5,6 L -2,6 L -3,3 C -5,4 -8,4 -10,3 C -9,-1 -5,-1 -2,1 C -4,-3 -3,-7 0,-11 Z"/></g></pattern>`;
    case 'flames':
      return `<pattern id="pat" width="50" height="70" patternUnits="userSpaceOnUse"><path d="M 25,64 C 10,50 14,36 22,26 C 22,36 28,40 30,34 C 34,44 40,50 25,64 Z M 0,30 C -8,22 -4,12 2,6 C 2,14 6,16 8,12 C 10,20 12,24 0,30 Z M 50,30 C 42,22 46,12 52,6 C 52,14 56,16 58,12 C 60,20 62,24 50,30 Z" fill="${accent}" opacity="0.26"/></pattern>`;
    case 'snow':
      return `<pattern id="pat" width="70" height="70" patternUnits="userSpaceOnUse"><g transform="translate(18,18) scale(0.22)">${crest('snowflake', accent)}</g><g transform="translate(52,52) scale(0.16)">${crest('snowflake', accent)}</g></pattern>`;
    case 'sunburst':
      return `<pattern id="pat" width="500" height="700" patternUnits="userSpaceOnUse">${Array.from({ length: 36 }, (_, i) => `<path transform="translate(250,340) rotate(${i * 10})" d="M -6,0 L 0,-460 L 6,0 Z" fill="${accent}" opacity="${i % 2 ? 0.08 : 0.16}"/>`).join('')}</pattern>`;
    case 'eyes':
      return `<pattern id="pat" width="60" height="44" patternUnits="userSpaceOnUse"><g transform="translate(15,11) scale(0.2)">${crest('eye', accent)}</g><g transform="translate(45,33) scale(0.2)">${crest('eye', accent)}</g></pattern>`;
    case 'lattice':
    default:
      return `<pattern id="pat" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M 0,0 L 40,0 M 0,0 L 0,40" stroke="${accent}" stroke-width="1.6" opacity="0.22"/><circle cx="20" cy="20" r="2.2" fill="${accent}" opacity="0.28"/></pattern>`;
  }
}

function mutationLayer(m: Mutation, w: number, h: number, rx: number): string {
  switch (m) {
    case 'gilded':
      return `<defs><linearGradient id="gild" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c0" stop-opacity="0"/><stop offset="0.45" stop-color="#fff6c0" stop-opacity="0"/><stop offset="0.5" stop-color="#fff2b0" stop-opacity="0.55"/><stop offset="0.55" stop-color="#fff6c0" stop-opacity="0"/><stop offset="1" stop-color="#fff6c0" stop-opacity="0"/></linearGradient></defs>
        <rect width="${w}" height="${h}" rx="${rx}" fill="url(#gild)"/>
        ${Array.from({ length: 70 }, () => `<circle cx="${(Math.random() * w).toFixed(0)}" cy="${(Math.random() * h).toFixed(0)}" r="${(0.8 + Math.random() * 2).toFixed(1)}" fill="#ffe7a0" opacity="${(0.4 + Math.random() * 0.5).toFixed(2)}"/>`).join('')}`;
    case 'mosaic': {
      const cells: string[] = [];
      const cols = ['#e05a4a', '#4a8ae0', '#e0c04a', '#5ac06a', '#a05ae0', '#e08a3a'];
      const s = 70;
      for (let y = 0; y < h; y += s)
        for (let x = 0; x < w; x += s) {
          const jx = (Math.random() - 0.5) * 20;
          const jy = (Math.random() - 0.5) * 20;
          const c = cols[Math.floor(Math.random() * cols.length)];
          cells.push(`<path d="M ${x},${y} L ${x + s + jx},${y + jy} L ${x + s},${y + s} L ${x + jy},${y + s + jx} Z" fill="${c}" opacity="0.2" stroke="#120806" stroke-width="3" stroke-opacity="0.5"/>`);
        }
      return `<clipPath id="mclip"><rect width="${w}" height="${h}" rx="${rx}"/></clipPath><g clip-path="url(#mclip)">${cells.join('')}</g>`;
    }
    case 'prismatic':
      return `<defs><linearGradient id="prism" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4a6a"/><stop offset="0.2" stop-color="#ffb84a"/><stop offset="0.4" stop-color="#f6ff6a"/><stop offset="0.6" stop-color="#5aff9a"/><stop offset="0.8" stop-color="#5ab0ff"/><stop offset="1" stop-color="#c05aff"/></linearGradient></defs>
        <rect width="${w}" height="${h}" rx="${rx}" fill="url(#prism)" opacity="0.34" style="mix-blend-mode:screen"/>`;
    default:
      return '';
  }
}

// ====================================================================== sleeves

export function sleeveSVG(style: Record<string, string>, mut: Mutation = 'basic'): string {
  const { field, shade, accent, pattern: pat, crest: cr } = style;
  const gold = mut === 'gilded' ? '#f6d270' : accent;
  const frame = {
    color: field,
    shade,
    patternId: 'pat',
    rim: mut === 'gilded' ? '#f6d26e' : undefined,
  };
  const ring = mix(shade, '#000000', 0.3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 700" width="500" height="700">
    <defs>${pattern(pat, gold)}${frameDefs(frame)}</defs>
    ${frameBody(frame)}
    ${emblemHalo(accent, 250, 350, 200)}
    <g filter="url(#kicon)">
      <circle cx="250" cy="350" r="156" fill="#fbf9f4"/>
      <circle cx="250" cy="350" r="134" fill="${shade}"/>
      ${Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        return `<circle cx="${(250 + Math.cos(a) * 145).toFixed(1)}" cy="${(350 + Math.sin(a) * 145).toFixed(1)}" r="3.6" fill="${ring}"/>`;
      }).join('')}
      <g transform="translate(250,350) scale(2.15)">${crest(cr, gold)}</g>
    </g>
    ${frameFinish(frame)}
    ${mutationLayer(mut, 500, 700, 44)}
  </svg>`;
}

function svgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

/** Rasterise any SVG to a canvas. */
export async function svgCanvas(svg: string, w: number, h: number): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const img = await svgImage(svg);
  c.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return c;
}

export async function sleeveCanvas(style: Record<string, string>, mut: Mutation, width = 512): Promise<HTMLCanvasElement> {
  return svgCanvas(sleeveSVG(style, mut), width, Math.round(width * 1.4));
}

// ====================================================================== playmats

export function feltCanvas(style: Record<string, string>, mut: Mutation, size = 1024): HTMLCanvasElement {
  const n = new Noise2(33);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const hex = parseInt(style.base.slice(1), 16);
  const base = { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
  const cx = size / 2;
  const leather = style.print === 'knots' || style.print === 'map';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fine = n.value(x / 1.6, y / 1.6, size / 1.6, size / 1.6);
      const mid = n.fbm(x / 60, y / 60, 4, size / 60, size / 60);
      const r = Math.hypot(x - cx, y - cx) / cx;
      const wear = Math.max(0, 1 - r * 1.4) * 0.12;
      const v = 0.72 + (fine - 0.5) * (leather ? 0.08 : 0.22) + (mid - 0.5) * 0.28 + wear;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, base.r * 255 * v * 1.05);
      img.data[i + 1] = Math.min(255, base.g * 255 * v * 1.05);
      img.data[i + 2] = Math.min(255, base.b * 255 * v * 1.05);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.translate(cx, cx);
  const ring = style.ring;
  const dark = 'rgba(0,0,0,0.35)';
  switch (style.print) {
    case 'stars':
      for (let i = 0; i < 160; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * size * 0.44;
        ctx.fillStyle = `rgba(230,236,255,${0.3 + Math.random() * 0.6})`;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 1 + Math.random() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(200,210,240,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.33, 0.3, 2.6);
      ctx.stroke();
      break;
    case 'knots':
      ctx.strokeStyle = 'rgba(30,15,5,0.45)';
      ctx.lineWidth = size * 0.012;
      for (let k = 0; k < 12; k++) {
        ctx.save();
        ctx.rotate((k / 12) * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.36, size * 0.04, size * 0.07, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      break;
    case 'fleur':
      ctx.fillStyle = 'rgba(240,200,96,0.25)';
      ctx.font = `${size * 0.06}px serif`;
      ctx.textAlign = 'center';
      for (let k = 0; k < 16; k++) {
        ctx.save();
        ctx.rotate((k / 16) * Math.PI * 2);
        ctx.fillText('⚜', 0, -size * 0.37);
        ctx.restore();
      }
      break;
    case 'map':
      ctx.strokeStyle = 'rgba(90,50,20,0.45)';
      ctx.lineWidth = 3;
      for (let k = 0; k < 7; k++) {
        ctx.beginPath();
        let x = -size * 0.4;
        let y = (Math.random() - 0.5) * size * 0.6;
        ctx.moveTo(x, y);
        while (x < size * 0.4) {
          x += 20 + Math.random() * 30;
          y += (Math.random() - 0.5) * 40;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(90,50,20,0.55)';
      ctx.font = `italic ${size * 0.04}px "Alegreya"`;
      ctx.textAlign = 'center';
      ctx.fillText('Here be Hands', 0, size * 0.18);
      ctx.strokeStyle = 'rgba(120,20,10,0.6)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-20, -20);
      ctx.lineTo(20, 20);
      ctx.moveTo(20, -20);
      ctx.lineTo(-20, 20);
      ctx.stroke();
      break;
    case 'runes':
      ctx.fillStyle = 'rgba(255,74,42,0.55)';
      ctx.font = `${size * 0.05}px serif`;
      ctx.textAlign = 'center';
      const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
      for (let k = 0; k < 24; k++) {
        ctx.save();
        ctx.rotate((k / 24) * Math.PI * 2);
        ctx.fillText(runes[k], 0, -size * 0.4);
        ctx.restore();
      }
      break;
    case 'snow':
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 40; k++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * size * 0.42;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        const s = 6 + Math.random() * 10;
        for (let j = 0; j < 3; j++) {
          ctx.beginPath();
          const b = (j / 3) * Math.PI;
          ctx.moveTo(x - Math.cos(b) * s, y - Math.sin(b) * s);
          ctx.lineTo(x + Math.cos(b) * s, y + Math.sin(b) * s);
          ctx.stroke();
        }
      }
      break;
    case 'arcs':
    default:
      ctx.strokeStyle = dark;
      ctx.fillStyle = dark;
      ctx.lineCap = 'round';
      ctx.lineWidth = size * 0.035;
      const R = size * 0.33;
      for (let k = 0; k < 2; k++) {
        const a0 = k * Math.PI + 0.35;
        const a1 = a0 + Math.PI - 0.95;
        ctx.beginPath();
        ctx.arc(0, 0, R, a0, a1);
        ctx.stroke();
        const ax = Math.cos(a1) * R;
        const ay = Math.sin(a1) * R;
        const s = size * 0.05;
        ctx.beginPath();
        ctx.moveTo(ax - Math.sin(a1) * s * 1.3, ay + Math.cos(a1) * s * 1.3);
        ctx.lineTo(ax + Math.cos(a1) * s, ay + Math.sin(a1) * s);
        ctx.lineTo(ax - Math.cos(a1) * s, ay - Math.sin(a1) * s);
        ctx.fill();
      }
  }
  // Gilt rings.
  ctx.strokeStyle = ring;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = size * 0.008;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.47, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = size * 0.003;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.452, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * size * 0.461, Math.sin(a) * size * 0.461, size * 0.0035, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Mutation finish.
  if (mut === 'gilded') {
    for (let i = 0; i < 400; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * size * 0.46;
      ctx.fillStyle = `rgba(255,220,120,${0.2 + Math.random() * 0.5})`;
      ctx.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, 2, 2);
    }
  } else if (mut === 'mosaic') {
    const cols = ['#e05a4a', '#4a8ae0', '#e0c04a', '#5ac06a', '#a05ae0'];
    for (let k = 0; k < 40; k++) {
      ctx.save();
      ctx.rotate((k / 40) * Math.PI * 2);
      ctx.fillStyle = cols[k % cols.length];
      ctx.globalAlpha = 0.5;
      ctx.fillRect(-size * 0.03, -size * 0.495, size * 0.06, size * 0.03);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  } else if (mut === 'prismatic') {
    const g = ctx.createConicGradient(0, 0, 0);
    ['#ff4a6a', '#ffb84a', '#f6ff6a', '#5aff9a', '#5ab0ff', '#c05aff', '#ff4a6a'].forEach((col, i, arr) => g.addColorStop(i / (arr.length - 1), col));
    ctx.strokeStyle = g;
    ctx.lineWidth = size * 0.02;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return c;
}

export function swatchURL(style: Record<string, string>, mut: Mutation): string {
  const big = feltCanvas(style, mut, 256);
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(80, 80, 76, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(big, 0, 0, 160, 160);
  ctx.strokeStyle = '#2a1a0e';
  ctx.lineWidth = 8;
  ctx.stroke();
  return c.toDataURL();
}

// ====================================================================== banners

export function bannerSVG(style: Record<string, string>, mut: Mutation): string {
  const { field, charge, accent } = style;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 400" width="200" height="400">
    <defs><linearGradient id="sh" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".2" stop-color="#000" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient></defs>
    <path d="M 10,10 L 190,10 L 190,330 L 100,390 L 10,330 Z" fill="${field}"/>
    <path d="M 10,10 L 190,10 L 190,330 L 100,390 L 10,330 Z" fill="url(#sh)"/>
    <path d="M 22,24 L 178,24 L 178,322 L 100,374 L 22,322 Z" fill="none" stroke="${accent}" stroke-width="4"/>
    <g transform="translate(100,170) scale(1.25)">${crest(charge, accent)}</g>
    ${mutationLayer(mut, 200, 400, 4)}
  </svg>`;
}

// ====================================================================== icons for impacts / charms / seats

export function impactIconSVG(style: Record<string, string>, mut: Mutation): string {
  const c = style.color;
  const dots = Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
    // Burst outward from behind the card, filling the medallion.
    const r = 40 + Math.random() * 28;
    const s = 3 + Math.random() * 5;
    return style.fx === 'ravens'
      ? `<path transform="translate(${(80 + Math.cos(a) * r).toFixed(0)},${(84 + Math.sin(a) * r * 0.8).toFixed(0)}) rotate(${(a * 57).toFixed(0)})" d="M 0,-9 C 4,-4 4,4 0,9 C -4,4 -4,-4 0,-9 Z" fill="#1a1a1a" stroke="#555" stroke-width="1"/>`
      : `<circle cx="${(80 + Math.cos(a) * r).toFixed(0)}" cy="${(84 + Math.sin(a) * r * 0.8).toFixed(0)}" r="${s.toFixed(1)}" fill="${c}" opacity="${(0.5 + Math.random() * 0.5).toFixed(2)}"/>`;
  }).join('');
  const ring = mut === 'prismatic' ? '#ff7ae0' : mut === 'gilded' ? '#f0c860' : mut === 'mosaic' ? '#60b0e0' : c;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><radialGradient id="g"><stop offset="0" stop-color="${c}" stop-opacity=".9"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><circle cx="80" cy="84" r="70" fill="url(#g)" opacity=".35"/>${dots}<rect x="56" y="46" width="48" height="70" rx="7" fill="#f1e4c4" stroke="#1b110b" stroke-width="3.5" transform="rotate(-10 80 81)"/><rect x="62" y="53" width="36" height="56" rx="4" fill="none" stroke="${c}" stroke-width="3" opacity=".85" transform="rotate(-10 80 81)"/><circle cx="80" cy="84" r="74" fill="none" stroke="${ring}" stroke-width="3" opacity=".7"/></svg>`;
}

export function charmIconSVG(model: string): string {
  const I = '#f6eedb';
  const K = '#1b110b';
  const body: Record<string, string> = {
    none: `<path d="M 58,104 C 50,72 62,42 80,42 C 98,42 110,72 102,104 Z" fill="none" stroke="#8a6a4a" stroke-width="2.4" stroke-dasharray="7 6" opacity=".7"/><rect x="40" y="106" width="80" height="16" rx="4" fill="#6a4a2a" stroke="${K}" stroke-width="2"/>`,
    die: `<rect x="48" y="48" width="64" height="64" rx="12" fill="${I}" stroke="${K}" stroke-width="2.4"/><circle cx="64" cy="64" r="6" fill="${K}"/><circle cx="96" cy="96" r="6" fill="${K}"/><circle cx="80" cy="80" r="6" fill="${K}"/>`,
    horseshoe: `<path d="M 50,40 C 40,100 50,124 80,124 C 110,124 120,100 110,40" fill="none" stroke="#9a948c" stroke-width="16" stroke-linecap="round"/><path d="M 50,40 C 40,100 50,124 80,124 C 110,124 120,100 110,40" fill="none" stroke="${K}" stroke-width="2" stroke-dasharray="4 10"/>`,
    goblet: `<path d="M 50,36 L 110,36 C 110,70 96,86 80,88 C 64,86 50,70 50,36 Z" fill="#e0b04a" stroke="${K}" stroke-width="2.4"/><rect x="76" y="88" width="8" height="24" fill="#e0b04a" stroke="${K}" stroke-width="2"/><ellipse cx="80" cy="118" rx="26" ry="8" fill="#e0b04a" stroke="${K}" stroke-width="2.4"/>`,
    skull: `<path d="M 50,84 C 44,48 116,48 110,84 C 110,96 100,100 100,110 L 60,110 C 60,100 50,96 50,84 Z" fill="${I}" stroke="${K}" stroke-width="2.4"/><circle cx="66" cy="82" r="9" fill="${K}"/><circle cx="94" cy="82" r="9" fill="${K}"/><rect x="72" y="32" width="16" height="22" fill="#efe3c4" stroke="${K}" stroke-width="2"/><path d="M 80,14 C 86,22 86,28 80,32 C 74,28 74,22 80,14 Z" fill="#ffb347"/>`,
    crystal: `<path d="M 80,22 L 108,70 L 92,120 L 68,120 L 52,70 Z" fill="#b48ae0" stroke="${K}" stroke-width="2.4"/><path d="M 80,22 L 80,120 M 52,70 L 108,70" stroke="#fff" stroke-width="2" opacity=".6"/><rect x="56" y="120" width="48" height="12" rx="4" fill="#6a4a2a" stroke="${K}" stroke-width="2"/>`,
    raven: `<g transform="translate(80,78) scale(1.18)">${crest('raven', '#1a1a1a')}</g><rect x="56" y="118" width="48" height="12" rx="4" fill="#6a4a2a" stroke="${K}" stroke-width="2"/>`,
    dragon: `<g transform="translate(80,80) scale(1.18)">${crest('dragon', '#c8963a')}</g><circle cx="110" cy="56" r="6" fill="#ddd" opacity=".5"/><circle cx="118" cy="44" r="8" fill="#ddd" opacity=".35"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">${body[model] ?? body.none}</svg>`;
}

/** Seat thumbnails: each chair in a three-quarter view, shaded, with a thin outline. */
export function seatIconSVG(model: string): string {
  const K = '#1b110b';
  const o = `stroke="${K}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
  const id = `seat-${model}`;
  const lg = (name: string, a: string, b: string, x2 = 0, y2 = 1) =>
    `<linearGradient id="${id}-${name}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const u = (name: string) => `url(#${id}-${name})`;
  const svg = (defs: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs>${defs}</defs>${body}</svg>`;
  /** Shapes drawn with a clean outline round their joint silhouette (no lines where parts meet). */
  const sil = (shapes: string, fill: string) => `<g fill="${K}" stroke="${K}" stroke-width="4.4" stroke-linejoin="round" stroke-linecap="round">${shapes}</g><g fill="${fill}">${shapes}</g>`;
  // The seat itself: top, front and side aprons.
  const seatBox = (top: string, front: string, side: string) =>
    `<path d="M 42,98 L 102,98 L 118,86 L 58,86 Z" fill="${top}" ${o}/><path d="M 42,98 L 102,98 L 102,108 L 42,108 Z" fill="${front}" ${o}/><path d="M 102,98 L 118,86 L 118,96 L 102,108 Z" fill="${side}" ${o}/>`;
  const leg = (x: number, y0: number, y1: number, w: number, fill: string) => `<rect x="${x}" y="${y0}" width="${w}" height="${y1 - y0}" rx="${(w / 3).toFixed(1)}" fill="${fill}" ${o}/>`;
  /** A turned (lathe) leg or spindle: a shaft with a bulge. */
  const turned = (x: number, y0: number, y1: number, w: number, fill: string) =>
    sil(`<rect x="${x - w / 2}" y="${y0}" width="${w}" height="${y1 - y0}" rx="${w / 2}"/><ellipse cx="${x}" cy="${y0 + (y1 - y0) * 0.42}" rx="${w * 0.78}" ry="${(y1 - y0) * 0.13}"/><ellipse cx="${x}" cy="${y1 - 3}" rx="${w * 0.66}" ry="3"/>`, fill);
  switch (model) {
    case 'stool':
      return svg(
        lg('w', '#c08850', '#7c4c24') + lg('t', '#d8a468', '#a87038', 1, 0),
        // Three splayed legs and a stretcher ring, a thick round top with growth rings.
        `<path d="M 50,124 Q 80,134 110,124" fill="none" stroke="${K}" stroke-width="6.4"/><path d="M 50,124 Q 80,134 110,124" fill="none" stroke="#7c4c24" stroke-width="4"/>` +
          sil(`<path d="M 56,86 L 62,88 L 46,146 L 39,145 Z"/><path d="M 104,86 L 98,88 L 114,146 L 121,145 Z"/>`, u('w')) +
          `<path d="M 42,78 L 42,86 A 38 13 0 0 0 118,86 L 118,78 Z" fill="${u('w')}" ${o}/><ellipse cx="80" cy="78" rx="38" ry="13" fill="${u('t')}" ${o}/>` +
          `<ellipse cx="80" cy="78" rx="26" ry="8.5" fill="none" stroke="#9a6430" stroke-width="1.1" opacity=".7"/><ellipse cx="80" cy="78" rx="14" ry="4.6" fill="none" stroke="#9a6430" stroke-width="1.1" opacity=".7"/><ellipse cx="80" cy="78" rx="4" ry="1.4" fill="#9a6430" opacity=".6"/>` +
          sil(`<path d="M 77,92 L 83,92 L 84,150 L 76,150 Z"/>`, u('w')) +
          `<path d="M 58,72 Q 80,67 102,72" fill="none" stroke="#fff3d8" stroke-width="1.6" opacity=".45"/>`
      );
    case 'velvet': {
      const buttons: Array<[number, number]> = [
        [70, 40], [88, 33], [106, 33], [64, 56], [82, 52], [100, 50], [116, 50], [72, 72], [90, 70], [108, 69],
      ];
      return svg(
        lg('v', '#8a44a0', '#3e1648', 1, 1) + lg('vt', '#9c56b2', '#5e2a70', 1, 0) + lg('w', '#6a3c1c', '#2e180a') + lg('g', '#f6d777', '#a8781e', 1, 1),
        leg(60, 96, 128, 6, u('w')) +
          leg(112, 96, 130, 6, u('w')) +
          `<path d="M 54,90 L 54,42 C 54,16 122,6 122,32 L 122,90 Z" fill="${u('v')}" ${o}/>` +
          `<path d="M 56,42 C 56,19 120,10 120,32" fill="none" stroke="${u('g')}" stroke-width="2.6"/>` +
          buttons.map(([x, y]) => `<path d="M ${x - 6},${y - 6} L ${x},${y} L ${x + 6},${y - 6} M ${x - 6},${y + 6} L ${x},${y} L ${x + 6},${y + 6}" stroke="#2a0a32" stroke-width="1" opacity=".55" fill="none"/><circle cx="${x}" cy="${y}" r="1.9" fill="#f0c860" stroke="#2a0a32" stroke-width=".8"/>`).join('') +
          seatBox(u('vt'), u('v'), '#3e1648') +
          `<path d="M 43,107 L 101,107" stroke="${u('g')}" stroke-width="2.4"/>` +
          [48, 56, 64, 72, 80, 88, 96].map((x) => `<circle cx="${x}" cy="102.5" r="1.4" fill="#f0c860"/>`).join('') +
          // Rolled, padded arms on wooden supports.
          sil(`<rect x="34" y="86" width="6" height="16" rx="2"/>`, u('w')) +
          sil(`<rect x="104" y="76" width="5" height="16" rx="2"/>`, u('w')) +
          `<rect x="30" y="68" width="36" height="14" rx="7" transform="rotate(-24 47 75)" fill="${u('v')}" ${o}/><circle cx="36" cy="83" r="7" fill="${u('vt')}" ${o}/><path d="M 36,79 A 3.5 3.5 0 1 1 33,84" fill="none" stroke="#2a0a32" stroke-width="1.1"/>` +
          `<rect x="100" y="59" width="32" height="13" rx="6.5" transform="rotate(-34 116 65.5)" fill="${u('v')}" ${o}/><circle cx="105.5" cy="74" r="6.3" fill="${u('vt')}" ${o}/><path d="M 105.5,70.5 A 3 3 0 1 1 103,75" fill="none" stroke="#2a0a32" stroke-width="1.1"/>` +
          sil(`<path d="M 43,108 C 39,120 50,128 44,142 L 51,142 C 56,128 47,119 52,108 Z"/><path d="M 93,108 C 89,120 100,128 94,142 L 101,142 C 106,128 97,119 102,108 Z"/>`, u('w')) +
          `<ellipse cx="47.5" cy="144" rx="5" ry="2.6" fill="${u('g')}" ${o}/><ellipse cx="97.5" cy="144" rx="5" ry="2.6" fill="${u('g')}" ${o}/>`
      );
    }
    case 'iron': {
      const rivet = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#d4d8e0" stroke="${K}" stroke-width=".8"/>`;
      const bar = (x1: number, y1: number, x2: number, y2: number, w: number, c: string) =>
        `<path d="M ${x1},${y1} L ${x2},${y2}" stroke="${K}" stroke-width="${w + 2.4}" stroke-linecap="round"/><path d="M ${x1},${y1} L ${x2},${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
      return svg(
        lg('i', '#8c909a', '#3c3e46', 1, 1) + lg('it', '#a4a8b2', '#62656e', 1, 0) + lg('d', '#55575f', '#26272c'),
        leg(59, 90, 136, 5, u('d')) +
          leg(113, 90, 138, 5, u('d')) +
          [68, 78, 88, 98, 108].map((x) => bar(x, 34, x, 86, 3.4, '#6c7078')).join('') +
          `<rect x="57" y="22" width="6" height="66" rx="1.5" fill="${u('i')}" ${o}/><rect x="113" y="22" width="6" height="66" rx="1.5" fill="${u('i')}" ${o}/>` +
          `<path d="M 57,30 Q 88,12 119,30 L 119,38 Q 88,22 57,38 Z" fill="${u('i')}" ${o}/><rect x="57" y="72" width="62" height="6" rx="1.5" fill="${u('i')}" ${o}/>` +
          `<circle cx="88" cy="17" r="7" fill="none" stroke="${K}" stroke-width="5"/><circle cx="88" cy="17" r="7" fill="none" stroke="#8c909a" stroke-width="2.6"/>` +
          [rivet(60, 33), rivet(116, 33), rivet(60, 75), rivet(116, 75), rivet(88, 26)].join('') +
          seatBox(u('it'), u('i'), u('d')) +
          `<path d="M 52,92 L 106,92 M 56,89 L 110,89 M 48,95 L 102,95" stroke="#5c5f68" stroke-width=".9" opacity=".6"/>` +
          [rivet(49, 96), rivet(96, 96), rivet(63, 88), rivet(110, 88)].join('') +
          bar(48, 116, 98, 142, 2.6, '#55575f') +
          bar(98, 116, 48, 142, 2.6, '#55575f') +
          leg(43, 108, 148, 5, u('i')) +
          leg(96, 108, 148, 5, u('i')) +
          `<rect x="40" y="146" width="11" height="4" rx="1" fill="#3c3e46" ${o}/><rect x="93" y="146" width="11" height="4" rx="1" fill="#3c3e46" ${o}/>`
      );
    }
    case 'bone': {
      // A bone: a shaft with a pair of knuckles at each end.
      const boneV = (x: number, y0: number, y1: number, w: number) =>
        `<rect x="${x - w / 2}" y="${y0}" width="${w}" height="${y1 - y0}" rx="${w / 2}"/>` +
        [y0, y1].map((y) => `<circle cx="${x - w * 0.45}" cy="${y}" r="${w * 0.55}"/><circle cx="${x + w * 0.45}" cy="${y}" r="${w * 0.55}"/>`).join('');
      const rib = (y: number, bow: number) => `<path d="M 62,${y} Q 88,${y + bow} 114,${y}" fill="none" stroke="${K}" stroke-width="7"/><path d="M 62,${y} Q 88,${y + bow} 114,${y}" fill="none" stroke="#ece2c8" stroke-width="4.6"/>`;
      return svg(
        lg('b', '#f6efdc', '#c4b08a', 1, 1) + lg('bt', '#fbf5e6', '#d6c6a2', 1, 0),
        sil(boneV(61, 94, 134, 5) + boneV(115, 94, 136, 5), '#d8caa6') +
          rib(36, -8) + rib(50, 8) + rib(62, 8) + rib(74, 8) +
          sil(boneV(60, 32, 86, 6) + boneV(116, 32, 86, 6), u('b')) +
          // A skull crowning the back.
          sil(`<path d="M 75,20 C 75,4 101,4 101,20 C 101,26 97,28 97,32 L 79,32 C 79,28 75,26 75,20 Z"/>`, u('b')) +
          `<ellipse cx="83" cy="19" rx="3.6" ry="4" fill="${K}"/><ellipse cx="93" cy="19" rx="3.6" ry="4" fill="${K}"/><path d="M 88,23 L 86,27 L 90,27 Z" fill="${K}"/><path d="M 82,32 L 82,29 M 86,32 L 86,29 M 90,32 L 90,29 M 94,32 L 94,29" stroke="${K}" stroke-width="1"/>` +
          seatBox(u('bt'), u('b'), '#b8a47a') +
          `<path d="M 47,94.5 L 107,94.5 M 52,90.5 L 112,90.5" stroke="#a8956c" stroke-width="1.1"/>` +
          sil(boneV(46, 110, 146, 6) + boneV(99, 110, 146, 6), u('b'))
      );
    }
    case 'throne':
      return svg(
        lg('g', '#fbe08a', '#b07e1c', 1, 1) + lg('gd', '#c8962e', '#7a5212') + lg('r', '#b8222e', '#5a0c16', 1, 1) + lg('rt', '#cc3242', '#7a1422', 1, 0),
        leg(60, 94, 132, 7, u('gd')) +
          leg(112, 94, 134, 7, u('gd')) +
          `<path d="M 54,90 L 54,34 Q 54,26 62,18 Q 66,28 75,28 Q 83,22 88,12 Q 93,22 101,28 Q 110,28 114,18 Q 122,26 122,34 L 122,90 Z" fill="${u('g')}" ${o}/>` +
          `<path d="M 62,86 L 62,42 Q 62,34 70,34 Q 80,33 88,25 Q 96,33 106,34 Q 114,34 114,42 L 114,86 Z" fill="${u('r')}" ${o}/>` +
          `<g transform="translate(88,60) scale(0.26)">${crest('crown', '#f6d270')}</g>` +
          `<circle cx="62" cy="16" r="3.6" fill="${u('g')}" ${o}/><circle cx="88" cy="9.5" r="4.2" fill="${u('g')}" ${o}/><circle cx="114" cy="16" r="3.6" fill="${u('g')}" ${o}/>` +
          `<ellipse cx="88" cy="39" rx="3" ry="4" fill="#e8303a" stroke="${K}" stroke-width="1"/><circle cx="58" cy="52" r="2.4" fill="#3a7ae0" stroke="${K}" stroke-width="1"/><circle cx="118" cy="52" r="2.4" fill="#3a7ae0" stroke="${K}" stroke-width="1"/>` +
          seatBox(u('rt'), u('g'), u('gd')) +
          [50, 62, 74, 86, 98].map((x, i) => `<circle cx="${x - 2}" cy="103" r="1.9" fill="${i % 2 ? '#3a7ae0' : '#e8303a'}" stroke="${K}" stroke-width=".8"/>`).join('') +
          `<path d="M 56,70 L 40,80 C 34,84 34,92 40,94 L 47,94 L 47,87 L 58,79 Z" fill="${u('g')}" ${o}/><path d="M 121,63 L 106,73 C 102,76 102,83 106,85 L 111,85 L 111,79 L 122,71 Z" fill="${u('g')}" ${o}/>` +
          leg(42, 108, 142, 9, u('g')) +
          leg(94, 108, 142, 9, u('g')) +
          `<path d="M 39,146 Q 46.5,138 54,146 Z" fill="${u('gd')}" ${o}/><path d="M 91,146 Q 98.5,138 106,146 Z" fill="${u('gd')}" ${o}/>`
      );
    case 'oak':
    default:
      return svg(
        lg('w', '#b07a42', '#74461f', 1, 1) + lg('wt', '#cc945a', '#9a6430', 1, 0) + lg('d', '#7a4a22', '#4a2a12'),
        leg(59, 90, 134, 6, u('d')) +
          leg(112, 90, 136, 6, u('d')) +
          [72, 88, 104].map((x) => turned(x, 34, 88, 5, u('w'))).join('') +
          `<rect x="57" y="22" width="7" height="66" rx="2" fill="${u('w')}" ${o}/><rect x="112" y="22" width="7" height="66" rx="2" fill="${u('w')}" ${o}/>` +
          `<circle cx="60.5" cy="19" r="4.5" fill="${u('w')}" ${o}/><circle cx="115.5" cy="19" r="4.5" fill="${u('w')}" ${o}/>` +
          `<path d="M 62,27 Q 88,15 114,27 L 114,38 Q 88,28 62,38 Z" fill="${u('w')}" ${o}/><path d="M 66,31 Q 88,22 110,31" fill="none" stroke="#e0a868" stroke-width="1.2" opacity=".55"/>` +
          seatBox(u('wt'), u('w'), u('d')) +
          `<path d="M 50,95 Q 76,93 108,94 M 58,90 Q 84,88 113,89" fill="none" stroke="#8a5428" stroke-width="1" opacity=".7"/>` +
          `<rect x="50" y="132" width="46" height="4" rx="2" fill="${u('d')}" ${o}/>` +
          turned(46.5, 108, 148, 6.5, u('w')) +
          turned(98.5, 108, 148, 6.5, u('w'))
      );
  }
}

export function svgURL(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// ====================================================================== 3D charms & seats

export function buildCharm(model: string, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const ivory = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.5 });
  const black = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.35, metalness: 0.2 });
  switch (model) {
    case 'die': {
      const d = box(0.06, 0.06, 0.06, ivory);
      d.position.y = 0.03;
      d.rotation.y = 0.5;
      g.add(d);
      for (const [x, y, z] of [
        [0, 0.061, 0],
        [0.018, 0.061, 0.018],
        [-0.018, 0.061, -0.018],
      ]) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), black);
        p.position.set(x, y, z);
        g.add(p);
      }
      break;
    }
    case 'horseshoe': {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 8, 20, Math.PI * 1.3), m.iron);
      t.rotation.z = -Math.PI * 0.15 + Math.PI;
      t.position.y = 0.055;
      g.add(t);
      const base = box(0.08, 0.012, 0.03, m.woodDark);
      base.position.y = 0.006;
      g.add(base);
      break;
    }
    case 'goblet': {
      const gob = new THREE.Mesh(
        new THREE.LatheGeometry(
          [
            [0, 0],
            [0.035, 0],
            [0.035, 0.006],
            [0.006, 0.014],
            [0.006, 0.06],
            [0.03, 0.075],
            [0.038, 0.12],
            [0.034, 0.12],
            [0.026, 0.08],
            [0, 0.075],
          ].map(([x, y]) => new THREE.Vector2(x, y)),
          20
        ),
        m.gold
      );
      g.add(gob);
      break;
    }
    case 'skull': {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), ivory);
      s.scale.set(1, 0.9, 1.1);
      s.position.y = 0.04;
      g.add(s);
      for (const x of [-0.015, 0.015]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), black);
        e.position.set(x, 0.045, 0.036);
        g.add(e);
      }
      const jaw = box(0.04, 0.02, 0.03, ivory);
      jaw.position.set(0, 0.012, 0.018);
      g.add(jaw);
      const wax = cyl(0.012, 0.014, 0.04, m.wax, 10);
      wax.position.y = 0.095;
      g.add(wax);
      g.userData.flameAt = new THREE.Vector3(0, 0.12, 0);
      break;
    }
    case 'crystal': {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), new THREE.MeshStandardMaterial({ color: '#b48ae0', roughness: 0.1, metalness: 0.2, emissive: '#5a2a9a', emissiveIntensity: 0.9, transparent: true, opacity: 0.9 }));
      c.scale.set(0.8, 1.6, 0.8);
      c.position.y = 0.075;
      g.add(c);
      g.userData.spin = c;
      const base = cyl(0.03, 0.035, 0.012, m.woodDark, 12);
      base.position.y = 0.006;
      g.add(base);
      break;
    }
    case 'raven': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), black);
      body.scale.set(1.5, 1, 1);
      body.position.y = 0.05;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), black);
      head.position.set(0.04, 0.075, 0);
      g.add(head);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.03, 6), black);
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(0.065, 0.074, 0);
      g.add(beak);
      const tail = box(0.04, 0.006, 0.02, black);
      tail.position.set(-0.05, 0.045, 0);
      tail.rotation.z = 0.3;
      g.add(tail);
      const base = box(0.1, 0.014, 0.05, m.woodDark);
      base.position.y = 0.007;
      g.add(base);
      break;
    }
    case 'dragon': {
      const brass = m.brass;
      const body = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 20, Math.PI * 1.5), brass);
      body.rotation.x = Math.PI / 2;
      body.position.y = 0.02;
      g.add(body);
      const neck = cyl(0.009, 0.012, 0.06, brass, 8);
      neck.position.set(0.035, 0.05, 0);
      neck.rotation.z = -0.3;
      g.add(neck);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 8), brass);
      head.rotation.z = -Math.PI / 2;
      head.position.set(0.06, 0.08, 0);
      g.add(head);
      for (const z of [-0.02, 0.02]) {
        const w = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 3), brass);
        w.position.set(0, 0.05, z);
        w.rotation.x = z > 0 ? 0.8 : -0.8;
        g.add(w);
      }
      g.userData.smokeAt = new THREE.Vector3(0.085, 0.085, 0);
      break;
    }
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : null));
  return g;
}

export function buildSeat(model: string, m: Mats): THREE.Group {
  const g = new THREE.Group();
  const seatH = 0.48;
  const matFor: Record<string, THREE.Material> = {
    oak: m.wood,
    stool: m.woodLight,
    velvet: m.woodDark,
    iron: m.iron,
    bone: new THREE.MeshStandardMaterial({ color: '#e0d6c0', roughness: 0.6 }),
    throne: m.gold,
  };
  const frame = matFor[model] ?? m.wood;
  if (model === 'stool') {
    const top = cyl(0.2, 0.2, 0.05, frame, 18);
    top.position.y = seatH;
    g.add(top);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = cyl(0.022, 0.028, seatH, m.woodDark, 6);
      leg.position.set(Math.cos(a) * 0.13, seatH / 2, Math.sin(a) * 0.13);
      g.add(leg);
    }
    return g;
  }
  const seat = box(0.5, 0.06, 0.48, frame);
  seat.position.y = seatH;
  g.add(seat);
  for (const [x, z] of [
    [-0.21, -0.2],
    [0.21, -0.2],
    [-0.21, 0.2],
    [0.21, 0.2],
  ]) {
    const leg = box(0.05, seatH, 0.05, frame);
    leg.position.set(x, seatH / 2, z);
    g.add(leg);
  }
  const backH = model === 'throne' ? 1.2 : 0.8;
  const back = box(0.5, backH, 0.06, frame);
  back.position.set(0, seatH + backH / 2, -0.22);
  g.add(back);
  if (model === 'velvet' || model === 'throne') {
    const cush = new THREE.MeshStandardMaterial({ color: model === 'throne' ? '#7a1a2a' : '#4a1a5a', roughness: 0.85 });
    const c1 = box(0.44, 0.06, 0.42, cush);
    c1.position.y = seatH + 0.06;
    g.add(c1);
    const c2 = box(0.4, backH * 0.8, 0.04, cush);
    c2.position.set(0, seatH + backH * 0.45, -0.18);
    g.add(c2);
  }
  if (model === 'throne') {
    for (const x of [-0.22, 0, 0.22]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 8), m.gold);
      fin.position.set(x, seatH + backH + 0.07 + (x === 0 ? 0.06 : 0), -0.22);
      g.add(fin);
    }
  }
  if (model === 'bone') {
    for (const x of [-0.22, 0.22]) {
      const sk = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), frame);
      sk.position.set(x, seatH + backH + 0.03, -0.22);
      g.add(sk);
    }
  }
  if (model === 'iron') {
    for (let k = -2; k <= 2; k++) {
      const bar = cyl(0.008, 0.008, backH, m.iron, 6);
      bar.position.set(k * 0.09, seatH + backH / 2, -0.18);
      g.add(bar);
    }
  }
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? (((o as THREE.Mesh).castShadow = true), ((o as THREE.Mesh).receiveShadow = true)) : null));
  return g;
}
