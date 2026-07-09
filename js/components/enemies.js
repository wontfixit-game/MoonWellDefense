AFRAME.registerComponent('enemy-logic', {
    schema: {
        type:    { type: 'string' },
        hp:      { type: 'number' },
        maxHp:   { type: 'number' },
        isElite: { type: 'boolean', default: false },
        lane:    { type: 'number',  default: 0 }
    },

    init: function () {
        this.dataDef = ENEMIES[this.data.type];
        this.player  = document.querySelector('#player');
        this.isDead  = false;
        this.isHit   = false;

        // Waypoint following state
        this.waypointIdx   = 1;          // start heading to waypoint[1] (waypoint[0] is spawn)
        this.slowMultiplier = 1.0;       // modified by tar traps
        this._slowTimer    = null;
        this._lastAtk      = 0;

        this.el.setAttribute('gltf-model', this.dataDef.model);

        if (this.data.isElite) {
            this.el.addEventListener('model-loaded', () => {
                const obj = this.el.getObject3D('mesh');
                if (obj) {
                    obj.traverse(node => {
                        if (node.isMesh) {
                            node.material = node.material.clone();
                            node.material.emissive.setHex(0x5500aa);
                            node.material.emissiveIntensity = 0.6;
                        }
                    });
                }
            });
        }

        let scale = this.dataDef.scale.split(' ').map(Number);
        if (this.data.isElite) scale = scale.map(s => s * 1.2);
        this.el.setAttribute('scale', scale.join(' '));
        this.el.setAttribute('animation-mixer', { clip: this.dataDef.move, loop: 'repeat' });
        this.el.setAttribute('shadow', 'cast: true');

        const cylH   = this.dataDef.headY * 1.8 * (this.data.isElite ? 1.2 : 1.0);
        const cylR   = this.dataDef.radius * (this.data.isElite ? 1.2 : 1.0);
        const hitGeo = new THREE.CylinderGeometry(cylR, cylR, cylH, 8);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        this.hitbox  = new THREE.Mesh(hitGeo, hitMat);
        this.hitbox.position.y = cylH / 2;
        this.hitbox.userData.el = this.el;
        this.el.object3D.add(this.hitbox);
        GAME.enemyHitboxes.push(this.hitbox);
    },

    tick: function () {
        if (!GAME.active || GAME.paused || this.isDead || this.isHit) return;

        const myPos = this.el.object3D.position;

        // ---- Separation from other enemies ----
        const sep = new THREE.Vector3();
        let sepCount = 0;
        GAME.enemyHitboxes.forEach(h => {
            if (!h || !h.userData || !h.userData.el) return;
            const other = h.userData.el.object3D;
            if (other === this.el.object3D) return;
            const dist = myPos.distanceTo(other.position);
            if (dist < this.dataDef.radius + 0.5) {
                sep.add(myPos.clone().sub(other.position).normalize());
                sepCount++;
            }
        });
        if (sepCount > 0) myPos.add(sep.divideScalar(sepCount).multiplyScalar(0.04));

        // ---- Check for melee engagement with player / ally ----
        let attackTarget = null;

        const distToPlayer = myPos.distanceTo(this.player.object3D.position);
        if (distToPlayer < 2.8) attackTarget = this.player;

        if (!attackTarget) {
            for (const ally of GAME.allies) {
                if (ally && ally.object3D && ally.components['ally-logic'] &&
                    ally.components['ally-logic'].isConnected) {
                    if (myPos.distanceTo(ally.object3D.position) < 2.8) {
                        attackTarget = ally;
                        break;
                    }
                }
            }
        }

        if (attackTarget) {
            this.el.object3D.lookAt(attackTarget.object3D.position);
            if (Date.now() - this._lastAtk > 1750) {
                this._lastAtk = Date.now();
                this.el.setAttribute('animation-mixer', { clip: this.dataDef.atk, loop: 'once' });
                setTimeout(() => {
                    if (!this.isDead) this._dealDamage(attackTarget);
                }, 800);
                setTimeout(() => {
                    if (!this.isDead && !this.isHit)
                        this.el.setAttribute('animation-mixer', { clip: this.dataDef.move, loop: 'repeat' });
                }, 1200);
            }
            return;
        }

        // ---- Waypoint path following ----
        const lane = PATH_WAYPOINTS[this.data.lane];
        if (!lane || this.waypointIdx >= lane.length) return;

        const wp = lane[this.waypointIdx];
        const wpPos = new THREE.Vector3(wp.x, 0, wp.z);
        const distToWP = myPos.distanceTo(wpPos);

        // Reached current waypoint — advance
        if (distToWP < 2.0) {
            this.waypointIdx++;
            if (this.waypointIdx >= lane.length) {
                this._enterRift();
                return;
            }
        }

        // Steer away from barricades (steering-based obstacle avoidance)
        const nextWP = lane[this.waypointIdx];
        const moveDir = new THREE.Vector3(nextWP.x - myPos.x, 0, nextWP.z - myPos.z).normalize();

        for (const obs of GAME.obstacles) {
            if (!obs.isTrap) continue;
            const d = Math.sqrt((obs.x - myPos.x) ** 2 + (obs.z - myPos.z) ** 2);
            if (d < 2.8) {
                const away = new THREE.Vector3(myPos.x - obs.x, 0, myPos.z - obs.z).normalize();
                moveDir.addScaledVector(away, 2.5);
            }
        }
        moveDir.normalize();

        let speed = this.dataDef.speed * this.slowMultiplier;
        if (this.data.isElite) speed *= 1.2;

        myPos.addScaledVector(moveDir, speed);
        myPos.y = 0;

        // Face movement direction
        const lookTarget = new THREE.Vector3(myPos.x + moveDir.x, myPos.y, myPos.z + moveDir.z);
        this.el.object3D.lookAt(lookTarget);
    },

    _enterRift: function () {
        if (this.isDead) return;
        this.isDead = true;

        const riftCost = (typeof RIFT_COSTS !== 'undefined' && RIFT_COSTS[this.data.type]) || 1;
        const hpCost   = riftCost * 150;

        GAME.wellHP    = Math.max(0, GAME.wellHP - hpCost);
        GAME.riftPoints = Math.ceil(GAME.wellHP / 150);

        const idx = GAME.enemyHitboxes.indexOf(this.hitbox);
        if (idx > -1) GAME.enemyHitboxes.splice(idx, 1);

        if (typeof spawnDamageText === 'function') {
            const p = new THREE.Vector3(0, 3, 0);
            spawnDamageText('-' + riftCost + ' RIFT', p, true, false);
        }
        if (typeof triggerCameraShake === 'function') triggerCameraShake(0.18, 350);
        if (typeof updateHUD === 'function') updateHUD();

        if (GAME.wellHP <= 0) {
            if (typeof gameOver === 'function') gameOver();
            return;
        }

        if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
        if (typeof checkWave === 'function') checkWave();
    },

    applyTar: function () {
        this.slowMultiplier = 0.30;
        clearTimeout(this._slowTimer);
        this._slowTimer = setTimeout(() => { this.slowMultiplier = 1.0; }, 600);
    },

    flashHit: function () {
        const obj = this.el.getObject3D('mesh');
        if (!obj) return;
        obj.traverse(node => {
            if (node.isMesh && node.material) {
                if (!node.userData._origEmissive) {
                    node.userData._origEmissive    = node.material.emissive
                        ? node.material.emissive.clone() : new THREE.Color(0);
                    node.userData._origEmissiveInt = node.material.emissiveIntensity || 0;
                }
                node.material = node.material.clone();
                node.material.emissive.setHex(0xffffff);
                node.material.emissiveIntensity = 1.2;
            }
        });
        setTimeout(() => {
            if (this.isDead) return;
            const mesh = this.el.getObject3D('mesh');
            if (!mesh) return;
            mesh.traverse(node => {
                if (node.isMesh && node.userData._origEmissive) {
                    node.material.emissive.copy(node.userData._origEmissive);
                    node.material.emissiveIntensity = node.userData._origEmissiveInt;
                }
            });
        }, 120);
    },

    hit: function (dmg) {
        if (this.isDead) return false;
        this.data.hp -= dmg;

        if (this.data.hp <= 0) {
            this.isDead = true;
            if (typeof addCombo === 'function') addCombo();
            this.el.removeAttribute('enemy-logic');

            const idx = GAME.enemyHitboxes.indexOf(this.hitbox);
            if (idx > -1) GAME.enemyHitboxes.splice(idx, 1);

            this.el.setAttribute('animation-mixer',
                { clip: 'Death', loop: 'once', clampWhenFinished: true });

            GAME.totalKills++;
            GAME.shardsEarnedThisRun += 1;

            // Skull reward for the player
            const skullReward = 5 + Math.floor(GAME.wave * 1.5);
            GAME.skulls += skullReward;

            if (GAME.vampiricLevel > 0) {
                const heal = GAME.vampiricLevel * 2;
                GAME.playerHP = Math.min(GAME.maxPlayerHP, GAME.playerHP + heal);
                if (typeof spawnDamageText === 'function')
                    spawnDamageText('+' + heal, this.player.object3D.position, false, true);
            }

            if (typeof updateHUD === 'function') updateHUD();

            // Gem drop (visual collectible)
            if (Math.random() < 0.55) {
                const gem = document.createElement('a-entity');
                gem.setAttribute('gltf-model', '#model-gem');
                gem.setAttribute('scale', '1.5 1.5 1.5');
                const pos = this.el.object3D.position.clone(); pos.y = 0.5;
                gem.setAttribute('position', pos);
                gem.setAttribute('resource-drop', '');
                this.el.sceneEl.appendChild(gem);
            }

            setTimeout(() => {
                this.el.setAttribute('animation',
                    'property: position; to: ' + this.el.object3D.position.x + ' -2 ' +
                    this.el.object3D.position.z + '; dur: 1000; easing: linear');
                setTimeout(() => {
                    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
                    if (typeof checkWave === 'function') checkWave();
                }, 1000);
            }, 1500);

            return true;
        } else {
            this.isHit = true;
            this.flashHit();
            this.el.setAttribute('animation-mixer', { clip: this.dataDef.hit, loop: 'once' });
            setTimeout(() => {
                this.isHit = false;
                if (!this.isDead)
                    this.el.setAttribute('animation-mixer', { clip: this.dataDef.move, loop: 'repeat' });
            }, 400);
            return false;
        }
    },

    _dealDamage: function (target) {
        if (this.isDead) return;
        GAME.lastAttacker = this.el;
        let dmg = this.dataDef.dmg;
        if (this.data.isElite) dmg *= 2;

        if (this.dataDef.projectile) {
            this._shootProjectile(target, dmg);
        } else {
            if (target === this.player) {
                GAME.playerHP -= dmg;
                if (typeof triggerDirectionalDamage === 'function')
                    triggerDirectionalDamage(this.el.object3D.position);
            } else if (target.components && target.components['ally-logic']) {
                target.components['ally-logic'].hit(dmg);
            } else {
                GAME.wellHP -= dmg;
                GAME.riftPoints = Math.ceil(GAME.wellHP / 150);
            }
            if (GAME.playerHP <= 0 || GAME.wellHP <= 0) {
                if (typeof gameOver === 'function') gameOver();
            }
            if (typeof updateHUD === 'function') updateHUD();
        }
    },

    _shootProjectile: function (target, dmg) {
        const startPos = this.el.object3D.position.clone();
        startPos.y += this.dataDef.headY;
        const targetPos = target.object3D.position.clone(); targetPos.y += 1.0;
        const direction = new THREE.Vector3().subVectors(targetPos, startPos).normalize();

        const projEl = document.createElement('a-entity');
        projEl.setAttribute('position', startPos);

        const mesh = document.createElement('a-entity');
        mesh.setAttribute('geometry', 'primitive: sphere; radius: 0.35');
        mesh.setAttribute('material', 'shader: flat; color: #ff6600; opacity: 0.9; transparent: true');

        const light = document.createElement('a-light');
        light.setAttribute('type', 'point');
        light.setAttribute('color', '#ff4400');
        light.setAttribute('intensity', '1.5');
        light.setAttribute('distance', '4.0');

        projEl.appendChild(mesh);
        projEl.appendChild(light);
        projEl.setAttribute('enemy-projectile', {
            damage: dmg, speed: 12.0,
            dirX: direction.x, dirY: direction.y, dirZ: direction.z
        });
        this.el.sceneEl.appendChild(projEl);
    }
});

// ================================================================
//  BOSS LOGIC (unchanged except uses GAME.wellHP for rift)
// ================================================================
AFRAME.registerComponent('boss-logic', {
    schema: { hp: { type: 'number', default: 20000 }, maxHp: { type: 'number', default: 20000 } },
    init: function () {
        this.el.setAttribute('gltf-model', '#model-skeleton');
        this.el.setAttribute('scale', '12 12 12');
        this.el.setAttribute('animation-mixer', { clip: 'Walk', loop: 'repeat' });
        this.el.setAttribute('shadow', 'cast: true');

        const light = document.createElement('a-light');
        light.setAttribute('type', 'point'); light.setAttribute('color', '#ff3300');
        light.setAttribute('intensity', '3.0'); light.setAttribute('distance', '80');
        light.setAttribute('position', '0 10 0');
        this.el.appendChild(light);

        const hitGeo = new THREE.CylinderGeometry(0.6, 0.6, 2.0, 12);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        this.hitbox  = new THREE.Mesh(hitGeo, hitMat);
        this.hitbox.position.y = 1.0;
        this.hitbox.userData.el = this.el;
        this.el.object3D.add(this.hitbox);
        GAME.enemyHitboxes.push(this.hitbox);

        this.speed = 0.9375;
        this.target = new THREE.Vector3(0, 0, 0);
        this.trampleTimer = 0;
        document.getElementById('boss-hud').style.display = 'flex';
        this.updateUI();
    },
    updateUI: function () {
        const fill = document.getElementById('boss-bar-fill');
        if (fill) fill.style.width = Math.max(0, (this.data.hp / this.data.maxHp) * 100) + '%';
    },
    tick: function (t, dt) {
        if (!GAME.active || GAME.paused) return;
        const myPos = this.el.object3D.position;
        if (myPos.distanceTo(this.target) < 5.5) {
            this.el.setAttribute('animation-mixer', { clip: 'Sword', loop: 'once' });
            GAME.lastAttacker = this.el;
            GAME.wellHP = 0;
            GAME.riftPoints = 0;
            if (typeof gameOver === 'function') gameOver();
            if (typeof updateHUD === 'function') updateHUD();
            return;
        }
        const dir = new THREE.Vector3().subVectors(this.target, myPos).normalize();
        this.el.object3D.position.add(dir.multiplyScalar(this.speed * (dt / 1000)));
        this.el.object3D.lookAt(this.target);
        this.trampleTimer += dt;
        if (this.trampleTimer > 200) { this.trampleTimer = 0; this._trampleForest(myPos); }
    },
    _trampleForest: function (pos) {
        for (let i = GAME.trees.length - 1; i >= 0; i--) {
            const tree = GAME.trees[i];
            if (!tree.object3D) continue;
            if (pos.distanceTo(tree.object3D.position) < 15.0) {
                if (typeof spawnExplosion === 'function') spawnExplosion(tree.object3D.position, 0x44aa44, 5);
                if (tree.parentNode) tree.parentNode.removeChild(tree);
                GAME.trees.splice(i, 1);
            }
        }
    },
    hit: function (dmg) {
        if (this.data.hp <= 0) return false;
        this.data.hp -= dmg;
        this.updateUI();
        if (this.data.hp <= 0) { this.die(); return true; }
        return false;
    },
    die: function () {
        const idx = GAME.enemyHitboxes.indexOf(this.hitbox);
        if (idx > -1) GAME.enemyHitboxes.splice(idx, 1);
        this.el.setAttribute('animation-mixer', { clip: 'Death', loop: 'once', clampWhenFinished: true });
        document.getElementById('boss-hud').style.display = 'none';
        GAME.shardsEarnedThisRun += 500;
        GAME.skulls += 500;
        if (typeof updateHUD === 'function') updateHUD();
        setTimeout(() => { if (typeof triggerVictory === 'function') triggerVictory(); }, 4000);
    }
});

// ================================================================
//  ALLY LOGIC (unchanged)
// ================================================================
AFRAME.registerComponent('ally-logic', {
    schema: { level: { type: 'number', default: 1 } },
    init: function () {
        this.updateStats();
        this.target = null; this.lastAtk = 0; this.isDead = false; this.isConnected = true;
        this.el.classList.add('ally');
        GAME.allies.push(this.el);
        const hitGeo = new THREE.CylinderGeometry(0.5, 0.5, 2.0, 8);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        this.hitbox  = new THREE.Mesh(hitGeo, hitMat);
        this.hitbox.position.y = 1.0; this.hitbox.userData.el = this.el;
        this.el.object3D.add(this.hitbox);
        GAME.allyHitboxes.push(this.hitbox);
    },
    updateStats: function () {
        this.stats = ALLIES[this.data.level];
        this.el.setAttribute('gltf-model', this.stats.model);
        this.el.setAttribute('scale', this.stats.scale);
        this.el.setAttribute('animation-mixer', { clip: this.stats.anim.idle, loop: 'repeat' });
        this.currentHP = this.stats.hp;
        this.bodyRadius = (this.data.level === 3) ? 2.0 : 1.2;
        if (this.hitbox && this.data.level === 3) this.hitbox.scale.set(1.5, 1.5, 1.5);
    },
    upgrade: function () {
        if (this.data.level < 3) {
            this.data.level++;
            this.updateStats();
            if (typeof spawnDamageText === 'function') spawnDamageText('LEVEL UP!', this.el.object3D.position, true, true);
            if (typeof spawnExplosion === 'function') spawnExplosion(this.el.object3D.position, 0x00ff00, 15);
        }
    },
    tick: function (t, dt) {
        if (!GAME.active || GAME.paused || this.isDead) return;
        const myPos = this.el.object3D.position;
        const sep = new THREE.Vector3(); let cnt = 0;
        GAME.allies.forEach(al => {
            if (!al || al === this.el) return;
            const dist = myPos.distanceTo(al.object3D.position);
            if (dist < this.bodyRadius) { sep.add(myPos.clone().sub(al.object3D.position).normalize()); cnt++; }
        });
        if (cnt > 0) { sep.divideScalar(cnt).multiplyScalar(0.05); myPos.add(sep); }

        let closestEnemy = null; let minD = 999;
        const searchRange = (GAME.allyCmdState === 2) ? 500 : 10;
        GAME.enemyHitboxes.forEach(h => {
            const el = h.userData.el;
            if (el && (el.components['enemy-logic'] || el.components['boss-logic'])) {
                const d = myPos.distanceTo(el.object3D.position);
                if (d < minD && d < searchRange) { minD = d; closestEnemy = el; }
            }
        });

        if (closestEnemy && minD < this.stats.range) {
            this.el.object3D.lookAt(closestEnemy.object3D.position);
            if (Date.now() - this.lastAtk > this.stats.atkSpd * 1000) {
                this.lastAtk = Date.now();
                this.el.setAttribute('animation-mixer', { clip: this.stats.anim.atk, loop: 'once' });
                setTimeout(() => {
                    if (closestEnemy.components['enemy-logic']) closestEnemy.components['enemy-logic'].hit(this.stats.dmg);
                    if (closestEnemy.components['boss-logic']) closestEnemy.components['boss-logic'].hit(this.stats.dmg);
                }, 500);
            }
        } else {
            let moveTarget = null;
            if (GAME.allyCmdState === 0) {
                const pp = document.getElementById('player').object3D.position;
                if (myPos.distanceTo(pp) > 4.0) moveTarget = pp;
            } else if (GAME.allyCmdState === 1) {
                const wp = document.getElementById('moon-well').object3D.position;
                if (closestEnemy) moveTarget = closestEnemy.object3D.position;
                else if (myPos.distanceTo(wp) > 12.0) moveTarget = wp;
            } else {
                if (closestEnemy) moveTarget = closestEnemy.object3D.position;
                else {
                    const wp = document.getElementById('moon-well').object3D.position;
                    if (myPos.distanceTo(wp) > 15.0) moveTarget = wp;
                }
            }
            if (moveTarget) {
                this.el.object3D.lookAt(moveTarget);
                this.el.object3D.translateZ(0.06);
                this.el.setAttribute('animation-mixer', { clip: this.stats.anim.run, loop: 'repeat' });
            } else {
                this.el.setAttribute('animation-mixer', { clip: this.stats.anim.idle, loop: 'repeat' });
            }
        }
    },
    hit: function (dmg) {
        this.currentHP -= dmg;
        if (typeof spawnDamageText === 'function') spawnDamageText(Math.round(dmg), this.el.object3D.position, false, false);
        if (this.currentHP <= 0 && !this.isDead) {
            this.isDead = true; this.isConnected = false;
            this.el.setAttribute('animation-mixer', { clip: this.stats.anim.die, loop: 'once', clampWhenFinished: true });
            setTimeout(() => { if (this.el.parentNode) this.el.parentNode.removeChild(this.el); }, 2000);
        }
    }
});

// ================================================================
//  GAME LOGIC — spawn controller
// ================================================================
AFRAME.registerComponent('game-logic', {
    init: function () { this.toSpawn = 0; this.timer = 0; this.ascensionSpawnTimer = 0; },

    tick: function (t, dt) {
        if (GAME.paused) return;

        // Prep phase countdown
        if (GAME.prepPhase) {
            GAME.prepTimer -= dt / 1000;
            const timerEl = document.getElementById('prep-timer');
            if (timerEl) timerEl.textContent = Math.max(0, Math.ceil(GAME.prepTimer));
            if (GAME.prepTimer <= 0) {
                if (typeof endPrepPhase === 'function') endPrepPhase();
            }
            return;
        }

        if (!GAME.active) return;

        if (GAME.combo > 0) {
            GAME.comboTimer -= dt;
            if (GAME.comboTimer <= 0) { GAME.combo = 0; if (typeof updateComboUI === 'function') updateComboUI(); }
        }

        if (GAME.isAscending) {
            GAME.survivalTime -= (dt / 1000);
            const timerEl = document.getElementById('event-timer');
            const min = Math.floor(GAME.survivalTime / 60);
            const sec = Math.floor(GAME.survivalTime % 60);
            if (timerEl) timerEl.innerText = min + ':' + (sec < 10 ? '0' : '') + sec;
            this.ascensionSpawnTimer += dt;
            if (this.ascensionSpawnTimer > 200) { this.ascensionSpawnTimer = 0; this._spawnSiegeEnemy(); }
            if (typeof updateMinimap === 'function') updateMinimap();
            return;
        }

        if (GAME.toSpawn > 0) {
            const spawnDelay = GAME.wave <= 2 ? 1800 : (GAME.wave <= 4 ? 1400 : 1000);
            const maxOnField = GAME.wave <= 2 ? 8 : 20;
            this.timer += dt;
            if (this.timer > spawnDelay && GAME.enemyHitboxes.length < maxOnField) {
                this.timer = 0;
                this._spawn();
            }
        }
        if (typeof updateMinimap === 'function') updateMinimap();
    },

    _spawn: function () {
        GAME.toSpawn--;
        const wave = GAME.wave;
        let types = ['grunt'];
        if (wave >= 3) types.push('runner');
        if (wave >= 5) types.push('wizard');
        if (wave >= 7) types.push('tank');
        if (wave >= 9) types.push('skeleton');

        const type    = types[Math.floor(Math.random() * types.length)];
        const laneIdx = Math.floor(Math.random() * PATH_WAYPOINTS.length);
        const spawn   = PATH_WAYPOINTS[laneIdx][0];

        const el = document.createElement('a-entity');
        el.classList.add('enemy');
        el.setAttribute('position', spawn.x + ' 0 ' + spawn.z);

        const hpScale = wave <= 3 ? 0.6 : 1.0;
        const hp      = Math.round(ENEMIES[type].hp + (wave * 10 * hpScale));
        const isElite = Math.random() < 0.05;

        el.setAttribute('enemy-logic', {
            type: type,
            hp:   isElite ? hp * 2.5 : hp,
            maxHp: isElite ? hp * 2.5 : hp,
            isElite: isElite,
            lane: laneIdx
        });
        this.el.sceneEl.appendChild(el);
        if (typeof updateHUD === 'function') updateHUD();
    },

    _spawnSiegeEnemy: function () {
        const type    = ['grunt', 'runner', 'tank', 'wizard', 'skeleton'][Math.floor(Math.random() * 5)];
        const laneIdx = Math.floor(Math.random() * PATH_WAYPOINTS.length);
        const spawn   = PATH_WAYPOINTS[laneIdx][0];

        const el = document.createElement('a-entity');
        el.classList.add('enemy');
        el.setAttribute('position', spawn.x + ' 0 ' + spawn.z);

        const hp = (ENEMIES[type].hp + (GAME.wave * 20)) * 1.5;
        el.setAttribute('enemy-logic', {
            type: type, hp: hp, maxHp: hp, lane: laneIdx
        });
        this.el.sceneEl.appendChild(el);
    }
});
