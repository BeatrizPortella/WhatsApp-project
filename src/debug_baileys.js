const Baileys = require('@whiskeysockets/baileys');

console.log('Keys in default export:', Object.keys(Baileys.default || {}));
console.log('Keys in root export:', Object.keys(Baileys));

try {
    const { makeInMemoryStore } = Baileys;
    console.log('makeInMemoryStore type:', typeof makeInMemoryStore);
} catch (e) {
    console.error('Error accessing makeInMemoryStore:', e);
}
