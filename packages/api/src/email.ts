/**
 * Dev-only fallback for when CLERK_SECRET_KEY is absent.
 *
 * Production email verification is delegated to Clerk's email_code OTP
 * (Clerk sends the emails — no SMTP/DKIM/Resend of our own). Without a
 * Clerk key, there is no delivery path, so the code is logged to the server
 * console and the client is told it went to the "dev channel" so the CLI/TUI
 * can surface it for local testing.
 */
export async function sendVerificationCode(
  email: string,
  code: string,
): Promise<"email" | "dev"> {
  console.log(`[dev] verification code for ${email}: ${code}`);
  return "dev";
}
