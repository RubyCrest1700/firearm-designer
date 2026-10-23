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
