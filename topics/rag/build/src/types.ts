/**
 * types.ts — Core types and durable interfaces for the-stacks v2.
 *
 * These are the CONTRACTS that hold across all 8 lessons.
 * Implementations behind each interface are swapped lesson by lesson,
 * but callers never change — they always depend on this file, not on the impl.
 *
 * Think of this as the "API surface" of the RAG pipeline:
 *   ingest  →  Embedder + Store
 *   retrieve →  Embedder + Store + Retriever + Reranker
 *   generate →  Generator
 *
 * Design philosophy: every seam is an interface so any stage can be upgraded
 * independently. For example, swapping HashingEmbedder → OllamaEmbedder in
 * lesson 103 requires zero changes to retrieve.ts or ingest.ts.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

/**
 * Chunk — a single unit of retrievable content.
 *
 * A chunk is what gets embedded and stored. At query time, we retrieve Chunks
 * (wrapped as RankedChunks) and assemble them into the generation prompt.
 *
 * - id:      stable identifier (derived from source + ord so re-ingesting is idempotent)
 * - text:    the text that gets embedded and shown to the LLM
 * - source:  filename of the originating HTML page (e.g. "goblin.html")
 * - section: optional heading/section within the page (populated richly in lesson 102)
 * - ord:     ordinal position within the source — useful for citation and context ordering
 */
export interface Chunk {
  id: string;
  text: string;
  source: string;
  section?: string;
  ord: number;
}

/**
 * ChunkRecord — a Chunk enriched with the data needed to store and retrieve it.
 *
 * Extends Chunk with:
 * - vector:   the embedding (float array, dim = Embedder.dim). Used for dense search.
 * - rawText:  the original unmodified text. Populated richly in lesson 102/104;
 *             in 101 it's the same as `text`. Needed for BM25/lexical search (lesson 104).
 * - meta:     key/value tags for filtered retrieval (e.g. { source, monster_type }).
 *             Populated richly in lessons 102/104; in 101 just { source }.
 *
 * Why anticipate rawText/meta now? The sqlite-vec schema is set in 101.
 * Adding columns later would require a migration. Including them as no-ops is free.
 */
export interface ChunkRecord extends Chunk {
  vector: number[];
  rawText: string;             // mirrors `text` for now; DUMB (104): original pre-normalized text for BM25
  meta: Record<string, string>; // POPULATED (102): source, breadcrumbs (JSON), chunkId, kind. Used for filtered/hybrid retrieval in 104.
}

/**
 * RankedChunk — a retrieval result: a Chunk plus a similarity score.
 *
 * Score semantics depend on the search method (cosine similarity, BM25, fusion score).
 * In lesson 101: cosine similarity from the hashing embedder (range ~0–1, higher = more similar).
 */
export interface RankedChunk {
  chunk: Chunk;
  score: number;
}

/**
 * Answer — the final output of the pipeline.
 *
 * - text:      the generated answer (or degraded context if no LLM key)
 * - citations: which chunks were used, so the user can trace the answer back to source
 *
 * Having citations as a first-class field forces the generator to be grounded —
 * it can't hallucinate a source that isn't in the retrieved context.
 */
export interface Answer {
  text: string;
  citations: {
    source: string;
    section?: string;
    chunkId: string;
  }[];
}

// ---------------------------------------------------------------------------
// Interfaces — the durable pipeline contracts
// ---------------------------------------------------------------------------

/**
 * Embedder — maps text strings to fixed-dimensional float vectors.
 *
 * Why an interface? So we can swap the embedding backend without touching
 * any pipeline code. 101 uses HashingEmbedder (in-process, no network).
 * Lesson 103 swaps it for OllamaEmbedder behind this same interface.
 *
 * The `dim` property is load-bearing: the Store needs to know the dimension
 * when creating the sqlite-vec table. Changing dims after first ingest requires
 * a re-ingest (vectors in the DB would have the wrong dimension).
 */
export interface Embedder {
  /** Embed a batch of texts. Returns one vector per text. */
  embed(texts: string[]): Promise<number[][]>;
  /** Dimensionality of the output vectors (fixed for the lifetime of a DB). */
  readonly dim: number;
}

/**
 * Store — persistent vector store backed by sqlite-vec.
 *
 * Why an interface? In principle, we could swap out the backend (e.g., a remote
 * vector DB). In practice, the seam is here so Store can be tested/mocked
 * independently of the rest of the pipeline.
 *
 * Note: searchDense is the only search method in 101.
 * Lesson 104 adds sparse/hybrid search, but won't change this interface — it
 * will add a `searchHybrid` method and update the Retriever to call it.
 */
export interface Store {
  /** Create tables if they don't exist. Idempotent — safe to call on every startup. */
  init(): void;
  /** Insert or replace ChunkRecords. Idempotent keyed on chunk.id. */
  upsert(records: ChunkRecord[]): void;
  /** Top-k dense (vector) search. Returns at most k results, highest score first. */
  searchDense(queryVec: number[], k: number): RankedChunk[];
}

/**
 * Retriever — orchestrates the full retrieval pipeline for a query.
 *
 * Callers (pipeline.ts, cli.ts) use this interface — they don't know or care
 * whether retrieval is dense-only (101), hybrid (104), or otherwise.
 *
 * The Retriever owns: embed query → search store → rerank → return ranked chunks.
 */
export interface Retriever {
  retrieve(query: string, k: number): Promise<RankedChunk[]>;
}

/**
 * Reranker — takes a list of ranked hits and re-scores/reorders them.
 *
 * The identity reranker in 101 returns the input unchanged — it's a no-op stub.
 * Lesson 105 replaces it with a cross-encoder or hosted reranking API.
 *
 * Why separate from Retriever? Because retrieval (dense/sparse search) and
 * reranking (semantic scoring of top-k) are genuinely different operations with
 * different compute/latency tradeoffs. The seam also lets us A/B test rerankers.
 */
export interface Reranker {
  // DUMB (lesson 105): real cross-encoder / hosted rerank (Cohere, etc.)
  rerank(query: string, hits: RankedChunk[]): Promise<RankedChunk[]>;
}

/**
 * Generator — takes a query + retrieved context, calls the LLM, returns a cited Answer.
 *
 * This is the "G" in RAG. The interface separates prompt assembly and LLM calling
 * from the retrieval pipeline — useful because lesson 106 will significantly revamp
 * the assembly logic (routing, multi-turn, etc.) without touching retrieval.
 */
export interface Generator {
  generate(query: string, context: RankedChunk[]): Promise<Answer>;
}
