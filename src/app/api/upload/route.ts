import { issueSignedToken, presignUrl } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const fileName =
      typeof body?.fileName === "string"
        ? body.fileName.trim()
        : "";

    if (!fileName) {
      return Response.json(
        { error: "O nome do arquivo não foi recebido." },
        { status: 400 },
      );
    }

    if (!fileName.toLowerCase().endsWith(".pdf")) {
      return Response.json(
        { error: "Apenas arquivos PDF são permitidos." },
        { status: 400 },
      );
    }

    const safeName = fileName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-150);

    const pathname =
      `uploads/${crypto.randomUUID()}-${safeName}`;

    console.log("Preparing signed Blob upload:", {
      fileName,
      pathname,
    });

    // IMPORTANTE:
    // o token fica explicitamente limitado a ESTE pathname.
    const token = await issueSignedToken({
      pathname,
      operations: ["put"],
      validUntil: Date.now() + 15 * 60 * 1000,
    });

    const { presignedUrl } = await presignUrl(token, {
      pathname,
      operation: "put",
      access: "private",
      validUntil: Date.now() + 15 * 60 * 1000,
    });

    console.log("Signed Blob upload ready:", {
      fileName,
      pathname,
      hasPresignedUrl: Boolean(presignedUrl),
    });

    return Response.json({
      pathname,
      uploadUrl: presignedUrl,
    });
  } catch (err) {
    console.error("UPLOAD ROUTE FAILED:", err);

    return Response.json(
      {
        error:
          err instanceof Error
            ? `Não foi possível preparar o upload: ${err.message}`
            : "Não foi possível preparar o upload.",
      },
      { status: 500 },
    );
  }
}
