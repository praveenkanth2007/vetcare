const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    }
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        // req.doctorId is the ONLY source of truth for "who is asking".
        // Every controller must scope its queries using this value —
        // never a doctorId/doctor_id supplied in the body, query, or params.
        req.doctorId = payload.doctorId;
        req.username = payload.username;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
}

module.exports = { authenticate };
