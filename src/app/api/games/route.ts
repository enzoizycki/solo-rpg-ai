import { db } from "@/db";
import { games } from "@/db/schema";
import { extractText, getDocumentProxy } from "unpdf";
import { generateGemini, hasGemini } from "@/lib/gemini";
import { get } from "@vercel/blob";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type UploadedFile = {
  name: string;
  pathname: string;
};

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
    return {
      systemName: fileNames[0]?.replace(/\.pdf$/i, "") ?? "",
      systemSummary: "",
    };
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

    return {
      systemName: fileNames[0]?.replace(/\.pdf$/i, "") ?? "",
      systemSummary: "",
    };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const title = String(body.title || "Nova Campanha");
    const masterProfile = String(body.masterProfile || "balanced");

    const uploadedFiles: UploadedFile[] = Array.isArray(body.files)
      ? body.files
          .map((file: unknown) => {
            if (!file || typeof file !== "object") return null;

            const item = file as Record<string, unknown>;

            const name =
              typeof item.name === "string" ? item.name.trim() : "";

            const pathname =
              typeof item.pathname === "string" ? item.pathname.trim() : "";

            if (!name || !pathname) return null;

            return { name, pathname };
          })
          .filter((file: UploadedFile | null): file is UploadedFile => file !== null)
      : [];

    if (uploadedFiles.length === 0) {
      return Response.json(
        { error: "Nenhum PDF enviado foi informado." },
        { status: 400 },
      );
    }

    const fileMeta: { name: string; chars: number }[] = [];
    const pages: { file: string; page: number; text: string }[] = [];
    const chunks: string[] = [];

    for (const uploadedFile of uploadedFiles) {
      const name = uploadedFile.name;

      if (!name.toLowerCase().endsWith(".pdf")) {
        return Response.json(
          { error: `O arquivo "${name}" não é um PDF.` },
          { status: 400 },
        );
      }

      let buffer: Uint8Array;

      try {
        const result = await get(uploadedFile.pathname, {
          access: "private",
          useCache: false,
        });

        if (!result) {
          return Response.json(
            { error: `O PDF "${name}" não foi encontrado no armazenamento.` },
            { status: 404 },
          );
        }

        const arrayBuffer = await new Response(result.stream).arrayBuffer();
        buffer = new Uint8Array(arrayBuffer);
      } catch (err) {
        console.error(`Blob read error for ${name}:`, err);

        return Response.json(
          {
            error: `Não foi possível carregar o PDF "${name}" do armazenamento. ${
              err instanceof Error ? err.message : ""
            }`,
          },
          { status: 422 },
        );
      }

      let pageTexts: string[] = [];

      try {
        const pdf = await getDocumentProxy(buffer);
        const result = await extractText(pdf, { mergePages: false });

        pageTexts = (
          Array.isArray(result.text) ? result.text : [result.text]
        ).map(cleanText);
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

      pageTexts.forEach((text, index) => {
        if (text.length > 0) {
          pages.push({
            file: name,
            page: index + 1,
            text,
          });

          chars += text.length;
        }
      });

      fileMeta.push({
        name,
        chars,
      });

      if (chars > 0) {
        chunks.push(
          `### Arquivo: ${name}\n` +
            pageTexts
              .map((text, index) =>
                text ? `[p.${index + 1}]\n${text}` : "",
              )
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
      fileMeta.map((file) => file.name),
    );

    const [game] = await db
      .insert(games)
      .values({
        title:
          title === "Nova Campanha" && systemName
            ? systemName
            : title,
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
