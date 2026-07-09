       // 找到原本的 GAME 物件，修改為：
const GAME = {
    started: false, active: false, paused: false, 
    wave: 0, inUpgradeMenu: false, gems: 0, toSpawn: 0, totalKills: 0,
    ascension: 0, maxAscension: 100, isAscending: false, survivalTime: 90, isBossPhase: false, 
    vampiricLevel: 0, spectralLevel: 0, timePhase: 0, playerHP: 100, maxPlayerHP: 100, wellHP: 3000, maxWellHP: 3000, 
    isMobile: /Android|iPhone|iPad/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1,
    baseDamage: 40, dmgMultiplier: 1.0, arrowsPerShot: 1, fireLevel: 0, zapLevel: 0,
    lastShotTime: 0, isCharged: false,
    enemyHitboxes: [], allies: [], allyHitboxes: [], traps: [], obstacles: [], trees: [], lastAttacker: null,
    trapCost: 4, trapUpgradeCost: 5, trapKills: 0,
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
        GAME.traps = []; GAME.trapKills = 0;
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
    grunt:    { model: '#model-grunt',  scale: '1 1 1',   hp: 90, move: 'Walk', atk: 'Attack', hit: 'HitRecieve', dmg: 15, speed: 0.055, headY: 1.6, radius: 1.2, range: 2.5, projectile: false },
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
