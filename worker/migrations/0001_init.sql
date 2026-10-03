-- Community builds: shared parts lists, votes, buy click-throughs and reports.
CREATE TABLE builds (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  parts TEXT NOT NULL,          -- JSON array of part ids
  created_at INTEGER NOT NULL,  -- unix ms
  ip_hash TEXT NOT NULL,
  votes INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX builds_platform ON builds (platform, hidden);
CREATE INDEX builds_created ON builds (created_at);

-- One vote per visitor per build.
CREATE TABLE votes (
  build_id TEXT NOT NULL,
  voter TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (build_id, voter)
);

-- One counted retailer click per visitor per build per day.
CREATE TABLE clicks (
  build_id TEXT NOT NULL,
  voter TEXT NOT NULL,
  day INTEGER NOT NULL,
  PRIMARY KEY (build_id, voter, day)
);

-- One report per visitor per build.
CREATE TABLE reports (
  build_id TEXT NOT NULL,
  voter TEXT NOT NULL,
  PRIMARY KEY (build_id, voter)
);
