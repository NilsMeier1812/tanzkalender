import admin from 'firebase-admin';

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
    } catch (error) {
        console.error('Firebase Admin Init Error:', error);
    }
}

const db = admin.firestore();

export default async function handler(req, res) {
    const { slot, secret } = req.query;

    if (secret !== process.env.API_SECRET) {
        return res.status(401).json({ error: 'Falsches Passwort' });
    }

    if (!slot) {
        return res.status(400).json({ error: 'Slot fehlt' });
    }

    // Aktuelle Zeit und Datum in Deutschland ermitteln
    const now = new Date();
    const options = { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = new Intl.DateTimeFormat('de-DE', options).formatToParts(now);
    
    const day = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
    const year = parts.find(p => p.type === 'year').value;
    const dateStr = `${year}-${month}-${day}`; 

    const dateInGermany = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
    const isSunday = dateInGermany.getDay() === 0;

    // --- NEUE LOGIK: Die genauen Zeiten ---
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

    // Die richtige Zeit anhand des Wochentags heraussuchen
    const exactTime = isSunday ? timesSunday[slot] : timesNormal[slot];

    // Wenn es für den gedrückten Button am heutigen Tag gar keinen Kurs gibt: Ignorieren!
    if (!exactTime) {
        // Wir senden Status 200 (OK), damit das Widget keinen Fehler anzeigt, 
        // speichern aber absichtlich nichts in der Datenbank.
        return res.status(200).json({ 
            success: true, 
            message: `Ignoriert: Am heutigen Tag gibt es keinen Kurs für den Slot ${slot}.` 
        });
    }

    try {
        // arrayUnion verhindert automatisch doppelte Einträge!
        await db.collection('danceSessions').doc(dateStr).set({
            date: dateStr,
            times: admin.firestore.FieldValue.arrayUnion(exactTime)
        }, { merge: true });

        res.status(200).json({ 
            success: true, 
            message: `${exactTime} Uhr erfolgreich eingetragen (oder war bereits vorhanden)!` 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Datenbankfehler beim Speichern' });
    }
}
