import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "@/drizzle";
import "dotenv/config";
import { seedDefaultDoctors } from "@/db/seed-doctors";

const connection = await mysql.createConnection(process.env.DATABASE_URL!);
await seedDefaultDoctors(connection);

export const db = drizzle({ client: connection, schema, mode: "default" });
