"use client";

import { auth } from "@/lib/auth";
import Link from "next/link";

type Session = typeof auth.$Infer.Session;

export default function Navigation({session}: {session: Session | null}) {
  return (
    <nav>
      <Link href="/">Home</Link>
      {session ? (
        <Link href="/dashboard">Dashboard</Link>
      ) : (
        <Link href="/login">Login</Link>
      )}
    </nav>
  );
}