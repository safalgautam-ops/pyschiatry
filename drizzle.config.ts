import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: 'mysql',
    schema: './drizzle/index.ts',
    out: './drizzle/migrations',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? '',
    },
    verbose: true,
    strict: true
});