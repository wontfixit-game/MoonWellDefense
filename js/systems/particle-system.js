AFRAME.registerComponent('particle-system', {
    init: function() {
        this.scene = this.el.sceneEl;
    },
    spawn: function(pos, color, count) {
        count = count || 8;
        const hex = typeof color === 'number' ? color : parseInt(String(color).replace('#', ''), 16);
        const c = '#' + hex.toString(16).padStart(6, '0');
        for (let i = 0; i < count; i++) {
            const p = document.createElement('a-entity');
            const size = 0.1 + Math.random() * 0.15;
            p.setAttribute('geometry', `primitive: sphere; radius: ${size}`);
            p.setAttribute('material', `shader: flat; color: ${c}; transparent: true; opacity: 0.95`);
            p.setAttribute('position', pos);
            const ang = Math.random() * Math.PI * 2;
            const spd = 2 + Math.random() * 4;
            const tx = pos.x + Math.cos(ang) * spd;
            const ty = pos.y + 0.5 + Math.random() * 3;
            const tz = pos.z + Math.sin(ang) * spd;
            p.setAttribute('animation', `property: position; to: ${tx} ${ty} ${tz}; dur: 400; easing: easeOutQuad`);
            p.setAttribute('animation__fade', 'property: material.opacity; to: 0; dur: 400; easing: linear');
            this.scene.appendChild(p);
            setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, 450);
        }
    }
});
