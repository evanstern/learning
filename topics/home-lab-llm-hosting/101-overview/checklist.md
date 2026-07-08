# Understanding Checklist: Home Lab — Getting More Out of Existing Hardware for Local LLMs

> Design/tradeoff lesson — discussion mode. Boxes check only when the learner has
> critiqued, redirected, or decided something in their own words.

## 1. The Problem
- [x] What's actually driving the desire to self-host (privacy, cost over time, control, learning, latency)? — *raw-notes [2]: learning-first, coding use case today, "this box becomes the AI hub" as the home lab expands*
- [x] What's the real constraint on "what can I run" — is it RAM, VRAM, compute, or something else? — *demonstrated indirectly: raw-notes [4]'s LXC-sharing decision only makes sense if the learner grasped that the real constraint is GPU contention (exclusive passthrough to Emby), not raw VRAM/compute availability*
- [x] What are the different levers available to get more out of *existing* hardware before buying anything new? — *raw-notes [4] (restructure GPU sharing via LXC) + [6] (explicitly deferred the buy-new path to focus on what's available now)*

## 2. The Solution
- [x] How do model size, quantization level, and available VRAM/RAM interact to determine what's runnable? — *raw-notes [10]: traded peak coding-benchmark score (Qwen3.5-9B) for shared-GPU headroom (Qwen3-7B) — real reasoning about the interaction, not just picking the "best" model*
- [x] Why does GPU VRAM matter more than system RAM for inference speed — and when does CPU/RAM offload become an acceptable tradeoff instead of a bottleneck? — *raw-notes [12]: correct, unaided ("wired pretty much directly into the GPU... matrix math") — bandwidth-matched + tightly-coupled memory, and single-batch decoding is memory-bandwidth-bound*
- [x] Key design decisions: inference engine/runtime choice, model family/size, quantization level — and what each trades away — *runtime: llama.cpp ([9]); model: Qwen3-7B ([10]); quant: Q4_K_M for max headroom ([11])*
- [x] Edge cases and failure modes: context length blowing up memory use, running multiple models/services concurrently, thermal/power ceilings in a home lab environment — *raw-notes [13]/[14]: identified the real concurrent-VRAM-contention risk (LLM KV cache growth vs. Emby transcode buffers on one shared 8GB card) and proposed the correct mitigation (hard VRAM cap ~7GB); thermal/power ceilings not separately explored but the core memory-contention edge case is demonstrated*

## 3. The Bigger Picture
- [x] How does today's hardware/software choice constrain or enable later plans (agent frameworks, tool-calling loops, multiple concurrent services like "Hermes"/other local stacks)? — *raw-notes [4]: explicitly chose LXC sharing over reclaiming the GPU outright specifically to preserve future flexibility*
- [x] What does committing to a given model size/quantization foreclose vs. leave open? — *raw-notes [15]: foreclosed = Emby's own VRAM headroom now capped/shared; open = the deferred upgrade path (dedicated card or separate box for Emby) still fully applies*
- [x] How does this fit into the broader home lab (networking, other running services, power budget, upgrade path)? — *raw-notes [16]: the new LLM LXC follows the same per-service resource-isolation pattern already governing the box (separate VMs so one service can't swamp another); RAM overcommit is being actively addressed, not ignored. Upgrade-path sub-thread (raw-notes [5]) remains intentionally deferred per [6] — parked, not blocking.*
