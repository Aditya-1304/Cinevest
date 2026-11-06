import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });
const connection = process.env.DATABASE_URL_UNPOOLED;
if (!connection) throw new Error("DATABASE_URL_UNPOOLED is required for migrations");
if (new URL(connection).hostname.includes("-pooler")) throw new Error("Migrations require a direct PostgreSQL connection");
const client = postgres(connection, { max: 1 });
try {
  await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  console.log("Backend migrations applied");
} finally { await client.end(); }
