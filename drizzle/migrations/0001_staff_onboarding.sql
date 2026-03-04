ALTER TABLE `staff_profile`
  ADD `username` varchar(64),
  ADD `job_title` varchar(128),
  ADD `address` varchar(255),
  ADD `must_change_password` boolean NOT NULL DEFAULT false,
  ADD `profile_completed` boolean NOT NULL DEFAULT true,
  ADD `created_by_doctor_user_id` varchar(36);
--> statement-breakpoint

CREATE UNIQUE INDEX `staff_profile_username_unique` ON `staff_profile` (`username`);
--> statement-breakpoint

CREATE INDEX `staff_profile_onboarding_idx` ON `staff_profile` (`must_change_password`,`profile_completed`);
--> statement-breakpoint

ALTER TABLE `staff_profile`
  ADD CONSTRAINT `staff_profile_created_by_doctor_user_id_user_id_fk`
  FOREIGN KEY (`created_by_doctor_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;
