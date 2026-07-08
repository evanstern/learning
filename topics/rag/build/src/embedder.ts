/**
 * embedder.ts — Text → vector embedding.
 *
 * Exports:
 *   - HashingEmbedder: the 101 "deliberately dumb" bag-of-words implementation (retained)
 *   - OllamaEmbedder:  GRADUATED (103) — real, learned, *local* embeddings via Ollama
 *
 * GRADUATED (lesson 103): OllamaEmbedder replaces HashingEmbedder as the wired-up
 * default (see cli.ts). It calls a local Ollama server to produce real semantic
 * embeddings (nomic-embed-text, 768-dim). The swap required ZERO changes to
 * ingest.ts or retrieve.ts — they depend only on the Embedder interface in types.ts.
 * That's the payoff of the stable-interface design: a body graduates, callers don't move.
 *
 * We KEEP HashingEmbedder in the file: it's a useful zero-dependency reference impl
 * (and a fallback when Ollama isn't available), and it makes the before/after of this
 * lesson legible — both embedders sit side by side behind the same interface.
 */

import type { Embedder } from "./types.js";

/**
 * HashingEmbedder — a bag-of-words embedder using a hash trick.
 *
 * How it works:
 *   1. Tokenize the text into lowercase words (split on non-alphanumeric chars).
 *   2. For each word, hash it to a dimension index (0..dim-1) using a simple
 *      djb2-style hash. This is the "hashing trick" used in old-school ML.
 *   3. Increment the count at that dimension (bag-of-words, ignoring order).
 *   4. L2-normalize the vector so cosine similarity == dot product.
 *
 * Why is this "dumb"?
 *   - It has NO semantic understanding. "dog" and "canine" land in completely
 *     different dimensions even though they mean the same thing.
 *   - Queries and documents that share words will have similar vectors; queries
 *     with synonyms or paraphrases will miss relevant chunks.
 *   - This is exactly the limitation that motivates lesson 103's real embeddings.
 *
 * Why is it useful for 101?
 *   - It's deterministic (no network, no GPU, no API key).
 *   - It produces real vectors with real nearest-neighbor geometry — the pipeline
 *     is genuinely wired end-to-end and does real vector search.
 *   - Its failure mode is intuitive: query "goblin habitat" won't retrieve a chunk
 *     that only uses the word "environment" — which is a perfect lesson-103 motivator.
 */
export class HashingEmbedder implements Embedder {
  // GRADUATED (103): dim=256 was tiny on purpose. The real model below
  // (nomic-embed-text) uses 768 dims. Changing dim after first ingest requires
  // wiping + re-ingesting — the sqlite-vec column is hard-typed `float[N]`.
  readonly dim: number;

  constructor(dim: number = 256) {
    this.dim = dim;
  }

  async embed(texts: string[]): Promise<number[][]> {
    // Process each text independently — no batching optimisation needed at this scale.
    return texts.map((text) => this.hashEmbed(text));
  }

  private hashEmbed(text: string): number[] {
    // Step 1: tokenize — lowercase, split on anything that isn't a letter/digit.
    const tokens = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0);

    // Step 2 + 3: for each token, hash it to a bucket and increment the count.
    const vec = new Array<number>(this.dim).fill(0);
    for (const token of tokens) {
      const idx = djb2(token) % this.dim;
      vec[idx] += 1;
    }

    // Step 4: L2-normalize so cosine similarity == dot product.
    // If the text is empty (all-whitespace), return the zero vector.
    return l2normalize(vec);
  }
}

/**
 * OllamaEmbedder — GRADUATED (103): real, learned, *local* embeddings.
 *
 * This is the whole point of lesson 103. Instead of counting hashed word buckets
 * (HashingEmbedder), we ask a neural embedding model — `nomic-embed-text`, served
 * locally by Ollama — to map text into a 768-dim *semantic* space. In that space,
 * "home", "lair", and "environment" land NEAR each other even though they share no
 * letters, because the model learned what they mean. That fixes the two failure modes
 * the hashing embedder had:
 *   - synonym blindness  ("home"/"lair" hashed to unrelated buckets)
 *   - stop-word pollution (shared boilerplate words dragged unrelated chunks together)
 *
 * Why *local* (Ollama) rather than a hosted embedding API?
 *   - No API key, no per-token cost, no data leaving the machine — ideal for learning.
 *   - It's a real network service though (HTTP to localhost:11434), so unlike the
 *     in-process HashingEmbedder, this one genuinely depends on a running server.
 *
 * Contract notes:
 *   - dim = 768 (fixed by the model). The Store creates its vec0 column at float[768].
 *   - embed() returns one vector per input text, IN INPUT ORDER (callers rely on this
 *     to zip vectors back onto their chunks).
 *   - Every returned vector is L2-NORMALIZED (see embed() for why this is mandatory).
 *
 * DEFERRED (107 tuning): nomic task prefixes for asymmetric retrieval.
 *   nomic-embed-text was trained with instruction prefixes — "search_document:" for
 *   stored passages, "search_query:" for queries — which can sharpen retrieval. We do
 *   NOT use them here: they'd break the *symmetric* Embedder.embed(texts) contract
 *   (ingest and query both call the same method, which has no idea which prefix to
 *   apply). The goblin/Grimlock distinction is semantically wide enough that bare
 *   nomic-embed-text clears the bar without them. If a future lesson needs prefixes,
 *   thread them as an optional role param defaulted so existing callers are unaffected.
 */
export class OllamaEmbedder implements Embedder {
  // Fixed by the model: nomic-embed-text emits 768-dim vectors.
  readonly dim = 768;

  // The model name as Ollama knows it (must be `ollama pull`'d first).
  private readonly model = "nomic-embed-text";

  // Base URL of the local Ollama server, e.g. "http://localhost:11434".
  private readonly baseUrl: string;

  /**
   * @param baseUrl  Ollama server URL. cli.ts passes process.env.OLLAMA_URL with a
   *                 localhost default. Trailing slash is tolerated (we trim it).
   */
  constructor(baseUrl: string = "http://localhost:11434") {
    // Trim a trailing slash so `${baseUrl}/api/embed` never doubles up.
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  /**
   * embed — batch-embed `texts` via Ollama's /api/embed endpoint.
   *
   * Endpoint shape (Ollama's *batch* embedding API):
   *   POST {baseUrl}/api/embed
   *   body:  { model: "nomic-embed-text", input: ["text one", "text two", ...] }
   *   reply: { embeddings: [[...768 floats...], [...], ...] }  // one row per input
   *
   * (Note: this is the newer plural `/api/embed`+`input` endpoint, NOT the legacy
   * singular `/api/embeddings`+`prompt` which only embeds one string at a time.)
   *
   * We use the global `fetch` (built into Node 24) — no new npm dependency.
   */
  async embed(texts: string[]): Promise<number[][]> {
    // Embedding an empty batch is a no-op — avoid a pointless network round-trip.
    if (texts.length === 0) return [];

    const url = `${this.baseUrl}/api/embed`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, input: texts }),
      });
    } catch (cause) {
      // Network-level failure: server down, wrong port, DNS, etc. fetch() throws
      // (it does NOT return a non-ok response here). Fail LOUDLY — unlike generation,
      // embedding cannot degrade gracefully: with no vectors there is nothing to store
      // or search. A silent fallback here would quietly corrupt the whole index.
      throw new Error(
        `OllamaEmbedder: could not reach Ollama at ${url}. ` +
          `Is the server running? Start it with the docker-compose stack ` +
          `(scripts/bootstrap.sh) or a local \`ollama serve\`. ` +
          `Underlying error: ${(cause as Error).message}`
      );
    }

    if (!res.ok) {
      // HTTP-level failure. The most common one in this lesson is 404 "model not
      // found" — the server is up but `nomic-embed-text` was never pulled. Surface
      // the body so the fix ("ollama pull nomic-embed-text") is obvious.
      const body = await res.text().catch(() => "");
      throw new Error(
        `OllamaEmbedder: Ollama returned ${res.status} ${res.statusText} from ${url}. ` +
          `If this is a 404, the model isn't pulled yet — run: ` +
          `\`ollama pull ${this.model}\` (or \`docker compose exec -T ollama ollama pull ${this.model}\`). ` +
          `Response body: ${body.slice(0, 500)}`
      );
    }

    const data = (await res.json()) as { embeddings?: number[][] };
    const embeddings = data.embeddings;

    // Defensive: the contract is one vector per input, in order. If the server gives
    // us a different count, downstream zipping (vectors[i] → chunk i) would silently
    // misalign vectors with their text — so we catch it here rather than later.
    if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
      throw new Error(
        `OllamaEmbedder: expected ${texts.length} embeddings, got ` +
          `${Array.isArray(embeddings) ? embeddings.length : typeof embeddings}. ` +
          `Unexpected response from ${url}.`
      );
    }

    // L2-NORMALIZE every vector before returning it. THIS IS MANDATORY, and it's the
    // conceptual core of the lesson:
    //   - SqliteVecStore.searchDense ranks by L2 (Euclidean) distance.
    //   - nomic-embed-text does NOT emit unit-length vectors — their magnitudes vary.
    //   - On the unit sphere (all vectors length 1), ranking by L2 distance gives the
    //     SAME order as ranking by cosine similarity — which is the metric we actually
    //     want for semantic similarity.
    //   - Skip this and a chunk could rank well just for having a *longer* vector,
    //     distorting results — the exact failure 103 is meant to fix.
    // We reuse the same l2normalize helper HashingEmbedder uses (shared below).
    return embeddings.map((v) => l2normalize(v));
  }
}

/**
 * djb2 — a classic string hash function. Fast, simple, good enough distribution
 * for the hashing trick. Not cryptographically secure (we don't need that here).
 */
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + charCode — the magic constant 33 (0x21) is from the original.
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // >>> 0 converts to unsigned 32-bit int so we never get a negative index.
  return hash >>> 0;
}

/**
 * l2normalize — scale a vector to unit length (length 1) and return a new array.
 * The zero vector is returned unchanged (can't divide by a zero magnitude).
 *
 * Shared by BOTH embedders (extracted in 103): HashingEmbedder uses it so cosine ==
 * dot product; OllamaEmbedder uses it so L2-distance ranking == cosine ranking
 * (see OllamaEmbedder.embed for the full why). One helper, one definition of "unit".
 */
function l2normalize(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map((v) => v / magnitude);
}
