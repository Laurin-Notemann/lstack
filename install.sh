#!/usr/bin/env bash
# Links the visuals skill and the global block into every Claude config dir and Codex home on this machine.
# Safe to re-run; run it again after `git pull` (Codex gets a copy of AGENTS.md, Claude imports it live).
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
SKILL="$REPO/skills/visuals"
START='<!-- otter-visuals:start (managed by otter-visuals/install.sh) -->'
END='<!-- otter-visuals:end -->'

echo "· kit dependencies"
(cd "$SKILL/kit" && npm install --no-audit --no-fund --silent)

link_skill() {   # $1 = config dir
  mkdir -p "$1/skills"
  if [ -e "$1/skills/visuals" ] && [ ! -L "$1/skills/visuals" ]; then echo "  ! $1/skills/visuals exists and is not a link, left alone"; return; fi
  ln -sfn "$SKILL" "$1/skills/visuals"
}

for d in "$HOME/.claude" "$HOME"/.claude_*; do
  [ -d "$d" ] && { [ -f "$d/settings.json" ] || [ -d "$d/projects" ]; } || continue
  link_skill "$d"
  line="@$REPO/AGENTS.md"
  touch "$d/CLAUDE.md"
  grep -qxF "$line" "$d/CLAUDE.md" || printf '\n%s\n' "$line" >> "$d/CLAUDE.md"
  echo "· claude  $d"
done

for h in "$HOME/.codex" ${CODEX_HOME:+"$CODEX_HOME"}; do
  [ -d "$h" ] || continue
  link_skill "$h"
  f="$h/AGENTS.md"; touch "$f"
  # replace the managed block (or add it) with the current AGENTS.md
  # (drop the old block and trailing blank lines; plain awk so it behaves the same on Linux and macOS)
  awk -v s="$START" -v e="$END" '$0==s{skip=1;next} $0==e{skip=0;next} skip{next}
    { if ($0 ~ /^[[:space:]]*$/) { blank++ } else { for (; blank > 0; blank--) print ""; print } }' "$f" > "$f.tmp"
  { cat "$f.tmp"; printf '\n%s\n' "$START"; cat "$REPO/AGENTS.md"; printf '%s\n' "$END"; } > "$f"; rm -f "$f.tmp"
  echo "· codex   $h"
done

echo "· self-test"
out="$(mktemp -d)"
if node "$SKILL/kit/build.js" "$SKILL/examples/sequence.js" --out "$out" >/dev/null; then echo "  build ok ($out/sequence.png)"
else echo "  ! build failed — if it says no Chrome: (cd $SKILL/kit && npx playwright-core install chromium)"; exit 1; fi
