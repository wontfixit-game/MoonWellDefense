// Orcs Must Die style trap placement & combat system
const TRAP_TYPES = {
    spike: {
        id: 'spike', name: 'Spike Trap', cost: 250, sellRefund: 0.75,
        color: '#888888', size: 1.8, cooldown: 2000, damage: 120,
        desc: 'Pops up and impales enemies'
    },
    tar: {
        id: 'tar', name: 'Tar Trap', cost: 350, sellRefund: 0.75,
        color: '#3d2817', size: 2.0, slowFactor: 0.35, slowDuration: 1500,
        desc: 'Slows enemies crossing it'
    },
    spring: {
        id: 'spring', name: 'Spring Trap', cost: 400, sellRefund: 0.75,
        color: '#cc6600', size: 1.6, knockback: 12, cooldown: 3000, damage: 40,
        desc: 'Launches enemies backward'
    },
    arrowwall: {
        id: 'arrowwall', name: 'Arrow Wall', cost: 500, sellRefund: 0.75,
        color: '#664422', size: 2.2, range: 14, fireRate: 1200, damage: 65,
        desc: 'Fires arrows at nearby foes'
    },
    barricade: {
        id: 'barricade', name: 'Barricade', cost: 150, sellRefund: 0.75,
        color: '#5c4033', size: 2.0, hp: 400,
        desc: 'Blocks enemy paths'
    },
    blades: {
        id: 'blades', name: 'Wall Blades', cost: 600, sellRefund: 0.75,
        color: '#aaaaaa', size: 2.0, range: 3.5, tickRate: 500, damage: 45,
        desc: 'Spinning blades shred nearby foes'
    }
};

const TRAP_HOTBAR = ['spike', 'tar', 'spring', 'arrowwall', 'barricade', 'blades'];

const TRAP_SYSTEM = {
    selectedType: 'spike',
    previewEl: null,
    buildPhase: false,

    init: function() {
        (GAME.traps || []).slice().forEach(t => this.removeTrap(t));
        GAME.traps = GAME.traps || [];
        this.createPreview();
        this.setupHotbar();
    },

    setupHotbar: function() {
        const bar = document.getElementById('trap-hotbar');
        if (!bar) return;
        bar.innerHTML = '';
        TRAP_HOTBAR.forEach((typeId, i) => {
            const t = TRAP_TYPES[typeId];
            const slot = document.createElement('div');
            slot.className = 'trap-slot' + (typeId === this.selectedType ? ' active' : '');
            slot.dataset.type = typeId;
            slot.innerHTML = `<span class="trap-key">${i + 1}</span><span class="trap-name">${t.name}</span><span class="trap-cost">${t.cost}c</span>`;
            slot.onclick = () => { this.selectType(typeId); };
            bar.appendChild(slot);
        });
    },

    selectType: function(typeId) {
        if (!TRAP_TYPES[typeId]) return;
        this.selectedType = typeId;
        document.querySelectorAll('.trap-slot').forEach(s => {
            s.classList.toggle('active', s.dataset.type === typeId);
        });
    },

    createPreview: function() {
        const scene = document.querySelector('a-scene');
        if (!scene || this.previewEl) return;
        this.previewEl = document.createElement('a-entity');
        this.previewEl.setAttribute('id', 'trap-preview');
        this.previewEl.setAttribute('visible', 'false');
        scene.appendChild(this.previewEl);
    },

    enterBuildPhase: function() {
        this.buildPhase = true;
        GAME.inBuildPhase = true;
        GAME.active = false;
        document.exitPointerLock();
        const panel = document.getElementById('build-phase-panel');
        if (panel) panel.style.display = 'flex';
        const hotbar = document.getElementById('trap-hotbar');
        if (hotbar) hotbar.style.display = 'flex';
        this.updateBuildUI();
        this.setupHotbar();
    },

    exitBuildPhase: function() {
        this.buildPhase = false;
        GAME.inBuildPhase = false;
        const panel = document.getElementById('build-phase-panel');
        if (panel) panel.style.display = 'none';
        const hotbar = document.getElementById('trap-hotbar');
        if (hotbar) hotbar.style.display = 'none';
        if (this.previewEl) this.previewEl.setAttribute('visible', 'false');
    },

    updateBuildUI: function() {
        const el = document.getElementById('build-coin-text');
        if (el) el.innerText = GAME.gems;
        const trapCount = document.getElementById('trap-count-text');
        if (trapCount) trapCount.innerText = (GAME.traps || []).length;
    },

    snapPos: function(x, z) {
        const grid = 2;
        return { x: Math.round(x / grid) * grid, z: Math.round(z / grid) * grid };
    },

    canPlaceAt: function(x, z) {
        const dist = Math.sqrt(x * x + z * z);
        if (dist < 6) return false;
        if (dist > 72) return false;
        for (const trap of GAME.traps) {
            const d = Math.sqrt((trap.x - x) ** 2 + (trap.z - z) ** 2);
            if (d < 1.5) return false;
        }
        return true;
    },

    getPlacementPos: function(playerEl) {
        const ctrl = playerEl.components['universal-controls'];
        if (!ctrl) return null;
        const ray = ctrl.raycaster;
        const cam = ctrl.camera.getObject3D('camera');
        const mouse = new THREE.Vector2(0, -0.15);
        if (ctrl.camMode === 2) {
            mouse.x = 0;
            mouse.y = 0;
        }
        ray.setFromCamera(mouse, cam);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const hit = new THREE.Vector3();
        if (!ray.ray.intersectPlane(plane, hit)) {
            const pPos = playerEl.object3D.position;
            const dir = new THREE.Vector3();
            playerEl.object3D.getWorldDirection(dir);
            hit.set(pPos.x + dir.x * 4, 0, pPos.z + dir.z * 4);
        }
        const snapped = this.snapPos(hit.x, hit.z);
        return { x: snapped.x, z: snapped.z, valid: this.canPlaceAt(snapped.x, snapped.z) };
    },

    updatePreview: function(playerEl) {
        if (!this.buildPhase && !GAME.active) return;
        if (!this.previewEl) this.createPreview();
        const pos = this.getPlacementPos(playerEl);
        if (!pos) return;
        const t = TRAP_TYPES[this.selectedType];
        const valid = pos.valid;
        const color = valid ? t.color : '#ff0000';
        this.previewEl.setAttribute('visible', 'true');
        this.previewEl.setAttribute('position', `${pos.x} 0.05 ${pos.z}`);
        this.previewEl.innerHTML = '';
        const base = document.createElement('a-box');
        base.setAttribute('width', t.size);
        base.setAttribute('height', '0.15');
        base.setAttribute('depth', t.size);
        base.setAttribute('material', `color: ${color}; opacity: 0.55; transparent: true; shader: flat`);
        base.setAttribute('position', '0 0.08 0');
        this.previewEl.appendChild(base);
        if (this.selectedType === 'arrowwall' || this.selectedType === 'blades') {
            const wall = document.createElement('a-box');
            wall.setAttribute('width', '0.3');
            wall.setAttribute('height', '1.5');
            wall.setAttribute('depth', t.size);
            wall.setAttribute('material', `color: ${color}; opacity: 0.7; transparent: true; shader: flat`);
            wall.setAttribute('position', '0 0.75 0');
            this.previewEl.appendChild(wall);
        }
    },

    placeTrap: function(playerEl) {
        if (!GAME.inBuildPhase) {
            spawnDamageText('Build phase only', playerEl.object3D.position, true, false);
            return false;
        }
        const typeId = this.selectedType;
        const t = TRAP_TYPES[typeId];
        if (!t) return false;
        if (GAME.gems < t.cost) {
            spawnDamageText(`Need ${t.cost} Coins`, playerEl.object3D.position, true, false);
            return false;
        }
        const pos = this.getPlacementPos(playerEl);
        if (!pos || !pos.valid) {
            spawnDamageText('Invalid placement', playerEl.object3D.position, true, false);
            return false;
        }
        GAME.gems -= t.cost;
        updateHUD();
        this.spawnTrap(typeId, pos.x, pos.z);
        this.updateBuildUI();
        if (playerEl.components['universal-controls']) playerEl.components['universal-controls'].playInteract();
        return true;
    },

    spawnTrap: function(typeId, x, z) {
        const t = TRAP_TYPES[typeId];
        const el = document.createElement('a-entity');
        el.setAttribute('position', `${x} 0 ${z}`);
        el.setAttribute('trap-logic', `type: ${typeId}`);
        document.querySelector('a-scene').appendChild(el);
        const trapData = {
            el, type: typeId, x, z,
            armed: true, cooldown: 0, hp: t.hp || 9999,
            lastFire: 0, lastBlade: 0
        };
        GAME.traps.push(trapData);
        if (typeId === 'barricade') {
            GAME.obstacles.push({ x, z, r: 1.2, trapRef: trapData });
        }
        spawnExplosion(new THREE.Vector3(x, 0.5, z), parseInt(t.color.replace('#', ''), 16) || 0x888888, 6);
        return trapData;
    },

    sellTrapAt: function(playerEl) {
        let closest = null, minD = 4;
        for (const trap of GAME.traps) {
            const d = playerEl.object3D.position.distanceTo(trap.el.object3D.position);
            if (d < minD) { minD = d; closest = trap; }
        }
        if (!closest) {
            spawnDamageText('No trap nearby', playerEl.object3D.position, true, false);
            return false;
        }
        const t = TRAP_TYPES[closest.type];
        const refund = Math.floor(t.cost * t.sellRefund);
        GAME.gems += refund;
        this.removeTrap(closest);
        updateHUD();
        this.updateBuildUI();
        spawnDamageText(`+${refund} Coins`, playerEl.object3D.position, false, true);
        return true;
    },

    removeTrap: function(trapData) {
        const idx = GAME.traps.indexOf(trapData);
        if (idx > -1) GAME.traps.splice(idx, 1);
        const obsIdx = GAME.obstacles.findIndex(o => o.trapRef === trapData);
        if (obsIdx > -1) GAME.obstacles.splice(obsIdx, 1);
        if (trapData.el.parentNode) trapData.el.parentNode.removeChild(trapData.el);
    },

    tickTraps: function(dt) {
        if (!GAME.traps) return;
        GAME.traps.forEach(trap => {
            const t = TRAP_TYPES[trap.type];
            if (!t || !trap.el) return;
            if (trap.cooldown > 0) trap.cooldown -= dt;

            if (trap.type === 'arrowwall' && trap.cooldown <= 0) {
                this.fireArrowWall(trap, t);
            }
            if (trap.type === 'blades') {
                trap.lastBlade = (trap.lastBlade || 0) + dt;
                if (trap.lastBlade >= t.tickRate) {
                    trap.lastBlade = 0;
                    this.bladeDamage(trap, t);
                }
            }
            if (trap.type === 'tar') {
                this.applyTar(trap, t);
            }
        });
    },

    getEnemiesNear: function(x, z, range) {
        const results = [];
        GAME.enemyHitboxes.forEach(hb => {
            if (!hb || !hb.userData || !hb.userData.el) return;
            const el = hb.userData.el;
            const logic = el.components['enemy-logic'] || el.components['boss-logic'];
            if (!logic || (logic.isDead === true)) return;
            const pos = el.object3D.position;
            const d = Math.sqrt((pos.x - x) ** 2 + (pos.z - z) ** 2);
            if (d <= range) results.push({ el, logic, dist: d, pos });
        });
        return results;
    },

    triggerSpike: function(trap, t) {
        if (!trap.armed || trap.cooldown > 0) return;
        const nearby = this.getEnemiesNear(trap.x, trap.z, t.size * 0.6);
        if (nearby.length === 0) return;
        trap.armed = false;
        trap.cooldown = t.cooldown;
        const mesh = trap.el.querySelector('.spike-mesh');
        if (mesh) {
            mesh.setAttribute('animation', 'property: position; to: 0 0.6 0; dur: 120; easing: easeOutQuad');
            setTimeout(() => {
                if (mesh) mesh.setAttribute('animation', 'property: position; to: 0 0.05 0; dur: 200; easing: easeInQuad');
            }, 400);
        }
        nearby.forEach(({ logic }) => logic.hit(t.damage));
        spawnExplosion(new THREE.Vector3(trap.x, 0.3, trap.z), 0x888888, 4);
        setTimeout(() => { trap.armed = true; }, t.cooldown);
    },

    triggerSpring: function(trap, t, enemyEl, logic) {
        if (!trap.armed || trap.cooldown > 0) return;
        trap.armed = false;
        trap.cooldown = t.cooldown;
        const rift = document.getElementById('moon-well');
        const riftPos = rift ? rift.object3D.position : new THREE.Vector3(0, 0, 0);
        const ePos = enemyEl.object3D.position;
        const away = new THREE.Vector3().subVectors(ePos, riftPos).normalize();
        enemyEl.object3D.position.add(away.multiplyScalar(t.knockback));
        logic.hit(t.damage);
        const pad = trap.el.querySelector('.spring-mesh');
        if (pad) pad.setAttribute('animation', 'property: position; to: 0 0.8 0; dur: 150; dir: alternate; loop: 1');
        setTimeout(() => { trap.armed = true; }, t.cooldown);
    },

    fireArrowWall: function(trap, t) {
        const nearby = this.getEnemiesNear(trap.x, trap.z, t.range);
        if (nearby.length === 0) return;
        nearby.sort((a, b) => a.dist - b.dist);
        const target = nearby[0];
        trap.cooldown = t.fireRate;
        const start = new THREE.Vector3(trap.x, 1.2, trap.z);
        const end = target.pos.clone();
        end.y = 1.2;
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const arrow = document.createElement('a-entity');
        arrow.setAttribute('position', `${start.x} ${start.y} ${start.z}`);
        const mesh = document.createElement('a-cylinder');
        mesh.setAttribute('radius', '0.06');
        mesh.setAttribute('height', '0.5');
        mesh.setAttribute('material', 'color: #8B4513; shader: flat');
        mesh.setAttribute('rotation', '90 0 0');
        arrow.appendChild(mesh);
        arrow.setAttribute('trap-arrow', {
            damage: t.damage,
            dirX: dir.x, dirY: dir.y, dirZ: dir.z,
            speed: 18
        });
        document.querySelector('a-scene').appendChild(arrow);
    },

    bladeDamage: function(trap, t) {
        const nearby = this.getEnemiesNear(trap.x, trap.z, t.range);
        const blades = trap.el.querySelector('.blade-mesh');
        if (blades) blades.setAttribute('rotation', `0 ${(Date.now() / 5) % 360} 0`);
        nearby.forEach(({ logic }) => logic.hit(t.damage));
        if (nearby.length > 0) spawnExplosion(new THREE.Vector3(trap.x, 1, trap.z), 0xcccccc, 3);
    },

    applyTar: function(trap, t) {
        const nearby = this.getEnemiesNear(trap.x, trap.z, t.size * 0.55);
        nearby.forEach(({ logic }) => {
            if (logic.slowTimer !== undefined) {
                logic.slowFactor = t.slowFactor;
                logic.slowTimer = t.slowDuration;
            }
        });
    },

    checkEnemyOnTraps: function(enemyEl, logic) {
        if (!GAME.traps || logic.isDead) return;
        const pos = enemyEl.object3D.position;
        GAME.traps.forEach(trap => {
            const t = TRAP_TYPES[trap.type];
            const d = Math.sqrt((pos.x - trap.x) ** 2 + (pos.z - trap.z) ** 2);
            if (trap.type === 'spike' && d < t.size * 0.5) this.triggerSpike(trap, t);
            if (trap.type === 'spring' && d < t.size * 0.5) this.triggerSpring(trap, t, enemyEl, logic);
            if (trap.type === 'barricade' && d < t.size * 0.5) {
                const away = new THREE.Vector3(pos.x - trap.x, 0, pos.z - trap.z).normalize();
                pos.add(away.multiplyScalar(0.15));
            }
        });
    }
};

// Trap visual entity component
AFRAME.registerComponent('trap-logic', {
    schema: { type: { type: 'string', default: 'spike' } },
    init: function() {
        const t = TRAP_TYPES[this.data.type];
        if (!t) return;
        const el = this.el;
        // Floor base
        const base = document.createElement('a-box');
        base.setAttribute('width', t.size);
        base.setAttribute('height', '0.12');
        base.setAttribute('depth', t.size);
        base.setAttribute('material', `color: ${t.color}; roughness: 0.9; shader: standard`);
        base.setAttribute('position', '0 0.06 0');
        base.setAttribute('shadow', 'cast: true; receive: true');
        el.appendChild(base);

        if (this.data.type === 'spike') {
            const spike = document.createElement('a-cone');
            spike.classList.add('spike-mesh');
            spike.setAttribute('radius-bottom', '0.25');
            spike.setAttribute('radius-top', '0.02');
            spike.setAttribute('height', '0.5');
            spike.setAttribute('material', 'color: #666666; metalness: 0.8; roughness: 0.3; shader: standard');
            spike.setAttribute('position', '0 0.05 0');
            el.appendChild(spike);
        } else if (this.data.type === 'tar') {
            const tar = document.createElement('a-cylinder');
            tar.setAttribute('radius', t.size * 0.45);
            tar.setAttribute('height', '0.08');
            tar.setAttribute('material', 'color: #2a1a0a; opacity: 0.85; transparent: true; shader: flat');
            tar.setAttribute('position', '0 0.04 0');
            el.appendChild(tar);
        } else if (this.data.type === 'spring') {
            const pad = document.createElement('a-cylinder');
            pad.classList.add('spring-mesh');
            pad.setAttribute('radius', t.size * 0.4);
            pad.setAttribute('height', '0.2');
            pad.setAttribute('material', 'color: #ff8800; shader: flat');
            pad.setAttribute('position', '0 0.1 0');
            el.appendChild(pad);
        } else if (this.data.type === 'arrowwall') {
            const wall = document.createElement('a-box');
            wall.setAttribute('width', '0.25');
            wall.setAttribute('height', '1.8');
            wall.setAttribute('depth', t.size);
            wall.setAttribute('material', 'color: #5c3a1e; shader: standard');
            wall.setAttribute('position', '0 0.9 0');
            el.appendChild(wall);
            for (let i = -1; i <= 1; i++) {
                const hole = document.createElement('a-cylinder');
                hole.setAttribute('radius', '0.08');
                hole.setAttribute('height', '0.3');
                hole.setAttribute('material', 'color: #111; shader: flat');
                hole.setAttribute('position', `${i * 0.5} 1.2 0`);
                hole.setAttribute('rotation', '90 0 0');
                el.appendChild(hole);
            }
        } else if (this.data.type === 'barricade') {
            const plank = document.createElement('a-box');
            plank.setAttribute('width', t.size);
            plank.setAttribute('height', '1.4');
            plank.setAttribute('depth', '0.2');
            plank.setAttribute('material', 'color: #6b4423; shader: standard');
            plank.setAttribute('position', '0 0.7 0');
            el.appendChild(plank);
        } else if (this.data.type === 'blades') {
            const frame = document.createElement('a-box');
            frame.setAttribute('width', '0.2');
            frame.setAttribute('height', '1.6');
            frame.setAttribute('depth', t.size);
            frame.setAttribute('material', 'color: #444; shader: standard');
            frame.setAttribute('position', '0 0.8 0');
            el.appendChild(frame);
            const blade = document.createElement('a-box');
            blade.classList.add('blade-mesh');
            blade.setAttribute('width', '1.6');
            blade.setAttribute('height', '0.08');
            blade.setAttribute('depth', '0.4');
            blade.setAttribute('material', 'color: #ddd; metalness: 0.9; roughness: 0.2; shader: standard');
            blade.setAttribute('position', '0 1.0 0.2');
            el.appendChild(blade);
        }
    }
});

// Trap arrow projectile
AFRAME.registerComponent('trap-arrow', {
    schema: {
        damage: { type: 'number', default: 50 },
        speed: { type: 'number', default: 18 },
        dirX: { type: 'number' }, dirY: { type: 'number' }, dirZ: { type: 'number' }
    },
    init: function() {
        this.dir = new THREE.Vector3(this.data.dirX, this.data.dirY, this.data.dirZ).normalize();
        this.life = 2000;
    },
    tick: function(t, dt) {
        this.life -= dt;
        if (this.life <= 0) { this.el.parentNode.removeChild(this.el); return; }
        const move = this.dir.clone().multiplyScalar(this.data.speed * (dt / 1000));
        this.el.object3D.position.add(move);
        const pos = this.el.object3D.position;
        for (const hb of GAME.enemyHitboxes) {
            if (!hb || !hb.userData || !hb.userData.el) continue;
            const el = hb.userData.el;
            const logic = el.components['enemy-logic'] || el.components['boss-logic'];
            if (!logic || (logic.isDead)) continue;
            if (pos.distanceTo(el.object3D.position) < 1.5) {
                logic.hit(this.data.damage);
                this.el.parentNode.removeChild(this.el);
                return;
            }
        }
    }
});
