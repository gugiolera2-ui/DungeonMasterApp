export const Rules35 = {
    getModifier: (score) => Math.floor((score - 10) / 2),
    
    calculateAC: (data) => {
        // Base 10 + Dex + Armor + Shield + Natural + Size
        return 10 + (data.dexMod || 0) + (data.armor || 0) + (data.shield || 0);
    }
};