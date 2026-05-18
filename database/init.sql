-- init.sql - Mind Map Otomatis Database Initialization
--
-- Schema for "Pengembangan Sistem Mind Map Otomatis dari Hasil Generatif AI".
-- Berisi tabel users, projects, mindmaps, mindmap_revisions.
--
-- Catatan:
--   - Semua tabel menyertakan timestamp untuk audit.
--   - Password disimpan dalam bentuk hash bcrypt.
--   - Struktur mind map disimpan sebagai JSONB hierarkis rekursif
--     { concept, level, children }.

-- ---- Users ----
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ---- Mind map projects ----
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    source_text TEXT NOT NULL,
    -- struktur hierarkis rekursif: { concept, level, children }
    mindmap JSONB NOT NULL DEFAULT '{}'::jsonb,
    layout VARCHAR(40) NOT NULL DEFAULT 'reingold-tilford-radial',
    -- metadata generation: prompt strategy, retry count, validation passes
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- ---- Revisi mind map (untuk fitur undo/redo persisten) ----
CREATE TABLE IF NOT EXISTS mindmap_revisions (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    mindmap JSONB NOT NULL,
    note VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_revisions_project ON mindmap_revisions(project_id);

-- ---- Example seed: demo user (password = "demo1234") ----
-- bcrypt hash dihasilkan dengan rounds=10
INSERT INTO users (username, email, password)
VALUES ('melati', 'melati@example.com',
        '$2a$10$Wj1Q4i7lE5sxv1Y2nQNRtuY7QzNiKp8r/9JzOQX9xLU8xGn0o2qYO')
ON CONFLICT (username) DO NOTHING;
