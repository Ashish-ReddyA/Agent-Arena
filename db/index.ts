import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let ensured: Promise<unknown> | undefined;

export async function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  // ponytail: local dev has no migration runner, so ensure the single table on
  // first use; a no-op when the hosted control plane already applied drizzle/.
  ensured ??= env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS experiments (id text PRIMARY KEY NOT NULL, name text NOT NULL, objective text NOT NULL, status text DEFAULT 'draft' NOT NULL, payload text DEFAULT '{}' NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)"
  ).run();
  await ensured;

  return drizzle(env.DB, { schema });
}
