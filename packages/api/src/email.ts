import { RESEND_API_KEY, RESEND_FROM } from "./env";

/**
 * Send a verification code. With RESEND_API_KEY set, emails are sent via
 * Resend; without one (local dev), the code is logged to the server console
 * and the client is told it went to the "dev channel" so the CLI/TUI can
 * surface it for testing.
 */
export async function sendVerificationCode(
  email: string,
  code: string,
): Promise<"email" | "dev"> {
  if (RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: email,
        subject: "Fanaa verification code",
        text: `Your Fanaa verification code is ${code}. It expires in 5 minutes.`,
      }),
    });
    if (!res.ok) {
      throw new Error(`resend: ${res.status} ${await res.text()}`);
    }
    return "email";
  }
  console.log(`[dev] verification code for ${email}: ${code}`);
  return "dev";
}
