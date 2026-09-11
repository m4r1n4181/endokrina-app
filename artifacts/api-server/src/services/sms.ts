/**
 * SMS provider interface — pluggable via SMS_PROVIDER config.
 * Providers: "twilio" | "aws_sns" | "stub"
 * Stub (default) logs OTP to console only — for Stage 0 / development.
 * Real provider is wired in once legal/SMS setup is confirmed.
 */
import { config } from "../lib/config";
import { logger } from "../lib/logger";

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSmsOtp(
  toPhone: string,
  otpCode: string
): Promise<SmsResult> {
  return sendSms(toPhone, `Vaš verifikacioni kod: ${otpCode}. Kod je važeći 10 minuta.`);
}

export async function sendSms(toPhone: string, message: string): Promise<SmsResult> {
  switch (config.SMS_PROVIDER) {
    case "stub":
      logger.warn({ phone: toPhone, message }, "[STUB SMS] Outbound message");
      return { success: true, messageId: "stub" };

    case "twilio":
      return sendViaTwilio(toPhone, message);

    case "aws_sns":
      return sendViaAwsSns(toPhone, message);

    default: {
      const _exhaustive: never = config.SMS_PROVIDER;
      return { success: false, error: `Unknown SMS provider: ${_exhaustive}` };
    }
  }
}

async function sendViaTwilio(toPhone: string, message: string): Promise<SmsResult> {
  if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.SMS_FROM_NUMBER) {
    throw new Error("Twilio config incomplete: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, SMS_FROM_NUMBER required");
  }
  // Lazy-load to avoid requiring Twilio in environments that don't need it
  // Install: pnpm add twilio --filter @workspace/api-server (when activating)
  try {
    const { default: twilio } = await import("twilio" as string);
    const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
    const result = await client.messages.create({
      body: message,
      from: config.SMS_FROM_NUMBER,
      to: toPhone,
    });
    return { success: true, messageId: result.sid };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, toPhone }, "Twilio SMS send failed");
    return { success: false, error };
  }
}

async function sendViaAwsSns(toPhone: string, message: string): Promise<SmsResult> {
  if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS SNS config incomplete: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY required");
  }
  try {
    // Lazy-load — install @aws-sdk/client-sns when activating
    const { SNSClient, PublishCommand } = await import("@aws-sdk/client-sns" as string);
    const sns = new SNSClient({ region: config.AWS_REGION });
    const result = await sns.send(new PublishCommand({ Message: message, PhoneNumber: toPhone }));
    return { success: true, messageId: result.MessageId };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, toPhone }, "AWS SNS SMS send failed");
    return { success: false, error };
  }
}
