/**
 * retrieve.ts — Query the vector store and return ranked chunks.
 *
 * The retrieval pipeline is:
 *   query string → embed → dense search → (rerank) → RankedChunk[]
 *
 * In lesson 101:
 *   - Embed: HashingEmbedder (bag-of-words hashing)   → real embeddings in 103
 *   - Search: sqlite-vec dense top-k                  → hybrid (dense+sparse) in 104
 *   - Rerank: IdentityReranker (no-op)                → cross-encoder/hosted in 105
 *
 * All three steps are behind interfaces (Embedder, Store, Reranker), so none of
 * those lesson upgrades touch this file's logic — only the injected implementations.
 */

import type { Embedder, Store, Retriever, Reranker, RankedChunk } from "./types.js";

/**
 * IdentityReranker — the 101 stub reranker that returns its input unchanged.
 *
 * Why include it at all? Because the Reranker seam forces the retrieval
 * pipeline to be structured correctly: retrieve top-k, then re-score.
 * In 105, when we swap in a real cross-encoder, the pipeline doesn't change —
 * only this implementation does.
 *
 * DUMB (lesson 105): replace with cross-encoder or hosted reranker (e.g. Cohere Rerank).
 */
export class IdentityReranker implements Reranker {
  // DUMB (lesson 105): real cross-encoder / hosted rerank
  async rerank(_query: string, hits: RankedChunk[]): Promise<RankedChunk[]> {
    // Identity: return hits in the same order with the same scores.
    // The underscore prefix on _query signals "intentionally unused" — TypeScript
    // strict mode would complain about unused parameters otherwise.
    return hits;
  }
}

/**
 * DenseRetriever — embeds the query, runs dense top-k search, applies reranker.
 *
 * This is the Retriever implementation for lessons 101–103.
 * Lesson 104 adds HybridRetriever (dense + sparse fusion) behind the same interface.
 *
 * // 104: add sparse + fusion here behind the Retriever interface.
 * // 105: real rerank injected via constructor.
 */
export class DenseRetriever implements Retriever {
  private embedder: Embedder;
  private store: Store;
  private reranker: Reranker;

  /**
   * All three dependencies are injected — callers swap implementations by passing
   * a different embedder/store/reranker. This file (and pipeline.ts) never import
   * concrete classes directly; they depend on the interfaces.
   */
  constructor(embedder: Embedder, store: Store, reranker: Reranker) {
    this.embedder = embedder;
    this.store = store;
    this.reranker = reranker;
  }

  /**
   * retrieve — embed the query, search for top-k similar chunks, rerank, return.
   *
   * @param query  Natural-language query string
   * @param k      Number of chunks to return (after reranking)
   */
  async retrieve(query: string, k: number): Promise<RankedChunk[]> {
    // Step 1: embed the query using the same embedder used during ingest.
    // Critical: if you change the embedder (or its dim) after ingest, you MUST
    // re-ingest — otherwise query vectors and stored vectors live in different spaces.
    const [queryVec] = await this.embedder.embed([query]);

    // Step 2: dense top-k search in sqlite-vec.
    // We fetch k*2 candidates to give the reranker enough to work with.
    // DUMB (104): this will become a hybrid call (dense + sparse fusion).
    const candidates = this.store.searchDense(queryVec, k * 2);

    // Step 3: rerank (identity in 101 — returns candidates unchanged).
    // DUMB (105): real cross-encoder reranker here.
    const reranked = await this.reranker.rerank(query, candidates);

    // Return top-k after reranking.
    return reranked.slice(0, k);
  }
}
