import { issueSignedToken, presignUrl } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const fileName = String(body.fileName ?? "").trim();
    const contentType = String(
      body.contentType ?? "application/pdf",
    ).trim();

    if (!fileName) {
      return Response.json(
        { error: "Nome do arquivo não informado." },
        { status: 400 },
      );
    }

    if (!fileName.toLowerCase().endsWith(".pdf")) {
      return Response.json(
        { error: "Apenas arquivos PDF são permitidos." },
        { status: 400 },
      );
    }

    if (
      contentType &&
      contentType !== "application/pdf" &&
      contentType !== "application/octet-stream"
    ) {
      return Response.json(
        { error: "O arquivo precisa ser um PDF." },
        { status: 400 },
      );
    }

    const safeName = fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-150);

    const pathname = `uploads/${crypto.randomUUID()}-${safeName}`;

    const validUntil = Date.now() + 15 * 60 * 1000;

    const token = await issueSignedToken({
      operations: ["put"],
    });

    const { presignedUrl } = await presignUrl(token, {
      pathname,
      operation: "put",
      access: "private",
      validUntil,
    });

    console.log("Prepared Blob upload:", {
      originalName: fileName,
      pathname,
    });

    return Response.json({
      name: fileName,
      pathname,
      uploadUrl: presignedUrl,
    });
  } catch (err) {
    console.error("Blob upload authorization failed:", err);

    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Não foi possível preparar o upload.",
      },
      { status: 500 },
    );
  }
}
