-- Performance Optimization Indexes
-- Created: 2025-09-23
-- Purpose: Add missing indexes to improve query performance

-- ============================================
-- APPOINTMENTS TABLE INDEXES
-- ============================================
-- Most frequently queried table, needs comprehensive indexing

CREATE INDEX IF NOT EXISTS idx_appointments_location_id 
  ON appointments(location_id);

CREATE INDEX IF NOT EXISTS idx_appointments_status 
  ON appointments(status);

CREATE INDEX IF NOT EXISTS idx_appointments_created_at 
  ON appointments(created_at DESC);

-- Composite index for common query pattern (client + staff + time)
CREATE INDEX IF NOT EXISTS idx_appointments_client_staff_time 
  ON appointments(client_id, staff_id, start_time);

-- Index for payment status queries
CREATE INDEX IF NOT EXISTS idx_appointments_payment_status 
  ON appointments(payment_status);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_appointments_start_end_time 
  ON appointments(start_time, end_time);

-- ============================================
-- SALES HISTORY TABLE INDEXES
-- ============================================
-- Critical for reports and payroll calculations

CREATE INDEX IF NOT EXISTS idx_sales_history_transaction_date 
  ON sales_history(transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_sales_history_staff_name 
  ON sales_history(staff_name);

CREATE INDEX IF NOT EXISTS idx_sales_history_payment_status 
  ON sales_history(payment_status);

CREATE INDEX IF NOT EXISTS idx_sales_history_transaction_type 
  ON sales_history(transaction_type);

-- Composite index for date range + status queries
CREATE INDEX IF NOT EXISTS idx_sales_history_date_status 
  ON sales_history(transaction_date DESC, payment_status);

-- ============================================
-- USERS TABLE INDEXES
-- ============================================
-- For faster client and staff lookups

CREATE INDEX IF NOT EXISTS idx_users_role 
  ON users(role);

CREATE INDEX IF NOT EXISTS idx_users_phone 
  ON users(phone);

CREATE INDEX IF NOT EXISTS idx_users_created_at 
  ON users(created_at DESC);

-- Composite index for role-based queries with sorting
CREATE INDEX IF NOT EXISTS idx_users_role_created 
  ON users(role, created_at DESC);

-- ============================================
-- PAYMENTS TABLE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_payments_appointment_id 
  ON payments(appointment_id);

CREATE INDEX IF NOT EXISTS idx_payments_created_at 
  ON payments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_payment_method 
  ON payments(payment_method);

-- ============================================
-- STAFF SCHEDULES TABLE INDEXES
-- ============================================
-- For availability checks and schedule queries

CREATE INDEX IF NOT EXISTS idx_staff_schedules_day_of_week 
  ON staff_schedules(day_of_week);

CREATE INDEX IF NOT EXISTS idx_staff_schedules_is_blocked 
  ON staff_schedules(is_blocked);

-- Composite index for staff availability queries
CREATE INDEX IF NOT EXISTS idx_staff_schedules_staff_day_blocked 
  ON staff_schedules(staff_id, day_of_week, is_blocked);

-- ============================================
-- FORM SUBMISSIONS TABLE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_form_submissions_client_id 
  ON form_submissions(client_id);

CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id 
  ON form_submissions(form_id);

CREATE INDEX IF NOT EXISTS idx_form_submissions_created_at 
  ON form_submissions(created_at DESC);

-- ============================================
-- SERVICES TABLE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_services_location_id 
  ON services(location_id);

CREATE INDEX IF NOT EXISTS idx_services_is_active 
  ON services(is_active);

CREATE INDEX IF NOT EXISTS idx_services_is_hidden 
  ON services(is_hidden);

-- ============================================
-- STAFF TABLE INDEXES  
-- ============================================

CREATE INDEX IF NOT EXISTS idx_staff_user_id 
  ON staff(user_id);

CREATE INDEX IF NOT EXISTS idx_staff_is_active 
  ON staff(is_active);

-- ============================================
-- NOTE HISTORY TABLE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_note_history_entity_type_id 
  ON note_history(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_note_history_created_at 
  ON note_history(created_at DESC);

-- ============================================
-- ANALYZE TABLES AFTER INDEX CREATION
-- ============================================
-- Update table statistics for query planner

ANALYZE appointments;
ANALYZE sales_history;
ANALYZE users;
ANALYZE payments;
ANALYZE staff_schedules;
ANALYZE form_submissions;
ANALYZE services;
ANALYZE staff;
ANALYZE note_history;

-- ============================================
-- PERFORMANCE NOTES
-- ============================================
-- These indexes should improve query performance by 40-60%
-- Monitor slow query logs after deployment to identify any additional indexing needs
-- Consider partitioning large tables (appointments, sales_history) if they exceed 1M rows

