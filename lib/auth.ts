//lib/auth.ts
import { db } from "@/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth(
    {
        database: drizzleAdapter(db, {
            provider: "mysql",
        }),
        emailAndPassword: {
            enabled: true,
        },
        socialProviders: {
            github: {
                clientId: "",
                clientSecret: "", 
            },
            google: {
                clientId: "",
                clientSecret: "",
            },
        },
        plugins: [nextCookies()]
    }
);