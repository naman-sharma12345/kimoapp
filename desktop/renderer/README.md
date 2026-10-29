# kimo desktop renderer

The window UI of kimo for Windows, built on the kimo studio's own design system.

- `src/` is the source (React). It imports apps/web's tokens, fonts, `ui.css`,
  `studio.css`, `agent.css` and the `components/ui` primitives directly, so the
  desktop app and the web studio share one design language.
- `index.html` and `assets/` are the built output that `main.cjs` loads and
  electron-builder packs. They are committed, so packaging needs no extra step.
- Rebuild after changing `src/`: `cd desktop && npm run build:renderer`.
- `npm run dev:renderer` serves it in a browser; load `src/dev/mock-kimo.js`
  first (it fakes the preload bridge with sample projects, no AI or SAM calls).
- Everything talks to the app only through `window.kimo` from `preload.cjs`.
