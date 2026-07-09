/**
 * MOON WELL VERSUS ENGINE v58
 * - PHY: Restored FULL Physics Logic in Arrow Tick
 * - PHY: Fixed syntax error causing frozen arrows
 * - INCLUDES: Player Hit Registration + Zero Latency Sync
 */

// --- 1. REACTIVE STATE ENGINE ---
const createReactiveState = (initialState) => {
    const subscribers = {};
    return new Proxy(initialState, {
set(target, prop, value) {
    target[prop] = value;
    if(subscribers[prop]) subscribers[prop].forEach(cb => cb(value));
    return true;
},
get(target, prop) {
    if(prop === 'subscribe') {
        return (key, cb) => {
            if(!subscribers[key]) subscribers[key] = [];
            subscribers[key].push(cb);
            cb(target[key]); 
        };
    }
    return target[prop];
}
    });
};

const MP_STATE = createReactiveState({
    hp: 100, maxHp: 100, wellHP: 1000, maxWellHP: 1000,
    lives: 5, maxLives: 5, gold: 0, foes: 0, active: false
});

// --- 2. UI BINDER ---
const UI_BINDER = {
    init: function() {
MP_STATE.subscribe('hp', val => {
    const bar = document.getElementById('hp-bar-fill'); 
    if(bar) bar.style.width = Math.max(0, (val / MP_STATE.maxHp) * 100) + '%';
    if(val <= 0 && MP_CORE.active && MP_CORE.role === 'HOST') window.gameOver(); 
});
MP_STATE.subscribe('wellHP', val => {
    const bar = document.getElementById('well-bar-fill'); 
    if(bar) bar.style.width = Math.max(0, (val / MP_STATE.maxWellHP) * 100) + '%';
    if(val <= 0 && MP_CORE.active && MP_CORE.role === 'HOST') window.gameOver();
});
MP_STATE.subscribe('lives', val => {
    const el = document.getElementById('mp-lives');
    if(el) el.innerText = `LIVES: ${val} / ${MP_STATE.maxLives}`;
});
MP_STATE.subscribe('hp', v => { if(typeof GAME !== 'undefined') GAME.playerHP = v; });
MP_STATE.subscribe('wellHP', v => { if(typeof GAME !== 'undefined') GAME.wellHP = v; });
MP_STATE.subscribe('gold', v => { if(typeof GAME !== 'undefined') GAME.gold = v; });
    }
};

// --- 3. COMPONENTS ---
AFRAME.registerComponent('smooth-animator', {
    schema: { target: {type:'selector', default: null}, active: {default: true} },
    init: function() {
this.lastPos = new THREE.Vector3();
this.lastPos.copy(this.el.object3D.position);
this.currAnim = 'Idle';
    },
    tick: function(t, dt) {
if(!this.data.active || dt < 10) return;
const currentPos = this.el.object3D.position;
const speed = currentPos.distanceTo(this.lastPos) / (dt/1000); 
this.lastPos.copy(currentPos);

let targetEl = this.data.target || this.el;
if(!this.data.target && this.el.children.length > 0 && !this.el.hasAttribute('gltf-model')) {
     const v = this.el.querySelector('.visual-model') || this.el.querySelector('[gltf-model]');
     if(v) targetEl = v;
}

if(speed > 0.5) {
    if(this.currAnim !== 'Run') {
        targetEl.setAttribute('animation-mixer', 'clip: Run; loop: repeat; crossFadeDuration: 0.2');
        this.currAnim = 'Run';
    }
} else {
     if(this.currAnim !== 'Idle') {
        targetEl.setAttribute('animation-mixer', 'clip: Idle; loop: repeat; crossFadeDuration: 0.2');
        this.currAnim = 'Idle';
    }
}
    }
});

function getEnemies() {
    if(typeof ENEMIES !== 'undefined') return ENEMIES;
    if(window.ENEMIES) return window.ENEMIES;
    return {};
}

let _netIdCounter = 1000;
function genNetId() { return _netIdCounter++; }

const MP_CORE = {
    peer: null, conn: null, role: 'SOLO', active: false,
    inputs: { x: 0, y: 0, lx: 0, ly: 0, atk: false },
    myClass: 'grunt',
    clients: {}, enemyPool: {}, knownEntities: {},
    mySpeed: 0.20, animLock: false, isSpawning: false, 

    solo: function() {
document.getElementById('mp-lobby').style.display = 'none';
if(document.getElementById('start-screen')) {
    document.getElementById('start-screen').style.display = 'flex';
} else {
    window.initGame();
}
    },

    tryCreateHostPeer: function() {
const id = Math.floor(Math.random() * 90000) + 10000;
if(this.peer) this.peer.destroy();
this.peer = new Peer(id.toString(), {debug: 1});
this.peer.on('open', (id) => {
    document.getElementById('host-id-disp').innerText = id;
    this.setupHostListeners();
});
this.peer.on('error', (err) => {
    if(err.type === 'unavailable-id') this.tryCreateHostPeer();
    else alert("Net Error: " + err.type);
});
    },
    
    setupHostListeners: function() {
this.peer.on('connection', conn => {
    const cId = conn.peer;
    this.clients[cId] = { conn: conn, entity: null, lastAtk: 0, type: 'grunt' };
    conn.on('open', () => this.updateLobbyUI());
    conn.on('data', data => {
        if(data.op === 'POS') this.handleClientPos(cId, data);
        if(data.op === 'ATK') this.handleClientAtk(cId, data);
        if(data.op === 'SPAWN') {
            this.clients[cId].type = data.type; 
            this.updateLobbyUI();
            if(this.active) this.spawnClientEntity(cId, data.type);
        }
    });
    conn.on('close', () => {
        if(this.clients[cId].entity) this.clients[cId].entity.parentNode.removeChild(this.clients[cId].entity);
        delete this.clients[cId];
        this.updateLobbyUI();
    });
});
    },
    
    updateLobbyUI: function() {
const count = Object.keys(this.clients).length;
const list = document.getElementById('lobby-player-list');
list.innerHTML = '';
document.getElementById('lobby-status').innerText = `CONNECTED: ${count} / 3`;
for(let cId in this.clients) {
    const type = this.clients[cId].type.toUpperCase();
    const div = document.createElement('div');
    div.className = 'lobby-p-item';
    div.innerText = `PLAYER [${type}]`;
    list.appendChild(div);
}
if(count > 0 && !this.active) document.getElementById('host-start-btn').style.display = 'inline-block';
    },

    host: function() {
document.getElementById('mp-main').style.display = 'none';
document.getElementById('mp-host').style.display = 'block';
this.tryCreateHostPeer();
    },
    
    startHostGame: function() {
this.role = 'HOST';
this.active = true;
MP_STATE.active = true;

const pCount = Object.keys(this.clients).length;
if(pCount === 1) MP_STATE.lives = 5;
else if(pCount === 2) MP_STATE.lives = 8;
else MP_STATE.lives = 12;
MP_STATE.maxLives = MP_STATE.lives;

for(let i=0; i<10; i++) {
     setTimeout(() => {
         this.sendCritical({op: 'LIVES', cur: MP_STATE.lives, max: MP_STATE.maxLives});
     }, i*100);
}
this.setupHostGame();
    },

    setupHostGame: function() {
document.getElementById('mp-lobby').style.display = 'none';
document.getElementById('net-stat').style.display = 'block';
document.getElementById('net-stat').innerText = "HOSTING";

if(document.getElementById('start-screen')) document.getElementById('start-screen').style.display = 'flex';
else window.initGame();

setInterval(() => this.broadcastState(), 50);
this.currentWave = 1; 

setInterval(() => {
    if(typeof GAME !== 'undefined' && GAME.wave > this.currentWave) this.currentWave = GAME.wave;
    this.sendCritical({op: 'LIVES', cur: MP_STATE.lives, max: MP_STATE.maxLives}); 
}, 1000);
    },
    
    respawnAllClients: function() {
for(let cId in this.clients) {
    const c = this.clients[cId];
    if(c.type) this.spawnClientEntity(cId, c.type);
}
    },
    
    spawnClientEntity: function(cId, type) {
if(this.clients[cId].entity && this.clients[cId].entity.parentNode) {
    this.clients[cId].entity.parentNode.removeChild(this.clients[cId].entity);
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
this.clients[cId].entity = el;

if(this.active) {
    MP_STATE.lives--; 
    this.sendCritical({op: 'LIVES', cur: MP_STATE.lives, max: MP_STATE.maxLives});
}
    },

    handleClientPos: function(cId, data) {
const el = this.clients[cId].entity;
if(el) {
    if(!el.userData) el.userData = { tx: data.x, tz: data.z, try: data.ry };
    el.userData.tx = data.x;
    el.userData.tz = data.z;
    el.userData.try = data.ry;
}
    },

    handleClientAtk: function(cId, data) {
const client = this.clients[cId];
if(!client || !client.entity) return;

const now = Date.now();
if(now - client.lastAtk < 500) return; 
client.lastAtk = now;

const el = client.entity;
const visual = el.querySelector('.visual-model');
if(visual) {
    el.setAttribute('smooth-animator', 'active: false');
    visual.removeAttribute('animation-mixer');
    setTimeout(() => { visual.setAttribute('animation-mixer', 'clip: Attack; loop: once; clampWhenFinished: true; crossFadeDuration: 0.05'); }, 20);
    setTimeout(() => { el.setAttribute('smooth-animator', 'active: true'); }, 800);
}

const ranger = document.getElementById('player');
const tower = document.getElementById('moon-well'); 
let hitRanger = false;
let hitCore = false;
const mPos = new THREE.Vector3();
el.object3D.getWorldPosition(mPos);

if(ranger) {
    const rPos = new THREE.Vector3();
    ranger.object3D.getWorldPosition(rPos);
    if(mPos.distanceTo(rPos) < 5.0) {
        MP_STATE.hp -= 20;
        window.spawnDamageText("PLAYER HIT!", rPos, true, false); 
        hitRanger = true;
    } 
}

if (!hitRanger) {
    const distToCenter = mPos.distanceTo(new THREE.Vector3(0,0,0));
    let distToObj = 999;
    if (tower) {
        const tPos = new THREE.Vector3();
        tower.object3D.getWorldPosition(tPos);
        distToObj = mPos.distanceTo(tPos);
    }
    if (distToCenter < 8.0 || distToObj < 8.0) {
         MP_STATE.wellHP -= 20;
         const textPos = tower ? tower.object3D.position : new THREE.Vector3(0,2,0);
         window.spawnDamageText("CORE HIT!", textPos, true, false);
         hitCore = true;
    }
}

if (hitRanger) this.sendToClient(cId, {op: 'FEEDBACK', hit: true, type: 'PLAYER'});
else if (hitCore) this.sendToClient(cId, {op: 'FEEDBACK', hit: true, type: 'CORE'});
else this.sendToClient(cId, {op: 'FEEDBACK', hit: false});
    },
    
    // v56: Called by MutationObserver
    broadcastArrow: function(pos, vel) {
this.broadcastAll({ op: 'ARROW', px: pos.x, py: pos.y, pz: pos.z, vx: vel.x, vy: vel.y, vz: vel.z });
    },

    sendCritical: function(packet) {
for(let i=0; i<5; i++) setTimeout(() => this.broadcastAll(packet), i*30);
    },
    
    sendToClient: function(cId, packet) {
if(this.clients[cId] && this.clients[cId].conn) this.clients[cId].conn.send(packet);
    },

    broadcastAll: function(packet) {
for(let cId in this.clients) {
    if(this.clients[cId].conn) this.clients[cId].conn.send(packet);
}
    },

    broadcastState: function() {
if(!this.active) return;
try {
    for(let cId in this.clients) {
        const el = this.clients[cId].entity;
        if(el && el.userData) {
            el.object3D.position.lerp(new THREE.Vector3(el.userData.tx, 0, el.userData.tz), 0.3);
            const curRy = el.object3D.rotation.y;
            const tgtRy = el.userData.try;
            el.object3D.rotation.y += (tgtRy - curRy) * 0.3;
        }
    }

    const currentEntities = {};
    const aiEnts = document.querySelectorAll('[enemy-logic]'); 
    aiEnts.forEach(el => {
        const logic = el.components['enemy-logic'];
        if(!logic.netId) logic.netId = genNetId();
        if(logic && !logic.isDead && logic.data.hp > 0 && !el.classList.contains('mp-monster')) { 
            const ePos = el.object3D.position;
            currentEntities[logic.netId] = { i: logic.netId, t: logic.data.type, x: ePos.x, z: ePos.z };
        }
    });
    for(let cId in this.clients) {
        const c = this.clients[cId];
        if(c.entity) {
            const ePos = c.entity.object3D.position;
            const pid = 'P'+cId;
            currentEntities[pid] = { i: pid, t: c.type, x: ePos.x, z: ePos.z, ry: c.entity.object3D.rotation.y, isP: true };
        }
    }
    
    const updates = [];
    const removals = [];
    for(let id in this.knownEntities) {
        if(!currentEntities[id]) {
            removals.push(id);
            delete this.knownEntities[id];
        }
    }
    for(let id in currentEntities) {
        const cur = currentEntities[id];
        const last = this.knownEntities[id];
        if(!last) {
            updates.push({ i: cur.i, t: cur.t, x: Math.round(cur.x*10)/10, z: Math.round(cur.z*10)/10, ry: cur.ry, isP: cur.isP });
            this.knownEntities[id] = { x: cur.x, z: cur.z };
        } else {
            const dx = Math.abs(cur.x - last.x);
            const dz = Math.abs(cur.z - last.z);
            if(dx > 0.01 || dz > 0.01) {
                updates.push({ i: cur.i, t: cur.t, x: Math.round(cur.x*10)/10, z: Math.round(cur.z*10)/10, ry: cur.ry, isP: cur.isP });
                this.knownEntities[id].x = cur.x;
                this.knownEntities[id].z = cur.z;
            }
        }
    }
    
    let pX=0, pZ=0, pRy=0;
    const p = document.getElementById('player');
    if(p) {
        const vec = new THREE.Vector3();
        p.object3D.getWorldPosition(vec);
        pX = vec.x; pZ = vec.z; pRy = p.object3D.rotation.y; 
        if(p.parentNode && p.parentNode.tagName === 'A-ENTITY') pRy += p.parentNode.object3D.rotation.y;
    }
    
    const packet = { op: 'STATE', p: { x: pX, z: pZ, ry: pRy } };
    if(updates.length > 0) packet.e = updates;
    if(removals.length > 0) packet.r = removals;
    
    for(let cId in this.clients) {
        const clientObj = this.clients[cId];
        if(clientObj.entity && clientObj.entity.components['monster-server']) {
            packet.hp = clientObj.entity.components['monster-server'].hp;
            packet.max = clientObj.entity.components['monster-server'].maxHp;
        } else { delete packet.hp; }
        if(clientObj.conn) clientObj.conn.send(packet);
    }
} catch(e) { console.error(e); }
    },
    
    sendGameOver: function() { for(let i=0; i<20; i++) setTimeout(() => this.broadcastAll({op: 'GAMEOVER'}), i*50); },
    sendDeath: function() { this.sendCritical({op: 'DIE'}); },
    joinMenu: function() { document.getElementById('mp-main').style.display = 'none'; document.getElementById('mp-join').style.display = 'block'; },

    connect: function(hostId) {
if(!hostId) { alert("Please enter ID"); return; }
this.peer = new Peer(null, {debug: 1}); 
this.peer.on('open', (myId) => {
    this.conn = this.peer.connect(hostId, { reliable: false });
    this.conn.on('open', () => {
        this.role = 'CLIENT'; this.active = true; this.myNetId = 'P' + this.peer.id; 
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
    },
    
    spawnVisualArrow: function(d) {
const scene = document.querySelector('a-scene');
const el = document.createElement('a-entity');
el.setAttribute('position', {x: d.px, y: d.py, z: d.pz});
const vis = document.createElement('a-entity');
vis.setAttribute('geometry', 'primitive: cylinder; height: 0.6; radius: 0.03');
vis.setAttribute('material', 'color: cyan; emissive: #0ff');
vis.setAttribute('rotation', '-90 0 0'); 
el.appendChild(vis);
scene.appendChild(el);
const target = new THREE.Vector3(d.px + d.vx, d.py + d.vy, d.pz + d.vz);
el.object3D.lookAt(target);
let life = 30;
const iv = setInterval(() => {
    el.object3D.position.x += d.vx * 0.03; el.object3D.position.y += d.vy * 0.03; el.object3D.position.z += d.vz * 0.03;
    life--; if(life <= 0) { clearInterval(iv); if(el.parentNode) el.parentNode.removeChild(el); }
}, 33);
    },
    
    showFeedback: function(data) {
const el = document.getElementById('hit-feedback');
if (data.type === 'CORE') { el.innerText = "CORE HIT"; el.className = "hit-core"; } 
else if (data.hit) { el.innerText = "HIT -20"; el.className = "hit-success"; } 
else { el.innerText = "TOO FAR"; el.className = "hit-fail"; }
el.style.opacity = '1'; el.style.transform = 'translate(-50%, -150%) scale(1.2)';
setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translate(-50%, -50%) scale(1.0)'; }, 500);
    },

    spawnClient: function(type) {
this.myClass = type;
const db = getEnemies();
const stats = (db && db[type]) ? db[type] : null;
this.mySpeed = (stats && stats.speed) ? stats.speed * 2.5 : 0.20;
this.isSpawning = true; setTimeout(() => this.isSpawning = false, 2000); 
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
    },
    
    sendCritical: function(packet) { if(!this.conn) return; for(let i=0; i<5; i++) setTimeout(() => this.conn.send(packet), i*20); },

    setupClientScene: function(type) {
const scene = document.querySelector('a-scene');
if(!this.dummyPlayer) {
    this.dummyPlayer = document.createElement('a-entity');
    this.dummyPlayer.userData = { tx: 0, tz: 0, try: 0 };
    const inner = document.createElement('a-entity');
    inner.setAttribute('gltf-model', '#model-bow');
    inner.setAttribute('rotation', '0 270 0'); 
    inner.classList.add('visual-model');
    this.dummyPlayer.setAttribute('smooth-animator', 'target: .visual-model'); 
    this.dummyPlayer.appendChild(inner);
    scene.appendChild(this.dummyPlayer);
}
if(this.dummyMonster) this.dummyMonster.parentNode.removeChild(this.dummyMonster);
if(this.camRig) this.camRig.parentNode.removeChild(this.camRig);
this.dummyMonster = document.createElement('a-entity');
this.dummyMonster.setAttribute('id', 'client-monster'); 
this.modelEntity = document.createElement('a-entity');
this.modelEntity.classList.add('visual-model');
const db = getEnemies();
const stats = (db && db[type]) ? db[type] : { model: '', scale: '1 1 1' };
if(stats.model) this.modelEntity.setAttribute('gltf-model', stats.model);
this.modelEntity.setAttribute('scale', stats.scale);
this.modelEntity.setAttribute('animation-mixer', 'clip: Idle; loop: repeat');
this.modelEntity.setAttribute('rotation', '0 180 0'); 
this.dummyMonster.appendChild(this.modelEntity);
scene.appendChild(this.dummyMonster);
this.dummyMonster.object3D.position.set(40,0,40);
this.camRig = document.createElement('a-entity');
this.camRig.setAttribute('camera-follow', 'target: #client-monster');
const pivot = document.createElement('a-entity');
pivot.setAttribute('position', '0 6 9');
pivot.setAttribute('rotation', '-25 0 0');
const cam = document.createElement('a-camera');
cam.setAttribute('look-controls', 'enabled:false');
pivot.appendChild(cam);
this.camRig.appendChild(pivot);
scene.appendChild(this.camRig);
    },

    clientTick: function() {
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
    const screenAngle = angle - camRot;
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
    },

    handleState: function(s) {
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
     const pct = Math.floor((s.hp / s.max) * 100);
     document.getElementById('e-hp-text').innerText = `HP: ${pct}%`;
     document.getElementById('e-hp-fill').style.width = `${pct}%`;
     if(s.hp <= 0 && !this.isDead && !this.isSpawning) this.triggerDeath();
}
    },
    
    updateLives: function(data) {
this.lives = data.cur; this.maxLives = data.max;
document.getElementById('mp-lives').innerText = `LIVES: ${this.lives} / ${this.maxLives}`;
if(this.lives > 0 && this.isDead) {
    document.getElementById('rsp-msg').innerText = "READY TO SPAWN";
    document.getElementById('rsp-selector').style.pointerEvents = 'auto'; document.getElementById('rsp-selector').style.opacity = '1';
}
    },
    showVictory: function() { document.getElementById('mp-end-screen').style.display = 'flex'; document.getElementById('mp-mobile-input').style.display = 'none'; document.getElementById('respawn-screen').style.display = 'none'; },
    triggerDeath: function() {
if(this.isDead) return; this.isDead = true;
document.getElementById('respawn-screen').style.display = 'flex'; document.getElementById('mp-mobile-input').style.display = 'none';
document.getElementById('enemy-hud').style.display = 'none'; document.getElementById('ranger-tracker').style.display = 'none';
let cd = 5; const timerEl = document.getElementById('rsp-timer'); const selEl = document.getElementById('rsp-selector'); const msgEl = document.getElementById('rsp-msg');
selEl.style.pointerEvents = 'none'; selEl.style.opacity = '0.5'; msgEl.innerText = "RESPAWNING...";
const itv = setInterval(() => {
    cd--; timerEl.innerText = cd;
    if(cd <= 0) {
        clearInterval(itv);
        if(this.lives > 0) { timerEl.innerText = "SELECT CLASS"; selEl.style.pointerEvents = 'auto'; selEl.style.opacity = '1'; msgEl.innerText = ""; }
        else { timerEl.innerText = "OUT OF LIVES"; msgEl.innerText = "Wait for Next Wave..."; }
    }
}, 1000);
    },
    selectRespawnClass: function(type) { if(this.lives <= 0) return; this.spawnClient(type); },
    setupTouchControls: function() {
const moveZone = document.getElementById('zone-move'); const stick = document.getElementById('mp-stick'); const knob = document.getElementById('mp-knob');
let moveId = null;
moveZone.addEventListener('touchstart', e => {
    e.preventDefault();
    for(let t of e.changedTouches) if(moveId === null) { moveId = t.identifier; stick.style.opacity = '1'; stick.style.left = (t.clientX - 50) + 'px'; stick.style.top = (t.clientY - 50) + 'px'; this.inputs.x = 0; this.inputs.y = 0; }
});
moveZone.addEventListener('touchmove', e => {
    e.preventDefault();
    for(let t of e.changedTouches) if(t.identifier === moveId) {
        const rect = stick.getBoundingClientRect(); const cx = rect.left + 50; const cy = rect.top + 50;
        const dist = Math.min(Math.sqrt((t.clientX-cx)**2 + (t.clientY-cy)**2), 50);
        const ang = Math.atan2(t.clientY-cy, t.clientX-cx);
        const kx = Math.cos(ang)*dist; const ky = Math.sin(ang)*dist;
        knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
        this.inputs.x = kx/50; this.inputs.y = ky/50;
    }
});
const endMove = () => { moveId=null; stick.style.opacity='0.5'; knob.style.transform='translate(-50%, -50%)'; this.inputs.x=0; this.inputs.y=0; };
moveZone.addEventListener('touchend', e => { for(let t of e.changedTouches) if(t.identifier===moveId) endMove(); });
let isMouseDown = false;
moveZone.addEventListener('mousedown', e => { e.preventDefault(); isMouseDown = true; stick.style.opacity = '1'; stick.style.left = (e.clientX - 50) + 'px'; stick.style.top = (e.clientY - 50) + 'px'; this.inputs.x = 0; this.inputs.y = 0; });
window.addEventListener('mousemove', e => {
    if(!isMouseDown) return; e.preventDefault();
    const rect = stick.getBoundingClientRect(); const cx = rect.left + 50; const cy = rect.top + 50;
    const dist = Math.min(Math.sqrt((e.clientX-cx)**2 + (e.clientY-cy)**2), 50); const ang = Math.atan2(e.clientY-cy, e.clientX-cx);
    const kx = Math.cos(ang)*dist; const ky = Math.sin(ang)*dist; knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    this.inputs.x = kx/50; this.inputs.y = ky/50;
});
window.addEventListener('mouseup', e => { if(isMouseDown) { isMouseDown = false; endMove(); } });
const lookZone = document.getElementById('zone-look'); let lookId = null; let lastLookX = 0;
lookZone.addEventListener('touchstart', e => { e.preventDefault(); for(let t of e.changedTouches) if(lookId === null) { lookId = t.identifier; lastLookX = t.clientX; } });
lookZone.addEventListener('touchmove', e => { e.preventDefault(); for(let t of e.changedTouches) if(t.identifier === lookId) { const dx = t.clientX - lastLookX; this.inputs.lx = dx; lastLookX = t.clientX; } });
lookZone.addEventListener('touchend', e => { for(let t of e.changedTouches) if(t.identifier===lookId) { lookId=null; this.inputs.lx=0; } });
let isLookDown = false;
lookZone.addEventListener('mousedown', e => { isLookDown = true; lastLookX = e.clientX; });
window.addEventListener('mousemove', e => { if(isLookDown) { const dx = e.clientX - lastLookX; this.inputs.lx = dx; lastLookX = e.clientX; } });
window.addEventListener('mouseup', e => { if(isLookDown) { isLookDown = false; this.inputs.lx = 0; } });
const atkBtn = document.getElementById('mp-atk-btn');
atkBtn.addEventListener('touchstart', e => { e.preventDefault(); this.inputs.atk = true; atkBtn.style.background='red'; });
atkBtn.addEventListener('touchend', e => { e.preventDefault(); this.inputs.atk = false; atkBtn.style.background='rgba(255,0,0,0.3)'; });
atkBtn.addEventListener('mousedown', e => { e.preventDefault(); this.inputs.atk = true; atkBtn.style.background='red'; });
atkBtn.addEventListener('mouseup', e => { e.preventDefault(); this.inputs.atk = false; atkBtn.style.background='rgba(255,0,0,0.3)'; });
    }
};

AFRAME.registerComponent('monster-server', {
    schema: { type: {type:'string'} },
    init: function() {
const db = getEnemies();
const stats = (db && db[this.data.type]) ? db[this.data.type] : {hp: 100, model:''};

this.modelEl = document.createElement('a-entity');
this.modelEl.classList.add('visual-model');
if(stats.model) this.modelEl.setAttribute('gltf-model', stats.model);
this.modelEl.setAttribute('scale', stats.scale || '1 1 1');
this.modelEl.setAttribute('animation-mixer', 'clip: Idle; loop: repeat');
this.modelEl.setAttribute('rotation', '0 180 0');
this.el.appendChild(this.modelEl);

this.hp = stats.hp * 2;
this.maxHp = this.hp;

let hitH = 2.5, hitR = 1.0;
if(this.data.type === 'tank') { hitH = 7.5; hitR = 2.5; } 

const hitGeo = new THREE.CylinderGeometry(hitR, hitR, hitH, 8);
const hitMat = new THREE.MeshBasicMaterial({visible: false});
this.hitbox = new THREE.Mesh(hitGeo, hitMat);
this.hitbox.userData.el = this.el; 
this.hitbox.userData.parentEl = this.el; 
this.hitbox.position.y = hitH / 2;
this.el.object3D.add(this.hitbox);
this.el.removeAttribute('enemy-logic');

// v57: HITBOX REGISTRATION (Crucial)
if (typeof GAME !== 'undefined' && GAME.enemyHitboxes) {
    GAME.enemyHitboxes.push(this.hitbox);
}
    },
    takeDamage: function(dmg) {
this.hp -= dmg;
if(window.spawnDamageText) window.spawnDamageText(dmg, this.el.object3D.position);
if(this.hp <= 0) {
    if(MP_CORE.active && MP_CORE.role === 'HOST') MP_CORE.sendDeath();
    if(typeof GAME !== 'undefined' && GAME.enemyHitboxes) {
        const idx = GAME.enemyHitboxes.indexOf(this.hitbox);
        if(idx > -1) GAME.enemyHitboxes.splice(idx, 1);
    }
    if(typeof GAME !== 'undefined') {
        MP_STATE.gold += 50; 
        MP_STATE.score += 500;
    }
    this.el.parentNode.removeChild(this.el);
    MP_CORE.monsterEl = null; 
    if(window.checkWave) window.checkWave();
}
    }
});
