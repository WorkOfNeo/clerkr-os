-- Multiple kanban boards.
--
-- `prisma db push` cannot do this on its own: adding a required `boardId` to a
-- kanban_column table that already has rows needs a backfill between the ADD
-- and the SET NOT NULL, and push has nowhere to put one. So the data work
-- happens here and push then reconciles the constraints and indexes.
--
-- Idempotent: safe to run twice, and safe to run before or after a push.

-- 1. The board table. Constraint names match what Prisma generates so a later
--    push sees them as already correct rather than dropping and recreating.
CREATE TABLE IF NOT EXISTS kanban_board (
  id          TEXT NOT NULL,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT kanban_board_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_board_slug_key ON kanban_board (slug);

-- 2. Every existing column belongs to one board, so make it and adopt them.
INSERT INTO kanban_board (id, slug, name, description, "sortOrder", "isDefault")
SELECT gen_random_uuid()::text, 'main', 'Main', NULL, 10, true
WHERE NOT EXISTS (SELECT 1 FROM kanban_board);

ALTER TABLE kanban_column ADD COLUMN IF NOT EXISTS "boardId" TEXT;

UPDATE kanban_column
   SET "boardId" = (SELECT id FROM kanban_board ORDER BY "sortOrder" LIMIT 1)
 WHERE "boardId" IS NULL;

-- 3. Only now can it be required.
ALTER TABLE kanban_column ALTER COLUMN "boardId" SET NOT NULL;

-- 4. Names are unique PER BOARD now — two boards may each have a "Done".
--    Drop the old global uniques so push can put the composites in.
ALTER TABLE kanban_column DROP CONSTRAINT IF EXISTS kanban_column_slug_key;
ALTER TABLE kanban_column DROP CONSTRAINT IF EXISTS kanban_column_name_key;
DROP INDEX IF EXISTS kanban_column_slug_key;
DROP INDEX IF EXISTS kanban_column_name_key;

-- 5. Exactly one default board.
UPDATE kanban_board SET "isDefault" = true
 WHERE id = (SELECT id FROM kanban_board ORDER BY "sortOrder", "createdAt" LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM kanban_board WHERE "isDefault");
