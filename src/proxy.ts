export { auth as proxy } from "@/auth";

export const config = {
  // Everything requires a session except: the login page, NextAuth's own
  // routes, the public privacy policy (Meta requires it reachable to
  // publish the app), and the two machine-to-machine endpoints (QStash
  // worker and Meta webhook) which carry their own signature verification.
  matcher: [
    "/((?!login|privacy|api/auth|api/qstash-worker|api/meta-webhook|api/health|_next/static|_next/image|favicon.ico|.*\\.svg).*)",
  ],
};
