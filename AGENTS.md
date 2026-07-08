# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
Moon Well Defense is a **fully static, client-side A-Frame browser game**. There is no
package manager, no build step, no automated tests, and no lint tooling. The playable
app lives in `moonwelldefense/` (entry point `moonwelldefense/index.html`). The root
`mdv1 (5).html` is the original monolith kept only for reference; `scripts/split-moonwelldefense.py`
is the one-off tool that produced the modular layout.

### Running it (dev)
Serve the `moonwelldefense/` folder over HTTP (see `moonwelldefense/README.md`):

```bash
cd moonwelldefense && python3 -m http.server 8080
```

Then open http://localhost:8080. Python 3 is the only runtime needed and is preinstalled;
no dependencies are installed by the update script.

### Non-obvious gotchas
- **Menu flow:** the first screen is the "VERSUS MODE" lobby. Click **SOLO PLAY** to reach
  the "ENTER FOREST" start screen, then **ENTER FOREST** to begin single-player gameplay.
- **3D models do not render in-browser.** All runtime libs (A-Frame, PeerJS) and the GLTF/GLB
  character/world models are loaded from CDNs at runtime. The model host `hklo.netlify.app`
  sends **no `Access-Control-Allow-Origin` header**, so A-Frame's cross-origin asset fetches
  are blocked by CORS and the 3D scene shows only a blue sky. This is an asset-hosting
  limitation of the app itself (it affects the production GitHub Pages site too), **not** a
  local-environment problem. The game's core logic (HUD, waves, spawning, combat, minimap,
  game-over) still runs correctly without the visuals.
- **Deployment** is handled by `.github/workflows/deploy-pages.yml`, which just uploads the
  `moonwelldefense/` folder to GitHub Pages on push to `main`. There is nothing to build.
