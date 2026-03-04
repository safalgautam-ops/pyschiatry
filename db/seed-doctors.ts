import type { Connection } from "mysql2/promise";

const ENABLED_BY_DEFAULT = process.env.NODE_ENV !== "production";
const AUTO_SEED = process.env.AUTO_SEED_DOCTORS;

const SHOULD_SEED =
  AUTO_SEED === "true" || (AUTO_SEED !== "false" && ENABLED_BY_DEFAULT);

const SEEDED_DOCTORS = [
  {
    userId: "11111111-1111-4111-8111-111111111111",
    profileId: "31111111-1111-4111-8111-111111111111",
    accountId: "41111111-1111-4111-8111-111111111111",
    sessionId: "51111111-1111-4111-8111-111111111111",
    sessionToken: "seed-session-token-doctor",
    userKeyId: "61111111-1111-4111-8111-111111111111",
    name: "Dr. Primary Admin",
    email: "doctor@gmail.com",
    phone: "+15550000001",
    signature:
      "a111111111111111111111111111111111111111111111111111111111111111",
    timezone: "America/New_York",
    publicKey:
      "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAiR89c7+r4coB7f8FJw3mZGReYV2yXxJq2eMd4y4n5s8=\n-----END PUBLIC KEY-----",
    encryptedPrivateKey:
      '{"version":1,"algorithm":"aes-256-gcm","iv":"c2VlZC1kb2N0b3ItaXY=","tag":"c2VlZC1kb2N0b3ItdGFn","ciphertext":"c2VlZC1lbmNyeXB0ZWQtcHJpdmF0ZS1rZXk="}',
    keyFingerprint:
      "f111111111111111111111111111111111111111111111111111111111111111",
    // Password: Doctor@12345
    passwordHash:
      "b1c406923da393964a2039ce51108bf0:c41ef04f2cf51c17cbcf887392c17ceb5deb2f1cb200a6b4feb7a7d97c519e82f067b20faa9707c9e2e4b145c10cc065fb337e154dc168d58bd0b20572dc1446",
  },
  {
    userId: "22222222-2222-4222-8222-222222222222",
    profileId: "32222222-2222-4222-8222-222222222222",
    accountId: "42222222-2222-4222-8222-222222222222",
    sessionId: "52222222-2222-4222-8222-222222222222",
    sessionToken: "seed-session-token-doctor-admin",
    userKeyId: "62222222-2222-4222-8222-222222222222",
    name: "Dr. Admin Secondary",
    email: "doctor.admin@gmail.com",
    phone: "+15550000002",
    signature:
      "b222222222222222222222222222222222222222222222222222222222222222",
    timezone: "America/Los_Angeles",
    publicKey:
      "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAq+miW5hM2u7F8N2QfL+V9wH8r9C6U0mT8C5nPj6x4eA=\n-----END PUBLIC KEY-----",
    encryptedPrivateKey:
      '{"version":1,"algorithm":"aes-256-gcm","iv":"c2VlZC1kb2N0b3ItYWRtaW4taXY=","tag":"c2VlZC1kb2N0b3ItYWRtaW4tdGFn","ciphertext":"c2VlZC1lbmNyeXB0ZWQtcHJpdmF0ZS1rZXk="}',
    keyFingerprint:
      "f222222222222222222222222222222222222222222222222222222222222222",
    // Password: Doctor@12345
    passwordHash:
      "b70ec16c1588b662bd7712dd0e8359a0:1835fc68e17c4f49005bc5379e906cf4bd71c2a32b86d488e235647759cd323f827f5bb9a933009b13aa292e8ce772f4c81d9126694a24d8f95e8aa88174195f",
  },
];

const SCHEDULE_RULES = [
  { id: "71111111-1111-4111-8111-111111111111", doctorUserId: "11111111-1111-4111-8111-111111111111", day: 1 },
  { id: "71111111-1111-4111-8111-111111111112", doctorUserId: "11111111-1111-4111-8111-111111111111", day: 2 },
  { id: "71111111-1111-4111-8111-111111111113", doctorUserId: "11111111-1111-4111-8111-111111111111", day: 3 },
  { id: "71111111-1111-4111-8111-111111111114", doctorUserId: "11111111-1111-4111-8111-111111111111", day: 4 },
  { id: "71111111-1111-4111-8111-111111111115", doctorUserId: "11111111-1111-4111-8111-111111111111", day: 5 },
  { id: "72222222-2222-4222-8222-222222222221", doctorUserId: "22222222-2222-4222-8222-222222222222", day: 1 },
  { id: "72222222-2222-4222-8222-222222222222", doctorUserId: "22222222-2222-4222-8222-222222222222", day: 2 },
  { id: "72222222-2222-4222-8222-222222222223", doctorUserId: "22222222-2222-4222-8222-222222222222", day: 3 },
  { id: "72222222-2222-4222-8222-222222222224", doctorUserId: "22222222-2222-4222-8222-222222222222", day: 4 },
  { id: "72222222-2222-4222-8222-222222222225", doctorUserId: "22222222-2222-4222-8222-222222222222", day: 5 },
];

export async function seedDefaultDoctors(connection: Connection) {
  if (!SHOULD_SEED) return;

  try {
    await connection.beginTransaction();

    for (const doctor of SEEDED_DOCTORS) {
      await connection.execute(
        `
          INSERT INTO user (
            id, name, email, email_verified, image, role, phone, signature, is_active
          ) VALUES (?, ?, ?, 1, NULL, 'DOCTOR', ?, ?, 1)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            email_verified = VALUES(email_verified),
            role = VALUES(role),
            phone = VALUES(phone),
            signature = VALUES(signature),
            is_active = VALUES(is_active)
        `,
        [
          doctor.userId,
          doctor.name,
          doctor.email,
          doctor.phone,
          doctor.signature,
        ],
      );

      await connection.execute(
        `
          INSERT INTO doctor_profile (
            id, user_id, timezone, default_session_minutes, buffer_minutes
          ) VALUES (?, ?, ?, 60, 0)
          ON DUPLICATE KEY UPDATE
            timezone = VALUES(timezone),
            default_session_minutes = VALUES(default_session_minutes),
            buffer_minutes = VALUES(buffer_minutes)
        `,
        [doctor.profileId, doctor.userId, doctor.timezone],
      );

      await connection.execute(
        `
          INSERT INTO account (
            id, account_id, provider_id, user_id, password
          ) VALUES (?, ?, 'credential', ?, ?)
          ON DUPLICATE KEY UPDATE
            account_id = VALUES(account_id),
            provider_id = VALUES(provider_id),
            user_id = VALUES(user_id),
            password = VALUES(password)
        `,
        [doctor.accountId, doctor.email, doctor.userId, doctor.passwordHash],
      );

      await connection.execute(
        `
          INSERT INTO session (
            id, expires_at, token, ip_address, user_agent, user_id
          ) VALUES (
            ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 365 DAY), ?, '127.0.0.1', 'app-startup-seed', ?
          )
          ON DUPLICATE KEY UPDATE
            expires_at = VALUES(expires_at),
            token = VALUES(token),
            ip_address = VALUES(ip_address),
            user_agent = VALUES(user_agent),
            user_id = VALUES(user_id)
        `,
        [doctor.sessionId, doctor.sessionToken, doctor.userId],
      );

      await connection.execute(
        `
          INSERT INTO user_keys (
            id, user_id, key_version, public_key, encrypted_private_key, key_fingerprint, signature, is_active
          ) VALUES (?, ?, 1, ?, ?, ?, ?, 1)
          ON DUPLICATE KEY UPDATE
            public_key = VALUES(public_key),
            encrypted_private_key = VALUES(encrypted_private_key),
            key_fingerprint = VALUES(key_fingerprint),
            signature = VALUES(signature),
            is_active = VALUES(is_active)
        `,
        [
          doctor.userKeyId,
          doctor.userId,
          doctor.publicKey,
          doctor.encryptedPrivateKey,
          doctor.keyFingerprint,
          doctor.signature,
        ],
      );
    }

    for (const rule of SCHEDULE_RULES) {
      await connection.execute(
        `
          INSERT INTO schedule_rules (
            id, doctor_user_id, day_of_week, start_time, end_time
          ) VALUES (?, ?, ?, '09:00', '17:00')
          ON DUPLICATE KEY UPDATE
            start_time = VALUES(start_time),
            end_time = VALUES(end_time)
        `,
        [rule.id, rule.doctorUserId, rule.day],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    const code = (error as { code?: string }).code;

    // During first boot, this can run before migrations are applied.
    if (code === "ER_NO_SUCH_TABLE") return;

    console.error("[db] doctor seed failed", error);
  }
}
