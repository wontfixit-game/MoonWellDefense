// ============================================================
//  TRAP SYSTEM — Orcs Must Die style mechanics
//  Depends on: PATH_WAYPOINTS and GAME from config.js
// ============================================================

const TRAP_DEFS = {
    spike: {
        name: 'Spike Trap', key: 'spike', cost: 100,
        width: 2.0, depth: 2.0, height: 0.12,
        dmg: 80, cooldown: 2500, radius: 2.0,
        desc: 'Floor spikes deal 80 dmg every 2.5s', icon: '&#9876;'
    },
    tar: {
        name: 'Tar Trap', key: 'tar', cost: 75,
        width: 3.0, depth: 3.0, height: 0.06,
        slow: 0.30, radius: 2.5,
        desc: 'Slows enemies by 70% while in range', icon: '&#9679;'
    },
    barricade: {
        name: 'Barricade', key: 'barricade', cost: 50,
        width: 2.5, depth: 0.4, height: 2.5,
        hp: 400, maxHp: 400,
        desc: 'Wood wall steers enemies off path (400 HP)', icon: '&#9646;'
    },
    arrow_wall: {
        name: 'Arrow Wall', key: 'arrow_wall', cost: 150,
        width: 0.6, depth: 0.6, height: 2.2,
        dmg: 50, rate: 1200, range: 8.0,
        desc: 'Auto-fires arrows at nearby enemies', icon: '&#8680;'
    },
    boom_barrel: {
        name: 'Boom Barrel', key: 'boom_barrel', cost: 200,
        width: 1.0, depth: 1.0, height: 1.2,
        dmg: 250, blastRadius: 4.5, oneshot: true,
        desc: 'One-time 250 AoE explosion on contact', icon: '&#128293;'
    }
};

// ----------------------------------------------------------------
//  Utility: is world point (x,z) within `threshold` meters of any
//  path segment across all lanes?
// ----------------------------------------------------------------
function isNearPath(x, z, threshold) {
    if (typeof PATH_WAYPOINTS === 'undefined') return false;
    for (const lane of PATH_WAYPOINTS) {
        for (let i = 0; i < lane.length - 1; i++) {
            const a = lane[i], b = lane[i + 1];
            const dx = b.x - a.x, dz = b.z - a.z;
            const lenSq = dx * dx + dz * dz;
            if (lenSq === 0) continue;
            let t = ((x - a.x) * dx + (z - a.z) * dz) / lenSq;
            t = Math.max(0, Math.min(1, t));
            const projX = a.x + t * dx, projZ = a.z + t * dz;
            if (Math.sqrt((x - projX) ** 2 + (z - projZ) ** 2) < threshold) return true;
        }
    }
    return false;
}

// ================================================================
//  TRAP PLACEMENT MANAGER
// ================================================================
const TrapPlacement = {
    active: false,
    selectedType: null,
    ghostEl: null,
    mouseX: 0, mouseY: 0,
    isValid: false,
    _mmHandler: null,
    _clickHandler: null,

    init: function () {
        this.ghostEl = document.createElement('a-entity');
        this.ghostEl.setAttribute('visible', false);
        this.ghostEl.id = 'trap-ghost';
        document.querySelector('a-scene').appendChild(this.ghostEl);
    },

    enableMode: function () {
        this._mmHandler = (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
            if (this.active) this._updateGhost();
        };
        this._clickHandler = (e) => {
            if (!this.active || !this.isValid || !GAME.prepPhase) return;
            if (e.target.closest('#prep-overlay') || e.target.closest('#hud-panel') ||
                e.target.closest('#minimap-container')) return;
            this._place();
        };
        document.addEventListener('mousemove', this._mmHandler);
        document.addEventListener('click', this._clickHandler);
    },

    disableMode: function () {
        this.active = false;
        this.selectedType = null;
        if (this.ghostEl) this.ghostEl.setAttribute('visible', false);
        document.querySelectorAll('.trap-btn').forEach(b => b.classList.remove('selected'));
        const info = document.getElementById('prep-selected-info');
        if (info) info.innerHTML = 'Select a trap above to place it on the path';
        if (this._mmHandler) document.removeEventListener('mousemove', this._mmHandler);
        if (this._clickHandler) document.removeEventListener('click', this._clickHandler);
    },

    select: function (type) {
        if (!TRAP_DEFS[type]) return;
        if (this.selectedType === type) { this.deselect(); return; }
        this.selectedType = type;
        this.active = true;
        this._buildGhostVisual();
        document.querySelectorAll('.trap-btn').forEach(b => b.classList.remove('selected'));
        const btn = document.getElementById('trap-btn-' + type);
        if (btn) btn.classList.add('selected');
        const def = TRAP_DEFS[type];
        const info = document.getElementById('prep-selected-info');
        if (info) info.innerHTML = '<b>' + def.name + '</b> &mdash; ' + def.desc +
            ' <span class="skull-cost">&#128128; ' + def.cost + '</span>';
    },

    deselect: function () {
        this.active = false;
        this.selectedType = null;
        if (this.ghostEl) this.ghostEl.setAttribute('visible', false);
        document.querySelectorAll('.trap-btn').forEach(b => b.classList.remove('selected'));
        const info = document.getElementById('prep-selected-info');
        if (info) info.innerHTML = 'Select a trap above to place it on the path';
    },

    _buildGhostVisual: function () {
        if (!this.ghostEl) return;
        while (this.ghostEl.firstChild) this.ghostEl.removeChild(this.ghostEl.firstChild);
        const def = TRAP_DEFS[this.selectedType];
        if (!def) return;

        const box = document.createElement('a-box');
        box.setAttribute('width', def.width);
        box.setAttribute('height', Math.max(def.height, 0.2));
        box.setAttribute('depth', def.depth);
        box.setAttribute('position', '0 0.1 0');
        box.setAttribute('material', 'color: #00ff88; transparent: true; opacity: 0.45; shader: flat; side: double');
        box.id = 'ghost-box';
        this.ghostEl.appendChild(box);

        const ring = document.createElement('a-torus');
        ring.setAttribute('radius', Math.max(def.width, def.depth) * 0.7);
        ring.setAttribute('radius-tubular', 0.07);
        ring.setAttribute('rotation', '90 0 0');
        ring.setAttribute('position', '0 0.04 0');
        ring.setAttribute('material', 'color: #00ff88; shader: flat; transparent: true; opacity: 0.9');
        ring.id = 'ghost-ring';
        this.ghostEl.appendChild(ring);

        this.ghostEl.setAttribute('visible', true);
    },

    _updateGhost: function () {
        if (!this.ghostEl || !this.active) return;
        const camEl = document.querySelector('a-camera');
        if (!camEl) return;
        const camera = camEl.getObject3D('camera');
        const mouse = new THREE.Vector2(
            (this.mouseX / window.innerWidth) * 2 - 1,
            -(this.mouseY / window.innerHeight) * 2 + 1
        );
        const rc = new THREE.Raycaster();
        rc.setFromCamera(mouse, camera);
        const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const pt = new THREE.Vector3();
        if (!rc.ray.intersectPlane(ground, pt)) return;

        const x = Math.round(pt.x / 2) * 2;
        const z = Math.round(pt.z / 2) * 2;
        this.ghostEl.object3D.position.set(x, 0, z);
        this.isValid = this._checkValid(x, z);

        const color = this.isValid ? '#00ff88' : '#ff3300';
        const box = document.getElementById('ghost-box');
        const ring = document.getElementById('ghost-ring');
        if (box) box.setAttribute('material',
            'color: ' + color + '; transparent: true; opacity: 0.45; shader: flat; side: double');
        if (ring) ring.setAttribute('material',
            'color: ' + color + '; shader: flat; transparent: true; opacity: 0.9');
    },

    _checkValid: function (x, z) {
        if (!isNearPath(x, z, 6)) return false;
        if (Math.sqrt(x * x + z * z) < 6) return false;
        for (const trap of GAME.placedTraps) {
            if (Math.sqrt((trap.x - x) ** 2 + (trap.z - z) ** 2) < 2.5) return false;
        }
        for (const obs of GAME.obstacles) {
            if (!obs.isTrap && Math.sqrt((obs.x - x) ** 2 + (obs.z - z) ** 2) < obs.r + 1.5) return false;
        }
        return true;
    },

    _place: function () {
        if (!this.isValid || !this.selectedType) return;
        const def = TRAP_DEFS[this.selectedType];
        if (GAME.skulls < def.cost) {
            const pp = document.querySelector('#player');
            if (pp && typeof spawnDamageText === 'function')
                spawnDamageText('Need ' + def.cost + ' Skulls', pp.object3D.position, true, false);
            return;
        }
        GAME.skulls -= def.cost;

        const pos = this.ghostEl.object3D.position.clone();
        const el = document.createElement('a-entity');
        el.setAttribute('position', pos.x + ' 0 ' + pos.z);

        // Component name: spike-trap, tar-trap, barricade-trap, arrow-wall-trap, boom-barrel-trap
        const compName = this.selectedType.replace('_', '-') + '-trap';
        el.setAttribute(compName, '');
        document.querySelector('a-scene').appendChild(el);

        const entry = { type: this.selectedType, x: pos.x, z: pos.z, el: el };
        GAME.placedTraps.push(entry);

        if (this.selectedType === 'barricade') {
            GAME.obstacles.push({ x: pos.x, z: pos.z, r: 1.5, isTrap: true });
        }

        if (typeof updateHUD === 'function') updateHUD();
        if (typeof spawnExplosion === 'function') spawnExplosion(pos, 0x00ff88, 8);
    }
};

// ================================================================
//  AFRAME TRAP COMPONENTS
// ================================================================

AFRAME.registerComponent('spike-trap', {
    init: function () {
        this.cooldown = 1200;
        const plate = document.createElement('a-box');
        plate.setAttribute('width', 2); plate.setAttribute('height', 0.12); plate.setAttribute('depth', 2);
        plate.setAttribute('color', '#777777');
        plate.setAttribute('shadow', 'receive: true');
        plate.setAttribute('position', '0 0.06 0');
        this.el.appendChild(plate);

        // Metal edge strips
        for (let i = 0; i < 4; i++) {
            const edge = document.createElement('a-box');
            const isX = i < 2;
            edge.setAttribute('width', isX ? 2.05 : 0.1);
            edge.setAttribute('height', 0.14);
            edge.setAttribute('depth', isX ? 0.1 : 2.05);
            edge.setAttribute('color', '#555555');
            edge.setAttribute('position', isX
                ? '0 0.07 ' + ((i === 0 ? 1 : -1) * 1.0)
                : ((i === 2 ? 1 : -1) * 1.0) + ' 0.07 0');
            this.el.appendChild(edge);
        }

        // Spikes in 3×3 grid
        this.spikes = [];
        for (let sx = -1; sx <= 1; sx++) {
            for (let sz = -1; sz <= 1; sz++) {
                const spike = document.createElement('a-cone');
                spike.setAttribute('radius-bottom', 0.09);
                spike.setAttribute('radius-top', 0.01);
                spike.setAttribute('height', 0.18);
                spike.setAttribute('color', '#cc8844');
                spike.setAttribute('position', sx * 0.6 + ' 0.15 ' + sz * 0.6);
                this.el.appendChild(spike);
                this.spikes.push(spike);
            }
        }

        this.triggerLight = document.createElement('a-light');
        this.triggerLight.setAttribute('type', 'point');
        this.triggerLight.setAttribute('color', '#ff4400');
        this.triggerLight.setAttribute('intensity', '0');
        this.triggerLight.setAttribute('distance', '5');
        this.triggerLight.setAttribute('position', '0 1 0');
        this.el.appendChild(this.triggerLight);
    },

    tick: function (t, dt) {
        if (!GAME.active || GAME.paused) return;
        this.cooldown -= dt;
        if (this.cooldown > 0) return;
        this.cooldown = 2500;
        this._trigger();
    },

    _trigger: function () {
        const myPos = this.el.object3D.position;
        let hit = false;
        GAME.enemyHitboxes.forEach(h => {
            const el = h.userData.el;
            if (el && el.object3D && el.components['enemy-logic']) {
                if (myPos.distanceTo(el.object3D.position) < 2.0) {
                    el.components['enemy-logic'].hit(80);
                    if (typeof spawnExplosion === 'function') spawnExplosion(el.object3D.position, 0xff4400, 4);
                    hit = true;
                }
            }
        });
        if (hit) {
            if (this.triggerLight) {
                this.triggerLight.setAttribute('intensity', '3');
                setTimeout(() => { if (this.triggerLight) this.triggerLight.setAttribute('intensity', '0'); }, 200);
            }
        }
        // Pop spikes
        this.spikes.forEach((s, i) => {
            setTimeout(() => {
                if (s.object3D) {
                    s.object3D.position.y = 0.7;
                    setTimeout(() => { if (s.object3D) s.object3D.position.y = 0.15; }, 100);
                }
            }, i * 12);
        });
    }
});

AFRAME.registerComponent('tar-trap', {
    init: function () {
        const circle = document.createElement('a-cylinder');
        circle.setAttribute('radius', 2.5); circle.setAttribute('height', 0.07);
        circle.setAttribute('color', '#150800');
        circle.setAttribute('material', 'transparent: true; opacity: 0.92; roughness: 1');
        circle.setAttribute('shadow', 'receive: true');
        circle.setAttribute('position', '0 0.035 0');
        this.el.appendChild(circle);

        for (let i = 0; i < 3; i++) {
            const ring = document.createElement('a-torus');
            ring.setAttribute('radius', 0.5 + i * 0.7);
            ring.setAttribute('radius-tubular', 0.055);
            ring.setAttribute('rotation', '90 0 0');
            ring.setAttribute('position', '0 0.09 0');
            ring.setAttribute('color', '#331100');
            ring.setAttribute('material', 'shader: flat; transparent: true; opacity: 0.5');
            this.el.appendChild(ring);
        }
    },

    tick: function (t, dt) {
        if (!GAME.active || GAME.paused) return;
        const myPos = this.el.object3D.position;
        GAME.enemyHitboxes.forEach(h => {
            const el = h.userData.el;
            if (el && el.object3D && el.components['enemy-logic']) {
                if (myPos.distanceTo(el.object3D.position) < 2.5) {
                    el.components['enemy-logic'].applyTar();
                }
            }
        });
    }
});

AFRAME.registerComponent('barricade-trap', {
    init: function () {
        this.hp = 400;
        this.maxHp = 400;
        this._dmgCooldown = 0;

        const wall = document.createElement('a-box');
        wall.setAttribute('width', 2.5); wall.setAttribute('height', 2.5); wall.setAttribute('depth', 0.4);
        wall.setAttribute('color', '#7B4A2D');
        wall.setAttribute('shadow', 'cast: true; receive: true');
        wall.setAttribute('position', '0 1.25 0');
        this.wallEl = wall;
        this.el.appendChild(wall);

        // Wood plank lines
        for (let i = 0; i < 3; i++) {
            const plank = document.createElement('a-box');
            plank.setAttribute('width', 2.6); plank.setAttribute('height', 0.1); plank.setAttribute('depth', 0.45);
            plank.setAttribute('color', '#5a3520');
            plank.setAttribute('position', '0 ' + (0.45 + i * 0.82) + ' 0');
            this.el.appendChild(plank);
        }

        // HP bar background
        const hpBg = document.createElement('a-plane');
        hpBg.setAttribute('width', 2.5); hpBg.setAttribute('height', 0.2);
        hpBg.setAttribute('color', '#330000'); hpBg.setAttribute('position', '0 2.9 0');
        hpBg.setAttribute('material', 'shader: flat; side: double');
        this.el.appendChild(hpBg);

        this.hpBar = document.createElement('a-plane');
        this.hpBar.setAttribute('width', 2.5); this.hpBar.setAttribute('height', 0.2);
        this.hpBar.setAttribute('color', '#00cc44'); this.hpBar.setAttribute('position', '0 2.9 0.01');
        this.hpBar.setAttribute('material', 'shader: flat; side: double');
        this.el.appendChild(this.hpBar);
    },

    tick: function (t, dt) {
        if (!GAME.active || GAME.paused) return;
        this._dmgCooldown -= dt;
        if (this._dmgCooldown > 0) return;
        const myPos = this.el.object3D.position;
        let took = false;
        GAME.enemyHitboxes.forEach(h => {
            const el = h.userData.el;
            if (el && el.object3D && el.components['enemy-logic']) {
                if (myPos.distanceTo(el.object3D.position) < 1.3) {
                    took = true;
                }
            }
        });
        if (took) {
            this._dmgCooldown = 500;
            this.hit(25);
        }
    },

    hit: function (dmg) {
        if (!this.el || !this.el.parentNode) return;
        this.hp -= dmg;
        const pct = Math.max(0, this.hp / this.maxHp);
        if (this.hpBar) {
            this.hpBar.setAttribute('width', 2.5 * pct);
            this.hpBar.setAttribute('color', pct > 0.5 ? '#00cc44' : pct > 0.25 ? '#ffaa00' : '#ff2200');
        }
        if (this.wallEl) {
            this.wallEl.setAttribute('color', '#ffffff');
            setTimeout(() => { if (this.wallEl) this.wallEl.setAttribute('color', '#7B4A2D'); }, 110);
        }
        if (this.hp <= 0) {
            const oi = GAME.obstacles.findIndex(o => o.isTrap &&
                Math.abs(o.x - this.el.object3D.position.x) < 0.6 &&
                Math.abs(o.z - this.el.object3D.position.z) < 0.6);
            if (oi > -1) GAME.obstacles.splice(oi, 1);
            const ti = GAME.placedTraps.findIndex(t => t.el === this.el);
            if (ti > -1) GAME.placedTraps.splice(ti, 1);
            if (typeof spawnExplosion === 'function') spawnExplosion(this.el.object3D.position, 0x885522, 12);
            if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
        }
    }
});

AFRAME.registerComponent('arrow-wall-trap', {
    init: function () {
        this.shotTimer = 0;

        const post = document.createElement('a-box');
        post.setAttribute('width', 0.55); post.setAttribute('height', 2.3); post.setAttribute('depth', 0.55);
        post.setAttribute('color', '#445566');
        post.setAttribute('shadow', 'cast: true');
        post.setAttribute('position', '0 1.15 0');
        this.el.appendChild(post);

        for (let i = 0; i < 3; i++) {
            const slit = document.createElement('a-box');
            slit.setAttribute('width', 0.14); slit.setAttribute('height', 0.3); slit.setAttribute('depth', 0.6);
            slit.setAttribute('color', '#001133');
            slit.setAttribute('position', '0 ' + (0.5 + i * 0.62) + ' 0');
            this.el.appendChild(slit);
        }

        this.fireLight = document.createElement('a-light');
        this.fireLight.setAttribute('type', 'point'); this.fireLight.setAttribute('color', '#0066ff');
        this.fireLight.setAttribute('intensity', '0.5'); this.fireLight.setAttribute('distance', '6');
        this.fireLight.setAttribute('position', '0 1 0');
        this.el.appendChild(this.fireLight);
    },

    tick: function (t, dt) {
        if (!GAME.active || GAME.paused) return;
        this.shotTimer -= dt;
        if (this.shotTimer > 0) return;

        const myPos = this.el.object3D.position;
        let nearest = null, minDist = 8.0;
        GAME.enemyHitboxes.forEach(h => {
            const el = h.userData.el;
            if (el && el.components['enemy-logic']) {
                const d = myPos.distanceTo(el.object3D.position);
                if (d < minDist) { minDist = d; nearest = el; }
            }
        });

        if (nearest) {
            this.shotTimer = 1200;
            this._fireAt(nearest, myPos);
            if (this.fireLight) {
                this.fireLight.setAttribute('intensity', '2.5');
                setTimeout(() => { if (this.fireLight) this.fireLight.setAttribute('intensity', '0.5'); }, 150);
            }
        }
    },

    _fireAt: function (target, fromPos) {
        const origin = fromPos.clone(); origin.y += 1.1;
        const targetPos = target.object3D.position.clone(); targetPos.y += 1.0;
        const dir = new THREE.Vector3().subVectors(targetPos, origin).normalize();

        const arrow = document.createElement('a-entity');
        arrow.setAttribute('position', origin.x + ' ' + origin.y + ' ' + origin.z);
        // Orient the arrow entity toward the target
        arrow.object3D.lookAt(targetPos);

        const shaft = document.createElement('a-cylinder');
        shaft.setAttribute('radius', 0.055); shaft.setAttribute('height', 0.8);
        shaft.setAttribute('rotation', '90 0 0'); shaft.setAttribute('color', '#cc8844');
        arrow.appendChild(shaft);

        arrow.setAttribute('trap-arrow',
            'dirX: ' + dir.x + '; dirY: ' + dir.y + '; dirZ: ' + dir.z + '; damage: 50');
        this.el.sceneEl.appendChild(arrow);
    }
});

AFRAME.registerComponent('trap-arrow', {
    schema: {
        dirX: { type: 'number' }, dirY: { type: 'number' }, dirZ: { type: 'number' },
        damage: { type: 'number', default: 50 }
    },
    init: function () { this.life = 2.0; this.speed = 18; this._hit = false; },
    tick: function (t, dt) {
        if (!GAME.active || this._hit) return;
        const d = dt / 1000;
        this.life -= d;
        if (this.life <= 0) { this.el.remove(); return; }
        const pos = this.el.object3D.position;
        pos.x += this.data.dirX * this.speed * d;
        pos.y += this.data.dirY * this.speed * d;
        pos.z += this.data.dirZ * this.speed * d;
        if (pos.y < 0.05) { this.el.remove(); return; }
        for (const h of GAME.enemyHitboxes) {
            if (this._hit) break;
            const el = h.userData.el;
            if (el && el.components['enemy-logic']) {
                if (pos.distanceTo(el.object3D.position) < 1.3) {
                    el.components['enemy-logic'].hit(this.data.damage);
                    if (typeof spawnExplosion === 'function') spawnExplosion(pos.clone(), 0xffaa44, 4);
                    this._hit = true;
                    this.el.remove();
                }
            }
        }
    }
});

AFRAME.registerComponent('boom-barrel-trap', {
    init: function () {
        this.triggered = false;
        this.triggerRadius = 2.0;

        const body = document.createElement('a-cylinder');
        body.setAttribute('radius', 0.5); body.setAttribute('height', 1.2);
        body.setAttribute('color', '#8B3A00');
        body.setAttribute('shadow', 'cast: true');
        body.setAttribute('position', '0 0.6 0');
        this.el.appendChild(body);

        for (let i = 0; i < 3; i++) {
            const band = document.createElement('a-torus');
            band.setAttribute('radius', 0.52); band.setAttribute('radius-tubular', 0.055);
            band.setAttribute('rotation', '0 0 0');
            band.setAttribute('position', '0 ' + (0.15 + i * 0.4) + ' 0');
            band.setAttribute('material', 'shader: flat; color: #333333');
            this.el.appendChild(band);
        }

        const dangerRing = document.createElement('a-torus');
        dangerRing.setAttribute('radius', 2.2); dangerRing.setAttribute('radius-tubular', 0.08);
        dangerRing.setAttribute('rotation', '90 0 0'); dangerRing.setAttribute('position', '0 0.04 0');
        dangerRing.setAttribute('material', 'shader: flat; color: #ff4400; transparent: true; opacity: 0.5');
        dangerRing.setAttribute('animation',
            'property: material.opacity; from: 0.5; to: 0.1; dir: alternate; dur: 700; loop: true');
        this.el.appendChild(dangerRing);

        const glow = document.createElement('a-light');
        glow.setAttribute('type', 'point'); glow.setAttribute('color', '#ff4400');
        glow.setAttribute('intensity', '0.7'); glow.setAttribute('distance', '4');
        glow.setAttribute('position', '0 1 0');
        this.el.appendChild(glow);
    },

    tick: function (t, dt) {
        if (!GAME.active || GAME.paused || this.triggered) return;
        const myPos = this.el.object3D.position;
        for (const h of GAME.enemyHitboxes) {
            const el = h.userData.el;
            if (el && el.object3D && myPos.distanceTo(el.object3D.position) < this.triggerRadius) {
                this._explode(); return;
            }
        }
    },

    _explode: function () {
        this.triggered = true;
        const myPos = this.el.object3D.position.clone();
        if (typeof spawnExplosion === 'function') {
            spawnExplosion(myPos, 0xff4400, 40);
            spawnExplosion(myPos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffff00, 20);
            spawnExplosion(myPos.clone().add(new THREE.Vector3(0, 2.5, 0)), 0xff8800, 15);
        }
        if (typeof triggerCameraShake === 'function') triggerCameraShake(0.4, 600);
        if (typeof spawnDamageText === 'function') spawnDamageText('BOOM!', myPos, true, false);

        GAME.enemyHitboxes.forEach(h => {
            const el = h.userData.el;
            if (el && el.object3D) {
                const d = myPos.distanceTo(el.object3D.position);
                if (d < 4.5) {
                    const dmg = Math.round(250 * (1 - d / 4.5));
                    if (el.components['enemy-logic']) el.components['enemy-logic'].hit(dmg);
                    if (el.components['boss-logic']) el.components['boss-logic'].hit(dmg);
                }
            }
        });

        const ti = GAME.placedTraps.findIndex(t => t.el === this.el);
        if (ti > -1) GAME.placedTraps.splice(ti, 1);
        if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
    }
});

// ----------------------------------------------------------------
//  Global helper for UI
// ----------------------------------------------------------------
function selectTrap(type) {
    if (GAME.prepPhase) TrapPlacement.select(type);
}

// Init after scene loads
document.addEventListener('DOMContentLoaded', () => {
    const scene = document.querySelector('a-scene');
    if (scene) {
        scene.addEventListener('loaded', () => { TrapPlacement.init(); });
    }
});
