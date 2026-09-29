import { db } from "@/db";
import { games, characters, messages } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const gameId = Number(id);
  if (Number.isNaN(gameId)) {
    return Response.json({ error: "ID inválido" }, { status: 400 });
  }

  const [game] = await db.select().from(games).where(eq(games.id, gameId));
  if (!game) {
    return Response.json({ error: "Campanha não encontrada" }, { status: 404 });
  }

  const chars = await db
    .select()
    .from(characters)
    .where(eq(characters.gameId, gameId));

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.gameId, gameId))
    .orderBy(asc(messages.createdAt));

  return Response.json({
    game: {
      id: game.id,
      title: game.title,
      masterProfile: game.masterProfile,
      files: game.files,
      rulesChars: game.rulesText.length,
    },
    character: chars[0] ?? null,
    messages: msgs.filter((m) => m.role === "user" || m.role === "assistant"),
  });
}

// Update the master profile of a game.
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const gameId = Number(id);
  const body = await req.json();
  const masterProfile = body.masterProfile as string | undefined;
  if (!masterProfile) {
    return Response.json({ error: "masterProfile é obrigatório" }, { status: 400 });
  }
  await db
    .update(games)
    .set({ masterProfile })
    .where(eq(games.id, gameId));
  return Response.json({ ok: true });
}
