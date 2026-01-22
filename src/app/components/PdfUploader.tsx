"use client";

import { useState } from "react";

import { chunkText, type TextChunk } from "@/lib/chunking";

type Props = {
  onIngested?: (info: { docId: string; upserted: number }) => void;
};

export function PdfUploader({ onIngested }: Props) {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    setStatus("Loading PDF…");

    // Import PDF.js only on the client at runtime (prevents SSR/prerender crashes like DOMMatrix undefined).
    const pdfjsLib = await import("pdfjs-dist");

    // Worker served from public/ to avoid bundler issues.
    // pdfjs-dist types can vary by build; use a narrow local type instead of `any`.
    const pdfjs = pdfjsLib as unknown as {
      GlobalWorkerOptions: { workerSrc: string };
      getDocument: (args: { data: ArrayBuffer }) => { promise: Promise<PdfDocument> };
    };
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const allChunks: TextChunk[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      setStatus(`Extracting text… (${pageNum}/${pdf.numPages})`);
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it) => (typeof it.str === "string" ? it.str : ""))
        .join(" ");

      for (const chunk of chunkText(pageText)) {
        allChunks.push({ text: chunk, page: pageNum });
      }
    }

    setStatus(`Uploading ${allChunks.length} chunks…`);

    const res = await fetch("/api/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: file.name,
        chunks: allChunks,
      }),
    });

    const json = (await res.json()) as { 
      ok: boolean; 
      docId?: string; 
      upserted?: number; 
      error?: string;
      message?: string;
    };
    if (!res.ok || !json.ok || !json.docId) {
      // Prefer message field (for quota errors) over error field
      throw new Error(json.message ?? json.error ?? "Ingestion failed");
    }

    setStatus(`Done. Upserted ${json.upserted ?? 0} vectors.`);
    onIngested?.({ docId: json.docId, upserted: json.upserted ?? 0 });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-zinc-900 dark:text-zinc-50">Upload a PDF</div>
          <div className="text-zinc-600 dark:text-zinc-400">
            Parsing happens locally in your browser; only extracted text is sent to the server.
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                await handleFile(file);
              } catch (err) {
                setStatus(err instanceof Error ? err.message : "Upload failed");
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
          {busy ? "Working…" : "Choose PDF"}
        </label>
      </div>

      {status ? (
        <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
          {status}
        </div>
      ) : null}
    </div>
  );
}

type PdfTextItem = { str?: string };
type PdfTextContent = { items: PdfTextItem[] };
type PdfPage = { getTextContent: () => Promise<PdfTextContent> };
type PdfDocument = { numPages: number; getPage: (pageNumber: number) => Promise<PdfPage> };
