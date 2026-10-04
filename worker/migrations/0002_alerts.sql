-- Email price alerts. One row per browser that signed up: the address, every build saved in that
-- browser, and the price of each part the last time we told them about it.
CREATE TABLE alerts (
  token TEXT PRIMARY KEY,         -- secret in the browser and in every email link
  email TEXT NOT NULL,            -- lowercased
  builds TEXT NOT NULL,           -- JSON [{ name, platform, parts: [part ids] }]
  seen TEXT NOT NULL DEFAULT '{}',-- JSON { "<platform>/<part>": price last reported }
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,    -- unix ms
  ip_hash TEXT NOT NULL,
  last_sent_at INTEGER
);
CREATE INDEX alerts_email ON alerts (email);
CREATE INDEX alerts_created ON alerts (created_at, confirmed);
