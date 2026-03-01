import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export type OtpType = "sign-in" | "email-verification" | "forget-password";

type VerificationOtpEmailProps = {
  username?: string;
  company?: string;
  otp: string;
  type: OtpType;
  expiresInMinutes: number;
};

function getTitle(type: OtpType) {
  if (type === "sign-in") return "Sign In Verification";
  if (type === "forget-password") return "Password Reset Verification";
  return "Email Verification";
}

export function VerificationOtpEmail({
  username = "there",
  company = "Psychatric",
  otp,
  type,
  expiresInMinutes,
}: VerificationOtpEmailProps) {
  const title = getTitle(type);
  const previewText = `${company} ${title}: ${otp}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-black m-auto font-sans">
          <Container className="mb-10 mx-auto p-5 max-w-[465px]">
            <Section className="mt-10">
              <Heading className="text-2xl text-white font-normal text-center p-0 my-8 mx-0">
                {title} for <strong>{company}</strong>
              </Heading>
            </Section>

            <Text className="text-start text-sm text-white">Hello {username},</Text>
            <Text className="text-start text-sm text-white leading-relaxed">
              Use the verification code below to continue.
            </Text>

            <Section className="text-center mt-[24px] mb-[24px]">
              <Text className="inline-block rounded-md bg-white px-6 py-3 text-2xl font-bold tracking-[0.4em] text-black">
                {otp}
              </Text>
            </Section>

            <Text className="text-start text-sm text-white leading-relaxed">
              This code expires in {expiresInMinutes} minute(s). If you did not
              request this, you can ignore this email.
            </Text>

            <Text className="text-start text-sm text-white mt-8">
              Regards,
              <br />
              {company} Team
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default VerificationOtpEmail;
