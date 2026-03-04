-- Seed two doctor accounts for environments where doctor signup is disabled.
-- This script is idempotent and runs during MySQL first init only.

START TRANSACTION;

-- Doctor users
INSERT INTO `user` (
  `id`,
  `name`,
  `email`,
  `email_verified`,
  `image`,
  `role`,
  `phone`,
  `signature`,
  `is_active`
)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'Dr. Primary Admin',
    'doctor@gmail.com',
    1,
    NULL,
    'DOCTOR',
    '+15550000001',
    'a111111111111111111111111111111111111111111111111111111111111111',
    1
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Dr. Admin Secondary',
    'doctor.admin@gmail.com',
    1,
    NULL,
    'DOCTOR',
    '+15550000002',
    'b222222222222222222222222222222222222222222222222222222222222222',
    1
  )
ON DUPLICATE KEY UPDATE
  `id` = VALUES(`id`),
  `name` = VALUES(`name`),
  `email_verified` = VALUES(`email_verified`),
  `role` = VALUES(`role`),
  `phone` = VALUES(`phone`),
  `signature` = VALUES(`signature`),
  `is_active` = VALUES(`is_active`);

-- Doctor profiles
INSERT INTO `doctor_profile` (
  `id`,
  `user_id`,
  `timezone`,
  `default_session_minutes`,
  `buffer_minutes`
)
VALUES
  (
    '31111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'America/New_York',
    60,
    0
  ),
  (
    '32222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    'America/Los_Angeles',
    60,
    0
  )
ON DUPLICATE KEY UPDATE
  `timezone` = VALUES(`timezone`),
  `default_session_minutes` = VALUES(`default_session_minutes`),
  `buffer_minutes` = VALUES(`buffer_minutes`);

-- Credential accounts (password for both: Doctor@12345)
INSERT INTO `account` (
  `id`,
  `account_id`,
  `provider_id`,
  `user_id`,
  `password`
)
VALUES
  (
    '41111111-1111-4111-8111-111111111111',
    'doctor@gmail.com',
    'credential',
    '11111111-1111-4111-8111-111111111111',
    'b1c406923da393964a2039ce51108bf0:c41ef04f2cf51c17cbcf887392c17ceb5deb2f1cb200a6b4feb7a7d97c519e82f067b20faa9707c9e2e4b145c10cc065fb337e154dc168d58bd0b20572dc1446'
  ),
  (
    '42222222-2222-4222-8222-222222222222',
    'doctor.admin@gmail.com',
    'credential',
    '22222222-2222-4222-8222-222222222222',
    'b70ec16c1588b662bd7712dd0e8359a0:1835fc68e17c4f49005bc5379e906cf4bd71c2a32b86d488e235647759cd323f827f5bb9a933009b13aa292e8ce772f4c81d9126694a24d8f95e8aa88174195f'
  )
ON DUPLICATE KEY UPDATE
  `account_id` = VALUES(`account_id`),
  `provider_id` = VALUES(`provider_id`),
  `user_id` = VALUES(`user_id`),
  `password` = VALUES(`password`);

-- Active sessions (useful for seeded testing workflows)
INSERT INTO `session` (
  `id`,
  `expires_at`,
  `token`,
  `ip_address`,
  `user_agent`,
  `user_id`
)
VALUES
  (
    '51111111-1111-4111-8111-111111111111',
    DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 365 DAY),
    'seed-session-token-doctor-alice',
    '127.0.0.1',
    'docker-seed',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    '52222222-2222-4222-8222-222222222222',
    DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 365 DAY),
    'seed-session-token-doctor-bob',
    '127.0.0.1',
    'docker-seed',
    '22222222-2222-4222-8222-222222222222'
  )
ON DUPLICATE KEY UPDATE
  `expires_at` = VALUES(`expires_at`),
  `token` = VALUES(`token`),
  `ip_address` = VALUES(`ip_address`),
  `user_agent` = VALUES(`user_agent`),
  `user_id` = VALUES(`user_id`);

-- Key records (required by encryption layer tables)
INSERT INTO `user_keys` (
  `id`,
  `user_id`,
  `key_version`,
  `public_key`,
  `encrypted_private_key`,
  `key_fingerprint`,
  `signature`,
  `is_active`
)
VALUES
  (
    '61111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    1,
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAiR89c7+r4coB7f8FJw3mZGReYV2yXxJq2eMd4y4n5s8=\n-----END PUBLIC KEY-----',
    '{"version":1,"algorithm":"aes-256-gcm","iv":"c2VlZC1hbGljZS1pdg==","tag":"c2VlZC1hbGljZS10YWc=","ciphertext":"c2VlZC1hbGljZS1lbmNyeXB0ZWQtcHJpdmF0ZS1rZXk="}',
    'f111111111111111111111111111111111111111111111111111111111111111',
    'a111111111111111111111111111111111111111111111111111111111111111',
    1
  ),
  (
    '62222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    1,
    '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAq+miW5hM2u7F8N2QfL+V9wH8r9C6U0mT8C5nPj6x4eA=\n-----END PUBLIC KEY-----',
    '{"version":1,"algorithm":"aes-256-gcm","iv":"c2VlZC1ib2ItaXY=","tag":"c2VlZC1ib2ItdGFn","ciphertext":"c2VlZC1ib2ItZW5jcnlwdGVkLXByaXZhdGUta2V5"}',
    'f222222222222222222222222222222222222222222222222222222222222222',
    'b222222222222222222222222222222222222222222222222222222222222222',
    1
  )
ON DUPLICATE KEY UPDATE
  `public_key` = VALUES(`public_key`),
  `encrypted_private_key` = VALUES(`encrypted_private_key`),
  `key_fingerprint` = VALUES(`key_fingerprint`),
  `signature` = VALUES(`signature`),
  `is_active` = VALUES(`is_active`);

-- Baseline schedule rules (Mon-Fri 09:00-17:00)
INSERT INTO `schedule_rules` (`id`, `doctor_user_id`, `day_of_week`, `start_time`, `end_time`)
VALUES
  ('71111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 1, '09:00', '17:00'),
  ('71111111-1111-4111-8111-111111111112', '11111111-1111-4111-8111-111111111111', 2, '09:00', '17:00'),
  ('71111111-1111-4111-8111-111111111113', '11111111-1111-4111-8111-111111111111', 3, '09:00', '17:00'),
  ('71111111-1111-4111-8111-111111111114', '11111111-1111-4111-8111-111111111111', 4, '09:00', '17:00'),
  ('71111111-1111-4111-8111-111111111115', '11111111-1111-4111-8111-111111111111', 5, '09:00', '17:00'),
  ('72222222-2222-4222-8222-222222222221', '22222222-2222-4222-8222-222222222222', 1, '09:00', '17:00'),
  ('72222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', 2, '09:00', '17:00'),
  ('72222222-2222-4222-8222-222222222223', '22222222-2222-4222-8222-222222222222', 3, '09:00', '17:00'),
  ('72222222-2222-4222-8222-222222222224', '22222222-2222-4222-8222-222222222222', 4, '09:00', '17:00'),
  ('72222222-2222-4222-8222-222222222225', '22222222-2222-4222-8222-222222222222', 5, '09:00', '17:00')
ON DUPLICATE KEY UPDATE
  `start_time` = VALUES(`start_time`),
  `end_time` = VALUES(`end_time`);

COMMIT;
