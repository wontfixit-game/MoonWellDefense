AFRAME.registerComponent('well-manager', {
    init: function() {
        const el = this.el;
        const loader = new THREE.GLTFLoader();
        const src = document.querySelector('#model-well').getAttribute('src');
        if(!src) return;

        loader.load(src, (gltf) => {
            const scene = gltf.scene;
            const box = new THREE.Box3().setFromObject(scene);
            const center = new THREE.Vector3();
            box.getCenter(center);
            scene.position.x = -center.x;
            scene.position.z = -center.z;
            scene.position.y = -box.min.y - 1.5; 
            el.setObject3D('mesh', scene);
        });
    }
});

document.querySelector('a-scene').addEventListener('loaded', () => { loadSave(); document.getElementById('loading-area').style.display = 'none'; const vrBtn = document.querySelector('.a-enter-vr'); if(vrBtn) vrBtn.style.display = 'none'; });

       // 找到原本的 GAME 物件，修改為：
const GAME = {
    started: false, active: false, paused: false, 
    wave: 0, inUpgradeMenu: false, gems: 0, toSpawn: 0, totalKills: 0,
    ascension: 0, maxAscension: 100, isAscending: false, survivalTime: 90, isBossPhase: false, 
    vampiricLevel: 0, spectralLevel: 0, timePhase: 0, playerHP: 100, maxPlayerHP: 100, wellHP: 3000, maxWellHP: 3000, 
    isMobile: /Android|iPhone|iPad/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1,
    baseDamage: 40, dmgMultiplier: 1.0, arrowsPerShot: 1, fireLevel: 0, zapLevel: 0,
    lastShotTime: 0, isCharged: false,
    enemyHitboxes: [], allies: [], allyHitboxes: [], obstacles: [], trees: [], lastAttacker: null,
    shardsEarnedThisRun: 0, magnetRange: 2.0, allyCmdState: 0,
    // --- 新增以下兩個變數 ---
    combo: 0, comboTimer: 0
};

function initGame() { 
    try {
        const isDebug = window.getComputedStyle(document.getElementById('settings-panel')).display !== 'none';
        if (isDebug) {
            GAME.wave = (parseInt(document.getElementById('set-wave').value) || 1) - 1;
            GAME.gems = parseInt(document.getElementById('set-gems').value) || 0;
            GAME.arrowsPerShot = parseInt(document.getElementById('set-arrows').value) || 1;
            GAME.fireLevel = parseInt(document.getElementById('set-fire').value) || 0;
            GAME.zapLevel = parseInt(document.getElementById('set-zap').value) || 0;
        } else {
            GAME.wave = 0;
            GAME.gems = PLAYER_SAVE.upgrades.gems * 3; 
            GAME.dmgMultiplier = 1.0 + (PLAYER_SAVE.upgrades.damage * 0.1);
            GAME.magnetRange = 2.0 + (PLAYER_SAVE.upgrades.magnet * 2.0);
            GAME.arrowsPerShot = 1; GAME.fireLevel = 0; GAME.zapLevel = 0;
// 1. 計算並補滿 玩家 (Player) 血量
    // (假設 Titan Blood 升級 ID 是 'playerHp'，每級 +15%)
    GAME.maxPlayerHP = 100 * (1 + (PLAYER_SAVE.upgrades.playerHp || 0) * 0.15);
    GAME.playerHP = GAME.maxPlayerHP; // <--- 關鍵：這裡把血補滿

    // 2. 計算並補滿 月亮井 (Well) 血量
    // (假設 Lunar Fortitude 升級 ID 是 'wellHp'，每級 +15%)
    GAME.maxWellHP = 3000 * (1 + (PLAYER_SAVE.upgrades.wellHp || 0) * 0.15);
    GAME.wellHP = GAME.maxWellHP;     // <--- 關鍵：這裡把井補滿

    GAME.arrowsPerShot = 1; GAME.fireLevel = 0; GAME.zapLevel = 0;
    // ▲▲▲ 修改結束 ▲▲▲
        }
        GAME.shardsEarnedThisRun = 0; GAME.isBossPhase = false;
        document.getElementById('boss-hud').style.display = 'none';
        const vrEnabled = document.getElementById('set-vr').checked;
        const vrBtn = document.querySelector('.a-enter-vr');
        if(vrBtn) { vrBtn.style.display = vrEnabled ? 'block' : 'none'; }
        document.getElementById('start-screen').style.display = 'none'; 
        document.getElementById('game-ui').style.display = 'block'; 
        GAME.started = true; 
        document.getElementById('minimap-container').onclick = (e) => { e.stopPropagation(); togglePause(); };
        const marker = document.getElementById('hit-marker'); marker.classList.remove('active'); marker.style.display = 'none';
        startNextWave(); 
    } catch(e) { console.error("Init Error", e); alert("Error starting game. Check console."); }
}

const ENEMIES = {
    grunt:    { model: '#model-grunt',  scale: '1 1 1',   hp: 120, move: 'Walk', atk: 'Attack', hit: 'HitRecieve', dmg: 20, speed: 0.060, headY: 1.6, radius: 1.2, range: 2.5, projectile: false },
    runner:   { model: '#model-runner', scale: '0.75 0.75 0.75', hp: 100,  move: 'Run', atk: 'Attack', hit: 'HitRecieve', dmg: 15,  speed: 0.110, headY: 1.5, radius: 1.2, range: 2.0, projectile: false },
    tank:     { model: '#model-tank',   scale: '1.6 1.6 1.6', hp: 800, move: 'Walk', atk: 'Attack', hit: 'HitRecieve', dmg: 40, speed: 0.040,  headY: 3.0, radius: 2.0, range: 3.0, projectile: false },
    wizard:   { model: '#model-wizard', scale: '1 1 1',   hp: 150,  move: 'Run', atk: 'Attack', hit: 'HitRecieve', dmg: 20, speed: 0.060, headY: 1.6, radius: 1.2, range: 15.0, projectile: true },
    skeleton: { model: '#model-skeleton', scale: '1.5 1.5 1.5', hp: 1200, move: 'Walk', atk: 'Sword', hit: 'Hit', dmg: 40, speed: 0.050, headY: 1.8, radius: 1.5, range: 3.0, projectile: false }
};
const ALLIES = {
    1: { model: '#model-chick', scale: '0.8 0.8 0.8', hp: 100, dmg: 10, atkSpd: 0.8, range: 0.5, anim: { idle: 'Idle', run: 'Run', atk: 'Attack', die: 'Death' } },
    2: { model: '#model-chicken', scale: '1.2 1.2 1.2', hp: 200, dmg: 25, atkSpd: 0.8, range: 0.5, anim: { idle: 'Idle', run: 'Run', atk: 'Attack', die: 'Death' } },
    3: { model: '#model-gwen', scale: '1.0 1.0 1.0', hp: 750, dmg: 120, atkSpd: 1.2, range: 5.5, anim: { idle: 'Idle', run: 'Run', atk: 'Weapon', die: 'Death' } }
};


AFRAME.registerComponent('forest-generator', {
    init: function() {
        const scene = this.el.sceneEl;
        const ground = document.createElement('a-plane');
        ground.setAttribute('rotation', '-90 0 0'); ground.setAttribute('width', '160'); ground.setAttribute('height', '160');
        ground.setAttribute('color', '#2d4c1e'); ground.setAttribute('material', 'roughness: 1.0; metalness: 0.0'); ground.setAttribute('shadow', 'receive: true');
        ground.classList.add('ground-plane'); 
        scene.appendChild(ground);
        
        const loader = new THREE.GLTFLoader();
        const packUrl = document.querySelector('#model-forest').getAttribute('src');
        const BLOCKED_NAMES = ['Cactus', 'Sign', 'Bridege', 'Bridge', 'Savannah'];
        
        // --- 3 LANE LOGIC: PATH CHECK ---
        const isPath = (x, z) => {
            const angle = Math.atan2(z, x); 
            let normAngle = angle;
            if(normAngle < 0) normAngle += Math.PI * 2;
            const lanes = [0, (2*Math.PI)/3, (4*Math.PI)/3]; // 0, 120, 240 deg
            const width = 0.26; // +/- 15 deg width
            for(let l of lanes) {
                let diff = Math.abs(normAngle - l);
                if (diff > Math.PI) diff = 2*Math.PI - diff;
                if (diff < width) return true;
            }
            return false;
        };

        loader.load(packUrl, (gltf) => {
            const heroTrees = [], fillerTrees = [], rockAssets = [], grassAssets = [], flowerAssets = [];
            gltf.scene.traverse(child => {
                if (child.isMesh || child.isGroup) {
                    const name = child.name || ""; let isBlocked = false;
                    BLOCKED_NAMES.forEach(term => { if(name.includes(term)) isBlocked = true; });
                    if (!isBlocked && child.parent === gltf.scene) {
                        child.position.set(0,0,0); child.rotation.set(0,0,0); child.scale.set(1,1,1);
                        if (name.includes("Pine")) heroTrees.push(child); else if (name.includes("Grass")) grassAssets.push(child); else if (name.includes("Flower") || name.includes("Plant")) flowerAssets.push(child); else if (name.includes("Rock")) rockAssets.push(child); else if (name.includes("Tree")) fillerTrees.push(child);
                    }
                }
            });
            if(heroTrees.length === 0) heroTrees.push(...fillerTrees);
            
            const totalVeg = 1500; 
            try {
                for(let i=0; i<totalVeg; i++) {
                    let template, s;
                    if (Math.random() < 0.8 && grassAssets.length > 0) { template = grassAssets[Math.floor(Math.random() * grassAssets.length)]; s = 2.0 + Math.random() * 0.8; } 
                    else if (flowerAssets.length > 0) { template = flowerAssets[Math.floor(Math.random() * flowerAssets.length)]; s = 1.5 + Math.random() * 0.5; } 
                    else continue;
                    
                    const angle = Math.random() * Math.PI * 2; const bias = Math.pow(Math.random(), 2.5); const r = 12 + (bias * 68); 
                    const x = Math.cos(angle)*r; const z = Math.sin(angle)*r;
                    
                    if (isPath(x, z)) continue; // Skip paths

                    const el = document.createElement('a-entity'); el.setObject3D('mesh', template.clone());
                    el.setAttribute('position', `${x} 0 ${z}`); el.setAttribute('rotation', `0 ${Math.random()*360} 0`); el.setAttribute('scale', `${s} ${s} ${s}`); el.setAttribute('shadow', 'cast: false; receive: true'); scene.appendChild(el);
                }
            } catch(e) { console.error("Veg Spawn Error", e); }

            const placedItems = [];
            function spawnObject(pool, x, z, scale, isRock) {
                const template = pool[Math.floor(Math.random() * pool.length)];
                for (let p of placedItems) { const d = Math.sqrt((p.x-x)**2 + (p.z-z)**2); if (d < (p.r + 2.0)) return; }
                const el = document.createElement('a-entity'); el.setObject3D('mesh', template.clone());
                el.setAttribute('position', `${x} 0 ${z}`); el.setAttribute('rotation', `0 ${Math.random()*360} 0`); el.setAttribute('scale', `${scale} ${scale} ${scale}`); el.setAttribute('shadow', 'cast: true; receive: true');
                scene.appendChild(el);
                GAME.obstacles.push({x: x, z: z, r: isRock ? 1.0 : 1.2}); placedItems.push({x: x, z: z, r: 1.5}); if(!isRock) GAME.trees.push(el); 
                el.addEventListener('loaded', () => { const obj = el.getObject3D('mesh'); if(obj) { const b = new THREE.Box3().setFromObject(obj); el.object3D.position.y -= b.min.y; } });
            }
            if(heroTrees.length > 0) {
                let attempts = 0; let count = 0;
                while(count < 150 && attempts < 3000) {
                    attempts++; const angle = Math.random() * Math.PI * 2; const r = 30 + Math.random() * 50; 
                    const x = Math.cos(angle)*r; const z = Math.sin(angle)*r;
                    
                    if (isPath(x, z)) continue; // Skip paths

                    spawnObject(heroTrees, x, z, 1.8 + Math.random(), false); count++;
                }
            }
            document.getElementById('loading-area').style.display = 'block';
        });
    }
});
    AFRAME.registerComponent('resource-drop', {
    init: function() { this.el.setAttribute('animation', 'property: position; to: ' + this.el.object3D.position.x + ' 1.5 ' + this.el.object3D.position.z + '; dir: alternate; dur: 1000; loop: true'); },
    tick: function(t, dt) {
    if(!GAME.active || GAME.paused) return;
    const playerEl = document.getElementById('player'); if (!playerEl) return;
    const pPos = playerEl.object3D.position; const myPos = this.el.object3D.position;
    
    // --- 修改：判定吸取範圍 ---
    // 如果 Combo >= 8，範圍變成 25 (全場)，否則使用原本的 magnetRange
    let currentRange = (GAME.combo >= 8) ? 25.0 : GAME.magnetRange;
    const dist3D = myPos.distanceTo(pPos);
    
    if(dist3D < currentRange) {
    this.el.removeAttribute('animation'); 
    const dir = new THREE.Vector3().subVectors(pPos, myPos).normalize();
    // 加快吸取速度，讓全場吸取更爽快 (原本是 15.0)
    const flySpeed = (GAME.combo >= 8) ? 25.0 : 15.0; 
    const speed = flySpeed * (dt/1000); myPos.add(dir.multiplyScalar(speed));
    }
    // ------------------------

    const dist2D = Math.sqrt(Math.pow(pPos.x - myPos.x, 2) + Math.pow(pPos.z - myPos.z, 2));
    if(dist2D < 2.5) {
GAME.gems++; updateHUD(); spawnDamageText("+1 GEM", myPos, false, true); this.el.parentNode.removeChild(this.el);
    }
}
});

// --- NEW COMPONENT: CAMERA FOLLOW ---
AFRAME.registerComponent('camera-follow', {
    schema: { target: {type: 'selector'} },
    tick: function() {
        if (!this.data.target) return;
        const targetPos = this.data.target.object3D.position;
        const targetRot = this.data.target.object3D.rotation;
        
        // Always sync position
        this.el.object3D.position.set(targetPos.x, targetPos.y, targetPos.z);
        
        // Get Control Mode from Target
        const ctrl = this.data.target.components['universal-controls'];
        
        if (ctrl && ctrl.camMode === 2) {
            // Top-Down: Lock Rotation (Absolute North)
            this.el.object3D.rotation.y = 0;
        } else {
            // FPS/TPS: Follow Player Rotation
            this.el.object3D.rotation.y = targetRot.y;
        }
    }
});

