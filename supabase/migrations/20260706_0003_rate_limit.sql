-- Migration 20260706_0003_rate_limit.sql
-- Durable IP-based rate limiting for serverless functions.
-- Replaces the in-memory Map (ineffective across Vercel instances) with a
-- Supabase-backed RPC that is consistent across all function instances.
-- IPs are never stored at rest: the RPC hashes each IP + bucket with SHA-256.
-- Cleanup is probabilistic (1% of calls, max 100 rows) -- no pg_cron required.

BEGIN;

-- pgcrypto lives in the extensions schema on Supabase (not public).
-- CREATE EXTENSION is idempotent; safe to re-run.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── Table ─────────────────────────────────────────────────────────────────
-- One row per (bucket, hashed_ip) pair. Primary key is the SHA-256 hash.

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key      text        PRIMARY KEY,   -- SHA-256(bucket:ip), never raw IP
  count    integer     NOT NULL DEFAULT 1,
  reset_at timestamptz NOT NULL
);

-- RLS enabled: service_role bypasses RLS automatically.
-- anon and authenticated roles see zero rows.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Index used by the probabilistic cleanup query.
CREATE INDEX IF NOT EXISTS rate_limit_buckets_reset_at_idx
  ON public.rate_limit_buckets (reset_at);

-- ── RPC ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_rate_limit(
  p_ip        text,
  p_bucket    text,
  p_limit     integer,
  p_window_ms bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- extensions in search_path so extensions.digest() is reachable by unqualified name,
-- but we call it explicitly as extensions.digest() to be schema-unambiguous.
SET search_path = public, extensions
AS $$
DECLARE
  v_key    text;
  v_count  integer;
  v_now    timestamptz := now();
  v_window interval;
BEGIN
  -- Input validation
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'invalid_rate_limit_params: p_limit must be a positive integer'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_window_ms IS NULL OR p_window_ms <= 0 THEN
    RAISE EXCEPTION 'invalid_rate_limit_params: p_window_ms must be a positive integer'
      USING ERRCODE = 'P0001';
  END IF;

  -- Key: SHA-256(bucket:ip). Raw IP is never written to disk.
  -- extensions.digest() called explicitly to avoid search_path injection risks.
  v_key    := encode(extensions.digest(p_bucket || ':' || coalesce(p_ip, ''), 'sha256'), 'hex');
  v_window := p_window_ms * interval '1 millisecond';

  -- Atomic upsert: reset window if expired, otherwise increment counter.
  INSERT INTO public.rate_limit_buckets (key, count, reset_at)
  VALUES (v_key, 1, v_now + v_window)
  ON CONFLICT (key) DO UPDATE
    SET count    = CASE
                     WHEN rate_limit_buckets.reset_at <= v_now
                       THEN 1
                     ELSE rate_limit_buckets.count + 1
                   END,
        reset_at = CASE
                     WHEN rate_limit_buckets.reset_at <= v_now
                       THEN v_now + v_window
                     ELSE rate_limit_buckets.reset_at
                   END
  RETURNING count INTO v_count;

  -- Reject if over limit.
  IF v_count > p_limit THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;

  -- Probabilistic cleanup: ~1% of calls delete up to 100 expired rows.
  -- Bounded by LIMIT 100 to keep per-call latency predictable.
  -- The index on reset_at makes the subquery efficient. No pg_cron required.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_buckets
    WHERE key IN (
      SELECT key FROM public.rate_limit_buckets
      WHERE reset_at < v_now
      LIMIT 100
    );
  END IF;
END;
$$;

-- ── Permissions ───────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.assert_rate_limit(text, text, integer, bigint)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_rate_limit(text, text, integer, bigint)
  TO service_role;

REVOKE ALL ON TABLE public.rate_limit_buckets
  FROM public, anon, authenticated;

COMMIT;
