import { AppState } from './core/state.js';

async function init() {
    try {
        const mRes = await fetch('./data/sample_monsters.json');
        const sRes = await fetch('./data/custom_spells.json');
        
        AppState.monsters = await mRes.json();
        AppState.spells = await sRes.json();
        AppState.loading = false;

        document.getElementById('debug-info').innerHTML = `
            ✅ Database Caricato!<br>
            🐉 Mostri: ${AppState.monsters.length}<br>
            ✨ Incantesimi: ${AppState.spells.length}
        `;
    } catch (err) {
        document.getElementById('debug-info').innerText = "Errore: controlla i nomi dei file JSON nella cartella data!";
        console.error(err);
    }
}
init();