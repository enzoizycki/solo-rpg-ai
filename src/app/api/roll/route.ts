import { rollDice } from "@/lib/dice";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { notation } = await req.json();
    const result = rollDice(String(notation ?? "1d20"));
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Notação inválida" },
      { status: 400 },
    );
  }
}
