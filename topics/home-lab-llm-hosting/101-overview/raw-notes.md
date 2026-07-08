# Raw Notes: Home Lab — Getting More Out of Existing Hardware for Local LLMs

> **This file is append-only and ENFORCED.** After *every* question→answer exchange in the
> lesson, add one entry to the Session log below — before the next question is posed. One
> exchange, one entry. No exchange goes unrecorded.
>
> Why this matters: the raw notes are the highest-value artifact a lesson produces. They
> capture the AHA moments, what went right or wrong, and the tangents worth chasing — the
> raw material a later review uses to improve this lesson (and past/future lesson plans). A
> thin log is a thin review.

## Session log (one entry per exchange — newest at the bottom)

<!-- Copy this block for each exchange. Keep it fast; a terse entry beats a skipped one.
### [n] <3–6 word label>
- **Q:** the question posed
- **A (gist):** what the learner answered, in a line
- **Verdict:** aha · correct · partial · wrong · tangent
- **Note:** the insight, misconception, or thing to remember — the part worth keeping
-->

### [1] Hardware discovery via SSH to Proxmox
- **Mode:** discovery (not one of the three canonical modes — live tool-based investigation, not a posed reasoning check)
- **Q:** What does the actual home lab hardware look like? (posed the "what's driving this" question first; learner instead granted SSH access to the Proxmox host)
- **A (gist):** Learner gave `root@192.168.1.81` + existing `id_ed25519` key. Live inspection: AMD Ryzen 7 7700 (8c/16t), 124GiB RAM (~22GiB free right now), one discrete NVIDIA RTX 4060 Ti (VRAM variant unconfirmed — 8GB vs 16GB SKU) plus the Ryzen's Raphael iGPU (not useful for serious LLM inference). 5 VMs running: emby, downloads, infinity-node-arr, misc, openclaw — each provisioned `memory: 32768` (32GB) with lower balloon targets, so nominal allocation (160GB) exceeds physical RAM (124GB); host is relying on ballooning/overcommit. Critically: the 4060 Ti is passed through **exclusively** to the `emby` VM (hostpci0/1 in its config) — no other VM or the host itself can currently touch it.
- **Verdict:** n/a (discovery turn, not a reasoning check)
- **Note:** The real constraint isn't "does the hardware exist" — it clearly does — it's that the one GPU capable of real LLM inference is already committed 100% to hardware transcoding for Emby via exclusive PCI passthrough. Any local-LLM plan has to resolve that contention first (share it differently, e.g. LXC instead of full VM passthrough; take it from Emby; or accept CPU-only / iGPU-only inference). Also flagged the RAM overcommit (5×32GB configured against 124GB physical) as a constraint worth surfacing before adding another memory-hungry service.

### [2] What's driving self-hosting
- **Mode:** socratic — recall/why question, learner answered unaided
- **Q:** What's actually driving the desire to self-host here — privacy, cost, latency, learning, something else? And is `openclaw` already related to the "claws"/agent plans?
- **A (gist):** Primarily learning-driven — wants to see what can be squeezed out of existing hardware. Use case is mostly coding today. Explicitly frames this box as eventually becoming a broader "AI hub" as the home lab expands. Didn't yet address `openclaw`.
- **Verdict:** correct
- **Note:** Motivation being learning-first (not latency/cost-first) changes the tradeoff calculus — it argues for a setup optimized for understanding/iterating over the stack rather than the fastest tokens/sec today. But "this becomes the AI hub eventually" is a real forward-looking constraint: today's GPU-sharing decision shouldn't paint the box into a corner that has to be undone later.

### [3] Confirming GPU VRAM and checking openclaw
- **Mode:** discovery
- **Q:** (follow-up discovery) What's the actual VRAM on the 4060 Ti, and what is `openclaw` configured to do?
- **A (gist):** Checked host-side via PCI BAR size (`lspci -vv`) since the GPU is passed through and no driver/nvidia-smi runs on the host itself: Region 1 prefetchable BAR = 8G → this is the **8GB** RTX 4060 Ti, not the 16GB SKU. `openclaw`'s full config shows no `hostpci` entries at all — it's CPU-only, 8 cores / 32GB RAM (balloon min 8GB) / 200GB disk, network via vmbr0. Its actual running workload is still unknown (would need guest-level access, not yet requested).
- **Verdict:** n/a (discovery turn)
- **Note:** 8GB VRAM is a meaningfully tighter constraint than 16GB would have been — it caps clean single-GPU inference to roughly 7B–13B class models at 4-bit quantization with modest context before needing CPU offload. That interacts directly with "coding use case" (larger coding-tuned models tend to perform much better) and "future AI hub" (more headroom needed later). Still open: what `openclaw` is already running — its name strongly suggests it's not unrelated to the "claws" the learner mentioned wanting to host.

### [4] Design decision: GPU sharing strategy
- **Mode:** discussion — options stated (including a recommendation-adjacent framing), but the box only checks because the learner weighed them and decided in their own words
- **Q:** Given the tradeoff (reclaim GPU from Emby now / restructure sharing via LXC / go CPU-only on openclaw for now) — which way, and why?
- **A (gist):** Restructure via LXC sharing. Reasoning: buys flexibility until a future hardware upgrade — Emby eventually gets its own small dedicated transcode GPU and/or the 4060 Ti gets replaced with something bigger. Doesn't want to force a permanent decision now.
- **Verdict:** correct — real reasoning, own words, weighed against a stated future upgrade path rather than just picking an option.
- **Note:** Flagged an implication the learner should know before committing: full VM passthrough (what Emby uses today) is exclusive; LXC containers share the host kernel and can share GPU device nodes concurrently. So "restructure via LXC" isn't a config toggle — it means migrating Emby itself from a VM to an LXC container, not just adding a new container alongside it. Learner immediately pivoted to asking about the future upgrade pathway (motherboard/RAM/GPU ceiling), so this is being carried forward as an open thread rather than fully resolved yet.

### [5] Upgrade-path hardware discovery
- **Mode:** discovery
- **Q:** (follow-up discovery, prompted by learner's upgrade-pathway question) What does the motherboard/RAM/PCIe topology actually support?
- **A (gist):** Board is a Gigabyte B650M C V2-Y1 (mATX, budget B650), BIOS F33 (Mar 2025). RAM: 4/4 DIMM slots populated with 32GB DDR5-3600 (128GB total, all slots full — SMBIOS reports 128GB as "Maximum Capacity"). PCIe: only one full-length slot (PCIE1, wired **x8 electrical** despite x16 physical, holds the 4060 Ti today) + one free **PCIE3, x4 electrical** slot + one occupied M.2. Chassis reports generically as "Desktop" — no usable model info.
- **Verdict:** n/a (discovery turn)
- **Note:** Two things the learner should know before committing to an upgrade order: (1) 128GB→192GB RAM means *replacing* all 4 sticks with 48GB modules, not adding — there are zero free slots — and whether this specific board/BIOS actually supports 48GB density beyond the SMBIOS-stated 128GB max needs checking against Gigabyte's QVL for this exact model + BIOS F33 (SMBIOS max-capacity fields are often stale relative to later BIOS-added support, so this needs verifying rather than assuming either way). (2) The GPU slot being x8 electrical (not x16) is basically a non-issue for single-GPU LLM inference — PCIe bandwidth mostly matters for the one-time model-load transfer, not per-token throughput — so it shouldn't drive the GPU-tier decision. The free PCIE3 (x4) slot is mechanically enough for a small dedicated Emby transcode card, which matches the learner's stated future plan. Still missing: PSU wattage/connectors and physical case clearance — can't be read over SSH, need the learner to check directly.

### [6] Deferring the upgrade path
- **Mode:** discussion — scoping decision, learner's own call
- **Q:** (implicit continuation) PSU/case info isn't available right now — how to proceed?
- **A (gist):** Defer the hardware-upgrade pathway entirely for later; focus now on what can be done with the current hardware (8GB 4060 Ti via LXC-shared GPU, 128GB RAM, learning-first + coding use case).
- **Verdict:** correct — a real scoping decision, not just a stall. Keeps the lesson moving on what's actionable today instead of blocking on unavailable info.
- **Note:** This closes out section 3 (bigger picture / future path) as "acknowledged, intentionally parked" rather than "resolved" — the upgrade pathway open thread stays in progress.json for a future session. Pivot point: the lesson now moves fully into section 2 (The Solution) — inference engine choice, model/quantization fit for 8GB VRAM, and the mechanics of the Emby VM→LXC + shared-GPU migration.

### [7] Inference engine philosophy
- **Mode:** discussion — options + tradeoffs stated, learner critiqued/chose in their own words
- **Q:** Given the learning-first motivation — start simple with Ollama (hides the mechanics), or closer to the metal with llama.cpp/vLLM (more setup, but the knobs you're trying to learn are visible)?
- **A (gist):** "llama.cpp or vLLM sounds my speed" — chose the close-to-the-metal path, hasn't yet picked between the two.
- **Verdict:** correct (on the Ollama-vs-metal axis) / partial (llama.cpp vs vLLM still open)
- **Note:** Confirms the learning-first framing from entry [2] is actually driving decisions, not just stated as an abstract goal — good consistency signal. Next: needs to pick between llama.cpp and vLLM specifically, which turns on a different axis (single-user flexible GPU offload vs multi-user throughput serving) that hasn't been surfaced yet.

### [8] Requesting more detail before deciding
- **Mode:** discussion
- **Q:** (same llama.cpp vs vLLM question, re-posed after artifact sync)
- **A (gist):** "not sure, explain each a bit" — wants more grounding before choosing.
- **Verdict:** partial — not a stall, a reasonable ask for more information before committing to a real decision.
- **Note:** Normal sequencing in discussion mode — the box for 2.3 stays open/in-progress until an actual choice with reasoning follows the explanation.

### [9] Design decision: inference engine
- **Mode:** discussion
- **Q:** llama.cpp vs vLLM, given the today-vs-future tension (today's 8GB shared card favors llama.cpp; the future "AI hub" vision is closer to what vLLM is built for)?
- **A (gist):** llama.cpp, for now — explicitly weighing learning-now over building-for-scale-later.
- **Verdict:** correct — real tradeoff reasoning in own words, consistent with the learning-first motivation from [2] and the "defer, don't over-build" pattern from [6].
- **Note:** This closes the runtime half of checklist item 2.3. Model family + quantization level (the other half of 2.3, plus 2.1/2.2) still open — natural next step.

### [10] Design decision: model family/size
- **Mode:** discussion
- **Q:** Given the shared-GPU headroom concern (Emby transcoding on the same 8GB card) — strongest-fit model that still technically fits (Qwen3.5-9B) or something with more deliberate headroom (Qwen3-7B / Phi-4-mini / lower quant)?
- **A (gist):** "I think Qwen3-7B will be fine" — picked the smaller/more-headroom option over the top-benchmark pick.
- **Verdict:** correct — a real choice among the presented options, implicitly trading peak coding-benchmark score for shared-GPU headroom, consistent with the learning-first/pragmatic pattern across this whole session.
- **Note:** Closes most of checklist 2.3 (runtime: llama.cpp, model: Qwen3-7B) and demonstrates 2.1's size↔VRAM interaction in practice. Quantization level (Q4_K_M vs Q5_K_M/Q6, the same headroom tradeoff applied to quant instead of model size) is the one piece of 2.3 still open.

### [11] Design decision: quantization level
- **Mode:** discussion
- **Q:** Spend the model-size headroom back on a higher quant (Q5_K_M/Q6_K, better quality) or keep stacking headroom with Q4_K_M?
- **A (gist):** Keep the extra headroom — i.e. Q4_K_M.
- **Verdict:** correct — consistent with the headroom-prioritizing pattern from [10]; a real, deliberate choice rather than defaulting to "highest quality."
- **Note:** Closes checklist 2.3 fully: llama.cpp + Qwen3-7B + Q4_K_M. Stack: this is now a fully specified, reasoned-through inference setup, not just a list of names.

### [12] Why VRAM beats RAM for inference speed
- **Mode:** socratic
- **Q:** Why does GPU VRAM specifically matter more than system RAM for how fast a model actually runs?
- **A (gist):** RAM is (1) optimized for the correct type of work and (2) wired pretty much directly into the GPU doing that work ("matrix math, I assume").
- **Verdict:** aha — correct core intuition (bandwidth-matched + tightly coupled), unaided.
- **Note:** Confirmed with real numbers (4060 Ti GDDR6 ~288GB/s vs DDR5-3600 dual-channel ~57GB/s, ~5x gap) and the underlying mechanism: single-batch autoregressive decoding is memory-bandwidth-bound, not compute-bound, so tokens/sec tracks wherever the active weights physically live. This closes checklist 2.2 — also explains *why* CPU offload is only acceptable when raw speed isn't the goal, which retroactively validates the Qwen3-7B/Q4_K_M choice (fits cleanly in 8GB, so offload was never needed).

### [13] Edge case question answered off-target, but with a useful tangent
- **Mode:** discussion
- **Q:** What happens if you paste a large file (long context) into a coding session at the same moment Emby kicks off a transcode — both live on the shared 8GB card?
- **A (gist):** Answered the *previous* question instead (when CPU/RAM offload is worth it — "care more about capacity than time") — reasonable restatement of [12]'s conclusion, not new ground. Then added real new info: wants this box to also host non-GPU services — Vaultwarden, Linkwarden, downloads, the *arr stack — alongside the LLM.
- **Verdict:** tangent (didn't answer the posed question) — but the tangent itself is valuable and belongs in the bigger-picture thread.
- **Note:** The offload-tradeoff restatement is fine (reinforces 2.2, already closed) but doesn't touch the actual edge case: real concurrent VRAM contention between the LLM's growing KV cache and Emby's transcode buffers on the same physical 8GB, under the LXC-sharing model where nothing enforces exclusivity the way passthrough did. Re-asking directly. Also: the Vaultwarden/Linkwarden/arr-stack detail is new, real content for checklist 3.3 ("how does this fit into the broader home lab") — captured for later.

### [14] Concurrent VRAM contention — failure mode + mitigation
- **Mode:** discussion
- **Q:** (re-asked) What actually happens when combined VRAM use (growing KV cache + Emby's transcode buffers) crosses 8GB — and do you want to prevent that up front or live with it?
- **A (gist):** Guessed the LLM would "bleed into system RAM" and/or the encode would stutter — reaching for a graceful-degradation model (like Proxmox's memory ballooning). Then proposed the real mitigation: hard-cap the LLM around ~7GB, the same way Proxmox itself is used to cap RAM/CPU per VM.
- **Verdict:** partial — the failure-mode guess was a genuine misconception, but the proposed mitigation (explicit hard cap, leaving Emby headroom) is the correct engineering instinct and closes the item anyway.
- **Note:** **Misconception corrected:** GPU VRAM doesn't gracefully "spill" into system RAM at runtime the way Proxmox balloons VM memory. llama.cpp's CPU/GPU split (`n_gpu_layers`) is set once at model load, not renegotiated live — if VRAM allocation fails mid-generation (e.g. context growth collides with Emby grabbing more transcode buffer), the real failure mode is a hard CUDA OOM error/crash, not a slowdown. Consumer NVIDIA cards also don't offer hardware-level VRAM partitioning between processes (that's a datacenter/vGPU-licensing feature) — so the hard cap the learner proposed has to be enforced at the application layer: a fixed max context length sized so peak KV cache + model weights stay under ~7GB, not an OS/driver-enforced partition. Closes checklist 2.4.

### [15] Foreclosed/open, applied to own case
- **Mode:** worked-example — learner stalled on the pure discussion prompt ("please guide me through this"), switched to worked-example (demonstrated one foreclosed + one open case, had the learner apply the same pattern to their own situation)
- **Q:** Apply the same foreclosed/open pattern yourself — name one more of each.
- **A (gist):** Foreclosed: Emby's own VRAM headroom is now capped/shared, not exclusive, so Emby itself is constrained by the LLM's presence. Open: the deferred upgrade path still fully applies — a relatively cheap dedicated card could go in the free PCIE3 slot for Emby, or a whole separate box could be built for it later.
- **Verdict:** correct — real application of the pattern, not just repeating my examples, and it correctly ties back to two earlier threads (raw-notes [4]'s GPU-sharing decision and [5]/[6]'s deferred upgrade path) rather than treating them as separate.
- **Note:** Closes checklist 3.2. Confirms today's LXC-sharing choice genuinely doesn't foreclose the future upgrade path — it was designed not to, and the learner independently re-derived that instead of just being told.

### [16] Broader home lab fit — resource isolation philosophy
- **Mode:** discussion
- **Q:** Given the existing 5 VMs are already overcommitted on RAM (160GB configured vs 124GB physical), does adding a 6th LXC for the LLM change how you'd size/configure it?
- **A (gist):** Already planning to reconfigure/delete/unhost some existing services as part of this. Confirmed the underlying design principle already in use: each service gets its own VM specifically so RAM/CPU caps keep one service (e.g. downloads) from swamping another (e.g. emby) — the new LLM LXC would follow the same isolation pattern, with the RAM overcommit issue being actively addressed rather than ignored.
- **Verdict:** correct — closes the loop on the RAM-overcommit tangent flagged all the way back in [1], and shows the isolation principle already governing the box is being consciously extended to the new service rather than overlooked.
- **Note:** Closes checklist 3.3. This is the last open checklist item — **all of checklist.md is now demonstrated.** The lesson is ready to move from `scaffolded` to `taught`.

## Aha moments
- GPU is not "available and moderate" in the free sense — it's fully passed through to Emby. The planning question isn't just "what model fits in X VRAM" but "who gets the GPU at all."
- Learner's goal is explicitly learning-first + "this box becomes the AI hub later" — so the near-term choice should be evaluated against a growth path, not just against today's single use case (coding).
- Confirmed 8GB (not 16GB) VRAM via PCI BAR inspection rather than guessing from the AD106 chip name alone — the two SKUs share a chip but not a memory size.

## Misconceptions corrected
- Believed GPU VRAM overflow would gracefully "bleed into" system RAM at runtime (Proxmox-ballooning mental model). Corrected: llama.cpp's GPU/CPU split is fixed at model load time; a runtime VRAM overrun is a hard CUDA OOM crash, not a graceful degradation. See raw-notes [14].

## Tangents worth revisiting
- "openclaw" VM name — possibly already related to the "claws"/agent-framework plans mentioned in the original ask; still not asked about directly at the guest level.
- Hardware upgrade pathway (RAM 128→192GB, GPU tier, small dedicated Emby transcode card) — real findings gathered in [5], intentionally deferred in [6]. Resume once PSU model/wattage and case clearance are known.
- Broader VM/LXC reconfiguration ("already going to reconfigure and delete/unhost a bunch of stuff," [16]) — mentioned but not scoped; a real follow-on planning session, not part of this lesson's checklist.

## Open questions
- What is the `openclaw` VM currently doing? (still unasked at the guest level)
- PSU wattage/connectors and physical case clearance — needed to resume the deferred upgrade-path thread.
- Emby VM→LXC migration mechanics (chosen in [4]) — decided *that* it happens, not yet planned *how*.
- Specific max-context-length value to hard-cap the LLM at (~7GB target agreed in [14], exact number not computed).
