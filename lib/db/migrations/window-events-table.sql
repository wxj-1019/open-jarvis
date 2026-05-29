-- lib/db/migrations/window-events-table.sql
CREATE TABLE IF NOT EXISTS window_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT NOT NULL,
  title TEXT,
  timestamp INTEGER NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  a11y_text TEXT,
  ocr_text TEXT,
  content_hash TEXT,
  privacy_level TEXT DEFAULT 'standard',
  platform TEXT,
  event_type TEXT DEFAULT 'app_switch'
);

CREATE INDEX IF NOT EXISTS idx_window_events_app_ts ON window_events(app, timestamp);
CREATE INDEX IF NOT EXISTS idx_window_events_ts ON window_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_window_events_platform ON window_events(platform);
