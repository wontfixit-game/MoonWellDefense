// =================================================================
//  GAME FLOW — wave management, prep phase, upgrades, HUD
// =================================================================

function checkWave() {
    if (GAME.isAscending)   return;
    if (GAME.inUpgradeMenu) return;
    if (GAME.prepPhase)     return;
    if (GAME.enemyHitboxes.length === 0 && GAME.toSpawn <= 0) {
        GAME.active = false;
        GAME.inUpgradeMenu = true;
        document.exitPointerLock();
        GAME.shardsEarnedThisRun += 50;
        showUpgrades();
    }
    updateHUD();
}

// ----------------------------------------------------------------
//  PREP PHASE
// ----------------------------------------------------------------
function startPrepPhase() {
    GAME.prepPhase    = true;
    GAME.prepTimer    = 30;
    GAME.active       = false;
    GAME.inUpgradeMenu = false;
    document.exitPointerLock();

    // Award starting skulls on wave 1; bonus skulls on later waves
    if (GAME.wave === 0) {
        GAME.skulls = Math.max(GAME.skulls, 200);
    } else {
        const reward = 30 + GAME.wave * 8;
        GAME.skulls += reward;
        if (typeof spawnDamageText === 'function') {
            const p = document.querySelector('#player');
            if (p) spawnDamageText('+' + reward + ' SKULLS', p.object3D.position, false, true);
        }
    }

    const overlay = document.getElementById('prep-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        const waveLabel = document.getElementById('prep-wave-label');
        if (waveLabel) waveLabel.textContent = 'WAVE ' + (GAME.wave + 1) + ' — PREPARE YOUR DEFENSES';
    }

    if (typeof TrapPlacement !== 'undefined') TrapPlacement.enableMode();
    updateHUD();
}

function endPrepPhase() {
    if (!GAME.prepPhase) return;
    GAME.prepPhase = false;

    const overlay = document.getElementById('prep-overlay');
    if (overlay) overlay.style.display = 'none';

    if (typeof TrapPlacement !== 'undefined') TrapPlacement.disableMode();

    _launchWave();
}

// ----------------------------------------------------------------
//  WAVE LAUNCH (formerly the body of startNextWave)
// ----------------------------------------------------------------
function _launchWave() {
    GAME.wave++;
    const count = GAME.wave === 1
        ? 6
        : Math.floor(6 + 4 * Math.pow(1.12, GAME.wave - 2));

    // Cycle day/night environment
    let cyclePhase = 0;
    if (GAME.wave > 2) {
        const blockIndex = Math.floor((GAME.wave - 3) / 3);
        cyclePhase = [1, 2, 3, 4, 0][blockIndex % 5];
    }
    updateEnvironment(cyclePhase);

    GAME.toSpawn = count;
    const p = document.querySelector('#player');
    if (p) p.object3D.position.set(0, 0, 16);

    GAME.active = true;
    if (!GAME.isMobile && document.body.requestPointerLock && GAME.camMode !== 2) {
        document.body.requestPointerLock();
    }
    updateHUD();
}

// Public entry point called by upgrade card onclick handlers
function startNextWave() {
    GAME.inUpgradeMenu = false;
    document.getElementById('upgrade-menu').style.display = 'none';
    startPrepPhase();
}

// ----------------------------------------------------------------
//  UPGRADE MENU
// ----------------------------------------------------------------
function showUpgrades() {
    const menu = document.getElementById('upgrade-menu');
    const list = document.getElementById('card-list');
    list.innerHTML = '';
    const oldBtn = document.getElementById('early-call-btn');
    if (oldBtn) oldBtn.remove();

    menu.style.display = 'flex';

    if (!document.getElementById('upg-styles')) {
        const style = document.createElement('style');
        style.id = 'upg-styles';
        style.innerHTML = `
            .card { position: relative !important; overflow: visible !important; }
            .upg-lvl-tag { font-size:10px; font-weight:bold; color:#000; background:#ffd700; border-radius:4px;
                padding:2px 6px; position:absolute; top:-8px; right:-8px; box-shadow:0 2px 5px rgba(0,0,0,0.5);
                z-index:10; border:1px solid #fff; }
            .upg-stat-row { font-size:14px; margin-top:10px; color:#ccc; background:rgba(0,0,0,0.3);
                padding:5px; border-radius:4px; }
            .upg-val-old { color:#888; text-decoration:line-through; margin-right:5px; font-size:12px; }
            .upg-arrow { color:#fff; margin:0 5px; }
            .upg-val-new { color:#00ff88; font-weight:bold; font-size:16px; }
            .upg-desc-text { color:#aaddff; font-size:13px; margin-bottom:5px; min-height:40px;
                display:flex; align-items:center; justify-content:center; }
        `;
        document.head.appendChild(style);
    }

    const moonBlessing = {
        id: 'heal', t: 'Moon Blessing',
        render: () => `<h3 style="color:#00ffaa">Moon Blessing</h3>
            <div class="upg-desc-text">Fully restore Player HP &amp; Rift integrity</div>`,
        style: 'border:1px solid #00ffaa; box-shadow:0 0 15px #00ffaa;',
        f: () => { GAME.playerHP = GAME.maxPlayerHP; GAME.wellHP = GAME.maxWellHP;
            GAME.riftPoints = GAME.maxRiftPoints; }
    };

    const standardPool = [
        {
            id:'dmg', weight:100, t:'Sharpened Tips',
            render:()=>{const c=Math.round(GAME.dmgMultiplier*100),n=c+25;
                return `<h3>Sharpened Tips</h3><div class="upg-desc-text">+25% Base Damage</div>
                <div class="upg-stat-row"><span class="upg-val-old">${c}%</span>
                <span class="upg-arrow">&#8594;</span><span class="upg-val-new">${n}%</span></div>`;},
            f:()=>GAME.dmgMultiplier+=0.25
        },
        {
            id:'arr', weight:80, t:'Volley', max:3, val:()=>GAME.arrowsPerShot,
            render:()=>{const c=GAME.arrowsPerShot;
                return `<h3>Volley</h3><div class="upg-desc-text">+1 Arrow Per Shot</div>
                <div class="upg-stat-row">Arrows: <span class="upg-val-old">${c}</span>
                <span class="upg-arrow">&#8594;</span><span class="upg-val-new">${c+1}</span></div>`;},
            f:()=>GAME.arrowsPerShot++
        },
        {
            id:'fire', weight:80, t:'Flame Oil', max:3, val:()=>GAME.fireLevel,
            render:()=>`<div class="upg-lvl-tag">LEVEL ${GAME.fireLevel+1}</div>
                <h3 style="color:#ff5500">Flame Oil</h3>
                <div class="upg-desc-text">Enemies explode on death (AoE Fire)</div>`,
            f:()=>GAME.fireLevel++
        },
        {
            id:'zap', weight:80, t:'Conductive Rods', max:4, val:()=>GAME.zapLevel,
            render:()=>`<div class="upg-lvl-tag">LEVEL ${GAME.zapLevel+1}</div>
                <h3 style="color:#00ffff">Conductive Rods</h3>
                <div class="upg-desc-text">Lightning chains to nearby enemies</div>
                <div class="upg-stat-row">Chain: <span class="upg-val-old">${GAME.zapLevel+1}</span>
                <span class="upg-arrow">&#8594;</span><span class="upg-val-new">${GAME.zapLevel+2}</span></div>`,
            f:()=>GAME.zapLevel++
        },
        {
            id:'vamp', weight:60, t:'Vampiric Touch', max:4, val:()=>GAME.vampiricLevel,
            render:()=>`<div class="upg-lvl-tag">LEVEL ${GAME.vampiricLevel+1}</div>
                <h3 style="color:#ff0055">Vampiric Touch</h3>
                <div class="upg-desc-text">Heal HP on kill</div>
                <div class="upg-stat-row">Heal: <span class="upg-val-old">${GAME.vampiricLevel*2}</span>
                <span class="upg-arrow">&#8594;</span><span class="upg-val-new">${(GAME.vampiricLevel+1)*2}</span></div>`,
            f:()=>GAME.vampiricLevel++
        },
        {
            id:'spec', weight:60, t:'Spectral Shaft', max:3, val:()=>GAME.spectralLevel,
            render:()=>`<div class="upg-lvl-tag">LEVEL ${GAME.spectralLevel+1}</div>
                <h3 style="color:#aa55ff">Spectral Shaft</h3>
                <div class="upg-desc-text">Arrows pierce through enemies</div>
                <div class="upg-stat-row">Pierce: <span class="upg-val-old">${GAME.spectralLevel+1}</span>
                <span class="upg-arrow">&#8594;</span><span class="upg-val-new">${GAME.spectralLevel+2}</span></div>`,
            f:()=>GAME.spectralLevel++
        }
    ];

    let availablePool = standardPool.filter(o => !o.max || o.val() <= o.max);
    const picks = [];

    if (GAME.wave % 6 === 0) picks.push(moonBlessing);

    while (picks.length < 3 && availablePool.length > 0) {
        let totalWeight = 0;
        availablePool.forEach(o => totalWeight += o.weight);
        let random = Math.random() * totalWeight;
        let selectedIndex = -1;
        for (let i = 0; i < availablePool.length; i++) {
            random -= availablePool[i].weight;
            if (random <= 0) { selectedIndex = i; break; }
        }
        if (selectedIndex !== -1) { picks.push(availablePool[selectedIndex]); availablePool.splice(selectedIndex, 1); }
    }

    picks.forEach(u => {
        const c = document.createElement('div');
        c.className = 'card';
        if (u.style) c.style = u.style;
        c.innerHTML = u.render ? u.render() : `<h3>${u.t}</h3>`;
        c.onclick = () => { u.f(); removeEarlyCallBtn(); startNextWave(); };
        list.appendChild(c);
    });

    const earlyBtn = document.createElement('button');
    earlyBtn.id = 'early-call-btn';
    earlyBtn.className = 'early-call-btn';
    earlyBtn.innerHTML = 'EARLY CALL<span class="early-call-sub">+8 GEMS | +5% ASCENSION</span>';
    earlyBtn.onclick = () => {
        GAME.gems += 8;
        GAME.ascension = Math.min(GAME.maxAscension, GAME.ascension + 5);
        updateHUD();
        removeEarlyCallBtn();
        startNextWave();
    };
    menu.appendChild(earlyBtn);
}

function removeEarlyCallBtn() {
    const btn = document.getElementById('early-call-btn');
    if (btn) btn.remove();
}

// ----------------------------------------------------------------
//  ENVIRONMENT
// ----------------------------------------------------------------
function updateEnvironment(phase) {
    GAME.timePhase = phase;
    const msg       = document.getElementById('day-night-msg');
    const sky       = document.getElementById('sky-bg');
    const amb       = document.getElementById('ambient-light');
    const sunLight  = document.getElementById('sun-light');
    const moonLight = document.getElementById('moon-light');
    const sunMesh   = document.getElementById('sun-mesh');
    const moonMesh  = document.getElementById('moon-mesh');
    const moonPivot = document.getElementById('moon-pivot');
    const starField = document.getElementById('star-field');
    const sceneEl   = document.querySelector('a-scene');

    moonPivot.setAttribute('visible','false'); sunMesh.setAttribute('visible','true');
    sunLight.setAttribute('intensity','1.2'); moonLight.setAttribute('intensity','0');
    starField.setAttribute('visible','false');

    if (phase===2){
        sky.setAttribute('color','#050510'); sceneEl.setAttribute('fog','color: #050510; density: 0.012');
        amb.setAttribute('color','#222255'); amb.setAttribute('groundColor','#050510'); amb.setAttribute('intensity','0.5');
        sunMesh.setAttribute('visible','false'); sunLight.setAttribute('intensity','0');
        moonPivot.setAttribute('visible','true'); moonMesh.setAttribute('position','0 60 40');
        moonLight.setAttribute('intensity','0.8'); moonLight.setAttribute('color','#aaddff');
        moonLight.setAttribute('position','0 60 40'); starField.setAttribute('visible','true');
        msg.innerText='Night has fallen. The forest whispers...'; msg.style.color='#8888ff';
    } else if (phase===3){
        sky.setAttribute('color','#223344'); sceneEl.setAttribute('fog','color: #223344; density: 0.04');
        amb.setAttribute('color','#8899aa'); amb.setAttribute('groundColor','#223344'); amb.setAttribute('intensity','0.4');
        sunMesh.setAttribute('position','60 10 -40'); sunLight.setAttribute('position','60 10 -40');
        sunLight.setAttribute('color','#aaddff'); sunLight.setAttribute('intensity','0.5');
        msg.innerText='Mist covers the battlefield...'; msg.style.color='#aaddff';
    } else if (phase===4){
        sky.setAttribute('color','#88ccff'); sceneEl.setAttribute('fog','color: #ffddaa; density: 0.015');
        amb.setAttribute('color','#ffffff'); amb.setAttribute('groundColor','#aa8855'); amb.setAttribute('intensity','0.6');
        sunMesh.setAttribute('position','30 50 -30'); sunLight.setAttribute('position','30 50 -30');
        sunLight.setAttribute('color','#ffddaa'); sunLight.setAttribute('intensity','0.8');
        msg.innerText='The sun rises over the horizon.'; msg.style.color='#ffeeaa';
    } else if (phase===1){
        sky.setAttribute('color','#cc6633'); sceneEl.setAttribute('fog','color: #cc6633; density: 0.02');
        amb.setAttribute('color','#ffaa88'); amb.setAttribute('groundColor','#553311'); amb.setAttribute('intensity','0.5');
        sunMesh.setAttribute('position','-60 10 -40'); sunLight.setAttribute('position','-60 10 -40');
        sunLight.setAttribute('color','#ffaa00'); sunLight.setAttribute('intensity','0.7');
        msg.innerText='The sun sets. Darkness approaches.'; msg.style.color='#ffaa00';
    } else {
        sky.setAttribute('color','#3388cc'); sceneEl.setAttribute('fog','color: #3388cc; density: 0.01');
        amb.setAttribute('color','#88ccff'); amb.setAttribute('groundColor','#556633'); amb.setAttribute('intensity','0.6');
        sunMesh.setAttribute('position','0 60 -40'); sunLight.setAttribute('position','0 60 -40');
        sunLight.setAttribute('color','#fff0dd'); sunLight.setAttribute('intensity','1.0');
        msg.innerText='The sun is high. Enemies approach.'; msg.style.color='#ffffff';
    }
    msg.style.opacity=1; setTimeout(()=>msg.style.opacity=0, 5000);
}

// ----------------------------------------------------------------
//  ASCENSION EVENT
// ----------------------------------------------------------------
function startAscensionEvent() {
    GAME.isAscending = true; GAME.isBossPhase = true; GAME.survivalTime = 90; GAME.toSpawn = 0;
    const ray = document.getElementById('god-ray');
    ray.setAttribute('visible','true'); ray.emit('ascend');
    updateEnvironment(2);
    document.getElementById('event-timer').style.display = 'block';
    const msg = document.getElementById('day-night-msg');
    msg.innerText='THE TITAN AWAKENS!'; msg.style.color='#ff3333'; msg.style.opacity=1;
    if (typeof spawnDamageText==='function')
        spawnDamageText('KILL THE TITAN', document.getElementById('moon-well').object3D.position, true, false);
    const boss = document.createElement('a-entity');
    const angle = Math.random()*Math.PI*2; const r=75;
    boss.setAttribute('position', Math.cos(angle)*r+' 0 '+Math.sin(angle)*r);
    const bossHP = 25000+(GAME.wave*2000);
    boss.setAttribute('boss-logic', 'hp: '+bossHP+'; maxHp: '+bossHP);
    document.querySelector('a-scene').appendChild(boss);
}

// ----------------------------------------------------------------
//  GAME OVER
// ----------------------------------------------------------------
function gameOver() {
    GAME.active = false;
    document.exitPointerLock();

    const oldCamRig = document.getElementById('camera-rig');
    if (oldCamRig) {
        oldCamRig.removeAttribute('camera-follow');
        const oldCam = oldCamRig.querySelector('a-camera');
        if (oldCam) oldCam.setAttribute('active','false');
    }

    let targetPos = new THREE.Vector3();
    let isCore = false;

    if (GAME.wellHP <= 0) {
        isCore = true;
        const well = document.getElementById('moon-well');
        if (well) targetPos = well.object3D.position.clone();
        let exCount = 0;
        const exInt = setInterval(()=>{
            const offset = new THREE.Vector3((Math.random()-0.5)*5, Math.random()*2, (Math.random()-0.5)*5);
            spawnExplosion(targetPos.clone().add(offset), (exCount%2===0)?0x00d2ff:0xffffff, 20);
            exCount++; if(exCount>15) clearInterval(exInt);
        }, 150);
    } else {
        const player = document.getElementById('player');
        if (player) targetPos = player.object3D.position.clone();
        const rig = document.querySelector('#bow-rig');
        if (rig) {
            rig.setAttribute('visible','true'); rig.setAttribute('rotation','0 0 0');
            rig.removeAttribute('animation-mixer');
            setTimeout(()=>{
                rig.setAttribute('animation-mixer',{clip:'Death_A',loop:'once',clampWhenFinished:true,crossFadeDuration:0.05});
            },50);
        }
    }

    const skyCam = document.createElement('a-entity');
    const startY=20, endY=5;
    const startPos = targetPos.clone(); startPos.y+=startY;
    skyCam.setAttribute('position', startPos);
    skyCam.setAttribute('rotation','-90 0 0');
    skyCam.setAttribute('camera','active: true; fov: 60');
    const targetStr = targetPos.x+' '+(targetPos.y+endY)+' '+targetPos.z;
    skyCam.setAttribute('animation','property: position; to: '+targetStr+'; dur: 2500; easing: easeOutCubic');
    const spotLight = document.createElement('a-light');
    spotLight.setAttribute('type','spot'); spotLight.setAttribute('color','#ffffff');
    spotLight.setAttribute('intensity','2.5'); spotLight.setAttribute('angle','35');
    spotLight.setAttribute('penumbra','0.5'); spotLight.setAttribute('distance','30');
    skyCam.appendChild(spotLight);
    document.querySelector('a-scene').appendChild(skyCam);

    const title = document.getElementById('go-title');
    if (isCore) title.innerText='RIFT OVERRUN';
    else         title.innerText='YOU HAVE FALLEN';

    PLAYER_SAVE.shards += GAME.shardsEarnedThisRun;
    saveGame();
    document.getElementById('go-wave').innerText   = GAME.wave;
    document.getElementById('go-kills').innerText  = GAME.totalKills;
    document.getElementById('go-shards').innerText = '+' + GAME.shardsEarnedThisRun;
    document.getElementById('game-ui').style.display='none';
    const screen = document.getElementById('game-over-screen');
    screen.style.display='flex';
    setTimeout(()=>{
        screen.style.backgroundColor='rgba(0,0,0,0.9)';
        screen.style.pointerEvents='auto';
        document.getElementById('go-content-wrapper').style.opacity=1;
    }, 2600);
}

function triggerVictory() {
    GAME.active=false; document.exitPointerLock();
    PLAYER_SAVE.shards+=GAME.shardsEarnedThisRun; saveGame();
    document.getElementById('victory-screen').style.display='flex';
    document.getElementById('game-ui').style.display='none';
}

// ----------------------------------------------------------------
//  DAMAGE TEXT / EXPLOSIONS / CAMERA SHAKE (utility, defined here
//  so they are available to all modules)
// ----------------------------------------------------------------
function spawnDamageText(val, pos, isCrit, isHeal) {
    const div = document.createElement('div');
    div.className = isHeal ? 'damage-text heal-text' : (isCrit ? 'damage-text crit-text' : 'damage-text');
    div.innerText  = isCrit ? val+'!' : val;
    document.body.appendChild(div);
    const cam = document.querySelector('a-camera').getObject3D('camera');
    const vec = pos.clone(); vec.y+=1.8; vec.project(cam);
    div.style.left = ((vec.x*.5+.5)*window.innerWidth)+'px';
    div.style.top  = ((-(vec.y*.5)+.5)*window.innerHeight)+'px';
    setTimeout(()=>div.remove(), 800);
}

function spawnExplosion(pos, color, count) {
    count = count || 8;
    const sys = document.querySelector('[particle-system]');
    if (sys && sys.components['particle-system']) {
        sys.components['particle-system'].spawn(pos, color, count); return;
    }
    const scene = document.querySelector('a-scene'); if (!scene) return;
    const hex = typeof color==='number' ? color : parseInt(String(color).replace('#',''),16);
    for (let i=0; i<count; i++) {
        const p = document.createElement('a-entity');
        const c = '#'+hex.toString(16).padStart(6,'0');
        p.setAttribute('geometry','primitive: sphere; radius: 0.15');
        p.setAttribute('material',`shader: flat; color: ${c}; transparent: true; opacity: 0.95`);
        p.setAttribute('position', pos);
        const ang=Math.random()*Math.PI*2; const spd=1.5+Math.random()*3;
        p.setAttribute('animation',`property: position; to: ${pos.x+Math.cos(ang)*spd} ${pos.y+1+Math.random()*2} ${pos.z+Math.sin(ang)*spd}; dur: 350; easing: easeOutQuad`);
        p.setAttribute('animation__fade','property: material.opacity; to: 0; dur: 350; easing: linear');
        scene.appendChild(p);
        setTimeout(()=>{ if(p.parentNode) p.parentNode.removeChild(p); }, 400);
    }
}

function triggerCameraShake(intensity, duration) {
    const pivot = document.getElementById('cam-pivot'); if (!pivot || !pivot.object3D) return;
    const start = performance.now(); const basePos = pivot.object3D.position.clone();
    const shake = () => {
        const elapsed = performance.now()-start;
        if (elapsed>=duration) { pivot.object3D.position.copy(basePos); return; }
        const falloff = 1-(elapsed/duration);
        pivot.object3D.position.set(
            basePos.x+(Math.random()-0.5)*intensity*falloff,
            basePos.y+(Math.random()-0.5)*intensity*0.5*falloff,
            basePos.z+(Math.random()-0.5)*intensity*falloff
        );
        requestAnimationFrame(shake);
    };
    shake();
}

// ----------------------------------------------------------------
//  HUD
// ----------------------------------------------------------------
function updateHUD() {
    try {
        // Player HP
        document.querySelector('#hp-bar .bar-fill').style.width =
            Math.max(0, (GAME.playerHP / GAME.maxPlayerHP) * 100) + '%';

        // Rift Points (the new well bar)
        GAME.riftPoints = Math.ceil(GAME.wellHP / 150);
        const riftFill = document.querySelector('#well-bar .bar-fill');
        if (riftFill) riftFill.style.width = Math.max(0, (GAME.riftPoints / GAME.maxRiftPoints) * 100) + '%';

        // Ascension bar
        const ascFill = document.querySelector('#ascend-bar .bar-fill');
        if (ascFill) ascFill.style.width = Math.max(0, (GAME.ascension / GAME.maxAscension) * 100) + '%';

        document.getElementById('wave-text').innerText  = GAME.wave;
        document.getElementById('gem-text').innerText   = GAME.gems;
        document.getElementById('skull-text').innerText = GAME.skulls;
        document.getElementById('rift-text').innerText  = GAME.riftPoints + '/' + GAME.maxRiftPoints;
        const prepSkull = document.getElementById('prep-skull-count');
        if (prepSkull) prepSkull.textContent = GAME.skulls;

        const statDmg = document.getElementById('stat-dmg');
        if (statDmg) statDmg.innerText = (GAME.dmgMultiplier * 100).toFixed(0) + '%';
        const statArr = document.getElementById('stat-arr');
        if (statArr) statArr.innerText = GAME.arrowsPerShot;

        const mgr      = document.querySelector('[game-logic]');
        const toSpawn  = (mgr && mgr.components['game-logic']) ? mgr.components['game-logic'].toSpawn : GAME.toSpawn;
        document.getElementById('enemy-text').innerText = GAME.enemyHitboxes.length + toSpawn;
    } catch (e) {}
}

// ----------------------------------------------------------------
//  MINIMAP
// ----------------------------------------------------------------
const mapCanvas = document.getElementById('minimap-canvas');
const mapCtx    = mapCanvas ? mapCanvas.getContext('2d') : null;
const MAP_RADIUS = 60, MAP_SIZE = 150;

function updateMinimap() {
    if (!mapCtx) return;
    try {
        mapCtx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
        const cx = MAP_SIZE/2, cy = MAP_SIZE/2, scale = (MAP_SIZE/2)/MAP_RADIUS;

        // Draw path corridors
        if (typeof PATH_WAYPOINTS !== 'undefined') {
            mapCtx.strokeStyle = '#555544';
            mapCtx.lineWidth   = 6;
            PATH_WAYPOINTS.forEach(lane => {
                mapCtx.beginPath();
                lane.forEach((wp, i) => {
                    const mx = cx + wp.x * scale, mz = cy + wp.z * scale;
                    if (i === 0) mapCtx.moveTo(mx, mz); else mapCtx.lineTo(mx, mz);
                });
                mapCtx.stroke();
            });
        }

        // Rift marker
        mapCtx.fillStyle = '#aa44ff';
        mapCtx.beginPath(); mapCtx.arc(cx, cy, 5, 0, Math.PI*2); mapCtx.fill();

        // Enemies
        mapCtx.fillStyle = '#ff0000';
        const validEnemies = GAME.enemyHitboxes.filter(h => h && h.userData && h.userData.el &&
            h.userData.el.object3D && h.userData.el.components['enemy-logic']);
        validEnemies.forEach(hitbox => {
            const pos = hitbox.userData.el.object3D.position;
            mapCtx.beginPath(); mapCtx.arc(cx+pos.x*scale, cy+pos.z*scale, 2.5, 0, Math.PI*2); mapCtx.fill();
        });

        // Boss
        mapCtx.fillStyle = '#880000';
        const boss = GAME.enemyHitboxes.find(h => h && h.userData && h.userData.el &&
            h.userData.el.components['boss-logic']);
        if (boss) {
            const pos = boss.userData.el.object3D.position;
            mapCtx.beginPath(); mapCtx.arc(cx+pos.x*scale, cy+pos.z*scale, 6, 0, Math.PI*2); mapCtx.fill();
        }

        // Player
        const playerEl = document.querySelector('#player');
        if (playerEl) {
            const pPos = playerEl.object3D.position;
            const pRot = playerEl.object3D.rotation.y;
            const px = cx+pPos.x*scale, py = cy+pPos.z*scale;
            mapCtx.save(); mapCtx.translate(px, py); mapCtx.rotate(-pRot);
            mapCtx.fillStyle = '#00ff00';
            mapCtx.beginPath(); mapCtx.moveTo(0,-5); mapCtx.lineTo(4,4); mapCtx.lineTo(-4,4); mapCtx.fill();
            mapCtx.restore();
        }

        // Traps
        GAME.placedTraps.forEach(trap => {
            const colors = {spike:'#888888',tar:'#442200',barricade:'#8B4513',
                arrow_wall:'#0044ff',boom_barrel:'#ff4400'};
            mapCtx.fillStyle = colors[trap.type] || '#ffffff';
            mapCtx.beginPath();
            mapCtx.arc(cx+trap.x*scale, cy+trap.z*scale, 3, 0, Math.PI*2);
            mapCtx.fill();
        });
    } catch (e) {}
}

function togglePause() {
    if (!GAME.active) return;
    GAME.paused = !GAME.paused;
    const menu = document.getElementById('pause-menu');
    if (GAME.paused) { menu.style.display='flex'; document.exitPointerLock(); }
    else { menu.style.display='none'; if (!GAME.isMobile && GAME.camMode!==2) document.body.requestPointerLock(); }
}

// ----------------------------------------------------------------
//  COMBO
// ----------------------------------------------------------------
function addCombo() {
    GAME.combo++;
    GAME.comboTimer = 3000;
    updateComboUI();
}

function updateComboUI() {
    const el = document.getElementById('combo-display'); if(!el) return;
    if (GAME.combo>0) {
        el.innerText=`x${GAME.combo} COMBO`; el.classList.add('active');
        if (GAME.combo>=8) el.classList.add('super'); else el.classList.remove('super');
        el.style.transform='translateX(-50%) scale(1.4)';
        setTimeout(()=>{ el.style.transform=''; }, 50);
    } else {
        el.classList.remove('active','super');
    }
}
