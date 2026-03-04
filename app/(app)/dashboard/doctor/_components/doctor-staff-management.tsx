"use client";

import { IconCirclePlusFilled } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createStaffAccountAction,
  setDoctorStaffStatusAction,
} from "@/lib/actions/dashboard-actions";
import { Button } from "@/components/ui/button";
import { Frame, FramePanel } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type StaffRow = {
  id: string;
  staffUserId: string;
  staffName: string;
  staffEmail: string;
  staffPhone: string | null;
  username: string | null;
  staffRole: string;
  isActive: boolean;
  createdAt: Date;
};

type DoctorStaffManagementProps = {
  staff: StaffRow[];
};

type StaffRole = "ADMIN" | "RECEPTION";

function formatDateTime(value: Date | string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function DoctorStaffManagement({ staff }: DoctorStaffManagementProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("RECEPTION");
  const [jobTitle, setJobTitle] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const canSubmit =
    name.trim().length > 0 &&
    username.trim().length > 0 &&
    email.trim().length > 0 &&
    phone.trim().length > 0 &&
    password.length >= 8;

  const sortedStaff = useMemo(
    () =>
      [...staff].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [staff],
  );

  const resetForm = () => {
    setName("");
    setUsername("");
    setEmail("");
    setPhone("");
    setPassword("");
    setStaffRole("RECEPTION");
    setJobTitle("");
    setAddress("");
    setNotes("");
  };

  const validateCreateForm = () => {
    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      toast.error("Staff name is required.");
      return false;
    }
    if (!trimmedUsername) {
      toast.error("Staff username is required.");
      return false;
    }
    if (!trimmedEmail) {
      toast.error("Staff email is required.");
      return false;
    }
    if (!trimmedEmail.includes("@")) {
      toast.error("Please enter a valid staff email.");
      return false;
    }
    if (!trimmedPhone) {
      toast.error("Staff phone is required.");
      return false;
    }
    if (!password || password.length < 8) {
      toast.error("Temporary password must be at least 8 characters.");
      return false;
    }

    return true;
  };

  const handleCreate = () => {
    if (!validateCreateForm()) return;

    startTransition(async () => {
      const result = await createStaffAccountAction({
        name,
        username,
        email,
        phone,
        password,
        staffRole,
        jobTitle,
        address,
        notes,
      });

      if (!result.success) {
        toast.error(result.message ?? "Unable to create staff account.");
        return;
      }

      toast.success("Staff account created and linked to your doctor tenant.");
      resetForm();
      router.refresh();
    });
  };

  const handleRoleChange = (doctorStaffId: string, role: StaffRole) => {
    startTransition(async () => {
      const result = await setDoctorStaffStatusAction({
        doctorStaffId,
        staffRole: role,
      });

      if (!result.success) {
        toast.error(result.message ?? "Unable to update role.");
        return;
      }
      toast.success("Staff role updated.");
      router.refresh();
    });
  };

  const handleActiveToggle = (doctorStaffId: string, isActive: boolean) => {
    startTransition(async () => {
      const result = await setDoctorStaffStatusAction({
        doctorStaffId,
        isActive: !isActive,
      });

      if (!result.success) {
        toast.error(result.message ?? "Unable to update assignment state.");
        return;
      }
      toast.success(isActive ? "Staff deactivated." : "Staff activated.");
      router.refresh();
    });
  };

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
      <Frame>
        <FramePanel className="space-y-4 p-5">
          <h3 className="font-cormorant text-2xl leading-none">Create Staff Account</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="staff-name">Full name</Label>
              <Input
                id="staff-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Staff full name"
                required
                value={name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-username">Username</Label>
              <Input
                id="staff-username"
                onChange={(event) => setUsername(event.target.value)}
                placeholder="staff.username"
                required
                value={username}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="staff@example.com"
                required
                type="email"
                value={email}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-phone">Phone</Label>
              <Input
                id="staff-phone"
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+977 98XXXXXXXX"
                required
                value={phone}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-password">Temporary password</Label>
              <Input
                id="staff-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                required
                type="password"
                value={password}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-role">Assignment role</Label>
              <Select
                onValueChange={(value: StaffRole) => setStaffRole(value)}
                value={staffRole}
              >
                <SelectTrigger id="staff-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECEPTION">RECEPTION</SelectItem>
                  <SelectItem value="ADMIN">ADMIN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-job-title">Job title</Label>
              <Input
                id="staff-job-title"
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder="Reception, Assistant, etc."
                value={jobTitle}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-address">Address</Label>
              <Input
                id="staff-address"
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Office or home address"
                value={address}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="staff-notes">Profile notes</Label>
              <Textarea
                id="staff-notes"
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Extra profile details for this staff member"
                value={notes}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button disabled={isPending || !canSubmit} onClick={handleCreate}>
              <IconCirclePlusFilled />
              <span>Create Staff</span>
            </Button>
          </div>
        </FramePanel>
      </Frame>

      <section className="space-y-2">
        <h3 className="font-cormorant text-2xl leading-none">Doctor Staff</h3>
        <p className="font-at-aero-regular text-muted-foreground text-sm">
          Staff linked to your doctor tenant.
        </p>
        <Frame className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedStaff.length === 0 ? (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground" colSpan={7}>
                    No staff assigned yet.
                  </TableCell>
                </TableRow>
              ) : (
                sortedStaff.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.staffName}</TableCell>
                    <TableCell>{item.username ?? "-"}</TableCell>
                    <TableCell>{item.staffEmail}</TableCell>
                    <TableCell>{item.staffPhone ?? "-"}</TableCell>
                    <TableCell>
                      <Select
                        onValueChange={(value: StaffRole) =>
                          handleRoleChange(item.id, value)
                        }
                        value={
                          item.staffRole === "ADMIN" || item.staffRole === "RECEPTION"
                            ? item.staffRole
                            : "RECEPTION"
                        }
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">ADMIN</SelectItem>
                          <SelectItem value="RECEPTION">RECEPTION</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={item.isActive ? "outline" : "default"}
                        onClick={() => handleActiveToggle(item.id, item.isActive)}
                        disabled={isPending}
                      >
                        {item.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </TableCell>
                    <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Frame>
      </section>
    </div>
  );
}
