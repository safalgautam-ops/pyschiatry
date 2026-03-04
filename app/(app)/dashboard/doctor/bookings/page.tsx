import { requireAuthenticatedUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DoctorBookingsScreen } from "../_components/doctor-bookings-screen";

export default async function DoctorBookingsPage({
  searchParams,
}: {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
}) {
  const user = await requireAuthenticatedUser();
  if (user.role !== "DOCTOR") {
    redirect("/dashboard");
  }

  const resolvedSearchParams =
    searchParams && "then" in searchParams ? await searchParams : (searchParams ?? {});

  return <DoctorBookingsScreen user={user} searchParams={resolvedSearchParams} />;
}
