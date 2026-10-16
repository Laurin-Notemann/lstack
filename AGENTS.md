## Visuals

- When the user asks to see, show, visualise, sketch, diagram or compare something, use the `visuals` skill.
- If you think a picture would help and the user hasn't asked, offer it in one line instead of building it.
- "Visualise" means work out the shape of the idea and draw that — never re-lay out text you already wrote into boxes.
- Default output is one static picture inline with a short note. An interactive page only when you need answers back;
  files only when asked.
- A picture isn't done until its lint is clean and you've looked at the render and checked it answers the question.

## Remote environments

- For authorized work on another Otterware environment, use the remote-environment skill.
- Discover and select the destination explicitly; installation grants no action permissions.
- Keep account credentials in lstack's private store, never prompts or committed files.

## Development

This repository is lstack, evolved from agent-visuals. Keep each skill's helpers beside it.
Use `npm test` for focused mock-based checks. Rebuild remote.mjs and typecheck with the pinned
Otterware source when changing its TypeScript. Do not run live remote actions as a test without
explicit authorization. Never modify the Otterware product from this repository.
