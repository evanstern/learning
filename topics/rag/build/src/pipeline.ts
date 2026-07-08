/**
 * pipeline.ts — Wire retrieve → generate into a single callable unit.
 *
 * The Pipeline class composes a Retriever and a Generator behind a simple
 * `ask(query)` interface. Callers (cli.ts) don't need to orchestrate the two
 * stages themselves — they just call `pipeline.ask(query)`.
 *
 * Why a separate file for this? It keeps cli.ts thin (UI concerns only) and
 * keeps retrieve.ts / generate.ts focused on their own stage. The composition
 * lives here, not scattered in main entry points.
 */

import type { Retriever, Generator, Answer } from "./types.js";

/** Default number of chunks to retrieve for each query. */
const DEFAULT_K = 5;

export class Pipeline {
  private retriever: Retriever;
  private generator: Generator;

  constructor(retriever: Retriever, generator: Generator) {
    this.retriever = retriever;
    this.generator = generator;
  }

  /**
   * ask — retrieve relevant chunks for the query, then generate a grounded answer.
   *
   * @param query  Natural-language question
   * @param k      Number of chunks to retrieve (defaults to DEFAULT_K)
   * @returns      An Answer with generated text and citations
   */
  async ask(query: string, k: number = DEFAULT_K): Promise<Answer> {
    // Step 1: retrieve — Retriever interface (DenseRetriever in 101).
    // 104: HybridRetriever replaces DenseRetriever behind this same interface.
    const context = await this.retriever.retrieve(query, k);

    if (context.length === 0) {
      return {
        text: "No relevant context found in the corpus. Try ingesting more files.",
        citations: [],
      };
    }

    // Step 2: generate — Generator interface (AnthropicGenerator in 101).
    // 106: prompt assembly and routing improvements behind this same interface.
    return this.generator.generate(query, context);
  }
}
