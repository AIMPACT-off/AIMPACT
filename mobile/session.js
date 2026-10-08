const SUPABASE_URL = String(process.env.EXPO_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "");

export const authConfigReady = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

async function request(path, body) {
  if (!authConfigReady) throw new Error("AUTH_PROVIDER_NOT_CONFIGURED");
  const response = await fetch(SUPABASE_URL + path, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.msg || data?.error_description || data?.error || "AUTH_REQUEST_FAILED");
  return data;
}

export async function sendOtp(email) {
  return request("/auth/v1/otp", { email: String(email).trim().toLowerCase(), create_user: true });
}

export async function verifyOtp(email, token) {
  return request("/auth/v1/verify", {
    email: String(email).trim().toLowerCase(),
    token: String(token).trim(),
    type: "email"
  });
}

export function getSessionToken(session) {
  return String(session?.access_token || "");
}
