-- Migration: add OTP/password-reset columns to users table
-- Run this using psql or your DB client connected to the project's database.

BEGIN;

-- Add otp (varchar) to store the one-time code
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS otp VARCHAR(16);

-- Expiry timestamp for the otp
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS otp_expiry TIMESTAMP;

-- Number of OTP attempts in the current window
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS otp_attempts INT DEFAULT 0;

-- Last attempt timestamp (used for throttling)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS otp_last_attempt TIMESTAMP;

COMMIT;

-- Optional: create an index for quick lookup by email (if not already present)
-- CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
