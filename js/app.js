import { AppState } from './core/state.js';

// --- CONFIGURAZIONE FILE ---
const monsterFiles = [
    './data/monsters/v35_low_cr.json',
    './data/monsters/v35_high_cr.json',
    './data/monsters/v5_low_cr.json',
    './data/monsters/v5_high_cr.json'
];

const spellFiles = [
    './data/spells/v35_lvl0.json',
    './data/spells/v35_lvl1.json',
    './data/spells/v35_lvl2.json',
    './data/spells/v35_lvl3plus.json',
    './data/spells/v5_lvl0.json',
    './data/spells/v5_lvl1.json',
    './data/spells/v5_lvl2.json',
    './data/spells/v5_lvl3plus.json'
];

// --- STATO INIZIALE ---
AppState.combatants = [];
AppState.totalXP = parseInt(localStorage.getItem('dm_total_xp')) || 0;
AppState.party = JSON.parse(localStorage.getItem('dm_party')) || [];
AppState.activePGs = JSON.parse(localStorage.getItem('dm_active_pgs')) || [];
AppState.log = JSON.parse(localStorage.getItem('dm_log')) || [];

// Tabella rapida XP
const xpTable = { "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "5": 1100, "10": 5900, "20": 25000 };

// Funzione per calcolare il modificatore (globale)
window.getMod = (score) => Math.floor((score - 10) / 2);

// --- CARICAMENTO FILES ---
async function loadFiles(fileList) {
    const results = await Promise.all(
        fileList.map(url => fetch(url + '?v=' + Date.now())
            .then(res => res.ok ? res.json() : [])
            .catch(() => []))
    );
    return results.flat();
}

// --- FUNZIONI LOG E SESSIONE ---
window.addLog = (msg) => {
    const now = new Date();
    const time = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    const entry = `[${time}] ${msg}`;
    AppState.log.unshift(entry);
    if (AppState.log.length > 20) AppState.log.pop();
    localStorage.setItem('dm_log', JSON.stringify(AppState.log));
    renderLog();
};

window.clearLog = () => {
    if (confirm("Vuoi cancellare il diario di questa sessione?")) {
        AppState.log = [];
        localStorage.setItem('dm_log', JSON.stringify(AppState.log));
        renderLog();
    }
};

window.saveSession = () => {
    localStorage.setItem('dm_party', JSON.stringify(AppState.party));
    localStorage.setItem('dm_log', JSON.stringify(AppState.log));
    localStorage.setItem('dm_total_xp', AppState.totalXP.toString());
    localStorage.setItem('dm_active_pgs', JSON.stringify(AppState.activePGs));
    window.addLog("Sessione salvata manualmente");
    alert("Sessione salvata con successo!");
};

// --- FUNZIONE SOS RESET COMBATTIMENTO ---
window.resetCombat = () => {
    if (confirm("Vuoi resettare il combattimento? I mostri spariranno, i PG resteranno.")) {
        AppState.combatants = AppState.combatants.filter(c => c.isPlayer);
        renderCombat();
        window.addLog("Combattimento resettato (solo mostri rimossi)");
    }
};

// --- GESTIONE PARTY FLESSIBILE ---
window.saveParty = () => {
    localStorage.setItem('dm_party', JSON.stringify(AppState.party));
    localStorage.setItem('dm_active_pgs', JSON.stringify(AppState.activePGs));
    renderParty();
};

window.addPG = () => {
    const name = prompt("Nome dell'Eroe:");
    if (!name || name.trim() === "") return;
    
    const newPG = {
        id: Date.now(),
        name: name.trim(),
        level: 1,
        stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        baseAc: 10,
        hpMax: 10,
        currentHp: 10,
        xp: 0
    };
    
    AppState.party.push(newPG);
    // Automaticamente attivo quando creato
    AppState.activePGs.push(newPG.id);
    saveParty();
    window.addLog(`Creato nuovo PG: ${newPG.name}`);
};

// Funzione per gestire i PG attivi in sessione
window.togglePGActive = (pgId) => {
    const index = AppState.activePGs.indexOf(pgId);
    const pg = AppState.party.find(p => p.id === pgId);
    
    if (index === -1) {
        AppState.activePGs.push(pgId);
        window.addLog(`PG attivato per la sessione: ${pg?.name || 'Sconosciuto'}`);
    } else {
        AppState.activePGs.splice(index, 1);
        // Rimuovi dal combattimento se presente
        AppState.combatants = AppState.combatants.filter(c => !(c.isPlayer && c.instanceId === pgId));
        window.addLog(`PG disattivato: ${pg?.name || 'Sconosciuto'}`);
    }
    saveParty();
    renderCombat();
};

// Nuova funzione per selezionare a chi assegnare XP
window.selectPGsForXP = () => {
    if (AppState.totalXP === 0) {
        alert("Nessun XP da assegnare!");
        return;
    }
    
    if (AppState.activePGs.length === 0) {
        alert("Nessun PG attivo per assegnare XP!");
        return;
    }
    
    // Crea una lista di checkbox per selezionare i PG attivi
    let modalContent = `
        <h3 style="color:#bb86fc; margin-bottom:15px;">🏆 Assegna XP a Specifici PG</h3>
        <p style="margin-bottom:15px;">XP totali disponibili: <b style="color:#ffd700">${AppState.totalXP}</b></p>
        <div style="max-height:300px; overflow-y:auto; margin-bottom:20px;">
    `;
    
    AppState.activePGs.forEach(pgId => {
        const pg = AppState.party.find(p => p.id === pgId);
        if (pg) {
            modalContent += `
                <div style="display:flex; align-items:center; padding:10px; border-bottom:1px solid #333; background:#252525; margin-bottom:5px;">
                    <input type="checkbox" id="pg-${pg.id}" checked style="margin-right:10px;">
                    <label for="pg-${pg.id}" style="flex:1; cursor:pointer;">
                        <strong>${pg.name}</strong> (Liv. ${pg.level}, XP attuali: ${pg.xp || 0})
                    </label>
                </div>
            `;
        }
    });
    
    modalContent += `
        </div>
        <div style="display:flex; gap:10px;">
            <button onclick="assignXpToSelected()" style="flex:1; padding:12px; background:#bb86fc; color:black; border:none; border-radius:5px; font-weight:bold;">
                🎯 Assegna XP ai Selezionati
            </button>
            <button onclick="document.getElementById('xp-assign-modal').style.display='none'" style="flex:1; padding:12px; background:#444; color:white; border:none; border-radius:5px;">
                Annulla
            </button>
        </div>
    `;
    
    // Mostra il modal
    document.getElementById('xp-assign-content').innerHTML = modalContent;
    document.getElementById('xp-assign-modal').style.display = 'block';
};

window.assignXpToSelected = () => {
    const selectedPGs = [];
    const checkboxes = document.querySelectorAll('#xp-assign-content input[type="checkbox"]:checked');
    
    checkboxes.forEach(cb => {
        const pgId = parseInt(cb.id.replace('pg-', ''));
        selectedPGs.push(pgId);
    });
    
    if (selectedPGs.length === 0) {
        alert("Seleziona almeno un PG!");
        return;
    }
    
    const share = Math.floor(AppState.totalXP / selectedPGs.length);
    
    selectedPGs.forEach(pgId => {
        const pg = AppState.party.find(p => p.id === pgId);
        if (pg) {
            pg.xp = (pg.xp || 0) + share;
        }
    });
    
    const pgNames = selectedPGs.map(id => AppState.party.find(p => p.id === id)?.name).join(', ');
    window.addLog(`Assegnati ${share} XP a: ${pgNames}`);
    
    AppState.totalXP = 0;
    localStorage.setItem('dm_total_xp', '0');
    
    // Chiudi il modal e salva
    document.getElementById('xp-assign-modal').style.display = 'none';
    saveParty();
    renderCombat();
};

// Versione originale per assegnare a tutti gli attivi
window.assignXP = () => {
    if (AppState.activePGs.length === 0) {
        alert("Nessun PG attivo nella sessione!");
        return;
    }
    
    if (AppState.totalXP === 0) {
        alert("Nessun XP da assegnare!");
        return;
    }
    
    const share = Math.floor(AppState.totalXP / AppState.activePGs.length);
    
    AppState.activePGs.forEach(pgId => {
        const pg = AppState.party.find(p => p.id === pgId);
        if (pg) {
            pg.xp = (pg.xp || 0) + share;
        }
    });
    
    const pgNames = AppState.activePGs.map(id => AppState.party.find(p => p.id === id)?.name).join(', ');
    window.addLog(`Assegnati ${share} XP a tutti i PG attivi: ${pgNames}`);
    
    AppState.totalXP = 0;
    localStorage.setItem('dm_total_xp', '0');
    saveParty();
    renderCombat();
};

window.updatePGStat = (pgId, stat, value) => {
    const pg = AppState.party.find(p => p.id === pgId);
    if (!pg) return;
    
    if (stat.includes('.')) {
        const [parent, child] = stat.split('.');
        if (pg[parent]) {
            pg[parent][child] = parseInt(value) || 0;
        }
    } else if (stat === 'name') {
        pg[stat] = value.toString().trim();
    } else {
        pg[stat] = parseInt(value) || 0;
    }
    saveParty();
};

window.removePG = (pgId) => {
    const pg = AppState.party.find(p => p.id === pgId);
    if (pg && confirm(`Eliminare il personaggio ${pg.name}?`)) {
        AppState.party = AppState.party.filter(p => p.id !== pgId);
        // Rimuovi dagli attivi
        AppState.activePGs = AppState.activePGs.filter(id => id !== pgId);
        // Rimuovi dal combattimento se presente
        AppState.combatants = AppState.combatants.filter(c => !(c.isPlayer && c.instanceId === pgId));
        window.addLog(`Rimosso PG: ${pg.name}`);
        saveParty();
        renderCombat();
    }
};

// --- LOGICA COMBATTIMENTO ---
function calculateRandomHp(monster) {
    if (monster.hd) {
        const parts = monster.hd.match(/(\d+)d(\d+)([+-]\d+)?/);
        if (parts) {
            const num = parseInt(parts[1]), faces = parseInt(parts[2]), mod = parseInt(parts[3] || 0);
            let total = mod;
            for (let i = 0; i < num; i++) total += Math.floor(Math.random() * faces) + 1;
            return total;
        }
    }
    const variation = 0.8 + (Math.random() * 0.4);
    return Math.max(1, Math.floor((monster.hp || 10) * variation));
}

window.addToCombat = (id) => {
    const monster = AppState.monsters.find(m => m.id === id);
    if (!monster) return;
    
    const qtyInput = prompt(`Quanti ${monster.name} vuoi aggiungere?`, "1");
    if (!qtyInput) return;
    
    const qty = parseInt(qtyInput) || 1;
    if (qty <= 0) return;

    for (let i = 0; i < qty; i++) {
        const hpRandom = calculateRandomHp(monster);
        const baseXP = xpTable[monster.cr] || (parseInt(monster.cr) * 500 || 0);
        const ratio = (monster.hp && monster.hp > 0) ? (hpRandom / monster.hp) : 1;
        const xpAdjusted = Math.floor(baseXP * (0.9 + (ratio * 0.1)));

        AppState.combatants.push({
            ...monster,
            instanceId: Date.now() + Math.random(), // Usa sempre instanceId per i mostri
            currentHp: hpRandom,
            maxHp: hpRandom,
            rewardXP: xpAdjusted,
            initiative: 0,
            isPlayer: false
        });
    }
    
    window.addLog(`Aggiunto ${qty} ${monster.name} al combattimento`);
    renderCombat();
};

// Nuova funzione per aggiungere PG selezionati al combattimento
window.addSelectedPGsToCombat = () => {
    if (AppState.activePGs.length === 0) {
        alert("Nessun PG attivo! Attiva prima qualche PG dal tab Party.");
        return;
    }
    
    let modalContent = `
        <h3 style="color:#03dac6; margin-bottom:15px;">👥 Seleziona PG per il Combattimento</h3>
        <p style="margin-bottom:15px;">Scegli quali PG attivi aggiungere al combattimento:</p>
        <div style="max-height:300px; overflow-y:auto; margin-bottom:20px;">
    `;
    
    AppState.activePGs.forEach(pgId => {
        const pg = AppState.party.find(p => p.id === pgId);
        const alreadyInCombat = AppState.combatants.find(c => c.isPlayer && c.instanceId === pgId);
        
        if (pg) {
            // Calcola i PF massimi corretti (base + modificatore costituzione)
            const modCon = window.getMod(pg.stats.con);
            const maxHp = pg.hpMax + (pg.level * modCon);
            
            modalContent += `
                <div style="display:flex; align-items:center; padding:10px; border-bottom:1px solid #333; background:#252525; margin-bottom:5px;">
                    <input type="checkbox" id="combat-pg-${pg.id}" ${alreadyInCombat ? 'disabled checked' : 'checked'} style="margin-right:10px;">
                    <label for="combat-pg-${pg.id}" style="flex:1; cursor:pointer; ${alreadyInCombat ? 'color:#666' : ''}">
                        <strong>${pg.name}</strong> (Liv. ${pg.level}, PF: ${pg.currentHp}/${maxHp}) 
                        ${alreadyInCombat ? '<span style="color:#ffd700; font-size:0.8rem;">✓ Già in combattimento</span>' : ''}
                    </label>
                </div>
            `;
        }
    });
    
    modalContent += `
        </div>
        <div style="display:flex; gap:10px;">
            <button onclick="addCheckedPGsToCombat()" style="flex:1; padding:12px; background:#03dac6; color:black; border:none; border-radius:5px; font-weight:bold;">
                🚀 Aggiungi i Selezionati
            </button>
            <button onclick="document.getElementById('pg-select-modal').style.display='none'" style="flex:1; padding:12px; background:#444; color:white; border:none; border-radius:5px;">
                Annulla
            </button>
        </div>
    `;
    
    document.getElementById('pg-select-content').innerHTML = modalContent;
    document.getElementById('pg-select-modal').style.display = 'block';
};

// CORREZIONE: Funzione corretta per aggiungere PG con PF correnti
window.addCheckedPGsToCombat = () => {
    let added = 0;
    const checkboxes = document.querySelectorAll('#pg-select-content input[type="checkbox"]:checked');
    
    checkboxes.forEach(cb => {
        const pgId = parseInt(cb.id.replace('combat-pg-', ''));
        const pg = AppState.party.find(p => p.id === pgId);
        const alreadyInCombat = AppState.combatants.find(c => c.isPlayer && c.instanceId === pgId);
        
        if (pg && !alreadyInCombat) {
            // Calcola i PF massimi corretti (base + modificatore costituzione)
            const modCon = window.getMod(pg.stats.con);
            const maxHp = pg.hpMax + (pg.level * modCon);
            const currentHp = pg.currentHp || maxHp;
            
            AppState.combatants.push({
                ...pg,
                isPlayer: true,
                instanceId: pg.id, // Usa l'ID del PG come instanceId per consistenza
                initiative: 0,
                currentHp: currentHp, // CORREZIONE: Usa i PF correnti del PG
                maxHp: maxHp, // CORREZIONE: Usa i PF massimi calcolati
                hpMax: maxHp // Per compatibilità
            });
            added++;
        }
    });
    
    if (added > 0) {
        window.addLog(`Aggiunti ${added} PG selezionati al combattimento`);
        renderCombat();
    }
    
    document.getElementById('pg-select-modal').style.display = 'none';
};

window.rollGroupInitiative = () => {
    if (AppState.combatants.length === 0) {
        alert("Aggiungi prima dei combattenti!");
        return;
    }
    
    AppState.combatants.forEach(c => {
        const dex = c.isPlayer ? (c.stats?.dex || 10) : (c.abilities?.dex || 10);
        c.initiative = Math.floor(Math.random() * 20) + 1 + window.getMod(dex);
    });
    AppState.combatants.sort((a, b) => b.initiative - a.initiative);
    window.addLog("Tirata iniziativa di gruppo");
    renderCombat();
};

// --- CORREZIONE CRITICA: ID Uniformi e PF Correnti ---
window.updateHpGlobal = (instanceId, amount) => {
    const c = AppState.combatants.find(i => i.instanceId == instanceId);
    if (!c) return;
    
    // CORREZIONE: Controlla se i PF correnti sono definiti
    const currentHp = c.currentHp || (c.isPlayer ? (c.hpMax || 10) : (c.maxHp || c.hp || 10));
    c.currentHp = parseInt(currentHp) + amount;
    
    if (c.currentHp < 0) c.currentHp = 0;
    
    // Aggiorna anche il PG corrispondente nel party
    if (c.isPlayer) {
        const pg = AppState.party.find(p => p.id === c.instanceId);
        if (pg) {
            pg.currentHp = c.currentHp;
            saveParty();
        }
    }

    if (!c.isPlayer && c.currentHp <= 0) {
        const reward = c.rewardXP || xpTable[c.cr] || (parseInt(c.cr) * 500 || 0);
        AppState.totalXP += reward;
        // Salvataggio XP persistente
        localStorage.setItem('dm_total_xp', AppState.totalXP.toString());
        window.addLog(`Sconfitto ${c.name} (+${reward} XP)`);
        AppState.combatants = AppState.combatants.filter(i => i.instanceId !== instanceId);
    }
    renderCombat();
};

// --- RENDERING COMBATTIMENTO (Corretto per PF) ---
function renderCombat() {
    const container = document.getElementById('combat-list');
    if (!container) return;

    const xpDisplay = document.getElementById('xp-display');
    if (xpDisplay) {
        xpDisplay.innerHTML = `XP Bottino: <b style="color:#ffd700">${AppState.totalXP}</b><br><small style="color:#aaa;">PG attivi: ${AppState.activePGs.length}</small>`;
    }

    if (AppState.combatants.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align:center; padding:30px;">
                <h3 style="color:#666;">Nessun combattente attivo</h3>
                <p style="color:#888;">Aggiungi mostri dalla ricerca o PG attivi dal party</p>
                <button onclick="addSelectedPGsToCombat()" style="margin-top:15px; padding:10px 20px; background:#03dac6; color:black; border:none; border-radius:5px; font-weight:bold;">
                    👥 Aggiungi PG alla Battaglia
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = AppState.combatants.map(c => {
        // CORREZIONE: Calcola correttamente i PF massimi per PG e mostri
        let hpMax, currentHp;
        
        if (c.isPlayer) {
            // Per PG: calcola PF massimi (base + modificatore costituzione)
            const modCon = window.getMod(c.stats?.con || 10);
            hpMax = c.hpMax + (c.level * modCon);
            currentHp = c.currentHp || hpMax;
        } else {
            // Per mostri: usa i valori memorizzati
            hpMax = c.maxHp || c.hp || 10;
            currentHp = c.currentHp || hpMax;
        }
        
        const hpPercent = (currentHp / hpMax) * 100;
        let borderColor = c.isPlayer ? '#03dac6' : '#ff4444';
        let style = "";

        if (hpPercent < 25) { 
            style = "border-left: 8px solid #ff0000; animation: blink 1s infinite;"; 
        } else if (hpPercent < 50) { 
            style = "border-left: 8px solid #ff8800;"; 
        } else { 
            style = `border-left: 8px solid ${borderColor};`; 
        }

        return `
            <div class="card" style="${style} background:${c.isPlayer ? '#1a2a2a' : '#252525'}; margin-bottom: 10px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>
                        <b style="color:#bb86fc; font-family: monospace; background: #000; padding: 2px 6px; border-radius: 3px;">#${c.initiative}</b>
                        <strong style="margin-left: 10px;">${c.name}</strong>
                        ${c.isPlayer ? '<span style="font-size:0.7rem; background:#03dac6; color:black; padding:1px 5px; border-radius:3px; margin-left:5px;">PG</span>' : ''}
                    </span>
                    <span style="font-weight:bold; ${currentHp < (hpMax * 0.25) ? 'color:#ff4444' : 'color:#ffffff'}">
                        ${currentHp} / ${hpMax} PF
                        ${c.isPlayer ? `<br><small style="font-size:0.7rem; color:#aaa;">CA: ${c.baseAc + window.getMod(c.stats?.dex || 10)}</small>` : ''}
                    </span>
                </div>
                <div style="margin-top:10px; display:flex; gap:5px; flex-wrap:wrap;">
                    <button onclick="updateHpGlobal(${c.instanceId}, -1)" style="padding:8px 12px; background:#444;">-1</button>
                    <button onclick="updateHpGlobal(${c.instanceId}, -5)" style="padding:8px 12px; background:#611;">-5</button>
                    <button onclick="updateHpGlobal(${c.instanceId}, -10)" style="padding:8px 12px; background:#911;">-10</button>
                    <button onclick="updateHpGlobal(${c.instanceId}, 5)" style="padding:8px 12px; background:#141;">+5</button>
                    <input type="number" value="${c.initiative}" onchange="updateInit(${c.instanceId}, this.value)" 
                        style="width:60px; margin-left:auto; background:#000; color:white; text-align:center; border:1px solid #555; padding:5px;">
                </div>
            </div>
        `;
    }).join('');
}

window.updateInit = (instanceId, val) => {
    const c = AppState.combatants.find(i => i.instanceId == instanceId);
    if (c) {
        c.initiative = parseInt(val) || 0;
        AppState.combatants.sort((a, b) => b.initiative - a.initiative);
        renderCombat();
    }
};

window.switchTab = (tab) => {
    ['section-search', 'section-combat', 'section-pg'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === `section-${tab}`) ? 'block' : 'none';
    });
    
    if (tab === 'combat') {
        renderCombat();
        renderLog();
    }
    if (tab === 'pg') renderParty();
};

// --- RENDERING LOG ---
function renderLog() {
    const logContainer = document.getElementById('session-log');
    if (logContainer) {
        logContainer.innerHTML = AppState.log.map(entry => 
            `<div style="font-size:0.85rem; border-bottom:1px solid #222; padding:6px 0; color:#aaa;">${entry}</div>`
        ).join('');
        
        if (AppState.log.length === 0) {
            logContainer.innerHTML = '<p style="color:#666; text-align:center; padding:10px;">Il diario è vuoto. Gli eventi appariranno qui!</p>';
        }
    }
}

// --- DETTAGLI MOSTRI/INCANTESIMI ---
window.showDetail = (id, type) => {
    const item = type === 'monster' ? AppState.monsters.find(m => m.id === id) : AppState.spells.find(s => s.id === id);
    if (!item) return;
    
    document.getElementById('modal-detail').style.display = 'block';
    document.getElementById('modal-content').innerHTML = `
        <style>
            @keyframes blink { 
                0% { opacity: 1; } 
                50% { opacity: 0.5; } 
                100% { opacity: 1; } 
            }
        </style>
        <h3 style="color:#bb86fc; margin-top:0;">${type === 'monster' ? '🐉' : '✨'} ${item.name}</h3>
        <p><b>Edizione:</b> ${item.edition} | <b>${type === 'monster' ? 'GS:' : 'Livello:'}</b> ${item.cr || item.level}</p>
        <hr style="border-color:#333;">
        <div style="text-align:left; font-size:0.9rem; max-height:300px; overflow-y:auto; padding-right:5px;">
            <p>${item.desc || item.description || item.short_desc || 'Nessuna descrizione disponibile.'}</p>
        </div>
        ${type === 'monster' ? `
            <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; margin-top:15px; font-size:0.85rem;">
                <div><b>PF:</b> ${item.hp || 'N/A'}</div>
                <div><b>CA:</b> ${item.ac || 'N/A'}</div>
                <div><b>Attacco:</b> ${item.attack || 'N/A'}</div>
                <div><b>Danno:</b> ${item.damage || 'N/A'}</div>
            </div>
            <button onclick="addToCombat('${item.id}'); document.getElementById('modal-detail').style.display='none';" 
                style="width:100%; margin-top:15px; padding:12px; background:#bb86fc; border:none; color:black; font-weight:bold; border-radius:5px;">
                PORTA IN BATTAGLIA
            </button>
        ` : ''}
        <button onclick="document.getElementById('modal-detail').style.display='none'" 
            style="width:100%; margin-top:10px; padding:10px; background:#444; border:none; color:white; border-radius:5px;">
            Chiudi
        </button>
    `;
};

// --- RENDERING PARTY (Corretto per PF) ---
function renderParty() {
    const container = document.getElementById('section-pg');
    if (!container) return;
    
    const activePGsCount = AppState.activePGs.length;
    const xpPerActive = activePGsCount > 0 ? Math.floor(AppState.totalXP / activePGsCount) : 0;
    
    container.innerHTML = `
        <style>
            .active-toggle {
                padding: 5px 10px;
                border: none;
                border-radius: 3px;
                cursor: pointer;
                font-size: 0.8rem;
                transition: all 0.2s;
            }
            .active-true {
                background: #03dac6;
                color: black;
            }
            .active-false {
                background: #444;
                color: white;
            }
        </style>
        
        <div class="card" style="border-bottom: 2px solid #03dac6;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2 style="margin:0">🛡️ Gestione Personaggi</h2>
                <span style="color:#ffd700; font-weight:bold;">XP Disponibili: ${AppState.totalXP}</span>
            </div>
            <p style="margin:10px 0;">
                PG totali: <b>${AppState.party.length}</b> | 
                PG attivi in sessione: <b style="color:#03dac6">${activePGsCount}</b> | 
                XP a testa se assegnati: <b>${xpPerActive}</b>
            </p>
            <div style="display:flex; gap:10px;">
                <button onclick="addPG()" style="flex:1; padding:12px; background:#03dac6; color:black; border:none; border-radius:5px; font-weight:bold;">
                    + NUOVO PG
                </button>
                <button onclick="selectPGsForXP()" style="flex:1; padding:12px; background:#bb86fc; color:black; border:none; border-radius:5px; font-weight:bold;">
                    🎯 ASSEGNA XP SPECIFICI
                </button>
            </div>
        </div>
        
        ${AppState.party.map(pg => {
            const isActive = AppState.activePGs.includes(pg.id);
            const modCon = window.getMod(pg.stats.con);
            const totalHp = pg.hpMax + (pg.level * modCon);
            const currentHp = pg.currentHp || totalHp;
            const isInCombat = AppState.combatants.find(c => c.isPlayer && c.instanceId === pg.id);
            
            return `
            <div class="card" style="border-left: 5px solid ${isActive ? '#03dac6' : '#666'}; margin-top:15px; ${isInCombat ? 'border-right: 3px solid #ffd700;' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="flex:1;">
                        <input type="text" value="${pg.name}" onchange="updatePGStat(${pg.id}, 'name', this.value)" 
                            style="background:none; border:none; color:${isActive ? '#03dac6' : '#888'}; font-size:1.2rem; font-weight:bold; width:100%; padding:2px;">
                        <div style="display:flex; gap:10px; margin-top:5px; font-size:0.85rem;">
                            <span>Liv. ${pg.level}</span>
                            <span style="color:#ffd700;">XP: ${pg.xp || 0}</span>
                            <span style="color:${isActive ? '#03dac6' : '#666'};">${isActive ? '✅ Attivo' : '⏸️ Inattivo'}</span>
                            ${isInCombat ? '<span style="color:#ffd700;">⚔️ In combattimento (PF: ' + currentHp + '/' + totalHp + ')</span>' : ''}
                        </div>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button onclick="togglePGActive(${pg.id})" 
                            class="active-toggle ${isActive ? 'active-true' : 'active-false'}" 
                            style="${isActive ? 'background:#03dac6; color:black;' : 'background:#444; color:white;'}">
                            ${isActive ? 'Attivo' : 'Inattivo'}
                        </button>
                        <button onclick="removePG(${pg.id})" style="background:none; border:none; color:red; font-size:1.2rem; cursor:pointer; padding:0 5px;">✖</button>
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px; margin-top:15px;">
                    <div>
                        <small style="color:#aaa;">Livello</small>
                        <input type="number" value="${pg.level}" onchange="updatePGStat(${pg.id}, 'level', this.value)" 
                            style="width:100%; background:#333; color:white; border:1px solid #555; border-radius:3px; padding:4px; margin-top:5px;">
                    </div>
                    <div>
                        <small style="color:#aaa;">CA Base</small>
                        <input type="number" value="${pg.baseAc}" onchange="updatePGStat(${pg.id}, 'baseAc', this.value)" 
                            style="width:100%; background:#333; color:white; border:1px solid #555; border-radius:3px; padding:4px; margin-top:5px;">
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:15px; font-size:0.9rem;">
                    <div style="background:#1a1a1a; padding:10px; border-radius:5px;">
                        <div style="color:#03dac6;">❤️ Punti Ferita</div>
                        <input type="number" value="${currentHp}" onchange="updatePGStat(${pg.id}, 'currentHp', this.value)" 
                            style="width:100%; background:#333; color:white; border:none; padding:5px; margin-top:5px; text-align:center;">
                        <div style="font-size:0.8rem; color:#aaa; margin-top:5px;">Max: ${totalHp}</div>
                    </div>
                    <div style="background:#1a1a1a; padding:10px; border-radius:5px;">
                        <div style="color:#03dac6;">🛡️ Classe Armatura</div>
                        <div style="font-size:1.5rem; font-weight:bold; text-align:center; margin-top:5px;">
                            ${pg.baseAc + window.getMod(pg.stats.dex)}
                        </div>
                        <div style="font-size:0.8rem; color:#aaa; margin-top:5px;">Base ${pg.baseAc} + Des ${window.getMod(pg.stats.dex)}</div>
                    </div>
                </div>
                
                <div style="display:grid; grid-template-columns: repeat(6, 1fr); gap:8px; margin-top:15px; text-align:center;">
                    ${Object.keys(pg.stats).map(s => `
                        <div style="background:#1a1a1a; padding:8px; border-radius:5px;">
                            <div style="font-size:0.7rem; color:#888; text-transform:uppercase;">${s}</div>
                            <input type="number" value="${pg.stats[s]}" onchange="updatePGStat(${pg.id}, 'stats.${s}', this.value)" 
                                style="width:100%; background:none; border:none; color:white; text-align:center; font-weight:bold; font-size:1.1rem;">
                            <div style="font-size:0.8rem; color:#03dac6; margin-top:3px;">
                                ${window.getMod(pg.stats[s]) >= 0 ? '+' : ''}${window.getMod(pg.stats[s])}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            `;
        }).join('')}
        
        ${AppState.party.length === 0 ? `
            <div class="card" style="text-align:center; padding:40px 20px; color:#666; margin-top:15px;">
                <h3>Nessun Personaggio</h3>
                <p>Crea il tuo primo PG cliccando il pulsante sopra!</p>
            </div>
        ` : ''}
    `;
}

// --- DASHBOARD PRINCIPALE ---
function renderDashboard() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
        <style>
            @keyframes blink { 0% {opacity: 1;} 50% {opacity: 0.5;} 100% {opacity: 1;} }
            .tab-buttons { display: flex; gap: 5px; margin-bottom: 15px; flex-wrap: wrap; }
            .tab-button { flex: 1; min-width: 100px; padding: 12px; background: #333; color: white; border: none; border-radius: 5px; cursor: pointer; text-align: center; }
            .tab-button.active { background: #bb86fc; color: black; font-weight: bold; }
        </style>
        
        <div class="tab-buttons">
            <button class="tab-button active" onclick="switchTab('search')">🔍 Ricerca</button>
            <button class="tab-button" onclick="switchTab('combat')">⚔️ Combattimento</button>
            <button class="tab-button" onclick="switchTab('pg')">👥 Party</button>
        </div>
        
        <div id="section-search">
            <div class="card">
                <div style="display:flex; gap:10px; margin-bottom: 15px; flex-wrap: wrap;">
                    <select id="ed-filter" style="padding:10px; background:#444; color:white; border-radius:5px; border:1px solid #555; min-width: 120px;">
                        <option value="3.5">D&D 3.5</option>
                        <option value="5e">D&D 5e</option>
                    </select>
                    <select id="type-filter" style="padding:10px; background:#444; color:white; border-radius:5px; border:1px solid #555; min-width: 120px;">
                        <option value="all">Tutti</option>
                        <option value="monster">Mostri</option>
                        <option value="spell">Incantesimi</option>
                    </select>
                    <input type="text" id="search-bar" placeholder="🔍 Cerca mostro o incantesimo..." 
                        style="flex:1; min-width: 200px; padding:10px; background:#333; color:white; border:1px solid #555; border-radius:5px;">
                </div>
                <div style="display:flex; gap:10px;">
                    <button onclick="saveSession()" style="flex:1; padding:10px; background:#4CAF50; color:white; border:none; border-radius:5px;">
                        💾 Salva Sessione
                    </button>
                </div>
            </div>
            <div id="results-list" style="margin-top:15px;"></div>
        </div>
        
        <div id="section-combat" style="display:none">
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 10px;">
                    <h2 style="margin:0">⚔️ Battle Tracker</h2>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="resetCombat()" style="background:#911; color:white; border:none; padding:8px 12px; border-radius:5px; font-weight:bold; white-space: nowrap;">
                            🔥 SOS RESET
                        </button>
                        <button onclick="assignXP()" style="background:#ffd700; color:black; font-weight:bold; padding:8px 15px; border-radius:5px; border:none; white-space: nowrap;">
                            💰 ASSEGNA XP
                        </button>
                        <button onclick="selectPGsForXP()" style="background:#bb86fc; color:black; font-weight:bold; padding:8px 15px; border-radius:5px; border:none; white-space: nowrap;">
                            🎯 ASSEGNA SPECIFICO
                        </button>
                    </div>
                </div>
                <p id="xp-display" style="color:#03dac6; margin:10px 0; font-size:1.1rem; font-weight:bold;"></p>
                <div style="display:flex; gap:10px; flex-wrap: wrap;">
                    <button onclick="addSelectedPGsToCombat()" style="flex:1; min-width: 200px; padding:10px; background:#03dac6; color:black; border:none; border-radius:5px; font-weight:bold;">
                        👥 AGGIUNGI PG SELEZIONATI
                    </button>
                    <button onclick="rollGroupInitiative()" style="flex:1; min-width: 150px; padding:10px; background:#bb86fc; color:black; border:none; border-radius:5px; font-weight:bold;">
                        🎲 TIRA INIZIATIVA
                    </button>
                </div>
            </div>
            <div id="combat-list" style="margin-top:15px;"></div>
            
            <div class="card" style="margin-top:20px; background:#111; border:1px solid #333;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h4 style="margin:0; color:#03dac6;">📜 Diario della Sessione</h4>
                    <button onclick="clearLog()" style="background:#444; color:white; border:none; padding:4px 8px; border-radius:3px; font-size:0.8rem;">
                        🗑️ Cancella
                    </button>
                </div>
                <div id="session-log" style="max-height:200px; overflow-y:auto; background:#1a1a1a; padding:10px; border-radius:5px;">
                </div>
            </div>
        </div>
        
        <div id="section-pg" style="display:none"></div>
        
        <!-- Modal per selezionare PG da aggiungere al combattimento -->
        <div id="pg-select-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10001; padding:20px; overflow-y:auto;">
            <div onclick="document.getElementById('pg-select-modal').style.display='none'" style="position:absolute; top:20px; right:20px; color:white; font-size:30px; cursor:pointer; z-index:10002;">×</div>
            <div id="pg-select-content" class="card" style="max-width:500px; margin:50px auto; background:#1e1e1e; border: 2px solid #03dac6; border-radius:10px; padding:20px;"></div>
        </div>
        
        <!-- Modal per selezionare PG a cui assegnare XP -->
        <div id="xp-assign-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10001; padding:20px; overflow-y:auto;">
            <div onclick="document.getElementById('xp-assign-modal').style.display='none'" style="position:absolute; top:20px; right:20px; color:white; font-size:30px; cursor:pointer; z-index:10002;">×</div>
            <div id="xp-assign-content" class="card" style="max-width:500px; margin:50px auto; background:#1e1e1e; border: 2px solid #bb86fc; border-radius:10px; padding:20px;"></div>
        </div>
        
        <!-- Modal per dettagli -->
        <div id="modal-detail" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10000; padding:20px; overflow-y:auto;">
            <div onclick="document.getElementById('modal-detail').style.display='none'" style="position:absolute; top:20px; right:20px; color:white; font-size:30px; cursor:pointer; z-index:10001;">×</div>
            <div id="modal-content" class="card" style="max-width:600px; margin:50px auto; background:#1e1e1e; border: 2px solid #bb86fc; border-radius:10px; padding:20px;"></div>
        </div>
    `;

    const searchInput = document.getElementById('search-bar');
    const typeFilter = document.getElementById('type-filter');
    const edFilter = document.getElementById('ed-filter');
    
    const updateSearchResults = () => {
        const q = searchInput.value.toLowerCase();
        const type = typeFilter.value;
        const ed = edFilter.value;
        const container = document.getElementById('results-list');
        
        if (q.length < 2) { 
            container.innerHTML = '<p style="color:#666; text-align:center; padding:20px;">Scrivi almeno 2 caratteri per iniziare la ricerca</p>'; 
            return; 
        }

        let mF = [], sF = [];
        
        if (type === 'all' || type === 'monster') {
            mF = AppState.monsters.filter(m => m.edition === ed && m.name.toLowerCase().includes(q));
        }
        if (type === 'all' || type === 'spell') {
            sF = AppState.spells.filter(s => s.edition === ed && s.name.toLowerCase().includes(q));
        }

        container.innerHTML = `
            ${mF.length > 0 ? `<h3 style="color:#bb86fc; margin-top:15px;">🐉 Mostri (${mF.length})</h3>` : ''}
            ${mF.map(m => `
                <div class="card" onclick="showDetail('${m.id}', 'monster')" 
                    style="border-left:5px solid #bb86fc; margin-bottom:10px; cursor:pointer; transition: background 0.2s;"
                    onmouseover="this.style.background='#2a2a2a'" 
                    onmouseout="this.style.background='#252525'">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <b>${m.name}</b>
                            <div style="font-size:0.85rem; color:#aaa; margin-top:5px;">
                                ${m.type || ''} • PF: ${m.hp || 'N/A'} • CA: ${m.ac || 'N/A'}
                            </div>
                        </div>
                        <span style="color:#ffd700; font-weight:bold; background: #000; padding: 3px 8px; border-radius: 3px;">GS ${m.cr}</span>
                    </div>
                </div>
            `).join('')}
            
            ${sF.length > 0 ? `<h3 style="color:#03dac6; margin-top:20px;">✨ Incantesimi (${sF.length})</h3>` : ''}
            ${sF.map(s => `
                <div class="card" onclick="showDetail('${s.id}', 'spell')" 
                    style="border-left:5px solid #03dac6; margin-bottom:10px; cursor:pointer; transition: background 0.2s;"
                    onmouseover="this.style.background='#2a2a2a'" 
                    onmouseout="this.style.background='#252525'">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <b>${s.name}</b>
                            <div style="font-size:0.85rem; color:#aaa; margin-top:5px;">
                                ${s.school || 'Scuola non specificata'} • ${s.casting_time || '1 azione'}
                            </div>
                        </div>
                        <span style="color:#03dac6; font-weight:bold; background: #000; padding: 3px 8px; border-radius: 3px;">Liv. ${s.level}</span>
                    </div>
                </div>
            `).join('')}
            
            ${mF.length === 0 && sF.length === 0 ? 
                '<p style="color:#666; text-align:center; padding:30px; font-style:italic;">Nessun risultato trovato. Prova con un termine diverso.</p>' : ''}
        `;
    };
    
    searchInput.addEventListener('input', updateSearchResults);
    typeFilter.addEventListener('change', updateSearchResults);
    edFilter.addEventListener('change', updateSearchResults);
    
    // Tab button activation
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            tabButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // Inizializza le funzioni
    renderLog();
    renderCombat();
}

// --- INIZIALIZZAZIONE ---
async function init() {
    try {
        // Carica mostri e incantesimi
        AppState.monsters = await loadFiles(monsterFiles);
        AppState.spells = await loadFiles(spellFiles);
        
        renderDashboard();
        window.addLog(`Sessione DM Tools caricata (PG attivi: ${AppState.activePGs.length}, XP: ${AppState.totalXP})`);
        
    } catch (error) {
        console.error("Errore durante l'inizializzazione:", error);
        document.getElementById('main-content').innerHTML = `
            <div class="card" style="background:#911; color:white; text-align:center; padding:30px;">
                <h2>Errore di Caricamento</h2>
                <p>Impossibile caricare i dati. Controlla la connessione e ricarica la pagina.</p>
                <button onclick="location.reload()" style="margin-top:20px; padding:10px 20px; background:white; color:#911; border:none; border-radius:5px; font-weight:bold;">
                    Ricarica Pagina
                </button>
            </div>
        `;
    }
}

// Avvia l'applicazione
init();