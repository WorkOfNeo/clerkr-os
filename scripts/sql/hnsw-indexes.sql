-- HNSW indexes for the pgvector columns.
--
-- These are NOT expressible in schema.prisma — Prisma can't model index
-- opclasses on `Unsupported` columns — so every `prisma db push` reconciles
-- them away as unknown objects. Not a wipe-and-repush hazard: it happens on
-- EVERY push. That is why this file is re-applied by scripts/deploy-db.sh
-- immediately after each one.
--
-- They were missing entirely in prod until 2026-08-22, which meant every
-- semantic search was a sequential scan.
--
-- IF NOT EXISTS makes this a no-op when they survive. Plain CREATE INDEX (not
-- CONCURRENTLY) takes a brief ACCESS EXCLUSIVE lock, which is correct here:
-- CONCURRENTLY cannot run inside the implicit transaction Prisma wraps this in,
-- and the tables are small enough that the lock is measured in milliseconds.

CREATE INDEX IF NOT EXISTS wiki_note_embedding_idx ON wiki_note USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS feature_embedding_idx   ON feature   USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS meeting_embedding_idx   ON meeting   USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS ticket_embedding_idx    ON ticket    USING hnsw (embedding vector_cosine_ops);
