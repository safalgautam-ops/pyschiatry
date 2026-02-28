import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "@/drizzle/auth-schema";
import "dotenv/config";

const connection = await mysql.createConnection(process.env.DATABASE_URL!);

export const db = drizzle({ client: connection, schema, mode: "default" });