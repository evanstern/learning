# Build pointer — the `educate` plugin moved out

The `educate` plugin started life here (`topics/claude-plugins/build/educate/`) during lesson
101, but per the build-along convention ("code lives in its own repo; the lesson only
references it"), it now lives as its own git project:

**`/Users/evanstern/Claude/Projects/Code/educate`**  ·  git repo  ·  branch `master`  ·  v0.1.0

- Develop (Claude Code): add it as a local marketplace, then `/plugin install educate@educate-dev`.
- Distribute (Cowork): the packaged `educate.plugin` (run `npm run package` in the repo).
- Self-build: `node scripts/make-plugin.mjs` regenerates the plugin's own skeleton.

This lesson's learning artifacts (`../101-foundations/`) stay here; the code does not.
