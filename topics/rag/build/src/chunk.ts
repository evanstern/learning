/**
 * chunk.ts — Turn parsed Sections into retrievable chunks.
 *
 * GRADUATED (lesson 102): in 101 this file slid a fixed 1000-char window across one
 * giant text blob. That window had no idea where one monster ended and the next
 * began, so chunks routinely straddled monster boundaries — the core retrieval bug.
 *
 * 102's rule is simple and structure-aware:
 *
 *      ONE CHUNK = ONE SECTION (one heading's worth of content).
 *
 * For the Monster Manual that means one chunk per monster (the leaf heading), e.g.
 * "Goblin" and "Goblin Boss" become two clean, separate chunks. Group headings that
 * carry their own intro prose (e.g. "Goblins", "Giants") also produce a chunk — the
 * group overview — which is itself a coherent semantic unit. (So the "G" page yields
 * one chunk per *monster* PLUS a handful of group-overview chunks. That's expected.)
 *
 * Size is a GUARD, not the boundary:
 *   - Oversized section  → sub-split into ≤ MAX_CHARS pieces, but only on whole-block
 *                          boundaries — an atomic block (a stat block) is never cut.
 *   - Trivially tiny     → merged into the previous chunk so we don't emit slivers.
 *
 * These thresholds are guards we'll tune with real eval data in 107 — they are NOT
 * magic numbers. They exist only to stop pathological extremes (a 20k-char prose
 * dump, or a one-word orphan heading), not to define the chunk boundary.
 */

import type { Chunk } from "./types.js";
import type { Section, ContentBlock } from "./html.js";
import crypto from "node:crypto";

/**
 * Upper guard on chunk size, in characters.
 *
 * ~1500 tokens-worth of English ≈ ~6000 chars (the rough 4-chars-per-token rule).
 * A section bigger than this gets sub-split. Most monster sections are far smaller
 * (a Goblin is ~600 chars), so this rarely fires — it's a safety net for long prose
 * sections, not the common path. GUARD (tune in 107), not a magic number.
 */
const MAX_CHARS = 6000;

/**
 * Lower guard: sections whose total text is below this are "trivially tiny" and get
 * merged into the previous chunk rather than emitted as their own sliver. Set well
 * below a real stat block (~500+ chars) so genuine monster sections are NEVER merged
 * away — this only catches orphan headings with almost no body. GUARD (tune in 107).
 */
const MIN_CHARS = 120;

/**
 * BuiltChunk — a Chunk plus the structural metadata ingest.ts needs to build the
 * sidecar. We surface `trail` and `kind` here (rather than stuffing them into Chunk)
 * so types.ts — the durable pipeline contract — stays untouched in 102.
 *
 * - chunk: the Chunk itself (id, text, source, section, ord)
 * - trail: heading breadcrumb trail for this chunk (book/source prepended in ingest)
 * - kind:  "statblock" | "prose" | "mixed" — a coarse content tag, handy for the
 *          metadata bag and for future structured-retrieval lessons.
 */
export interface BuiltChunk {
  chunk: Chunk;
  trail: string[];
  kind: string;
}

/**
 * chunkSections — assemble Sections into BuiltChunks.
 *
 * @param sections  Output of parseStructuredHtml, in document order
 * @param source    The book/source name (e.g. "Monster Manual"); seeds the chunk id
 *                  and is shown in citations
 */
export function chunkSections(sections: Section[], source: string): BuiltChunk[] {
  const out: BuiltChunk[] = [];
  let ord = 0;

  // Helper: stamp a finished piece of text into a BuiltChunk with a deterministic id.
  const emit = (text: string, section: Section, kind: string): void => {
    const id = chunkId(source, ord);
    out.push({
      chunk: {
        id,
        text,
        source,
        // `section` carries the human-readable breadcrumb trail. This is what shows
        // up in citations (generate.ts renders `source § section`) and as the
        // chunk's heading context in the LLM prompt — so populating it here is how
        // 102 makes citations show the trail WITHOUT touching generate.ts/types.ts.
        section: section.trail.join(" › "),
        ord,
      },
      trail: section.trail,
      kind,
    });
    ord++;
  };

  for (const section of sections) {
    const text = renderSection(section);
    if (!text) continue; // heading with no usable content at all

    // --- Merge rule: trivially tiny fragment → fold into the previous chunk. ---
    // Guards against orphan slivers (a bare sub-heading with a stray line). We never
    // hit this for real monsters because a stat block alone clears MIN_CHARS easily.
    if (text.length < MIN_CHARS && out.length > 0) {
      const prev = out[out.length - 1];
      prev.chunk.text = `${prev.chunk.text}\n\n${text}`;
      // The merged-in fragment is supplementary; the parent keeps its own trail/kind.
      continue;
    }

    // --- Common path: section fits under the guard → one chunk, untouched. ---
    if (text.length <= MAX_CHARS) {
      emit(text, section, classify(section.blocks));
      continue;
    }

    // --- Oversized section → sub-split on whole-block boundaries. ---
    // We pack content blocks into windows up to MAX_CHARS, never cutting inside an
    // atomic block. Each piece repeats the heading line so it stays self-describing.
    const heading = section.heading;
    for (const piece of packBlocks(section.blocks)) {
      const body = piece.map((b) => b.text).join("\n");
      emit(`${heading}\n${body}`, section, classify(piece));
    }
  }

  return out;
}

/**
 * renderSection — flatten a section into its chunk text: the heading line followed
 * by each content block. Returns "" if there's nothing but the heading.
 */
function renderSection(section: Section): string {
  const body = section.blocks.map((b) => b.text).join("\n");
  const text = body ? `${section.heading}\n${body}` : "";
  return text.trim();
}

/**
 * packBlocks — greedily group blocks into windows of <= MAX_CHARS, never splitting
 * an atomic block. An atomic block larger than MAX_CHARS is emitted alone (better an
 * oversized-but-whole stat block than a fractured one — wholeness wins over the guard).
 */
function packBlocks(blocks: ContentBlock[]): ContentBlock[][] {
  const windows: ContentBlock[][] = [];
  let cur: ContentBlock[] = [];
  let curLen = 0;

  for (const block of blocks) {
    const len = block.text.length;

    // Atomic block that would overflow the current window starts a fresh one.
    // If it overflows on its own, it still ships whole (wholeness beats the guard).
    if (curLen > 0 && curLen + len > MAX_CHARS) {
      windows.push(cur);
      cur = [];
      curLen = 0;
    }

    cur.push(block);
    curLen += len;

    // A non-atomic block can be flushed eagerly once we're over the guard.
    if (curLen >= MAX_CHARS && !block.atomic) {
      windows.push(cur);
      cur = [];
      curLen = 0;
    }
  }

  if (cur.length > 0) windows.push(cur);
  return windows.length > 0 ? windows : [[]];
}

/**
 * classify — coarse content tag for a set of blocks. "statblock" if it contains a
 * stat block, "prose" if it's all prose/aside, "mixed" otherwise. Feeds the metadata
 * bag; a future structured-retrieval lesson may key off it.
 */
function classify(blocks: ContentBlock[]): string {
  const hasStat = blocks.some((b) => b.kind === "statblock");
  const hasProse = blocks.some((b) => b.kind !== "statblock");
  if (hasStat && hasProse) return "mixed";
  if (hasStat) return "statblock";
  return "prose";
}

/**
 * chunkId — stable, deterministic chunk ID from (source, ord).
 *
 * Deterministic so re-ingesting the same corpus yields the same IDs (idempotent
 * upsert). Unchanged from 101 — the contract "same input → same id" still holds;
 * what changed is how many chunks (and thus ords) a page produces.
 */
function chunkId(source: string, ord: number): string {
  return crypto
    .createHash("sha1")
    .update(`${source}::${ord}`)
    .digest("hex")
    .slice(0, 16);
}
