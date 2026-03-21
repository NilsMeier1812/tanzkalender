import admin from 'firebase-admin';

export default async function handler(req, res) {
    const { slot, secret } = req.query;

    if (secret !== process.env.API_SECRET) {
        return res.status(401).json({ error: 'Falsches oder fehlendes Passwort (secret)' });
    }

    if (!slot) {
        return res.status(400).json({ error: 'Slot fehlt in der URL' });
    }

    try {
        if (!admin.apps.length) {
            const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT;
            if (!rawJson) return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT fehlt.' });
            admin.initializeApp({ credential: admin.credential.cert(JSON.parse(rawJson)) });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Firebase Setup Error.', details: error.message });
    }

    const db = admin.firestore();

    const now = new Date();
    const options = { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = new Intl.DateTimeFormat('de-DE', options).formatToParts(now);
    
    const day = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
    const year = parts.find(p => p.type === 'year').value;
    const dateStr = `${year}-${month}-${day}`; 

    const dateInGermany = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
    const dayOfWeek = dateInGermany.getDay(); // 0 = Sonntag, 6 = Samstag
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;
    const isWeekend = isSunday || isSaturday;

    const timesNormal = {
        '14': '14:45', '16': '16:00', '17': '17:15', '18': '18:30', '19': '19:45', '21': '21:00'
    };
    const timesSunday = {
        '14': '14:00', '15': '15:15', '16': '16:30', '18': '18:15', '19': '19:00', '20': '20:15'
    };

    let exactTime = null;

    // --- NEU: Party Logik ---
    if (slot.toLowerCase() === 'party') {
        if (!isWeekend) {
            return res.status(200).json({ 
                success: true, 
                message: 'Ignoriert: Tanzpartys gibt es nur am Samstag und Sonntag.' 
            });
        }
        exactTime = 'Party'; // Das ist das Wort, das in der Datenbank gespeichert wird
    } else {
        exactTime = isSunday ? timesSunday[slot] : timesNormal[slot];
    }

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
            message: `${exactTime} erfolgreich eingetragen!` 
        });
    } catch (error) {
        return res.status(500).json({ error: 'Konnte nicht in die Datenbank schreiben.', details: error.message });
    }
}
