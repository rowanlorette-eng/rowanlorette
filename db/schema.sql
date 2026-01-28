CREATE TABLE IF NOT EXISTS videos (
                                      id TEXT PRIMARY KEY,
                                      title TEXT,
                                      status TEXT,
                                      thumbnail TEXT,
                                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
