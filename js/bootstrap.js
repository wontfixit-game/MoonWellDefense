document.querySelector('a-scene').addEventListener('loaded', () => {
    loadSave();
    document.getElementById('loading-area').style.display = 'none';
    const vrBtn = document.querySelector('.a-enter-vr');
    if (vrBtn) vrBtn.style.display = 'none';
});

// Skip versus lobby — go straight to solo main menu
window.addEventListener('DOMContentLoaded', () => {
    const lobby = document.getElementById('mp-lobby');
    const start = document.getElementById('start-screen');
    if (lobby) lobby.classList.remove('active');
    if (start) start.style.display = 'flex';
});

// Verify 3D assets load; show error overlay if not
(function() {
    const overlay = document.createElement('div');
    overlay.id = 'asset-error-overlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.85);color:#fff;font-family:sans-serif;align-items:center;justify-content:center;text-align:center;padding:24px;';
    overlay.innerHTML = '<div><h2 style="color:#ff5555">Assets failed to load</h2><p id="asset-error-msg">Please hard refresh (Ctrl+F5).</p><button onclick="location.reload(true)" style="margin-top:16px;padding:12px 24px;font-size:16px;cursor:pointer;">Reload</button></div>';
    document.body.appendChild(overlay);

    const assets = document.querySelector('a-assets');
    if (!assets) return;

    let loaded = false;
    const timeout = setTimeout(() => {
        if (!loaded) {
            document.getElementById('asset-error-msg').textContent = 'Loading timed out. Hard refresh with Ctrl+F5 or clear browser cache.';
            overlay.style.display = 'flex';
        }
    }, 20000);

    assets.addEventListener('loaded', () => {
        loaded = true;
        clearTimeout(timeout);
    });

    assets.addEventListener('error', (e) => {
        const src = e.detail?.src || e.target?.getAttribute('src') || 'unknown asset';
        document.getElementById('asset-error-msg').textContent = 'Failed: ' + src;
        overlay.style.display = 'flex';
    });
})();
