import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Corporate SSO: only Google accounts on the company domain (or the
 * explicit ALLOWED_EMAILS whitelist) may sign in. An ex-employee whose
 * account is disabled in Google Workspace loses access automatically.
 */
export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN || "varistor.in")
    .toLowerCase()
    .trim();
  if (domain && normalized.endsWith(`@${domain}`)) return true;
  const extras = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
  return extras.includes(normalized);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: { signIn: "/login" },
  callbacks: {
    signIn({ profile }) {
      return isEmailAllowed(profile?.email);
    },
    authorized({ auth }) {
      return isEmailAllowed(auth?.user?.email);
    },
  },
});
