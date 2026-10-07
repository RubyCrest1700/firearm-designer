-- Visitor feedback from the Send Feedback page. Emailed to the site owner in one digest a day.
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',  -- optional, for a reply
  page TEXT NOT NULL DEFAULT '',   -- the page they came from, e.g. /faq/glock-slides/ or /#build
  created_at INTEGER NOT NULL,     -- unix ms
  ip_hash TEXT NOT NULL,
  emailed_at INTEGER               -- when it went out in the daily digest
);
CREATE INDEX feedback_created ON feedback (created_at);
CREATE INDEX feedback_unsent ON feedback (emailed_at);
