<div align="center">

# REDLINE

> Race clean. Or wreck everything.

A multiplayer 3D arcade racer with vehicular combat. Built with Three.js, Cannon.js, and Socket.IO.

[**Play live →**](https://redline.victorgalvez.dev)

![REDLINE gameplay preview](docs/preview.gif)

[![License: MIT](https://img.shields.io/badge/License-MIT-FF2E4D.svg)](LICENSE)
![Three.js](https://img.shields.io/badge/Three.js-r164-000000?logo=three.js&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-010101?logo=socket.io&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5.2-646CFF?logo=vite&logoColor=white)
![Node](https://img.shields.io/badge/Node-≥18-339933?logo=node.js&logoColor=white)

</div>

---

## Overview

REDLINE is a browser-based, real-time multiplayer arcade game with two modes:

- **🏁 Race** — five laps against the clock with sector splits, lap deltas, and a shared leaderboard. No weapons.
- **💥 Combat** — first to five kills wins. Free-for-all in a dedicated 100×100 m skatepark-style arena: missiles, health and ammo pickups, jump pads, healing zones, boost lanes, and a server-driven meteor shower.

The client renders matcap-shaded low-poly cars and obstacles in Three.js. The server is authoritative for matchmaking, snapshot relay, hit attribution, and environmental hazards. Both ends share a Cannon.js physics world for predictable bumper collisions.

## Tech stack

| Layer | Tech |
| --- | --- |
| Rendering | [Three.js](https://threejs.org/) |
| Physics | [Cannon.js](https://github.com/schteppe/cannon.js) |
| Networking | [Socket.IO](https://socket.io/) (client + server) |
| Build | [Vite](https://vitejs.dev/) with [vite-plugin-glsl](https://github.com/UstymUkhman/vite-plugin-glsl) |
| Animation | [GSAP](https://gsap.com/) |
| Audio | [Howler.js](https://howlerjs.com/) |
| Trailer pipeline | [Remotion](https://www.remotion.dev/) |
| Reverse proxy | [Caddy](https://caddyserver.com/) (production) |

## Quick start

Requires **Node.js ≥ 18** and **npm ≥ 9**.

```bash
# Install all workspaces
npm install
npm install --prefix client
npm install --prefix server

# Run client + server together
npm run dev
```

That spins up:

- **Server** — Socket.IO at `http://localhost:3001`
- **Client** — Vite dev server at `http://localhost:5173`, proxying `/socket.io/` to the server

You can also run them individually:

```bash
npm run client   # Vite client only
npm run server   # Socket.IO server only
```

To build the production client:

```bash
npm run build    # → client/dist/
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser  client/                                                    │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐  │
│  │  Three.js    │   │  Cannon.js   │   │  Socket.IO client        │  │
│  │  rendering   │   │  local sim   │   │  inputs ↑ / snapshots ↓  │  │
│  └──────────────┘   └──────────────┘   └────────────┬─────────────┘  │
│                                                     │                │
└─────────────────────────────────────────────────────┼────────────────┘
                                                     │  WebSocket
┌─────────────────────────────────────────────────────┼────────────────┐
│  Node     server/                                   │                │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────┴─────────────┐  │
│  │  GameRoom    │ ← │  Cannon.js   │ ← │  Socket.IO server        │  │
│  │  20Hz tick   │   │  60Hz physics│   │  routes inputs, broadcasts│ │
│  └──────────────┘   └──────────────┘   └──────────────────────────┘  │
│                     ↑                                                │
│                     │  meteor scheduler, kill attribution            │
│                     │  ping ↔ clock-sync                             │
└──────────────────────────────────────────────────────────────────────┘
```

The server steps physics at 60 Hz and broadcasts world snapshots at 20 Hz. Each snapshot is the **client-reported state** (position, quaternion, velocity, wheel transforms) cached server-side and re-emitted to all peers. Remote cars on each client interpolate over a 80 ms render delay and fall back to velocity-based extrapolation when the buffer is empty.

Round-trip pings double as a clock-sync mechanism: the server returns its own `Date.now()` in the ping callback; the client computes `(serverTime + RTT/2) - clientTime` and EMA-smooths the result so renders use a shared temporal reference, not the local clock.

## Project structure

```
.
├── client/                 # Vite + Three.js front-end
│   └── src/
│       ├── index.html
│       ├── index.js
│       ├── javascript/     # World, Camera, HUD, Network, EntryFlow…
│       │   └── World/      # Track, Arena, Weapons, Meteors, HazardZones…
│       ├── shaders/        # GLSL
│       └── styles/redline.css
│
├── server/                 # Socket.IO authoritative server
│   └── src/
│       ├── index.js        # HTTP server boot
│       ├── GameRoom.js     # tick loop + event handlers + meteor shower
│       └── PhysicsWorld.js # shared with client via shared/constants.js
│
├── shared/
│   └── constants.js        # physics tuning, network rates, spawn grid
│
├── remotion/               # Trailer pipeline (intro + gameplay + outro)
│   └── src/Trailer.tsx     # composition with chromatic aberration,
│                           # synthwave grid, ken burns, scanning bar…
│
├── docs/                   # README assets
│   └── preview.gif
│
├── design/                 # Brand brief, palette, layout notes
└── ecosystem.config.cjs    # PM2 config (legacy)
```

## Game modes

### Race

| Element | Detail |
| --- | --- |
| **Objective** | Best 5-lap time |
| **Arena** | Procedural racetrack (Catmull-Rom centerline → outer/inner walls) |
| **Tools** | Boost pads, sector checkpoints, lap timer, leaderboard |
| **End condition** | After 5 laps, results overlay shows lap-by-lap with best lap highlighted in gold |

### Combat

| Element | Detail |
| --- | --- |
| **Objective** | First to 5 kills |
| **Arena** | 100×100 m skatepark: central plateau with 4 ramps, NE skate bowl, NW stairs deck, SE big kicker, SW spine, mixed low-poly trees, L-cover walls |
| **Tools** | Homing missiles (F), ammo + health pickups, healing zone (south), 2 boost zones (east/west corridors), server-driven meteor shower (~140/min) |
| **Kills** | Heuristic: a `combat:carDestroyed` event from a player you damaged within the last 1500 ms counts as your kill |

## Controls

| Action | Keys |
| --- | --- |
| Drive | `WASD` / arrow keys |
| Boost | `Shift` |
| Brake | `X` (or `Ctrl`) |
| **Jump** | `Space` |
| Fire (Combat) | `F` |
| Respawn | `R` |
| Horn | `H` |
| Chat | `Enter` |
| Mute | UI button |

A keyboard is currently required — touch controls are stubbed out but not wired up.

## Contributing

PRs welcome. The repo is small enough to read top-to-bottom in an afternoon.

1. **Fork → clone → branch** (`git checkout -b feat/your-thing`)
2. Run locally with `npm run dev` (see [Quick start](#quick-start))
3. Keep changes scoped — one feature/fix per PR
4. Match the existing style: 4-space indent, semicolons-off where the file already drops them, single quotes
5. **No formatting-only commits** mixed with logic changes
6. Open a PR with a short description of *why* the change matters, not just *what* it does

### Good first issues

If you want to chip in but aren't sure where to start, the codebase has plenty of low-hanging fruit:

- Touch controls (`client/src/javascript/World/Controls.js` already has a `setTouch()` method scaffold — joystick + buttons exist but aren't fully wired)
- Adaptive interpolation delay based on measured ping (currently fixed 80 ms)
- Server-side HP authority (currently client-trusted)
- Spectator mode for full rooms
- More arena obstacle layouts as separate files (currently hard-coded in `Arena.js`)
- Localized strings (the UI text is currently hard-coded English/Spanish)

### Conventions

- **Commits**: imperative mood, present tense, no trailing period (`Add boost zone visual`, not `Added boost zone visual.`)
- **Network events**: `colon:case` (e.g. `combat:missile`, `player:joined`)
- **Magic numbers**: lift them to module-level constants with a comment

## Acknowledgments

REDLINE began as an educational fork of [**Bruno Simon's `folio-2019`**](https://github.com/brunosimon/folio-2019) — the matcap shader pipeline, shadow system, GLTF loader integration, and base car physics setup are derived from his original work. This repo evolved into a separate game (multiplayer, lap timing, combat, arena, weapons, hazards, REDLINE branding) but the foundation is his.
