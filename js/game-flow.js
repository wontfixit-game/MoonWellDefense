    function checkWave() { 
    if(GAME.isAscending) return; if(GAME.inUpgradeMenu) return; 
    if(GAME.enemyHitboxes.length === 0 && GAME.toSpawn <= 0) { GAME.active = false; GAME.inUpgradeMenu = true; document.exitPointerLock(); GAME.shardsEarnedThisRun += 50; showUpgrades(); } updateHUD(); 
}


function showUpgrades() {
    const menu = document.getElementById('upgrade-menu');
    const list = document.getElementById('card-list');
    
    // Clear old content
    list.innerHTML = '';
    const oldBtn = document.getElementById('early-call-btn');
    if(oldBtn) oldBtn.remove();

    menu.style.display = 'flex';
    
    // 定義樣式 (V1.4 FIX: 加入 .card { position: relative } 確保標籤位置正確)
    if(!document.getElementById('upg-styles')) {
const style = document.createElement('style');
style.id = 'upg-styles';
style.innerHTML = `
    /* V1.4 FIX: 強制卡片相對定位，讓絕對定位的標籤能對齊卡片 */
    .card { position: relative !important; overflow: visible !important; }
    
    .upg-lvl-tag { 
        font-size: 10px; 
        font-weight: bold;
        color: #000; 
        background: #ffd700;
        border-radius: 4px; 
        padding: 2px 6px; 
        position: absolute; 
        top: -8px; 
        right: -8px; 
        box-shadow: 0 2px 5px rgba(0,0,0,0.5);
        z-index: 10;
        border: 1px solid #fff;
    }
    .upg-stat-row { font-size: 14px; margin-top: 10px; color: #ccc; background: rgba(0,0,0,0.3); padding: 5px; border-radius: 4px; }
    .upg-val-old { color: #888; text-decoration: line-through; margin-right: 5px; font-size: 12px; }
    .upg-arrow { color: #fff; margin: 0 5px; }
    .upg-val-new { color: #00ff88; font-weight: bold; font-size: 16px; }
    .upg-desc-text { color: #aaddff; font-size: 13px; margin-bottom: 5px; min-height: 40px; display: flex; align-items: center; justify-content: center; }
`;
document.head.appendChild(style);
    }

    // 1. Moon Blessing
    const moonBlessing = { 
id: 'heal', 
t: 'Moon Blessing', 
render: () => `<h3 style="color:#00ffaa">Moon Blessing</h3><div class="upg-desc-text">Fully Heal Player & Core</div>`,
style: 'border: 1px solid #00ffaa; box-shadow: 0 0 15px #00ffaa;',
f: () => { GAME.playerHP=GAME.maxPlayerHP; GAME.wellHP=GAME.maxWellHP; } 
    };

    // 2. Standard Pool with Dynamic Descriptions
    const standardPool = [
{ 
    id: 'dmg', weight: 100, t: 'Sharpened Tips', 
    render: () => {
        const cur = Math.round(GAME.dmgMultiplier * 100);
        const next = cur + 25;
        return `<h3>Sharpened Tips</h3>
                <div class="upg-desc-text">+25% Base Damage</div>
                <div class="upg-stat-row">
                    <span class="upg-val-old">${cur}%</span>
                    <span class="upg-arrow">➡</span>
                    <span class="upg-val-new">${next}%</span>
                </div>`;
    },
    f: () => GAME.dmgMultiplier += 0.25 
},
{ 
    id: 'arr', weight: 80, t: 'Volley', max: 3, val: () => GAME.arrowsPerShot,
    render: () => {
        const cur = GAME.arrowsPerShot;
        const next = cur + 1;
        return `<h3>Volley</h3>
                <div class="upg-desc-text">+1 Arrow Per Shot</div>
                <div class="upg-stat-row">
                    Arrows: <span class="upg-val-old">${cur}</span>
                    <span class="upg-arrow">➡</span>
                    <span class="upg-val-new">${next}</span>
                </div>`;
    },
    f: () => GAME.arrowsPerShot++ 
},
{ 
    id: 'fire', weight: 80, t: 'Flame Oil', max: 3, val: () => GAME.fireLevel,
    render: () => {
        const lvl = GAME.fireLevel + 1;
        return `<div class="upg-lvl-tag">LEVEL ${lvl}</div>
                <h3 style="color:#ff5500">Flame Oil</h3>
                <div class="upg-desc-text">Enemies explode on death<br>(AoE Fire Damage)</div>`;
    },
    f: () => GAME.fireLevel++ 
},
{ 
    id: 'zap', weight: 80, t: 'Conductive Rods', max: 4, val: () => GAME.zapLevel,
    render: () => {
        const lvl = GAME.zapLevel + 1;
        return `<div class="upg-lvl-tag">LEVEL ${lvl}</div>
                <h3 style="color:#00ffff">Conductive Rods</h3>
                <div class="upg-desc-text">Lightning Chain jumps to<br>nearby enemies</div>
                <div class="upg-stat-row">
                    Chain: <span class="upg-val-old">${GAME.zapLevel + 1}</span>
                    <span class="upg-arrow">➡</span>
                    <span class="upg-val-new">${lvl + 1}</span>
                </div>`;
    },
    f: () => GAME.zapLevel++ 
},
{ 
    id: 'vamp', weight: 60, t: 'Vampiric Touch', max: 4, val: () => GAME.vampiricLevel,
    render: () => {
        const lvl = GAME.vampiricLevel + 1;
        return `<div class="upg-lvl-tag">LEVEL ${lvl}</div>
                <h3 style="color:#ff0055">Vampiric Touch</h3>
                <div class="upg-desc-text">Heal HP on kill</div>
                <div class="upg-stat-row">
                    Heal: <span class="upg-val-old">${GAME.vampiricLevel * 2}</span>
                    <span class="upg-arrow">➡</span>
                    <span class="upg-val-new">${lvl * 2}</span>
                </div>`;
    },
    f: () => GAME.vampiricLevel++ 
},
{ 
    id: 'spec', weight: 60, t: 'Spectral Shaft', max: 3, val: () => GAME.spectralLevel,
    render: () => {
        const lvl = GAME.spectralLevel + 1;
        return `<div class="upg-lvl-tag">LEVEL ${lvl}</div>
                <h3 style="color:#aa55ff">Spectral Shaft</h3>
                <div class="upg-desc-text">Arrows pierce through enemies</div>
                <div class="upg-stat-row">
                    Pierce: <span class="upg-val-old">${GAME.spectralLevel + 1}</span>
                    <span class="upg-arrow">➡</span>
                    <span class="upg-val-new">${lvl + 1}</span>
                </div>`;
    },
    f: () => GAME.spectralLevel++ 
}
    ];

    let availablePool = standardPool.filter(o => !o.max || o.val() <= o.max);
    const picks = [];

    // Strategic Check
    if (GAME.wave % 6 === 0) {
picks.push(moonBlessing);
    }
    
    while(picks.length < 3 && availablePool.length > 0) {
let totalWeight = 0;
availablePool.forEach(o => totalWeight += o.weight);
let random = Math.random() * totalWeight;

let selectedIndex = -1;
for(let i = 0; i < availablePool.length; i++) {
    random -= availablePool[i].weight;
    if(random <= 0) { selectedIndex = i; break; }
}

if(selectedIndex !== -1) {
    picks.push(availablePool[selectedIndex]);
    availablePool.splice(selectedIndex, 1);
}
    }
    
    // Render
    picks.forEach(u => {
const c = document.createElement('div');
c.className = 'card';
if(u.style) c.style = u.style;

if (u.render) {
    c.innerHTML = u.render();
} else {
    c.innerHTML = `<h3>${u.t}</h3><p>${u.d}</p>`;
}

c.onclick = () => { u.f(); removeEarlyCallBtn(); startNextWave(); };
list.appendChild(c);
    });

    // Add Greedy Button
    const earlyBtn = document.createElement('button');
    earlyBtn.id = 'early-call-btn';
    earlyBtn.className = 'early-call-btn';
    earlyBtn.innerHTML = `EARLY CALL<span class="early-call-sub">+8 GEMS | +5% ASCENSION</span>`;
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
    if(btn) btn.remove();
}
function startNextWave() { 
    GAME.inUpgradeMenu = false; document.getElementById('upgrade-menu').style.display = 'none'; 
    GAME.wave++; const count = Math.floor(15 * Math.pow(1.1, GAME.wave - 1)); let cyclePhase = 0; if (GAME.wave > 2) { let adjusted = GAME.wave - 3; let blockIndex = Math.floor(adjusted / 3); let phaseMap = [1, 2, 3, 4, 0]; cyclePhase = phaseMap[blockIndex % 5]; } updateEnvironment(cyclePhase);
    GAME.toSpawn = count; const p = document.querySelector('#player'); if(p) p.object3D.position.set(0, 0, 16); 
    GAME.active = true; if(!GAME.isMobile && document.body.requestPointerLock && GAME.camMode !== 2) document.body.requestPointerLock(); updateHUD(); 
}
function updateEnvironment(phase) {
    GAME.timePhase = phase; const msg = document.getElementById('day-night-msg'); const sky = document.getElementById('sky-bg'); const amb = document.getElementById('ambient-light'); const sunLight = document.getElementById('sun-light'); const moonLight = document.getElementById('moon-light'); const sunMesh = document.getElementById('sun-mesh'); const moonMesh = document.getElementById('moon-mesh'); const moonPivot = document.getElementById('moon-pivot'); const starField = document.getElementById('star-field'); const sceneEl = document.querySelector('a-scene');
    moonPivot.setAttribute('visible', 'false'); sunMesh.setAttribute('visible', 'true'); sunLight.setAttribute('intensity', '1.2'); moonLight.setAttribute('intensity', '0'); starField.setAttribute('visible', 'false');
    if (phase === 2) { sky.setAttribute('color', '#050510'); sceneEl.setAttribute('fog', 'color: #050510; density: 0.012'); amb.setAttribute('color', '#222255'); amb.setAttribute('groundColor', '#050510'); amb.setAttribute('intensity', '0.5'); sunMesh.setAttribute('visible', 'false'); sunLight.setAttribute('intensity', '0'); moonPivot.setAttribute('visible', 'true'); moonMesh.setAttribute('position', '0 60 40'); moonLight.setAttribute('intensity', '0.8'); moonLight.setAttribute('color', '#aaddff'); moonLight.setAttribute('position', '0 60 40'); starField.setAttribute('visible', 'true'); msg.innerText = "Night has fallen. The forest whispers..."; msg.style.color = "#8888ff"; } else if (phase === 3) { sky.setAttribute('color', '#223344'); sceneEl.setAttribute('fog', 'color: #223344; density: 0.04'); amb.setAttribute('color', '#8899aa'); amb.setAttribute('groundColor', '#223344'); amb.setAttribute('intensity', '0.4'); sunMesh.setAttribute('position', '60 10 -40'); sunLight.setAttribute('position', '60 10 -40'); sunLight.setAttribute('color', '#aaddff'); sunLight.setAttribute('intensity', '0.5'); msg.innerText = "Mist covers the battlefield..."; msg.style.color = "#aaddff"; } else if (phase === 4) { sky.setAttribute('color', '#88ccff'); sceneEl.setAttribute('fog', 'color: #ffddaa; density: 0.015'); amb.setAttribute('color', '#ffffff'); amb.setAttribute('groundColor', '#aa8855'); amb.setAttribute('intensity', '0.6'); sunMesh.setAttribute('position', '30 50 -30'); sunLight.setAttribute('position', '30 50 -30'); sunLight.setAttribute('color', '#ffddaa'); sunLight.setAttribute('intensity', '0.8'); msg.innerText = "The sun rises over the horizon."; msg.style.color = "#ffeeaa"; } else if (phase === 1) { sky.setAttribute('color', '#cc6633'); sceneEl.setAttribute('fog', 'color: #cc6633; density: 0.02'); amb.setAttribute('color', '#ffaa88'); amb.setAttribute('groundColor', '#553311'); amb.setAttribute('intensity', '0.5'); sunMesh.setAttribute('position', '-60 10 -40'); sunLight.setAttribute('position', '-60 10 -40'); sunLight.setAttribute('color', '#ffaa00'); sunLight.setAttribute('intensity', '0.7'); msg.innerText = "The sun sets. Darkness approaches."; msg.style.color = "#ffaa00"; } else { sky.setAttribute('color', '#3388cc'); sceneEl.setAttribute('fog', 'color: #3388cc; density: 0.01'); amb.setAttribute('color', '#88ccff'); amb.setAttribute('groundColor', '#556633'); amb.setAttribute('intensity', '0.6'); sunMesh.setAttribute('position', '0 60 -40'); sunLight.setAttribute('position', '0 60 -40'); sunLight.setAttribute('color', '#fff0dd'); sunLight.setAttribute('intensity', '1.0'); msg.innerText = "The sun is high. Enemies approach."; msg.style.color = "#ffffff"; }
    msg.style.opacity = 1; setTimeout(() => msg.style.opacity = 0, 5000);
}
function startAscensionEvent() { GAME.isAscending = true; GAME.isBossPhase = true; GAME.survivalTime = 90; GAME.toSpawn = 0; const ray = document.getElementById('god-ray'); ray.setAttribute('visible', 'true'); ray.emit('ascend'); updateEnvironment(2); document.getElementById('event-timer').style.display = 'block'; const msg = document.getElementById('day-night-msg'); msg.innerText = "THE TITAN AWAKENS!"; msg.style.color = "#ff3333"; msg.style.opacity = 1; spawnDamageText("KILL THE TITAN", document.getElementById('moon-well').object3D.position, true, false); const boss = document.createElement('a-entity'); const angle = Math.random() * Math.PI * 2; const r = 75; boss.setAttribute('position', `${Math.cos(angle)*r} 0 ${Math.sin(angle)*r}`); 
const bossHP = 25000 + (GAME.wave * 2000);
boss.setAttribute('boss-logic', `hp: ${bossHP}; maxHp: ${bossHP}`); document.querySelector('a-scene').appendChild(boss); }



function gameOver() { 
    GAME.active = false; 
    document.exitPointerLock(); 
    
    // 1. 停用舊攝影機
    const oldCamRig = document.getElementById('camera-rig');
    if(oldCamRig) {
        oldCamRig.removeAttribute('camera-follow');
        const oldCam = oldCamRig.querySelector('a-camera');
        if(oldCam) oldCam.setAttribute('active', 'false');
    }

    let targetPos = new THREE.Vector3();
    let isCore = false;

    // 2. 判斷目標與特效
    if (GAME.wellHP <= 0) {
        // --- CORE DESTROYED ---
        isCore = true;
        const well = document.getElementById('moon-well');
        if(well) targetPos = well.object3D.position.clone();
        
        // VFX: 爆炸
        let exCount = 0;
        const exInt = setInterval(() => {
            const offset = new THREE.Vector3((Math.random()-0.5)*5, Math.random()*2, (Math.random()-0.5)*5);
            spawnExplosion(targetPos.clone().add(offset), (exCount%2===0)?0x00d2ff:0xffffff, 20);
            exCount++;
            if(exCount > 15) clearInterval(exInt);
        }, 150);

    } else {
        // --- PLAYER DIED ---
        const player = document.getElementById('player');
        if(player) targetPos = player.object3D.position.clone();

        // 強制重播死亡動畫
        const rig = document.querySelector('#bow-rig');
        if(rig) {
            rig.setAttribute('visible', 'true');
            rig.setAttribute('rotation', '0 0 0'); // 轉正
            rig.removeAttribute('animation-mixer');
            setTimeout(() => {
                rig.setAttribute('animation-mixer', {
                    clip: 'Death_A', 
                    loop: 'once', 
                    clampWhenFinished: true,
                    crossFadeDuration: 0.05
                });
            }, 50);
        }
    }

    // 3. 創建上帝視角攝影機 (Skyfall Cam)
    const skyCam = document.createElement('a-entity');
    
    // 起始位置：目標正上方 20 米
    const startY = 20;
    const endY = 5; // 結束位置：目標正上方 5 米 (特寫)
    
    const startPos = targetPos.clone();
    startPos.y += startY;
    
    skyCam.setAttribute('position', startPos);
    skyCam.setAttribute('rotation', '-90 0 0'); // 垂直向下看
    skyCam.setAttribute('camera', 'active: true; fov: 60'); // 啟用
    
    // 4. Zoom-In 動畫 (從 20m 降到 5m，耗時 2.5秒)
    // 使用 A-Frame 的 animation 組件
    const targetStr = `${targetPos.x} ${targetPos.y + endY} ${targetPos.z}`;
    skyCam.setAttribute('animation', `property: position; to: ${targetStr}; dur: 2500; easing: easeOutCubic`);

    // 5. 強力聚光燈 (Spotlight)
    // 跟隨攝影機，確保垂直照亮屍體/核心
    const spotLight = document.createElement('a-light');
    spotLight.setAttribute('type', 'spot');
    spotLight.setAttribute('color', '#ffffff');
    spotLight.setAttribute('intensity', '2.5'); // 很亮
    spotLight.setAttribute('angle', '35'); // 聚光範圍
    spotLight.setAttribute('penumbra', '0.5'); // 邊緣柔和
    spotLight.setAttribute('distance', '30');
    // 因為是掛在攝影機下面，且攝影機已經朝下(-90)，所以燈光預設朝 -Z 就是朝世界下方
    skyCam.appendChild(spotLight);

    document.querySelector('a-scene').appendChild(skyCam);

    // 6. UI 顯示
    const title = document.getElementById('go-title'); 
    if (isCore) { title.innerText = "CORE DESTROYED"; } 
    else { title.innerText = "YOU HAVE FALLEN"; } 
    
    PLAYER_SAVE.shards += GAME.shardsEarnedThisRun; 
    saveGame(); 
    
    document.getElementById('go-wave').innerText = GAME.wave; 
    document.getElementById('go-kills').innerText = GAME.totalKills; 
    document.getElementById('go-shards').innerText = "+" + GAME.shardsEarnedThisRun; 
    document.getElementById('game-ui').style.display = 'none'; 
    
    const screen = document.getElementById('game-over-screen'); 
    screen.style.display = 'flex'; 
    
    // 延遲黑幕，讓你欣賞完 Zoom In 過程
    setTimeout(() => { 
        screen.style.backgroundColor = "rgba(0, 0, 0, 0.9)"; 
        screen.style.pointerEvents = "auto"; 
        document.getElementById('go-content-wrapper').style.opacity = 1; 
    }, 2600); 
}
    function triggerVictory() { GAME.active = false; document.exitPointerLock(); PLAYER_SAVE.shards += GAME.shardsEarnedThisRun; saveGame(); document.getElementById('victory-screen').style.display = 'flex'; document.getElementById('game-ui').style.display = 'none'; }
function spawnDamageText(val, pos, isCrit, isHeal) { const div = document.createElement('div'); div.className = isHeal ? 'damage-text heal-text' : (isCrit ? 'damage-text crit-text' : 'damage-text'); div.innerText = isCrit ? val + "!" : val; document.body.appendChild(div); const cam = document.querySelector('a-camera').getObject3D('camera'); const vec = pos.clone(); vec.y += 1.8; vec.project(cam); const x = (vec.x * .5 + .5) * window.innerWidth; const y = (-(vec.y * .5) + .5) * window.innerHeight; div.style.left = x + 'px'; div.style.top = y + 'px'; setTimeout(() => div.remove(), 800); }
function spawnExplosion(pos, color, count) { const sys = document.querySelector('[particle-system]'); if(sys && sys.components['particle-system']) sys.components['particle-system'].spawn(pos, color, count); }
function updateHUD() { try { document.querySelector('#hp-bar .bar-fill').style.width = Math.max(0, (GAME.playerHP/GAME.maxPlayerHP)*100) + '%'; document.querySelector('#well-bar .bar-fill').style.width = Math.max(0, (GAME.wellHP/GAME.maxWellHP)*100) + '%'; document.querySelector('#ascend-bar .bar-fill').style.width = Math.max(0, (GAME.ascension/GAME.maxAscension)*100) + '%'; document.getElementById('wave-text').innerText = GAME.wave; document.getElementById('stat-dmg').innerText = (GAME.dmgMultiplier*100).toFixed(0) + "%"; document.getElementById('stat-arr').innerText = GAME.arrowsPerShot; document.getElementById('stat-fire').innerText = GAME.fireLevel; document.getElementById('stat-zap').innerText = GAME.zapLevel; document.getElementById('gem-text').innerText = GAME.gems; const mgr = document.querySelector('[game-logic]'); const toSpawn = (mgr && mgr.components['game-logic']) ? mgr.components['game-logic'].toSpawn : GAME.toSpawn; document.getElementById('enemy-text').innerText = GAME.enemyHitboxes.length + toSpawn; } catch(e) {} }
const mapCanvas = document.getElementById('minimap-canvas'); const mapCtx = mapCanvas.getContext('2d'); const MAP_RADIUS = 60; const MAP_SIZE = 150; 
function updateMinimap() { try { mapCtx.clearRect(0, 0, MAP_SIZE, MAP_SIZE); const cx = MAP_SIZE / 2; const cy = MAP_SIZE / 2; const scale = (MAP_SIZE / 2) / MAP_RADIUS; mapCtx.fillStyle = '#00d2ff'; mapCtx.beginPath(); mapCtx.arc(cx, cy, 4, 0, Math.PI*2); mapCtx.fill(); mapCtx.fillStyle = '#ff0000'; const validEnemies = GAME.enemyHitboxes.filter(h => h && h.userData && h.userData.el && h.userData.el.object3D && h.userData.el.components['enemy-logic']); validEnemies.forEach(hitbox => { const pos = hitbox.userData.el.object3D.position; mapCtx.beginPath(); mapCtx.arc(cx + pos.x * scale, cy + pos.z * scale, 2.5, 0, Math.PI*2); mapCtx.fill(); }); mapCtx.fillStyle = '#880000'; const boss = GAME.enemyHitboxes.find(h => h && h.userData && h.userData.el && h.userData.el.components['boss-logic']); if (boss) { const pos = boss.userData.el.object3D.position; mapCtx.beginPath(); mapCtx.arc(cx + pos.x * scale, cy + pos.z * scale, 6, 0, Math.PI*2); mapCtx.fill(); } const playerEl = document.querySelector('#player'); if (playerEl) { const pPos = playerEl.object3D.position; const pRot = playerEl.object3D.rotation.y; const px = cx + pPos.x * scale; const py = cy + pPos.z * scale; mapCtx.save(); mapCtx.translate(px, py); mapCtx.rotate(-pRot); mapCtx.fillStyle = '#00ff00'; mapCtx.beginPath(); mapCtx.moveTo(0, -5); mapCtx.lineTo(4, 4); mapCtx.lineTo(-4, 4); mapCtx.fill(); mapCtx.restore(); } } catch(e) {} }
function togglePause() { if (!GAME.active) return; GAME.paused = !GAME.paused; const menu = document.getElementById('pause-menu'); if (GAME.paused) { menu.style.display = 'flex'; document.exitPointerLock(); } else { menu.style.display = 'none'; if (!GAME.isMobile && GAME.camMode !== 2) document.body.requestPointerLock(); } }
// --- 新增：Combo 系統輔助函數 ---
function addCombo() {
    GAME.combo++;
    GAME.comboTimer = 3000; // 重置為 3 秒 (ms)
    updateComboUI();
}

function updateComboUI() {
    const el = document.getElementById('combo-display');
    if(!el) return;
    
    if(GAME.combo > 0) {
el.innerText = `x${GAME.combo} COMBO`;
el.classList.add('active');

// 超過 8 連殺顯示金色特效
if(GAME.combo >= 8) el.classList.add('super');
else el.classList.remove('super');

// 每次更新都重新觸發 CSS 動畫 (重置 transform)
el.style.transform = 'translateX(-50%) scale(1.4)';
setTimeout(() => { el.style.transform = ''; }, 50);
    } else {
el.classList.remove('active', 'super');
    }
}    
