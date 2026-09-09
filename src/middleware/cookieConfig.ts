export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "sorasaki_session";

export const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 720); // 30 dias

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_TTL_HOURS * 60 * 60,
  };
}
