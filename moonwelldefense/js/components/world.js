AFRAME.registerComponent('well-manager', {
    init: function() {
        const el = this.el;
        this.wellMesh = null;
        const loader = new THREE.GLTFLoader();
        const src = document.querySelector('#model-well').getAttribute('src');
        if(!src) return;

        loader.load(src, (gltf) => {
            const scene = gltf.scene;
            scene.scale.set(0.82, 0.82, 0.82);
            const box = new THREE.Box3().setFromObject(scene);
            const center = new THREE.Vector3();
            box.getCenter(center);
            scene.position.x = -center.x;
            scene.position.z = -center.z;
            scene.position.y = -box.min.y - 0.35;
            el.setObject3D('mesh', scene);
            this.wellMesh = scene;
            scene.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material = child.material.clone();
                }
            });
        });
    },
    tick: function() {
        if (!this.wellMesh || !GAME.active) return;
        const player = document.getElementById('player');
        if (!player) return;
        const dist = player.object3D.position.distanceTo(this.el.object3D.position);
        const opacity = dist < 5 ? 0.25 : (dist < 9 ? 0.55 : 1.0);
        this.wellMesh.traverse(child => {
            if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(mat => {
                    mat.transparent = opacity < 0.99;
                    mat.opacity = opacity;
                    mat.depthWrite = opacity > 0.5;
                });
            }
        });
    }
});

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
        
        const isPath = (x, z) => {
            const angle = Math.atan2(z, x); 
            let normAngle = angle;
            if(normAngle < 0) normAngle += Math.PI * 2;
            const lanes = [0, (2*Math.PI)/3, (4*Math.PI)/3];
            const width = 0.26;
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
                    
                    if (isPath(x, z)) continue;

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
                    
                    if (isPath(x, z)) continue;

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
    
    let currentRange = (GAME.combo >= 8) ? 25.0 : GAME.magnetRange;
    const dist3D = myPos.distanceTo(pPos);
    
    if(dist3D < currentRange) {
    this.el.removeAttribute('animation'); 
    const dir = new THREE.Vector3().subVectors(pPos, myPos).normalize();
    const flySpeed = (GAME.combo >= 8) ? 25.0 : 15.0; 
    const speed = flySpeed * (dt/1000); myPos.add(dir.multiplyScalar(speed));
    }

    const dist2D = Math.sqrt(Math.pow(pPos.x - myPos.x, 2) + Math.pow(pPos.z - myPos.z, 2));
    if(dist2D < 2.5) {
GAME.gems++; updateHUD(); spawnDamageText("+1 GEM", myPos, false, true); this.el.parentNode.removeChild(this.el);
    }
}
});

AFRAME.registerComponent('camera-follow', {
    schema: { target: {type: 'selector'} },
    tick: function() {
        if (!this.data.target) return;
        const targetPos = this.data.target.object3D.position;
        const targetRot = this.data.target.object3D.rotation;
        
        this.el.object3D.position.set(targetPos.x, targetPos.y, targetPos.z);
        
        const ctrl = this.data.target.components['universal-controls'];
        
        if (ctrl && ctrl.camMode === 2) {
            this.el.object3D.rotation.y = 0;
        } else {
            this.el.object3D.rotation.y = targetRot.y;
        }
    }
});
