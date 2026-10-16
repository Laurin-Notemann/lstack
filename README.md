# lstack

Laurin's global agent skills and small executables. Evolved from **agent-visuals**;
the existing visuals skill and its command paths remain intact.

- **visuals** draws and checks hand-drawn explanations using Excalidraw.
- **remote-environment** discovers Otterware hosts and performs authorized file operations
  and foreground commands through their existing account/relay/tunnel APIs.

Each skill owns its instructions and executable helpers. Otterware owns its product,
authentication, permissions and API contracts. lstack adds no server endpoints or product UI.

## Install

```sh
git clone https://github.com/Laurin-Notemann/lstack ~/projects/lstack
cd ~/projects/lstack
./install.sh                       # both skills
./install.sh remote-environment    # only remote access
./install.sh visuals               # only visuals
```

The installer links selected skills into `~/.codex/skills`, `$CODEX_HOME/skills` when set,
and existing Claude configuration directories (`~/.claude`, `~/.claude_*`). It preserves
unrelated instructions and refuses to replace real skill directories or another installation's
links. Re-running migrates the old agent-visuals managed block/import without duplicates.
Run it again after updating or moving the source checkout. Existing clones can stay at their
current path; renaming the local folder is unnecessary.

Remote access needs **Node 24+**. Its committed executable is self-contained; installation
requires no Otterware checkout, runtime upgrade, network, login or remote action. Credentials
are created only through explicit `auth login`, in lstack's own private state directory.

Visuals retains its Node 18+/Chrome or Chromium requirements. The combined installer therefore
needs Node 24+. Visuals installation uses its pinned lockfile and runs a local render self-test;
it never launches an interactive browser. The remote-only install does not install the visuals kit.

```sh
node skills/remote-environment/scripts/remote.mjs --help
node skills/visuals/kit/build.js skills/visuals/examples/sequence.js --out /tmp/vis
```

See each `SKILL.md` for its workflow. Remote command output is combined terminal output,
not separate stdout/stderr. First-version execution supports Linux/macOS with a POSIX-compatible
login shell. No live operation is performed by installation or tests.

## Develop and update the remote protocol

```sh
npm ci
npm test
npm run build:remote -- /path/to/pinned/otterware
node scripts/typecheck.mjs /path/to/pinned/otterware
```

`skills/remote-environment/protocol.json` pins the Otterware revision and Effect version.
The build reads contracts from that exact clean source revision, bundles them with the typed
RPC adapter and lstack client, and commits `scripts/remote.mjs` plus `build-info.json`.
Runtime installation never imports Otterware or downloads source. To change the supported
protocol, deliberately update the pin and dependencies, review the affected contracts, run
focused compatibility tests/typechecking, and rebuild. The executable contains Effect's MIT
license; see `THIRD_PARTY_LICENSES.txt` for the contract/runtime attribution.

Tests use synthetic credentials, temporary state directories and local mock transports.
They cover rotation, revocation, destination validation, readback and terminal lifecycle;
a real remote smoke test requires explicit authorization and a disposable destination.
