"use client";

import { useState } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";

import { PdfUploader } from "@/app/components/PdfUploader";
import { Sources } from "@/app/components/Sources";

type CitationsDataPart = {
  type: "data-citations";
  data: { sources: { id: string; source: string; page: number | null; score: number }[] };
};

function getText(message: UIMessage) {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function getCitations(message: UIMessage) {
  const parts = message.parts.filter((p) => p.type === "data-citations") as unknown as CitationsDataPart[];
  return parts.flatMap((p) => p.data.sources ?? []);
}

export default function Home() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, status } = useChat();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Serverless RAG Chatbot</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Edge chat streaming + client-side PDF ingestion + Upstash Vector/Redis.
          </p>
        </header>

        <PdfUploader />

        <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">Chat</div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">{status}</div>
          </div>

          <div className="max-h-[52vh] space-y-4 overflow-auto pr-1">
            {messages.map((m) => (
              <div key={m.id} className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {m.role}
                </div>
                <div className="whitespace-pre-wrap text-sm leading-6">{getText(m)}</div>
                {m.role === "assistant" ? <Sources sources={getCitations(m)} /> : null}
              </div>
            ))}
          </div>

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = input.trim();
              if (!trimmed) return;
              sendMessage({ text: trimmed });
              setInput("");
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your uploaded PDF…"
              className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:ring-zinc-100/10"
            />
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              disabled={status === "streaming"}
            >
              Send
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
