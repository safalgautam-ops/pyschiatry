import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export type NotificationEmailDetail = {
  label: string;
  value: string;
};

type TransactionalNotificationEmailProps = {
  previewText: string;
  heading: string;
  greetingName?: string;
  intro: string;
  details?: NotificationEmailDetail[];
  ctaLabel?: string;
  ctaUrl?: string;
  closingText?: string;
  company?: string;
};

export function TransactionalNotificationEmail({
  previewText,
  heading,
  greetingName = "there",
  intro,
  details = [],
  ctaLabel,
  ctaUrl,
  closingText = "If this wasn't expected, please contact support.",
  company = "Psychatric",
}: TransactionalNotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="m-auto bg-black font-sans">
          <Container className="mx-auto mb-10 max-w-[465px] p-5">
            <Section className="mt-6">
              <Heading className="my-8 p-0 text-center font-normal text-2xl text-white">
                {heading}
              </Heading>
            </Section>

            <Text className="text-start text-sm text-white">Hello {greetingName},</Text>
            <Text className="text-start text-sm leading-relaxed text-white">{intro}</Text>

            {details.length > 0 && (
              <Section className="mt-4 rounded-md border border-white/20 px-4 py-3">
                {details.map((detail) => (
                  <Text key={`${detail.label}-${detail.value}`} className="my-1 text-start text-sm text-white">
                    <strong>{detail.label}:</strong> {detail.value}
                  </Text>
                ))}
              </Section>
            )}

            {ctaLabel && ctaUrl && (
              <Section className="my-8 text-center">
                <Button
                  className="rounded-md bg-white px-5 py-2.5 text-center font-semibold text-black text-sm no-underline"
                  href={ctaUrl}
                >
                  {ctaLabel}
                </Button>
              </Section>
            )}

            <Hr className="my-6 border-white/20" />
            <Text className="text-start text-xs text-white/80 leading-relaxed">{closingText}</Text>

            <Text className="mt-6 text-start text-sm text-white">
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

export default TransactionalNotificationEmail;
