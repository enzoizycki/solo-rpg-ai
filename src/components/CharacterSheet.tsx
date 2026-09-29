"use client";

import type { CharacterData } from "@/lib/types";

export type SheetState = {
  name: string;
  data: CharacterData;
  complete: boolean;
} | null;

export default function CharacterSheet({
  sheet,
  systemName,
}: {
  sheet: SheetState;
  systemName: string;
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <h2 className="font-serif text-[var(--gold)] text-lg">Ficha</h2>
        {sheet && (
          <span
            className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 border ${
              sheet.complete
                ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                : "border-[var(--gold)]/40 text-[var(--gold-soft)] bg-[var(--gold)]/5"
            }`}
          >
            {sheet.complete ? "📌 Completa" : "Em criação"}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto parchment-scroll p-4">
        {!sheet ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-5 text-center">
            <div className="text-3xl mb-2">📜</div>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              O Mestre vai montar sua ficha com você no chat
              {systemName ? `, seguindo as regras de ${systemName}` : ""}. Ela aparece aqui,
              atualizada a cada etapa.
            </p>
          </div>
        ) : (
          <div className="space-y-4 fade-up">
            <div>
              <div className="font-serif text-xl text-[var(--gold)] leading-tight">{sheet.name}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                {[sheet.data.race, sheet.data.class, sheet.data.level ? `Nível ${sheet.data.level}` : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {sheet.data.concept && (
                <p className="text-xs italic text-[var(--muted)] mt-1">{sheet.data.concept}</p>
              )}
            </div>

            {sheet.data.resources && (
              <div className="rounded-lg border border-red-400/30 bg-red-500/5 px-3 py-2 text-xs text-[var(--text)]">
                ❤️ {sheet.data.resources}
              </div>
            )}

            {sheet.data.attributes && Object.keys(sheet.data.attributes).length > 0 && (
              <div className="grid grid-cols-3 gap-1.5">
                {Object.entries(sheet.data.attributes).map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-1 py-1.5 text-center"
                  >
                    <div className="text-[9px] uppercase tracking-wide text-[var(--muted)] truncate" title={k}>
                      {k}
                    </div>
                    <div className="font-serif text-lg text-[var(--gold-soft)] leading-tight">{v}</div>
                  </div>
                ))}
              </div>
            )}

            <Block title="Perícias e habilidades" text={sheet.data.skills} />
            <Block title="Equipamento" text={sheet.data.equipment} />
            <Block title="História" text={sheet.data.background} />
            <Block title="Notas" text={sheet.data.notes} />
          </div>
        )}
      </div>
    </div>
  );
}

function Block({ title, text }: { title: string; text?: string }) {
  if (!text) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--gold-soft)] mb-1">{title}</div>
      <p className="text-xs text-[var(--text)]/90 leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  );
}
