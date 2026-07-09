/*
 * TRAP SYSTEM — action tower-defense trap building.
 * Self-contained: registers the `trap-logic` and `trap-builder` A-Frame
 * components, builds its own HUD, and exposes window.TRAP_BUILDER.
 * Hooks elsewhere: a shooting guard in player.js and a slow check in
 * enemies.js. Remove this file + those two hooks to fully delete the feature.
 *
 * Traps are placed along the three enemy lanes to slow and shred waves
 * before they reach the Moon Well.
 */

// Original, moon/forest-themed trap archetypes (generic TD mechanics).
const TRAPS = {
    spike: {
        name: 'Bramble Spikes', key: '1', cost: 4, color: 0x88aa66,
        effect: 'damage', radius: 3.0, dmg: 35, interval: 650,
        desc: 'Thorns erupt from the ground, wounding all foes above.',
        mesh: function () {
            const g = document.createElement('a-entity');
            const base = document.createElement('a-cylinder');
            base.setAttribute('radius', '1.3'); base.setAttribute('height', '0.15');
            base.setAttribute('position', '0 0.08 0');
            base.setAttribute('material', 'color: #2b3b22; roughness: 1');
            g.appendChild(base);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const s = document.createElement('a-cone');
                s.setAttribute('radius-bottom', '0.18'); s.setAttribute('radius-top', '0');
                s.setAttribute('height', '0.9');
                s.setAttribute('position', `${Math.cos(a) * 0.6} 0.5 ${Math.sin(a) * 0.6}`);
                s.setAttribute('material', 'color: #6b7a4a; roughness: 0.8');
                g.appendChild(s);
            }
            return g;
        }
    },
    mire: {
        name: 'Moonmire', key: '2', cost: 5, color: 0x3aa0d0,
        effect: 'slow', radius: 4.0, slowFactor: 0.4, dmg: 8, interval: 500,
        desc: 'A cold pool that mires enemies, slowing them to a crawl.',
        mesh: function () {
            const g = document.createElement('a-entity');
            const pool = document.createElement('a-cylinder');
            pool.setAttribute('radius', '3.4'); pool.setAttribute('height', '0.06');
            pool.setAttribute('position', '0 0.03 0');
            pool.setAttribute('material', 'shader: flat; color: #1c5f80; transparent: true; opacity: 0.6');
            g.appendChild(pool);
            const glow = document.createElement('a-ring');
            glow.setAttribute('radius-inner', '3.0'); glow.setAttribute('radius-outer', '3.4');
            glow.setAttribute('rotation', '-90 0 0'); glow.setAttribute('position', '0 0.07 0');
            glow.setAttribute('material', 'shader: flat; color: #7fdfff; transparent: true; opacity: 0.7');
            g.appendChild(glow);
            return g;
        }
    },
    ward: {
        name: 'Moonstone Ward', key: '3', cost: 9, color: 0x00d2ff,
        effect: 'turret', radius: 15, dmg: 60, interval: 850,
        desc: 'A crystal spire that looses bolts of light at the nearest foe.',
        mesh: function () {
            const g = document.createElement('a-entity');
            const pillar = document.createElement('a-cylinder');
            pillar.setAttribute('radius', '0.45'); pillar.setAttribute('height', '1.6');
            pillar.setAttribute('position', '0 0.8 0');
            pillar.setAttribute('material', 'color: #4a4a66; roughness: 0.7');
            g.appendChild(pillar);
            const crystal = document.createElement('a-octahedron');
            crystal.setAttribute('radius', '0.5'); crystal.setAttribute('position', '0 1.9 0');
            crystal.setAttribute('material', 'shader: flat; color: #00d2ff; transparent: true; opacity: 0.9');
            crystal.setAttribute('animation__spin', 'property: rotation; to: 0 360 0; loop: true; dur: 4000; easing: linear');
            g.appendChild(crystal);
            return g;
        }
    },
    ember: {
        name: 'Emberglyph', key: '4', cost: 12, color: 0xff5522,
        effect: 'fire', radius: 4.5, dmg: 65, interval: 1300,
        desc: 'A rune that erupts in flame, scorching everything nearby.',
        mesh: function () {
            const g = document.createElement('a-entity');
            const rune = document.createElement('a-cylinder');
            rune.setAttribute('radius', '1.1'); rune.setAttribute('height', '0.08');
            rune.setAttribute('position', '0 0.04 0');
            rune.setAttribute('material', 'shader: flat; color: #331100; transparent: true; opacity: 0.9');
            g.appendChild(rune);
            const flame = document.createElement('a-sphere');
            flame.setAttribute('radius', '0.4'); flame.setAttribute('position', '0 0.6 0');
            flame.setAttribute('material', 'shader: flat; color: #ff6600; transparent: true; opacity: 0.85');
            flame.setAttribute('animation__pulse', 'property: scale; to: 1.3 1.5 1.3; dir: alternate; loop: true; dur: 500');
            g.appendChild(flame);
            return g;
        }
    },
    coil: {
        name: 'Storm Coil', key: '5', cost: 14, color: 0x00ffff,
        effect: 'chain', radius: 12, dmg: 55, jumps: 4, interval: 1100,
        desc: 'A charged coil that arcs lightning between clustered foes.',
        mesh: function () {
            const g = document.createElement('a-entity');
            const pole = document.createElement('a-cylinder');
            pole.setAttribute('radius', '0.2'); pole.setAttribute('height', '1.4');
            pole.setAttribute('position', '0 0.7 0');
            pole.setAttribute('material', 'color: #999999; metalness: 0.6; roughness: 0.3');
            g.appendChild(pole);
            const orb = document.createElement('a-sphere');
            orb.setAttribute('radius', '0.38'); orb.setAttribute('position', '0 1.55 0');
            orb.setAttribute('material', 'shader: flat; color: #66ffff; transparent: true; opacity: 0.9');
            orb.setAttribute('animation__pulse', 'property: material.opacity; to: 0.4; dir: alternate; loop: true; dur: 400');
            g.appendChild(orb);
            return g;
        }
    }
};

// ---- shared VFX helper ---------------------------------------------------
function trapBeam(start, end, color) {
    const scene = document.querySelector('a-scene');
    if (!scene) return;
    const e = document.createElement('a-entity');
    const dist = start.distanceTo(end);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const geo = new THREE.CylinderGeometry(0.06, 0.06, dist, 6);
    const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(mid); mesh.lookAt(end); mesh.rotation.x += Math.PI / 2;
    e.setObject3D('mesh', mesh);
    scene.appendChild(e);
    let op = 0.9;
    const iv = setInterval(() => {
        op -= 0.15; mat.opacity = op;
        if (op <= 0) { clearInterval(iv); if (e.parentNode) e.parentNode.removeChild(e); }
    }, 20);
}

// ---- the trap entity behaviour ------------------------------------------
AFRAME.registerComponent('trap-logic', {
    schema: { type: { type: 'string' } },
    init: function () {
        this.def = TRAPS[this.data.type];
        if (!this.def) { this.el.remove(); return; }
        this.cool = Math.random() * 300; // stagger firing so traps don't pulse in sync
        this.el.appendChild(this.def.mesh());
        // faint footprint ring so players read the effect area
        const ring = document.createElement('a-ring');
        ring.setAttribute('radius-inner', (this.def.radius - 0.15).toFixed(2));
        ring.setAttribute('radius-outer', this.def.radius.toFixed(2));
        ring.setAttribute('rotation', '-90 0 0');
        ring.setAttribute('position', '0 0.02 0');
        const c = '#' + this.def.color.toString(16).padStart(6, '0');
        ring.setAttribute('material', `shader: flat; color: ${c}; transparent: true; opacity: 0.25`);
        this.el.appendChild(ring);
    },
    hitTarget: function (el, dmg) {
        if (el.components['enemy-logic']) el.components['enemy-logic'].hit(dmg);
        else if (el.components['boss-logic']) el.components['boss-logic'].hit(dmg);
    },
    enemiesInRadius: function (pos, r) {
        const out = [];
        const r2 = r * r;
        (GAME.enemyHitboxes || []).forEach(h => {
            if (!h || !h.userData || !h.userData.el) return;
            const el = h.userData.el;
            if (!el.components['enemy-logic'] && !el.components['boss-logic']) return;
            const p = el.object3D.position;
            const dx = p.x - pos.x, dz = p.z - pos.z;
            if (dx * dx + dz * dz <= r2) out.push(el);
        });
        return out;
    },
    tick: function (t, dt) {
        if (!GAME.active || GAME.paused) return;
        const def = this.def;
        const pos = this.el.object3D.position;

        // Slow is applied continuously, not on the fire interval.
        if (def.effect === 'slow') {
            const now = Date.now();
            this.enemiesInRadius(pos, def.radius).forEach(el => {
                el.__slowUntil = now + 250;
                el.__slowFactor = def.slowFactor;
            });
        }

        this.cool -= dt;
        if (this.cool > 0) return;
        this.cool = def.interval;
        this.fire(pos, def);
    },
    fire: function (pos, def) {
        const c = def.color;
        if (def.effect === 'damage') {
            const hits = this.enemiesInRadius(pos, def.radius);
            if (hits.length === 0) return;
            if (typeof spawnExplosion === 'function') spawnExplosion(pos, c, 10);
            hits.forEach(el => {
                this.hitTarget(el, def.dmg);
                if (typeof spawnDamageText === 'function') spawnDamageText(def.dmg, el.object3D.position, false, false);
            });
        } else if (def.effect === 'slow') {
            this.enemiesInRadius(pos, def.radius).forEach(el => this.hitTarget(el, def.dmg));
        } else if (def.effect === 'fire') {
            const hits = this.enemiesInRadius(pos, def.radius);
            if (hits.length === 0) return;
            if (typeof spawnExplosion === 'function') spawnExplosion(pos, 0xff4400, 16);
            hits.forEach(el => {
                this.hitTarget(el, def.dmg);
                if (typeof spawnDamageText === 'function') spawnDamageText(def.dmg, el.object3D.position, true, false);
            });
        } else if (def.effect === 'turret') {
            const hits = this.enemiesInRadius(pos, def.radius);
            if (hits.length === 0) return;
            let target = hits[0], best = Infinity;
            hits.forEach(el => {
                const d = el.object3D.position.distanceToSquared(pos);
                if (d < best) { best = d; target = el; }
            });
            const from = pos.clone(); from.y = 1.9;
            const to = target.object3D.position.clone(); to.y += 1.2;
            trapBeam(from, to, c);
            this.hitTarget(target, def.dmg);
            if (typeof spawnExplosion === 'function') spawnExplosion(to, c, 8);
            if (typeof spawnDamageText === 'function') spawnDamageText(def.dmg, target.object3D.position, false, false);
        } else if (def.effect === 'chain') {
            const inRange = this.enemiesInRadius(pos, def.radius);
            if (inRange.length === 0) return;
            let curr = pos.clone(); curr.y = 1.5;
            const visited = [];
            for (let j = 0; j < def.jumps; j++) {
                let next = null, best = Infinity;
                inRange.forEach(el => {
                    if (visited.includes(el)) return;
                    const d = el.object3D.position.distanceToSquared(new THREE.Vector3(curr.x, 0, curr.z));
                    if (d < best) { best = d; next = el; }
                });
                if (!next) break;
                const to = next.object3D.position.clone(); to.y += 1.2;
                trapBeam(curr, to, c);
                this.hitTarget(next, def.dmg);
                if (typeof spawnExplosion === 'function') spawnExplosion(to, c, 6);
                visited.push(next);
                curr = to;
            }
        }
    }
});

// ---- build mode + HUD ----------------------------------------------------
AFRAME.registerComponent('trap-builder', {
    init: function () {
        window.TRAP_BUILDER = this;
        this.active = false;
        this.types = Object.keys(TRAPS);
        this.selected = 0;
        this.placed = [];
        this.valid = false;
        this.raycaster = new THREE.Raycaster();
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.point = new THREE.Vector3();
        this.barTimer = 0;

        this.injectStyles();
        this.buildBar();
        this.buildButtons();
        this.buildGhost();

        // Placement click (capture so it beats the player's shoot handler).
        document.addEventListener('mousedown', (e) => {
            if (!this.active || e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            this.place();
        }, true);

        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyT') { this.toggle(); return; }
            if (!this.active) return;
            if (e.code === 'Escape') { this.setActive(false); return; }
            if (e.code.indexOf('Digit') === 0) {
                const n = parseInt(e.code.slice(5), 10);
                if (n >= 1 && n <= this.types.length) this.select(n - 1);
            }
        });
    },

    injectStyles: function () {
        if (document.getElementById('trap-styles')) return;
        const s = document.createElement('style');
        s.id = 'trap-styles';
        s.innerHTML = `
        #trap-bar { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
            display: none; flex-direction: column; align-items: center; gap: 8px; z-index: 60;
            pointer-events: none; font-family: 'Lato', sans-serif; }
        #trap-bar.active { display: flex; }
        #trap-bar .tb-title { color: #ffd700; font-size: 13px; letter-spacing: 1px;
            text-shadow: 0 0 6px #000; background: rgba(0,0,0,0.5); padding: 4px 12px; border-radius: 6px; }
        #trap-bar .tb-slots { display: flex; gap: 8px; }
        .tb-slot { position: relative; pointer-events: auto; cursor: pointer; width: 96px; min-height: 58px; padding: 6px 8px;
            border-radius: 8px; border: 2px solid rgba(255,255,255,0.35);
            background: rgba(10,14,20,0.72); backdrop-filter: blur(6px); color: #fff;
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
            text-align: center; transition: transform 0.1s, border-color 0.15s; }
        .tb-slot .tb-key { position: absolute; top: -8px; left: -8px;
            background: #ffd700; color: #000; font-size: 10px; font-weight: bold;
            border-radius: 4px; padding: 0 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.6); }
        .tb-slot .tb-name { font-size: 12px; font-weight: bold; line-height: 1.1; }
        .tb-slot .tb-cost { font-size: 12px; color: #6cff8a; font-weight: bold; }
        .tb-slot.sel { border-color: #ffd700; transform: translateY(-6px) scale(1.06);
            box-shadow: 0 0 16px rgba(255,215,0,0.5); }
        .tb-slot.poor .tb-cost { color: #ff5566; }
        .tb-slot.poor { opacity: 0.55; }
        #tb-place { pointer-events: auto; cursor: pointer; display: none; margin-top: 4px;
            padding: 10px 26px; border-radius: 24px; border: 2px solid #fff; font-weight: bold;
            color: #fff; background: rgba(46,204,113,0.65); backdrop-filter: blur(6px); letter-spacing: 1px; }
        #trap-btn { background: #27ae60; }
        @media (max-width: 768px) {
            #trap-bar { bottom: 150px; }
            .tb-slot { width: 62px; min-height: 46px; padding: 4px; }
            .tb-slot .tb-name { font-size: 9px; }
            .tb-slot .tb-key { display: none; }
            #tb-place { display: block; }
        }`;
        document.head.appendChild(s);
    },

    buildBar: function () {
        const ui = document.getElementById('game-ui') || document.body;
        const bar = document.createElement('div');
        bar.id = 'trap-bar';
        let slots = '';
        this.types.forEach((k, i) => {
            const d = TRAPS[k];
            slots += `<div class="tb-slot" data-i="${i}">
                <span class="tb-key">${d.key}</span>
                <span class="tb-name">${d.name}</span>
                <span class="tb-cost">${d.cost}G</span></div>`;
        });
        bar.innerHTML = `<div class="tb-title">BUILD TRAPS &nbsp;·&nbsp; [T] exit &nbsp;·&nbsp; [1-${this.types.length}] pick &nbsp;·&nbsp; click ground to place</div>
            <div class="tb-slots">${slots}</div>
            <div id="tb-place">PLACE</div>`;
        ui.appendChild(bar);
        this.barEl = bar;
        bar.querySelectorAll('.tb-slot').forEach(el => {
            el.addEventListener('click', () => this.select(parseInt(el.getAttribute('data-i'), 10)));
        });
        bar.querySelector('#tb-place').addEventListener('click', () => this.place());
    },

    buildButtons: function () {
        const controls = document.getElementById('ally-controls');
        if (!controls) return;
        const btn = document.createElement('div');
        btn.id = 'trap-btn';
        btn.className = 'action-btn';
        btn.textContent = 'TRAPS';
        btn.addEventListener('click', () => this.toggle());
        controls.appendChild(btn);
    },

    buildGhost: function () {
        const g = document.createElement('a-entity');
        g.setAttribute('visible', 'false');
        const ring = document.createElement('a-ring');
        ring.setAttribute('rotation', '-90 0 0');
        ring.setAttribute('position', '0 0.05 0');
        ring.setAttribute('material', 'shader: flat; color: #00ff88; transparent: true; opacity: 0.5; side: double');
        const beam = document.createElement('a-cylinder');
        beam.setAttribute('radius', '0.12'); beam.setAttribute('height', '3');
        beam.setAttribute('position', '0 1.5 0');
        beam.setAttribute('material', 'shader: flat; color: #00ff88; transparent: true; opacity: 0.4');
        g.appendChild(ring); g.appendChild(beam);
        this.el.sceneEl.appendChild(g);
        this.ghost = g; this.ghostRing = ring; this.ghostBeam = beam;
        this.applyGhostRadius();
    },

    applyGhostRadius: function () {
        const r = TRAPS[this.types[this.selected]].radius;
        this.ghostRing.setAttribute('radius-inner', (r - 0.2).toFixed(2));
        this.ghostRing.setAttribute('radius-outer', r.toFixed(2));
    },

    select: function (i) {
        this.selected = i;
        this.applyGhostRadius();
        this.refreshBar();
    },

    toggle: function () { this.setActive(!this.active); },

    setActive: function (on) {
        if (on && (!GAME.started || !GAME.active || GAME.paused)) return; // build during live waves only
        this.active = on;
        this.barEl.classList.toggle('active', on);
        this.ghost.setAttribute('visible', on);
        this.refreshBar();
    },

    checkValid: function (p) {
        if (Math.sqrt(p.x * p.x + p.z * p.z) > 46) return false;      // inside arena
        if (Math.sqrt(p.x * p.x + p.z * p.z) < 6) return false;       // clear of the well
        for (const o of (GAME.obstacles || [])) {
            if (Math.sqrt((o.x - p.x) ** 2 + (o.z - p.z) ** 2) < (o.r + 1.4)) return false;
        }
        for (const t of this.placed) {
            if (Math.sqrt((t.x - p.x) ** 2 + (t.z - p.z) ** 2) < 2.6) return false;
        }
        return GAME.gems >= TRAPS[this.types[this.selected]].cost;
    },

    tick: function (t, dt) {
        if (!this.active) return;
        if (!GAME.active || GAME.paused) { this.setActive(false); return; }

        if (!this.cam) {
            const camEl = document.querySelector('a-camera');
            this.cam = camEl ? camEl.getObject3D('camera') : null;
        }
        if (!this.cam) return;

        this.raycaster.setFromCamera({ x: 0, y: 0 }, this.cam);
        const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.point);
        if (hit) {
            this.ghost.object3D.position.set(this.point.x, 0.02, this.point.z);
            this.valid = this.checkValid(this.point);
        } else {
            this.valid = false;
        }
        const col = this.valid ? '#00ff88' : '#ff3355';
        this.ghostRing.setAttribute('material', 'color', col);
        this.ghostBeam.setAttribute('material', 'color', col);

        this.barTimer += dt;
        if (this.barTimer > 250) { this.barTimer = 0; this.refreshBar(); }
    },

    place: function () {
        if (!this.active) return;
        const def = TRAPS[this.types[this.selected]];
        if (!this.valid) {
            if (typeof spawnDamageText === 'function') {
                const why = GAME.gems < def.cost ? 'Need ' + def.cost + ' Gems' : "Can't build here";
                spawnDamageText(why, this.point.clone(), true, false);
            }
            return;
        }
        GAME.gems -= def.cost;
        const el = document.createElement('a-entity');
        el.setAttribute('position', `${this.point.x} 0 ${this.point.z}`);
        el.setAttribute('trap-logic', { type: this.types[this.selected] });
        this.el.sceneEl.appendChild(el);
        this.placed.push({ x: this.point.x, z: this.point.z, el: el });
        if (typeof spawnExplosion === 'function') spawnExplosion(this.point.clone(), def.color, 14);
        if (typeof updateHUD === 'function') updateHUD();
        this.refreshBar();
    },

    refreshBar: function () {
        if (!this.barEl) return;
        this.barEl.querySelectorAll('.tb-slot').forEach((el, i) => {
            const d = TRAPS[this.types[i]];
            el.classList.toggle('sel', i === this.selected);
            el.classList.toggle('poor', GAME.gems < d.cost);
        });
    }
});
