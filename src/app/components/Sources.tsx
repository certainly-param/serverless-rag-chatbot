"use client";

type SourceItem = {
  id: string;
  source: string;
  page: number | null;
  score: number;
};

export function Sources({ sources }: { sources: SourceItem[] }) {
  if (!sources.length) return null;

  return (
    <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
      <div className="mb-2 font-medium">Sources</div>
      <ul className="space-y-1">
        {sources.map((s) => (
          <li key={s.id}>
            <span className="rounded bg-zinc-200 px-2 py-0.5 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
              {s.source}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

