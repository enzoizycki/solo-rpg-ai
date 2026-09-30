import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,

      onBeforeGenerateToken: async (
        pathname,
        clientPayload,
      ) => {
        console.log("Preparing client Blob upload:", {
          pathname,
          clientPayload,
        });

        if (!pathname.toLowerCase().endsWith(".pdf")) {
          throw new Error(
            "Apenas arquivos PDF são permitidos.",
          );
        }

        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 100 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            originalPathname: pathname,
          }),
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("BLOB UPLOAD COMPLETED:", {
          pathname: blob.pathname,
          url: blob.url,
          tokenPayload,
        });
      },
    });

    return Response.json(jsonResponse);
  } catch (error) {
    console.error("CLIENT UPLOAD ROUTE FAILED:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível preparar o upload.",
      },
      {
        status: 400,
      },
    );
  }
}
