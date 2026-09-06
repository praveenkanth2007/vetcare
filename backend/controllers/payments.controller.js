const db = require('../db');
const { toNumber } = require('../utils/helpers');

async function getOwnedPayment(admissionId, doctorId) {
    const result = await db.query(
        'SELECT * FROM payments WHERE admission_id = $1 AND doctor_id = $2',
        [admissionId, doctorId]
    );
    return result.rows[0] || null;
}

// POST /api/payments/:admissionId/pay { amount }
async function recordPayment(req, res) {
    try {
        const pay = await getOwnedPayment(req.params.admissionId, req.doctorId);
        if (!pay) return res.status(404).json({ error: 'Admission not found.' });

        const amount = toNumber(req.body?.amount, 0);
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Please provide a valid payment amount.' });
        }

        const received = Math.min(Number(pay.received) + amount, Number(pay.total));
        const pending = Math.max(Number(pay.total) - received, 0);

        const updated = await db.query(
            `UPDATE payments SET received = $1, pending = $2, updated_at = now()
             WHERE id = $3 RETURNING *`,
            [received, pending, pay.id]
        );
        await db.query(
            `INSERT INTO payment_transactions (payment_id, admission_id, doctor_id, amount, type)
             VALUES ($1,$2,$3,$4,'payment')`,
            [pay.id, req.params.admissionId, req.doctorId, amount]
        );

        return res.json({ payment: formatPayment(updated.rows[0]) });
    } catch (err) {
        console.error('recordPayment error:', err);
        return res.status(500).json({ error: 'Could not record payment.' });
    }
}

// POST /api/payments/:admissionId/mark-paid
async function markPaid(req, res) {
    try {
        const pay = await getOwnedPayment(req.params.admissionId, req.doctorId);
        if (!pay) return res.status(404).json({ error: 'Admission not found.' });

        const remainder = Number(pay.total) - Number(pay.received);
        const updated = await db.query(
            `UPDATE payments SET received = total, pending = 0, updated_at = now()
             WHERE id = $1 RETURNING *`,
            [pay.id]
        );
        if (remainder > 0) {
            await db.query(
                `INSERT INTO payment_transactions (payment_id, admission_id, doctor_id, amount, type)
                 VALUES ($1,$2,$3,$4,'mark_paid')`,
                [pay.id, req.params.admissionId, req.doctorId, remainder]
            );
        }
        return res.json({ payment: formatPayment(updated.rows[0]) });
    } catch (err) {
        console.error('markPaid error:', err);
        return res.status(500).json({ error: 'Could not mark as paid.' });
    }
}

// GET /api/payments/:admissionId/history
async function history(req, res) {
    try {
        const owned = await db.query('SELECT id FROM admissions WHERE id = $1 AND doctor_id = $2', [req.params.admissionId, req.doctorId]);
        if (owned.rows.length === 0) return res.status(404).json({ error: 'Admission not found.' });
        const result = await db.query(
            `SELECT amount, type, recorded_at FROM payment_transactions
             WHERE admission_id = $1 AND doctor_id = $2 ORDER BY recorded_at ASC`,
            [req.params.admissionId, req.doctorId]
        );
        return res.json({ history: result.rows });
    } catch (err) {
        console.error('history error:', err);
        return res.status(500).json({ error: 'Could not load payment history.' });
    }
}

// GET /api/payments/pending — doctor-scoped list of admissions with pending > 0
async function pending(req, res) {
    try {
        const result = await db.query(
            `SELECT a.id, a.status, a.admitted_on_display,
                    o.name AS owner_name, o.phone,
                    an.name AS animal_name, an.species,
                    p.total, p.received, p.pending
             FROM admissions a
             JOIN owners o ON o.id = a.owner_id
             JOIN animals an ON an.id = a.animal_id
             JOIN payments p ON p.admission_id = a.id
             WHERE a.doctor_id = $1 AND p.pending > 0
             ORDER BY a.admitted_on DESC`,
            [req.doctorId]
        );
        return res.json({ pending: result.rows });
    } catch (err) {
        console.error('pending error:', err);
        return res.status(500).json({ error: 'Could not load pending payments.' });
    }
}

function formatPayment(row) {
    return {
        fee: Number(row.fee),
        discount: Number(row.discount),
        total: Number(row.total),
        received: Number(row.received),
        pending: Number(row.pending),
    };
}

module.exports = { recordPayment, markPaid, history, pending };
