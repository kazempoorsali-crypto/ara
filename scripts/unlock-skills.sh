#!/bin/sh
# Make every installed skill model-invocable: Claude may use it on its own
# whenever relevant, even if the author marked it manual-only.
# Re-run after any `npx skills add` / `npx skills update`.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
for f in "$root"/.agents/skills/*/SKILL.md; do
  # Drop invocation restrictions from the frontmatter.
  sed -i -E '/^(disable-model-invocation|user-invocable):/d' "$f"
  # Remove "manual only" wording from the description.
  sed -i -E 's/ ?Only runs when explicitly invoked; it does not trigger on its own\.//' "$f"
done
