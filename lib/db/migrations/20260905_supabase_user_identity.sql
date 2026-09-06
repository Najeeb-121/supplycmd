ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "supabase_user_id" uuid;

CREATE UNIQUE INDEX IF NOT EXISTS "users_supabase_user_id_unique"
ON "users" ("supabase_user_id");
