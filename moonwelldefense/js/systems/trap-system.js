// --- ORCS-MUST-DIE STYLE TRAP SYSTEM ---
// Hotbar: [1] Bow  [2] Spike Trap  [3] Tar Pit  [4] Brimstone
// Select a trap, aim at the ground (ghost ring preview), fire button places it.

const TRAPS = {
    spike: {
        name: 'SPIKES', cost: 4, radius: 1.8, cooldown: 2200, dmg: 150,
        color: '#cccccc', desc: 'Impales everything on it'
    },
    tar: {
        name: 'TAR PIT', cost: 3, radius: 2.4, slowFactor: 0.4,
        color: '#331100', desc: 'Slows enemies to a crawl'
    },
    fire: {
        name: 'BRIMSTONE', cost: 6, radius: 2.0, cooldown: 2800, dmg: 100,
        color: '#ff5500', desc: 'Erupts in flames'
    }
};

const TRAP_SYSTEM = {
    MAX_PLACE_RANGE: 16,
    MIN_TRAP_SPACING: 2.4,
    ghost: null,
    ghostRing: null,
    lastPlace: 0,

    init: function() {
        GAME.selectedTrap = null;
        GAME.traps = [];
        this.buildBar();

        window.addEventListener('keydown', e => {
            if (!GAME.started) return;
            if (e.code === 'Digit1') this.select(null);
            if (e.code === 'Digit2') this.select('spike');
            if (e.code === 'Digit3') this.select('tar');
            if (e.code === 'Digit4') this.select('fire');
        });
        // Right-click cancels back to bow
        document.addEventListener('contextmenu', e => {
            if (GAME.selectedTrap) { e.preventDefault(); this.select(null); }
        });

        const loop = () => { this.updateGhost(); requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
    },

    buildBar: function() {
        const bar = document.getElementById('trap-bar');
        if (!bar) return;
        const slots = [
            { key: '1', id: null, label: 'BOW', cost: null },
            { key: '2', id: 'spike', label: TRAPS.spike.name, cost: TRAPS.spike.cost },
            { key: '3', id: 'tar', label: TRAPS.tar.name, cost: TRAPS.tar.cost },
            { key: '4', id: 'fire', label: TRAPS.fire.name, cost: TRAPS.fire.cost }
        ];
        bar.innerHTML = '';
        slots.forEach(s => {
            const el = document.createElement('div');
            el.className = 'trap-slot' + (s.id === null ? ' selected' : '');
            el.dataset.trap = s.id || '';
            el.innerHTML = `<span class="trap-key">${s.key}</span>${s.label}` +
                (s.cost !== null ? `<span class="trap-cost">${s.cost}G</span>` : '');
            el.onclick = (e) => { e.stopPropagation(); this.select(s.id); };
            bar.appendChild(el);
        });
    },

    select: function(type) {
        GAME.selectedTrap = type;
        document.querySelectorAll('#trap-bar .trap-slot').forEach(el => {
            el.classList.toggle('selected', el.dataset.trap === (type || ''));
        });
        if (!type && this.ghost) this.ghost.setAttribute('visible', 'false');
    },

    // Where the trap would land: camera crosshair ray onto the ground,
    // clamped to range; falls back to just in front of the player.
    getPlacementPoint: function() {
        const player = document.getElementById('player');
        if (!player) return null;
        const pPos = player.object3D.position;
        let point = null;

        const camEl = document.querySelector('a-camera');
        if (camEl) {
            const cam = camEl.getObject3D('camera');
            const camPos = new THREE.Vector3(), camDir = new THREE.Vector3();
            cam.getWorldPosition(camPos);
            cam.getWorldDirection(camDir);
            const ray = new THREE.Ray(camPos, camDir);
            const hit = new THREE.Vector3();
            if (ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) point = hit;
        }
        if (!point) {
            const fwd = new THREE.Vector3();
            player.object3D.getWorldDirection(fwd);
            point = pPos.clone().add(fwd.multiplyScalar(4));
        }
        point.y = 0;

        // Clamp to placement range around the player
        const flat = new THREE.Vector3(point.x - pPos.x, 0, point.z - pPos.z);
        if (flat.length() > this.MAX_PLACE_RANGE) {
            flat.setLength(this.MAX_PLACE_RANGE);
            point.set(pPos.x + flat.x, 0, pPos.z + flat.z);
        }
        return point;
    },

    isValidSpot: function(point) {
        if (Math.sqrt(point.x * point.x + point.z * point.z) > 44) return false;
        for (const t of GAME.traps) {
            if (!t.object3D) continue;
            if (point.distanceTo(t.object3D.position) < this.MIN_TRAP_SPACING) return false;
        }
        return true;
    },

    updateGhost: function() {
        if (!GAME.active || GAME.paused || !GAME.selectedTrap) {
            if (this.ghost) this.ghost.setAttribute('visible', 'false');
            return;
        }
        const scene = document.querySelector('a-scene');
        if (!scene || !scene.hasLoaded) return;

        if (!this.ghost) {
            this.ghost = document.createElement('a-entity');
            this.ghostRing = document.createElement('a-ring');
            this.ghostRing.setAttribute('rotation', '-90 0 0');
            this.ghostRing.setAttribute('position', '0 0.05 0');
            this.ghostRing.setAttribute('material', 'shader: flat; transparent: true; opacity: 0.55; side: double');
            this.ghost.appendChild(this.ghostRing);
            scene.appendChild(this.ghost);
        }

        const def = TRAPS[GAME.selectedTrap];
        const point = this.getPlacementPoint();
        if (!point) return;

        const ok = this.isValidSpot(point) && GAME.gems >= def.cost;
        this.ghost.setAttribute('visible', 'true');
        this.ghost.object3D.position.copy(point);
        this.ghostRing.setAttribute('radius-inner', (def.radius - 0.25).toFixed(2));
        this.ghostRing.setAttribute('radius-outer', def.radius.toFixed(2));
        this.ghostRing.setAttribute('color', ok ? '#00ff88' : '#ff3333');
    },

    // Called from universal-controls.shoot() when a trap is selected
    place: function() {
        const now = Date.now();
        if (now - this.lastPlace < 400) return;
        this.lastPlace = now;

        const def = TRAPS[GAME.selectedTrap];
        const point = this.getPlacementPoint();
        if (!def || !point) return;

        const player = document.getElementById('player');
        if (!this.isValidSpot(point)) {
            spawnDamageText('Can\'t place here', point, false, false);
            return;
        }
        if (GAME.gems < def.cost) {
            spawnDamageText(`Need ${def.cost} Gems`, player.object3D.position, true, false);
            return;
        }

        GAME.gems -= def.cost;
        updateHUD();

        const el = document.createElement('a-entity');
        el.setAttribute('position', point);
        el.setAttribute('trap-logic', { type: GAME.selectedTrap });
        document.querySelector('a-scene').appendChild(el);
        GAME.traps.push(el);
        spawnExplosion(point, 0xffd700, 8);
    }
};

AFRAME.registerComponent('trap-logic', {
    schema: { type: { type: 'string' } },
    init: function() {
        this.def = TRAPS[this.data.type];
        this.lastFire = 0;
        this.buildVisual();
    },

    buildVisual: function() {
        const r = this.def.radius;
        const base = document.createElement('a-cylinder');
        base.setAttribute('radius', r);
        base.setAttribute('height', 0.08);
        base.setAttribute('position', '0 0.04 0');
        base.setAttribute('material', `color: ${this.def.color}; roughness: 0.9`);
        this.el.appendChild(base);

        if (this.data.type === 'spike') {
            this.spikes = document.createElement('a-entity');
            for (let i = 0; i < 7; i++) {
                const cone = document.createElement('a-cone');
                const ang = (i / 7) * Math.PI * 2;
                const d = (i === 0) ? 0 : r * 0.55;
                cone.setAttribute('radius-bottom', 0.14);
                cone.setAttribute('radius-top', 0);
                cone.setAttribute('height', 1.1);
                cone.setAttribute('position', `${Math.cos(ang) * d} 0.55 ${Math.sin(ang) * d}`);
                cone.setAttribute('material', 'color: #aaaaaa; metalness: 0.8; roughness: 0.3');
                this.spikes.appendChild(cone);
            }
            this.spikes.setAttribute('position', '0 -1.2 0'); // retracted underground
            this.el.appendChild(this.spikes);
        } else if (this.data.type === 'tar') {
            base.setAttribute('material', 'color: #1a0d00; roughness: 1.0; metalness: 0.2');
        } else if (this.data.type === 'fire') {
            const glow = document.createElement('a-light');
            glow.setAttribute('type', 'point');
            glow.setAttribute('color', '#ff4400');
            glow.setAttribute('intensity', '0.7');
            glow.setAttribute('distance', '4');
            glow.setAttribute('position', '0 0.5 0');
            this.el.appendChild(glow);
        }
    },

    enemiesInRange: function() {
        const myPos = this.el.object3D.position;
        const out = [];
        (GAME.enemyHitboxes || []).forEach(h => {
            const el = h && h.userData && h.userData.el;
            if (!el || !el.object3D) return;
            const logic = el.components['enemy-logic'] || el.components['boss-logic'];
            if (!logic) return;
            const p = el.object3D.position;
            const dx = p.x - myPos.x, dz = p.z - myPos.z;
            if (dx * dx + dz * dz < this.def.radius * this.def.radius) out.push(logic);
        });
        return out;
    },

    tick: function() {
        if (!GAME.active || GAME.paused) return;
        const targets = this.enemiesInRange();
        if (targets.length === 0) return;

        if (this.data.type === 'tar') {
            targets.forEach(logic => {
                logic.slowUntil = Date.now() + 300;
                logic.slowFactor = this.def.slowFactor;
            });
            return;
        }

        const now = Date.now();
        if (now - this.lastFire < this.def.cooldown) return;
        this.lastFire = now;

        const pos = this.el.object3D.position;
        if (this.data.type === 'spike') {
            this.spikes.removeAttribute('animation__up');
            this.spikes.removeAttribute('animation__down');
            this.spikes.setAttribute('animation__up', 'property: position; to: 0 0 0; dur: 80; easing: easeOutQuad');
            setTimeout(() => {
                this.spikes.setAttribute('animation__down', 'property: position; to: 0 -1.2 0; dur: 400; easing: easeInQuad; delay: 250');
            }, 100);
            spawnExplosion(pos, 0xcccccc, 8);
        } else {
            spawnExplosion(pos, 0xff5500, 16);
            spawnExplosion(pos.clone().setY(0.8), 0xffaa00, 10);
        }

        setTimeout(() => {
            this.enemiesInRange().forEach(logic => {
                logic.hit(this.def.dmg);
                if (typeof spawnDamageText === 'function' && logic.el && logic.el.object3D) {
                    spawnDamageText(Math.round(this.def.dmg), logic.el.object3D.position, false, false);
                }
            });
        }, this.data.type === 'spike' ? 100 : 50);
    }
});

window.addEventListener('DOMContentLoaded', () => TRAP_SYSTEM.init());
