"""
SQLite database setup.
Tables: users (full KYC + face) and transactions (payment history).
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "facepay.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            phone           TEXT NOT NULL,
            upi_id          TEXT NOT NULL UNIQUE,
            upi_pin_hash    TEXT NOT NULL,
            bank_account    TEXT NOT NULL,
            ifsc_code       TEXT NOT NULL,
            bank_name       TEXT NOT NULL,
            face_path       TEXT NOT NULL,
            face_encoding   TEXT NOT NULL,
            balance         REAL DEFAULT 10000.0,
            kyc_verified    INTEGER DEFAULT 1,
            created_at      TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id          TEXT PRIMARY KEY,
            sender_id   TEXT NOT NULL,
            sender_name TEXT NOT NULL,
            amount      REAL NOT NULL,
            status      TEXT NOT NULL,
            note        TEXT DEFAULT '',
            timestamp   TEXT NOT NULL,
            FOREIGN KEY (sender_id) REFERENCES users(id)
        );
    """)
    conn.commit()
    conn.close()
