"use client"

import { IconCirclePlusFilled } from "@tabler/icons-react"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import type { AuthenticatedUser } from "@/lib/auth/session"

function getHeaderTitle(pathname: string) {
  if (pathname.startsWith("/dashboard/doctor/schedule")) return "Doctor Schedule"
  if (pathname.startsWith("/dashboard/doctor/bookings")) return "Doctor Bookings"
  if (pathname.startsWith("/dashboard/doctor/chat")) return "Doctor Chat"
  if (pathname.startsWith("/dashboard/doctor/reports")) return "Doctor Reports"
  if (pathname.startsWith("/dashboard/patient/schedule")) return "Patient Schedule"
  if (pathname.startsWith("/dashboard/patient/chat")) return "Patient Chat"
  if (pathname.startsWith("/dashboard/doctor")) return "Doctor Dashboard"
  if (pathname.startsWith("/dashboard/staff")) return "Staff Dashboard"
  if (pathname.startsWith("/dashboard/patient")) return "Patient Dashboard"
  if (pathname.startsWith("/dashboard/sheduling")) return "Scheduling"
  return "Dashboard"
}

export function SiteHeader({ role }: { role: AuthenticatedUser["role"] }) {
  const pathname = usePathname()
  const title = getHeaderTitle(pathname)
  const showPatientQuickCreate =
    role === "PATIENT" &&
    (pathname === "/dashboard" || pathname === "/dashboard/patient")

  return (
    <header className="bg-background/90 sticky top-0 z-10 flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <h1 className="font-cormorant text-2xl leading-none">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          {showPatientQuickCreate && (
            <Button
              size="sm"
              className="hidden h-7 sm:flex"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("dashboard:quick-create", {
                    detail: { target: "patient-booked-schedule" },
                  }),
                )
              }
            >
              <IconCirclePlusFilled />
              <span>Quick Create</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
