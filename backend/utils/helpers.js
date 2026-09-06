// Formats a Date the same way the original frontend's formatDateTime() did:
// "DD/MM/YYYY hh:mm AM/PM" — keeps the API's admitted_on strings visually
// identical to what the pure-localStorage version used to produce.
function formatDateTime(d) {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${day}/${month}/${year} ${String(hours).padStart(2, '0')}:${mins} ${ampm}`;
}

function toNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

// Maps a DB row (admissions JOIN owners/animals/payments) into the exact
// flat "patient" shape the existing frontend already expects, so the UI's
// rendering code never has to change.
function mapAdmissionRow(row) {
    return {
        _id: row.id,
        name: row.animal_name,
        breed: row.breed,
        species: row.species,
        photo: row.animal_photo || null,
        owner: row.owner_name,
        place: row.place,
        phone: row.phone,
        aadhaar: row.aadhaar,
        status: row.status,
        doctor: row.attending_doctor_name,
        admitted_on: row.admitted_on_display,
        notes: row.notes,
        payment: {
            fee: Number(row.fee),
            discount: Number(row.discount),
            total: Number(row.total),
            received: Number(row.received),
            pending: Number(row.pending),
        },
        createdBy: row.created_by_username,
    };
}

module.exports = { formatDateTime, toNumber, mapAdmissionRow };
