"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { completeStaffOnboardingAction } from "@/lib/actions/dashboard-actions";
import { Button } from "@/components/ui/button";
import { Frame, FramePanel } from "@/components/ui/frame";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type StaffOnboardingScreenProps = {
  profile: {
    name: string;
    email: string;
    phone: string;
    username: string;
    staffRole: string;
    jobTitle: string;
    address: string;
    notes: string;
  };
};

export function StaffOnboardingScreen({ profile }: StaffOnboardingScreenProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [username, setUsername] = useState(profile.username);
  const [jobTitle, setJobTitle] = useState(profile.jobTitle);
  const [address, setAddress] = useState(profile.address);
  const [notes, setNotes] = useState(profile.notes);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = () => {
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirm password do not match.");
      return;
    }

    startTransition(async () => {
      const result = await completeStaffOnboardingAction({
        currentPassword,
        newPassword,
        name,
        phone,
        username,
        jobTitle,
        address,
        notes,
      });

      if (!result.success) {
        toast.error(result.message ?? "Unable to complete onboarding.");
        return;
      }

      toast.success("Profile updated. Continue to your dashboard.");
      router.refresh();
    });
  };

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 p-4 md:p-6">
      <Frame className="mx-auto w-full max-w-3xl">
        <FramePanel className="space-y-5 p-6">
          <div>
            <h2 className="font-cormorant text-3xl leading-none">
              Complete Staff Setup
            </h2>
            <p className="font-at-aero-regular text-muted-foreground mt-1 text-sm">
              Update your password and verify your profile before continuing.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="staff-onboard-name">Full name</Label>
              <Input
                id="staff-onboard-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-onboard-email">Email</Label>
              <Input id="staff-onboard-email" readOnly value={profile.email} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-onboard-phone">Phone</Label>
              <Input
                id="staff-onboard-phone"
                onChange={(event) => setPhone(event.target.value)}
                value={phone}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-onboard-username">Username</Label>
              <Input
                id="staff-onboard-username"
                onChange={(event) => setUsername(event.target.value)}
                value={username}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-onboard-role">Role</Label>
              <Input id="staff-onboard-role" readOnly value={profile.staffRole} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-onboard-title">Job title</Label>
              <Input
                id="staff-onboard-title"
                onChange={(event) => setJobTitle(event.target.value)}
                value={jobTitle}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="staff-onboard-address">Address</Label>
              <Input
                id="staff-onboard-address"
                onChange={(event) => setAddress(event.target.value)}
                value={address}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="staff-onboard-notes">Notes</Label>
              <Textarea
                id="staff-onboard-notes"
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </div>
          </div>

          <div className="grid gap-4 border-t pt-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="staff-onboard-current-password">
                Current password
              </Label>
              <Input
                id="staff-onboard-current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
                type="password"
                value={currentPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-onboard-new-password">New password</Label>
              <Input
                id="staff-onboard-new-password"
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                value={newPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-onboard-confirm-password">
                Confirm new password
              </Label>
              <Input
                id="staff-onboard-confirm-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                value={confirmPassword}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button disabled={isPending} onClick={handleSubmit}>
              Save and Continue
            </Button>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}
