"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Die, diceList } from "@/components/DiceRoll";
import { buildNotation, parseNotationParts } from "@/lib/dice";

export type TrayResult = {
  notation: string;
  total: number;
  rolls: number[];
  detail: string;
  reason: string;
  requested: boolean;
  matchedRequest?: boolean;
};

export type RollRequest = { id: number; notation: string; reason: string } | null;

const DIE_TYPES = [4, 6, 8, 10, 12, 20, 100];

export default function DiceTray({
  request,
  disabled,
  onSend,
}: {
  request: RollRequest;
  disabled: boolean;
  onSend: (r: TrayResult) => void;
}) {
  const [sides, setSides] = useState(20);
  const [count, setCount] = useState(1);
  const [mod, setMod] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<TrayResult | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const rollingRef = useRef(false);
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  const notation = buildNotation(count, sides, mod);
  const specs = useMemo(() => diceList(notation), [notation]);

  // Load the Master's request into the controls, but keep them editable.
  useEffect(() => {
    setResult(null);
    setSent(false);
    setError("");
    if (request) {
      const p = parseNotationParts(request.notation);
      setCount(p.count);
      setSides(p.sides);
      setMod(p.mod);
    }
  }, [request?.id, request?.notation]);

  const matchesRequest = Boolean(
    request && notation.toLowerCase() === request.notation.replace(/\s+/g, "").toLowerCase(),
  );

  function resetToRequest() {
    if (!request) return;
    const p = parseNotationParts(request.notation);
    setCount(p.count);
    setSides(p.sides);
    setMod(p.mod);
    setResult(null);
    setSent(false);
  }

  function touch() {
    setResult(null);
    setSent(false);
    setError("");
  }

  async function roll() {
    if (rollingRef.current) return;
    rollingRef.current = true;
    touch();
    setRolling(true);
    const started = Date.now();
    const current = request;
    const matched = matchesRequest;
    try {
      const res = await fetch("/api/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notation }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || "Notação inválida");
      const wait = Math.max(0, 1100 - (Date.now() - started));
      await new Promise((ok) => setTimeout(ok, wait));
      const out: TrayResult = {
        notation: r.notation,
        total: r.total,
        rolls: r.rolls,
        detail: r.detail,
        reason: current ? current.reason : "Rolagem livre do jogador",
        requested: Boolean(current),
        matchedRequest: matched,
      };
      setResult(out);
      // Auto-send only when it answers exactly what the Master asked.
      if (current && matched) {
        setSent(true);
        setTimeout(() => onSendRef.current(out), 450);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível rolar. Tente de novo.");
    } finally {
      rollingRef.current = false;
      setRolling(false);
    }
  }

  const visible = specs.slice(0, 10);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <h2 className="font-serif text-[var(--gold)] text-lg">Bandeja de dados</h2>
      </div>

      <div className="flex-1 overflow-y-auto parchment-scroll p-4 space-y-4">
        {request && (
          <div className="rounded-xl border border-[var(--gold)]/60 bg-[var(--gold)]/10 p-3 fade-up">
            <div className="text-[10px] uppercase tracking-wider text-[var(--gold)]">
              O Mestre pede uma rolagem
            </div>
            <div className="text-sm font-medium mt-0.5">{request.reason}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-[var(--muted)]">{request.notation}</span>
              {!matchesRequest && (
                <button
                  onClick={resetToRequest}
                  className="text-[11px] text-[var(--gold)] underline underline-offset-2 hover:brightness-110"
                >
                  restaurar pedido
                </button>
              )}
            </div>
            {!matchesRequest && (
              <p className="text-[11px] text-[var(--muted)] mt-1.5">
                Você alterou o dado. Pode rolar assim mesmo e enviar ao Mestre.
              </p>
            )}
          </div>
        )}

        {/* Stage */}
        <div className="rounded-2xl border border-[var(--border)] bg-[radial-gradient(circle_at_50%_35%,#2b2247,#15101f)] min-h-44 flex flex-col items-center justify-center gap-3 p-4">
          <div className="flex flex-wrap justify-center gap-2">
            {visible.map((s, i) => (
              <Die
                key={`${notation}-${i}`}
                sides={s}
                value={result ? (result.rolls[i] ?? null) : null}
                rolling={rolling}
                size={visible.length > 4 ? 48 : 68}
              />
            ))}
            {specs.length > visible.length && (
              <span className="text-xs text-[var(--muted)] self-center">
                +{specs.length - visible.length}
              </span>
            )}
          </div>
          <div className="text-center min-h-12">
            {result ? (
              <>
                <div className="font-serif text-3xl font-bold text-[var(--gold)] dice-pop">
                  {result.total}
                </div>
                <div className="text-[11px] text-[var(--muted)]">{result.detail}</div>
              </>
            ) : (
              <div className="text-xs text-[var(--muted)]">{rolling ? "Rolando..." : notation}</div>
            )}
          </div>
        </div>

        {/* Controls are always available, with or without a request. */}
        <div>
          <div className="text-xs text-[var(--gold-soft)] mb-1.5">Dado</div>
          <div className="grid grid-cols-4 gap-1.5">
            {DIE_TYPES.map((d) => (
              <button
                key={d}
                onClick={() => {
                  setSides(d);
                  touch();
                }}
                className={`rounded-lg border py-1.5 text-xs transition ${
                  sides === d
                    ? "border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--gold)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--gold)]/60"
                }`}
              >
                d{d}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stepper
            label="Quantidade"
            value={count}
            min={1}
            max={10}
            onChange={(v) => {
              setCount(v);
              touch();
            }}
          />
          <Stepper
            label="Modificador"
            value={mod}
            min={-20}
            max={20}
            signed
            onChange={(v) => {
              setMod(v);
              touch();
            }}
          />
        </div>

        <button
          onClick={roll}
          disabled={rolling || disabled || sent}
          className="w-full rounded-xl bg-gradient-to-r from-[var(--gold)] to-[var(--gold-soft)] text-[#2a1e08] font-semibold py-3 hover:brightness-105 transition disabled:opacity-50"
        >
          {rolling ? "Rolando..." : disabled ? "Aguarde o Mestre..." : `🎲 Rolar ${notation}`}
        </button>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Free roll (or a changed request) is sent manually. */}
        {result && !sent && (
          <button
            onClick={() => {
              setSent(true);
              onSendRef.current(result);
            }}
            disabled={disabled}
            className="w-full rounded-xl border border-[var(--purple)]/60 bg-[var(--purple)]/15 py-2.5 text-sm hover:bg-[var(--purple)]/25 transition disabled:opacity-50"
          >
            Enviar {result.notation} = {result.total} ao Mestre
          </button>
        )}
        {sent && (
          <p className="text-center text-xs text-[var(--muted)]">Resultado enviado ao Mestre.</p>
        )}
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  signed,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  signed?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-[var(--gold-soft)] mb-1.5">{label}</div>
      <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--panel)]">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          className="px-3 py-1.5 text-[var(--muted)] hover:text-[var(--gold)]"
        >
          −
        </button>
        <span className="flex-1 text-center text-sm">
          {signed && value > 0 ? `+${value}` : value}
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          className="px-3 py-1.5 text-[var(--muted)] hover:text-[var(--gold)]"
        >
          +
        </button>
      </div>
    </div>
  );
}
