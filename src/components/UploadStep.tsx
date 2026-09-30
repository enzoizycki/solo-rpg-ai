"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
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
  const [progress, setProgress] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;

    const all = Array.from(list);

    const pdfs = all.filter(
      (file) =>
        file.name.toLowerCase().endsWith(".pdf") ||
        file.type === "application/pdf",
    );

    const rejected = all.filter(
      (file) => !pdfs.includes(file),
    );

    if (rejected.length > 0) {
      setError(
        `Ignorado(s) porque não são PDF: ${rejected
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
    console.log("Starting official Blob client upload:", {
      name: file.name,
      size: file.size,
      type: file.type,
    });

    const blob = await upload(
      file.name,
      file,
      {
        access: "private",
        handleUploadUrl: "/api/upload",

        onUploadProgress(event) {
          setProgress(Math.round(event.percentage));
        },
      },
    );

    console.log("Blob client upload completed:", blob);

    if (!blob.pathname) {
      throw new Error(
        `O armazenamento não retornou o caminho de "${file.name}".`,
      );
    }

    return {
      name: file.name,
      pathname: blob.pathname,
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
    setProgress(0);

    try {
      const uploadedFiles: UploadedFile[] = [];

      for (const file of files) {
        const uploaded = await uploadFile(file);

        uploadedFiles.push(uploaded);
      }

      console.log(
        "FILES CONFIRMED BY BLOB:",
        uploadedFiles,
      );

      const response = await fetch("/api/games", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          title: title || "Nova Campanha",
          masterProfile: profile,
          files: uploadedFiles,
        }),
      });

      const raw = await response.text();

      let json:
        | (GameInfo & {
            error?: string;
          })
        | null = null;

      try {
        json = raw
          ? JSON.parse(raw)
          : null;
      } catch {
        json = null;
      }

      if (!response.ok || !json) {
        throw new Error(
          json?.error ||
            `Erro ao processar o livro (HTTP ${response.status}).`,
        );
      }

      onCreated(json as GameInfo);
    } catch (err) {
      console.error("UPLOAD/PROCESSING FAILED:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado ao enviar o PDF.",
      );
    } finally {
      setLoading(false);
      setProgress(0);
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
          Comece enviando o(s) PDF(s) com as regras do
          seu jogo. O Mestre IA vai estudá-las, montar
          sua ficha com você no chat e conduzir a
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
            addFiles(event.dataTransfer.files);
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
            Arraste seus PDFs aqui ou clique para
            selecionar
          </p>

          <p className="text-xs text-[var(--muted)] mt-1">
            Você pode enviar vários arquivos (livro do
            jogador, suplementos...)
          </p>

          <p className="text-[11px] text-[var(--muted)]/70 mt-2">
            ⚠️ O PDF precisa ter texto selecionável.
            PDFs digitalizados (imagens escaneadas) não
            podem ser lidos pelo Mestre.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(event) =>
              addFiles(event.target.files)
            }
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

                    setFiles((previous) =>
                      previous.filter(
                        (item) =>
                          item.name !== file.name,
                      ),
                    );
                  }}
                  className="text-[var(--muted)] hover:text-red-400 transition px-2"
                  aria-label="Remover"
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
          {MASTER_PROFILES.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() =>
                setProfile(item.id)
              }
              className={`text-left rounded-xl border p-3 transition ${
                profile === item.id
                  ? "border-[var(--gold)] bg-[var(--gold)]/10 shadow"
                  : "border-[var(--border)] bg-[var(--bg-soft)]/50 hover:border-[var(--purple)]/60"
              }`}
            >
              <div className="text-xl">
                {item.emoji}
              </div>

              <div className="font-semibold text-sm mt-1">
                {item.name}
              </div>

              <div className="text-xs text-[var(--muted)] leading-tight mt-0.5">
                {item.tagline}
              </div>
            </button>
          ))}
        </div>

        {loading && progress > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-[var(--muted)] mb-1">
              <span>Enviando PDF...</span>
              <span>{progress}%</span>
            </div>

            <div className="h-2 rounded-full bg-[var(--bg-soft)] overflow-hidden">
              <div
                className="h-full bg-[var(--gold)] transition-all"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          </div>
        )}

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
            ? progress > 0 && progress < 100
              ? `Enviando PDF... ${progress}%`
              : "Estudando o livro..."
            : "Enviar livro e montar minha ficha ⟶"}
        </button>
      </div>
    </div>
  );
}
