const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const SALT_ROUNDS = 10;

function signToken(doctor) {
    return jwt.sign(
        { doctorId: doctor.id, username: doctor.username },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function publicDoctor(row) {
    return {
        id: row.id,
        username: row.username,
        name: row.name,
        mobile: row.mobile,
        position: row.position,
        photo: row.photo,
    };
}

async function register(req, res) {
    try {
        const { username, password, name, mobile, position } = req.body || {};
        if (!username || typeof username !== 'string' || username.trim().length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters.' });
        }
        if (!password || typeof password !== 'string' || password.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters.' });
        }
        const cleanUsername = username.trim().toLowerCase();

        const existing = await db.query('SELECT id FROM doctors WHERE username = $1', [cleanUsername]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Username is already taken.' });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const result = await db.query(
            `INSERT INTO doctors (username, password_hash, name, mobile, position)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, username, name, mobile, position, photo`,
            [cleanUsername, passwordHash, name || null, mobile || null, position || null]
        );
        const doctor = result.rows[0];
        const token = signToken(doctor);
        return res.status(201).json({ token, doctor: publicDoctor(doctor) });
    } catch (err) {
        console.error('register error:', err);
        return res.status(500).json({ error: 'Could not create account.' });
    }
}

async function login(req, res) {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }
        const cleanUsername = String(username).trim().toLowerCase();
        const result = await db.query('SELECT * FROM doctors WHERE username = $1', [cleanUsername]);
        const doctor = result.rows[0];
        if (!doctor) {
            return res.status(401).json({ error: 'Incorrect username or password.' });
        }
        const match = await bcrypt.compare(password, doctor.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Incorrect username or password.' });
        }
        const token = signToken(doctor);
        return res.json({ token, doctor: publicDoctor(doctor) });
    } catch (err) {
        console.error('login error:', err);
        return res.status(500).json({ error: 'Login failed.' });
    }
}

async function me(req, res) {
    try {
        const result = await db.query(
            'SELECT id, username, name, mobile, position, photo FROM doctors WHERE id = $1',
            [req.doctorId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Doctor not found.' });
        return res.json({ doctor: publicDoctor(result.rows[0]) });
    } catch (err) {
        console.error('me error:', err);
        return res.status(500).json({ error: 'Could not load profile.' });
    }
}

async function updateProfile(req, res) {
    try {
        const { name, mobile, position, photo } = req.body || {};
        if (!name || !mobile || !position) {
            return res.status(400).json({ error: 'Name, mobile, and position are required.' });
        }
        if (!/^[0-9]{10}$/.test(mobile)) {
            return res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
        }
        const result = await db.query(
            `UPDATE doctors SET name = $1, mobile = $2, position = $3, photo = $4
             WHERE id = $5
             RETURNING id, username, name, mobile, position, photo`,
            [name, mobile, position, photo === undefined ? null : photo, req.doctorId]
        );
        return res.json({ doctor: publicDoctor(result.rows[0]) });
    } catch (err) {
        console.error('updateProfile error:', err);
        return res.status(500).json({ error: 'Could not update profile.' });
    }
}

// Used by the "delete admission" confirmation dialog: the doctor must
// re-type their own username + password. We verify the username matches
// the CURRENTLY AUTHENTICATED doctor (from the JWT) and that the password
// is correct — this can never be used to authenticate as someone else.
async function verifyPassword(req, res) {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required.' });
        }
        const result = await db.query('SELECT * FROM doctors WHERE id = $1', [req.doctorId]);
        const doctor = result.rows[0];
        if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
        if (String(username).trim().toLowerCase() !== doctor.username) {
            return res.status(403).json({ error: 'You can only confirm your own account.' });
        }
        const match = await bcrypt.compare(password, doctor.password_hash);
        if (!match) return res.status(401).json({ error: 'Incorrect username or password.' });
        return res.json({ verified: true });
    } catch (err) {
        console.error('verifyPassword error:', err);
        return res.status(500).json({ error: 'Verification failed.' });
    }
}

module.exports = { register, login, me, updateProfile, verifyPassword };
