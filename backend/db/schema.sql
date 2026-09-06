-- =====================================================================
-- VetCare Pro — PostgreSQL schema
-- Every clinical table carries doctor_id so every query can (and must)
-- filter WHERE doctor_id = $authenticatedDoctorId. doctor_id is NEVER
-- accepted from client input — it always comes from the verified JWT.
-- =====================================================================

CREATE TABLE IF NOT EXISTS doctors (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    name            VARCHAR(150),
    mobile          VARCHAR(15),
    position        VARCHAR(100),
    photo           TEXT,               -- base64 data URL, matches frontend's local photo storage
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owners (
    id              SERIAL PRIMARY KEY,
    doctor_id       INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    place           VARCHAR(150),
    phone           VARCHAR(15),
    aadhaar         VARCHAR(20),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_owners_doctor        ON owners(doctor_id);
CREATE INDEX IF NOT EXISTS idx_owners_doctor_phone  ON owners(doctor_id, phone);

CREATE TABLE IF NOT EXISTS animals (
    id              SERIAL PRIMARY KEY,
    doctor_id       INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    owner_id        INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    species         VARCHAR(50) NOT NULL,
    breed           VARCHAR(120),
    photo           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_animals_doctor          ON animals(doctor_id);
CREATE INDEX IF NOT EXISTS idx_animals_doctor_species  ON animals(doctor_id, species);

CREATE TABLE IF NOT EXISTS services (
    id              SERIAL PRIMARY KEY,
    doctor_id       INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    default_fee     NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(doctor_id, name)
);
CREATE INDEX IF NOT EXISTS idx_services_doctor ON services(doctor_id);

CREATE SEQUENCE IF NOT EXISTS admission_id_seq;

CREATE TABLE IF NOT EXISTS admissions (
    id                      VARCHAR(20) PRIMARY KEY,   -- e.g. VC-000001
    doctor_id               INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    owner_id                INTEGER NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
    animal_id               INTEGER NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
    service_id              INTEGER REFERENCES services(id) ON DELETE SET NULL,
    status                  VARCHAR(60) NOT NULL,       -- purpose: Routine / Artificial Insemination / ...
    attending_doctor_name   VARCHAR(150),
    notes                   TEXT,
    admitted_on             TIMESTAMPTZ NOT NULL DEFAULT now(),
    admitted_on_display     VARCHAR(40),                -- frozen "DD/MM/YYYY hh:mm AM/PM" string, set at creation
    created_by              INTEGER NOT NULL REFERENCES doctors(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admissions_doctor           ON admissions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_admissions_doctor_admitted  ON admissions(doctor_id, admitted_on DESC);
CREATE INDEX IF NOT EXISTS idx_admissions_doctor_animal    ON admissions(doctor_id, animal_id);

CREATE TABLE IF NOT EXISTS payments (
    id              SERIAL PRIMARY KEY,
    admission_id    VARCHAR(20) UNIQUE NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
    doctor_id       INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    fee             NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount        NUMERIC(10,2) NOT NULL DEFAULT 0,
    total           NUMERIC(10,2) NOT NULL DEFAULT 0,
    received        NUMERIC(10,2) NOT NULL DEFAULT 0,
    pending         NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_doctor ON payments(doctor_id);

CREATE TABLE IF NOT EXISTS payment_transactions (
    id              SERIAL PRIMARY KEY,
    payment_id      INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    admission_id    VARCHAR(20) NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
    doctor_id       INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    amount          NUMERIC(10,2) NOT NULL,
    type            VARCHAR(20) NOT NULL DEFAULT 'payment', -- 'initial' | 'payment' | 'mark_paid'
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_txn_doctor     ON payment_transactions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_txn_admission  ON payment_transactions(admission_id);
