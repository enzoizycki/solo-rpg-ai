"use client";

import { useRef, useState } from "react";
import { MASTER_PROFILES } from "@/lib/profiles";
import type { GameInfo } from "@/lib/types";

type UploadedFile = {
  name: string;
  pathname: string;
};

export default function UploadStep({
  onCreated,
}: {
  onCreated: (game: GameInfo) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [profile, setProfile] = useState("balanced");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;

    const all = Array.from(list);

    const pdfs = all.filter(
      (file) =>
        file.name.toLowerCase().endsWith(".pdf") ||
        file.type === "application/pdf",
    );

    const rejected = all.filter((file) => !pdfs.includes(file));

    if (rejected.length > 0) {
      setError(
        `Ignorado(s) (não são PDF): ${rejected
          .map((file) => file.name)
          .join(", ")}`,
      );
    } else {
      setError("");
    }

    setFiles((previous) => {
      const existingNames = new Set(
        previous.map((file) => file.name),
      );

      return [
        ...previous,
        ...pdfs.filter(
          (file) => !existingNames.has(file.name),
        ),
      ];
    });
  }

  async function uploadFile(
    file: File,
  ): Promise<UploadedFile> {
    /*
     * 1. Pede ao nosso servidor uma URL assinada
     * para fazer o upload diretamente ao Vercel Blob.
     */
    const authRes = await fetch("/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName: file.name,
        contentType:
          file.type || "application/pdf",
      }),
    });

    const authRaw = await authRes.text();

    let authJson: {
      pathname?: string;
      uploadUrl?: string;
      error?: string;
    } | null = null;

    try {
      authJson = authRaw
        ? JSON.parse(authRaw)
        : null;
    } catch {
      authJson = null;
    }

    if (
      !authRes.ok ||
      !authJson?.uploadUrl ||
      !authJson.pathname
    ) {
      throw new Error(
        authJson?.error ||
          `Não foi possível preparar o upload de "${file.name}".`,
      );
    }

    /*
     * 2. Envia o PDF diretamente para o Blob.
     */
    const uploadRes = await fetch(
      authJson.uploadUrl,
      {
        method: "PUT",
        headers: {
          "Content-Type":
            file.type || "application/pdf",
        },
        body: file,
      },
    );

    if (!uploadRes.ok) {
      let detail = "";

      try {
        detail = await uploadRes.text();
      } catch {
        detail = "";
      }

      console.error(
        "Blob upload failed:",
        uploadRes.status,
        detail,
      );

      throw new Error(
        `Não foi possível enviar "${file.name}" para o armazenamento.`,
      );
    }

    /*
     * 3. Tenta obter do próprio Blob o pathname
     * efetivamente utilizado.
     *
     * Caso a resposta não tenha JSON/pathname,
     * usamos o pathname que foi assinado pelo
     * nosso /api/upload.
     */
    let uploadedPathname = authJson.pathname;

    try {
      const uploadRaw = await uploadRes.text();

      if (uploadRaw) {
        const uploadJson = JSON.parse(
          uploadRaw,
        ) as {
          pathname?: unknown;
        };

        if (
          typeof uploadJson.pathname ===
            "string" &&
          uploadJson.pathname.trim()
        ) {
          uploadedPathname =
            uploadJson.pathname.trim();
        }
      }
    } catch {
      // A resposta do Blob pode não conter JSON.
      // Nesse caso usamos o pathname assinado.
    }

    if (!uploadedPathname) {
      throw new Error(
        `O upload de "${file.name}" terminou, mas o caminho do arquivo não foi retornado.`,
      );
    }

    return {
      name: file.name,
      pathname: uploadedPathname,
    };
  }

  async function submit() {
    if (files.length === 0) {
      setError(
        "Envie ao menos um PDF com as regras do jogo.",
      );
      return;
    }

    setError("");
    setLoading(true);

    try {
      const uploadedFiles: UploadedFile[] =
        [];

      /*
       * Fazemos um upload de cada PDF.
       */
      for (const file of files) {
        const uploaded =
          await uploadFile(file);

        uploadedFiles.push(uploaded);
      }

      /*
       * Agora enviamos apenas os caminhos dos
       * PDFs armazenados para /api/games.
       *
       * Assim o PDF grande NÃO passa novamente
       * pelo limite normal da Serverless Function.
       */
      const res = await fetch("/api/games", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          title:
            title.trim() ||
            "Nova Campanha",
          masterProfile: profile,
          files: uploadedFiles,
        }),
      });

      const raw = await res.text();

      let json:
        | (GameInfo & {
            error?: string;
            warnings?: string[];
          })
        | null = null;

      try {
        json = raw
          ? JSON.parse(raw)
          : null;
      } catch {
        json = null;
      }

      if (!res.ok || !json) {
        throw new Error(
          json?.error ||
            `Erro ao processar o livro (HTTP ${res.status}). Tente novamente.`,
        );
      }

      onCreated(json as GameInfo);
    } catch (err) {
      console.error(
        "Upload/process error:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado ao enviar. Verifique o arquivo e tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 fade-up">
      <div className="text-center mb-10">
        <div className="text-5xl mb-3">
          📜
        </div>

        <h1 className="font-serif text-4xl font-bold text-[var(--gold)] tracking-wide">
          Grimório
        </h1>

        <p className="mt-2 text-[var(--muted)]">
          Comece enviando o(s) PDF(s) com
          as regras do seu jogo. O Mestre IA
          vai estudá-las, montar sua ficha
          com você no chat e conduzir a
          aventura.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)]/70 backdrop-blur p-6 shadow-xl">
        <label className="block text-sm font-medium text-[var(--gold-soft)] mb-2">
          Nome da campanha
        </label>

        <input
          value={title}
          onChange={(event) =>
            setTitle(event.target.value)
          }
          placeholder="Ex.: As Ruínas de Eldrath"
          className="w-full rounded-lg bg-[var(--bg-soft)] border border-[var(--border)] px-4 py-2.5 text-[var(--text)] placeholder:text-[var(--muted)]/60 outline-none focus:border-[var(--purple)] transition"
        />

        <label className="block text-sm font-medium text-[var(--gold-soft)] mb-2 mt-6">
          Regras do jogo (PDF)
        </label>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() =>
            setDragging(false)
          }
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);

            addFiles(
              event.dataTransfer.files,
            );
          }}
          onClick={() =>
            inputRef.current?.click()
          }
          className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${
            dragging
              ? "border-[var(--purple)] bg-[var(--purple)]/10"
              : "border-[var(--border)] hover:border-[var(--purple)]/60 bg-[var(--bg-soft)]/50"
          }`}
        >
          <div className="text-3xl mb-2">
            📚
          </div>

          <p className="text-[var(--text)] font-medium">
            Arraste seus PDFs aqui ou clique
            para selecionar
          </p>

          <p className="text-xs text-[var(--muted)] mt-1">
            Você pode enviar vários arquivos
            (livro do jogador,
            suplementos...)
          </p>

          <p className="text-[11px] text-[var(--muted)]/70 mt-2">
            ⚠️ O PDF precisa ter texto
            selecionável. PDFs digitalizados
            (imagens escaneadas) não podem ser
            lidos pelo Mestre.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(event) => {
              addFiles(
                event.target.files,
              );

              /*
               * Permite selecionar novamente
               * o mesmo arquivo depois de
               * removê-lo da lista.
               */
              event.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className="mt-4 space-y-2">
            {files.map((file) => (
              <li
                key={file.name}
                className="flex items-center justify-between rounded-lg bg-[var(--bg-soft)] border border-[var(--border)] px-3 py-2 text-sm"
              >
                <span className="truncate flex items-center gap-2">
                  <span>📄</span>

                  <span className="truncate">
                    {file.name}
                  </span>

                  <span className="text-[var(--muted)] text-xs">
                    (
                    {(
                      file.size /
                      1024 /
                      1024
                    ).toFixed(1)}{" "}
                    MB)
                  </span>
                </span>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();

                    setFiles(
                      (previous) =>
                        previous.filter(
                          (item) =>
                            item.name !==
                            file.name,
                        ),
                    );
                  }}
                  className="text-[var(--muted)] hover:text-red-400 transition px-2"
                  aria-label={`Remover ${file.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="block text-sm font-medium text-[var(--gold-soft)] mb-3 mt-6">
          Estilo de mestragem
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {MASTER_PROFILES.map(
            (masterProfile) => (
              <button
                type="button"
                key={masterProfile.id}
                onClick={() =>
                  setProfile(
                    masterProfile.id,
                  )
                }
                className={`text-left rounded-xl border p-3 transition ${
                  profile ===
                  masterProfile.id
                    ? "border-[var(--gold)] bg-[var(--gold)]/10 shadow"
                    : "border-[var(--border)] bg-[var(--bg-soft)]/50 hover:border-[var(--purple)]/60"
                }`}
              >
                <div className="text-xl">
                  {masterProfile.emoji}
                </div>

                <div className="font-semibold text-sm mt-1">
                  {masterProfile.name}
                </div>

                <div className="text-xs text-[var(--muted)] leading-tight mt-0.5">
                  {
                    masterProfile.tagline
                  }
                </div>
              </button>
            ),
          )}
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-[var(--gold)] to-[var(--gold-soft)] text-[#2a1e08] font-semibold py-3 shadow-lg hover:brightness-105 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading
            ? "Enviando e estudando o livro..."
            : "Enviar livro e montar minha ficha ⟶"}
        </button>
      </div>
    </div>
  );
}
