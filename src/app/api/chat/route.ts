import { db } from "@/db";
import { games, characters, messages } from "@/db/schema";
import type { CharacterData } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  hasAI,
  buildSystemPrompt,
  rollDiceTool,
  requestPlayerRollTool,
  consultRulebookTool,
  setCharacterTool,
} from "@/lib/gm";
import { rollDice } from "@/lib/dice";
import { searchRules } from "@/lib/rules";
import { streamGemini, type GeminiContent, type GeminiPart } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function parseAttributes(raw: unknown): Record<string, string | number> | undefined {
  if (!raw) return undefined;
  if (typeof raw === "object") return raw as Record<string, string | number>;
  if (typeof raw !== "string") return undefined;
  const out: Record<string, string | number> = {};
  for (const chunk of raw.split(/[,;\n]/)) {
    const m = chunk.trim().match(/^(.+?)[:\s]+([+-]?\d+.*)$/);
    if (m) {
      const num = Number(m[2].trim());
      out[m[1].trim()] = Number.isNaN(num) ? m[2].trim() : num;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

type DiceIn = {
  notation: string;
  total: number;
  rolls: number[];
  detail: string;
  reason?: string;
  requested?: boolean;
  matchedRequest?: boolean;
};

/** Message sent to the Master describing a roll made by the player. */
function describeRoll(d: DiceIn): string {
  const value = `${d.notation} = ${d.total} (dados: ${d.detail})`;
  const label = d.reason || "Rolagem";
  if (d.requested && d.matchedRequest !== false) {
    return (
      `[ROLAGEM DO JOGADOR — atendendo ao seu pedido] ${label}: ${value}. ` +
      `Interprete este resultado conforme as regras e narre a consequência.`
    );
  }
  if (d.requested) {
    return (
      `[ROLAGEM DO JOGADOR — dado diferente do pedido] Você pediu outra rolagem, mas o jogador rolou: ${value}. ` +
      `Se servir para o teste pendente, use-a; caso contrário, avise em uma frase e peça novamente a rolagem correta com request_player_roll.`
    );
  }
  return (
    `[ROLAGEM LIVRE DO JOGADOR] O jogador rolou por conta própria: ${value}. ` +
    `Se houver um teste pendente ou uma ação óbvia em curso, interprete este resultado conforme as regras e narre a consequência. ` +
    `Se não fizer sentido agora, pergunte em uma frase curta para o que ele quer usar essa rolagem.`
  );
}

export async function POST(req: Request) {
  const body = await req.json();
  const gameId = Number(body.gameId);
  const userText = (body.message as string)?.trim() ?? "";
  const diceResult = body.diceResult as DiceIn | undefined;

  if (Number.isNaN(gameId)) {
    return Response.json({ error: "gameId inválido" }, { status: 400 });
  }

  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  if (!game) {
    return Response.json({ error: "Campanha não encontrada" }, { status: 404 });
  }
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.gameId, gameId));

  // A die rolled by the player on the dice tray is sent as an explicit message
  // so the Master knows exactly what to interpret.
  if (diceResult) {
    await db.insert(messages).values({
      gameId,
      role: "user",
      content: describeRoll(diceResult),
      meta: { dice: true, ...diceResult },
    });
  }
  if (userText) {
    await db.insert(messages).values({ gameId, role: "user", content: userText });
  }

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.gameId, gameId))
    .orderBy(asc(messages.createdAt));

  const systemPrompt = buildSystemPrompt({
    profileId: game.masterProfile,
    rulesText: game.rulesText,
    gameTitle: game.title,
    systemName: game.systemName,
    systemSummary: game.systemSummary,
    characterName: character?.name ?? "",
    characterData: character?.data ?? {},
    hasCharacter: Boolean(character),
    characterComplete: Boolean(character?.complete),
  });

  const encoder = new TextEncoder();
  const sseHeaders = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };

  if (!hasAI()) {
    const fallback =
      "⚠️ O Mestre IA não está configurado (falta a variável GEMINI_API_KEY).";
    await db.insert(messages).values({ gameId, role: "assistant", content: fallback });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "text", text: fallback })}\n\n`),
        );
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, { headers: sseHeaders });
  }

  const contents: GeminiContent[] = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  if (contents.length === 0) {
    contents.push({
      role: "user",
      parts: [
        {
          text: "Acabei de enviar o livro de regras. Diga qual jogo você identificou e vamos montar minha ficha juntos, seguindo os passos do livro.",
        },
      ],
    });
  }

  let working: { name: string; data: CharacterData; complete: boolean } | null =
    character
      ? { name: character.name, data: character.data, complete: character.complete }
      : null;

  async function persistCharacter(next: {
    name: string;
    data: CharacterData;
    complete: boolean;
  }) {
    const existing = await db
      .select()
      .from(characters)
      .where(eq(characters.gameId, gameId));
    if (existing[0]) {
      await db
        .update(characters)
        .set({ name: next.name, data: next.data, complete: next.complete })
        .where(eq(characters.gameId, gameId));
    } else {
      await db.insert(characters).values({ gameId, ...next });
    }
  }

  const pages = game.pages ?? [];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let finalText = "";
      let waitingForPlayer = false;
      let pendingRequest: { notation: string; reason: string } | null = null;

      try {
        for (let iter = 0; iter < 10; iter++) {
          const calls: {
            name: string;
            args: Record<string, unknown>;
            id?: string;
            thoughtSignature?: string;
          }[] = [];
          let turnText = "";

          for await (const evt of streamGemini({
            system: systemPrompt,
            contents,
            // After a roll request, the Master gets one last text-only turn
            // to tell the player what to roll — it cannot request again.
            tools: waitingForPlayer
              ? []
              : [requestPlayerRollTool, rollDiceTool, consultRulebookTool, setCharacterTool],
          })) {
            if (evt.type === "text") {
              turnText += evt.text;
              finalText += evt.text;
              send({ type: "text", text: evt.text });
            } else {
              calls.push(evt);
            }
          }

          if (calls.length === 0 || waitingForPlayer) break;

          const modelParts: GeminiPart[] = [];
          if (turnText) modelParts.push({ text: turnText });
          for (const c of calls) {
            modelParts.push({
              functionCall: { name: c.name, args: c.args, id: c.id },
              ...(c.thoughtSignature ? { thoughtSignature: c.thoughtSignature } : {}),
            });
          }
          contents.push({ role: "model", parts: modelParts });

          const responseParts: GeminiPart[] = [];
          for (const c of calls) {
            let response: Record<string, unknown> = {};
            try {
              if (c.name === "roll_dice") {
                const reason = String(c.args.reason ?? "Rolagem do Mestre");
                const result = rollDice(String(c.args.notation ?? "1d20"));
                response = { ...result, reason };
                send({ type: "dice", ...result, reason, by: "gm" });
                await db.insert(messages).values({
                  gameId,
                  role: "user",
                  content: `[ROLAGEM DO MESTRE] ${reason}: ${result.notation} = ${result.total} (${result.detail})`,
                  meta: { dice: true, by: "gm", ...result, reason },
                });
              } else if (c.name === "request_player_roll") {
                const notation = String(c.args.notation ?? "1d20");
                rollDice(notation); // validate notation
                const reason = String(c.args.reason ?? "Rolagem");
                if (pendingRequest) {
                  response = {
                    error:
                      "Já existe uma rolagem pendente do jogador. Peça UMA rolagem por vez: aguarde o resultado desta antes de pedir a próxima.",
                  };
                } else {
                  pendingRequest = { notation, reason };
                  send({ type: "roll_request", notation, reason });
                  waitingForPlayer = true;
                  response = {
                    status:
                      "Pedido enviado. O jogador vai rolar na bandeja de dados. Diga em uma frase curta o que ele deve rolar e PARE; o resultado chegará na próxima mensagem.",
                  };
                }
              } else if (c.name === "consult_rulebook") {
                const query = String(c.args.query ?? "");
                const hits = searchRules(pages, query);
                send({ type: "consult", query });
                response = hits.length
                  ? { results: hits }
                  : { results: [], note: "Nada encontrado; tente outras palavras-chave." };
              } else if (c.name === "set_character") {
                const a = c.args;
                const name = str(a.name) ?? working?.name ?? "Aventureiro";
                const data: CharacterData = {
                  concept: str(a.concept),
                  race: str(a.race),
                  class: str(a.class),
                  level:
                    typeof a.level === "number"
                      ? a.level
                      : a.level
                        ? Number(a.level) || undefined
                        : undefined,
                  attributes: parseAttributes(a.attributes),
                  resources: str(a.resources),
                  skills: str(a.skills),
                  equipment: str(a.equipment),
                  background: str(a.background),
                  notes: str(a.notes),
                };
                // Keep previous values for fields the model omitted.
                const prev = working?.data ?? {};
                const merged: CharacterData = { ...prev };
                for (const [k, v] of Object.entries(data)) {
                  if (v !== undefined) (merged as Record<string, unknown>)[k] = v;
                }
                const complete =
                  typeof a.complete === "boolean" ? a.complete : (working?.complete ?? false);
                working = { name, data: merged, complete };
                await persistCharacter(working);
                send({ type: "character", name, data: merged, complete });
                response = { ok: true, message: "Ficha atualizada e exibida ao jogador." };
              }
            } catch (e) {
              response = { error: String(e) };
            }
            responseParts.push({
              functionResponse: { name: c.name, id: c.id, response },
            });
          }
          contents.push({ role: "user", parts: responseParts });
        }

        // Record the pending request in the history so the Master remembers
        // exactly what it asked the player to roll.
        if (finalText.trim()) {
          await db.insert(messages).values({ gameId, role: "assistant", content: finalText });
        }
        if (pendingRequest) {
          // Stored as a system note (user turn) so the Master never mimics it as speech.
          await db.insert(messages).values({
            gameId,
            role: "user",
            content: `[SISTEMA] O Mestre pediu ao jogador a rolagem ${pendingRequest.notation} (${pendingRequest.reason}). O jogador vai rolar na bandeja; o resultado virá na próxima mensagem. Não repita o pedido.`,
            meta: { system: true },
          });
        }
        send({ type: "done" });
        controller.close();
      } catch (err) {
        console.error("chat stream error:", err);
        if (finalText.trim()) {
          await db
            .insert(messages)
            .values({ gameId, role: "assistant", content: finalText })
            .catch(() => {});
        }
        const msg = err instanceof Error ? err.message : "";
        const overloaded =
          msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("429");
        send({
          type: "error",
          text: overloaded
            ? "O Mestre está sobrecarregado no momento (alta demanda na IA). Aguarde alguns segundos e envie novamente."
            : "O Mestre hesitou (erro na IA). Tente novamente.",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
}
