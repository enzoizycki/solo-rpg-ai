"use client";

import { useEffect, useMemo, useState } from "react";
import { parseDiceGroups } from "@/lib/dice";

type Shape = {
  pts?: string;
  rect?: boolean;
  inner?: string;
  lines: number[][];
  ty: number;
  fs: number;
};

/** Silhouette for each polyhedral die (viewBox 0 0 100 100). */
export function shapeFor(sides: number): Shape {
  switch (sides) {
    case 4:
      return {
        pts: "50,10 92,84 8,84",
        lines: [
          [50, 10, 50, 59],
          [8, 84, 50, 59],
          [92, 84, 50, 59],
        ],
        ty: 72,
        fs: 24,
      };
    case 6:
      return { rect: true, lines: [], ty: 63, fs: 32 };
    case 8:
      return {
        pts: "50,5 90,50 50,95 10,50",
        lines: [
          [10, 50, 90, 50],
          [50, 5, 30, 50],
          [50, 5, 70, 50],
          [50, 95, 30, 50],
          [50, 95, 70, 50],
        ],
        ty: 60,
        fs: 24,
      };
    case 10:
    case 100:
      return {
        pts: "50,4 89,39 50,96 11,39",
        lines: [
          [11, 39, 50, 58],
          [89, 39, 50, 58],
          [50, 4, 50, 58],
        ],
        ty: 44,
        fs: sides === 100 ? 19 : 23,
      };
    case 12:
      return {
        pts: "50,8 91.9,38.4 75.9,87.6 24.1,87.6 8.2,38.4",
        inner: "50,30 68.5,43.5 61.4,65.3 38.6,65.3 31.5,43.5",
        lines: [
          [50, 8, 50, 30],
          [91.9, 38.4, 68.5, 43.5],
          [75.9, 87.6, 61.4, 65.3],
          [24.1, 87.6, 38.6, 65.3],
          [8.2, 38.4, 31.5, 43.5],
        ],
        ty: 60,
        fs: 24,
      };
    case 20:
      return {
        pts: "50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27",
        lines: [
          [50, 23, 27, 65],
          [27, 65, 73, 65],
          [73, 65, 50, 23],
          [50, 4, 50, 23],
          [89.8, 27, 73, 65],
          [10.2, 27, 27, 65],
          [89.8, 73, 73, 65],
          [10.2, 73, 27, 65],
          [50, 96, 50, 65],
        ],
        ty: 58,
        fs: 24,
      };
    default: {
      const n = Math.max(3, Math.min(sides, 8));
      const pts: string[] = [];
      for (let i = 0; i < n; i++) {
        const a = (-90 + (360 / n) * i) * (Math.PI / 180);
        pts.push(`${(50 + 44 * Math.cos(a)).toFixed(1)},${(52 + 44 * Math.sin(a)).toFixed(1)}`);
      }
      return { pts: pts.join(" "), lines: [], ty: 62, fs: 26 };
    }
  }
}

let gradCounter = 0;

/** A single polyhedral die. While `rolling`, it tumbles and flickers faces. */
export function Die({
  sides,
  value,
  rolling,
  size = 46,
}: {
  sides: number;
  value: number | null;
  rolling: boolean;
  size?: number;
}) {
  const shape = useMemo(() => shapeFor(sides), [sides]);
  const [gradId] = useState(() => `dg-${gradCounter++}`);
  const [face, setFace] = useState<number>(value ?? sides);

  useEffect(() => {
    if (!rolling) return;
    const iv = setInterval(() => setFace(1 + Math.floor(Math.random() * sides)), 70);
    return () => clearInterval(iv);
  }, [rolling, sides]);

  const shown = rolling ? face : (value ?? sides);
  const settled = !rolling && value != null;
  const glow = !settled
    ? "die-glow-normal"
    : sides === 20 && shown === 20
      ? "die-glow-crit"
      : sides === 20 && shown === 1
        ? "die-glow-fumble"
        : shown === sides
          ? "die-glow-max"
          : "die-glow-normal";

  return (
    <div
      className={`${rolling ? "die-tumbling" : settled ? "die-settled" : ""} ${glow}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#fbf0d8" />
            <stop offset="55%" stopColor="#e6d0a1" />
            <stop offset="100%" stopColor="#c9a86f" />
          </linearGradient>
        </defs>
        {shape.rect ? (
          <rect x="10" y="10" width="80" height="80" rx="16" fill={`url(#${gradId})`} stroke="#7a5a28" strokeWidth="3" />
        ) : (
          <polygon points={shape.pts} fill={`url(#${gradId})`} stroke="#7a5a28" strokeWidth="4" strokeLinejoin="round" />
        )}
        {shape.inner && (
          <polygon points={shape.inner} fill="none" stroke="#7a5a28" strokeOpacity="0.35" strokeWidth="2.5" />
        )}
        {shape.lines.map((l, i) => (
          <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} stroke="#7a5a28" strokeOpacity="0.3" strokeWidth="2.5" />
        ))}
        <text
          x="50"
          y={shape.ty}
          textAnchor="middle"
          fontSize={shape.fs}
          fontWeight="700"
          fill="#3a2a0c"
          style={{ fontFamily: "var(--font-cinzel), serif" }}
        >
          {shown}
        </text>
      </svg>
    </div>
  );
}

/** Expand a notation into the list of individual die sizes. */
export function diceList(notation: string): number[] {
  const out: number[] = [];
  for (const g of parseDiceGroups(notation)) {
    for (let i = 0; i < g.count; i++) out.push(g.sides);
  }
  return out.length ? out : [20];
}

type DiceInfo = {
  notation: string;
  total: number;
  detail: string;
  reason: string;
  rolls?: number[];
  by?: "gm" | "player";
  animate?: boolean;
};

/** Chat card for a roll (Master rolls animate; player rolls already animated in the tray). */
export default function DiceRoll({ dice }: { dice: DiceInfo }) {
  const specs = useMemo(() => diceList(dice.notation), [dice.notation]);
  const visible = specs.slice(0, 8);
  const animate = dice.animate !== false;
  const [settled, setSettled] = useState(animate ? 0 : visible.length);

  useEffect(() => {
    if (!animate) return;
    const timers = visible.map((_, i) =>
      setTimeout(() => setSettled((s) => Math.max(s, i + 1)), 850 + i * 130),
    );
    return () => timers.forEach(clearTimeout);
  }, [animate, visible]);

  const revealed = settled >= visible.length;
  const rolls = dice.rolls ?? [];
  const isCrit = rolls.some((r, i) => specs[i] === 20 && r === 20);
  const isFumble = rolls.some((r, i) => specs[i] === 20 && r === 1);

  return (
    <div className="flex justify-center fade-up my-1">
      <div className="dice-card flex items-center gap-4 rounded-2xl border border-[var(--purple)]/40 bg-gradient-to-br from-[var(--panel)] to-[var(--bg-soft)] px-4 py-2.5 shadow-lg max-w-full">
        <div className="flex items-center gap-1.5 flex-wrap">
          {visible.map((sides, i) => (
            <Die key={i} sides={sides} value={rolls[i] ?? null} rolling={i >= settled} size={38} />
          ))}
          {specs.length > visible.length && (
            <span className="text-xs text-[var(--muted)]">+{specs.length - visible.length}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
            {dice.by === "gm" ? "Mestre · " : "Você · "}
            {dice.reason || "Rolagem"}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-[var(--muted)]">{dice.notation} =</span>
            <span
              className={`font-serif text-xl font-bold ${
                !revealed
                  ? "text-[var(--muted)]"
                  : isCrit
                    ? "text-emerald-400 dice-pop"
                    : isFumble
                      ? "text-red-400 dice-pop"
                      : "text-[var(--gold)] dice-pop"
              }`}
            >
              {revealed ? dice.total : "…"}
            </span>
          </div>
          {revealed && <div className="text-[10px] text-[var(--muted)]">{dice.detail}</div>}
        </div>
      </div>
    </div>
  );
}
