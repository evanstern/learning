/**
 * cli.ts — Command-line entry point for the-stacks v2.
 *
 * Commands:
 *   ingest          Read all HTML from corpus/, chunk, embed, upsert to sqlite-vec.
 *   query "<text>"  Ask a question; retrieve and generate a grounded answer.
 *   demo            Run the goblin demo end-to-end (no arguments needed).
 *
 * Usage (dev — no build step needed):
 *   npx tsx src/cli.ts ingest
 *   npx tsx src/cli.ts query "what kind of environment do goblins live in?"
 *   npx tsx src/cli.ts demo
 *
 * Usage (compiled):
 *   npm run build && node dist/cli.js ingest
 *
 * Wiring note: all concrete implementations are instantiated HERE — types.ts
 * defines the interfaces; cli.ts is the one place that knows which impl to use.
 * To swap an implementation (e.g. OllamaEmbedder in 103), change this file only.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config"; // Load .env into process.env before anything else

import { HashingEmbedder, OllamaEmbedder } from "./embedder.js";
import { SqliteVecStore } from "./store.js";
import { IdentityReranker, DenseRetriever } from "./retrieve.js";
import { AnthropicGenerator } from "./generate.js";
import { Pipeline } from "./pipeline.js";
import { ingestCorpus } from "./ingest.js";

// Resolve project root relative to this file.
// __dirname doesn't exist in ESM modules — fileURLToPath is the ESM equivalent.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const CORPUS_DIR = path.join(PROJECT_ROOT, "corpus");
const DB_PATH = path.join(PROJECT_ROOT, "stacks.db");

// ---------------------------------------------------------------------------
// Wire up the implementations
// LESSON UPGRADE POINTS:
//   103: ✅ DONE — HashingEmbedder → OllamaEmbedder (below)
//   104: swap DenseRetriever → HybridRetriever
//   105: swap IdentityReranker → CohereReranker (or similar)
//   106: swap AnthropicGenerator → RefinedGenerator with routing
// ---------------------------------------------------------------------------

// GRADUATED (103): real local embeddings via Ollama (nomic-embed-text, 768-dim).
// HashingEmbedder is still imported above and remains available as a fallback /
// reference impl — flip these two lines to compare the dumb vs. real embedder.
const embedder = new OllamaEmbedder(process.env.OLLAMA_URL ?? "http://localhost:11434");
// const embedder = new HashingEmbedder(256); // 101 dumb baseline (256-dim)

// Store reads embedder.dim — now 768 — so the vec0 table is created at float[768]
// automatically. No store signature change. NOTE: dim went 256→768 in 103, so the
// old stacks.db (float[256]) is incompatible — wipe + re-ingest (see README §103).
const store = new SqliteVecStore(DB_PATH, embedder.dim);
store.init(); // Create tables if they don't exist

const reranker = new IdentityReranker();
// 105: const reranker = new CohereReranker(process.env.COHERE_API_KEY);

const retriever = new DenseRetriever(embedder, store, reranker);
// 104: const retriever = new HybridRetriever(embedder, store, reranker);

const generator = new AnthropicGenerator();
// 106: const generator = new RefinedGenerator(...);

const pipeline = new Pipeline(retriever, generator);

// ---------------------------------------------------------------------------
// Command dispatch
// ---------------------------------------------------------------------------

const [, , command, ...args] = process.argv;

switch (command) {
  case "ingest":
    await runIngest();
    break;

  case "query":
    await runQuery(args.join(" "));
    break;

  case "demo":
    await runDemo();
    break;

  default:
    console.log(`Usage:
  npx tsx src/cli.ts ingest
  npx tsx src/cli.ts query "<question>"
  npx tsx src/cli.ts demo
`);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

async function runIngest(): Promise<void> {
  await ingestCorpus(CORPUS_DIR, embedder, store);
}

async function runQuery(query: string): Promise<void> {
  if (!query.trim()) {
    console.error('Usage: npx tsx src/cli.ts query "<your question>"');
    process.exit(1);
  }

  console.log(`\nQuery: ${query}\n`);
  const answer = await pipeline.ask(query);

  console.log("Answer:");
  console.log(answer.text);

  if (answer.citations.length > 0) {
    console.log("\nCitations:");
    for (const c of answer.citations) {
      const loc = c.section ? `${c.source} § ${c.section}` : c.source;
      console.log(`  - ${loc} (chunk ${c.chunkId})`);
    }
  }
}

async function runDemo(): Promise<void> {
  console.log("=== the-stacks v2 — Demo (goblin habitat query) ===\n");
  console.log("This demo assumes you have a goblin HTML page in corpus/.");
  console.log("If corpus/ is empty, run: npx tsx src/cli.ts ingest\n");

  // First ingest (idempotent — safe if already ingested)
  console.log("--- Step 1: Ingest ---");
  await runIngest();

  // Then query
  console.log("\n--- Step 2: Query ---");
  await runQuery("what kind of environment do goblins live in?");
}
