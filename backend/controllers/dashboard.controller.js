const db = require('../db');

// GET /api/dashboard/summary — strictly scoped to the authenticated doctor.
// A brand-new doctor with zero records will get all zeros here by
// construction (the WHERE doctor_id = $1 clause simply matches nothing).
async function summary(req, res) {
    try {
        const doctorId = req.doctorId;

        const counts = await db.query(
            `SELECT
                COUNT(*)::int AS total_patients,
                COUNT(*) FILTER (WHERE status = 'Artificial Insemination')::int AS ai_cases,
                COUNT(*) FILTER (WHERE status = 'Injection Breed Sync')::int AS sync_cases,
                COUNT(*) FILTER (WHERE status = 'Critical')::int AS critical_cases
             FROM admissions WHERE doctor_id = $1`,
            [doctorId]
        );

        const revenue = await db.query(
            `SELECT
                COALESCE(SUM(p.received) FILTER (WHERE a.admitted_on::date = CURRENT_DATE), 0) AS today,
                COALESCE(SUM(p.received) FILTER (WHERE date_trunc('month', a.admitted_on) = date_trunc('month', CURRENT_DATE)), 0) AS month,
                COALESCE(SUM(p.received), 0) AS total,
                COALESCE(SUM(p.pending), 0) AS pending
             FROM admissions a
             LEFT JOIN payments p ON p.admission_id = a.id
             WHERE a.doctor_id = $1`,
            [doctorId]
        );

        const c = counts.rows[0];
        const r = revenue.rows[0];
        return res.json({
            totalPatients: c.total_patients,
            aiCases: c.ai_cases,
            syncCases: c.sync_cases,
            criticalCases: c.critical_cases,
            revenue: {
                today: Number(r.today),
                month: Number(r.month),
                total: Number(r.total),
                pending: Number(r.pending),
            },
        });
    } catch (err) {
        console.error('dashboard summary error:', err);
        return res.status(500).json({ error: 'Could not load dashboard summary.' });
    }
}

module.exports = { summary };
