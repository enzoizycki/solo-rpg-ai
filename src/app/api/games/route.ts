import { db } from "@/db";
import { games } from "@/db/schema";
import { extractText, getDocumentProxy } from "unpdf";
import { generateGemini, hasGemini } from "@/lib/gemini";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function cleanText(s: string): string {
  return (s ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Ask the AI to identify which RPG system the rulebook belongs to. */
async function identifyGame(
  rulesText: string,
  fileNames: string[],
): Promise<{ systemName: string; systemSummary: string }> {
  if (!hasGemini()) {
    return { systemName: fileNames[0]?.replace(/\.pdf$/i, "") ?? "", systemSummary: "" };
  }
  try {
    const sample = rulesText.slice(0, 40000);
    const raw = await generateGemini({
      json: true,
      temperature: 0.2,
      prompt: `Abaixo está o início de um livro de regras de RPG (arquivos: ${fileNames.join(", ")}).
Identifique o jogo e responda APENAS com JSON:
{"systemName": "nome do jogo/sistema (ex.: Dungeons & Dragons 5ª Edição, Tormenta20, Ordem Paranormal, Call of Cthulhu 7e...)",
 "systemSummary": "resumo em português de 4 a 8 linhas: gênero/cenário, mecânica central de dados, atributos principais e passos da criação de personagem conforme o livro"}

TEXTO:
"""
${sample}
"""`,
    });
    const parsed = JSON.parse(raw);
    return {
      systemName: String(parsed.systemName ?? "").slice(0, 200),
      systemSummary: String(parsed.systemSummary ?? "").slice(0, 3000),
    };
  } catch (err) {
    console.error("identifyGame failed:", err);
    return { systemName: fileNames[0]?.replace(/\.pdf$/i, "") ?? "", systemSummary: "" };
  }
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    console.error("formData parse failed:", err);
    return Response.json(
      {
        error:
          "Não foi possível receber o arquivo. Ele pode ser grande demais. Tente um PDF menor (idealmente até 50 MB).",
      },
      { status: 413 },
    );
  }

  try {
    const title = (form.get("title") as string) || "Nova Campanha";
    const masterProfile = (form.get("masterProfile") as string) || "balanced";
    const files = form.getAll("files").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return Response.json(
        { error: "Envie ao menos um PDF com as regras do jogo." },
        { status: 400 },
      );
    }

    const fileMeta: { name: string; chars: number }[] = [];
    const pages: { file: string; page: number; text: string }[] = [];
    const chunks: string[] = [];

    for (const file of files) {
      const name = file.name || "arquivo.pdf";
      if (file.size === 0) {
        return Response.json(
          { error: `O arquivo "${name}" está vazio (0 bytes).` },
          { status: 400 },
        );
      }
      const buffer = new Uint8Array(await file.arrayBuffer());

      let pageTexts: string[] = [];
      try {
        const pdf = await getDocumentProxy(buffer);
        const result = await extractText(pdf, { mergePages: false });
        pageTexts = (Array.isArray(result.text) ? result.text : [result.text]).map(
          cleanText,
        );
      } catch (err) {
        console.error(`PDF parse error for ${name}:`, err);
        return Response.json(
          {
            error: `Não foi possível ler o PDF "${name}". Ele pode estar protegido por senha ou corrompido. Detalhe: ${
              err instanceof Error ? err.message : "erro desconhecido"
            }`,
          },
          { status: 422 },
        );
      }

      let chars = 0;
      pageTexts.forEach((t, i) => {
        if (t.length > 0) {
          pages.push({ file: name, page: i + 1, text: t });
          chars += t.length;
        }
      });
      fileMeta.push({ name, chars });
      if (chars > 0) {
        chunks.push(
          `### Arquivo: ${name}\n` +
            pageTexts
              .map((t, i) => (t ? `[p.${i + 1}]\n${t}` : ""))
              .filter(Boolean)
              .join("\n\n"),
        );
      }
    }

    const rulesText = chunks.join("\n\n");

    if (rulesText.trim().length < 20) {
      return Response.json(
        {
          error:
            "Nenhum texto pôde ser extraído dos PDFs enviados. " +
            "Provavelmente eles são digitalizados (imagens). " +
            "Envie um PDF com texto selecionável (ex.: exportado direto do programa, não escaneado).",
        },
        { status: 422 },
      );
    }

    const { systemName, systemSummary } = await identifyGame(
      rulesText,
      fileMeta.map((f) => f.name),
    );

    const [game] = await db
      .insert(games)
      .values({
        title: title === "Nova Campanha" && systemName ? systemName : title,
        masterProfile,
        rulesText,
        pages,
        files: fileMeta,
        systemName,
        systemSummary,
      })
      .returning();

    return Response.json({
      id: game.id,
      title: game.title,
      masterProfile: game.masterProfile,
      files: game.files,
      rulesChars: rulesText.length,
      pageCount: pages.length,
      systemName: game.systemName,
      systemSummary: game.systemSummary,
    });
  } catch (err) {
    console.error("games POST failed:", err);
    return Response.json(
      {
        error: `Erro ao processar os arquivos: ${
          err instanceof Error ? err.message : "erro desconhecido"
        }`,
      },
      { status: 500 },
    );
  }
}
