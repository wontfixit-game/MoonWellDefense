// --- RAYMOND'S V63 FINAL PATCH ---
window.addEventListener('load', function() {
    UI_BINDER.init(); 

    // 1. ARROW PHYSICS FIX
    const arrowComp = AFRAME.components['arrow-physics'];
    if (arrowComp) {
arrowComp.Component.prototype.impactPlayer = function(targetEl, hitPoint) {
    const logic = targetEl.components['monster-server'];
    if(logic) {
        logic.takeDamage(this.data.damage);
        if(typeof spawnExplosion === 'function') spawnExplosion(hitPoint, 0xff0000, 5);
    }
};

arrowComp.Component.prototype.tick = function(t, dt) {
    if (typeof GAME === 'undefined' || GAME.paused) return;
    const delta = dt / 1000; 
    this.life -= delta; 
    if(this.life <= 0) { this.el.remove(); return; }
    if (this.isStuck) return;

    this.velocity.multiplyScalar(1 - (this.data.drag * 60 * delta));
    this.velocity.y -= this.data.gravity * delta; 
    const curr = this.el.object3D.position.clone(); 
    const move = this.velocity.clone().multiplyScalar(delta); 
    const next = curr.clone().add(move);
    
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
                    } else if (targetEl.components['boss-logic']) { 
                        this.impactBoss(targetEl, hitPoint); 
                        this.hitEntities.push(targetEl); 
                    } else if (targetEl.components['monster-server']) {
                        this.impactPlayer(targetEl, hitPoint);
                        this.hitEntities.push(targetEl);
                    }
                    let maxHits = 1 + (GAME.spectralLevel || 0);
                    if(this.hitEntities.length >= maxHits) { this.el.remove(); return; }
                }
            }
        }
    }
    this.el.object3D.position.copy(next); 
};
    }

    // 2. HELPER
    function getArrowVelocity(el) {
if (el.components['arrow-physics'] && el.components['arrow-physics'].data) return el.components['arrow-physics'].data;
const attr = el.getAttribute('arrow-physics');
if (typeof attr === 'string') {
    const res = {vx:0, vy:0, vz:0};
    attr.split(';').forEach(p => { const parts = p.split(':'); if(parts.length===2) res[parts[0].trim()] = parseFloat(parts[1]); });
    return res;
}
return (typeof attr === 'object') ? attr : null;
    }

    // 3. NETWORK OBSERVER (V63 FIX: Use object3D.position directly)
    const scene = document.querySelector('a-scene');
    const observer = new MutationObserver((mutations) => {
mutations.forEach((mutation) => {
    if (mutation.addedNodes.length) {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && node.hasAttribute('arrow-physics')) {
                if (MP_CORE.active && MP_CORE.role === 'HOST') {
                    const vel = getArrowVelocity(node);
                    if (vel) {
                        // V63: Always use raw Object3D to avoid attribute parsing errors
                        const pos = node.object3D.position; 
                        MP_CORE.broadcastArrow(pos, vel);
                    }
                }
            }
        });
    }
});
    });
    observer.observe(scene, { childList: true, subtree: true });

    // 4. RAYMOND V63 CORE LOGIC
    
    // Override SpawnClient
    const _origSpawnClient = MP_CORE.spawnClient;
    MP_CORE.spawnClient = function(type) {
if (this.isSpawning) return;
this.isSpawning = true;
setTimeout(() => this.isSpawning = false, 2000); 

this.myClass = type;
const db = getEnemies();
const stats = (db && db[type]) ? db[type] : null;
this.mySpeed = (stats && stats.speed) ? stats.speed * 2.5 : 0.20;

this.sendCritical({op: 'SPAWN', type: type});

document.getElementById('mp-lobby').style.display = 'none';
document.getElementById('respawn-screen').style.display = 'none';
if(document.getElementById('start-screen')) document.getElementById('start-screen').style.display = 'none';
document.getElementById('mp-mobile-input').style.display = 'block';
document.getElementById('mp-lives').style.display = 'block';
document.getElementById('enemy-hud').style.display = 'flex';
document.getElementById('ranger-tracker').style.display = 'block';

this.setupClientScene(type);
this.setupTouchControls();
this.isDead = false;
if(this.clientLoop) clearInterval(this.clientLoop);
this.clientLoop = setInterval(() => this.clientTick(), 33);
    };

    // Override SpawnClientEntity
    const _origSpawnEntity = MP_CORE.spawnClientEntity;
    MP_CORE.spawnClientEntity = function(cId, type) {
const client = this.clients[cId];
const now = Date.now();
if (client.lastSpawnTime && (now - client.lastSpawnTime < 1000)) return; 
client.lastSpawnTime = now;

if(client.entity && client.entity.parentNode) {
    client.entity.parentNode.removeChild(client.entity);
}

const el = document.createElement('a-entity');
el.setAttribute('monster-server', 'type: ' + type);
el.setAttribute('class', 'mp-monster');
el.setAttribute('smooth-animator', '');

const ang = Math.random() * 6.28;
const sx = Math.cos(ang)*40;
const sz = Math.sin(ang)*40;
el.setAttribute('position', `${sx} 0 ${sz}`);
el.userData = { tx: sx, tz: sz, try: 0 };

document.querySelector('a-scene').appendChild(el);
client.entity = el;

// V63 FIX: FORCE UI UPDATE ON HOST SIDE
if(this.active) {
    MP_STATE.lives--; 
    // Directly update UI to ensure no race conditions
    const lifeEl = document.getElementById('mp-lives');
    if(lifeEl) lifeEl.innerText = `LIVES: ${MP_STATE.lives} / ${MP_STATE.maxLives}`;
    
    this.sendCritical({op: 'LIVES', cur: MP_STATE.lives, max: MP_STATE.maxLives});
}
    };

    // V63 FIX: Lives Sync & UI Sync
    MP_CORE.updateLives = function(data) {
MP_STATE.lives = data.cur; 
MP_STATE.maxLives = data.max;
this.lives = data.cur;

// V63: Force Client UI Update
const lifeEl = document.getElementById('mp-lives');
if(lifeEl) lifeEl.innerText = `LIVES: ${MP_STATE.lives} / ${MP_STATE.maxLives}`;

if(this.lives > 0 && this.isDead) {
    document.getElementById('rsp-msg').innerText = "READY TO SPAWN";
    document.getElementById('rsp-selector').style.pointerEvents = 'auto'; 
    document.getElementById('rsp-selector').style.opacity = '1';
}
    };

    // V63 FIX: Arrow Visibility (Added Light + World Position logic)
    MP_CORE.spawnVisualArrow = function(d) {
const scene = document.querySelector('a-scene');
const el = document.createElement('a-entity');
// Ensure inputs are numbers
const px=Number(d.px), py=Number(d.py), pz=Number(d.pz);
el.setAttribute('position', {x: px, y: py, z: pz});

const vis = document.createElement('a-entity');
vis.setAttribute('geometry', 'primitive: cylinder; height: 1.0; radius: 0.08'); // Thicker
vis.setAttribute('material', 'color: #00ffff; shader: flat'); // Flat shader is always visible
vis.setAttribute('rotation', '-90 0 0'); 
el.appendChild(vis);

// Add a light so it's impossible to miss
const light = document.createElement('a-light');
light.setAttribute('type', 'point');
light.setAttribute('color', '#00ffff');
light.setAttribute('intensity', '2.0');
light.setAttribute('distance', '5.0');
el.appendChild(light);

scene.appendChild(el);

const target = new THREE.Vector3(px + Number(d.vx), py + Number(d.vy), pz + Number(d.vz));
el.object3D.lookAt(target);

let life = 40; // Slightly longer life
const iv = setInterval(() => {
    el.object3D.position.x += d.vx * 0.03; 
    el.object3D.position.y += d.vy * 0.03; 
    el.object3D.position.z += d.vz * 0.03;
    life--; 
    if(life <= 0) { clearInterval(iv); if(el.parentNode) el.parentNode.removeChild(el); }
}, 33);
    };
    
    MP_CORE.clientTick = function() {
if(this.dummyPlayer && this.dummyPlayer.userData) {
    this.dummyPlayer.object3D.position.lerp(new THREE.Vector3(this.dummyPlayer.userData.tx, 0, this.dummyPlayer.userData.tz), 0.3);
    const curRy = this.dummyPlayer.object3D.rotation.y;
    const tgtRy = this.dummyPlayer.userData.try;
    this.dummyPlayer.object3D.rotation.y += (tgtRy - curRy) * 0.3;
}
if(this.isDead || !this.dummyMonster) return;

if(this.dummyPlayer) {
    const myP = this.dummyMonster.object3D.position;
    const tgP = this.dummyPlayer.object3D.position;
    const dx = tgP.x - myP.x; const dz = tgP.z - myP.z;
    const angle = Math.atan2(dx, -dz) * (180 / Math.PI);
    
    const camRot = this.dummyMonster.object3D.rotation.y * (180 / Math.PI);
    const screenAngle = angle + camRot; 
    
    const arrow = document.getElementById('tracker-arrow');
    if(arrow) arrow.style.transform = `translate(-50%, -50%) rotate(${screenAngle}deg) translateY(-150px)`;
}

if(Math.abs(this.inputs.lx) > 0.1) this.dummyMonster.object3D.rotation.y -= this.inputs.lx * 0.03;
let dx = this.inputs.x; let dy = this.inputs.y; 
if(Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0,1,0), this.dummyMonster.object3D.rotation.y);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0,1,0), this.dummyMonster.object3D.rotation.y);
    const moveVec = forward.multiplyScalar(dy * this.mySpeed).add(right.multiplyScalar(dx * this.mySpeed));
    const currPos = this.dummyMonster.object3D.position.clone();
    const nextPos = currPos.clone().add(moveVec);
    if (nextPos.length() < 75.0) this.dummyMonster.object3D.position.copy(nextPos);
    if(this.currAnim !== 'Run' && !this.animLock) {
        this.modelEntity.setAttribute('animation-mixer', 'clip: Run; loop: repeat; crossFadeDuration: 0.2');
        this.currAnim = 'Run';
    }
} else {
     if(this.currAnim === 'Run' && !this.animLock) {
        this.modelEntity.setAttribute('animation-mixer', 'clip: Idle; loop: repeat; crossFadeDuration: 0.2');
        this.currAnim = 'Idle';
    }
}
this.conn.send({ op: 'POS', x: this.dummyMonster.object3D.position.x, z: this.dummyMonster.object3D.position.z, ry: this.dummyMonster.object3D.rotation.y });
if(this.inputs.atk && !this.atkCooldown) {
    this.atkCooldown = true; this.animLock = true; 
    setTimeout(() => this.atkCooldown = false, 1000);
    setTimeout(() => { this.animLock = false; this.currAnim = ''; }, 800); 
    this.modelEntity.removeAttribute('animation-mixer');
    setTimeout(() => { this.modelEntity.setAttribute('animation-mixer', 'clip: Attack; loop: once; clampWhenFinished: true; crossFadeDuration: 0.05'); }, 20);
    this.sendCritical({op: 'ATK'});
}
    };

    MP_CORE.handleState = function(s) {
if(s.p && this.dummyPlayer) {
    if(!this.dummyPlayer.userData) this.dummyPlayer.userData = { tx: s.p.x, tz: s.p.z, try: s.p.ry };
    this.dummyPlayer.userData.tx = s.p.x; this.dummyPlayer.userData.tz = s.p.z; 
    this.dummyPlayer.userData.try = s.p.ry; 
}
if(s.r) s.r.forEach(id => { const el = this.enemyPool[id]; if(el && el.parentNode) el.parentNode.removeChild(el); delete this.enemyPool[id]; });
if(s.e) s.e.forEach(eData => {
    if(eData.isP && eData.i === this.myNetId) return;
    let el = this.enemyPool[eData.i];
    if(!el) {
        el = document.createElement('a-entity');
        el.setAttribute('smooth-animator', 'target: .visual-model');
        const db = getEnemies(); const stats = (db && db[eData.t]) ? db[eData.t] : { model: '', scale: '1 1 1' };
        const inner = document.createElement('a-entity');
        if(stats.model) inner.setAttribute('gltf-model', stats.model);
        inner.setAttribute('scale', stats.scale); 
        inner.setAttribute('rotation', '0 180 0'); 
        inner.classList.add('visual-model');
        el.appendChild(inner);
        if(eData.isP) {
            const tag = document.createElement('a-text'); tag.setAttribute('value', 'TEAM');
            tag.setAttribute('align', 'center'); tag.setAttribute('position', '0 3 0'); tag.setAttribute('color', '#00ff00'); tag.setAttribute('scale', '5 5 5');
            el.appendChild(tag);
        }
        document.querySelector('a-scene').appendChild(el); this.enemyPool[eData.i] = el;
    }
    el.object3D.position.set(eData.x, 0, eData.z);
    if(eData.ry !== undefined) el.object3D.rotation.y = eData.ry;
});
if(s.hp !== undefined) {
     const pct = Math.max(0, Math.floor((s.hp / s.max) * 100)); 
     document.getElementById('e-hp-text').innerText = `HP: ${pct}%`;
     document.getElementById('e-hp-fill').style.width = `${pct}%`;
     if(s.hp <= 0 && !this.isDead && !this.isSpawning) this.triggerDeath();
}
    };

    const _origConnect = MP_CORE.connect;
    MP_CORE.connect = function(hostId) {
if(!hostId) { alert("Please enter ID"); return; }
this.peer = new Peer(null, {debug: 1}); 
this.peer.on('open', (myId) => {
    this.conn = this.peer.connect(hostId, { reliable: false });
    this.conn.on('open', () => {
        this.role = 'CLIENT'; this.active = true; this.myNetId = 'P' + this.peer.id; 
        this.lives = 5; 
        document.getElementById('mp-join').style.display = 'none';
        document.getElementById('mp-class').style.display = 'block';
    });
    this.conn.on('data', data => {
        if(data.op === 'STATE') this.handleState(data);
        if(data.op === 'LIVES') this.updateLives(data);
        if(data.op === 'DIE') this.triggerDeath();
        if(data.op === 'GAMEOVER') this.showVictory();
        if(data.op === 'FEEDBACK') this.showFeedback(data);
        if(data.op === 'ARROW') this.spawnVisualArrow(data);
    });
    setTimeout(() => { if(!this.active) alert("Connection Failed."); }, 3000);
});
    };

    MP_CORE.triggerDeath = function() {
const input = document.getElementById('mp-mobile-input');
if(input) input.style.setProperty('display', 'none', 'important');

if(MP_CORE.isDead) return;
MP_CORE.isDead = true;
document.getElementById('respawn-screen').style.display = 'flex';

let cd = 5;
const timerEl = document.getElementById('rsp-timer');
const selEl = document.getElementById('rsp-selector');
const msgEl = document.getElementById('rsp-msg');

selEl.style.pointerEvents = 'none'; 
selEl.style.opacity = '0.5'; 
msgEl.innerText = "RESPAWNING...";

const itv = setInterval(() => {
    cd--; 
    timerEl.innerText = cd;
    if(cd <= 0) {
        clearInterval(itv);
        const currentLives = (MP_CORE.lives === undefined) ? 5 : MP_CORE.lives;
        if(currentLives > 0) {
            timerEl.innerText = "SELECT CLASS";
            selEl.style.pointerEvents = 'auto';
            selEl.style.opacity = '1';
            msgEl.innerText = "";
        } else {
            timerEl.innerText = "OUT OF LIVES";
            msgEl.innerText = "Wait for Next Wave...";
        }
    }
}, 1000);
    };

    // V63 FIX: SYNC WELL HP
    const _origInitGame = window.initGame;
    window.initGame = function() {
if(_origInitGame) _origInitGame();
// V63: Sync MP_STATE with GAME Defaults
MP_STATE.wellHP = GAME.wellHP;
MP_STATE.maxWellHP = GAME.maxWellHP;

if(MP_CORE.active && MP_CORE.role === 'HOST') {
    setTimeout(() => MP_CORE.respawnAllClients(), 500); 
}
    };
    
    // Wave Revive
    const _origStartWave = window.startNextWave;
    window.startNextWave = function() {
if(_origStartWave) _origStartWave();
if(MP_CORE.active && MP_CORE.role === 'HOST') {
    MP_STATE.lives = Math.min(MP_STATE.maxLives + 2, 10);
    MP_CORE.sendCritical({op: 'LIVES', cur: MP_STATE.lives, max: MP_STATE.maxLives});
}
    };
    
    const _origCheckWave = window.checkWave;
    window.checkWave = function() {
if(GAME.enemyHitboxes) {
    for(let i = GAME.enemyHitboxes.length - 1; i >= 0; i--) {
        const box = GAME.enemyHitboxes[i];
        if(!box.parent || !box.userData || !box.userData.el || !box.userData.el.parentNode) {
            GAME.enemyHitboxes.splice(i, 1);
        }
    }
}
const players = document.querySelectorAll('.mp-monster');
if(players.length > 0) return;
if(_origCheckWave) _origCheckWave();
    };
    
    const _origGO = window.gameOver;
    window.gameOver = function() {
if(MP_CORE.active && MP_CORE.role === 'HOST') MP_CORE.sendGameOver();
if(_origGO) _origGO();
    };
    
    window.onload = function() { console.log("Game Loaded. v63 Patch Active."); };
});
