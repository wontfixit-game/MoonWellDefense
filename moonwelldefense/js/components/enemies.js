AFRAME.registerComponent('enemy-logic', {
    schema: { type: {type:'string'}, hp: {type:'number'}, maxHp: {type:'number'}, isElite: {type:'boolean', default: false} },
    init: function() {
        this.dataDef = ENEMIES[this.data.type]; 
        this.target = document.querySelector('#moon-well'); 
        this.player = document.querySelector('#player');
        this.isDead = false; this.isHit = false; 
        this.el.setAttribute('gltf-model', this.dataDef.model); 
        if (this.data.isElite) {
            this.el.addEventListener('model-loaded', () => {
                const obj = this.el.getObject3D('mesh');
                if (obj) { obj.traverse(node => { if (node.isMesh) { node.material = node.material.clone(); node.material.emissive.setHex(0x5500aa); node.material.emissiveIntensity = 0.6; } }); }
            });
        }
        let scale = this.dataDef.scale.split(' ').map(Number);
        if (this.data.isElite) scale = scale.map(s => s * 1.2);
        this.el.setAttribute('scale', scale.join(' '));
        this.el.setAttribute('animation-mixer', {clip: this.dataDef.move, loop: 'repeat'}); 
        this.el.setAttribute('shadow', 'cast: true');
        const cylHeight = this.dataDef.headY * 1.8 * (this.data.isElite ? 1.2 : 1.0);
        const hitGeo = new THREE.CylinderGeometry(this.dataDef.radius * (this.data.isElite?1.2:1), this.dataDef.radius * (this.data.isElite?1.2:1), cylHeight, 8); 
        const hitMat = new THREE.MeshBasicMaterial({visible: false});
        this.hitbox = new THREE.Mesh(hitGeo, hitMat); 
        this.hitbox.position.y = cylHeight / 2; 
        this.hitbox.userData.el = this.el; 
        this.el.object3D.add(this.hitbox); 
        GAME.enemyHitboxes.push(this.hitbox);
    },
    tick: function() {
        if(!GAME.active || GAME.paused || this.isDead) return;
        const myPos = this.el.object3D.position;
        
        // Separation
        const separation = new THREE.Vector3(); let count = 0;
        GAME.enemyHitboxes.forEach(hitbox => { 
            if (!hitbox || !hitbox.userData || !hitbox.userData.el) return; 
            const mesh = hitbox.userData.el.object3D; 
            if (mesh === myPos) return; 
            const dist = myPos.distanceTo(mesh.position); 
            if (dist < (this.dataDef.radius + 0.6)) { separation.add(myPos.clone().sub(mesh.position).normalize()); count++; } 
        });
        if (count > 0) myPos.add(separation.divideScalar(count).multiplyScalar(0.05));
        
        if (this.isHit) return;
        
        // --- V1.5 LOGIC: DYNAMIC TARGETING & RADIUS ---
        let activeTarget = this.target; // Default: Well
        let minD = myPos.distanceTo(this.target.object3D.position); 
        
        // Moon Well visual radius ~4.5m (scale 0.5 × model ~9m diameter)
        const WELL_RADIUS = 4.5;
        let baseRange = (this.dataDef.projectile) ? (this.dataDef.range || 10.0) : 2.5;
        const bodyRadius = this.dataDef.radius * (this.data.isElite ? 1.2 : 1.0);
        
        // Melee stops at well edge + weapon reach; ranged uses its own range
        let stopRange = this.dataDef.projectile
            ? baseRange
            : (WELL_RADIUS + bodyRadius + 0.5);

        // 檢查玩家 (優先度高)
        const distP = myPos.distanceTo(this.player.object3D.position);
        if (distP < 8 && distP < minD) { 
            activeTarget = this.player; 
            minD = distP; 
            // 對玩家時，使用標準交戰距離 (2.5 或 遠程)
            stopRange = baseRange;
        }
        
        // 檢查召喚物
        GAME.allies.forEach(ally => { 
            if(ally && ally.object3D && ally.components['ally-logic'] && ally.components['ally-logic'].isConnected) { 
                const d = myPos.distanceTo(ally.object3D.position); 
                if(d < 5 && d < minD) { 
                    activeTarget = ally; 
                    minD = d; 
                    stopRange = baseRange; // 對召喚物也是標準距離
                } 
            } 
        });
        
        let speed = this.dataDef.speed; if(this.data.isElite) speed *= 1.2; 
        
        if (minD > stopRange) { 
            // Move
            this.el.object3D.lookAt(activeTarget.object3D.position); 
            this.el.object3D.translateZ(speed); 
        } else {
            // Attack
            this.el.object3D.lookAt(activeTarget.object3D.position);
            if(!this.lastAtk || Date.now() - this.lastAtk > 1750) { 
                this.lastAtk = Date.now(); 
                this.el.setAttribute('animation-mixer', {clip: this.dataDef.atk, loop: 'once'}); 
                setTimeout(() => { this.dealDamage(activeTarget); }, 800); 
                setTimeout(() => { if(!this.isDead && !this.isHit) this.el.setAttribute('animation-mixer', {clip: this.dataDef.move, loop: 'repeat'}); }, 1200); 
            }
        }
    },
    dealDamage: function(activeTarget) { 
        if(this.isDead) return; 
        GAME.lastAttacker = this.el; 
        let dmg = this.dataDef.dmg; 
        if(this.data.isElite) dmg *= 2; 

        if (this.dataDef.projectile) {
            this.shootProjectile(activeTarget, dmg);
        } else {
            if(activeTarget === this.player) { 
                GAME.playerHP -= dmg; 
                if (typeof triggerDirectionalDamage === 'function') triggerDirectionalDamage(this.el.object3D.position);
            } else if (activeTarget.components && activeTarget.components['ally-logic']) { 
                activeTarget.components['ally-logic'].hit(dmg); 
            } else { 
                GAME.wellHP -= dmg; 
            } 
            if(GAME.playerHP<=0 || GAME.wellHP<=0) gameOver(); 
            updateHUD(); 
        }
    },
    shootProjectile: function(target, dmg) {
        const startPos = this.el.object3D.position.clone();
        startPos.y += this.dataDef.headY; 
        const targetPos = target.object3D.position.clone();
        targetPos.y += 1.0; 
        const direction = new THREE.Vector3().subVectors(targetPos, startPos).normalize();

        const el = document.createElement('a-entity');
        el.setAttribute('position', startPos);
        
        const mesh = document.createElement('a-entity');
        mesh.setAttribute('geometry', 'primitive: sphere; radius: 0.35'); 
        mesh.setAttribute('material', 'shader: flat; color: #ff6600; opacity: 0.9; transparent: true'); 
        const light = document.createElement('a-light');
        light.setAttribute('type', 'point');
        light.setAttribute('color', '#ff4400'); 
        light.setAttribute('intensity', '1.5'); 
        light.setAttribute('distance', '4.0');
        el.appendChild(mesh);
        el.appendChild(light);
        
        el.setAttribute('enemy-projectile', {
            damage: dmg, 
            speed: 12.0,
            dirX: direction.x, dirY: direction.y, dirZ: direction.z
        });
        this.el.sceneEl.appendChild(el);
    },
    flashHit: function() {
        const obj = this.el.getObject3D('mesh');
        if (!obj) return;
        obj.traverse(node => {
            if (node.isMesh && node.material) {
                if (!node.userData._origEmissive) {
                    node.userData._origEmissive = node.material.emissive ? node.material.emissive.clone() : new THREE.Color(0);
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
    hit: function(dmg) {
        if(this.isDead) return false; this.data.hp -= dmg;
        if (this.data.hp <= 0) {
            this.isDead = true; 
            if (typeof addCombo === 'function') addCombo();
            this.el.removeAttribute('enemy-logic'); 
            const idx = GAME.enemyHitboxes.indexOf(this.hitbox); 
            if(idx > -1) GAME.enemyHitboxes.splice(idx, 1);
            this.el.setAttribute('animation-mixer', {clip: 'Death', loop: 'once', clampWhenFinished: true}); 
            GAME.totalKills++; GAME.shardsEarnedThisRun += 1; 
            if(GAME.vampiricLevel > 0) { 
                const heal = GAME.vampiricLevel * 2; 
                GAME.playerHP = Math.min(GAME.maxPlayerHP, GAME.playerHP + heal); 
                updateHUD(); 
                if (typeof spawnDamageText === 'function') spawnDamageText("+" + heal, this.player.object3D.position, false, true); 
            }
            if (Math.random() < 0.65) { 
                const gem = document.createElement('a-entity'); 
                gem.setAttribute('gltf-model', '#model-gem'); gem.setAttribute('scale', '1.5 1.5 1.5'); 
                const pos = this.el.object3D.position.clone(); pos.y = 0.5; 
                gem.setAttribute('position', pos); gem.setAttribute('resource-drop', ''); 
                this.el.sceneEl.appendChild(gem); 
            }
            setTimeout(() => { 
                this.el.setAttribute('animation', 'property: position; to: ' + this.el.object3D.position.x + ' -2 ' + this.el.object3D.position.z + '; dur: 1000; easing: linear'); 
                setTimeout(() => { if(this.el.parentNode) this.el.parentNode.removeChild(this.el); checkWave(); }, 1000); 
            }, 1500); 
            return true; 
        } else { 
            this.isHit = true;
            this.flashHit();
            this.el.setAttribute('animation-mixer', {clip: this.dataDef.hit, loop: 'once'}); 
            setTimeout(() => { this.isHit = false; if(!this.isDead) this.el.setAttribute('animation-mixer', {clip: this.dataDef.move, loop: 'repeat'}); }, 400); 
            return false; 
        }
    }
});
    AFRAME.registerComponent('boss-logic', {
    schema: { hp: {type:'number', default: 20000}, maxHp: {type:'number', default: 20000} },
    init: function() {
        this.el.setAttribute('gltf-model', '#model-skeleton'); this.el.setAttribute('scale', '12 12 12'); this.el.setAttribute('animation-mixer', {clip: 'Walk', loop: 'repeat'}); this.el.setAttribute('shadow', 'cast: true');
        const light = document.createElement('a-light'); light.setAttribute('type', 'point'); light.setAttribute('color', '#ff3300'); light.setAttribute('intensity', '3.0'); light.setAttribute('distance', '80'); light.setAttribute('position', '0 10 0'); this.el.appendChild(light);
        const hitGeo = new THREE.CylinderGeometry(0.6, 0.6, 2.0, 12); const hitMat = new THREE.MeshBasicMaterial({visible: false}); this.hitbox = new THREE.Mesh(hitGeo, hitMat); this.hitbox.position.y = 1.0; this.hitbox.userData.el = this.el; this.el.object3D.add(this.hitbox); GAME.enemyHitboxes.push(this.hitbox);
        this.speed = 0.9375; this.target = new THREE.Vector3(0, 0, 0); this.trampleTimer = 0; document.getElementById('boss-hud').style.display = 'flex'; this.updateUI();
    },
    updateUI: function() { const fill = document.getElementById('boss-bar-fill'); const pct = Math.max(0, (this.data.hp / this.data.maxHp) * 100); fill.style.width = pct + '%'; },
    tick: function(t, dt) {
        if(!GAME.active || GAME.paused) return; const myPos = this.el.object3D.position; if (myPos.distanceTo(this.target) < 5.5) { this.el.setAttribute('animation-mixer', {clip: 'Sword', loop: 'once'}); GAME.lastAttacker = this.el; GAME.wellHP = 0; gameOver(); updateHUD(); return; }
        const dir = new THREE.Vector3().subVectors(this.target, myPos).normalize(); this.el.object3D.position.add(dir.multiplyScalar(this.speed * (dt / 1000))); this.el.object3D.lookAt(this.target);
        this.trampleTimer += dt; if(this.trampleTimer > 200) { this.trampleTimer = 0; this.trampleForest(myPos); }
    },
    trampleForest: function(pos) { for(let i = GAME.trees.length - 1; i >= 0; i--) { const tree = GAME.trees[i]; if(!tree.object3D) continue; if(pos.distanceTo(tree.object3D.position) < 15.0) { spawnExplosion(tree.object3D.position, 0x44aa44, 5); if(tree.parentNode) tree.parentNode.removeChild(tree); GAME.trees.splice(i, 1); } } },
    hit: function(dmg) { if(this.data.hp <= 0) return false; this.data.hp -= dmg; this.updateUI(); if (this.data.hp <= 0) { this.die(); return true; } return false; },
    die: function() { const idx = GAME.enemyHitboxes.indexOf(this.hitbox); if(idx > -1) GAME.enemyHitboxes.splice(idx, 1); this.el.setAttribute('animation-mixer', {clip: 'Death', loop: 'once', clampWhenFinished: true}); document.getElementById('boss-hud').style.display = 'none'; GAME.shardsEarnedThisRun += 500; setTimeout(() => { triggerVictory(); }, 4000); }
});

AFRAME.registerComponent('ally-logic', {
    schema: { level: {type: 'number', default: 1} },
    init: function() { 
this.updateStats(); 
this.target = null; 
this.lastAtk = 0; 
this.isDead = false; 
this.isConnected = true; 
this.el.classList.add('ally'); 
GAME.allies.push(this.el); 
const hitGeo = new THREE.CylinderGeometry(0.5, 0.5, 2.0, 8); 
const hitMat = new THREE.MeshBasicMaterial({visible: false}); 
this.hitbox = new THREE.Mesh(hitGeo, hitMat); 
this.hitbox.position.y = 1.0; 
this.hitbox.userData.el = this.el; 
this.el.object3D.add(this.hitbox); 
GAME.allyHitboxes.push(this.hitbox); 
    },
    updateStats: function() { 
this.stats = ALLIES[this.data.level]; 
this.el.setAttribute('gltf-model', this.stats.model); 
this.el.setAttribute('scale', this.stats.scale); 
this.el.setAttribute('animation-mixer', {clip: this.stats.anim.idle, loop: 'repeat'}); 
this.currentHP = this.stats.hp; 

// --- FIX 1: Define a dynamic body radius for separation logic ---
// Gwen (Level 3) is bigger, so she needs a larger separation radius (e.g., 2.0)
this.bodyRadius = (this.data.level === 3) ? 2.0 : 1.2; 

if (this.hitbox && this.data.level === 3) { 
    this.hitbox.scale.set(1.5, 1.5, 1.5); 
} 
    },
    upgrade: function() { 
if(this.data.level < 3) { 
    this.data.level++; 
    this.updateStats(); 
    spawnDamageText("LEVEL UP!", this.el.object3D.position, true, true); 
    spawnExplosion(this.el.object3D.position, 0x00ff00, 15); 
} 
    },
    
    tick: function(t, dt) {
if(!GAME.active || GAME.paused || this.isDead) return;

const myPos = this.el.object3D.position;
const separation = new THREE.Vector3(); 
let count = 0;
GAME.allies.forEach(allyEl => { 
    if (!allyEl || allyEl === this.el) return; 
    const dist = myPos.distanceTo(allyEl.object3D.position); 
    if (dist < this.bodyRadius) { 
        separation.add(myPos.clone().sub(allyEl.object3D.position).normalize()); 
        count++; 
    } 
});
if (count > 0) { 
    separation.divideScalar(count).multiplyScalar(0.05); 
    myPos.add(separation); 
}

let closestEnemy = null; 
let minD = 999;
let searchRange = (GAME.allyCmdState === 2) ? 500 : 10; 

GAME.enemyHitboxes.forEach(hitbox => { 
    const el = hitbox.userData.el; 
    if(el && (el.components['enemy-logic'] || el.components['boss-logic'])) { 
        const d = myPos.distanceTo(el.object3D.position); 
        if(d < minD && d < searchRange) { minD = d; closestEnemy = el; } 
    } 
});

let moveTarget = null;
let shouldAttack = false;

if (closestEnemy && minD < this.stats.range) {
    shouldAttack = true;
}

if (shouldAttack) {
    const atkRate = this.stats.atkSpd * 1000;
    this.el.object3D.lookAt(closestEnemy.object3D.position);
    if(Date.now() - this.lastAtk > atkRate) { 
        this.lastAtk = Date.now(); 
        this.el.setAttribute('animation-mixer', {clip: this.stats.anim.atk, loop: 'once'}); 
        setTimeout(() => { 
            if(closestEnemy.components['enemy-logic']) closestEnemy.components['enemy-logic'].hit(this.stats.dmg); 
            if(closestEnemy.components['boss-logic']) closestEnemy.components['boss-logic'].hit(this.stats.dmg); 
        }, 500); 
    }
} else {
    if (GAME.allyCmdState === 0) {
        const playerPos = document.getElementById('player').object3D.position;
        if (myPos.distanceTo(playerPos) > 4.0) { 
            moveTarget = playerPos;
        }
    }
    else if (GAME.allyCmdState === 1) {
        const wellPos = document.getElementById('moon-well').object3D.position;
        if (closestEnemy) {
            moveTarget = closestEnemy.object3D.position;
        } else if (myPos.distanceTo(wellPos) > 12.0) {
            moveTarget = wellPos;
        }
    }
    else if (GAME.allyCmdState === 2) {
        if (closestEnemy) {
            moveTarget = closestEnemy.object3D.position;
        } else {
            const wellPos = document.getElementById('moon-well').object3D.position;
            if(myPos.distanceTo(wellPos) > 15.0) moveTarget = wellPos; 
        }
    }

    if (moveTarget) {
        this.el.object3D.lookAt(moveTarget); 
        this.el.object3D.translateZ(0.06); 
        this.el.setAttribute('animation-mixer', {clip: this.stats.anim.run, loop: 'repeat'}); 
    } else {
        this.el.setAttribute('animation-mixer', {clip: this.stats.anim.idle, loop: 'repeat'}); 
    }
}
    },
    hit: function(dmg) { 
this.currentHP -= dmg; 
spawnDamageText(Math.round(dmg), this.el.object3D.position, false, false); 
if(this.currentHP <= 0 && !this.isDead) { 
    this.isDead = true; 
    this.isConnected = false; 
    this.el.setAttribute('animation-mixer', {clip: this.stats.anim.die, loop: 'once', clampWhenFinished: true}); 
    setTimeout(() => { if(this.el.parentNode) this.el.parentNode.removeChild(this.el); }, 2000); 
} 
    }
});


AFRAME.registerComponent('game-logic', {
    init: function() { this.toSpawn = 0; this.timer = 0; this.ascensionSpawnTimer = 0; },
    tick: function(t, dt) {
        if(!GAME.active || GAME.paused) return; 
        if(GAME.combo > 0) { GAME.comboTimer -= dt; if(GAME.comboTimer <= 0) { GAME.combo = 0; updateComboUI(); } }
        if (GAME.isAscending) {
            GAME.survivalTime -= (dt / 1000); const timerEl = document.getElementById('event-timer'); const min = Math.floor(GAME.survivalTime / 60); const sec = Math.floor(GAME.survivalTime % 60); timerEl.innerText = `${min}:${sec < 10 ? '0'+sec : sec}`;
            this.ascensionSpawnTimer += dt; if (this.ascensionSpawnTimer > 200) { this.ascensionSpawnTimer = 0; this.spawnSiegeEnemy(); } updateMinimap(); return;
        }
        if(GAME.toSpawn > 0) {
            const spawnDelay = GAME.wave <= 2 ? 1800 : (GAME.wave <= 4 ? 1400 : 1000);
            const maxOnField = GAME.wave <= 2 ? 8 : 20;
            this.timer += dt;
            if(this.timer > spawnDelay && GAME.enemyHitboxes.length < maxOnField) { this.timer = 0; this.spawn(); }
        } updateMinimap();
    },
    spawn: function() {
        GAME.toSpawn--; const wave = GAME.wave; let types = ['grunt']; if(wave >= 3) types.push('runner'); if(wave >= 5) types.push('wizard'); if(wave >= 7) types.push('tank'); if(wave >= 9) types.push('skeleton');
        const type = types[Math.floor(Math.random()*types.length)]; const el = document.createElement('a-entity'); el.classList.add('enemy'); 
        
        // --- 3 LANE SPAWN ---
        const lanes = [0, (2*Math.PI)/3, (4*Math.PI)/3];
        const laneAngle = lanes[Math.floor(Math.random() * lanes.length)];
        const variance = (Math.random() - 0.5) * 0.5; 
        const angle = laneAngle + variance;
        const r = 75; 
        // --------------------

        el.setAttribute('position', `${Math.cos(angle)*r} 0 ${Math.sin(angle)*r}`);
        const hpScale = wave <= 3 ? 0.6 : 1.0;
        const hp = Math.round(ENEMIES[type].hp + (wave * 10 * hpScale)); 
        const isElite = (Math.random() < 0.05);
        el.setAttribute('enemy-logic', {type: type, hp: isElite ? hp*2.5 : hp, maxHp: isElite ? hp*2.5 : hp, isElite: isElite}); this.el.sceneEl.appendChild(el); updateHUD();
    },
    spawnSiegeEnemy: function() {
        const type = ['grunt', 'runner', 'tank', 'wizard', 'skeleton'][Math.floor(Math.random()*5)]; const el = document.createElement('a-entity'); el.classList.add('enemy'); 
        
        // --- 3 LANE SPAWN ---
        const lanes = [0, (2*Math.PI)/3, (4*Math.PI)/3];
        const laneAngle = lanes[Math.floor(Math.random() * lanes.length)];
        const variance = (Math.random() - 0.5) * 0.5; 
        const angle = laneAngle + variance;
        const r = 75; 
        // --------------------

        el.setAttribute('position', `${Math.cos(angle)*r} 0 ${Math.sin(angle)*r}`); const hp = (ENEMIES[type].hp + (GAME.wave * 20)) * 1.5; el.setAttribute('enemy-logic', {type: type, hp: hp, maxHp: hp}); this.el.sceneEl.appendChild(el);
    }
});
