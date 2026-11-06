// drizzle-kit writes the SQL migrations from src/schema.ts (`npm run generate -w @qsmart/db`).
// The company wall itself is hand-written SQL in migrations/0001_company_wall.sql.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
});
