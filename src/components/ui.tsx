import { Minus, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { hashString, mulberry32 } from '../lib/selection';
import type { Recipe } from '../types';

export const cx = (...xs: unknown[]) => xs.filter((x): x is string => typeof x === 'string' && x.length > 0).join(' ');

// ---------- Recipe cover ----------

function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
}

/**
 * Licensed photo when available (small or large variant), otherwise — or when
 * the photo can't load, e.g. offline — a deterministic top-down "plate"
 * illustration built from the recipe's palette.
 */
export function RecipeCover({
  recipe,
  className,
  rounded = 'rounded-3xl',
  size = 'sm',
}: {
  recipe: Recipe;
  className?: string;
  rounded?: string;
  size?: 'sm' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (recipe.image && !failed) {
    const src = size === 'lg' ? recipe.image.url : (recipe.image.thumbUrl ?? recipe.image.url);
    return (
      <div className={cx('relative overflow-hidden', rounded, className)} style={{ background: recipe.palette ? tint(recipe.palette[0], 0.6) : '#efe4d3' }}>
        <img
          src={src}
          alt={recipe.image.alt}
          loading={size === 'lg' ? 'eager' : 'lazy'}
          decoding="async"
          ref={(el) => {
            // Cached images can finish before React attaches onLoad.
            if (el?.complete && el.naturalWidth > 0 && !loaded) setLoaded(true);
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cx('h-full w-full object-cover transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0')}
        />
      </div>
    );
  }
  return <IllustratedCover recipe={recipe} className={className} rounded={rounded} />;
}

function IllustratedCover({ recipe, className, rounded }: { recipe: Recipe; className?: string; rounded: string }) {
  const [a, b] = recipe.palette ?? ['#c9a27e', '#5b7f4a'];
  const rng = mulberry32(hashString(recipe.id));
  const blobs = Array.from({ length: 9 }, (_, i) => {
    const angle = rng() * Math.PI * 2;
    const dist = 8 + rng() * 22;
    return {
      cx: 100 + Math.cos(angle) * dist,
      cy: 75 + Math.sin(angle) * dist * 0.9,
      rx: 7 + rng() * 9,
      ry: 5 + rng() * 7,
      rot: rng() * 180,
      fill: i % 3 === 0 ? b : i % 3 === 1 ? tint(b, 0.35) : tint(a, 0.15),
    };
  });
  const leaves = Array.from({ length: 5 }, () => ({ x: 70 + rng() * 60, y: 50 + rng() * 50, r: rng() * 180 }));
  const plateX = 100 + (rng() - 0.5) * 30;
  return (
    <div className={cx('relative overflow-hidden', rounded, className)} style={{ background: tint(a, 0.72) }} aria-hidden>
      <svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <defs>
          <radialGradient id={`plate-${recipe.id}`} cx="45%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#fffdf8" />
            <stop offset="100%" stopColor="#efe6d6" />
          </radialGradient>
          <filter id={`sh-${recipe.id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="2" dy="5" stdDeviation="5" floodColor="#2a2420" floodOpacity="0.18" />
          </filter>
        </defs>
        <circle cx={plateX + 70} cy={20} r={34} fill={tint(a, 0.55)} opacity="0.5" />
        <circle cx={plateX - 82} cy={138} r={26} fill={tint(b, 0.5)} opacity="0.45" />
        <g transform={`translate(${plateX - 100} 0)`}>
          <circle cx="100" cy="75" r="56" fill={`url(#plate-${recipe.id})`} filter={`url(#sh-${recipe.id})`} />
          <circle cx="100" cy="75" r="44" fill={a} />
          <circle cx="100" cy="75" r="44" fill="none" stroke={tint(a, 0.25)} strokeWidth="2" opacity="0.6" />
          {blobs.map((bl, i) => (
            <ellipse key={i} cx={bl.cx} cy={bl.cy} rx={bl.rx} ry={bl.ry} fill={bl.fill} transform={`rotate(${bl.rot} ${bl.cx} ${bl.cy})`} opacity="0.95" />
          ))}
          {leaves.map((l, i) => (
            <path key={i} d="M0 0 C 3 -4, 8 -4, 10 0 C 8 4, 3 4, 0 0 Z" fill="#6f9a52" transform={`translate(${l.x} ${l.y}) rotate(${l.r}) scale(0.9)`} />
          ))}
        </g>
      </svg>
    </div>
  );
}

// ---------- Primitives ----------

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100',
        size === 'sm' && 'min-h-[36px] px-3.5 text-sm',
        size === 'md' && 'min-h-[44px] px-4 text-[15px]',
        size === 'lg' && 'min-h-[54px] px-6 text-base',
        variant === 'primary' && 'bg-herb-600 text-white shadow-card hover:bg-herb-700',
        variant === 'secondary' && 'bg-white text-ink-900 shadow-card ring-1 ring-cream-200 hover:bg-cream-50',
        variant === 'ghost' && 'text-ink-700 hover:bg-cream-200/60',
        variant === 'danger' && 'bg-tomato-500 text-white hover:bg-tomato-600',
        className,
      )}
    />
  );
}

export function IconButton({ label, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...props}
      className={cx('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90', className)}
    >
      {children}
    </button>
  );
}

export function Chip({ active, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      aria-pressed={active}
      {...props}
      className={cx(
        'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition active:scale-95',
        active ? 'bg-ink-900 text-cream-50' : 'bg-white text-ink-700 ring-1 ring-cream-200 hover:ring-cream-300',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Stepper({ value, min, max, onChange, label, suffix }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string; suffix?: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-cream-200" role="group" aria-label={label}>
      <IconButton label={`${label} verlagen`} className="h-9 w-9 hover:bg-cream-100" disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus size={16} />
      </IconButton>
      <span className="min-w-[4.5rem] text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {value} {suffix}
      </span>
      <IconButton label={`${label} verhogen`} className="h-9 w-9 hover:bg-cream-100" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus size={16} />
      </IconButton>
    </div>
  );
}

export function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-cream-200', className)} role="progressbar" aria-valuenow={value} aria-valuemax={max} aria-valuemin={0}>
      <div className={cx('h-full rounded-full transition-all duration-500', value >= max ? 'bg-herb-500' : 'bg-saffron-500')} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Bottom sheet on mobile, centred dialog on desktop. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-cream-50 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-lift outline-none animate-rise sm:rounded-[28px]"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-cream-300 sm:hidden" />
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-semibold text-ink-900">{title}</h2>
          <IconButton label="Sluiten" onClick={onClose} className="-mr-2 -mt-2 hover:bg-cream-200">
            <X size={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export function TargetPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Aantal kookavonden">
      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
        <button
          key={n}
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          className={cx(
            'h-11 flex-1 rounded-2xl text-base font-semibold tabular-nums transition active:scale-95',
            value === n ? 'bg-herb-600 text-white shadow-card' : 'bg-white text-ink-700 ring-1 ring-cream-200 hover:ring-cream-300',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cream-200 text-ink-500">{icon}</div>
      <h3 className="font-display text-lg font-semibold text-ink-900">{title}</h3>
      {children && <div className="mt-1.5 max-w-xs text-sm text-ink-500">{children}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, right }: { eyebrow?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 px-5 pb-4 pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[13px] font-medium uppercase tracking-wider text-ink-500">{eyebrow}</div>}
        <h1 className="font-display text-[28px] font-semibold leading-tight text-ink-900">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function minutesLabel(r: Recipe): string {
  return `${r.prepMinutes + r.cookMinutes} min`;
}
