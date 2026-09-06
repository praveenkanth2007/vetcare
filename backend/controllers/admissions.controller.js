const db = require('../db');
const { formatDateTime, toNumber, mapAdmissionRow } = require('../utils/helpers');

const JOIN_SELECT = `
    SELECT
        a.id, a.status, a.attending_doctor_name, a.notes,
        a.admitted_on, a.admitted_on_display,
        o.name AS owner_name, o.place, o.phone, o.aadhaar,
        an.name AS animal_name, an.species, an.breed, an.photo AS animal_photo,
        p.fee, p.discount, p.total, p.received, p.pending,
        d.username AS created_by_username
    FROM admissions a
    JOIN owners o   ON o.id = a.owner_id
    JOIN animals an ON an.id = a.animal_id
    LEFT JOIN payments p ON p.admission_id = a.id
    JOIN doctors d  ON d.id = a.created_by
`;

// GET /api/admissions — every admission belonging to the authenticated doctor.
async function list(req, res) {
    try {
        const result = await db.query(
            `${JOIN_SELECT} WHERE a.doctor_id = $1 ORDER BY a.admitted_on DESC, a.id DESC`,
            [req.doctorId]
        );
        return res.json({ admissions: result.rows.map(mapAdmissionRow) });
    } catch (err) {
        console.error('list admissions error:', err);
        return res.status(500).json({ error: 'Could not load admissions.' });
    }
}

// POST /api/admissions
async function create(req, res) {
    const client = await db.getClient();
    try {
        const b = req.body || {};
        const required = ['ownerName', 'ownerPlace', 'ownerPhone', 'petName', 'species', 'breed', 'status'];
        for (const field of required) {
            if (!b[field] || String(b[field]).trim() === '') {
                return res.status(400).json({ error: `Missing required field: ${field}` });
            }
        }
        const fee = toNumber(b.fee, 0);
        const discount = toNumber(b.discount, 0);
        const received = toNumber(b.received, 0);
        const total = Math.max(fee - discount, 0);
        const cappedReceived = Math.min(Math.max(received, 0), total);
        const pending = Math.max(total - cappedReceived, 0);

        await client.query('BEGIN');

        // Find-or-create owner (dedupe returning farmers by phone, per doctor).
        let ownerId;
        if (b.ownerPhone) {
            const existingOwner = await client.query(
                'SELECT id FROM owners WHERE doctor_id = $1 AND phone = $2 LIMIT 1',
                [req.doctorId, b.ownerPhone]
            );
            if (existingOwner.rows.length > 0) {
                ownerId = existingOwner.rows[0].id;
                await client.query(
                    'UPDATE owners SET name = $1, place = $2, aadhaar = $3, updated_at = now() WHERE id = $4',
                    [b.ownerName, b.ownerPlace, b.aadhaar || null, ownerId]
                );
            }
        }
        if (!ownerId) {
            const ownerInsert = await client.query(
                `INSERT INTO owners (doctor_id, name, place, phone, aadhaar)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [req.doctorId, b.ownerName, b.ownerPlace, b.ownerPhone || null, b.aadhaar || null]
            );
            ownerId = ownerInsert.rows[0].id;
        }

        // Each admission has its own animal record (name/breed/photo can differ per visit).
        const animalInsert = await client.query(
            `INSERT INTO animals (doctor_id, owner_id, name, species, breed, photo)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [req.doctorId, ownerId, b.petName, b.species, b.breed, b.photo || null]
        );
        const animalId = animalInsert.rows[0].id;

        // Find-or-create the service/purpose lookup row.
        let serviceId = null;
        const serviceExisting = await client.query(
            'SELECT id FROM services WHERE doctor_id = $1 AND name = $2',
            [req.doctorId, b.status]
        );
        if (serviceExisting.rows.length > 0) {
            serviceId = serviceExisting.rows[0].id;
        } else {
            const serviceInsert = await client.query(
                `INSERT INTO services (doctor_id, name, default_fee) VALUES ($1, $2, $3)
                 ON CONFLICT (doctor_id, name) DO UPDATE SET name = EXCLUDED.name
                 RETURNING id`,
                [req.doctorId, b.status, fee]
            );
            serviceId = serviceInsert.rows[0].id;
        }

        const idResult = await client.query("SELECT 'VC-' || LPAD(nextval('admission_id_seq')::text, 6, '0') AS id");
        const admissionId = idResult.rows[0].id;
        const now = new Date();
        const admittedOnDisplay = formatDateTime(now);

        await client.query(
            `INSERT INTO admissions
                (id, doctor_id, owner_id, animal_id, service_id, status, attending_doctor_name, notes, admitted_on, admitted_on_display, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [admissionId, req.doctorId, ownerId, animalId, serviceId, b.status, b.doctorName || null, b.notes || null, now, admittedOnDisplay, req.doctorId]
        );

        const paymentInsert = await client.query(
            `INSERT INTO payments (admission_id, doctor_id, fee, discount, total, received, pending)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [admissionId, req.doctorId, fee, discount, total, cappedReceived, pending]
        );
        if (cappedReceived > 0) {
            await client.query(
                `INSERT INTO payment_transactions (payment_id, admission_id, doctor_id, amount, type)
                 VALUES ($1,$2,$3,$4,'initial')`,
                [paymentInsert.rows[0].id, admissionId, req.doctorId, cappedReceived]
            );
        }

        await client.query('COMMIT');

        const finalRow = await db.query(`${JOIN_SELECT} WHERE a.id = $1 AND a.doctor_id = $2`, [admissionId, req.doctorId]);
        return res.status(201).json({ admission: mapAdmissionRow(finalRow.rows[0]) });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('create admission error:', err);
        return res.status(500).json({ error: 'Could not save admission.' });
    } finally {
        client.release();
    }
}

// Helper: confirm an admission belongs to the authenticated doctor before touching it.
async function assertOwnership(admissionId, doctorId) {
    const result = await db.query('SELECT id, owner_id, animal_id FROM admissions WHERE id = $1 AND doctor_id = $2', [admissionId, doctorId]);
    return result.rows[0] || null;
}

// PUT /api/admissions/:id
async function update(req, res) {
    try {
        const owned = await assertOwnership(req.params.id, req.doctorId);
        if (!owned) return res.status(404).json({ error: 'Admission not found.' });

        const b = req.body || {};
        const fee = toNumber(b.payment?.fee, 0);
        const discount = toNumber(b.payment?.discount, 0);
        const received = toNumber(b.payment?.received, 0);
        const total = Math.max(fee - discount, 0);
        const cappedReceived = Math.min(Math.max(received, 0), total);
        const pending = Math.max(total - cappedReceived, 0);

        if (b.photo !== undefined) {
            // Explicit photo field sent (either a new data URL, or null to clear it).
            await db.query(
                `UPDATE animals SET name = $1, species = $2, breed = $3, photo = $4, updated_at = now()
                 WHERE id = $5 AND doctor_id = $6`,
                [b.name, b.species, b.breed, b.photo, owned.animal_id, req.doctorId]
            );
        } else {
            await db.query(
                `UPDATE animals SET name = $1, species = $2, breed = $3, updated_at = now()
                 WHERE id = $4 AND doctor_id = $5`,
                [b.name, b.species, b.breed, owned.animal_id, req.doctorId]
            );
        }

        await db.query(
            `UPDATE owners SET name = $1, place = $2, phone = $3, updated_at = now()
             WHERE id = $4 AND doctor_id = $5`,
            [b.owner, b.place, b.phone, owned.owner_id, req.doctorId]
        );

        await db.query(
            `UPDATE admissions SET status = $1, attending_doctor_name = $2, notes = $3
             WHERE id = $4 AND doctor_id = $5`,
            [b.status, b.doctor, b.notes, req.params.id, req.doctorId]
        );

        await db.query(
            `UPDATE payments SET fee = $1, discount = $2, total = $3, received = $4, pending = $5, updated_at = now()
             WHERE admission_id = $6 AND doctor_id = $7`,
            [fee, discount, total, cappedReceived, pending, req.params.id, req.doctorId]
        );

        const finalRow = await db.query(`${JOIN_SELECT} WHERE a.id = $1 AND a.doctor_id = $2`, [req.params.id, req.doctorId]);
        return res.json({ admission: mapAdmissionRow(finalRow.rows[0]) });
    } catch (err) {
        console.error('update admission error:', err);
        return res.status(500).json({ error: 'Could not update admission.' });
    }
}

// DELETE /api/admissions/:id  { username, password }
async function remove(req, res) {
    try {
        const owned = await assertOwnership(req.params.id, req.doctorId);
        if (!owned) return res.status(404).json({ error: 'Admission not found.' });

        await db.query('DELETE FROM admissions WHERE id = $1 AND doctor_id = $2', [req.params.id, req.doctorId]);
        // The animal record is admission-specific — clean it up. The owner
        // record may be shared by other admissions (returning farmer), so
        // it is left in place.
        await db.query('DELETE FROM animals WHERE id = $1 AND doctor_id = $2', [owned.animal_id, req.doctorId]);

        return res.json({ deleted: true });
    } catch (err) {
        console.error('delete admission error:', err);
        return res.status(500).json({ error: 'Could not delete admission.' });
    }
}

module.exports = { list, create, update, remove };
