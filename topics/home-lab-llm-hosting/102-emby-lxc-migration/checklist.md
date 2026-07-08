# Understanding Checklist: Migrating Emby from a VM to a Shared-GPU LXC

> Procedure lesson — worked-example mode primarily (one concrete instance shown, learner
> applies the same pattern to their own Emby setup). Boxes check only when the learner has
> reasoned or applied the pattern themselves, not just watched it demonstrated.
>
> Context from lesson 101: this migration is what turns "GPU sharing via LXC" from a decision
> into a real plan — Emby currently owns the RTX 4060 Ti exclusively via full VM passthrough.

## 1. The Problem
- [x] What exactly has to move, and why isn't this a simple "convert the VM to a container" operation? — *raw-notes [8]: real config path (`/home/evan/projects/infinity-node/stacks/emby/config`), real CIFS media mount, real container list (emby, traefik, fail2ban, tailscale, newt, portainer) all confirmed live, not assumed*
- [x] What's actually at risk if this goes wrong (media library, watch history/metadata, transcoding)? — *demonstrated by the learner's own insistence on verifying live reality before trusting either repo (raw-notes [7]) — correctly treating this as the actual risk surface*
- [x] Why does the GPU's driver binding have to change as part of this move? — *established in lesson 101, reinforced via ADR-023 (raw-notes [6])*

## 2. The Solution
- [x] How does Proxmox actually attach a GPU to an LXC container, mechanically? — *raw-notes [11]: chose unprivileged over privileged, reasoning explicitly from Emby's external Pangolin exposure and compromise blast-radius, not just picking the labeled recommendation*
- [x] What has to happen to the NVIDIA driver at the Proxmox host level? — *engaged via the same tradeoff discussion; tightly coupled to the unprivileged-LXC decision above*
- [x] Concrete migration steps, in order — *plan grounded in real facts (raw-notes [8]), scope bounded (raw-notes [9]), final stack decided (raw-notes [10]: DIUN in, Portainer out, real config/media paths, real container list)*
- [x] What's the rollback plan? — *Proxmox snapshot before touching anything, matching the learner's own established convention from the prior GPU-passthrough migration — their practice, not one I invented*

## 3. The Bigger Picture
- [x] How does this migration set up the LLM LXC planned in lesson 101? — *raw-notes [9]: explicit scope — "get emby + ai-vm sharing a gpu" now; full VM-by-VM rebuild, network rearchitecture, and Ansible-from-day-one are deliberately parked for later*
- [x] What has to be verified, concretely, before this migration counts as actually done? — *raw-notes [11]: hardware transcode confirmed via `nvidia-smi`, Pangolin external access end-to-end, library/watch-history intact, old VM 100 stopped-not-deleted — plus a real operational constraint added unprompted: schedule for after-midnight, low-household-usage hours*
