const SAVE_KEY = 'moonwell_save_v1';
// Updated to include playerHp and wellHp in default save
let PLAYER_SAVE = { shards: 0, upgrades: { damage: 0, gems: 0, magnet: 0, speed: 0, playerHp: 0, wellHp: 0 } };

function loadSave() {
    const data = localStorage.getItem(SAVE_KEY);
    if(data) { try { PLAYER_SAVE = { ...PLAYER_SAVE, ...JSON.parse(data) }; } catch(e) { console.error("Save Corrupt", e); } }
    updateShardDisplay();
}
function saveGame() { localStorage.setItem(SAVE_KEY, JSON.stringify(PLAYER_SAVE)); updateShardDisplay(); }
function updateShardDisplay() { document.querySelectorAll('#menu-shards, #shop-shards').forEach(el => el.innerText = PLAYER_SAVE.shards); }

let titleClicks = 0;
document.getElementById('game-title').addEventListener('click', () => {
    titleClicks++;
    if(titleClicks === 5) { document.getElementById('settings-panel').style.display = 'grid'; alert("DEV MODE ENABLED"); }
});
function addCheatShards() { PLAYER_SAVE.shards += 500; saveGame(); }
function resetUniverse() {
    if(confirm("RESET ALL PROGRESS? This cannot be undone.")) {
        localStorage.clear(); location.reload();
    }
}

// Updated Shop Items with Player HP and Well HP
const SHOP_ITEMS = [
    { id: 'damage', name: 'Lunar Coating', desc: '+10% Damage per level', levels: 10, costBase: 100, costMult: 2, icon: 'Red' },
    { id: 'gems', name: 'Ancestral Wealth', desc: '+3 Starting Gems per level', levels: 5, costBase: 200, costMult: 2.5, icon: 'Green' },
    { id: 'magnet', name: 'Spirit Magnet', desc: '+2m Pickup Range per level', levels: 3, costBase: 150, costMult: 2, icon: 'Blue' },
    { id: 'speed', name: 'Wind Stride', desc: '+5% Move Speed per level', levels: 3, costBase: 100, costMult: 2, icon: 'White' },
    // NEW ITEMS
    { id: 'playerHp', name: 'Titan Blood', desc: '+15% Max HP per level', levels: 10, costBase: 500, costMult: 2, icon: 'Red' },
    { id: 'wellHp', name: 'Lunar Fortitude', desc: '+15% Core HP per level', levels: 10, costBase: 500, costMult: 2, icon: 'Blue' }
];
function openMoonAltar() { document.getElementById('start-screen').style.display = 'none'; document.getElementById('moon-altar-screen').style.display = 'flex'; renderShop(); }
function closeMoonAltar() { document.getElementById('moon-altar-screen').style.display = 'none'; document.getElementById('start-screen').style.display = 'flex'; }
function renderShop() {
    const container = document.getElementById('shop-container'); container.innerHTML = '';
    SHOP_ITEMS.forEach(item => {
        const currentLvl = PLAYER_SAVE.upgrades[item.id] || 0;
        const cost = Math.floor(item.costBase * Math.pow(item.costMult, currentLvl));
        const isMax = currentLvl >= item.levels;
        const div = document.createElement('div');
        div.className = `shop-item ${(!isMax && PLAYER_SAVE.shards >= cost) ? 'purchasable' : ''} ${isMax ? 'maxed-out' : ''}`;
        div.innerHTML = `<div class="shop-lvl">Lvl ${currentLvl} / ${item.levels}</div><h3 style="color:${item.icon === 'Red' ? '#ff5555' : item.icon==='Green'?'#55ff55':'#55aaff'}">${item.name}</h3><p>${item.desc}</p><div class="shop-cost">${isMax ? 'MAXED' : cost + ' Shards'}</div>`;
        if(!isMax && PLAYER_SAVE.shards >= cost) { div.onclick = () => { PLAYER_SAVE.shards -= cost; PLAYER_SAVE.upgrades[item.id]++; saveGame(); renderShop(); }; }
        container.appendChild(div);
    });
}
