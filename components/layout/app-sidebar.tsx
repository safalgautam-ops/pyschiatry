"use client";

import * as React from "react";
import Link from "next/link";
import {
  IconCalendarEvent,
  IconClipboardCheck,
  IconDashboard,
  IconHelp,
  IconInnerShadowTop,
  IconSearch,
  IconSettings,
  IconUser,
} from "@tabler/icons-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavMain } from "@/components/layout/nav-main";
import { NavUser } from "@/components/layout/nav-user";
import type { AuthenticatedUser } from "@/lib/auth/session";

import { NavSecondary } from "@/components/layout/nav-secondary";

function getPrimaryDashboardRoute() {
  return "/dashboard";
}

function getRolePanelRoute(role: AuthenticatedUser["role"]) {
  if (role === "DOCTOR") return "/dashboard/doctor";
  if (role === "STAFF") return "/dashboard/staff";
  return "/dashboard/patient";
}

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: AuthenticatedUser }) {
  const primaryRoute = getPrimaryDashboardRoute();
  const rolePanelRoute = getRolePanelRoute(user.role);

  const navMain =
    user.role === "DOCTOR"
      ? [
          {
            title: "Overview",
            url: primaryRoute,
            icon: IconDashboard,
          },
          {
            title: "Schedule",
            url: "/dashboard/doctor/schedule",
            icon: IconCalendarEvent,
          },
          {
            title: "Sessions",
            url: "/dashboard/doctor/bookings",
            icon: IconClipboardCheck,
          },
          {
            title: "Manage Staff",
            url: "/dashboard/doctor/staff",
            icon: IconUser,
          },
        ]
      : user.role === "PATIENT"
        ? [
            {
              title: "Overview",
              url: primaryRoute,
              icon: IconDashboard,
            },
            {
              title: "Schedule",
              url: "/dashboard/patient/schedule",
              icon: IconCalendarEvent,
            },
          ]
      : [
          {
            title: "Overview",
            url: primaryRoute,
            icon: IconDashboard,
          },
          {
            title: `${user.role[0]}${user.role.slice(1).toLowerCase()} Panel`,
            url: rolePanelRoute,
            icon: IconUser,
          },
        ];

  const navSecondary = [
    {
      title: "Settings",
      url: "#",
      icon: IconSettings,
    },
    {
      title: "Get Help",
      url: "#",
      icon: IconHelp,
    },
    {
      title: "Search",
      url: "#",
      icon: IconSearch,
    },
  ];

  return (
    <Sidebar collapsible="none" className="h-auto border-r" {...props}>
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href={primaryRoute}>
                <IconInnerShadowTop className="!size-5" />
                <span className="text-base font-semibold">Precious Physio</span>
              </Link> 
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            avatar: "",
            email: user.email,
            name: user.name,
          }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
