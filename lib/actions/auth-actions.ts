"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const signUp = async ( email: string, password: string, name: string) => {
    const res = await auth.api.signUpEmail({
        body:{
            email, password, name, callbackURL: "/dashboard",
        }
    });

    return res;
};

export const signIn = async ( email: string, password: string) => {
    const res = await auth.api.signInEmail({
        body:{
            email, password, callbackURL: "/dashboard",
        }
    });

    return res;
}

export const signOut = async () => {
    await auth.api.signOut({headers: await headers()});
}

export const signInWithSocial = async (provider: "google") => {
    const {url} = await auth.api.signInSocial({
        body: { 
            provider,    
            callbackURL: "/dashboard",
        }
    });

    console.log("Redirecting to:", url);

    if(url) {
        redirect(url);
    }
}
