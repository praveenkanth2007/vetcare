const db = require('../db');

// GET /api/analytics/animals — per-species entry counts for this doctor only.
async function speciesOverview(req, res) {
    try {
        const result = await db.query(
            `SELECT an.species, COUNT(*)::int AS count, COALESCE(SUM(p.received), 0) AS revenue
             FROM admissions a
             JOIN animals an ON an.id = a.animal_id
             LEFT JOIN payments p ON p.admission_id = a.id
             WHERE a.doctor_id = $1
             GROUP BY an.species`,
            [req.doctorId]
        );
        return res.json({ species: result.rows.map(r => ({ species: r.species, count: r.count, revenue: Number(r.revenue) })) });
    } catch (err) {
        console.error('speciesOverview error:', err);
        return res.status(500).json({ error: 'Could not load animal analytics.' });
    }
}

const RANGE_CLAUSES = {
    today: "a.admitted_on::date = CURRENT_DATE",
    week: "a.admitted_on >= date_trunc('week', CURRENT_DATE)",
    month: "date_trunc('month', a.admitted_on) = date_trunc('month', CURRENT_DATE)",
    all: "TRUE",
};

// GET /api/analytics/animals/:species?range=today|week|month|all
// Only ever returns THIS doctor's records for THIS species — never mixes
// animal types or doctors, by construction of the WHERE clause.
async function speciesDetail(req, res) {
    try {
        const range = RANGE_CLAUSES[req.query.range] ? req.query.range : 'all';
        const rangeClause = RANGE_CLAUSES[range];

        const rows = await db.query(
            `SELECT a.id, a.status, a.admitted_on, a.admitted_on_display,
                    o.name AS owner_name, an.name AS animal_name, an.breed,
                    p.total, p.received, p.pending
             FROM admissions a
             JOIN animals an ON an.id = a.animal_id
             JOIN owners o ON o.id = a.owner_id
             LEFT JOIN payments p ON p.admission_id = a.id
             WHERE a.doctor_id = $1 AND an.species = $2 AND ${rangeClause}
             ORDER BY a.admitted_on DESC`,
            [req.doctorId, req.params.species]
        );

        const purposeCounts = {};
        let revenue = 0;
        rows.rows.forEach(r => {
            purposeCounts[r.status] = (purposeCounts[r.status] || 0) + 1;
            revenue += Number(r.received) || 0;
        });

        return res.json({
            species: req.params.species,
            range,
            totalEntries: rows.rows.length,
            purposeCounts,
            revenue,
            admissions: rows.rows.map(r => ({
                id: r.id,
                owner: r.owner_name,
                animal: r.animal_name,
                breed: r.breed,
                status: r.status,
                admittedOn: r.admitted_on_display,
                total: Number(r.total),
                received: Number(r.received),
                pending: Number(r.pending),
            })),
        });
    } catch (err) {
        console.error('speciesDetail error:', err);
        return res.status(500).json({ error: 'Could not load species analytics.' });
    }
}

module.exports = { speciesOverview, speciesDetail };
