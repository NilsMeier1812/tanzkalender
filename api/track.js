import admin from 'firebase-admin';

export default async function handler(req, res) {
    // --- 1. SAK (Secret & Slot) ÜBERPRÜFEN ---
    const { slot, secret } = req.query;

    if (secret !== process.env.API_SECRET) {
        return res.status(401).json({ error: 'Falsches oder fehlendes Passwort (secret)' });
    }

    if (!slot) {
        return res.status(400).json({ error: 'Slot fehlt in der URL' });
    }

    // --- 2. FIREBASE INITIALISIEREN (Mit genauer Fehleranalyse) ---
    try {
        if (!admin.apps.length) {
            const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT;
            if (!rawJson) {
                return res.status(500).json({ error: 'Die Vercel-Variable FIREBASE_SERVICE_ACCOUNT existiert nicht oder ist leer.' });
            }
            
            // Hier passiert der häufigste Fehler: Das Parsen des Textes zu einem JSON-Objekt
            const serviceAccount = JSON.parse(rawJson);
            
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
    } catch (error) {
        console.error('Firebase Setup Error:', error);
        return res.status(500).json({ 
            error: 'Firebase konnte nicht gestartet werden. Sehr wahrscheinlich ist das JSON-Format in Vercel fehlerhaft.',
            details: error.message 
        });
    }

    const db = admin.firestore();

    // --- 3. ZEITEN BERECHNEN UND SPEICHERN ---
    const now = new Date();
    const options = { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = new Intl.DateTimeFormat('de-DE', options).formatToParts(now);
    
    const day = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
    const year = parts.find(p => p.type === 'year').value;
    const dateStr = `${year}-${month}-${day}`; 

    const dateInGermany = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
    const isSunday = dateInGermany.getDay() === 0;

    const timesNormal = {
        '14': '14:45',
        '16': '16:00',
        '17': '17:15',
        '18': '18:30',
        '19': '19:45',
        '21': '21:00'
    };

    const timesSunday = {
        '14': '14:00',
        '15': '15:15',
        '16': '16:30',
        '18': '18:15',
        '19': '19:00',
        '20': '20:15'
    };

    const exactTime = isSunday ? timesSunday[slot] : timesNormal[slot];

    if (!exactTime) {
        return res.status(200).json({ 
            success: true, 
            message: `Ignoriert: Am heutigen Tag gibt es keinen Kurs für den Slot ${slot}.` 
        });
    }

    try {
        await db.collection('danceSessions').doc(dateStr).set({
            date: dateStr,
            times: admin.firestore.FieldValue.arrayUnion(exactTime)
        }, { merge: true });

        return res.status(200).json({ 
            success: true, 
            message: `${exactTime} Uhr erfolgreich eingetragen!` 
        });
    } catch (error) {
        console.error('Datenbank Error:', error);
        return res.status(500).json({ error: 'Konnte nicht in die Datenbank schreiben.', details: error.message });
    }
}
