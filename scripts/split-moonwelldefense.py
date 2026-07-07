#!/usr/bin/env python3
"""Split mdv1 (5).html into a maintainable moonwelldefense/ project."""

from pathlib import Path

ROOT = Path("/workspace")
SRC = ROOT / "mdv1 (5).html"
OUT = ROOT / "moonwelldefense"

lines = SRC.read_text(encoding="utf-8").splitlines(keepends=True)


def extract(start: int, end: int) -> str:
    """Extract 1-indexed inclusive line range."""
    return "".join(lines[start - 1 : end])


def strip_style(content: str) -> str:
    """Remove leading 8 spaces from indented CSS inside HTML style tags."""
    out = []
    for line in content.splitlines(keepends=True):
        if line.startswith("        "):
            out.append(line[8:])
        else:
            out.append(line)
    return "".join(out)


def strip_script(content: str) -> str:
    """Remove leading 8 spaces from indented JS inside HTML script tags."""
    out = []
    for line in content.splitlines(keepends=True):
        if line.startswith("        "):
            out.append(line[8:])
        else:
            out.append(line)
    return "".join(out)


# CSS
(OUT / "css").mkdir(parents=True, exist_ok=True)
main_css = strip_style(extract(12, 294)).replace(
    "    100% { opacity: 0; transform: translateY(-60px) scale(0.8); } \n}\n}\n@keyframes pulse",
    "    100% { opacity: 0; transform: translateY(-60px) scale(0.8); } \n}\n@keyframes pulse",
)
mp_css = strip_style(extract(298, 339))
ghost_css = strip_style(extract(3861, 3907))
(OUT / "css" / "main.css").write_text(main_css + "\n" + mp_css, encoding="utf-8")
(OUT / "css" / "ghost.css").write_text(ghost_css, encoding="utf-8")

# JS modules (load order matters)
js_files = {
    "js/save-shop.js": (592, 640),
    "js/config.js": (782, 850),
    "js/systems/trail-system.js": (641, 759),
    "js/components/world.js": (760, 989),
    "js/components/player.js": (991, 1616),
    "js/components/combat.js": (1617, 1950),
    "js/components/enemies.js": (1952, 2329),
    "js/game-flow.js": (2330, 2694),
    "js/bootstrap.js": (780, 780),
    "js/multiplayer.js": (2699, 3431),
    "js/patch-v63.js": (3438, 3858),
    "js/patch-soul-link.js": (3921, 4252),
}

for rel, (start, end) in js_files.items():
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    content = strip_script(extract(start, end))
    path.write_text(content, encoding="utf-8")

# HTML body fragments
body_main = extract(343, 589)
body_ghost = extract(3910, 3918)

index_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Moon Well Defense</title>
    <script src="https://aframe.io/releases/1.6.0/aframe.min.js"></script>
    <script src="https://unpkg.com/aframe-environment-component@1.3.3/dist/aframe-environment-component.min.js"></script>
    <script src="https://cdn.jsdelivr.net/gh/c-frame/aframe-extras@7.4.0/dist/aframe-extras.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Lato:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/main.css">
    <link rel="stylesheet" href="css/ghost.css">
</head>
<body>
{body_main}
{body_ghost}

    <script src="js/save-shop.js"></script>
    <script src="js/config.js"></script>
    <script src="js/systems/trail-system.js"></script>
    <script src="js/components/world.js"></script>
    <script src="js/components/player.js"></script>
    <script src="js/components/combat.js"></script>
    <script src="js/components/enemies.js"></script>
    <script src="js/game-flow.js"></script>
    <script src="js/bootstrap.js"></script>
    <script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js"></script>
    <script src="js/multiplayer.js"></script>
    <script src="js/patch-v63.js"></script>
    <script src="js/patch-soul-link.js"></script>
</body>
</html>
"""

(OUT / "index.html").write_text(index_html, encoding="utf-8")

readme = """# Moon Well Defense

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
"""

(OUT / "README.md").write_text(readme, encoding="utf-8")

print(f"Created {OUT}")
for p in sorted(OUT.rglob("*")):
    if p.is_file():
        print(f"  {p.relative_to(ROOT)} ({p.stat().st_size} bytes)")
