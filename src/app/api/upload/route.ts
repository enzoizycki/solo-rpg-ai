import {
  issueSignedToken,
  presignUrl,
} from "@vercel/blob";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const fileName = String(
      body.fileName ?? "",
    );

    const contentType = String(
      body.contentType ?? "",
    );

    if (
      !fileName
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      return Response.json(
        {
          error:
            "Apenas arquivos PDF são permitidos.",
        },
        { status: 400 },
      );
    }

    if (
      contentType &&
      contentType !== "application/pdf"
    ) {
      return Response.json(
        {
          error:
            "O arquivo precisa ser um PDF.",
        },
        { status: 400 },
      );
    }

    const safeName = fileName
      .replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      )
      .slice(-150);

    const pathname =
      `uploads/${crypto.randomUUID()}-${safeName}`;

    const validUntil =
      Date.now() + 15 * 60 * 1000;

    const token =
      await issueSignedToken({
        pathname,
        operations: ["put"],
        validUntil,
      });

    const { presignedUrl } =
      await presignUrl(token, {
        pathname,
        operation: "put",
        access: "private",
        validUntil,
      });

    return Response.json({
      pathname,
      uploadUrl: presignedUrl,
    });
  } catch (err) {
    console.error(
      "Blob upload authorization failed:",
      err,
    );

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
