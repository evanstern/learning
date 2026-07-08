/**
 * html.ts — Structure-aware HTML parsing for the-stacks v2.
 *
 * GRADUATED (lesson 102): in 101 this file did a crude tag-strip that threw away
 * all structure, producing one undifferentiated blob of text. That blob was then
 * sliced into fixed-size windows by chunk.ts — which is exactly why a single chunk
 * could straddle two monsters (Githyanki → Goblin), polluting embeddings and
 * citations alike.
 *
 * 102 replaces the blob with *structure*. We walk the page's DOM, recover its
 * heading hierarchy, and hand chunk.ts a list of `Section`s — one per heading.
 * Each section knows:
 *   - its heading text and level (h1..h6),
 *   - its full breadcrumb trail (the chain of ancestor headings), and
 *   - its content as a list of `ContentBlock`s, with stat blocks flagged ATOMIC
 *     so the chunker never splits one down the middle.
 *
 * The semantic decision ("what is a chunk?") lives in chunk.ts. This file's only
 * job is to faithfully recover the document's structure from messy DDB HTML.
 *
 * --------------------------------------------------------------------------
 * WHAT THE REAL HTML LOOKS LIKE (verified against the Monster Manual "G" page):
 *   - The real content lives inside a single `div.p-article-content`. Everything
 *     outside it (nav, page title repeated 3×) is chrome we want to ignore.
 *   - Inside, headings and content are a FLAT stream of sibling elements:
 *         <h2>Goblins</h2> <figure> <p>…intro…</p> <h3>Goblin</h3>
 *         <div class="…stat-block-background">…</div> <h3>Goblin Boss</h3> …
 *     i.e. a heading "owns" every sibling after it up to the next heading.
 *   - The heading hierarchy is genuine: h2 = monster/group, h3 = sub-monster
 *     (Goblins → Goblin, Goblin Boss), h4 = variant (Githyanki → Knight).
 *   - DDB stat blocks are NOT <table> elements — there are ZERO <table> tags on
 *     the page. A stat block is one self-contained `div.stat-block-background`.
 *     So "keep tables whole" (the 102 spec) really means "treat a stat-block div
 *     as one atomic block and never sub-split inside it" — which is what we do.
 * --------------------------------------------------------------------------
 */

import { parse, HTMLElement } from "node-html-parser";

/** The kinds of content block we distinguish. `statblock` is the one we must keep whole. */
export type BlockKind = "statblock" | "aside" | "prose";

/**
 * ContentBlock — one piece of content belonging to a section.
 *
 * `atomic` is the load-bearing flag: an atomic block is never split internally by
 * the chunker (a stat block sliced mid-row is useless). Prose blocks are splittable.
 */
export interface ContentBlock {
  text: string;
  kind: BlockKind;
  atomic: boolean;
}

/**
 * Section — one heading and the content directly under it (NOT its sub-headings'
 * content; each heading owns only the run of siblings up to the next heading).
 *
 * - level:   heading level (1..6), used by the chunker's hierarchy logic
 * - heading: this section's own heading text (e.g. "Goblin")
 * - trail:   full breadcrumb trail of headings down to and including this one
 *            (e.g. ["G | Monsters", "Goblins", "Goblin"]). The book/source name is
 *            NOT included here — ingest.ts prepends it when building `breadcrumbs`.
 * - blocks:  the content blocks under this heading, in document order
 */
export interface Section {
  level: number;
  heading: string;
  trail: string[];
  blocks: ContentBlock[];
}

/** Heading tags we treat as structural boundaries. */
const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

/**
 * parseStructuredHtml — turn raw DDB HTML into an ordered list of Sections.
 *
 * @param html  Raw HTML string (the contents of a saved DDB page)
 * @returns     Sections in document order, ready for chunk.ts to assemble.
 */
export function parseStructuredHtml(html: string): Section[] {
  const root = parse(html);

  // Drop non-content elements up front. Embedding minified JS/CSS would be noise.
  root.querySelectorAll("script, style, noscript").forEach((el) => el.remove());

  // Scope to the real article body. DDB wraps page content in `.p-article-content`;
  // everything else is nav/chrome (the page title appears 3× in the header alone).
  // Fallback to <body>, then the whole document, so this stays general for pages
  // that don't use the DDB compendium template.
  const container =
    root.querySelector(".p-article-content") ??
    root.querySelector("body") ??
    root;

  const sections: Section[] = [];

  // headingStack tracks the current breadcrumb trail. Each entry is an ancestor
  // heading still "in scope". When we see a heading of level L, we pop everything
  // at level >= L (those sections are closed) and push the new one. The stack's
  // texts, top to bottom, ARE the breadcrumb trail.
  const headingStack: { level: number; text: string }[] = [];

  // The section we're currently filling. Content blocks attach here until the next
  // heading starts a new one.
  let current: Section | null = null;

  // Walk the FLAT stream of direct child elements. From the verified DOM, headings
  // and their content are siblings at this level — so a single linear pass recovers
  // the whole structure. (We intentionally do NOT recurse: nested content lives
  // *inside* these siblings and is captured by element.text.)
  for (const node of container.childNodes) {
    // node-html-parser yields text nodes too; we only care about elements.
    if (!(node instanceof HTMLElement)) continue;
    const el = node;
    const tag = el.tagName?.toUpperCase();
    if (!tag) continue;

    if (HEADING_TAGS.has(tag)) {
      const level = Number(tag[1]); // "H3" -> 3
      const text = collapse(el.text);
      if (!text) continue; // skip empty headings defensively

      // Close any sections at this level or deeper, then open this one.
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].level >= level
      ) {
        headingStack.pop();
      }
      headingStack.push({ level, text });

      current = {
        level,
        heading: text,
        trail: headingStack.map((h) => h.text),
        blocks: [],
      };
      sections.push(current);
      continue;
    }

    // Non-heading element → content for the current section.
    const block = toContentBlock(el);
    if (!block) continue; // empty/whitespace-only (e.g. image-only <figure>)

    if (current) {
      current.blocks.push(block);
    } else {
      // Content before the first heading (rare lead-in). Park it under a synthetic
      // section so it isn't silently dropped, but give it level 0 so it never
      // becomes anyone's parent in the trail.
      current = { level: 0, heading: "(intro)", trail: ["(intro)"], blocks: [block] };
      sections.push(current);
    }
  }

  return sections;
}

/**
 * toContentBlock — classify a content element and extract its text.
 *
 * Returns null for elements with no meaningful text (e.g. a <figure> that holds
 * only an image), so empty blocks never reach the chunker.
 */
function toContentBlock(el: HTMLElement): ContentBlock | null {
  const text = collapse(el.text);
  if (!text) return null;

  const cls = el.getAttribute("class") ?? "";
  const tag = el.tagName?.toUpperCase();

  // A DDB stat block is a single `div` carrying the `stat-block-background` class.
  // It contains the creature's whole stat table (AC, HP, ability scores, actions).
  // It must stay whole: a stat block split mid-row can't be read or cited.
  // NOTE: there are NO <table> elements on these pages — this div IS the "table"
  // the 102 spec refers to. (See file header.)
  if (/stat-block-background/i.test(cls)) {
    return { text, kind: "statblock", atomic: true };
  }

  // Epigraphs / pull-quotes (<aside>) are short, self-contained flavor text.
  // Keep them atomic too — they read as a unit and are never worth splitting.
  if (tag === "ASIDE") {
    return { text, kind: "aside", atomic: true };
  }

  // Everything else (paragraphs, lists, etc.) is splittable prose.
  return { text, kind: "prose", atomic: false };
}

/** Collapse all runs of whitespace to single spaces and trim. */
function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
