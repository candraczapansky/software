-- Account Lockout Security Feature
-- Created: 2025-09-23
-- Purpose: Add columns for account lockout functionality
-- 
-- IMPORTANT: This migration is SAFE and non-breaking:
-- - Only adds new columns with defaults
-- - Doesn't modify existing data
-- - Doesn't affect current authentication

-- Add account lockout columns to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;

ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS account_locked_until TIMESTAMP DEFAULT NULL;

ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMP DEFAULT NULL;

ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS lockout_reason TEXT DEFAULT NULL;

-- Create an index for faster lockout queries
CREATE INDEX IF NOT EXISTS idx_users_account_locked_until 
  ON users(account_locked_until) 
  WHERE account_locked_until IS NOT NULL;

-- Create an index for users with failed attempts
CREATE INDEX IF NOT EXISTS idx_users_failed_login_attempts 
  ON users(failed_login_attempts) 
  WHERE failed_login_attempts > 0;

-- Add comment to explain the columns
COMMENT ON COLUMN users.failed_login_attempts IS 'Number of consecutive failed login attempts';
COMMENT ON COLUMN users.account_locked_until IS 'Timestamp when account lockout expires (NULL = not locked)';
COMMENT ON COLUMN users.last_failed_login IS 'Timestamp of the most recent failed login attempt';
COMMENT ON COLUMN users.lockout_reason IS 'Reason for account lockout (e.g., "Too many failed attempts")';
