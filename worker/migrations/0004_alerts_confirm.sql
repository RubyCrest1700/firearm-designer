-- Price alert signups are confirmed with a one-time code that is only in the confirmation email. Only its
-- SHA-256 hash is stored, and it's cleared once used. Signups from before this keep a NULL here: confirmed
-- ones carry on as they are, and unconfirmed ones can't be confirmed any more and are deleted after 7 days.
ALTER TABLE alerts ADD COLUMN confirm_hash TEXT;
CREATE INDEX alerts_confirm ON alerts (confirm_hash);

-- Addresses that unsubscribed after confirming, as a salted SHA-256 hash (never the address). For 90 days
-- after that, a new signup for the address gets no confirmation email.
CREATE TABLE suppressed (
  email_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL      -- unix ms, when they unsubscribed
);

-- One row per price alert signup that went through (suppressed addresses included, since they get the same
-- answer), for the daily signup limits. Kept apart from alerts so unsubscribing doesn't reset the limits.
-- Both hashes are salted SHA-256 (never the address or IP); rows are deleted after 30 days (retention.js).
CREATE TABLE signups (
  ip_hash TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL      -- unix ms
);
CREATE INDEX signups_created ON signups (created_at);

-- Small settings the Worker keeps for itself. 'rebaseline' names the last one-time quiet price re-baseline
-- the alert run did (alerts.js REBASELINE).
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
