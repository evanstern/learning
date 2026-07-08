# Raw Notes: Migrating Emby from a VM to a Shared-GPU LXC

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
- **Mode:** socratic · worked-example · discussion
- **Q:** the question or prompt posed
- **A (gist):** what the learner answered/did, in a line
- **Verdict:** aha · correct · partial · wrong · tangent
- **Note:** the insight, misconception, or thing to remember — the part worth keeping
-->

### [1] Real Emby VM/storage discovery via SSH
- **Mode:** discovery (not a canonical mode — live investigation before teaching)
- **Q:** What does the actual Emby VM setup look like — disk, storage, GPU driver state?
- **A (gist):** Inspected via SSH to the Proxmox host (already-established access from lesson 101). Key findings: (1) Emby's media library is NFS-mounted from a Synology NAS (192.168.1.80:/volume1/media, 53TB total, 90% full) at the **host** level as Proxmox storage "NAS" — the VM's own OS disk (scsi0, 82GB, local-lvm) is separate from the media data. (2) VM 100 already has a real snapshot history: `emby-research-backup`, `emby-pre-gpu-passthrough` ("CPU-only transcoding with tmpfs... rollback point if GPU passthrough fails"), `before-gpu-passthrough` — named with what look like ticket IDs (IN-007, IN-032). (3) QEMU guest agent is configured (`agent: 1`) but not actually running inside the VM, so guest-level fstab/config couldn't be inspected directly. (4) GPU confirmed still bound to `vfio-pci` (the passthrough driver) — no NVIDIA driver installed at the host level yet.
- **Verdict:** n/a (discovery turn)
- **Note:** The NAS finding is the big one for this lesson: media files almost certainly aren't inside the VM's disk at all (Proxmox's "NAS" storage is typed for VM disk *images*, not a generic mount, so Emby likely mounts that NFS export directly from inside its own guest OS over the network) — meaning migration is about moving **Emby's application state** (config/watch-history/library-index), not 47TB of media. The existing snapshot chain, with what look like home-lab ticket references, is a real established rollback pattern already in use — worth asking the learner whether to follow that same convention for this migration rather than inventing a new one.

### [2] Grounding in the real repos: infinity-node (legacy) + infinitynode.media (target)
- **Mode:** discovery (major scope-expanding context dump from the learner, not a posed question)
- **Q:** (implicit) "Ground yourself in our actual infra history and target architecture before suggesting anything."
- **A (gist):** Learner shared two repos (cloned locally to ~/Claude/Code/): `infinity-node` (legacy, Docker-Compose-on-VMs, a rigorous custom task/ADR system — genuinely a real spec-driven-dev methodology, "MDTD") and `infinitynode.media` (the target: Ansible+Terraform rewrite, "somewhat works," not yet mature). Plus 7 non-negotiables for the new architecture: Emby isolated with a resource floor + must tunnel via Pangolin not Cloudflare; downloads isolated; the *arr stack; a misc VM (Vaultwarden + more); all VMs on the tailnet; `vm-1XX` naming preserved; `local.infinity-node.win` network naming preserved. Also: heavy ballooning desired everywhere except a new GPU-heavy AI VM.
- **Verdict:** n/a (context, not a reasoning check) — but see findings below, several of which resolve/refine open threads from lesson 101.
- **Note:** Sent two Explore agents in, one per repo. Key findings, cited back to real files:
  - **`openclaw` mystery from lesson 101, resolved:** it is NOT an LLM host today — it's the Ansible control node / Claude-Code agent host (nicknamed "Bud") in infinitynode.media, tagged `ai` in Terraform but `bootstrap_only: true`, `services: []` (`ansible/inventory/host_vars/openclaw.yml`). No AI/LLM VM exists anywhere yet in either repo — the box lesson 101 planned is a genuinely clean addition, not competing with existing infra.
  - **LXC-shared-GPU (lesson 101's plan) has never been tried or even endorsed here.** infinity-node's own history (`IN-036`, Tdarr) hit exactly this wall — "GPU passthrough typically exclusive, can't share across VMs easily" — and worked around it by co-locating Tdarr *inside* Emby's VM with a time-slice schedule, not true sharing. infinitynode.media's `ADR-002` explicitly lists LXC as a *rejected* alternative to Docker-on-VMs. Introducing LXC now is a real paradigm addition, not a continuation of an existing pattern — worth its own ADR if we want to stay consistent with how rigorously they document decisions elsewhere.
  - **Tailnet non-negotiable isn't met yet anywhere.** infinity-node has a prepared-but-unconfirmed-deployed Tailscale stack; infinitynode.media only wires Tailscale for Emby specifically. "All VMs on the tailnet" is a real gap to close, not a status check.
  - **Ballooning exists live on the Proxmox host today** (confirmed ourselves via `qm config` in lesson 101 — e.g. `balloon: 8192`/`16384` entries) but infinitynode.media's Terraform config has **zero** balloon configuration (`memory { dedicated = ... }` only, static) — if VM management moves to Terraform as-is, ballooning would silently regress from what's live today.
  - **Possible conflict in the Pangolin non-negotiable:** infinitynode.media's own draft runbook (`docs/runbooks/emby-security-summary.md`) reports that **Pangolin itself — not just Cloudflare — blocks Emby Connect and TV apps**, and recommends direct port-forwarding for Emby specifically while keeping Pangolin for everything else. This is the opposite of what non-negotiable 1.a assumes (that Pangolin avoids the blocking problem Cloudflare has) — needs reconciling with the learner directly, not just implemented as stated.
  - Minor doc-debt spotted (not blocking): an IP-subnet inconsistency in old GPU runbooks (192.168.1.x vs 192.168.86.x — live host confirms 192.168.1.81 is current/authoritative); `ADR-013`'s status field never flipped from "proposed" despite being fully implemented and shipped.
- **Architectural fork surfaced back to the learner** (not yet decided): (A) migrate Emby to an LXC as lesson 101 planned, put the new LLM host in its own LXC too, both sharing the host's NVIDIA driver + device nodes — preserves the isolation non-negotiable, but is a new paradigm relative to ADR-002's LXC rejection; (B) co-locate the LLM's Docker stack inside Emby's existing GPU-passthrough VM, same pattern already proven for Tdarr — fits the existing all-Docker paradigm with zero new concepts, but directly risks violating non-negotiable 1 (Emby's guaranteed resource floor) since a heavy LLM workload would share the same VM's CPU/RAM/GPU; (C) ruled out — full VM PCI passthrough is exclusive (confirmed in lesson 101), so two separate VMs can't both hold the physical GPU at once regardless of approach. Leaning toward (A) but this is the learner's call to make, especially given (B) directly undercuts their own stated non-negotiable.

### [3] Reconciling the Pangolin/Emby conflict — doc was a proposal, not a decision
- **Mode:** discussion
- **Q:** (my ask from [2]) Is the runbook's "Pangolin blocks Emby Connect/TV apps" finding still accurate, or has it changed?
- **A (gist):** "Examine how we do it today. I'm fairly certain it's via pangolin on Emby. Do it that way. It works."
- **Verdict:** correct — and it corrected my read of the source, not the other way around.
- **Note:** Checked `docs/runbooks/emby-security-summary.md` directly: it's written as a **proposal/exploration** ("Port Forwarding (Proposed)", "Next Steps: ... Go live with monitoring"), not a record of an implemented decision — and it only exists from one bulk-import commit (2026-04-07), never revisited since. It was never confirmed against live reality. The learner's direct, current operational knowledge (Pangolin-on-Emby works today) is more authoritative than a 3-month-stale proposal doc I have no way to verify live (no guest-level access to the Emby VM). **Resolved:** non-negotiable 1.a stands as originally stated — Emby stays on Pangolin, no port-forwarding needed. Good general lesson: repo docs that read as recommendations/proposals (watch for words like "Proposed," "Next Steps," "Go live") aren't the same as confirmed current-state docs, even in a repo that's otherwise rigorous about ADRs — worth checking commit history/tone before trusting a finding as ground truth.

### [4] Architecture decision: Option A confirmed, ADR question caused confusion
- **Mode:** discussion
- **Q:** Option A (LXC for both Emby and the LLM host) vs Option B (co-locate in Emby's VM) — and should this get its own ADR against ADR-002's prior LXC rejection?
- **A (gist):** "Option A is the choice, yes." But the ADR-002 framing confused them ("you're confusing me... what?").
- **Verdict:** correct on the actual architecture call; my phrasing failed, not their understanding.
- **Note:** Jargon failure on my part — dropped "ADR-002" without explaining what an ADR even is, assuming familiarity because the repo uses the term constantly. Clarified in plain language: ADRs are just this project's own habit of writing up "why we picked X over Y" for infra decisions; asking whether they want one written for the LXC exception is a paperwork question, not a blocker. **Architecture is now settled: Option A — Emby and the new LLM host both become LXCs, sharing the host's NVIDIA driver + device nodes.** Still waiting on whether they want the ADR written.

### [5] ADR confirmed, moving to concrete migration steps
- **Mode:** discussion
- **Q:** Do you want a new ADR written documenting the LXC-for-GPU-sharing exception to ADR-002?
- **A (gist):** "Yeah, an ADR would be good. I am good with that." (answered right after the transition, having taken a moment to process the earlier ADR explanation.)
- **Verdict:** correct
- **Note:** Confirms the plain-language re-explanation in [4] landed. Next: draft the ADR matching `infinitynode.media`'s existing `docs/adr/` format/style, then present the full concrete migration plan as a worked example grounded in real findings — Emby VM 100's actual config (scsi0 82GB OS disk, hostpci0/1 GPU, NFS media mount independent of the VM disk, existing snapshot/rollback convention, Pangolin/newt staying as-is per [3]).

### [6] Grounding the ADR-002 citation + drafting ADR-023
- **Mode:** discovery / worked-example
- **Q:** "ADR-002 didn't seem to have any grounding anywhere (may have missed it)" — legitimate ask to verify the citation was real, not invented.
- **A (gist):** n/a — this was the learner asking me to prove my own claim, not answering a question.
- **Verdict:** n/a
- **Note:** Fair check — cited `docs/adr/002-use-docker-for-service-containerization.md` (real file, dated 2025-10-24, status accepted) directly by path so the learner can verify themselves rather than take my word for it. Confirmed LXC was genuinely listed there as a considered-and-not-chosen alternative ("less ecosystem than Docker, different isolation model" — a mild preference, not a hard rejection). Then drafted `docs/adr/023-lxc-for-gpu-sharing.md` in the local clone (`~/Claude/Code/infinitynode.media`), matching the repo's exact ADR format/frontmatter, covering: context (GPU exclusivity, ADR-002/006/011/007 tension, the IN-036/Tdarr precedent), decision (LXC for Emby + the new AI host specifically, Docker still runs inside each), consequences, and the same three alternatives already reasoned through in raw-notes [2] (co-locate in Emby's VM, reclaim GPU entirely, SR-IOV — all rejected) plus the chosen option. **This is a local file only — not committed or pushed.** Good general lesson for next time: when citing something from a source the learner hasn't necessarily read closely (like a specific ADR number), give the file path up front rather than assuming the reference lands — this whole detour was avoidable with one more line of context in [4].

### [7] Verifying live reality vs. repo docs — the learner was right to push back
- **Mode:** discovery (prompted by a legitimate, pointed correction from the learner)
- **Q:** "Confirm ahead of time that all your assumptions about what is currently true architecturally in the VMs is true... my suspicion is that vm-100 and maybe vm-104 are more controlled by infinitynode.media while the other VMs were probably last touched by infinity-node."
- **A (gist):** n/a — a challenge to verify, not an answer to give.
- **Verdict:** n/a
- **Note:** Real, important correction to my working assumptions. Found real SSH access as `coda@192.168.1.104` (openclaw, the actual Ansible control node) and ran live ad-hoc commands from there instead of inferring from repo docs. Findings:
  - **Ansible connectivity, live-tested:** `emby`, `arr`, `misc`, `openclaw` all reachable; **`downloads` is broken** — "Failed to create temporary directory... may have been able to authenticate and did not have permissions" (auth works, tmp-dir/permissions issue on that VM specifically).
  - **`/opt/stacks` (the infinitynode.media Ansible deployment convention) does NOT exist on `emby` or `arr` at all.** It exists on `misc` but with only 3 services (`actual-budget`, `actual-mcp`, `linkwarden`), all owned by user `evan` directly, not `coda`/Ansible-deployed. **Conclusion: infinitynode.media's Ansible automation has essentially never been run against the real fleet** — the learner's suspicion was correct, and actually understates it: even `misc` (the VM they thought might lean old-style) has more new-style footprint than `emby`, which has none.
  - **Emby's real, live `docker ps`:** `emby`, `traefik`, `portainer`, `fail2ban`, `tailscale` (confirms Tailscale genuinely is live on Emby specifically, matching the research finding that it's not fleet-wide), `newt` (Pangolin client, confirms [3]'s resolution), and **`watchtower` — currently crash-looping** ("Restarting (1) 32 seconds ago").
  - **Root-caused the watchtower crash:** logs show `"client version 1.52 is too new. Maximum supported API version is 1.49"` — its bundled Docker API client has outgrown the VM's Docker Engine version. This is a real, currently-active problem, independent of anything we're planning — and notably, `infinitynode.media`'s own `ADR-016` already decided to replace Watchtower with DIUN, but that replacement was never actually deployed to this VM either.
  - **Root-caused a second live problem: GPU transcoding may currently be degraded/broken.** `nvidia-smi` inside the Emby VM fails: `"Driver/library version mismatch, NVML library version: 580.126"`. `modinfo nvidia` confirms the on-disk kernel module is 580.126.09 — classic signature of a driver package upgrade that hasn't been picked up by a reboot yet (VM uptime: ~150 days). **Likely fix is just a reboot — which our migration will effectively force anyway**, so this may resolve itself as a side effect, but it's a real, live issue on the production box today, worth knowing about independent of the migration.
  - Could not find `/opt/stacks/emby/.env` (doesn't exist — confirms `CONFIG_PATH` question from earlier is real, not yet resolved) or Emby's actual compose working directory (a `docker inspect` template attempt failed on syntax, not yet retried).
  - **Still unverified:** `downloads` (VM 101) — Ansible can't reach it (permissions issue), so its real state is still an open question, not confirmed either way.

### [8] Found the real config/media paths — via Portainer, as the learner predicted
- **Mode:** discovery
- **Q:** (learner) "It's all in Portainer most likely" — pointed the investigation at the right place.
- **A (gist):** n/a — a lead, not an answer to log as correct/wrong.
- **Verdict:** n/a
- **Note:** Traced Portainer's data dir (`/home/evan/projects/infinity-node-stack-portainer/data`), found its numbered stack folders were git-clone side effects (Portainer's "deploy from git repo" feature clones the whole `infinity-node` repo per stack, even though it only deploys one subpath) — multiple stack IDs all reference `stacks/emby`, so rather than guess which is "current," inspected the **live running container directly** (`docker inspect emby`), which is authoritative regardless of which stack config produced it. Real, confirmed findings:
  - **`CONFIG_PATH` = `/home/evan/projects/infinity-node/stacks/emby/config`** — Emby's actual config/database lives inside the *old* `infinity-node` repo checkout on the VM itself, not any Ansible-managed path. Resolves the open question from raw-notes [entry mentioning the guide's Step 4 gap].
  - **Media mount is CIFS/SMB, not NFS** — `//jace.local.infinity-node.win/media` (hostname "jace," resolves to the same Synology at 192.168.1.80) mounted at `/mnt/video`, containing `/mnt/video/Video` → `/mnt/movies` in the container. This directly contradicts `infinitynode.media`'s `host_vars/emby.yml`, which describes an NFS mount at `/mnt/media` — a real, material discrepancy, not just a naming difference. The already-known-broken `setup-nfs-mounts.yml` playbook would not correctly replicate this even if fixed, since it targets the wrong protocol.
  - **Security note:** `/etc/fstab` on the Emby VM has the CIFS mount's password in **plaintext**. Not repeating it here; worth migrating to a proper Samba credentials file (`credentials=/path,mode=600`) regardless of the LXC migration — flagging to the learner, not fixing unprompted.
  - **NVIDIA GPU env vars confirmed real** (`NVIDIA_VISIBLE_DEVICES=all`, `NVIDIA_DRIVER_CAPABILITIES=compute,video,utility`) — the nvidia-docker-reservations approach is genuinely what's running; the `/dev/dri` VAAPI references in `infinitynode.media`'s `host_vars/emby.yml` are stale/unused, not a real alternate path.
- Learner then supplied `~/.scratch/vmkeys` (Portainer API tokens per VM) and the real hostnames (`portainer-1XX.local.infinity-node.win`) to check `downloads` (VM 101), which Ansible can't reach. **Result: vm-100 and vm-103 API keys authenticate fine; vm-101 and vm-102 both return "Invalid JWT token."** `downloads` remains a real blind spot — worth asking the learner whether those two tokens are stale/need regenerating, rather than guessing further.
- Auto-mode classifier correctly blocked an early attempt to query the API with keys hardcoded literally into the bash command (credential materialization) — redid it reading the key file at runtime in a loop instead. Good reminder: even when a user hands over a secrets file directly, don't paste its contents into command literals.

### [9] Scope boundary set: fix Emby+AI-VM GPU sharing now, full rebuild is a separate later project
- **Mode:** discussion
- **Q:** (implicit) how much of the discovered disorganization should this lesson actually try to fix?
- **A (gist):** "My plan now is to get the VMs sorted out so we can keep everything running but get emby + ai-vm sharing a gpu. Then, after that, I will eventually be working in infinitynode.media with an AI... to plan the 'from-scratch' rebuild of each VM one-by-one."
- **Verdict:** correct — a real, deliberate scoping decision, not scope creep or avoidance.
- **Note:** Resolves the sprawl from entries [7]-[8]: this lesson's job is narrowly "Emby + new AI-VM share the GPU, don't break anything else" — not fixing `downloads`'s broken Ansible/Portainer access, not reconciling every `infinitynode.media` vs. live-reality gap, not the eventual full VM-by-VM rebuild. Learner explicitly expanded on what's parked for that later initiative: network rearchitecture, VM standardization, and "Ansible from day one" for every VM — all real, all deliberately deferred, not forgotten. Closes checklist 3.1/3.2 for this lesson — the migration's blast radius is now explicitly bounded.

### [10] Final stack decisions: DIUN in, Portainer out
- **Mode:** discussion
- **Q:** Watchtower→DIUN-or-nothing, and does Portainer come along to the new LXC?
- **A (gist):** "DIUN is good. Portainer is not coming along."
- **Verdict:** correct — both decisions, in the learner's own words, and the Portainer call is a real, deliberate step toward where they've said they're headed (Ansible/git-managed, matching their own `ADR-015`), not just accepting my framing.
- **Note:** Closes most of checklist 2.3 — the new Emby LXC's final stack is now fully specified: `embyserver`, `traefik`, `fail2ban` (real jail/filter configs preserved), `tailscale`, `newt`, `DIUN`. No `watchtower`, no `portainer`. This is the first concrete piece of "Ansible/git for real" actually landing on Emby, even ahead of the later full rebuild.

### [11] Closing decisions: unprivileged LXC + concrete done-criteria + a real operational detail
- **Mode:** worked-example (privileged/unprivileged tradeoff) + discussion (done-criteria)
- **Q:** Unprivileged vs. privileged LXC for GPU access? And, concretely, what would you personally want verified before calling this migration done?
- **A (gist):** Unprivileged (matches the recommended hardening tradeoff, reasoned about the compromise-blast-radius risk given Emby is externally exposed via Pangolin). All four done-criteria selected: hardware transcode confirmed via `nvidia-smi`, Pangolin external access working end-to-end, library/watch-history intact, old VM 100 stopped-not-deleted as rollback. Plus, unprompted: "Must plan to do this carefully. After midnight to minimize impact on others using Emby."
- **Verdict:** correct — real reasoning on the privilege tradeoff (tied it to Emby's external exposure, not just picked the "recommended" label), and the added scheduling constraint is a genuinely valuable operational detail I hadn't surfaced myself.
- **Note:** Closes checklist 2.1/2.2 (engaged with the GPU-attachment/host-driver mechanics via a real tradeoff decision) and 3.2 (concrete done-criteria, fully specified). **This closes every item on the checklist — lesson 102 is fully demonstrated.** New real constraint captured for the actual execution plan: schedule the cutover for after-midnight, low-household-usage hours — not a technical detail, but a real one.

## Aha moments
- `openclaw` resolved definitively: the Ansible control node ("Bud"), not an LLM host — closes a thread open since lesson 101.
- The media library isn't NFS as `infinitynode.media` claims — it's CIFS/SMB to a host called "jace." A repo's own docs can be wrong even when everything else about them is rigorous.
- `/opt/stacks` (the new repo's whole deployment convention) doesn't exist on Emby or Arr at all — the learner's suspicion that most of the fleet is still "old infinity-node" was correct, and actually understated.
- Two live, real problems surfaced as a side effect of verification, unrelated to anything being planned: Watchtower crash-looping, and a GPU driver/library version mismatch likely from a 150-day-uncapped uptime.

## Misconceptions corrected
- I assumed repo docs (`infinitynode.media`, `infinity-node`) described current reality closely enough to plan against directly. Corrected hard, twice: once when a "proposed" doc turned out to not reflect an actual decision (Pangolin/Emby, raw-notes [3]), and once when the learner directly pushed back on trusting either repo as gospel (raw-notes [7]) — which then turned up real, verified gaps (broken Ansible automation, wrong mount protocol, live crash-looping container) that inference from the repos alone would have missed entirely.

## Tangents worth revisiting
- `downloads` (VM 101) and `arr` (VM 102) both have broken auxiliary access (Ansible tmp-dir permissions on `downloads`; Portainer API tokens returning "Invalid JWT token" on both `downloads` and `arr`) — not this lesson's problem to fix, but real and worth a look eventually.
- The full VM-by-VM rebuild in `infinitynode.media` (network rearchitecture, VM standardization, Ansible-from-day-one) — explicitly parked by the learner (raw-notes [9]) as a separate, later initiative.
- Plaintext CIFS credentials in the Emby VM's `/etc/fstab` — a real security smell, not fixed, not this lesson's scope, but named.

## Open questions
- Exact cgroup device major numbers for the GPU bind-mounts — to be confirmed against `ls -la /dev/nvidia*` after the host-level driver install actually happens.
- Whether to reconcile `downloads`/`arr`'s broken Ansible/Portainer access before or independently of this migration (leaning independently, per the scope boundary in [9]).
- Specific max-context-length value for the future AI-LXC's ~7GB VRAM cap (carried over from lesson 101, still not computed).
