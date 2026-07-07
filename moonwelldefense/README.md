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
    │   └── trail-system.js # Particle trail object pool
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

## Notes

- Scripts load in order; globals (`GAME`, `MP_CORE`, etc.) are shared across files.
- The original monolith is kept as `mdv1 (5).html` at the repo root for reference.
