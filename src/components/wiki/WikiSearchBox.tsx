"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Search } from "lucide-react";

import { searchWikiNotes } from "@/app/wiki/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Hit {
  id: string;
  slug: string;
  title: string;
  body: string;
  tags: string[];
  similarity: number;
}

export function WikiSearchBox() {
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"semantic" | "substring" | null>(null);
  const [results, setResults] = useState<Hit[]>([]);

  function go() {
    if (!query.trim()) {
      setResults([]);
      setMode(null);
      return;
    }
    start(async () => {
      const res = await searchWikiNotes(query);
      setMode(res.mode);
      setResults(res.results);
    });
  }

  return (
    <div className="space-y-3">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search wiki — natural language works."
            className="pl-8"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending || !query.trim()}>
          {pending ? "Searching…" : "Search"}
        </Button>
      </form>

      {mode && (
        <div className="text-xs text-muted-foreground">
          {mode === "semantic" ? "Semantic results" : "Substring fallback (OpenAI unavailable)"} ·{" "}
          {results.length} match{results.length === 1 ? "" : "es"}
        </div>
      )}

      {results.length > 0 && (
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.id} className="rounded-md border bg-card p-3">
              <Link href={`/wiki/${r.slug}`} className="block hover:underline">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{r.title}</h3>
                  {r.similarity > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {(r.similarity * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
