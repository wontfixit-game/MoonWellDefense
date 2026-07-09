// Orcs-Must-Die-style trap building: place defenses that auto-trigger on enemies.
AFRAME.registerComponent('trap-logic', {
    schema: { trapType: { type: 'string' } },
    init: function() {
        this.def = TRAPS[this.data.trapType];
        this.cooldown = 0;
        this.buildVisual();
        GAME.traps.push(this.el);
    },
    remove: function() {
        const idx = GAME.traps.indexOf(this.el);
        if (idx > -1) GAME.traps.splice(idx, 1);
    },
    buildVisual: function() {
        const type = this.data.trapType;
        const group = document.createElement('a-entity');
        if (type === 'spike') {
            for (let i = 0; i < 5; i++) {
                const cone = document.createElement('a-cone');
                const r = i === 0 ? 0 : 0.45;
                const ang = (i / 5) * Math.PI * 2;
                cone.setAttribute('radius-bottom', 0.16);
                cone.setAttribute('radius-top', 0.01);
                cone.setAttribute('height', 0.45);
                cone.setAttribute('position', `${Math.cos(ang) * r} 0.22 ${Math.sin(ang) * r}`);
                cone.setAttribute('material', 'color: #999999; metalness: 0.6; roughness: 0.35');
                cone.setAttribute('shadow', 'cast: true');
                group.appendChild(cone);
            }
        } else if (type === 'tar') {
            const disc = document.createElement('a-cylinder');
            disc.setAttribute('radius', this.def.radius);
            disc.setAttribute('height', 0.04);
            disc.setAttribute('material', 'color: #1a1005; roughness: 1; opacity: 0.92; transparent: true');
            group.appendChild(disc);
        } else if (type === 'arrow') {
            const post = document.createElement('a-box');
            post.setAttribute('width', 0.28); post.setAttribute('height', 1.2); post.setAttribute('depth', 0.28);
            post.setAttribute('position', '0 0.6 0'); post.setAttribute('material', 'color: #6b4226');
            post.setAttribute('shadow', 'cast: true');
            const bar = document.createElement('a-box');
            bar.setAttribute('width', 1.3); bar.setAttribute('height', 0.14); bar.setAttribute('depth', 0.14);
            bar.setAttribute('position', '0 1.1 0'); bar.setAttribute('material', 'color: #3a2414');
            group.appendChild(post);
            group.appendChild(bar);
            this.turret = bar;
        } else if (type === 'fire') {
            const ring = document.createElement('a-cylinder');
            ring.setAttribute('radius', this.def.radius * 0.55);
            ring.setAttribute('height', 0.05);
            ring.setAttribute('material', 'shader: flat; color: #552200; emissive: #ff3300; emissiveIntensity: 0.5');
            group.appendChild(ring);
        }
        this.el.appendChild(group);
        this.visual = group;
    },
    tick: function(t, dt) {
        if (!GAME.active || GAME.paused) return;
        if (this.cooldown > 0) this.cooldown -= dt;

        const myPos = this.el.object3D.position;
        const targets = [];
        GAME.enemyHitboxes.forEach(hb => {
            if (!hb || !hb.userData || !hb.userData.el) return;
            const el = hb.userData.el;
            const logic = el.components['enemy-logic'] || el.components['boss-logic'];
            if (!logic) return;
            const d = myPos.distanceTo(el.object3D.position);
            if (d < this.def.radius) targets.push(logic);
        });
        if (targets.length === 0) return;

        if (this.def.slowFactor) {
            targets.forEach(logic => { logic.slowFactor = this.def.slowFactor; logic.slowUntil = Date.now() + this.def.slowDuration; });
            return;
        }

        if (this.cooldown > 0) return;
        this.cooldown = this.def.cooldown;
        targets.forEach(logic => logic.hit(this.def.damage));
        this.playEffect();
    },
    playEffect: function() {
        const pos = this.el.object3D.position.clone(); pos.y += 0.4;
        if (typeof spawnExplosion === 'function') spawnExplosion(pos, this.def.color, this.data.trapType === 'fire' ? 16 : 10);
        this.el.removeAttribute('animation__pulse');
        this.el.setAttribute('animation__pulse', 'property: scale; from: 1 1 1; to: 1.25 1.4 1.25; dir: alternate; dur: 130; easing: easeOutQuad');
    }
});

// Handles build-mode input, the trap hotbar UI, and ghost placement preview.
AFRAME.registerComponent('trap-builder', {
    init: function() {
        this.ghost = document.getElementById('trap-ghost');
        this.ghostRing = this.ghost ? this.ghost.querySelector('a-ring') : null;
        this.raycaster = new THREE.Raycaster();
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.pointer = { x: 0, y: 0 };

        this.renderHotbar();

        window.addEventListener('keydown', (e) => {
            if (!GAME.started) return;
            if (e.code === 'KeyT') this.toggle();
            if (GAME.buildMode) {
                const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
                if (idx > -1 && TRAP_ORDER[idx]) this.select(TRAP_ORDER[idx]);
            }
        });

        document.addEventListener('mousemove', (e) => {
            this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        document.addEventListener('mousedown', (e) => {
            if (!this.canBuild() || GAME.isMobile) return;
            if (this.isUIClick(e)) return;
            this.placeAtPointer();
        });

        document.addEventListener('touchstart', (e) => {
            if (!this.canBuild()) return;
            if (this.isUIClick(e)) return;
            const touch = e.changedTouches[0];
            this.pointer.x = (touch.clientX / window.innerWidth) * 2 - 1;
            this.pointer.y = -(touch.clientY / window.innerHeight) * 2 + 1;
            this.placeAtPointer();
        }, { passive: true });
    },
    canBuild: function() { return GAME.buildMode && GAME.active && !GAME.paused && !GAME.isAscending; },
    isUIClick: function(e) {
        return !!(e.target && e.target.closest && e.target.closest('#trap-hotbar, #build-mode-banner, #mobile-controls, #ally-controls, #hud-panel, #minimap-container'));
    },
    toggle: function() {
        if (!GAME.active) return;
        GAME.buildMode = !GAME.buildMode;
        document.getElementById('trap-hotbar').classList.toggle('active', GAME.buildMode);
        document.getElementById('build-mode-banner').style.display = GAME.buildMode ? 'block' : 'none';
        document.getElementById('build-toggle-label').innerText = GAME.buildMode ? 'BUILD: ON' : 'BUILD: OFF';
        const trapBtn = document.getElementById('trap-btn');
        if (trapBtn) trapBtn.style.background = GAME.buildMode ? '#27ae60' : '';
        if (this.ghost) this.ghost.setAttribute('visible', GAME.buildMode);
        if (GAME.buildMode) document.exitPointerLock();
    },
    select: function(type) {
        GAME.selectedTrapType = type;
        document.querySelectorAll('.trap-slot[data-trap]').forEach(el => el.classList.toggle('selected', el.dataset.trap === type));
    },
    renderHotbar: function() {
        const bar = document.getElementById('trap-hotbar');
        if (!bar) return;
        bar.innerHTML = '';
        TRAP_ORDER.forEach(type => {
            const def = TRAPS[type];
            const slot = document.createElement('div');
            slot.className = 'trap-slot';
            slot.dataset.trap = type;
            slot.innerHTML = `<div class="trap-key">${def.key}</div><div class="trap-icon">${def.icon}</div><div class="trap-name">${def.name}</div><div class="trap-cost">${def.cost}</div>`;
            slot.addEventListener('click', () => this.select(type));
            bar.appendChild(slot);
        });
        const toggle = document.createElement('div');
        toggle.className = 'trap-slot build-toggle';
        toggle.innerHTML = `<div class="trap-key">T</div><div class="trap-icon">\u2692</div><div class="trap-name" id="build-toggle-label">BUILD: OFF</div>`;
        toggle.addEventListener('click', () => this.toggle());
        bar.appendChild(toggle);
        this.select(GAME.selectedTrapType);
    },
    getGroundPoint: function() {
        const camEl = document.querySelector('a-camera');
        if (!camEl || !camEl.getObject3D('camera')) return null;
        this.raycaster.setFromCamera(this.pointer, camEl.getObject3D('camera'));
        const hit = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return hit;
        return null;
    },
    isValidSpot: function(pos) {
        if (!pos) return false;
        const dist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
        if (dist < 7 || dist > 45) return false;
        for (let i = 0; i < GAME.traps.length; i++) {
            const trapEl = GAME.traps[i];
            if (trapEl && trapEl.object3D && trapEl.object3D.position.distanceTo(pos) < 2.0) return false;
        }
        for (let i = 0; i < GAME.obstacles.length; i++) {
            const obs = GAME.obstacles[i];
            if (Math.sqrt((obs.x - pos.x) ** 2 + (obs.z - pos.z) ** 2) < obs.r + 0.6) return false;
        }
        return true;
    },
    placeAtPointer: function() {
        const pos = this.getGroundPoint();
        if (!this.isValidSpot(pos)) {
            if (pos && typeof spawnDamageText === 'function') spawnDamageText('Invalid Spot', pos, true, false);
            return;
        }
        const def = TRAPS[GAME.selectedTrapType];
        if (GAME.traps.length >= GAME.maxTraps) { spawnDamageText('Trap Limit Reached', pos, true, false); return; }
        if (GAME.gems < def.cost) { spawnDamageText('Need ' + def.cost + ' Gems', pos, true, false); return; }
        GAME.gems -= def.cost;
        updateHUD();
        const el = document.createElement('a-entity');
        el.setAttribute('position', `${pos.x.toFixed(2)} 0.02 ${pos.z.toFixed(2)}`);
        el.setAttribute('trap-logic', `trapType: ${GAME.selectedTrapType}`);
        this.el.sceneEl.appendChild(el);
    },
    tick: function() {
        if (!this.ghost) return;
        if (!this.canBuild()) { this.ghost.setAttribute('visible', false); return; }
        const pos = this.getGroundPoint();
        if (!pos) { this.ghost.setAttribute('visible', false); return; }
        this.ghost.setAttribute('visible', true);
        this.ghost.setAttribute('position', `${pos.x} 0.05 ${pos.z}`);
        const valid = this.isValidSpot(pos);
        if (this.ghostRing) this.ghostRing.setAttribute('material', `shader: flat; color: ${valid ? '#00ff88' : '#ff3333'}; opacity: 0.6; transparent: true; side: double`);
    }
});
