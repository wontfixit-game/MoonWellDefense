# Moon Well Defense

A-Frame tower-defense game, restructured from a single HTML file into modules.

## Project layout

```
moonwelldefense/
├── index.html              # Entry point + A-Frame scene
├── css/
│   ├── main.css            # HUD, menus, mobile controls, MP lobby
│   └── ghost.css           # Ghost/revive mode UI
└── js/
    ├── save-shop.js        # Save data + Moon Altar shop
    ├── config.js           # GAME state, ENEMIES, ALLIES, initGame()
    ├── bootstrap.js        # Scene loaded hook
    ├── game-flow.js        # Waves, upgrades, game over, HUD helpers
    ├── multiplayer.js      # Versus mode (PeerJS)
    ├── patch-v63.js        # Arrow physics + MP integration patches
    ├── patch-soul-link.js  # Ghost/revive mode overrides
    ├── systems/
    │   ├── trail-system.js # Particle trail object pool
    │   └── trap-system.js  # Placeable traps (spikes, tar, brimstone) + hotbar
    └── components/
        ├── world.js        # well-manager, forest-generator, camera
        ├── player.js       # universal-controls
        ├── combat.js       # arrow-physics, enemy-projectile
        └── enemies.js      # enemy/boss/ally/game-logic
```

## Run locally

Serve the folder over HTTP (required for some asset loading):

```bash
cd moonwelldefense
python3 -m http.server 8080
```

Open http://localhost:8080

## Play online

### Option A: Netlify (works with private repo)

1. Go to https://app.netlify.com/start
2. Import **wontfixit-game/MoonWellDefense** from GitHub
3. Build settings are already in `netlify.toml` (publish folder: `moonwelldefense`)
4. Deploy — you'll get a URL like `https://random-name.netlify.app`

### Option B: GitHub Pages (public repo only on free plan)

This repo is currently **private**, so GitHub Pages may not show full settings unless you:

- upgrade to a paid GitHub plan, **or**
- make the repository **public**

Then open: https://github.com/wontfixit-game/MoonWellDefense/settings/pages

You should see **Pages** in the left sidebar under **Code and automation**.  
If Pages is not enabled yet, you'll see a setup screen first (not "Build and deployment"):

1. Click **Settings** (repo top bar — need admin access)
2. Left sidebar → **Pages**
3. Under **Source**, choose **GitHub Actions** (or **Deploy from a branch** → `main` → `/docs` if using branch deploy)
4. Save, then check **Actions** tab for `Deploy Moon Well Defense`

Live URL (after Pages is enabled): **https://wontfixit-game.github.io/MoonWellDefense/**

## Notes

- Scripts load in order; globals (`GAME`, `MP_CORE`, etc.) are shared across files.
- The original monolith is kept as `mdv1 (5).html` at the repo root for reference.
