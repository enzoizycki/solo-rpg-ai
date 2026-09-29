"use client";

import { useRef, useState } from "react";
import { MASTER_PROFILES } from "@/lib/profiles";
import type { GameInfo } from "@/lib/types";

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
      (f) =>
        f.name.toLowerCase().endsWith(".pdf") ||
        f.type === "application/pdf",
    );
    const rejected = all.filter((f) => !pdfs.includes(f));
    if (rejected.length > 0) {
      setError(
        `Ignorado(s) (não são PDF): ${rejected.map((f) => f.name).join(", ")}`,
      );
    } else {
      setError("");
    }
    setFiles((prev) => {
      const names = new Set(prev.map((p) => p.name));
      return [...prev, ...pdfs.filter((p) => !names.has(p.name))];
    });
  }

  async function submit() {
    if (files.length === 0) {
      setError("Envie ao menos um PDF com as regras do jogo.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("title", title || "Nova Campanha");
      fd.append("masterProfile", profile);
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/games", { method: "POST", body: fd });

      // The server may reply with non-JSON (e.g. a 413 payload-too-large page).
      let json: (GameInfo & { error?: string; warnings?: string[] }) | null = null;
      const raw = await res.text();
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        json = null;
      }

      if (!res.ok || !json) {
        throw new Error(
          json?.error ||
            (res.status === 413
              ? "O arquivo é grande demais para o upload. Tente um PDF menor."
              : `Erro ao processar (HTTP ${res.status}). Tente novamente.`),
        );
      }

      onCreated(json as GameInfo);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Erro inesperado ao enviar. Verifique o arquivo e tente de novo.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 fade-up">
      <div className="text-center mb-10">
        <div className="text-5xl mb-3">📜</div>
        <h1 className="font-serif text-4xl font-bold text-[var(--gold)] tracking-wide">
          Grimório
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Comece enviando o(s) PDF(s) com as regras do seu jogo. O Mestre IA vai
          estudá-las, montar sua ficha com você no chat e conduzir a aventura.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)]/70 backdrop-blur p-6 shadow-xl">
        <label className="block text-sm font-medium text-[var(--gold-soft)] mb-2">
          Nome da campanha
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: As Ruínas de Eldrath"
          className="w-full rounded-lg bg-[var(--bg-soft)] border border-[var(--border)] px-4 py-2.5 text-[var(--text)] placeholder:text-[var(--muted)]/60 outline-none focus:border-[var(--purple)] transition"
        />

        <label className="block text-sm font-medium text-[var(--gold-soft)] mb-2 mt-6">
          Regras do jogo (PDF)
        </label>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${
            dragging
              ? "border-[var(--purple)] bg-[var(--purple)]/10"
              : "border-[var(--border)] hover:border-[var(--purple)]/60 bg-[var(--bg-soft)]/50"
          }`}
        >
          <div className="text-3xl mb-2">📚</div>
          <p className="text-[var(--text)] font-medium">
            Arraste seus PDFs aqui ou clique para selecionar
          </p>
          <p className="text-xs text-[var(--muted)] mt-1">
            Você pode enviar vários arquivos (livro do jogador, suplementos...)
          </p>
          <p className="text-[11px] text-[var(--muted)]/70 mt-2">
            ⚠️ O PDF precisa ter texto selecionável. PDFs digitalizados (imagens
            escaneadas) não podem ser lidos pelo Mestre.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <ul className="mt-4 space-y-2">
            {files.map((f) => (
              <li
                key={f.name}
                className="flex items-center justify-between rounded-lg bg-[var(--bg-soft)] border border-[var(--border)] px-3 py-2 text-sm"
              >
                <span className="truncate flex items-center gap-2">
                  <span>📄</span>
                  <span className="truncate">{f.name}</span>
                  <span className="text-[var(--muted)] text-xs">
                    ({(f.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFiles((prev) => prev.filter((p) => p.name !== f.name));
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
          {MASTER_PROFILES.map((p) => (
            <button
              key={p.id}
              onClick={() => setProfile(p.id)}
              className={`text-left rounded-xl border p-3 transition ${
                profile === p.id
                  ? "border-[var(--gold)] bg-[var(--gold)]/10 shadow"
                  : "border-[var(--border)] bg-[var(--bg-soft)]/50 hover:border-[var(--purple)]/60"
              }`}
            >
              <div className="text-xl">{p.emoji}</div>
              <div className="font-semibold text-sm mt-1">{p.name}</div>
              <div className="text-xs text-[var(--muted)] leading-tight mt-0.5">
                {p.tagline}
              </div>
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          onClick={submit}
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-[var(--gold)] to-[var(--gold-soft)] text-[#2a1e08] font-semibold py-3 shadow-lg hover:brightness-105 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading
            ? "Lendo o livro e identificando o jogo..."
            : "Enviar livro e montar minha ficha ⟶"}
        </button>
      </div>
    </div>
  );
}
