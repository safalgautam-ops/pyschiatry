import {
  type DoctorBookingsFilter,
  type DoctorBookingPeriod,
  getDoctorBookingsList,
} from "@/lib/dashboard/doctor-operations-service";
import type { AuthenticatedUser } from "@/lib/auth/session";
import Link from "next/link";
import { Frame, FrameDescription, FramePanel } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DoctorBookingsTable } from "./doctor-bookings-table";

const PERIOD_OPTIONS: Array<{ value: DoctorBookingPeriod; label: string }> = [
  { value: "THIS_WEEK", label: "This Week" },
  { value: "THIS_MONTH", label: "This Month" },
  { value: "TODAY", label: "Today" },
  { value: "SPECIFIC_DAY", label: "Specific Day" },
  { value: "SPECIFIC_WEEK", label: "Specific Week" },
  { value: "SPECIFIC_MONTH", label: "Specific Month" },
  { value: "ALL", label: "All Sessions" },
];

type SearchParamRecord = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  if (!value) return "";
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function resolveFilter(searchParams: SearchParamRecord): DoctorBookingsFilter {
  const periodValue = first(searchParams.period);
  const statusValue = first(searchParams.status);
  const period = PERIOD_OPTIONS.some((item) => item.value === periodValue)
    ? (periodValue as DoctorBookingPeriod)
    : "THIS_WEEK";

  return {
    period,
    day: first(searchParams.day),
    week: first(searchParams.week),
    month: first(searchParams.month),
    patientQuery: first(searchParams.patient),
    status:
      statusValue === "ALL" ||
      statusValue === "BOOKED" ||
      statusValue === "CONFIRMED" ||
      statusValue === "COMPLETED" ||
      statusValue === "CANCELLED"
        ? statusValue
        : "ALL",
  };
}

export async function DoctorBookingsScreen({
  user,
  searchParams,
}: {
  user: AuthenticatedUser;
  searchParams: SearchParamRecord;
}) {
  const filter = resolveFilter(searchParams);
  const rows = await getDoctorBookingsList(user, filter);

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
      <Frame className="w-full">
        <FramePanel className="space-y-4 p-5">

          <form className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Period</span>
              <Select defaultValue={filter.period} name="period">
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" position="popper">
                {PERIOD_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                    {item.label}
                    </SelectItem>
                ))}
                </SelectContent>
              </Select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Specific Day</span>
              <Input defaultValue={filter.day ?? ""} name="day" type="date" />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Specific Week</span>
              <Input defaultValue={filter.week ?? ""} name="week" type="week" />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Specific Month</span>
              <Input defaultValue={filter.month ?? ""} name="month" type="month" />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Status</span>
              <Select defaultValue={filter.status ?? "ALL"} name="status">
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" position="popper">
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="BOOKED">BOOKED</SelectItem>
                  <SelectItem value="CONFIRMED">CONFIRMED</SelectItem>
                  <SelectItem value="COMPLETED">COMPLETED</SelectItem>
                  <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Patient</span>
              <Input
                defaultValue={filter.patientQuery ?? ""}
                name="patient"
                placeholder="Name or email"
              />
            </label>

            <div className="col-span-full flex items-center gap-2 pt-1">
              <Button size="sm" type="submit">
                Apply Filters
              </Button>
              <Button asChild size="sm" type="button" variant="outline">
                <Link href="/dashboard/doctor/bookings">Reset</Link>
              </Button>
            </div>
          </form>
        </FramePanel>
      </Frame>

      <Frame className="w-full">
          <DoctorBookingsTable appointments={rows} />
      </Frame>
    </div>
  );
}
