#!/usr/bin/env bash
# Install selected lstack skills without replacing unrelated agent instructions.
set -euo pipefail
REPO="$(cd "$(dirname "$0")" && pwd)"
selected=("$@")
if [ "${#selected[@]}" -eq 0 ] || [ "${selected[0]}" = all ]; then selected=(visuals remote-environment); fi
for skill in "${selected[@]}"; do
  case "$skill" in visuals|remote-environment) ;; *) echo "Unknown skill: $skill" >&2; exit 2;; esac
done
if [[ " ${selected[*]} " = *' remote-environment '* ]]; then
  node -e 'if (Number(process.versions.node.split(".")[0]) < 24) throw Error("remote-environment needs Node 24+")'
  [ -f "$REPO/skills/remote-environment/scripts/remote.mjs" ] || { echo 'Missing remote bundle; see README.md.' >&2; exit 1; }
fi
if [[ " ${selected[*]} " = *' visuals '* ]]; then
  (cd "$REPO/skills/visuals/kit" && npm ci --no-audit --no-fund --silent)
fi
# The helper also handles legacy agent-visuals imports and managed blocks.
node "$REPO/scripts/install.mjs" "${selected[@]}"
if [[ " ${selected[*]} " = *' visuals '* ]]; then
  out="$(mktemp -d)"
  trap 'rm -rf "$out"' EXIT
  node "$REPO/skills/visuals/kit/build.js" "$REPO/skills/visuals/examples/sequence.js" --out "$out" >/dev/null
  echo 'visuals build verified'
fi
if [[ " ${selected[*]} " = *' remote-environment '* ]]; then
  node "$REPO/skills/remote-environment/scripts/remote.mjs" --help >/dev/null
  echo 'remote-environment executable verified (no network or login)'
fi
