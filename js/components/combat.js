AFRAME.registerComponent('arrow-physics', {
    schema: { 
vx: {type:'number'}, vy: {type:'number'}, vz: {type:'number'}, 
damage: {type:'number'}, 
gravity: {type:'number', default: 9.8},
drag: {type:'number', default: 0.01}
    },
    init: function() { 
this.velocity = new THREE.Vector3(this.data.vx, this.data.vy, this.data.vz); 
const speed = this.velocity.length();
this.life = Math.max(2.2, speed > 0 ? 70 / speed : 2.2);
this.raycaster = new THREE.Raycaster(); 
this.hitEntities = []; 
this.isStuck = false; 
    },
    tick: function(t, dt) {
if (typeof GAME === 'undefined' || GAME.paused) return;

const delta = dt / 1000; 
this.life -= delta; 
if(this.life <= 0) { this.el.remove(); return; }

if (this.isStuck) return;

// Physics
this.velocity.multiplyScalar(1 - (this.data.drag * 60 * delta));
this.velocity.y -= this.data.gravity * delta; 

const curr = this.el.object3D.position.clone(); 
const move = this.velocity.clone().multiplyScalar(delta); 
const next = curr.clone().add(move);

// Ground Collision
if (next.y <= 0.05) {
    this.isStuck = true;
    this.el.object3D.position.set(next.x, 0.05, next.z);
    this.el.object3D.rotation.x += (Math.random() - 0.5) * 0.4;
    this.el.object3D.rotation.z += (Math.random() - 0.5) * 0.4;
    if (typeof spawnExplosion === 'function') spawnExplosion(this.el.object3D.position, 0x885522, 5);
    this.el.removeAttribute('meteor-trail');
    return;
}

this.el.object3D.lookAt(next);

// Enemy Collision
if (GAME.enemyHitboxes && GAME.enemyHitboxes.length > 0) {
    const validHitboxes = GAME.enemyHitboxes.filter(h => h && h.parent);
    this.raycaster.set(curr, this.velocity.clone().normalize()); 
    this.raycaster.far = move.length(); 
    
    const hits = this.raycaster.intersectObjects(validHitboxes, false);
    if(hits.length > 0) {
        for(let i=0; i<hits.length; i++) {
            const targetEl = hits[i].object.userData.el;
            if(targetEl && !this.hitEntities.includes(targetEl)) {
                const hitPoint = hits[i].point;

                if (targetEl.components['enemy-logic']) { 
                    this.impactEnemy(targetEl, hits[i].point.y, hitPoint); 
                    this.hitEntities.push(targetEl); 
                }
                else if (targetEl.components['boss-logic']) { 
                    this.impactBoss(targetEl, hitPoint); 
                    this.hitEntities.push(targetEl); 
                }
                
                let maxHits = 1; 
                if (GAME.spectralLevel > 0) { maxHits = 2 + GAME.spectralLevel; }
                
                if(this.hitEntities.length >= maxHits) { 
                    this.el.remove(); 
                    return; 
                }
            }
        }
    }
}
this.el.object3D.position.copy(next); 
    },
    
    impactEnemy: function(targetEl, hitY, hitPoint) {
const logic = targetEl.components['enemy-logic']; if(!logic) return;
let finalDmg = this.data.damage; 
let isHeadshot = false; 
const topOfHitbox = targetEl.object3D.position.y + (logic.dataDef.headY * 1.8);
if (hitY > (topOfHitbox - 1.0)) { finalDmg *= 2; isHeadshot = true; }

const killed = logic.hit(finalDmg); 
this.triggerHitMarker(killed, isHeadshot);

if (typeof spawnDamageText === 'function') spawnDamageText(Math.round(finalDmg), hitPoint, isHeadshot); 
if (typeof spawnExplosion === 'function') spawnExplosion(hitPoint, isHeadshot ? 0xffaa00 : 0xff3333, isHeadshot ? 18 : 14);
if (typeof triggerCameraShake === 'function') triggerCameraShake(isHeadshot ? 0.08 : 0.05, isHeadshot ? 180 : 120); 

// --- IMPROVED FIRE VFX ---
if(GAME.fireLevel > 0) { 
    const rad = 3 + (GAME.fireLevel*1); 
    const fDmg = this.data.damage * 0.5; 
    
    // 視覺：三層爆炸效果 (時間加長，層次變多)
    this.createLayeredFireBlast(hitPoint, rad);

    GAME.enemyHitboxes.forEach(hitbox => { 
        const el = hitbox.userData.el; 
        if(el && el.components['enemy-logic'] && el !== targetEl) {
            if (el.object3D.position.distanceTo(targetEl.object3D.position) < rad) { 
                el.components['enemy-logic'].hit(fDmg); 
            } 
        } 
    }); 
}

// --- IMPROVED LIGHTNING VFX ---
if(GAME.zapLevel > 0) {
    if (typeof spawnExplosion === 'function') spawnExplosion(hitPoint, 0x00ffff, 8);
    this.chain(targetEl, 2 + GAME.zapLevel, this.data.damage * 0.5, [targetEl]);
}
    },

    impactBoss: function(targetEl, hitPoint) {
const logic = targetEl.components['boss-logic']; if(!logic) return;
let damage = this.data.damage; let isHeadshot = false; 
if (hitPoint.y > 20.0) { damage *= 2; isHeadshot = true; }

const killed = logic.hit(damage);
this.triggerHitMarker(killed, isHeadshot);
if (typeof spawnDamageText === 'function') spawnDamageText(Math.round(damage), hitPoint, isHeadshot); 
if (typeof spawnExplosion === 'function') spawnExplosion(hitPoint, 0xff0000, 10);
    },

    triggerHitMarker: function(killed, headshot) {
const marker = document.getElementById('hit-marker'); 
if(marker) {
    marker.style.display = 'block'; marker.classList.remove('active'); void marker.offsetWidth; marker.classList.add('active'); marker.classList.remove('kill', 'headshot');
    if (killed) marker.classList.add('kill'); else if (headshot) marker.classList.add('headshot');
    const duration = killed ? 450 : (headshot ? 350 : 280);
    setTimeout(() => { marker.classList.remove('active'); marker.style.display = 'none'; }, duration);
}
const flash = document.getElementById('hit-flash');
if (flash) {
    flash.classList.remove('active', 'kill', 'headshot');
    void flash.offsetWidth;
    flash.classList.add('active');
    if (killed) flash.classList.add('kill');
    else if (headshot) flash.classList.add('headshot');
    setTimeout(() => flash.classList.remove('active', 'kill', 'headshot'), killed ? 200 : 120);
}
    },

    // --- NEW: LAYERED FIRE SYSTEM ---
    createLayeredFireBlast: function(pos, radius) {
// 1. Core Flash (快速，亮黃色，瞬間消失)
this.createSphere(pos, radius * 0.5, '#ffffaa', 0.8, 150, 'easeOutQuad');

// 2. Shockwave (中速，橘紅色，主要的視覺範圍)
setTimeout(() => {
    this.createSphere(pos, radius, '#ff4400', 0.6, 400, 'easeOutQuad');
}, 50);

// 3. Heat Haze / Smoke (慢速，暗紅色，停留最久)
setTimeout(() => {
    this.createSphere(pos, radius * 1.2, '#550000', 0.3, 800, 'linear');
}, 100);
    },

    createSphere: function(pos, targetRadius, color, startOpacity, duration, easing) {
const sphere = document.createElement('a-entity');
sphere.setAttribute('geometry', 'primitive: sphere; radius: 0.1');
sphere.setAttribute('material', `shader: flat; color: ${color}; transparent: true; opacity: ${startOpacity}; side: back`);
sphere.setAttribute('position', pos);

// 放大動畫
sphere.setAttribute('animation__scale', `property: scale; to: ${targetRadius} ${targetRadius} ${targetRadius}; dur: ${duration}; easing: ${easing}`);
// 淡出動畫
sphere.setAttribute('animation__fade', `property: material.opacity; to: 0; dur: ${duration}; easing: linear`);

this.el.sceneEl.appendChild(sphere);
setTimeout(() => { if(sphere.parentNode) sphere.parentNode.removeChild(sphere); }, duration + 50);
    },

    // --- NEW: FADING LIGHTNING SYSTEM ---
    chain: function(curr, jumps, dmg, visited) {
if(jumps <= 0) return; 
let near = null, min = 15; // 稍微增加連鎖距離
const cPos = curr.object3D.position;

GAME.enemyHitboxes.forEach(hitbox => { 
    const el = hitbox.userData.el; 
    if(el && el.components['enemy-logic'] && !visited.includes(el)) { 
        const d = cPos.distanceTo(el.object3D.position); 
        if(d < min) { min=d; near=el; } 
    } 
});

if(near) {
    const start = cPos.clone();
    const end = near.object3D.position.clone();
    
    this.drawJaggedLightning(start, end);
    near.components['enemy-logic'].hit(dmg); 
    visited.push(near); 
    
    if (typeof spawnExplosion === 'function') spawnExplosion(end, 0x00ffff, 8);
    setTimeout(() => this.chain(near, jumps-1, dmg, visited), 100);
}
    },

    drawJaggedLightning: function(start, end) {
const distance = start.distanceTo(end);
const segments = 6; // 增加折點，更曲折
const points = [];
points.push(start);

for (let i = 1; i < segments; i++) {
    const lerpVal = i / segments;
    const point = new THREE.Vector3().lerpVectors(start, end, lerpVal);
    // Jitter Amount
    point.x += (Math.random() - 0.5) * 1.5;
    point.y += (Math.random() - 0.5) * 1.5;
    point.z += (Math.random() - 0.5) * 1.5;
    points.push(point);
}
points.push(end);

// Container Entity for A-Frame Animation
const boltEntity = document.createElement('a-entity');
this.el.sceneEl.appendChild(boltEntity);

const group = new THREE.Group();

for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i+1];
    const dist = p1.distanceTo(p2);
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    
    // Core Bolt (Brighter, Thicker)
    const geo = new THREE.CylinderGeometry(0.06, 0.06, dist, 5);
    const mat = new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 1.0});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(mid); mesh.lookAt(p2); mesh.rotation.x += Math.PI / 2;
    
    // Glow Bolt (Larger, Cyan)
    const glowGeo = new THREE.CylinderGeometry(0.3, 0.3, dist, 5); // 光暈加粗
    const glowMat = new THREE.MeshBasicMaterial({color: 0x00ffff, transparent: true, opacity: 0.5});
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.position.copy(mid); glowMesh.lookAt(p2); glowMesh.rotation.x += Math.PI / 2;

    group.add(mesh);
    group.add(glowMesh);
}

boltEntity.setObject3D('mesh', group);

// 使用 A-Frame 動畫系統來做「淡出」
// 這會讓閃電停留一下，然後慢慢變透明，總共 400ms
boltEntity.setAttribute('animation', 'property: object3D.visible; from: true; to: false; dur: 400; easing: easeInQuad');

// 這裡需要手動 tween material opacity，因為 A-Frame animation 對 group 內的 material 支援有限
// 所以用一個簡單的 interval 來降 opacity
let op = 1.0;
const fadeInt = setInterval(() => {
    op -= 0.05;
    if(group) {
        group.traverse(child => {
            if(child.material) child.material.opacity = op;
        });
    }
    if(op <= 0) {
        clearInterval(fadeInt);
        if(boltEntity.parentNode) boltEntity.parentNode.removeChild(boltEntity);
    }
}, 20); // 每 20ms 降一次，約 400ms 消失
    }
});


AFRAME.registerComponent('enemy-projectile', {
    schema: {
        damage: {type: 'number', default: 10},
        speed: {type: 'number', default: 15},
        targetType: {type: 'string', default: 'well'},
        // V1.1 FIX: 加入明確的方向向量參數
        dirX: {type: 'number', default: 0},
        dirY: {type: 'number', default: 0},
        dirZ: {type: 'number', default: -1}
    },
    init: function() { this.life = 3.0; },
    tick: function(t, dt) {
        if (!GAME.active || GAME.paused) return;
        const delta = dt / 1000;
        this.life -= delta;
        if (this.life <= 0) { this.el.remove(); return; }
        
        // V1.1 FIX: 使用明確的方向向量進行移動，而非依賴旋轉
        this.el.object3D.position.x += this.data.dirX * this.data.speed * delta;
        this.el.object3D.position.y += this.data.dirY * this.data.speed * delta;
        this.el.object3D.position.z += this.data.dirZ * this.data.speed * delta;
        
        const myPos = this.el.object3D.position;
        
        const player = document.getElementById('player');
        if (player) {
            const distP = myPos.distanceTo(player.object3D.position);
            if (distP < 1.0) {
                GAME.playerHP -= this.data.damage;
                if (typeof triggerDirectionalDamage === 'function') triggerDirectionalDamage(this.el.object3D.position);
                updateHUD();
                if (GAME.playerHP <= 0) gameOver();
                this.hitEffect();
                return;
            }
        }
        const well = document.getElementById('moon-well');
        if (well) {
            const distW = myPos.distanceTo(well.object3D.position);
            if (distW < 4.5) {
                GAME.wellHP -= this.data.damage;
                GAME.riftPoints = Math.max(0, Math.ceil(GAME.wellHP / 150));
                updateHUD();
                if (GAME.wellHP <= 0) gameOver();
                this.hitEffect();
                return;
            }
        }
        if (GAME.allies && GAME.allies.length > 0) {
            for (let ally of GAME.allies) {
                if (ally && ally.object3D) {
                    const distA = myPos.distanceTo(ally.object3D.position);
                    if (distA < 1.5) {
                        if (ally.components['ally-logic']) ally.components['ally-logic'].hit(this.data.damage);
                        this.hitEffect();
                        return;
                    }
                }
            }
        }
    },
    hitEffect: function() {
        // V1.1 FIX: 命中特效改為火橘色
        if (typeof spawnExplosion === 'function') spawnExplosion(this.el.object3D.position, 0xff6600, 5);
        if (typeof spawnDamageText === 'function') spawnDamageText("-" + Math.round(this.data.damage), this.el.object3D.position, false, false); 
        this.el.remove();
    }
});

