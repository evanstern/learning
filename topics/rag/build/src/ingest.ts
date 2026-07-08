/**
 * ingest.ts — Read corpus HTML files, chunk them structure-aware, embed, and store.
 *
 * This is the "I" in RAG. The ingest pipeline is:
 *   HTML file → Sections (structure) → chunks → vectors → sqlite-vec
 *
 * Each stage is behind a stable seam:
 *   parseStructuredHtml (html.ts)  → GRADUATED 102: recover heading hierarchy
 *   chunkSections       (chunk.ts) → GRADUATED 102: one chunk per section + guard
 *   embedder            (types.ts) → DUMB (103): OllamaEmbedder behind Embedder
 *   store               (types.ts) → Store.upsert
 *
 * 102 also populates the METADATA SIDECAR on each ChunkRecord:
 *   - source       — the book the chunk came from (e.g. "Monster Manual")
 *   - meta.source  — same, mirrored into the JSON bag for filtered retrieval (104)
 *   - meta.breadcrumbs — JSON-encoded heading trail incl. source (citation + future filter key)
 *   - meta.chunkId — the stable id, mirrored in for convenience
 *   - meta.kind    — coarse content tag ("statblock" | "prose" | "mixed")
 *
 * Why JSON-encode breadcrumbs? `ChunkRecord.meta` is `Record<string, string>` (the
 * durable 101 contract). Breadcrumbs are an array, so we serialize them — non-breaking,
 * and exactly the kind of thing the JSON `meta` bag was designed to hold.
 *
 * Idempotency: re-running ingest is safe — upserts are keyed on deterministic chunk
 * IDs. NOTE (102): because 102 produces FAR fewer chunks than 101's fixed windows,
 * stale 101 rows with no matching id linger in an old DB. Wipe stacks.db once when
 * moving 101→102 (the demo command and teardown.sh both handle this). After that,
 * re-ingest is cleanly idempotent.
 */

import fs from "node:fs";
import path from "node:path";
import { parseStructuredHtml } from "./html.js";
import { chunkSections } from "./chunk.js";
import type { Embedder, Store, ChunkRecord } from "./types.js";

/**
 * ingestCorpus — ingest all HTML files from corpusDir into the store.
 *
 * @param corpusDir  Directory containing .html files to ingest
 * @param embedder   The Embedder to use — swap for OllamaEmbedder in lesson 103
 * @param store      The Store to upsert into — must be init()'d before calling
 */
export async function ingestCorpus(
  corpusDir: string,
  embedder: Embedder,
  store: Store
): Promise<void> {
  // Find all HTML files in the corpus directory (flat — DDB pages are single files).
  const files = fs
    .readdirSync(corpusDir)
    .filter((f) => f.endsWith(".html") || f.endsWith(".htm"))
    .map((f) => path.join(corpusDir, f));

  if (files.length === 0) {
    console.log(`No HTML files found in ${corpusDir}.`);
    console.log(`Drop D&D Beyond HTML pages there and re-run ingest.`);
    return;
  }

  console.log(`Ingesting ${files.length} file(s) from ${corpusDir}...`);

  for (const filePath of files) {
    const filename = path.basename(filePath);
    // The book/source name is what we show in citations and use to seed chunk ids.
    const source = deriveSource(filename);
    console.log(`  [${filename}] reading...  (source: "${source}")`);

    // Stage 1: HTML → Sections (heading hierarchy + classified content blocks).
    const html = fs.readFileSync(filePath, "utf-8");
    const sections = parseStructuredHtml(html);

    // Stage 2: Sections → chunks (one per section, with size guard + breadcrumbs).
    const built = chunkSections(sections, source);
    console.log(`  [${filename}] ${sections.length} sections → ${built.length} chunks`);

    if (built.length === 0) {
      console.log(`  [${filename}] WARNING: no chunks produced — skipping.`);
      continue;
    }

    // Stage 3: chunks → vectors. One batch embed call.
    // DUMB (103): HashingEmbedder is in-process; OllamaEmbedder will call out over HTTP.
    const texts = built.map((b) => b.chunk.text);
    const vectors = await embedder.embed(texts);

    // Stage 4: assemble ChunkRecords (with the 102 metadata sidecar) and upsert.
    const records: ChunkRecord[] = built.map((b, i) => {
      // breadcrumbs = [book, ...heading trail]. The trail from chunk.ts is page-internal
      // (e.g. ["G | Monsters","Goblins","Goblin"]); prepending the source gives a full
      // citation path: ["Monster Manual","G | Monsters","Goblins","Goblin"].
      const breadcrumbs = [source, ...b.trail];

      return {
        ...b.chunk,
        vector: vectors[i],
        // rawText: the original chunk text (pre any future normalization). For now
        // identical to text; 104 may diverge them for BM25. Kept distinct on purpose.
        rawText: b.chunk.text,
        // meta: the JSON sidecar bag. All values are strings (the 101 contract);
        // arrays are JSON-encoded. DEFERRED (future structured-retrieval lesson):
        // typed entity fields (creature type, CR, etc.) — non-breaking to add here.
        meta: {
          source,
          breadcrumbs: JSON.stringify(breadcrumbs),
          chunkId: b.chunk.id,
          kind: b.kind,
        },
      };
    });

    store.upsert(records);
    console.log(`  [${filename}] upserted ${records.length} records.`);
  }

  console.log(`Ingest complete.`);
}

/**
 * deriveSource — best-effort book/source name from a DDB export filename.
 *
 * DDB "Save Page As" filenames follow:
 *   "Monsters (G) - Monster Manual (2014) - Dungeons & Dragons - Sources - D&D Beyond.html"
 *    ^ page title      ^ book (+year)        ^ game            ^ section  ^ site
 * The book is the 2nd " - "-delimited segment; we strip a trailing "(year)".
 *
 * HEURISTIC / GUARD (tune in 107 if the corpus grows other filename shapes): if the
 * pattern doesn't match, fall back to the filename without its extension — never crash.
 */
export function deriveSource(filename: string): string {
  const base = filename.replace(/\.html?$/i, "");
  const parts = base.split(" - ").map((p) => p.trim());
  if (parts.length >= 2 && parts[1]) {
    // Strip a trailing "(2014)"-style year annotation.
    return parts[1].replace(/\s*\(\d{4}\)\s*$/, "").trim();
  }
  return base;
}
