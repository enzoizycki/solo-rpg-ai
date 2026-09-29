"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MASTER_PROFILES, getProfile } from "@/lib/profiles";
import DiceRoll from "@/components/DiceRoll";
import DiceTray, { type RollRequest, type TrayResult } from "@/components/DiceTray";
import CharacterSheet, { type SheetState } from "@/components/CharacterSheet";
import type { ChatMessage, CharacterData, GameInfo } from "@/lib/types";

let msgCounter = 0;
const uid = () => `m${Date.now()}_${msgCounter++}`;

type Panel = "none" | "sheet" | "dice";

export default function PlayStep({ game }: { game: GameInfo }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [profile, setProfile] = useState(game.masterProfile);
  const [request, setRequest] = useState<RollRequest>(null);
  const [panel, setPanel] = useState<Panel>("none");
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const sendingRef = useRef(false);
  const requestSeq = useRef(0);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void send({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeProfile(id: string) {
    setProfile(id);
    await fetch(`/api/games/${game.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterProfile: id }),
    });
  }

  async function send(opts: { text?: string; diceResult?: TrayResult }) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const trimmed = (opts.text ?? "").trim();
    const dr = opts.diceResult;

    if (dr) {
      // Keep the request visible when the player rolled something else,
      // so they can restore it and roll the right dice.
      if (!dr.requested || dr.matchedRequest !== false) setRequest(null);
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "user",
          content: "",
          dice: { ...dr, by: "player", animate: false },
        },
      ]);
    }
    if (trimmed) {
      setMessages((m) => [...m, { id: uid(), role: "user", content: trimmed }]);
    }
    setInput("");
    setSending(true);

    const assistantId = uid();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "" }]);

    const appendText = (t: string) =>
      setMessages((m) =>
        m.map((x) => (x.id === assistantId ? { ...x, content: x.content + t } : x)),
      );

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id, message: trimmed, diceResult: dr }),
      });
      if (!res.body) throw new Error("Sem resposta do Mestre");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const line = block.trim();
          if (!line.startsWith("data:")) continue;
          let evt: {
            type: string;
            text?: string;
            notation?: string;
            total?: number;
            detail?: string;
            reason?: string;
            rolls?: number[];
            name?: string;
            data?: CharacterData;
            complete?: boolean;
            query?: string;
          };
          try {
            evt = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }

          if (evt.type === "text" && evt.text) {
            appendText(evt.text);
          } else if (evt.type === "dice") {
            // Master roll: insert the animated card before the streaming reply.
            const card: ChatMessage = {
              id: uid(),
              role: "assistant",
              content: "",
              dice: {
                notation: evt.notation ?? "",
                total: evt.total ?? 0,
                detail: evt.detail ?? "",
                reason: evt.reason ?? "",
                rolls: evt.rolls,
                by: "gm",
              },
            };
            setMessages((m) => {
              const idx = m.findIndex((x) => x.id === assistantId);
              const copy = [...m];
              copy.splice(idx, 0, card);
              return copy;
            });
          } else if (evt.type === "roll_request" && evt.notation) {
            requestSeq.current += 1;
            setRequest({
              id: requestSeq.current,
              notation: evt.notation,
              reason: evt.reason ?? "Rolagem",
            });
            setPanel("dice");
          } else if (evt.type === "consult") {
            setMessages((m) =>
              m.map((x) =>
                x.id === assistantId ? { ...x, note: `📖 Consultou o livro: “${evt.query}”` } : x,
              ),
            );
          } else if (evt.type === "character" && evt.name) {
            setSheet({ name: evt.name, data: evt.data ?? {}, complete: Boolean(evt.complete) });
          } else if (evt.type === "error" && evt.text) {
            appendText(`\n\n⚠️ ${evt.text}`);
          }
        }
      }
    } catch {
      appendText("⚠️ O Mestre hesitou... tente novamente.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const activeProfile = getProfile(profile);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="relative z-30 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-soft)]/95 backdrop-blur px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[var(--gold)] truncate">Grimório · {game.title}</div>
          {game.systemName && (
            <div className="text-[11px] text-[var(--muted)] truncate">
              Jogo identificado: <span className="text-[var(--gold-soft)]">{game.systemName}</span>
              {game.pageCount ? ` · livro com ${game.pageCount} páginas` : ""}
            </div>
          )}
        </div>
        <label className="hidden sm:flex items-center gap-2 text-xs text-[var(--muted)]">
          Estilo
          <select
            value={profile}
            onChange={(e) => changeProfile(e.target.value)}
            className="rounded-lg bg-[var(--panel)] border border-[var(--border)] px-2 py-1.5 text-sm text-[var(--text)] outline-none focus:border-[var(--purple)]"
            title={activeProfile.description}
          >
            {MASTER_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.emoji} {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setPanel(panel === "sheet" ? "none" : "sheet")}
          className="lg:hidden rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm"
        >
          📜
        </button>
        <button
          onClick={() => setPanel(panel === "dice" ? "none" : "dice")}
          className={`xl:hidden rounded-lg border px-2.5 py-1.5 text-sm ${
            request ? "border-[var(--gold)] text-[var(--gold)] animate-pulse" : "border-[var(--border)]"
          }`}
        >
          🎲
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Pinned character sheet */}
        <aside
          className={`${
            panel === "sheet" ? "fixed inset-y-0 left-0 z-40 shadow-2xl" : "hidden"
          } lg:static lg:block w-72 shrink-0 border-r border-[var(--border)] bg-[var(--bg-soft)]`}
        >
          <CharacterSheet sheet={sheet} systemName={game.systemName ?? ""} />
        </aside>

        {/* Chat */}
        <main className="flex-1 flex flex-col min-w-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto parchment-scroll px-4 py-6">
            <div className="mx-auto max-w-2xl space-y-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} m={m} />
              ))}
              {sending &&
                messages[messages.length - 1]?.role === "assistant" &&
                !messages[messages.length - 1]?.content && (
                  <div className="flex gap-1 text-[var(--gold)] pl-2">
                    <span className="typing-dot">●</span>
                    <span className="typing-dot" style={{ animationDelay: "0.2s" }}>●</span>
                    <span className="typing-dot" style={{ animationDelay: "0.4s" }}>●</span>
                  </div>
                )}
            </div>
          </div>

          <div className="border-t border-[var(--border)] bg-[var(--bg-soft)]/80 backdrop-blur px-4 py-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim() && !sending) send({ text: input });
              }}
              className="mx-auto max-w-2xl flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim() && !sending) send({ text: input });
                  }
                }}
                placeholder={
                  request
                    ? "O Mestre pediu uma rolagem — use a bandeja de dados ao lado."
                    : "Responda ao Mestre, descreva ações ou pergunte sobre as regras..."
                }
                rows={1}
                className="flex-1 resize-none rounded-xl bg-[var(--panel)] border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--purple)] max-h-40 parchment-scroll"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="rounded-xl bg-gradient-to-r from-[var(--gold)] to-[var(--gold-soft)] text-[#2a1e08] font-semibold px-5 py-3 hover:brightness-105 transition disabled:opacity-50"
              >
                Enviar
              </button>
            </form>
          </div>
        </main>

        {/* Dice tray beside the chat */}
        <aside
          className={`${
            panel === "dice" ? "fixed inset-y-0 right-0 z-40 shadow-2xl" : "hidden"
          } xl:static xl:block w-80 shrink-0 border-l border-[var(--border)] bg-[var(--bg-soft)]`}
        >
          <DiceTray
            request={request}
            disabled={sending}
            onSend={(r) => {
              send({ diceResult: r });
            }}
          />
        </aside>

        {panel !== "none" && (
          <div
            className="fixed inset-0 z-30 bg-black/50 xl:hidden"
            onClick={() => setPanel("none")}
          />
        )}
      </div>
    </div>
  );
}

function MessageBubble({ m }: { m: ChatMessage }) {
  if (m.dice) return <DiceRoll dice={m.dice} />;
  if (!m.content && m.role === "user") return null;
  if (!m.content && !m.note) return null;

  const isUser = m.role === "user";
  return (
    <div className={`flex fade-up ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-[var(--purple)]/20 border border-[var(--purple)]/30 rounded-br-sm"
            : "bg-[var(--panel)] border border-[var(--border)] rounded-bl-sm"
        }`}
      >
        {!isUser && (
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--gold)] mb-1">
            Mestre
          </div>
        )}
        {m.note && <div className="text-[11px] text-[var(--muted)] italic mb-1">{m.note}</div>}
        <div className="whitespace-pre-wrap leading-relaxed text-[var(--text)]">
          {m.content.replace(/\*\*(.+?)\*\*/g, "$1")}
        </div>
      </div>
    </div>
  );
}
