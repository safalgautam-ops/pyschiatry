CREATE TABLE `account` (
	`id` varchar(36) NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` timestamp(3),
	`refresh_token_expires_at` timestamp(3),
	`scope` text,
	`password` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(36) NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	`token` varchar(255) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`ip_address` text,
	`user_agent` text,
	`user_id` varchar(36) NOT NULL,
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	`role` varchar(16) NOT NULL DEFAULT 'PATIENT',
	`phone` varchar(32),
	`signature` varchar(128) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(36) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `doctor_profile` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`timezone` varchar(64) NOT NULL,
	`default_session_minutes` int NOT NULL DEFAULT 60,
	`buffer_minutes` int NOT NULL DEFAULT 10,
	CONSTRAINT `doctor_profile_id` PRIMARY KEY(`id`),
	CONSTRAINT `doctor_profile_user_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `patient_profile` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`date_of_birth` date,
	`gender` varchar(32),
	`emergency_contact` varchar(255),
	`notes` text,
	CONSTRAINT `patient_profile_id` PRIMARY KEY(`id`),
	CONSTRAINT `patient_profile_user_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `staff_profile` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`staff_role` varchar(16) NOT NULL,
	CONSTRAINT `staff_profile_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_profile_user_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `user_keys` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`key_version` int NOT NULL,
	`public_key` text NOT NULL,
	`encrypted_private_key` text NOT NULL,
	`key_fingerprint` varchar(128) NOT NULL,
	`signature` varchar(128) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`revoked_at` timestamp(3),
	CONSTRAINT `user_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_keys_unique` UNIQUE(`user_id`,`key_version`)
);
--> statement-breakpoint
CREATE TABLE `appointment_slots` (
	`id` varchar(36) NOT NULL,
	`doctor_user_id` varchar(36) NOT NULL,
	`starts_at` timestamp(3) NOT NULL,
	`ends_at` timestamp(3) NOT NULL,
	`status` varchar(16) NOT NULL,
	`hold_token` varchar(64),
	`hold_expires_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `appointment_slots_id` PRIMARY KEY(`id`),
	CONSTRAINT `slot_unique_time` UNIQUE(`doctor_user_id`,`starts_at`,`ends_at`)
);
--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` varchar(36) NOT NULL,
	`slot_id` varchar(36) NOT NULL,
	`doctor_user_id` varchar(36) NOT NULL,
	`patient_user_id` varchar(36) NOT NULL,
	`status` varchar(16) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`cancelled_at` timestamp(3),
	`cancel_reason` text,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`),
	CONSTRAINT `appointments_slot_id_unique` UNIQUE(`slot_id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_exceptions` (
	`id` varchar(36) NOT NULL,
	`doctor_user_id` varchar(36) NOT NULL,
	`date` date NOT NULL,
	`type` varchar(16) NOT NULL,
	`start_time` varchar(5),
	`end_time` varchar(5),
	`reason` text,
	CONSTRAINT `schedule_exceptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_rules` (
	`id` varchar(36) NOT NULL,
	`doctor_user_id` varchar(36) NOT NULL,
	`day_of_week` int NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	CONSTRAINT `schedule_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_access` (
	`id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`role_at_grant` varchar(16) NOT NULL,
	`can_read` boolean NOT NULL DEFAULT true,
	`can_write` boolean NOT NULL DEFAULT false,
	`granted_by_user_id` varchar(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `document_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `doc_access_unique` UNIQUE(`document_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `document_keyrings` (
	`id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`user_key_version` int NOT NULL,
	`wrapped_dek` text NOT NULL,
	`wrap_algo` varchar(64) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `document_keyrings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` varchar(36) NOT NULL,
	`appointment_id` varchar(36),
	`patient_user_id` varchar(36) NOT NULL,
	`uploaded_by_user_id` varchar(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`original_file_name` varchar(255) NOT NULL,
	`mime_type` varchar(128) NOT NULL,
	`file_size_bytes` int NOT NULL,
	`storage_key` text NOT NULL,
	`content_sha256` varchar(64) NOT NULL,
	`encrypted_algo` varchar(64) NOT NULL,
	`encrypted_iv` text NOT NULL,
	`encrypted_tag` text NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_access_request_items` (
	`id` varchar(36) NOT NULL,
	`request_id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`status` varchar(16) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `report_access_request_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_access_requests` (
	`id` varchar(36) NOT NULL,
	`patient_user_id` varchar(36) NOT NULL,
	`doctor_user_id` varchar(36) NOT NULL,
	`status` varchar(16) NOT NULL,
	`reason` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`resolved_at` timestamp(3),
	`resolved_by_user_id` varchar(36),
	CONSTRAINT `report_access_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_message_batches` (
	`id` varchar(36) NOT NULL,
	`room_id` varchar(36) NOT NULL,
	`batch_key` varchar(128) NOT NULL,
	`message_count` int NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_message_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` varchar(36) NOT NULL,
	`room_id` varchar(36) NOT NULL,
	`sender_user_id` varchar(36) NOT NULL,
	`text` text NOT NULL,
	`created_at` timestamp(3) NOT NULL,
	`client_timestamp` int NOT NULL,
	`delivery_status` varchar(16) NOT NULL DEFAULT 'SENT',
	`reply_to_message_id` varchar(36),
	`metadata` text,
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_participants` (
	`id` varchar(36) NOT NULL,
	`room_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`role` varchar(16) NOT NULL,
	`joined_at` timestamp(3) NOT NULL DEFAULT (now()),
	`left_at` timestamp(3),
	CONSTRAINT `chat_participants_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_participants_unique` UNIQUE(`room_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `chat_rooms` (
	`id` varchar(36) NOT NULL,
	`type` varchar(24) NOT NULL,
	`patient_user_id` varchar(36) NOT NULL,
	`doctor_user_id` varchar(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`last_message_at` timestamp(3),
	CONSTRAINT `chat_rooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `doctor_profile` ADD CONSTRAINT `doctor_profile_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `patient_profile` ADD CONSTRAINT `patient_profile_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_profile` ADD CONSTRAINT `staff_profile_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_keys` ADD CONSTRAINT `user_keys_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointment_slots` ADD CONSTRAINT `appointment_slots_doctor_user_id_user_id_fk` FOREIGN KEY (`doctor_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_slot_id_appointment_slots_id_fk` FOREIGN KEY (`slot_id`) REFERENCES `appointment_slots`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_doctor_user_id_user_id_fk` FOREIGN KEY (`doctor_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_patient_user_id_user_id_fk` FOREIGN KEY (`patient_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_exceptions` ADD CONSTRAINT `schedule_exceptions_doctor_user_id_user_id_fk` FOREIGN KEY (`doctor_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_rules` ADD CONSTRAINT `schedule_rules_doctor_user_id_user_id_fk` FOREIGN KEY (`doctor_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_access` ADD CONSTRAINT `document_access_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_access` ADD CONSTRAINT `document_access_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_access` ADD CONSTRAINT `document_access_granted_by_user_id_user_id_fk` FOREIGN KEY (`granted_by_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_keyrings` ADD CONSTRAINT `document_keyrings_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_keyrings` ADD CONSTRAINT `document_keyrings_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_appointment_id_appointments_id_fk` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_patient_user_id_user_id_fk` FOREIGN KEY (`patient_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_uploaded_by_user_id_user_id_fk` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `report_access_request_items` ADD CONSTRAINT `rar_items_req_fk` FOREIGN KEY (`request_id`) REFERENCES `report_access_requests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `report_access_request_items` ADD CONSTRAINT `rar_items_doc_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `report_access_requests` ADD CONSTRAINT `report_access_requests_patient_user_id_user_id_fk` FOREIGN KEY (`patient_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `report_access_requests` ADD CONSTRAINT `report_access_requests_doctor_user_id_user_id_fk` FOREIGN KEY (`doctor_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `report_access_requests` ADD CONSTRAINT `report_access_requests_resolved_by_user_id_user_id_fk` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_message_batches` ADD CONSTRAINT `chat_message_batches_room_id_chat_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_room_id_chat_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_sender_user_id_user_id_fk` FOREIGN KEY (`sender_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_participants` ADD CONSTRAINT `chat_participants_room_id_chat_rooms_id_fk` FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_participants` ADD CONSTRAINT `chat_participants_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_rooms` ADD CONSTRAINT `chat_rooms_patient_user_id_user_id_fk` FOREIGN KEY (`patient_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_rooms` ADD CONSTRAINT `chat_rooms_doctor_user_id_user_id_fk` FOREIGN KEY (`doctor_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `user_keys_active_idx` ON `user_keys` (`user_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `slots_doctor_status_idx` ON `appointment_slots` (`doctor_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `appointments_doctor_idx` ON `appointments` (`doctor_user_id`);--> statement-breakpoint
CREATE INDEX `appointments_patient_idx` ON `appointments` (`patient_user_id`);--> statement-breakpoint
CREATE INDEX `schedule_exceptions_doctor_date_idx` ON `schedule_exceptions` (`doctor_user_id`,`date`);--> statement-breakpoint
CREATE INDEX `schedule_rules_doctor_idx` ON `schedule_rules` (`doctor_user_id`);--> statement-breakpoint
CREATE INDEX `doc_access_user_idx` ON `document_access` (`user_id`);--> statement-breakpoint
CREATE INDEX `doc_keyrings_doc_idx` ON `document_keyrings` (`document_id`);--> statement-breakpoint
CREATE INDEX `doc_keyrings_user_idx` ON `document_keyrings` (`user_id`);--> statement-breakpoint
CREATE INDEX `docs_patient_idx` ON `documents` (`patient_user_id`);--> statement-breakpoint
CREATE INDEX `docs_appt_idx` ON `documents` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `rar_patient_idx` ON `report_access_requests` (`patient_user_id`);--> statement-breakpoint
CREATE INDEX `rar_doctor_idx` ON `report_access_requests` (`doctor_user_id`);--> statement-breakpoint
CREATE INDEX `rar_status_idx` ON `report_access_requests` (`status`);--> statement-breakpoint
CREATE INDEX `chat_batches_room_idx` ON `chat_message_batches` (`room_id`);--> statement-breakpoint
CREATE INDEX `chat_messages_room_time_idx` ON `chat_messages` (`room_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `chat_participants_user_idx` ON `chat_participants` (`user_id`);--> statement-breakpoint
CREATE INDEX `chat_rooms_patient_doctor_idx` ON `chat_rooms` (`patient_user_id`,`doctor_user_id`);