import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { auth, signOut } from "@/auth";

export const metadata: Metadata = {
  title: "Varistor Feedback Engine",
  description:
    "WhatsApp feedback campaigns for Varistor's Amazon customers.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <nav className="bg-black text-white h-11 flex items-center sticky top-0 z-50">
          <div className="mx-auto w-full max-w-[1024px] px-5 flex items-center gap-6 text-xs tracking-tight">
            <Link href="/" className="font-semibold text-sm">
              Varistor
            </Link>
            {session?.user && (
              <>
                <Link href="/" className="opacity-80 hover:opacity-100">
                  Dashboard
                </Link>
                <Link
                  href="/campaigns/new"
                  className="opacity-80 hover:opacity-100"
                >
                  New Campaign
                </Link>
                <Link
                  href="/templates"
                  className="opacity-80 hover:opacity-100"
                >
                  Templates
                </Link>
                <span className="ml-auto opacity-60 hidden sm:inline">
                  {session.user.email}
                </span>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button
                    type="submit"
                    className="press bg-ink rounded-sm px-3 py-1.5 text-xs cursor-pointer"
                  >
                    Sign out
                  </button>
                </form>
              </>
            )}
          </div>
        </nav>
        <main className="flex-1">{children}</main>
        <footer className="bg-parchment border-t border-hairline">
          <div className="mx-auto max-w-[1024px] px-5 py-6 text-xs text-ink-muted-48">
            Varistor WhatsApp Feedback Engine · Internal tool — messages are
            sent via the Meta WhatsApp Business API.
          </div>
        </footer>
      </body>
    </html>
  );
}
