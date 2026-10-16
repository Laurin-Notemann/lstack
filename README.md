# agent-visuals

One skill that lets coding agents (Claude Code, Codex) draw **hand-drawn pictures of ideas and decisions** —
sequences, architectures, user journeys, options side by side, story frames, wireframes — check them, and show them
inline in the chat (Otter Code), or as a PNG anywhere else.

- `AGENTS.md` — the short global instruction every agent loads.
- `skills/visuals/SKILL.md` — how to decide what to draw, draw it, check it and show it.
- `skills/visuals/kit/` — scene helpers on top of [Excalidraw](https://github.com/excalidraw/excalidraw) (pinned 0.18.0,
  bundled locally at install, no network at build time), a headless build, and a lint that measures the real drawing
  (arrows through text, arrowheads on borders, overlapping labels, text too small, …).
- `skills/visuals/examples/` — one working scene per kind of picture; agents copy the closest one.
- `skills/visuals/answer/` — a tiny page + server for collecting answers (ports 4800–4809, writes `answers.jsonl`).

## Install

```sh
git clone https://github.com/Laurin-Notemann/agent-visuals ~/projects/agent-visuals
~/projects/agent-visuals/install.sh
```

Links the skill into `~/.claude/skills/visuals`, every `~/.claude_*` config dir and `~/.codex/skills/visuals`,
imports `AGENTS.md` from each `CLAUDE.md`, and writes a managed copy of it into `~/.codex/AGENTS.md`.
Needs Node 18+ and a Chrome/Chromium (found automatically from Playwright's cache or the system; set `CHROME=` to
override). Re-run after `git pull`.

## Build a picture by hand

```sh
node skills/visuals/kit/build.js skills/visuals/examples/sequence.js --out /tmp/vis
node skills/visuals/kit/build.js lint some-drawing.excalidraw
```

## Answer pages over an SSH tunnel

The answer server listens on `127.0.0.1:4800–4809` on the machine the agent runs on. Forward those ports when you
connect, e.g. `ssh $(for p in $(seq 4800 4809); do printf -- '-L %d:localhost:%d ' $p $p; done) you@server`.
