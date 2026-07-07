// --- OPTIMIZED: TRAIL SYSTEM (OBJECT POOL) ---
// Manages a pool of particles to prevent Garbage Collection stutter
AFRAME.registerSystem('trail-system', {
    init: function() {
this.poolSize = 80; 
this.particles = [];
this.activeParticles = [];

// Create container for clean hierarchy
const container = document.createElement('a-entity');
container.setAttribute('id', 'trail-pool-container');
this.el.appendChild(container);

for(let i = 0; i < this.poolSize; i++) {
    const el = document.createElement('a-entity');
    // Use simple geometry for performance
    el.setAttribute('geometry', 'primitive: sphere; radius: 0.15; segmentsWidth: 8; segmentsHeight: 8');
    el.setAttribute('material', 'shader: flat; transparent: true; opacity: 0; depthTest: false');
    el.object3D.visible = false; // Hide initially
    container.appendChild(el);
    
    this.particles.push({
        el: el,
        mesh: null, 
        life: 0,
        maxLife: 0.5, 
        active: false
    });

    // Cache the mesh access once loaded
    el.addEventListener('loaded', () => {
        this.particles[i].mesh = el.getObject3D('mesh');
    });
}
    },

    spawn: function(position, color) {
// Find first inactive particle
const p = this.particles.find(p => !p.active);
if(!p || !p.mesh) return; // Pool empty or not ready

p.active = true;
p.life = p.maxLife;

// Reset Transform
p.el.object3D.position.copy(position);
p.el.object3D.scale.set(1, 1, 1);
p.el.object3D.visible = true;

// Apply Color & Reset Opacity
// We manipulate ThreeJS material directly to avoid A-Frame overhead
if(Array.isArray(p.mesh.material)) {
    p.mesh.material.forEach(m => {
        m.color.set(color);
        m.opacity = 0.6;
    });
} else {
    p.mesh.material.color.set(color);
    p.mesh.material.opacity = 0.6;
}

this.activeParticles.push(p);
    },

    tick: function(t, dt) {
if(GAME.paused || this.activeParticles.length === 0) return;

const delta = dt / 1000;

// Loop backwards to allow safe removal with splice
for(let i = this.activeParticles.length - 1; i >= 0; i--) {
    const p = this.activeParticles[i];
    p.life -= delta;

    if(p.life <= 0) {
        // Return to pool
        p.active = false;
        p.el.object3D.visible = false;
        this.activeParticles.splice(i, 1);
    } else {
        // Update Animation
        const progress = p.life / p.maxLife; // 1.0 to 0.0
        const scale = progress * 1.0; 
        const opacity = progress * 0.6; 
        
        p.el.object3D.scale.set(scale, scale, scale);
        if(p.mesh) {
            if(Array.isArray(p.mesh.material)) {
                p.mesh.material.forEach(m => m.opacity = opacity);
            } else {
                p.mesh.material.opacity = opacity;
            }
        }
    }
}
    }
});

AFRAME.registerComponent('meteor-trail', {
    schema: {
interval: {type: 'number', default: 40}, // Increased frequency slightly for smoothness
color: {type: 'color', default: '#fff'}
    },
    init: function() {
this.timer = 0;
this.system = this.el.sceneEl.systems['trail-system'];
    },
    tick: function(t, dt) {
if(GAME.paused) return;
this.timer += dt;
if(this.timer > this.data.interval) {
    this.timer = 0;
    // Delegate spawning to the system
    if(this.system) {
        this.system.spawn(this.el.object3D.position, this.data.color);
    }
}
    }
});
