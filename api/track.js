import admin from 'firebase-admin';

export default async function handler(req, res) {
    // Firebase sicher initialisieren (innerhalb des Handlers, um Vercel-Crashes zu verhindern)
    try {
        if (!admin.apps.length) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
    } catch (error) {
        console.error('Firebase Admin Init Error:', error);
        return res.status(500).json({ 
            error: 'Firebase Setup Fehler. Bitte prüfe in Vercel, ob FIREBASE_SERVICE_ACCOUNT korrektes JSON ist.' 
        });
    }

    const db = admin.firestore();

    // Wir fragen nur noch den Slot ab, kein Secret mehr
    const { slot } = req.query;

    if (!slot) {
        return res.status(400).json({ error: 'Slot fehlt' });
    }

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

        res.status(200).json({ 
            success: true, 
            message: `${exactTime} Uhr erfolgreich eingetragen (oder war bereits vorhanden)!` 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Datenbankfehler beim Speichern' });
    }
}
