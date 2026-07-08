/**
 * store.ts — sqlite-vec vector store.
 *
 * sqlite-vec is a SQLite extension that adds vector search to a regular SQLite DB.
 * We use better-sqlite3 (synchronous SQLite bindings for Node) + the sqlite-vec
 * loadable extension.
 *
 * Why sqlite-vec?
 *   - No separate DB service — just a file on disk. Great for a local learning project.
 *   - SQLite's ACID guarantees mean upsert is safe to run repeatedly (idempotent ingest).
 *   - The file-based store is trivial to wipe and re-create (teardown.sh deletes it).
 *   - In production you'd use a dedicated vector DB (Pinecone, Weaviate, pgvector, etc.)
 *     but for learning the tradeoffs, file-based is simpler to reason about.
 *
 * Schema overview:
 *   chunks       — the main metadata table (id, source, section, ord, rawText, meta)
 *   vec_chunks   — the sqlite-vec virtual table (id, vector)
 *
 * Why two tables? sqlite-vec virtual tables store only the vector + an ID.
 * We JOIN back to `chunks` to get the metadata (source, text, etc.) at query time.
 * This split is the standard pattern with sqlite-vec.
 *
 * DUMB (lesson 104): rawText and meta are stored but not yet used for retrieval.
 * Hybrid search (BM25 + dense fusion) in lesson 104 will query rawText and meta.
 *
 * GUARD (103, return leg): init() now detects a DB built at a different embedding
 * dimension (e.g. an old float[256] DB met by the 768-dim nomic embedder) and fails
 * with a clear "wipe + re-ingest" message instead of an opaque mid-transaction
 * "Dimension mismatch" later in upsert(). This is the only logic change to store.ts
 * in 103 (the spec scoped store.ts to a docstring fix; the dim-guard was added in the
 * return leg, authorized by the lesson author — see 103 POST_BUILD_HANDOFF deviation).
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type { Store, ChunkRecord, RankedChunk } from "./types.js";

export class SqliteVecStore implements Store {
  private db: Database.Database;
  private dim: number;

  /**
   * @param dbPath  Path to the SQLite file. Created if it doesn't exist.
   * @param dim     Dimensionality of vectors. Must match the Embedder in use.
   *                Changing this after the DB is created requires a full re-ingest.
   */
  constructor(dbPath: string, dim: number) {
    this.db = new Database(dbPath);
    this.dim = dim;

    // Load the sqlite-vec extension. This adds vector search capabilities to SQLite.
    // sqlite-vec is distributed as a native Node module alongside better-sqlite3.
    // Under the hood, sqliteVec.load() calls db.loadExtension() with the right paths.
    sqliteVec.load(this.db);
  }

  /**
   * init — create the schema if it doesn't already exist.
   *
   * Safe to call on every startup — all statements are CREATE IF NOT EXISTS.
   * This means you can run `npm run ingest` multiple times without wiping the DB.
   */
  init(): void {
    // GUARD (103, added in the return leg): detect a pre-existing vector table built
    // at a DIFFERENT embedding dimension and fail loudly with a fix.
    //
    // Why this exists: `CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks ... float[N]`
    // is a no-op if the table already exists — so if the DB was created at float[256]
    // (the 101/102 hashing embedder) and we now embed at float[768] (nomic-embed-text),
    // the schema silently stays 256-dim and the mismatch only surfaces much later as an
    // opaque "Dimension mismatch ... Expected 256 ... received 768" thrown from deep
    // inside upsert(), mid-transaction. That's a confusing failure for a learner.
    //
    // Instead we read the existing table's declared dimension from sqlite_master and,
    // if it disagrees with the current embedder, throw a clear, actionable error HERE
    // (before any work). We do NOT auto-wipe — silently deleting the user's DB is the
    // wrong default. But the fix is safe and one line: vectors are a DERIVED CACHE of
    // (corpus + model), so re-ingesting from the source HTML rebuilds them losslessly.
    //
    // This is the same "fail loudly with a clear message" ethos as OllamaEmbedder, and
    // it makes 103's headline rule — "changing the model/dim requires a full re-ingest"
    // — enforced by the code, not just documented in the README.
    const existingVecTable = this.db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vec_chunks'`
      )
      .get() as { sql: string } | undefined;
    if (existingVecTable) {
      // The declared dimension lives in the stored CREATE statement, e.g. "...float[256]".
      const match = existingVecTable.sql.match(/float\[(\d+)\]/i);
      const existingDim = match ? Number(match[1]) : undefined;
      if (existingDim !== undefined && existingDim !== this.dim) {
        throw new Error(
          `SqliteVecStore: this database was built for ${existingDim}-dim vectors, but the ` +
            `current embedder produces ${this.dim}-dim vectors. The embedding model or its ` +
            `dimension changed, and there is NO in-place migration. Wipe and re-ingest:\n` +
            `  rm stacks.db   (or ./scripts/teardown.sh)\n` +
            `  npx tsx src/cli.ts ingest\n` +
            `This is safe — stored vectors are a derived cache of (corpus + model); the source ` +
            `HTML in corpus/ is the source of truth.`
        );
      }
    }

    // The chunks table holds the "human-readable" side of every record.
    //
    // Columns:
    //   id       — stable hash-based ID (see chunk.ts)
    //   source   — filename of originating HTML (e.g. "goblin.html")
    //   section  — heading/section from the page; NULL in 101 (populated in 102)
    //   ord      — ordinal within source (chunk index)
    //   text     — the embedded text (what the LLM sees in context)
    //   rawText  — mirrors text for now; DUMB (104): original unmodified text for BM25
    //   meta     — JSON tag bag; POPULATED (102) with source/breadcrumbs/chunkId/kind; used for filtered/hybrid retrieval in 104
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id      TEXT PRIMARY KEY,
        source  TEXT NOT NULL,
        section TEXT,
        ord     INTEGER NOT NULL,
        text    TEXT NOT NULL,
        rawText TEXT NOT NULL,
        meta    TEXT NOT NULL DEFAULT '{}'
      );
    `);

    // The sqlite-vec virtual table. This is where the actual vector search happens.
    //
    // vec_chunks is a VIRTUAL TABLE managed by the sqlite-vec extension. It stores
    // a float32 vector of `dim` dimensions for each row, keyed by `id`.
    //
    // The `float[N]` type tells sqlite-vec the vector dimension. It must match
    // the dimension used when inserting and querying — a mismatch is a runtime error.
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        id     TEXT PRIMARY KEY,
        vector float[${this.dim}]
      );
    `);
  }

  /**
   * upsert — insert or replace chunk records.
   *
   * We run both writes in a transaction so chunks and their vectors stay in sync.
   *
   * The `chunks` table is a normal table, so INSERT OR REPLACE overwrites cleanly.
   *
   * FIX (lesson 102): the `vec_chunks` table is a sqlite-vec `vec0` VIRTUAL table,
   * and it does NOT honor `INSERT OR REPLACE` on its primary key — re-inserting an
   * existing id raises "UNIQUE constraint failed on vec_chunks primary key" instead
   * of replacing the row. (101 claimed idempotent in-place re-ingest, but that only
   * ever worked against an EMPTY db — the second ingest threw and rolled back.) So
   * for the vector table we DELETE-then-INSERT, which is the supported way to update
   * a vec0 row. This makes re-ingest genuinely idempotent: same input → same ids →
   * rows replaced in place, no wipe required.
   */
  upsert(records: ChunkRecord[]): void {
    const insertChunk = this.db.prepare(`
      INSERT OR REPLACE INTO chunks (id, source, section, ord, text, rawText, meta)
      VALUES (@id, @source, @section, @ord, @text, @rawText, @meta)
    `);

    // vec0 has no REPLACE semantics — remove any existing vector for this id first.
    const deleteVec = this.db.prepare(`DELETE FROM vec_chunks WHERE id = ?`);
    const insertVec = this.db.prepare(`
      INSERT INTO vec_chunks (id, vector)
      VALUES (@id, @vector)
    `);

    // Wrap in a transaction: all-or-nothing, and much faster than individual commits.
    const insertAll = this.db.transaction((recs: ChunkRecord[]) => {
      for (const r of recs) {
        insertChunk.run({
          id: r.id,
          source: r.source,
          section: r.section ?? null,
          ord: r.ord,
          text: r.text,
          rawText: r.rawText,
          meta: JSON.stringify(r.meta),
        });

        // sqlite-vec expects vectors as a Float32Array serialized to a Buffer.
        // This is the wire format sqlite-vec uses internally.
        const buf = Buffer.from(new Float32Array(r.vector).buffer);
        deleteVec.run(r.id); // no-op on first ingest; clears the old row on re-ingest
        insertVec.run({ id: r.id, vector: buf });
      }
    });

    insertAll(records);
  }

  /**
   * searchDense — top-k nearest-neighbor search using vector similarity.
   *
   * CORRECTED (103): sqlite-vec performs EXACT, brute-force KNN — it compares the
   * query against *every* stored vector and returns the true k nearest. It is NOT
   * approximate nearest-neighbor (ANN); there is no index to tune and no recall to
   * trade away. (An earlier comment here called it "ANN" — that was wrong.) Brute
   * force is exactly the right call at our scale: a few dozen chunks, exact results,
   * zero tuning. The Store interface stays swappable, so if we ever outgrow exact
   * search we can drop in an ANN-backed store without touching callers.
   *
   * We then JOIN to the chunks table to recover metadata for each hit.
   *
   * The query uses sqlite-vec's KNN syntax: `WHERE vector MATCH ? AND k = ?`,
   * which returns the k closest vectors by L2 distance. We convert distance to a
   * cosine-like score (higher = better) by returning 1/(1+distance). Because we
   * L2-normalize every stored and query vector (see embedder.ts), L2-distance order
   * here is identical to cosine-similarity order.
   *
   * DUMB (lesson 104): only dense search here. Lesson 104 adds sparse (BM25)
   * search and fuses the two result sets (Reciprocal Rank Fusion or similar).
   *
   * @param queryVec  The embedded query vector (must have dim = this.dim)
   * @param k         Number of results to return
   */
  searchDense(queryVec: number[], k: number): RankedChunk[] {
    // Serialize the query vector the same way we serialize stored vectors.
    const queryBuf = Buffer.from(new Float32Array(queryVec).buffer);

    // sqlite-vec KNN query. The `distance` column is L2 distance (lower = closer).
    // We JOIN to the chunks table to get text + metadata for each hit.
    const rows = this.db
      .prepare(
        `
        SELECT
          c.id, c.source, c.section, c.ord, c.text,
          v.distance
        FROM vec_chunks v
        JOIN chunks c ON c.id = v.id
        WHERE v.vector MATCH ?
          AND k = ?
        ORDER BY v.distance
      `
      )
      .all(queryBuf, k) as Array<{
        id: string;
        source: string;
        section: string | null;
        ord: number;
        text: string;
        distance: number;
      }>;

    // Convert L2 distance to a similarity score: 1/(1+distance).
    // - distance=0  → score=1.0 (perfect match)
    // - distance=∞  → score→0  (totally dissimilar)
    // This makes higher score = better match, which is the convention for RankedChunk.
    return rows.map((row) => ({
      chunk: {
        id: row.id,
        text: row.text,
        source: row.source,
        section: row.section ?? undefined,
        ord: row.ord,
      },
      score: 1 / (1 + row.distance),
    }));
  }

  /** Close the database connection. Call on process exit or after tests. */
  close(): void {
    this.db.close();
  }
}
