import { drizzle as neonHttpDrizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { drizzle as nodePgDrizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL!;

const databaseType = process.env.DATABASE_TYPE ?? "neon";

const globalForDb = globalThis as unknown as {
  __tweakcnPgPool?: Pool;
};

export const db = (() => {
  if (databaseType === "postgres") {
    const pool = globalForDb.__tweakcnPgPool ?? new Pool({ connectionString: databaseUrl });
    if (process.env.NODE_ENV !== "production") {
      globalForDb.__tweakcnPgPool = pool;
    }
    return nodePgDrizzle(pool);
  }

  if (databaseType !== "neon") {
    throw new Error(
      `Unsupported DATABASE_TYPE="${databaseType}". Expected "postgres" (self-hosted) or "neon" (hosted).`
    );
  }

  const sql = neon(databaseUrl);
  return neonHttpDrizzle({ client: sql });
})();
