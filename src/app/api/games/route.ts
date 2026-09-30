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

async function identifyGame(
  rulesText: string,
  fileNames: string[],
): Promise<{
  systemName: string;
  systemSummary: string;
}> {
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

{
  "systemName": "nome do jogo/sistema",
  "systemSummary": "resumo em português de 4 a 8 linhas: gênero/cenário, mecânica central de dados, atributos principais e passos da criação de personagem conforme o livro"
}

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

    const title = String(body?.title || "Nova Campanha");
    const masterProfile = String(body?.masterProfile || "balanced");

    const uploadedFiles: UploadedFile[] = Array.isArray(body?.files)
      ? body.files
          .map((file: unknown) => {
            if (!file || typeof file !== "object") {
              return null;
            }

            const item = file as Record<string, unknown>;

            const name =
              typeof item.name === "string"
                ? item.name.trim()
                : "";

            const pathname =
              typeof item.pathname === "string"
                ? item.pathname.trim()
                : "";

            if (!name || !pathname) {
              return null;
            }

            return {
              name,
              pathname,
            };
          })
          .filter(
            (
              file: UploadedFile | null,
            ): file is UploadedFile => file !== null,
          )
      : [];

    console.log("FILES RECEIVED:", uploadedFiles);

    if (uploadedFiles.length === 0) {
      return Response.json(
        {
          error: "Nenhum PDF enviado foi informado.",
        },
        { status: 400 },
      );
    }

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

    console.log("BLOB CONFIG:", {
      hasToken: Boolean(blobToken),
      storeId: process.env.BLOB_STORE_ID
        ? "available"
        : "missing",
    });

    const fileMeta: {
      name: string;
      chars: number;
    }[] = [];

    const pages: {
      file: string;
      page: number;
      text: string;
    }[] = [];

    const chunks: string[] = [];

    for (const uploadedFile of uploadedFiles) {
      const { name, pathname } = uploadedFile;

      if (!name.toLowerCase().endsWith(".pdf")) {
        return Response.json(
          {
            error: `O arquivo "${name}" não é um PDF.`,
          },
          { status: 400 },
        );
      }

      console.log("TRYING TO READ BLOB:", {
        name,
        pathname,
      });

      let buffer: Uint8Array;

      try {
        const blob = await get(pathname, {
          access: "private",
          useCache: false,
          ...(blobToken
            ? {
                token: blobToken,
              }
            : {}),
        });

        if (!blob) {
          console.error("BLOB NOT FOUND:", {
            name,
            pathname,
          });

          return Response.json(
            {
              error:
                `O PDF "${name}" foi enviado, mas não foi encontrado ` +
                `no armazenamento pelo caminho "${pathname}".`,
            },
            { status: 404 },
          );
        }

        console.log("BLOB FOUND:", {
          name,
          pathname,
        });

        const arrayBuffer = await new Response(
          blob.stream,
        ).arrayBuffer();

        buffer = new Uint8Array(arrayBuffer);

        console.log("BLOB DOWNLOADED:", {
          name,
          bytes: buffer.length,
        });
      } catch (err) {
        console.error("BLOB READ FAILED:", {
          name,
          pathname,
          error: err,
        });

        return Response.json(
          {
            error:
              `Não foi possível abrir o PDF "${name}" no armazenamento. ` +
              `${
                err instanceof Error
                  ? err.message
                  : "Erro desconhecido."
              }`,
          },
          { status: 422 },
        );
      }

      if (buffer.length === 0) {
        return Response.json(
          {
            error: `O PDF "${name}" está vazio.`,
          },
          { status: 422 },
        );
      }

      let pageTexts: string[];

      try {
        console.log("STARTING PDF EXTRACTION:", name);

        const pdf = await getDocumentProxy(buffer);

        const extracted = await extractText(pdf, {
          mergePages: false,
        });

        pageTexts = (
          Array.isArray(extracted.text)
            ? extracted.text
            : [extracted.text]
        ).map(cleanText);

        console.log("PDF EXTRACTED:", {
          name,
          pages: pageTexts.length,
        });
      } catch (err) {
        console.error("PDF PARSE FAILED:", {
          name,
          error: err,
        });

        return Response.json(
          {
            error:
              `O arquivo "${name}" foi encontrado no armazenamento, ` +
              `mas não foi possível ler o PDF. ` +
              `${
                err instanceof Error
                  ? err.message
                  : "Erro desconhecido."
              }`,
          },
          { status: 422 },
        );
      }

      let chars = 0;

      pageTexts.forEach((text, index) => {
        if (!text) return;

        pages.push({
          file: name,
          page: index + 1,
          text,
        });

        chars += text.length;
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
                text
                  ? `[p.${index + 1}]\n${text}`
                  : "",
              )
              .filter(Boolean)
              .join("\n\n"),
        );
      }
    }

    const rulesText = chunks.join("\n\n");

    console.log("EXTRACTION SUMMARY:", {
      files: fileMeta,
      pages: pages.length,
      characters: rulesText.length,
    });

    if (rulesText.trim().length < 20) {
      return Response.json(
        {
          error:
            "O PDF foi carregado corretamente, mas nenhum texto pôde ser extraído. " +
            "Provavelmente ele contém apenas páginas digitalizadas como imagens.",
        },
        { status: 422 },
      );
    }

    const { systemName, systemSummary } =
      await identifyGame(
        rulesText,
        fileMeta.map((file) => file.name),
      );

    console.log("GAME IDENTIFIED:", {
      systemName,
    });

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

    console.log("GAME CREATED:", {
      id: game.id,
      systemName: game.systemName,
    });

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
    console.error("GAMES POST FAILED:", err);

    return Response.json(
      {
        error:
          `Erro ao processar os arquivos: ${
            err instanceof Error
              ? err.message
              : "erro desconhecido"
          }`,
      },
      { status: 500 },
    );
  }
}
