import { db } from "@/db";
import {
  appointmentSlots,
  appointments,
  doctorPatients,
  doctorStaff,
  documents,
  reportAccessRequests,
  scheduleExceptions,
  staffProfile,
  user,
} from "@/drizzle";
import type { AppRole, AuthenticatedUser } from "@/lib/auth/session";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  like,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import crypto from "node:crypto";

const APPOINTMENT_ACTIVE_STATUSES = ["BOOKED", "CONFIRMED"] as const;
const PATIENT_LINK_ACTIVE_STATUSES = ["ACTIVE"] as const;

export type TenantPatientRow = {
  id: string;
  doctorUserId: string;
  doctorName: string;
  patientUserId: string;
  patientName: string;
  patientEmail: string;
  status: string;
  createdAt: Date;
};

export type TenantStaffRow = {
  id: string;
  doctorUserId: string;
  doctorName: string;
  staffUserId: string;
  staffName: string;
  staffEmail: string;
  staffRole: string;
  isActive: boolean;
  createdAt: Date;
};

export type TenantAppointmentRow = {
  id: string;
  doctorUserId: string;
  patientUserId: string;
  doctorName: string;
  patientName: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
};

export type PatientAppointmentRow = {
  id: string;
  doctorUserId: string;
  doctorName: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
};

export type TenantOpenSlotRow = {
  id: string;
  doctorUserId: string;
  doctorName: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
};

export type PatientAvailableSlotRow = {
  id: string;
  doctorUserId: string;
  doctorName: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
};

export type DashboardSummary = {
  role: AppRole;
  doctorScope: string[];
  isStaffAdmin: boolean;
  currentUserContact: {
    name: string;
    email: string;
    phone: string | null;
  };
  holidayDates: string[];
  patientPackedSlotDates: string[];
  counts: {
    patients: number;
    staff: number;
    appointments: number;
    openSlots: number;
    documents: number;
    pendingRecovery: number;
  };
  tenantPatients: TenantPatientRow[];
  tenantStaff: TenantStaffRow[];
  tenantAppointments: TenantAppointmentRow[];
  tenantOpenSlots: TenantOpenSlotRow[];
  patientAppointments: PatientAppointmentRow[];
  patientAvailableSlots: PatientAvailableSlotRow[];
};

type ScopeDetails = {
  role: AppRole;
  doctorScope: string[];
  isStaffAdmin: boolean;
};

function unique(values: string[]) {
  return [...new Set(values)];
}

function toDateKey(value: Date | string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDoctorInScope(scope: string[], doctorUserId: string) {
  return scope.includes(doctorUserId);
}

async function resolveScope(currentUser: AuthenticatedUser): Promise<ScopeDetails> {
  if (currentUser.role === "DOCTOR") {
    return {
      role: "DOCTOR",
      doctorScope: [currentUser.id],
      isStaffAdmin: false,
    };
  }

  if (currentUser.role === "STAFF") {
    const [profile] = await db
      .select({
        staffRole: staffProfile.staffRole,
      })
      .from(staffProfile)
      .where(eq(staffProfile.userId, currentUser.id))
      .limit(1);

    const staffAssignments = await db
      .select({
        doctorUserId: doctorStaff.doctorUserId,
      })
      .from(doctorStaff)
      .where(
        and(
          eq(doctorStaff.staffUserId, currentUser.id),
          eq(doctorStaff.isActive, true),
        ),
      );

    return {
      role: "STAFF",
      doctorScope: unique(staffAssignments.map((item) => item.doctorUserId)),
      isStaffAdmin: profile?.staffRole === "ADMIN",
    };
  }

  const linkedDoctors = await db
    .select({
      doctorUserId: doctorPatients.doctorUserId,
    })
    .from(doctorPatients)
    .where(
      and(
        eq(doctorPatients.patientUserId, currentUser.id),
        inArray(doctorPatients.status, [...PATIENT_LINK_ACTIVE_STATUSES]),
      ),
    );

  return {
    role: "PATIENT",
    doctorScope: unique(linkedDoctors.map((item) => item.doctorUserId)),
    isStaffAdmin: false,
  };
}

async function getUserNames(userIds: string[]) {
  const distinctIds = unique(userIds);
  if (distinctIds.length === 0) return new Map<string, string>();

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
    })
    .from(user)
    .where(inArray(user.id, distinctIds));

  return new Map(rows.map((item) => [item.id, item.name]));
}

async function ensureUserRole(userId: string, expectedRole: AppRole) {
  const [row] = await db
    .select({
      id: user.id,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!row || row.role !== expectedRole) {
    throw new Error(`Invalid ${expectedRole.toLowerCase()} user id.`);
  }
}

function assertCanManageScope(
  scope: ScopeDetails,
  actorUserId: string,
  doctorUserId: string,
) {
  if (scope.role === "DOCTOR" && actorUserId !== doctorUserId) {
    throw new Error("Doctors can only manage their own tenant.");
  }

  if (scope.role === "STAFF") {
    if (!scope.isStaffAdmin) {
      throw new Error("Only staff admins can manage tenant assignments.");
    }
    if (!isDoctorInScope(scope.doctorScope, doctorUserId)) {
      throw new Error("Staff is not assigned to this doctor tenant.");
    }
    return;
  }

  if (scope.role === "PATIENT") {
    throw new Error("Patients cannot manage tenant assignments.");
  }
}

async function countWithDefault(query: Promise<Array<{ value: number }>>) {
  const [row] = await query;
  return Number(row?.value ?? 0);
}

export async function getDashboardSummary(
  currentUser: AuthenticatedUser,
): Promise<DashboardSummary> {
  const scope = await resolveScope(currentUser);
  const [currentUserRow] = await db
    .select({
      name: user.name,
      email: user.email,
      phone: user.phone,
    })
    .from(user)
    .where(eq(user.id, currentUser.id))
    .limit(1);
  const currentUserContact = {
    name: currentUserRow?.name ?? currentUser.name,
    email: currentUserRow?.email ?? currentUser.email,
    phone: currentUserRow?.phone ?? null,
  };
  const now = new Date();
  const horizon = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 90);
  const holidayWindowStart = new Date(now);
  holidayWindowStart.setDate(holidayWindowStart.getDate() - 45);
  const holidayWindowEnd = new Date(now);
  holidayWindowEnd.setDate(holidayWindowEnd.getDate() + 420);

  const patientAppointments =
    currentUser.role === "PATIENT"
      ? await db
          .select({
            id: appointments.id,
            doctorUserId: appointments.doctorUserId,
            doctorName: user.name,
            status: appointments.status,
            startsAt: appointmentSlots.startsAt,
            endsAt: appointmentSlots.endsAt,
          })
          .from(appointments)
          .innerJoin(appointmentSlots, eq(appointments.slotId, appointmentSlots.id))
          .innerJoin(user, eq(appointments.doctorUserId, user.id))
          .where(
            and(
              eq(appointments.patientUserId, currentUser.id),
              ne(appointments.status, "CANCELLED"),
            ),
          )
          .orderBy(desc(appointmentSlots.startsAt))
          .limit(120)
      : [];

  const patientAvailableSlots =
    currentUser.role === "PATIENT"
      ? await db
          .select({
            id: appointmentSlots.id,
            doctorUserId: appointmentSlots.doctorUserId,
            doctorName: user.name,
            status: appointmentSlots.status,
            startsAt: appointmentSlots.startsAt,
            endsAt: appointmentSlots.endsAt,
          })
          .from(appointmentSlots)
          .innerJoin(user, eq(appointmentSlots.doctorUserId, user.id))
          .where(
            and(
              eq(appointmentSlots.status, "OPEN"),
              gte(appointmentSlots.startsAt, now),
              lte(appointmentSlots.startsAt, horizon),
            ),
          )
          .orderBy(asc(appointmentSlots.startsAt))
          .limit(200)
      : [];

  const patientVisibleDoctorIds =
    currentUser.role === "PATIENT"
      ? unique([
          ...scope.doctorScope,
          ...patientAppointments.map((row) => row.doctorUserId),
          ...patientAvailableSlots.map((row) => row.doctorUserId),
        ])
      : [];

  const holidayDoctorScope =
    currentUser.role === "PATIENT" && patientVisibleDoctorIds.length > 0
      ? patientVisibleDoctorIds
      : scope.doctorScope;

  const holidayDatesRows =
    holidayDoctorScope.length > 0
      ? await db
          .select({
            date: scheduleExceptions.date,
          })
          .from(scheduleExceptions)
          .where(
            and(
              inArray(scheduleExceptions.doctorUserId, holidayDoctorScope),
              eq(scheduleExceptions.type, "OFF"),
              gte(scheduleExceptions.date, holidayWindowStart),
              lte(scheduleExceptions.date, holidayWindowEnd),
            ),
          )
          .orderBy(asc(scheduleExceptions.date))
          .limit(600)
      : [];

  const holidayDates = unique(holidayDatesRows.map((row) => toDateKey(row.date))).sort();

  if (scope.doctorScope.length === 0 && currentUser.role !== "PATIENT") {
    return {
      role: currentUser.role,
      doctorScope: [],
      isStaffAdmin: scope.isStaffAdmin,
      currentUserContact,
      holidayDates,
      patientPackedSlotDates: [],
      counts: {
        patients: 0,
        staff: 0,
        appointments: 0,
        openSlots: 0,
        documents: 0,
        pendingRecovery: 0,
      },
      tenantPatients: [],
      tenantStaff: [],
      tenantAppointments: [],
      tenantOpenSlots: [],
      patientAppointments,
      patientAvailableSlots,
    };
  }

  const tenantPatients =
    scope.doctorScope.length > 0
      ? await db
          .select({
            id: doctorPatients.id,
            doctorUserId: doctorPatients.doctorUserId,
            patientUserId: doctorPatients.patientUserId,
            patientName: user.name,
            patientEmail: user.email,
            status: doctorPatients.status,
            createdAt: doctorPatients.createdAt,
          })
          .from(doctorPatients)
          .innerJoin(user, eq(doctorPatients.patientUserId, user.id))
          .where(inArray(doctorPatients.doctorUserId, scope.doctorScope))
          .orderBy(desc(doctorPatients.createdAt))
          .limit(20)
      : [];

  const doctorNameById = await getUserNames(
    tenantPatients.map((item) => item.doctorUserId),
  );

  const tenantPatientsWithDoctorName: TenantPatientRow[] = tenantPatients.map(
    (item) => ({
      ...item,
      doctorName: doctorNameById.get(item.doctorUserId) ?? "Unknown doctor",
    }),
  );

  const tenantStaffRows =
    scope.doctorScope.length > 0
      ? await db
          .select({
            id: doctorStaff.id,
            doctorUserId: doctorStaff.doctorUserId,
            staffUserId: doctorStaff.staffUserId,
            staffName: user.name,
            staffEmail: user.email,
            staffRole: doctorStaff.staffRole,
            isActive: doctorStaff.isActive,
            createdAt: doctorStaff.createdAt,
          })
          .from(doctorStaff)
          .innerJoin(user, eq(doctorStaff.staffUserId, user.id))
          .where(inArray(doctorStaff.doctorUserId, scope.doctorScope))
          .orderBy(desc(doctorStaff.createdAt))
          .limit(20)
      : [];

  const staffDoctorNameById = await getUserNames(
    tenantStaffRows.map((item) => item.doctorUserId),
  );

  const tenantStaffWithDoctorName: TenantStaffRow[] = tenantStaffRows.map(
    (item) => ({
      ...item,
      doctorName:
        staffDoctorNameById.get(item.doctorUserId) ?? "Unknown doctor",
    }),
  );

  const tenantAppointmentsRows =
    scope.doctorScope.length > 0
      ? await db
          .select({
            id: appointments.id,
            doctorUserId: appointments.doctorUserId,
            patientUserId: appointments.patientUserId,
            patientName: user.name,
            status: appointments.status,
            startsAt: appointmentSlots.startsAt,
            endsAt: appointmentSlots.endsAt,
          })
          .from(appointments)
          .innerJoin(appointmentSlots, eq(appointments.slotId, appointmentSlots.id))
          .innerJoin(user, eq(appointments.patientUserId, user.id))
          .where(
            and(
              inArray(appointments.doctorUserId, scope.doctorScope),
              ne(appointments.status, "CANCELLED"),
            ),
          )
          .orderBy(desc(appointmentSlots.startsAt))
          .limit(200)
      : [];

  const apptDoctorNameById = await getUserNames(
    tenantAppointmentsRows.map((item) => item.doctorUserId),
  );

  const tenantAppointments: TenantAppointmentRow[] = tenantAppointmentsRows.map(
    (item) => ({
      ...item,
      doctorName: apptDoctorNameById.get(item.doctorUserId) ?? "Unknown doctor",
    }),
  );

  const tenantOpenSlots =
    scope.doctorScope.length > 0
      ? await db
          .select({
            id: appointmentSlots.id,
            doctorUserId: appointmentSlots.doctorUserId,
            doctorName: user.name,
            status: appointmentSlots.status,
            startsAt: appointmentSlots.startsAt,
            endsAt: appointmentSlots.endsAt,
          })
          .from(appointmentSlots)
          .innerJoin(user, eq(appointmentSlots.doctorUserId, user.id))
          .where(
            and(
              inArray(appointmentSlots.doctorUserId, scope.doctorScope),
              eq(appointmentSlots.status, "OPEN"),
              gte(appointmentSlots.startsAt, now),
              lte(appointmentSlots.startsAt, horizon),
            ),
          )
          .orderBy(asc(appointmentSlots.startsAt))
          .limit(250)
      : [];

  const patientPackedSlotDates =
    currentUser.role === "PATIENT" && patientVisibleDoctorIds.length > 0
      ? await (async () => {
          const dayState = new Map<string, { hasAny: boolean; hasOpen: boolean }>();
          const rows = await db
            .select({
              startsAt: appointmentSlots.startsAt,
              status: appointmentSlots.status,
            })
            .from(appointmentSlots)
            .where(
              and(
                inArray(appointmentSlots.doctorUserId, patientVisibleDoctorIds),
                gte(appointmentSlots.startsAt, now),
                lte(appointmentSlots.startsAt, horizon),
              ),
            );

          for (const row of rows) {
            const dateKey = toDateKey(row.startsAt);
            const prev = dayState.get(dateKey) ?? {
              hasAny: false,
              hasOpen: false,
            };
            prev.hasAny = true;
            if (row.status === "OPEN") prev.hasOpen = true;
            dayState.set(dateKey, prev);
          }

          return [...dayState.entries()]
            .filter(([, value]) => value.hasAny && !value.hasOpen)
            .map(([dateKey]) => dateKey)
            .sort();
        })()
      : [];

  const patientsCount =
    scope.doctorScope.length > 0
      ? await countWithDefault(
          db
            .select({
              value: sql<number>`count(distinct ${doctorPatients.patientUserId})`,
            })
            .from(doctorPatients)
            .where(
              and(
                inArray(doctorPatients.doctorUserId, scope.doctorScope),
                inArray(doctorPatients.status, [...PATIENT_LINK_ACTIVE_STATUSES]),
              ),
            ),
        )
      : currentUser.role === "PATIENT"
        ? 1
        : 0;

  const staffCount =
    scope.doctorScope.length > 0
      ? await countWithDefault(
          db
            .select({
              value: sql<number>`count(distinct ${doctorStaff.staffUserId})`,
            })
            .from(doctorStaff)
            .where(
              and(
                inArray(doctorStaff.doctorUserId, scope.doctorScope),
                eq(doctorStaff.isActive, true),
              ),
            ),
        )
      : 0;

  const appointmentsCount =
    currentUser.role === "PATIENT"
      ? await countWithDefault(
          db
            .select({ value: sql<number>`count(*)` })
            .from(appointments)
            .where(
              and(
                eq(appointments.patientUserId, currentUser.id),
                inArray(appointments.status, [...APPOINTMENT_ACTIVE_STATUSES]),
              ),
            ),
        )
      : scope.doctorScope.length > 0
        ? await countWithDefault(
            db
              .select({ value: sql<number>`count(*)` })
              .from(appointments)
              .where(
                and(
                  inArray(appointments.doctorUserId, scope.doctorScope),
                  inArray(appointments.status, [...APPOINTMENT_ACTIVE_STATUSES]),
                ),
              ),
          )
        : 0;

  const openSlotsCount =
    scope.doctorScope.length > 0
      ? await countWithDefault(
          db
            .select({ value: sql<number>`count(*)` })
            .from(appointmentSlots)
            .where(
              and(
                inArray(appointmentSlots.doctorUserId, scope.doctorScope),
                eq(appointmentSlots.status, "OPEN"),
              ),
            ),
        )
      : 0;

  const documentsCount =
    currentUser.role === "PATIENT"
      ? scope.doctorScope.length > 0
        ? await countWithDefault(
            db
              .select({ value: sql<number>`count(*)` })
              .from(documents)
              .where(
                and(
                  eq(documents.patientUserId, currentUser.id),
                  inArray(documents.ownerDoctorUserId, scope.doctorScope),
                ),
              ),
          )
        : 0
      : scope.doctorScope.length > 0
        ? await countWithDefault(
            db
              .select({ value: sql<number>`count(*)` })
              .from(documents)
              .where(inArray(documents.ownerDoctorUserId, scope.doctorScope)),
          )
        : 0;

  const pendingRecoveryCount =
    scope.doctorScope.length > 0
      ? await countWithDefault(
          db
            .select({ value: sql<number>`count(*)` })
            .from(reportAccessRequests)
            .where(
              and(
                inArray(reportAccessRequests.doctorUserId, scope.doctorScope),
                eq(reportAccessRequests.status, "PENDING"),
              ),
            ),
        )
      : 0;

  return {
      role: currentUser.role,
      doctorScope: scope.doctorScope,
      isStaffAdmin: scope.isStaffAdmin,
      currentUserContact,
      holidayDates,
      patientPackedSlotDates,
      counts: {
      patients: patientsCount,
      staff: staffCount,
      appointments: appointmentsCount,
      openSlots: openSlotsCount,
      documents: documentsCount,
      pendingRecovery: pendingRecoveryCount,
    },
    tenantPatients: tenantPatientsWithDoctorName,
    tenantStaff: tenantStaffWithDoctorName,
    tenantAppointments,
    tenantOpenSlots,
    patientAppointments,
    patientAvailableSlots,
  };
}

export async function linkPatientToDoctor(
  currentUser: AuthenticatedUser,
  input: {
    doctorUserId: string;
    patientUserId: string;
  },
) {
  const scope = await resolveScope(currentUser);
  assertCanManageScope(scope, currentUser.id, input.doctorUserId);

  await Promise.all([
    ensureUserRole(input.doctorUserId, "DOCTOR"),
    ensureUserRole(input.patientUserId, "PATIENT"),
  ]);

  await db
    .insert(doctorPatients)
    .values({
      id: crypto.randomUUID(),
      doctorUserId: input.doctorUserId,
      patientUserId: input.patientUserId,
      status: "ACTIVE",
      createdAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        status: "ACTIVE",
      },
    });
}

export async function assignStaffToDoctor(
  currentUser: AuthenticatedUser,
  input: {
    doctorUserId: string;
    staffUserId: string;
    staffRole: "ADMIN" | "RECEPTION";
  },
) {
  const scope = await resolveScope(currentUser);
  assertCanManageScope(scope, currentUser.id, input.doctorUserId);

  await Promise.all([
    ensureUserRole(input.doctorUserId, "DOCTOR"),
    ensureUserRole(input.staffUserId, "STAFF"),
  ]);

  await db
    .insert(doctorStaff)
    .values({
      id: crypto.randomUUID(),
      doctorUserId: input.doctorUserId,
      staffUserId: input.staffUserId,
      staffRole: input.staffRole,
      isActive: true,
      createdAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        staffRole: input.staffRole,
        isActive: true,
      },
    });
}

export async function updateDoctorPatientStatus(
  currentUser: AuthenticatedUser,
  input: {
    doctorPatientId: string;
    status: "ACTIVE" | "BLOCKED" | "ARCHIVED";
  },
) {
  const scope = await resolveScope(currentUser);
  const [link] = await db
    .select({
      id: doctorPatients.id,
      doctorUserId: doctorPatients.doctorUserId,
    })
    .from(doctorPatients)
    .where(eq(doctorPatients.id, input.doctorPatientId))
    .limit(1);

  if (!link) throw new Error("Doctor-patient link not found.");
  assertCanManageScope(scope, currentUser.id, link.doctorUserId);

  await db
    .update(doctorPatients)
    .set({ status: input.status })
    .where(eq(doctorPatients.id, input.doctorPatientId));
}

export async function updateDoctorStaffStatus(
  currentUser: AuthenticatedUser,
  input: {
    doctorStaffId: string;
    isActive?: boolean;
    staffRole?: "ADMIN" | "RECEPTION";
  },
) {
  const scope = await resolveScope(currentUser);
  const [assignment] = await db
    .select({
      id: doctorStaff.id,
      doctorUserId: doctorStaff.doctorUserId,
    })
    .from(doctorStaff)
    .where(eq(doctorStaff.id, input.doctorStaffId))
    .limit(1);

  if (!assignment) throw new Error("Doctor-staff assignment not found.");
  assertCanManageScope(scope, currentUser.id, assignment.doctorUserId);

  await db
    .update(doctorStaff)
    .set({
      ...(typeof input.isActive === "boolean"
        ? { isActive: input.isActive }
        : {}),
      ...(input.staffRole ? { staffRole: input.staffRole } : {}),
    })
    .where(eq(doctorStaff.id, input.doctorStaffId));
}

export async function searchUsersForRole(role: AppRole, query?: string) {
  const whereClause = query
    ? and(
        eq(user.role, role),
        or(like(user.name, `%${query}%`), like(user.email, `%${query}%`)),
      )
    : eq(user.role, role);

  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })
    .from(user)
    .where(whereClause)
    .orderBy(desc(user.createdAt))
    .limit(30);
}

export async function searchUsersForRoleAsActor(
  currentUser: AuthenticatedUser,
  role: AppRole,
  query?: string,
) {
  const scope = await resolveScope(currentUser);
  const canManageAssignments =
    currentUser.role === "DOCTOR" ||
    (currentUser.role === "STAFF" && scope.isStaffAdmin);

  if (!canManageAssignments) {
    throw new Error("You do not have permission to search users.");
  }

  if (scope.doctorScope.length === 0) {
    return [];
  }

  let scopedUserIds: string[] = [];

  if (role === "DOCTOR") {
    scopedUserIds =
      currentUser.role === "DOCTOR" ? [currentUser.id] : [...scope.doctorScope];
  } else if (role === "PATIENT") {
    const rows = await db
      .select({
        userId: doctorPatients.patientUserId,
      })
      .from(doctorPatients)
      .where(
        and(
          inArray(doctorPatients.doctorUserId, scope.doctorScope),
          inArray(doctorPatients.status, [...PATIENT_LINK_ACTIVE_STATUSES]),
        ),
      );
    scopedUserIds = unique(rows.map((item) => item.userId));
  } else if (role === "STAFF") {
    const rows = await db
      .select({
        userId: doctorStaff.staffUserId,
      })
      .from(doctorStaff)
      .where(
        and(
          inArray(doctorStaff.doctorUserId, scope.doctorScope),
          eq(doctorStaff.isActive, true),
        ),
      );
    scopedUserIds = unique(rows.map((item) => item.userId));
  }

  if (scopedUserIds.length === 0) {
    return [];
  }

  const whereClause = query
    ? and(
        eq(user.role, role),
        inArray(user.id, scopedUserIds),
        or(like(user.name, `%${query}%`), like(user.email, `%${query}%`)),
      )
    : and(eq(user.role, role), inArray(user.id, scopedUserIds));

  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })
    .from(user)
    .where(whereClause)
    .orderBy(desc(user.createdAt))
    .limit(30);
}
