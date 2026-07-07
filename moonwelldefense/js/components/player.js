AFRAME.registerComponent('universal-controls', {
    init: function () {
this.cameraRig = document.getElementById('camera-rig');
this.camPivot = document.getElementById('cam-pivot');
this.camera = this.camPivot.querySelector('a-camera');

this.bow = this.el.querySelector('#bow-rig'); 
this.nockedArrow = this.el.querySelector('#nocked-arrow'); this.nockedArrow.setAttribute('visible', 'true'); 
this.laser = this.el.querySelector('#laser-sight');
this.trajectoryGuide = this.el.querySelector('#trajectory-guide');
const btnCall = document.getElementById('call-btn'); 
if(btnCall) btnCall.addEventListener('click', () => this.toggleAllyCommand());
const guideArrow = this.trajectoryGuide.querySelector('a-triangle');
if(guideArrow) guideArrow.setAttribute('rotation', '0 0 180'); 

const speedLvl = PLAYER_SAVE.upgrades.speed || 0; this.speed = 0.15 * (1 + (speedLvl * 0.05)); 
this.keys = {}; this.triggerHeld = false; this.input = { x: 0, y: 0 }; this.lastRecallTime = 0; 

this.isAiming = false;
this.aimVector = new THREE.Vector3(0, 0, -1);
this.touchStartTime = 0;
this.camMode = 1; // 1: TPS (default)
this.isFiringAnim = false;
this.fireRate = 250; // 連射速度 (ms)

this.raycaster = new THREE.Raycaster();
this.lastState = "Idle_B";

// --- EVENT LISTENERS ---
       window.addEventListener('keydown', e => { 
    if(e.code === 'Escape') togglePause(); 
    if(e.code === 'KeyB') this.summonAlly(); 
    if(e.code === 'KeyV') this.interactAction();
    if(e.code === 'KeyC') this.toggleCamera();
    
    // --- ADD THIS LINE ---
    if(e.code === 'KeyR') this.toggleAllyCommand(); 
    // --------------------

    this.keys[e.code] = true; 
        });
window.addEventListener('keyup', e => this.keys[e.code] = false);

// --- MOUSE CONTROLS (DESKTOP) ---
document.addEventListener('mousedown', (e) => {
    if(!GAME.active || GAME.paused || GAME.isMobile) return;
    this.triggerHeld = true; // 標記為按住
    
    if(this.camMode === 2) {
        // Top-Down: 開始蓄力計時
        this.touchStartTime = Date.now();
        GAME.isCharged = false;
        this.isAiming = true;
    } else {
        // FPS/TPS: 立即射擊第一發 (連射開始)
        document.body.requestPointerLock();
        this.shoot(); 
    }
});

document.addEventListener('mouseup', (e) => {
    if(!GAME.active || GAME.paused || GAME.isMobile) return;
    this.triggerHeld = false; // 釋放按鍵
    
    if(this.camMode === 2) {
        // Top-Down: 釋放時射擊
        const duration = Date.now() - this.touchStartTime;
        this.isAiming = false;
        if(duration < 200) { this.quickAttack(); } else { this.shoot(); }
    }
});

document.addEventListener('mousemove', (e) => { 
    if(GAME.paused) return;
    if (document.pointerLockElement === document.body && !GAME.isMobile && this.camMode !== 2) { 
        this.el.object3D.rotation.y -= e.movementX * 0.002; 
        this.camera.object3D.rotation.x -= e.movementY * 0.002; 
        this.camera.object3D.rotation.x = Math.max(-0.8, Math.min(0.8, this.camera.object3D.rotation.x)); 
    } else if (this.camMode === 2 && !GAME.isMobile) {
        const mouse = new THREE.Vector2();
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(mouse, this.camera.getObject3D('camera'));
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
        const target = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, target);
        if(target) {
            const pPos = this.el.object3D.position;
            this.aimVector.set(target.x - pPos.x, 0, target.z - pPos.z).normalize();
        }
    }
});

if (GAME.isMobile) { 
    document.getElementById('mobile-controls').style.display = 'block'; 
    document.getElementById('ally-controls').style.display = 'flex'; 
    this.setupTouch(); 
}

const btnB = document.getElementById('build-btn'); if(btnB) btnB.addEventListener('click', () => this.summonAlly());
const btnF = document.getElementById('interact-btn'); if(btnF) btnF.addEventListener('click', () => this.interactAction());
const btnC = document.getElementById('cam-btn'); if(btnC) btnC.addEventListener('click', () => this.toggleCamera());

GAME.lastShotTime = Date.now();
    },
    toggleCamera: function() {
this.camMode = (this.camMode + 1) % 3;
const pivot = this.camPivot;
const cam = this.camera;

pivot.removeAttribute('animation__pos');
pivot.removeAttribute('animation__rot');

// Reset States
GAME.isCharged = false;
this.triggerHeld = false;
document.getElementById('charge-indicator').style.opacity = 0;
document.getElementById('crosshair').classList.remove('charged');
this.trajectoryGuide.querySelector('a-plane').setAttribute('color', '#00ffff');

if (this.camMode === 2) {
    document.exitPointerLock();
    document.getElementById('crosshair').style.display = 'none';
    this.bow.setAttribute('rotation', '0 90 0');
} else {
    document.getElementById('crosshair').style.display = 'block';
    this.bow.setAttribute('rotation', '0 270 0');
}

if (this.camMode === 0) { // FPS
    pivot.setAttribute('animation__pos', 'property: position; to: 0 1.7 0.2; dur: 500; easing: easeInOutQuad');
    pivot.setAttribute('animation__rot', 'property: rotation; to: 0 0 0; dur: 500; easing: easeInOutQuad');
    cam.setAttribute('fov', '85');
    this.laser.setAttribute('visible', 'false');
} else if (this.camMode === 1) { // TPS
    pivot.setAttribute('animation__pos', 'property: position; to: 0.8 2.5 4.5; dur: 500; easing: easeInOutQuad');
    pivot.setAttribute('animation__rot', 'property: rotation; to: -10 0 0; dur: 500; easing: easeInOutQuad');
    cam.setAttribute('fov', '85');
    this.laser.setAttribute('visible', 'false');
} else { // Top-Down
    pivot.setAttribute('animation__pos', 'property: position; to: 0 22 10; dur: 800; easing: easeInOutQuad');
    pivot.setAttribute('animation__rot', 'property: rotation; to: -75 0 0; dur: 800; easing: easeInOutQuad');
    cam.setAttribute('fov', '60');
    this.laser.setAttribute('visible', 'false');
    cam.object3D.rotation.set(0,0,0);
}
    },
    setupTouch: function() {
// --- PATCHED DYNAMIC JOYSTICK LOGIC ---
const stick = document.getElementById('stick-zone'); 
const stickKnob = document.getElementById('stick-knob'); 
const leftZone = document.getElementById('left-touch-zone');

let moveId = null;
let startX = 0, startY = 0;

// Dynamic Joystick Handler
const handleStart = (t) => {
    moveId = t.identifier;
    
    // Move Visual Stick to Touch Position
    const rect = leftZone.getBoundingClientRect();
    // Center the stick on the finger
    const stickRadius = 60; // Half of 120px
    stick.style.left = (t.clientX - stickRadius) + 'px';
    stick.style.top = (t.clientY - stickRadius) + 'px';
    stick.classList.add('active');
    
    // Initial zero update to set the anchor point logic in updateJoystick
    this.updateJoystick(t, stick, stickKnob, this.input); 
};

leftZone.addEventListener('touchstart', e => { 
    e.preventDefault(); 
    for(let t of e.changedTouches) {
        if(moveId === null) handleStart(t);
    }
});

leftZone.addEventListener('touchmove', e => { 
    e.preventDefault(); 
    for(let t of e.changedTouches) {
        if(t.identifier === moveId) {
            this.updateJoystick(t, stick, stickKnob, this.input); 
        }
    }
});

const resetStick = () => {
    moveId = null; 
    this.input.x = 0; 
    this.input.y = 0; 
    stickKnob.style.transform = 'translate(-50%, -50%)'; 
    stick.classList.remove('active'); // Hide stick
};

leftZone.addEventListener('touchend', e => { 
    e.preventDefault(); 
    for(let t of e.changedTouches) { if(t.identifier === moveId) resetStick(); }
});

// Safety cleanup if touch is cancelled
leftZone.addEventListener('touchcancel', e => { resetStick(); });

// --- RIGHT SIDE (SHOOTING) REMAINS SAME ---
const shootBtn = document.getElementById('shoot-btn'); 
const shootKnob = document.getElementById('shoot-knob');
let aimId = null; 

shootBtn.addEventListener('touchstart', e => { 
    e.preventDefault(); e.stopPropagation(); 
    for(let t of e.changedTouches) if(aimId===null) { 
        aimId=t.identifier; 
        this.touchStartTime = Date.now();
        this.triggerHeld = true; 
        shootBtn.classList.add('active');
        
        if (this.camMode === 2) {
            this.isAiming = true; 
            this.updateAimJoystick(t, shootBtn, shootKnob);
            GAME.isCharged = false;
        } else {
            this.shoot(); 
        }
    } 
});

shootBtn.addEventListener('touchmove', e => { 
    e.preventDefault(); e.stopPropagation();
    if (this.camMode === 2) {
        for(let t of e.changedTouches) if(t.identifier===aimId) {
            this.updateAimJoystick(t, shootBtn, shootKnob);
        }
    }
});

shootBtn.addEventListener('touchend', e => { 
    e.preventDefault(); e.stopPropagation();
    for(let t of e.changedTouches) if(t.identifier===aimId) { 
        aimId=null; 
        this.triggerHeld = false; 
        shootBtn.classList.remove('active');
        
        if (this.camMode === 2) {
            this.isAiming = false;
            shootKnob.style.transform='translate(0,0)';
            const duration = Date.now() - this.touchStartTime;
            if(duration < 200) this.quickAttack(); else this.shoot();
        }
    } 
});

// Aim Zone (Camera Look)
const aimZone = document.getElementById('aim-zone');
let lookId = null, lastX=0, lastY=0;
aimZone.addEventListener('touchstart', e => { 
    if(this.camMode === 2) return; 
    for(let t of e.changedTouches) if(lookId===null) { lookId=t.identifier; lastX=t.clientX; lastY=t.clientY; } 
});
aimZone.addEventListener('touchmove', e => {
    if(this.camMode === 2) return;
    for(let t of e.changedTouches) if(t.identifier===lookId) {
        const dx = t.clientX - lastX; const dy = t.clientY - lastY;
        this.el.object3D.rotation.y -= dx*0.005;
        this.camera.object3D.rotation.x -= dy*0.005;
        lastX=t.clientX; lastY=t.clientY;
    }
});
aimZone.addEventListener('touchend', e => { if(this.camMode!==2) for(let t of e.changedTouches) if(t.identifier===lookId) lookId=null; });
    },
    updateJoystick: function(t, zone, knob, out) {
const rect=zone.getBoundingClientRect(); const cx=rect.left+rect.width/2; const cy=rect.top+rect.height/2;
const dist=Math.min(Math.sqrt((t.clientX-cx)**2 + (t.clientY-cy)**2), 40);
const ang=Math.atan2(t.clientY-cy, t.clientX-cx);
const kx=Math.cos(ang)*dist; const ky=Math.sin(ang)*dist;
knob.style.transform=`translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
out.x=kx/40; out.y=ky/40;
    },
    updateAimJoystick: function(t, btn, knob) {
const rect=btn.getBoundingClientRect(); const cx=rect.left+rect.width/2; const cy=rect.top+rect.height/2;
let dx = t.clientX - cx; let dy = t.clientY - cy;
const dist = Math.sqrt(dx*dx + dy*dy);
const maxR = 35; 
const visualDist = Math.min(dist, maxR);
const ang = Math.atan2(dy, dx);
knob.style.transform = `translate(${Math.cos(ang)*visualDist}px, ${Math.sin(ang)*visualDist}px)`;
if(dist > 5) { this.aimVector.set(dx, 0, dy).normalize(); }
    },
    quickAttack: function() {
let nearest = null; let minD = 25.0;
const myPos = this.el.object3D.position;
GAME.enemyHitboxes.forEach(h => {
    if(h && h.userData && h.userData.el) {
        const ePos = h.userData.el.object3D.position;
        const d = myPos.distanceTo(ePos);
        if(d < minD) { minD = d; nearest = ePos; }
    }
});
if(nearest) {
    this.aimVector.subVectors(nearest, myPos).normalize();
    this.el.object3D.lookAt(nearest);
    this.shoot();
} else { this.shoot(); }
    },
    tick: function (t, dt) {
if (!GAME.active || GAME.paused) return;

const prompt = document.getElementById('interaction-prompt');
const wellPos = document.getElementById('moon-well').object3D.position;
if(this.el.object3D.position.distanceTo(wellPos) < 5 && !GAME.isAscending) {
    prompt.style.display = 'block'; prompt.innerHTML = `[V] PURIFY WELL (5G)`; prompt.style.color = (GAME.gems>=5)?'#00ffff':'#ff0000';
} else { prompt.style.display = 'none'; }

// --- 1. Top-Down Active Charge (需按住) ---
if (this.camMode === 2 && this.triggerHeld) {
    const duration = Date.now() - this.touchStartTime;
    if (duration > 1000 && !GAME.isCharged) {
        GAME.isCharged = true;
        document.getElementById('charge-indicator').style.opacity = 1;
        this.trajectoryGuide.querySelector('a-plane').setAttribute('color', '#00ffff');
    }
}

// --- 2. FPS/TPS Passive Charge (不按住時自動蓄力) ---
// FIX: 移除了 !GAME.isMobile，確保手機 FPS 也能自動蓄力
if (this.camMode !== 2 && !this.triggerHeld) {
    const timeSinceShot = Date.now() - GAME.lastShotTime;
    if (timeSinceShot > 1000 && !GAME.isCharged) {
        GAME.isCharged = true;
        document.getElementById('charge-indicator').style.opacity = 1;
        document.getElementById('crosshair').classList.add('charged');
    }
}

// --- 3. FPS/TPS Rapid Fire (按住時連射) ---
if (this.camMode !== 2 && this.triggerHeld) {
    const timeSince = Date.now() - GAME.lastShotTime;
    if (timeSince > this.fireRate) {
        // 連射時不使用蓄力攻擊，除非是第一發(已被 Passive Charge)
        this.shoot();
    }
}

let dx = 0, dz = 0;
if (this.input.x!==0 || this.input.y!==0) { dx = this.input.x; dz = this.input.y; }
else { if(this.keys['KeyW']) dz=-1; if(this.keys['KeyS']) dz=1; if(this.keys['KeyA']) dx=-1; if(this.keys['KeyD']) dx=1; }

const moveVec = new THREE.Vector3(dx, 0, dz);
const isMoving = moveVec.lengthSq() > 0.01;

if (this.camMode === 2) {
    // --- TOP DOWN LOGIC ---
    if(isMoving) {
        if (moveVec.length() > 1) { moveVec.normalize(); }
        moveVec.multiplyScalar(this.speed * 0.6); // 60% Speed
    }
    
    const pPos = this.el.object3D.position;
    let nextX = pPos.x + moveVec.x;
    let nextZ = pPos.z + moveVec.z;
    
    let collided = false; 
    for (let obs of GAME.obstacles) { if (Math.sqrt((obs.x - nextX)**2 + (obs.z - nextZ)**2) < (obs.r + 0.5)) { collided = true; break; } }
    if(!collided && Math.sqrt(nextX**2 + nextZ**2) < 45) {
        pPos.x = nextX; pPos.z = nextZ;
    }

    if(this.isAiming) {
        const lookTarget = pPos.clone().add(this.aimVector);
        if (pPos.distanceTo(lookTarget) > 0.1) {
            this.el.object3D.lookAt(lookTarget);
        }
        this.trajectoryGuide.setAttribute('visible', 'true');
        const guideColor = GAME.isCharged ? '#ff0000' : '#00ffff';
        this.trajectoryGuide.children[0].setAttribute('color', guideColor);
        this.trajectoryGuide.children[1].setAttribute('color', guideColor);
    } else {
        this.trajectoryGuide.setAttribute('visible', 'false');
        if(isMoving) {
            const targetRot = Math.atan2(moveVec.x, moveVec.z);
            this.el.object3D.rotation.y = targetRot;
        }
    }

} else {
    // --- FPS/TPS LOGIC ---
    if(isMoving) {
        const rot = this.el.object3D.rotation.y;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const rdx = dx * cos + dz * sin;
        const rdz = -dx * sin + dz * cos;
        
        // --- FIX: 統一針對手機端的 FPS/TPS 移動速度進行 60% 減速 ---
        let currentSpeed = this.speed;
        if (GAME.isMobile) currentSpeed *= 0.6;

        let nextX = this.el.object3D.position.x + rdx * currentSpeed;
        let nextZ = this.el.object3D.position.z + rdz * currentSpeed;
        
        let collided = false; 
        for (let obs of GAME.obstacles) { if (Math.sqrt((obs.x - nextX)**2 + (obs.z - nextZ)**2) < (obs.r + 0.5)) { collided = true; break; } }
        if(!collided && Math.sqrt(nextX**2 + nextZ**2) < 45) {
            this.el.object3D.position.x = nextX; this.el.object3D.position.z = nextZ;
        }
    }
    this.trajectoryGuide.setAttribute('visible', 'false');
}

// ANIMATION STATE MACHINE
if(this.isFiringAnim) return;

let newState = "Idle_B";
// Top-Down蓄力時用Aim，FPS/TPS 連射時保持 Idle_B (或用Shoot循環)
if(this.camMode === 2 && this.triggerHeld) newState = isMoving ? "Walking_A" : "Aim"; 
else if(isMoving) newState = "Running_A";

if(this.lastState !== newState) {
    this.lastState = newState;
    const clip = (newState==="Running_A"?"Running_A":"Idle_B");
    this.bow.setAttribute('animation-mixer', `clip: ${clip}; crossFadeDuration: 0.1; loop: repeat`);
}
    },
    shoot: function() {
if (!GAME.active || GAME.paused) return;

// Trigger Animation
this.isFiringAnim = true;
this.bow.setAttribute('animation-mixer', `clip: Shoot; crossFadeDuration: 0.05; loop: once; clampWhenFinished: true`);
setTimeout(() => { this.isFiringAnim = false; }, 500);

GAME.lastShotTime = Date.now(); 
const wasCharged = GAME.isCharged; 
GAME.isCharged = false; 
document.getElementById('charge-indicator').style.opacity = 0;
document.getElementById('crosshair').classList.remove('charged');
if(this.trajectoryGuide) this.trajectoryGuide.querySelector('a-plane').setAttribute('color', '#00ffff');

this.nockedArrow.setAttribute('visible', 'false'); 
setTimeout(() => { this.nockedArrow.setAttribute('visible', 'true'); }, 100);

const arrows = wasCharged ? (GAME.arrowsPerShot * 2) : GAME.arrowsPerShot; 
const damage = GAME.baseDamage * GAME.dmgMultiplier * (wasCharged ? 2 : 1); 
const speed = wasCharged ? 80 : 40; 
const gravity = wasCharged ? 6.0 : 9.8;
const drag = wasCharged ? 0.005 : 0.02;

// --- PATCH START: Dynamic Arrow Colors ---
let color;
const hasFire = GAME.fireLevel > 0;
const hasZap = GAME.zapLevel > 0;

if (hasFire && hasZap) {
    // Both Elements: Purple (Normal) / Neon Magenta (Charged)
    color = wasCharged ? '#ff00ff' : '#800080'; 
} else if (hasFire) {
    // Fire Only: Red (Normal) / Yellow (Charged)
    color = wasCharged ? '#ffff00' : '#ff0000'; 
} else if (hasZap) {
    // Lightning Only: Blue (Normal) / White (Charged)
    color = wasCharged ? '#ffffff' : '#0000ff'; 
} else {
    // No Elements: Orange (Normal) / Cyan (Charged)
    color = wasCharged ? '#00ffff' : '#ffaa00'; 
}
// --- PATCH END ---

let aimDir;
const spawnPos = new THREE.Vector3();
this.nockedArrow.object3D.getWorldPosition(spawnPos);

if (this.camMode === 2) {
    aimDir = this.aimVector.clone().normalize();
    aimDir.y = 0.1;
    aimDir.normalize();
} else {
    const cam = this.camera.getObject3D('camera');
    const camPos = new THREE.Vector3(); cam.getWorldPosition(camPos);
    const camDir = new THREE.Vector3(); cam.getWorldDirection(camDir);
    const raycaster = new THREE.Raycaster(camPos, camDir);
    const hits = raycaster.intersectObjects(GAME.enemyHitboxes, false);
    let targetPoint;
    if(hits.length > 0) targetPoint = hits[0].point;
    else targetPoint = camPos.clone().add(camDir.multiplyScalar(100));
    aimDir = new THREE.Vector3().subVectors(targetPoint, spawnPos).normalize();
}

for(let i=0; i<arrows; i++) { 
    const dir = aimDir.clone(); 
    if(arrows > 1) { 
        const spreadAmt = 0.05; 
        const angleH = (i - (arrows-1)/2) * spreadAmt; 
        dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), angleH); 
    } 
    this.spawnArrow(spawnPos, dir, damage, speed, gravity, drag, color); 
}
    },
    playInteract: function() {
this.bow.setAttribute('animation-mixer', 'clip: Interact; clampWhenFinished: true; loop: once; crossFadeDuration: 0.1');
setTimeout(() => { this.lastState = "ForceReset"; }, 1000);
    },
    summonAlly: function() {
if(GAME.gems >= 3) { GAME.gems -= 3; updateHUD(); this.playInteract(); const el = document.createElement('a-entity'); const pos = this.el.object3D.position.clone(); const dir = new THREE.Vector3(); this.el.object3D.getWorldDirection(dir); pos.add(dir.multiplyScalar(3)); pos.y = 0; el.setAttribute('position', pos); el.setAttribute('ally-logic', 'level: 1'); this.el.sceneEl.appendChild(el); spawnExplosion(pos, 0x00ffff, 10); } 
else { spawnDamageText("Need 3 Gems", this.el.object3D.position, true, false); }
    },

    toggleAllyCommand: function() {
const now = Date.now();
if (now - this.lastRecallTime < 200) return; 
this.lastRecallTime = now;
GAME.allyCmdState = (GAME.allyCmdState + 1) % 3;
const btn = document.getElementById('call-btn');
if (btn) {
    switch(GAME.allyCmdState) {
        case 0: 
            btn.style.background = '#3498db'; 
            btn.innerText = "FOLLOW";
            spawnDamageText("CMD: FOLLOW", this.el.object3D.position, false, true);
            break;
        case 1: 
            btn.style.background = '#f1c40f'; 
            btn.innerText = "DEFEND";
            spawnDamageText("CMD: DEFEND", this.el.object3D.position, false, true);
            break;
        case 2: 
            btn.style.background = '#e74c3c'; 
            btn.innerText = "HUNT";
            spawnDamageText("CMD: HUNT", this.el.object3D.position, false, true);
            break;
    }
    btn.style.transform = 'scale(1.2)';
    setTimeout(() => btn.style.transform = 'scale(1)', 100);
}
    },
    interactAction: function() {
if(GAME.isAscending && !GAME.isBossPhase) return;

// 1. Check for nearby Allies first
let closestAlly = null; 
let minD = 4.0;
GAME.allies.forEach(ally => { 
    if(ally && ally.object3D) { 
        const d = this.el.object3D.position.distanceTo(ally.object3D.position); 
        if(d < minD) { minD = d; closestAlly = ally; } 
    } 
});

// 2. Try to Upgrade Ally (ONLY if not Max Level)
if (closestAlly) { 
    const logic = closestAlly.components['ally-logic'];
    // FIX: Check if level < 3 BEFORE deducting gems
    if (logic && logic.data.level < 3) {
        if (GAME.gems >= 5) { 
            GAME.gems -= 5; 
            updateHUD(); 
            this.playInteract(); 
            logic.upgrade(); 
        } else { 
            spawnDamageText("Need 5 Gems", closestAlly.object3D.position, true, false); 
        } 
        return; // Interaction consumed by Ally, stop here.
    }
    // If Ally is Max Level (level >= 3), we ignore them and "Fall Through" to the Well logic below.
}

// 3. Moon Well Interaction
const wellPos = document.getElementById('moon-well').object3D.position;
if (this.el.object3D.position.distanceTo(wellPos) < 5.0) { 
    if (GAME.isAscending) return; 
    
    if (GAME.gems >= 5) { 
        GAME.gems -= 5; 
        this.playInteract(); 
        GAME.ascension += 10; 
        
        if (GAME.ascension >= GAME.maxAscension) { 
            startAscensionEvent(); 
        } else { 
            spawnExplosion(wellPos, 0xffd700, 20); 
            spawnDamageText("CHARGING...", wellPos, true, true); 
        } 
        updateHUD(); 
    } else { 
        spawnDamageText("Need 5 Gems", wellPos, true, false); 
    } 
}
    },
    spawnArrow: function(pos, dir, dmg, spd, grav, drag, color) {
const el = document.createElement('a-entity'); 
el.setAttribute('position', pos); 

const visual = document.createElement('a-entity');
visual.setAttribute('rotation', '-90 0 0');

// --- 修改重點 1: 增大箭矢模型 ---
// 半徑從 0.08 提升到 0.15，長度從 0.6 提升到 0.9，讓它看起來更有殺傷力
const head = document.createElement('a-entity');
head.setAttribute('geometry', 'primitive: cone; radiusBottom: 0.15; radiusTop: 0; height: 0.9');
head.setAttribute('material', 'shader: flat; color: #ffffaa');
head.setAttribute('position', '0 0.45 0'); // 調整中心點，適應新的長度

// --- 修改重點 2: 增大光暈特效 ---
// 半徑從 0.15 提升到 0.35，讓飛行軌跡更明顯
const glow = document.createElement('a-entity');
glow.setAttribute('geometry', 'primitive: sphere; radius: 0.25');
glow.setAttribute('material', `shader: flat; color: ${color}; transparent: true; opacity: 0.6`);

visual.appendChild(head);
visual.appendChild(glow);
el.appendChild(visual);

// 增加拖尾的寬度 (如果 trail-system 支援的話，這裡先保持顏色)
el.setAttribute('meteor-trail', {color: color});

el.setAttribute('arrow-physics', { vx: dir.x*spd, vy: dir.y*spd, vz: dir.z*spd, damage: dmg, gravity: grav, drag: drag }); 
document.getElementById('projectile-container').appendChild(el);
    }
});

function triggerDirectionalDamage(sourcePos) {
    const ind = document.getElementById('damage-indicator'); const player = document.querySelector('#player'); if (!ind || !player || !sourcePos) return;
    const rig = document.querySelector('#bow-rig'); if(rig) rig.setAttribute('animation-mixer', 'clip: Hit_B; loop: once; clampWhenFinished: true; crossFadeDuration: 0.1');
    const cam = document.querySelector('a-camera').object3D; const camWorldDir = new THREE.Vector3(); cam.getWorldDirection(camWorldDir); const camAngle = Math.atan2(camWorldDir.x, camWorldDir.z);
    const enemyDir = new THREE.Vector3().subVectors(sourcePos, player.object3D.position); const enemyAngle = Math.atan2(enemyDir.x, enemyDir.z);
    let angleDiff = enemyAngle - camAngle; while(angleDiff > Math.PI) angleDiff -= Math.PI*2; while(angleDiff < -Math.PI) angleDiff += Math.PI*2;
    ind.style.background = `radial-gradient(circle at ${50 + Math.sin(angleDiff)*40}% ${50 - Math.cos(angleDiff)*40}%, rgba(255, 0, 0, 0.6) 0%, transparent 40%)`; ind.style.opacity = 1; setTimeout(() => { ind.style.opacity = 0; }, 500);
}
