# Guide: The Home Lab AI Hub — Getting More Out of Existing Hardware for Local LLMs

Companion reference to `deck.html`. The deck is for skimming/presenting; this is for coming
back to later when actually implementing the plan below.

## The setup

A Proxmox host ("infinity-node") already running 5 VMs:

| Component | Spec |
|---|---|
| CPU | AMD Ryzen 7 7700 — 8 cores / 16 threads |
| RAM | 128GB DDR5-3600, all 4 DIMM slots full |
| GPU | NVIDIA RTX 4060 Ti — **8GB VRAM** (confirmed via PCI BAR size, not assumed — this chip ships in both an 8GB and a 16GB SKU) |
| Motherboard | Gigabyte B650M C V2-Y1 (mATX), BIOS F33 |
| PCIe slots | PCIE1 (x16 physical, **x8 electrical**, holds the GPU today) · PCIE3 (free, x4 electrical) · one M.2 in use |
| Existing VMs | `emby`, `downloads`, `infinity-node-arr`, `misc`, `openclaw` — each configured for 32GB RAM |

**The real constraint isn't hardware existence — it's the GPU.** The 4060 Ti is passed
through *exclusively* to the `emby` VM via full PCI passthrough. No other VM, and not the
host itself, can touch it as configured.

RAM is also already tight: 5 VMs × 32GB configured = 160GB against 124GB physical usable —
Proxmox is relying on memory ballooning to make that work.

## Motivation (why this matters for the decisions below)

Learning-first, not speed-first: the goal is to understand the stack, not just end up with a
working assistant. Today's use case is coding. The box is explicitly expected to become a
broader "AI hub" as the home lab grows (agent frameworks, more local services). That framing
is why every decision below trades a little peak performance for headroom and reversibility.

## Decision 1 — GPU sharing strategy: restructure via LXC

Three options were on the table: reclaim the GPU from Emby outright, restructure sharing via
an LXC container, or skip the GPU fight and run CPU-only for now.

**Chosen: restructure via LXC.** Full VM passthrough is exclusive by design — LXC containers
share the host kernel and can share GPU device access concurrently. This buys flexibility:
Emby can later get its own small dedicated transcode card, and/or the 4060 Ti can be replaced
with something bigger, without undoing this decision.

**Real cost, not free:** this means **migrating Emby itself from a VM to an LXC container** —
not a config flag. (Implementation detail — not yet planned step-by-step. See Open threads.)

## Decision 2 — the upgrade path exists, and is deliberately parked

Checked before parking, not assumed:

- **RAM:** 128GB → 192GB requires **replacing all 4 DIMMs** with 48GB modules — there are no
  free slots to add into. Whether this exact board/BIOS supports 48GB-density modules beyond
  the SMBIOS-reported "128GB max" needs verifying against **Gigabyte's QVL for the B650M C
  V2-Y1 at BIOS F33** before buying anything (SMBIOS max-capacity fields are often stale
  relative to later BIOS-added support).
- **GPU slot bandwidth (x8 electrical, not x16) is a non-issue** for single-GPU LLM inference
  — PCIe bandwidth mostly matters for the one-time model-load transfer, not per-token
  throughput.
- **PCIE3 (free, x4 electrical) is mechanically enough** for a future small dedicated Emby
  transcode card.

**Deferred, not abandoned**, pending PSU wattage/connectors and physical case clearance —
neither was checkable mid-session.

## Decision 3 — inference engine: llama.cpp

Two axes were reasoned through in sequence:

1. **Ollama vs. "closer to the metal"** → chose closer to the metal, since the goal is
   learning the mechanics, not just having something that works.
2. **llama.cpp vs. vLLM**:

   | | llama.cpp | vLLM |
   |---|---|---|
   | Core design | Flexible GPU/CPU split (`n_gpu_layers`), GGUF quantization | PagedAttention + continuous batching |
   | Built for | One user on constrained, shared hardware | Many concurrent requests hitting one model |
   | Fit for this box | Matches today's reality (8GB, shared, one user) | Matches the *future* "AI hub" vision |

   **Chosen: llama.cpp.** Explicitly weighed learning-now over building-for-scale-later. This
   is reversible later — swapping engines is a runtime decision, not an architecture
   commitment.

## Decision 4 — the model stack: Qwen3-7B + Q4_K_M

Current (as of this lesson; verify against Ollama's library / Hugging Face trending before
actually pulling — 6+ months may have passed) best local coding options for 8GB VRAM:

- **Qwen3.5-9B (Q4_K_M)** — best-in-class benchmark performance, runs entirely in GPU memory
  even at 32K context, but leaves under ~1.1GB headroom on an *unshared* 8GB card.
- **Qwen3-7B** — highest HumanEval score (76.0) of any sub-8B model.
- DeepSeek-R1 8B (distilled), Llama 3.1 8B, Phi-4-mini (3.8B) — alternatives with more headroom.

**Chosen: Qwen3-7B.** Traded Qwen3.5-9B's higher benchmark score for real headroom against
Emby's concurrent transcoding on the same shared card.

**Quantization: Q4_K_M**, chosen over Q5_K_M/Q6_K — same headroom-over-quality tradeoff
applied a second time, on purpose.

**Final stack: `llama.cpp` + `Qwen3-7B` + `Q4_K_M`.**

## Why this actually works: VRAM vs. RAM bandwidth

Autoregressive token generation (batch size 1 — this use case) is **memory-bandwidth-bound,
not compute-bound**: generating each token requires streaming the model's active weights
through the compute units once. Tokens/sec tracks almost directly with how fast those weights
can move.

| | Bandwidth |
|---|---|
| RTX 4060 Ti (GDDR6 VRAM) | ~288 GB/s |
| DDR5-3600 dual-channel (system RAM) | ~57 GB/s |

That's roughly a **5x gap** — and it compounds when a layer is CPU-offloaded, since data also
has to cross the PCIe bus to reach system RAM instead of staying on the GPU's dedicated
memory bus. CPU/RAM offload is worth the slowdown only when running a model that flatly
wouldn't fit otherwise — not when interactive speed is the goal.

## Edge case: concurrent VRAM contention (and a corrected misconception)

**The failure mode:** under the LXC-sharing model, nothing enforces exclusivity the way full
passthrough did. If a long paste grows the LLM's KV cache (the running memory of a
generation — it grows with context length) at the same moment Emby starts a transcode, both
processes are drawing on the same physical 8GB.

**Misconception, corrected:** VRAM does **not** gracefully "spill" into system RAM at
runtime, the way Proxmox balloons a VM's memory. llama.cpp's GPU/CPU split (`n_gpu_layers`)
is fixed once, at model load — it is not renegotiated live. Running out of VRAM mid-generation
is a **hard CUDA out-of-memory crash**, not a slowdown.

**The fix:** hard-cap the maximum context length so peak KV cache + model weights stay under
~7GB, leaving Emby real headroom. Consumer NVIDIA cards have no OS/driver-level VRAM
partitioning between processes (that's a datacenter/vGPU-licensing feature) — so this cap has
to be enforced **inside llama.cpp's own configuration**, not at the Proxmox/LXC resource-limit
level. The exact context-length number to set is not yet computed (see Open threads).

## The bigger picture: what today's choice forecloses vs. leaves open

| Foreclosed (for now) | Stays open |
|---|---|
| Top-end reasoning on large, sprawling multi-file tasks (a 7B model attends less reliably across a lot of context than a 32B+ model) | Swapping models later is just a new GGUF file — no rearchitecting, and it doesn't touch anything else on the box |
| Emby's own VRAM headroom — now shared, not exclusive | The upgrade path (dedicated Emby card, bigger GPU) is completely untouched by today's choice |

## How this fits the rest of the home lab

Every existing service already gets its own VM/LXC with capped RAM/CPU, specifically so one
service can't swamp another (e.g. `downloads` vs. `emby`). The new LLM LXC follows the exact
same rule — it's not a special case. The learner is already planning a broader VM
reconfiguration to address the RAM overcommit (160GB configured vs. 124GB physical), separate
from this lesson's scope. Other non-GPU services planned for this box: Vaultwarden,
Linkwarden, downloads, the *arr stack — none of them compete for the 8GB card.

## Open threads (not blocking, but real)

- What the `openclaw` VM is actually running — never checked at the guest level; the name
  suggests it may already be related to the "claws"/agent-framework plans that motivated this
  whole lesson.
- Emby VM → LXC migration, step by step (decided *that* it happens in Decision 1, not yet
  planned *how*).
- The exact context-length number for the ~7GB VRAM cap (target agreed, number not computed).
- Resume the hardware upgrade path once PSU wattage/connectors and case clearance are known —
  see Decision 2 for what's already been verified.
- A broader VM/LXC reconfiguration ("already going to reconfigure and delete/unhost a bunch
  of stuff") was mentioned but not scoped — likely its own future lesson.

## Glossary

- **VRAM** — memory built directly onto the GPU, wired straight to its compute cores.
- **PCI passthrough** — handing an entire physical device to one VM exclusively.
- **LXC container** — shares the host's kernel instead of virtualizing its own hardware;
  multiple LXC containers can share access to a device like a GPU concurrently.
- **GGUF** — the quantized model file format llama.cpp reads.
- **Quantization** — compressing a model's weights to lower precision to save memory/increase
  speed, at some cost to output quality. Q4 keeps less precision than Q8.
- **`n_gpu_layers`** — the llama.cpp setting controlling how many of a model's layers run on
  GPU vs. spill to CPU.
- **PagedAttention** — vLLM's memory-management technique for serving many concurrent
  requests without wasting VRAM to fragmentation.
- **KV cache** — the running memory of an in-progress generation; grows with context length.
