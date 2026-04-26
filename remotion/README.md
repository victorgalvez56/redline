# REDLINE — Remotion trailer

Programmatic video pipeline that bookends a screen recording of REDLINE
gameplay with a branded intro and outro.

## Structure

- **Intro** (3s) — Animated REDLINE wordmark with chromatic aberration,
  synthwave grid floor, scrolling speed lines, tagline reveal.
- **Gameplay** (20s) — Your screen recording at `public/gameplay.mp4`,
  with persistent corner branding and a "● LIVE GAMEPLAY" pill.
- **Outro** (5s) — Wordmark + URL CTA `redline.victorgalvez.dev`.

Two compositions are exposed:
- `Trailer` — landscape 1920×1080 (YouTube, web)
- `TrailerVertical` — portrait 1080×1920 (Instagram Reels, TikTok)

## One-time setup

```bash
cd remotion
npm install
```

## Recording the gameplay

1. Open the live game at <https://redline.victorgalvez.dev>
2. Record 20 seconds of combat with QuickTime / OBS / Loom
3. Trim to ~20s and export as **MP4 (H.264)**
4. Drop the file at `remotion/public/gameplay.mp4`

If your clip is longer or shorter, edit `INTRO_FRAMES` / `GAMEPLAY_FRAMES` /
`OUTRO_FRAMES` in `src/Root.tsx` to match.

## Preview in Studio (live editor)

```bash
npm run dev
```

Opens <http://localhost:3000> with the Remotion Studio. Scrub the
timeline, tweak `Trailer.tsx`, see changes hot-reload.

## Render to MP4

```bash
npm run render             # → out/redline-trailer.mp4         (1920×1080)
npm run render:ig          # → out/redline-trailer-vertical.mp4 (1080×1920)
```

First render takes ~3-5 min on a Mac (downloads Chromium for Puppeteer,
caches it after). Subsequent renders are ~30s for the 28-second video.

## Tweaking

Brand tokens in `src/Trailer.tsx`:

```ts
const COLORS = {
    bgDeep:    '#08080F',
    redline:   '#FF2E4D',
    cyan:      '#00E5FF',
    amber:     '#FFB627',
    ...
}
```

Section durations in `src/Root.tsx`:

```ts
const INTRO_FRAMES    = 3 * FPS
const GAMEPLAY_FRAMES = 20 * FPS
const OUTRO_FRAMES    = 5 * FPS
```

The synthwave grid scroll speed lives in the `SynthwaveGrid` component
(currently 2px per frame).
