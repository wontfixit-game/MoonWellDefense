// 使用 window.addEventListener('load') 並加上 setTimeout
// 確保這是最後一個執行的腳本，權限最高 (Priority Override)
window.addEventListener('load', function() {
    setTimeout(function() {
console.log(">>> [SYSTEM] APPLYING SOUL LINK PATCH V1.3 (FINAL OVERRIDE) <<<");

// ==========================================
// 1. GLOBAL VARIABLES INIT
// ==========================================
if (typeof GAME === 'undefined') window.GAME = {};
GAME.isGhost = false;
GAME.reviveCount = 0;
MP_CORE.deathCount = 0;

// Hide old lives UI
const livesUI = document.getElementById('mp-lives');
if(livesUI) livesUI.style.display = 'none';

// ==========================================
// 2. RANGER (HOST) LOGIC OVERRIDES
// ==========================================

// A. Intercept Game Over -> Ghost Mode
const _origGameOver = window.gameOver;
window.gameOver = function() {
    if (GAME.wellHP <= 0) { 
        document.getElementById('ghost-overlay').style.display = 'none';
        document.getElementById('ghost-ui-container').style.display = 'none';
        if(MP_CORE.active && MP_CORE.role === 'HOST') MP_CORE.sendGameOver();
        if(_origGameOver) _origGameOver(); 
        return; 
    } 
    if (GAME.playerHP <= 0 && !GAME.isGhost) { 
        enterGhostMode(); 
        return; 
    }
};

window.enterGhostMode = function() {
    GAME.isGhost = true;
    GAME.playerHP = 0;
    updateHUD();

    document.getElementById('ghost-overlay').style.display = 'block';
    document.getElementById('ghost-ui-container').style.display = 'flex';
    updateReviveCostUI();

    if(MP_CORE.active && MP_CORE.role === 'HOST') {
        MP_CORE.sendCritical({op: 'SOUL_FALLEN'});
    }

    const rig = document.querySelector('#bow-rig');
    if(rig) rig.setAttribute('visible', 'false'); 
    document.getElementById('charge-indicator').style.opacity = 0;
    spawnDamageText("SOUL SEVERED", document.getElementById('player').object3D.position, true, false);
};

window.exitGhostMode = function() {
    GAME.isGhost = false;
    GAME.playerHP = GAME.maxPlayerHP;
    
    document.getElementById('ghost-overlay').style.display = 'none';
    document.getElementById('ghost-ui-container').style.display = 'none';
    
    if(MP_CORE.active && MP_CORE.role === 'HOST') {
        MP_CORE.sendCritical({op: 'SOUL_REVIVED'});
    }

    const rig = document.querySelector('#bow-rig');
    if(rig) rig.setAttribute('visible', 'true');
    
    const pPos = document.getElementById('player').object3D.position;
    spawnExplosion(pPos, 0xffd700, 40);
    spawnDamageText("RESURRECTED!", pPos, true, true);
    updateHUD();
};

function getReviveCost() {
    if (GAME.reviveCount === 0) return 0;
    return 200 * Math.pow(2, GAME.reviveCount - 1);
}

function updateReviveCostUI() {
    const cost = getReviveCost();
    const el = document.getElementById('revive-cost-display');
    const safe = GAME.wellHP > cost;
    const colorClass = safe ? 'revive-cost-safe' : 'revive-cost-warn';
    if (cost === 0) el.innerHTML = "REVIVE COST: <span class='revive-cost-safe'>FREE (First Time)</span>";
    else el.innerHTML = `REVIVE COST: <span class='${colorClass}'>${cost} CORE HP</span>`;
}

window.attemptRevive = function() {
    const cost = getReviveCost();
    if (GAME.wellHP <= cost) {
        GAME.wellHP = 0; 
        spawnDamageText("CRITICAL DRAIN!", document.getElementById('moon-well').object3D.position, true, false);
        window.gameOver(); 
    } else {
        GAME.wellHP -= cost;
        spawnDamageText("-" + cost + " CORE", document.getElementById('moon-well').object3D.position, true, false);
        GAME.reviveCount++;
        exitGhostMode();
    }
};

// B. REFORGED STYLE PROMPTS & INTERACTION
const _uCtrl = AFRAME.components['universal-controls'].Component.prototype;
const _origUTick = _uCtrl.tick;

_uCtrl.tick = function(t, dt) {
    if (!GAME.active || GAME.paused) return;
    
    const prompt = document.getElementById('interaction-prompt');
    const wellPos = document.getElementById('moon-well').object3D.position;
    const myPos = this.el.object3D.position;
    const wellDist = myPos.distanceTo(wellPos);

    // 1. Ghost Mode (Highest Priority)
    if (GAME.isGhost) {
        if (wellDist < 6.0) {
            prompt.style.display = 'block'; prompt.innerHTML = "[ACT] RESURRECT"; prompt.style.color = '#00ffff';
        } else prompt.style.display = 'none';
        if(_origUTick) _origUTick.call(this, t, dt);
        return;
    }

    // 2. Ally Upgrade (Priority: Close to Ally)
    let nearAlly = null;
    for(let ally of GAME.allies) {
        if(ally && ally.object3D && myPos.distanceTo(ally.object3D.position) < 3.5) {
            const logic = ally.components['ally-logic'];
            if(logic && logic.data.level < 3) { nearAlly = ally; break; }
        }
    }

    if (nearAlly && !GAME.isAscending) {
        prompt.style.display = 'block'; 
        const color = (GAME.gems>=5) ? '#00ff00' : '#ff5555';
        prompt.innerHTML = `<span style="color:${color}">[ACT] UPGRADE ALLY (5G)</span>`; 
    } 
    // 3. Well Repair / Purify (Priority: Close to Well)
    else if (wellDist < 5.0 && !GAME.isAscending) {
        prompt.style.display = 'block';
        const repairColor = (GAME.gems>=5) ? '#00ff00' : '#ff5555';
        const purifyColor = (GAME.gems>=5) ? '#00ffff' : '#ff5555';
        prompt.innerHTML = `<span style="color:${repairColor}">[BUILD] REPAIR (+250)</span> <span style="color:#888">|</span> <span style="color:${purifyColor}">[ACT] PURIFY</span>`;
    } 
    else {
        prompt.style.display = 'none';
    }
    
    if(_origUTick) _origUTick.call(this, t, dt);
};

// Override Interact (V Key / Act Button)
const _origInteract = _uCtrl.interactAction;
_uCtrl.interactAction = function() {
    if (GAME.isGhost) {
         const wellPos = document.getElementById('moon-well').object3D.position;
         if (this.el.object3D.position.distanceTo(wellPos) < 6.0) attemptRevive();
         return;
    }
    
    let nearAlly = null;
    for(let ally of GAME.allies) {
        if(ally && ally.object3D && this.el.object3D.position.distanceTo(ally.object3D.position) < 3.5) {
            const logic = ally.components['ally-logic'];
            if(logic && logic.data.level < 3) { nearAlly = ally; break; }
        }
    }
    
    if (nearAlly) {
         const logic = nearAlly.components['ally-logic'];
         if (GAME.gems >= 5) { 
            GAME.gems -= 5; updateHUD(); this.playInteract(); logic.upgrade(); 
         } else { 
            spawnDamageText("Need 5 Gems", nearAlly.object3D.position, true, false); 
         }
         return;
    }
    if(_origInteract) _origInteract.call(this);
};

// Override Summon (B Key / Build Button)
const _origSummon = _uCtrl.summonAlly;
_uCtrl.summonAlly = function() {
    if(GAME.isGhost) return;
    const wellPos = document.getElementById('moon-well').object3D.position;
    
    if (this.el.object3D.position.distanceTo(wellPos) < 5.0) {
        if (GAME.gems >= 5) {
            GAME.gems -= 5;
            GAME.wellHP = Math.min(GAME.maxWellHP, GAME.wellHP + 250);
            updateHUD();
            spawnDamageText("REPAIRED!", wellPos, false, true);
            spawnExplosion(wellPos, 0x00ff00, 10);
            this.playInteract();
        } else {
            spawnDamageText("Need 5 Gems", wellPos, true, false);
        }
    } else {
        if(_origSummon) _origSummon.call(this);
        else if(GAME.gems >= 3) {
             GAME.gems -= 3; updateHUD(); this.playInteract(); 
             const el = document.createElement('a-entity'); 
             const pos = this.el.object3D.position.clone(); 
             const dir = new THREE.Vector3(); this.el.object3D.getWorldDirection(dir); 
             pos.add(dir.multiplyScalar(3)); pos.y = 0; 
             el.setAttribute('position', pos); 
             el.setAttribute('ally-logic', 'level: 1'); 
             this.el.sceneEl.appendChild(el); 
             spawnExplosion(pos, 0x00ffff, 10);
        } else { spawnDamageText("Need 3 Gems", this.el.object3D.position, true, false); }
    }
};

const _origShoot = _uCtrl.shoot;
_uCtrl.shoot = function() {
    if(GAME.isGhost) return;
    if(_origShoot) _origShoot.call(this);
};

// ==========================================
// 3. MONSTER (CLIENT) LOGIC OVERRIDES
// ==========================================

MP_CORE.triggerDeath = function() {
    const input = document.getElementById('mp-mobile-input');
    if(input) input.style.setProperty('display', 'none', 'important');
    
    if(this.isDead) return;
    this.isDead = true;
    this.deathCount++; 

    document.getElementById('respawn-screen').style.display = 'flex';
    
    let cd = 5 + ((this.deathCount - 1) * 2);
    
    const timerEl = document.getElementById('rsp-timer');
    const selEl = document.getElementById('rsp-selector');
    const msgEl = document.getElementById('rsp-msg');
    
    selEl.style.pointerEvents = 'none'; selEl.style.opacity = '0.5'; 
    msgEl.innerText = `RESPAWNING... (Death #${this.deathCount})`;
    msgEl.style.color = "#ffaa00";
    
    const itv = setInterval(() => {
        timerEl.innerText = cd;
        cd--; 
        if(cd < 0) {
            clearInterval(itv);
            timerEl.innerText = "SELECT CLASS";
            selEl.style.pointerEvents = 'auto'; selEl.style.opacity = '1';
            msgEl.innerText = "Ready for battle";
            msgEl.style.color = "#00ff00";
        }
    }, 1000);
};

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
    // No lives deduction here
};

const _origConnect = MP_CORE.connect;
MP_CORE.connect = function(hostId) {
    if(!hostId) { alert("Please enter ID"); return; }
    this.peer = new Peer(null, {debug: 1}); 
    this.peer.on('open', (myId) => {
        this.conn = this.peer.connect(hostId, { reliable: false });
        this.conn.on('open', () => {
            this.role = 'CLIENT'; this.active = true; this.myNetId = 'P' + this.peer.id; 
            document.getElementById('mp-lives').style.display = 'none';
            document.getElementById('mp-join').style.display = 'none';
            document.getElementById('mp-class').style.display = 'block';
        });
        this.conn.on('data', data => {
            if(data.op === 'STATE') this.handleState(data);
            if(data.op === 'DIE') this.triggerDeath();
            if(data.op === 'GAMEOVER') this.showVictory();
            if(data.op === 'FEEDBACK') this.showFeedback(data);
            if(data.op === 'ARROW') this.spawnVisualArrow(data);
            
            if(data.op === 'SOUL_FALLEN') {
                const el = document.getElementById('net-notification');
                el.innerText = "THE SOUL HAS FALLEN - AWAITING REVIVE";
                el.style.display = 'block';
                el.style.backgroundColor = "rgba(255, 0, 0, 0.8)";
                el.style.borderColor = "#ff0000";
            }
            if(data.op === 'SOUL_REVIVED') {
                const el = document.getElementById('net-notification');
                el.innerText = "THE SOUL HAS RETURNED!";
                el.style.backgroundColor = "rgba(0, 255, 255, 0.8)";
                el.style.borderColor = "#00ffff";
                setTimeout(() => { el.style.display = 'none'; }, 2000);
            }
        });
    });
};

MP_CORE.updateLives = function(data) { /* Disable lives UI updates */ };

const _origHUD = window.updateHUD;
window.updateHUD = function() {
    if(_origHUD) _origHUD();
    if(GAME.isGhost) document.querySelector('#hp-bar .bar-fill').style.width = '0%';
};

    }, 500); // Wait 500ms after load to ensure we override previous logic
});
