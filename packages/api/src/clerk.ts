/**
 * Clerk Backend API helpers — email OTP via Clerk's email_code verification.
 *
 *   ensureUser(email) → { userId, emailAddressId }   (create if missing)
 *   prepareVerification(emailAddressId) → verificationId
 *   attemptVerification(emailAddressId, verificationId, code) → boolean
 *
 * Clerk handles all email deliverability (no DKIM, no SMTP, no Resend key).
 * When CLERK_SECRET_KEY is unset the app falls back to its own dev-mode flow
 * (auth_codes table + console.log / Resend) — see auth.ts.
 */

const BASE = "https://api.clerk.com/v1";

function headers(): Record<string, string> {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function clerkFetch(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: headers(),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "errors" in data
        ? (data as { errors: Array<{ message: string }> }).errors
            .map((e: { message: string }) => e.message)
            .join("; ")
        : `${res.status} ${res.statusText}`;
    throw new Error(`clerk: ${path} — ${msg}`);
  }
  return data;
}

export interface ClerkUser {
  id: string;
  email_addresses: Array<{
    id: string;
    email_address: string;
    verification: { status: string; id?: string } | null;
  }>;
}

/**
 * Find a user by email, or create them. Returns the user id and the email
 * address id (used for prepare/attempt verification).
 */
export async function ensureUser(
  email: string,
): Promise<{ userId: string; emailAddressId: string }> {
  // 1. Look up by email. NOTE: list endpoints return a BARE array, not {data}.
  const list = (await clerkFetch(
    "GET",
    `/users?email_address=${encodeURIComponent(email)}`,
  )) as ClerkUser[];
  let user: ClerkUser;

  if (Array.isArray(list) && list.length > 0) {
    user = list[0];
  } else {
    // 2. Create. Clerk instances commonly require a password — the fanaa
    // sign-in is email-code only, so we hand Clerk a random throwaway
    // password and skip both the strength and the requirement checks.
    const rand = crypto.getRandomValues(new Uint8Array(16));
    const password = Array.from(rand, (b) => b.toString(16).padStart(2, "0")).join("");
    user = (await clerkFetch("POST", "/users", {
      email_address: [email],
      password,
      skip_password_checks: true,
      skip_password_requirement: true,
    })) as ClerkUser;
  }

  const addr = user.email_addresses?.find(
    (a) => a.email_address === email,
  ) ?? user.email_addresses?.[0];
  if (!addr) {
    throw new Error(
      `clerk: user ${user.id} has no email address for ${email}`,
    );
  }

  return { userId: user.id, emailAddressId: addr.id };
}

/**
 * Send a 6-digit verification code to the user's email. Returns the
 * verification id the client must supply with the code.
 */
export async function prepareVerification(
  emailAddressId: string,
): Promise<string> {
  const res = (await clerkFetch(
    "POST",
    `/email_addresses/${emailAddressId}/prepare_verification`,
  )) as {
    verification: { id: string; status: string };
  };

  if (
    !res.verification ||
    !res.verification.id
  ) {
    throw new Error("clerk: prepare_verification returned no verification id");
  }
  return res.verification.id;
}

/**
 * Verify a one-time code. The email address is marked as verified on
 * success (side-effect in Clerk). Returns true if the code is correct
 * and the verification transitions to "verified".
 */
export async function attemptVerification(
  emailAddressId: string,
  verificationId: string,
  code: string,
): Promise<boolean> {
  const res = (await clerkFetch(
    "POST",
    `/email_addresses/${emailAddressId}/attempt_verification`,
    { verification_id: verificationId, code },
  )) as {
    verification: { status: string };
  };

  return res.verification?.status === "verified";
}