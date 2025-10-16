-- Database schema for Quranic Platform
-- This file creates the initial database structure

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    user_type VARCHAR(50) NOT NULL CHECK (user_type IN ('Student', 'Qari', 'Admin')),
    is_verified BOOLEAN DEFAULT FALSE,
    certificate_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add OTP-related columns for password reset functionality
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS otp VARCHAR(6),
ADD COLUMN IF NOT EXISTS otp_expiry TIMESTAMP,
ADD COLUMN IF NOT EXISTS otp_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS otp_last_attempt TIMESTAMP;

-- Create calendar_availability table for scheduling
CREATE TABLE IF NOT EXISTS calendar_availability (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    capacity INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create calendar_bookings table for appointments
CREATE TABLE IF NOT EXISTS calendar_bookings (
    id SERIAL PRIMARY KEY,
    slot_id INTEGER NOT NULL REFERENCES calendar_availability(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    qari_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status VARCHAR(50) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for calendar tables
CREATE INDEX IF NOT EXISTS idx_calendar_availability_user_id ON calendar_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_availability_slot_date ON calendar_availability(slot_date);
CREATE INDEX IF NOT EXISTS idx_calendar_bookings_slot_id ON calendar_bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_calendar_bookings_student_id ON calendar_bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_calendar_bookings_qari_id ON calendar_bookings(qari_id);

-- Create triggers for calendar tables
DROP TRIGGER IF EXISTS update_calendar_availability_updated_at ON calendar_availability;
CREATE TRIGGER update_calendar_availability_updated_at
    BEFORE UPDATE ON calendar_availability
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_calendar_bookings_updated_at ON calendar_bookings;
CREATE TRIGGER update_calendar_bookings_updated_at
    BEFORE UPDATE ON calendar_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
