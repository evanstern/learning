/**
 * generate.ts — Assemble retrieved context into a prompt and call the LLM.
 *
 * This is the "G" in RAG. The generate pipeline is:
 *   query + RankedChunk[] → prompt assembly → LLM → Answer (with citations)
 *
 * Key design decision: the generator is grounded — it only uses retrieved context,
 * not the LLM's parametric memory. The prompt template explicitly instructs the
 * model to cite sources and say "I don't know" if the context doesn't cover it.
 *
 * Graceful degradation: the app runs with OR without an ANTHROPIC_API_KEY.
 * If the key is absent, generate() returns the assembled context as the answer.
 * This is critical for the 101 walking skeleton — learners without an API key can
 * still see the full pipeline working (ingest → retrieve → "generate").
 *
 * DUMB (lesson 106): prompt assembly here is minimal. Lesson 106 will:
 *   - Add routing (wiki vs monster manual)
 *   - Improve citation formatting
 *   - Handle multi-turn context
 *   - Tune the system prompt for D&D-specific grounding
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Generator, RankedChunk, Answer } from "./types.js";

/** Default model to use. Update in lesson 106 when we tune generation. */
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/** Number of tokens to reserve for the generated answer. */
const MAX_TOKENS = 1024;

/**
 * AnthropicGenerator — calls the Anthropic API to generate a grounded answer.
 *
 * Degrades gracefully if no API key is set: returns retrieved context directly
 * with a note explaining the degradation. The pipeline never crashes without a key.
 *
 * DUMB (lesson 106): prompt assembly and routing will be significantly improved.
 */
export class AnthropicGenerator implements Generator {
  private client: Anthropic | null;
  private model: string;

  constructor(model: string = DEFAULT_MODEL) {
    this.model = model;

    // Attempt to create the Anthropic client. If no key is set, store null
    // and let generate() handle it gracefully.
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    } else {
      this.client = null;
      console.warn(
        "ANTHROPIC_API_KEY not set — generate will return retrieved context only."
      );
    }
  }

  async generate(query: string, context: RankedChunk[]): Promise<Answer> {
    // Always build citations — they come from the retrieved chunks, not the LLM.
    // Even in the degraded (no-key) path, citations are populated correctly.
    const citations = context.map((rc) => ({
      source: rc.chunk.source,
      section: rc.chunk.section,
      chunkId: rc.chunk.id,
    }));

    if (!this.client) {
      // Degraded path: no LLM key. Return the raw context with a note.
      // The pipeline is still end-to-end: retrieve worked, we just skip the LLM call.
      const contextText = assembleContextBlock(context);
      return {
        text:
          `[No ANTHROPIC_API_KEY set — returning retrieved context instead of a generated answer]\n\n` +
          contextText,
        citations,
      };
    }

    // Build the prompt. We pass context as an explicit block so the model is
    // grounded — it should only answer from this context, not its parametric memory.
    const prompt = buildPrompt(query, context);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract the text content from the response.
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "[no response]";

    return { text, citations };
  }
}

/**
 * buildPrompt — assemble the LLM prompt from the query and retrieved context.
 *
 * DUMB (lesson 106): this is a minimal prompt. Lesson 106 will refine it for
 * D&D-specific grounding, citation formatting, and routing.
 */
function buildPrompt(query: string, context: RankedChunk[]): string {
  const contextBlock = assembleContextBlock(context);

  return `You are a D&D rules assistant. Answer the question below using ONLY the context provided.
If the context doesn't contain enough information to answer, say "I don't know based on the provided context."
Do not use knowledge outside of the provided context.

## Context (retrieved from the corpus)

${contextBlock}

## Question

${query}

## Answer

Answer concisely and accurately, citing the source section where relevant.`;
}

/**
 * assembleContextBlock — format retrieved chunks as a readable context block.
 *
 * Each chunk is labeled with its source and chunk ID so the LLM (and the user)
 * can trace statements back to specific source material.
 */
function assembleContextBlock(context: RankedChunk[]): string {
  return context
    .map((rc, i) => {
      const label = rc.chunk.section
        ? `${rc.chunk.source} — ${rc.chunk.section}`
        : rc.chunk.source;
      return `[${i + 1}] (${label}, chunk ${rc.chunk.id})\n${rc.chunk.text}`;
    })
    .join("\n\n---\n\n");
}
