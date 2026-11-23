import { useId, type ReactNode } from 'react';
import { dishShape, type DishShape } from '../lib/dish';
import { hashString, mulberry32 } from '../lib/selection';
import type { Recipe } from '../types';

// ---------- Colour helpers ----------

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix a hex colour towards white. */
export function tint(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex).map((c) => Math.round(c + (255 - c) * amount));
  return `rgb(${r},${g},${b})`;
}

/** Mix two hex colours: t = 0 gives `from`, 1 gives `to`. */
function mix(from: string, to: string, t: number): string {
  const x = rgb(from), y = rgb(to);
  const [r, g, b] = x.map((c, i) => Math.round(c + (y[i] - c) * t));
  return `rgb(${r},${g},${b})`;
}

/** Mix a hex colour towards black. */
function shade(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex).map((c) => Math.round(c * (1 - amount)));
  return `rgb(${r},${g},${b})`;
}

// ---------- Shared pieces ----------

const CX = 100;
const CY = 75;
const GREENS = ['#6f9a52', '#8bb764', '#5c8442', '#a7c97d'];
const LEAF = 'M0 0 C 3 -4, 8 -4, 10 0 C 8 4, 3 4, 0 0 Z';
const CRUST = '#e2b26c';

interface Ctx {
  a: string;
  b: string;
  rng: () => number;
  uid: string;
}

/** A random point inside a disc around the centre. */
function inDisc(rng: () => number, r: number, cx = CX, cy = CY): [number, number] {
  const t = rng() * Math.PI * 2;
  const d = Math.sqrt(rng()) * r;
  return [cx + Math.cos(t) * d, cy + Math.sin(t) * d];
}

function sector(r: number, from: number, to: number, cx = CX, cy = CY): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + Math.cos(rad(from)) * r, y1 = cy + Math.sin(rad(from)) * r;
  const x2 = cx + Math.cos(rad(to)) * r, y2 = cy + Math.sin(rad(to)) * r;
  return `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

function Plate({ c, r = 56 }: { c: Ctx; r?: number }) {
  return <circle cx={CX} cy={CY} r={r} fill={`url(#${c.uid}-plate)`} filter={`url(#${c.uid}-sh)`} />;
}

function Leaves({ c, n, r, scale = 0.9 }: { c: Ctx; n: number; r: number; scale?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = inDisc(c.rng, r);
        return <path key={i} d={LEAF} fill={GREENS[i % 2]} transform={`translate(${x} ${y}) rotate(${c.rng() * 360}) scale(${scale})`} />;
      })}
    </>
  );
}

function Blobs({ c, n, r, colors, size = [5, 8] }: { c: Ctx; n: number; r: number; colors: string[]; size?: [number, number] }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = inDisc(c.rng, r);
        const rx = size[0] + c.rng() * (size[1] - size[0]);
        return <ellipse key={i} cx={x} cy={y} rx={rx} ry={rx * (0.65 + c.rng() * 0.3)} fill={colors[i % colors.length]} transform={`rotate(${c.rng() * 180} ${x} ${y})`} />;
      })}
    </>
  );
}

function Grains({ c, n, r, colors, cx = CX, cy = CY }: { c: Ctx; n: number; r: number; colors: string[]; cx?: number; cy?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = inDisc(c.rng, r, cx, cy);
        return <ellipse key={i} cx={x} cy={y} rx={1.9} ry={1.1} fill={colors[i % colors.length]} transform={`rotate(${c.rng() * 180} ${x} ${y})`} />;
      })}
    </>
  );
}

/** Bowl seen from above: rim, inner wall and the food surface. */
function Bowl({ c, fill }: { c: Ctx; fill: string }) {
  return (
    <>
      <Plate c={c} r={56} />
      <circle cx={CX} cy={CY} r={47} fill="#e8dece" />
      <circle cx={CX} cy={CY} r={42} fill={fill} />
    </>
  );
}

// ---------- Dishes ----------

const DISHES: Record<DishShape, (c: Ctx) => ReactNode> = {
  plate: (c) => (
    <>
      <Plate c={c} />
      <circle cx={CX} cy={CY} r={44} fill={c.a} />
      <circle cx={CX} cy={CY} r={44} fill="none" stroke={tint(c.a, 0.25)} strokeWidth="2" opacity="0.6" />
      <Blobs c={c} n={9} r={28} colors={[c.b, tint(c.b, 0.35), tint(c.a, 0.15)]} size={[7, 15]} />
      <Leaves c={c} n={5} r={30} />
    </>
  ),

  soup: (c) => (
    <>
      <Bowl c={c} fill={c.a} />
      <path d="M86 72 C 92 58, 117 62, 112 78 C 108 90, 89 88, 93 76" fill="none" stroke="#fffaf0" strokeWidth="3.2" strokeLinecap="round" opacity="0.75" />
      {Array.from({ length: 5 }, (_, i) => {
        const [x, y] = inDisc(c.rng, 30);
        return <rect key={i} x={x - 3.5} y={y - 3.5} width="7" height="7" rx="1.5" fill="#e6b76a" stroke="#c99447" strokeWidth="0.8" transform={`rotate(${c.rng() * 90} ${x} ${y})`} />;
      })}
      <Leaves c={c} n={4} r={30} scale={0.7} />
      <line x1="128" y1="90" x2="182" y2="128" stroke="#ddd6c9" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="122" cy="85" rx="11" ry="8" fill="#ebe5da" stroke="#d3cbbd" strokeWidth="1" transform="rotate(35 122 85)" />
    </>
  ),

  noodles: (c) => (
    <>
      <Bowl c={c} fill={c.a} />
      <g clipPath={`url(#${c.uid}-inner)`}>
        {[56, 63, 70, 77, 84, 91].map((y, i) => (
          <path
            key={y}
            d={`M54 ${y} Q 64 ${y - 6} 74 ${y} T 94 ${y} T 114 ${y} T 134 ${y} T 154 ${y}`}
            transform={`translate(${i % 2 ? -5 : 0} 0)`}
            fill="none"
            stroke="#f3da98"
            strokeWidth="3"
            strokeLinecap="round"
          />
        ))}
      </g>
      <circle cx="113" cy="62" r="9.5" fill="#fffaf0" />
      <circle cx="113" cy="62" r="4.6" fill="#f2b134" />
      <Blobs c={c} n={3} r={22} colors={[c.b, tint(c.b, 0.3)]} size={[5, 7]} />
      <Leaves c={c} n={4} r={28} scale={0.7} />
      <line x1="96" y1="52" x2="198" y2="14" stroke="#b98a5a" strokeWidth="3.4" strokeLinecap="round" />
      <line x1="101" y1="59" x2="199" y2="26" stroke="#a87b4e" strokeWidth="3.4" strokeLinecap="round" />
    </>
  ),

  pasta: (c) => {
    const spirals = [0, 2.1, 4.2].map((phase) => {
      const pts: string[] = [];
      for (let i = 0; i <= 70; i++) {
        const t = i / 70;
        const ang = phase + t * Math.PI * 5;
        const rad = 5 + t * 31;
        pts.push(`${(CX + Math.cos(ang) * rad).toFixed(1)} ${(CY + Math.sin(ang) * rad * 0.92).toFixed(1)}`);
      }
      return `M${pts.join(' L')}`;
    });
    return (
      <>
        <Plate c={c} />
        {spirals.map((d, i) => <path key={`o${i}`} d={d} fill="none" stroke="#d9b25e" strokeWidth="4.4" strokeLinecap="round" />)}
        {spirals.map((d, i) => <path key={`i${i}`} d={d} fill="none" stroke="#f3d58e" strokeWidth="2.8" strokeLinecap="round" />)}
        <Blobs c={c} n={6} r={22} colors={[c.a, shade(c.a, 0.1)]} size={[5, 9]} />
        <Blobs c={c} n={4} r={24} colors={[c.b]} size={[3, 5]} />
        <Grains c={c} n={14} r={22} colors={['#fffaf0']} />
        <Leaves c={c} n={3} r={20} />
      </>
    );
  },

  grains: (c) => (
    <>
      <Plate c={c} />
      <circle cx={CX} cy={CY} r={43} fill={tint(c.a, 0.3)} />
      <Grains c={c} n={140} r={41} colors={[tint(c.a, 0.6), shade(c.a, 0.08), '#fbf6e8']} />
      <Blobs c={c} n={5} r={24} colors={[c.b, tint(c.b, 0.3)]} size={[5, 8]} />
      <Leaves c={c} n={3} r={26} />
    </>
  ),

  curry: (c) => (
    <>
      <Plate c={c} />
      <circle cx={CX} cy={CY} r={44} fill={c.a} />
      <g transform="translate(10 0)">
        <Blobs c={c} n={6} r={22} colors={[c.b, tint(c.b, 0.35)]} size={[5, 8]} />
      </g>
      <ellipse cx="80" cy="73" rx="25" ry="24" fill="#fbf7ec" stroke="#ece3cf" strokeWidth="1.2" />
      <Grains c={c} n={40} r={20} cx={80} cy={73} colors={['#ece2cb']} />
      <Leaves c={c} n={3} r={10} scale={0.8} />
    </>
  ),

  stamppot: (c) => {
    const mash = mix('#f2e4b8', c.a, 0.18);
    return (
      <>
        <Plate c={c} />
        <circle cx={CX} cy={CY} r={37} fill={mash} />
        {[30, 23, 16].map((r) => (
          <path key={r} d={`M${CX - r} ${CY + 4} A ${r} ${r} 0 0 1 ${CX + r} ${CY - 2}`} fill="none" stroke="#c9b27a" strokeOpacity="0.6" strokeWidth="1.6" strokeLinecap="round" />
        ))}
        <Grains c={c} n={30} r={32} colors={[c.b, shade(c.b, 0.15)]} />
        <circle cx={CX + 4} cy={CY - 3} r={11} fill="#8a5a32" />
        <ellipse cx={CX + 1} cy={CY - 6} rx={4} ry={2.4} fill="#b07d52" />
      </>
    );
  },

  salad: (c) => (
    <>
      <Plate c={c} />
      <circle cx={CX} cy={CY} r={38} fill="#b9d58f" opacity="0.55" />
      {Array.from({ length: 28 }, (_, i) => {
        const [x, y] = inDisc(c.rng, 32);
        const s = 2 + c.rng() * 0.8;
        return <path key={i} d={LEAF} fill={GREENS[i % GREENS.length]} stroke="#4f7a3a" strokeOpacity="0.25" strokeWidth="0.4" transform={`translate(${x} ${y}) rotate(${c.rng() * 360}) scale(${s}) translate(-5 0)`} />;
      })}
      <Blobs c={c} n={5} r={28} colors={[c.a]} size={[4, 6]} />
      {Array.from({ length: 5 }, (_, i) => {
        const [x, y] = inDisc(c.rng, 28);
        return <rect key={i} x={x - 3} y={y - 3} width="6" height="6" rx="1.2" fill={i % 2 ? '#fffaf0' : c.b} transform={`rotate(${c.rng() * 90} ${x} ${y})`} />;
      })}
    </>
  ),

  bowl: (c) => {
    const colors = [c.a, '#fbf7ec', c.b, '#7fae5a', tint(c.a, 0.45)];
    return (
      <>
        <Bowl c={c} fill="#fbf7ec" />
        {colors.map((col, i) => (
          <path key={i} d={sector(42, -90 + i * 72, -90 + (i + 1) * 72)} fill={col} stroke="#fffaf0" strokeWidth="1.5" />
        ))}
        <g clipPath={`url(#${c.uid}-inner)`}>
          <Grains c={c} n={40} r={40} colors={['#00000022']} />
        </g>
        <circle cx={CX} cy={CY} r={10} fill="#fffaf0" />
        <circle cx={CX} cy={CY} r={5} fill="#f2b134" />
      </>
    );
  },

  pan: (c) => (
    <>
      <rect x="146" y="68" width="60" height="14" rx="7" fill="#3a3532" />
      <circle cx={CX} cy={CY} r={53} fill="#3d3835" filter={`url(#${c.uid}-sh)`} />
      <circle cx={CX} cy={CY} r={47} fill="#2c2826" />
      <circle cx={CX} cy={CY} r={43} fill={c.a} />
      <Blobs c={c} n={9} r={30} colors={[c.b, tint(c.b, 0.3), shade(c.a, 0.12)]} size={[5, 10]} />
      <Leaves c={c} n={5} r={30} />
    </>
  ),

  ovendish: (c) => (
    <>
      <rect x="18" y="60" width="20" height="30" rx="6" fill="#e9e0cf" />
      <rect x="162" y="60" width="20" height="30" rx="6" fill="#e9e0cf" />
      <rect x="30" y="26" width="140" height="98" rx="16" fill={`url(#${c.uid}-plate)`} filter={`url(#${c.uid}-sh)`} />
      <rect x="40" y="36" width="120" height="78" rx="9" fill={c.a} />
      <g clipPath={`url(#${c.uid}-tray)`}>
        {Array.from({ length: 16 }, (_, i) => {
          const x = 44 + c.rng() * 112, y = 40 + c.rng() * 70;
          const rx = 6 + c.rng() * 10;
          return <ellipse key={i} cx={x} cy={y} rx={rx} ry={rx * 0.6} fill={i % 3 ? shade(c.a, 0.2) : tint(c.a, 0.4)} opacity="0.75" transform={`rotate(${c.rng() * 180} ${x} ${y})`} />;
        })}
        <Blobs c={c} n={5} r={34} colors={[c.b]} size={[3, 5]} />
      </g>
      <Leaves c={c} n={4} r={30} />
    </>
  ),

  pizza: (c) => (
    <>
      <circle cx={CX} cy={CY} r={54} fill={CRUST} filter={`url(#${c.uid}-sh)`} />
      <circle cx={CX} cy={CY} r={54} fill="none" stroke={shade(CRUST, 0.18)} strokeWidth="2" />
      <circle cx={CX} cy={CY} r={45} fill={c.a} />
      <Blobs c={c} n={8} r={34} colors={['#fbf1d6', '#f6e6c0']} size={[6, 10]} />
      <Blobs c={c} n={8} r={36} colors={[c.b, shade(c.b, 0.15)]} size={[3.5, 4.5]} />
      <Leaves c={c} n={4} r={32} />
      {[0, 45, 90, 135].map((deg) => {
        const r = (deg * Math.PI) / 180;
        return <line key={deg} x1={CX - Math.cos(r) * 52} y1={CY - Math.sin(r) * 52} x2={CX + Math.cos(r) * 52} y2={CY + Math.sin(r) * 52} stroke={shade(CRUST, 0.35)} strokeWidth="1.1" opacity="0.35" />;
      })}
    </>
  ),

  tart: (c) => {
    const body = (key: string) => (
      <g key={key}>
        <circle cx={CX} cy={CY} r={49} fill={CRUST} />
        {Array.from({ length: 22 }, (_, i) => {
          const t = (i / 22) * Math.PI * 2;
          return <circle key={i} cx={CX + Math.cos(t) * 48} cy={CY + Math.sin(t) * 48} r={5.5} fill={CRUST} />;
        })}
        <circle cx={CX} cy={CY} r={41} fill={c.a} />
        <circle cx={CX} cy={CY} r={41} fill="none" stroke={shade(CRUST, 0.15)} strokeWidth="1.5" />
        {[
          [88, 66, 9], [114, 82, 11], [96, 92, 7], [118, 58, 7], [76, 84, 8],
        ].map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.7} fill={shade(c.a, 0.15)} opacity="0.55" />)}
        {[
          [100, 72], [84, 82], [110, 94], [122, 70], [90, 58], [72, 70],
        ].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={4} fill={c.b} />)}
      </g>
    );
    return (
      <>
        {/* Shadow outside the clip, so it follows the cut shapes. */}
        <g filter={`url(#${c.uid}-sh)`}>
          <g clipPath={`url(#${c.uid}-tartmain)`}>{body('m')}</g>
        </g>
        <g filter={`url(#${c.uid}-sh)`} transform="translate(10 -6)">
          <g clipPath={`url(#${c.uid}-tartslice)`}>{body('s')}</g>
        </g>
      </>
    );
  },

  wrap: (c) => {
    const one = (x: number, y: number, key: string) => (
      <g key={key} transform={`translate(${x} ${y}) rotate(-18)`}>
        <rect x="-38" y="-14" width="72" height="28" rx="14" fill="#ecd3a0" stroke="#d8b679" strokeWidth="1" />
        {[-24, -8, 10].map((dx) => <ellipse key={dx} cx={dx} cy={(dx % 3) * 2} rx="3.5" ry="2" fill="#d6aa62" opacity="0.7" />)}
        <path d="M-30 -10 C -12 -4, 6 -12, 24 -8" fill="none" stroke="#d8b679" strokeWidth="1.2" />
        <ellipse cx="34" cy="0" rx="8" ry="14" fill="#f3e2bd" />
        <ellipse cx="34.5" cy="0" rx="6" ry="11.5" fill={c.a} />
        <circle cx="34" cy="-5" r="2.6" fill={c.b} />
        <circle cx="36" cy="3" r="2.4" fill="#7fae5a" />
        <circle cx="33" cy="6" r="2" fill={c.b} />
      </g>
    );
    return (
      <>
        <Plate c={c} />
        {one(96, 60, 'a')}
        {one(102, 92, 'b')}
      </>
    );
  },

  burger: (c) => (
    <>
      <Plate c={c} />
      {Array.from({ length: 8 }, (_, i) => {
        const x = 132 + (i % 4) * 6 + c.rng() * 4, y = 80 + c.rng() * 10;
        return <rect key={i} x={x - 2.5} y={y - 15} width="5" height="30" rx="1.5" fill="#f2c14e" stroke="#d9a32c" strokeWidth="0.8" transform={`rotate(${-35 + c.rng() * 70} ${x} ${y})`} />;
      })}
      <circle cx="136" cy="48" r="11" fill="#fffaf0" stroke="#e5dccb" strokeWidth="1" />
      <circle cx="136" cy="48" r="7.5" fill={c.a} />
      {Array.from({ length: 14 }, (_, i) => {
        const t = (i / 14) * Math.PI * 2;
        return <circle key={i} cx={86 + Math.cos(t) * 33} cy={76 + Math.sin(t) * 33} r={6} fill="#7fae5a" />;
      })}
      <circle cx="86" cy="76" r="32" fill={`url(#${c.uid}-bun)`} />
      {Array.from({ length: 14 }, (_, i) => {
        const [x, y] = inDisc(c.rng, 22, 86, 74);
        return <ellipse key={i} cx={x} cy={y} rx="2" ry="1.1" fill="#fbf1d8" transform={`rotate(${c.rng() * 180} ${x} ${y})`} />;
      })}
    </>
  ),
};

/**
 * Deterministic top-down illustration of the dish: its shape follows the
 * kind of dish (soup, pasta, pizza, …) and the colours come from the
 * recipe's palette.
 */
export function DishCover({ recipe, className, rounded }: { recipe: Recipe; className?: string; rounded?: string }) {
  const [a, b] = recipe.palette ?? ['#c9a27e', '#5b7f4a'];
  const uid = `d${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const rng = mulberry32(hashString(recipe.id));
  const shape = dishShape(recipe);
  const shiftX = (rng() - 0.5) * 24;
  const turn = shape === 'ovendish' || shape === 'pan' ? (rng() - 0.5) * 10 : rng() * 360;
  const c: Ctx = { a, b, rng, uid };
  return (
    <div className={['relative overflow-hidden', rounded, className].filter(Boolean).join(' ')} style={{ background: tint(a, 0.72) }} aria-hidden data-dish={shape}>
      <svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <defs>
          <radialGradient id={`${uid}-plate`} cx="45%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#fffdf8" />
            <stop offset="100%" stopColor="#efe6d6" />
          </radialGradient>
          <radialGradient id={`${uid}-bun`} cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#eab468" />
            <stop offset="100%" stopColor="#b8742c" />
          </radialGradient>
          <filter id={`${uid}-sh`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="2" dy="5" stdDeviation="5" floodColor="#2a2420" floodOpacity="0.18" />
          </filter>
          <clipPath id={`${uid}-inner`}>
            <circle cx={CX} cy={CY} r={42} />
          </clipPath>
          <clipPath id={`${uid}-tray`}>
            <rect x="40" y="36" width="120" height="78" rx="9" />
          </clipPath>
          <clipPath id={`${uid}-tartmain`}>
            <path d={sector(70, -10, 310)} />
          </clipPath>
          <clipPath id={`${uid}-tartslice`}>
            <path d={sector(70, -50, -10)} />
          </clipPath>
        </defs>
        <circle cx={shiftX + 170} cy={20} r={34} fill={tint(a, 0.55)} opacity="0.5" />
        <circle cx={shiftX + 18} cy={138} r={26} fill={tint(b, 0.5)} opacity="0.45" />
        <g transform={`translate(${shiftX} 0) rotate(${turn} ${CX} ${CY})`}>{DISHES[shape](c)}</g>
      </svg>
    </div>
  );
}
