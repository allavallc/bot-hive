-- Drop the active_claims table (HV-090 soft-fence rip-out).
-- Idempotent: handles already-deleted state without error.
DROP TABLE IF EXISTS "active_claims" CASCADE;
