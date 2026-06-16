# Pomodoro Focus

A minimal Pomodoro focus timer. Extracted from the original `Pomodoro.dc.html`
into a plain **Vite + React** app — no dc-runtime, no in-browser Babel, no CDNs.

- React is an npm dependency (bundled at build time).
- Fonts (Space Grotesk / Space Mono) are self-hosted via `@fontsource` — no Google Fonts CDN.
- Installable **PWA** with full offline cache (`vite-plugin-pwa`: manifest + service worker).

All original behavior is preserved: localStorage persistence, session restore by
`endTime`, browser notifications, screen wake lock, audio chime, Space-bar to
start/pause, and the live countdown in the tab title.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
```

## Build

```bash
npm run build    # outputs static site to dist/
npm run preview  # serve the production build locally
```

Icons are committed under `public/`. To regenerate them: `npm run icons`.

## Deploy to Vercel

The repo is auto-detected as a Vite app (see `vercel.json`).

**Option A — dashboard:** push this folder to a Git repo, "Add New Project" on
vercel.com, import it. Build command `npm run build`, output dir `dist` (both
pre-filled). Deploy.

**Option B — CLI:**

```bash
npm i -g vercel
vercel          # preview deploy
vercel --prod   # production deploy
```

> PWA install + notifications/wake-lock require HTTPS, which Vercel provides
> automatically. After the first load the service worker caches the app for
> offline use; `registerType: 'autoUpdate'` ships new versions on the next visit.
