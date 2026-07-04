import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");
  const { error } = await searchParams;

  return (
    <div className="bg-white min-h-[70vh] flex items-center justify-center px-5">
      <div className="text-center max-w-[520px] py-20">
        <h1 className="text-[40px] leading-[1.1] font-semibold">
          Feedback Engine
        </h1>
        <p className="mt-3 text-[21px] text-ink-muted-80 tracking-normal">
          WhatsApp review campaigns for Varistor&rsquo;s Amazon customers.
        </p>
        {error && (
          <p className="mt-6 text-sm text-[#d70015]">
            {error === "AccessDenied"
              ? "That Google account isn't on the Varistor whitelist. Sign in with your company email."
              : "Sign-in failed. Please try again."}
          </p>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
          className="mt-8"
        >
          <button
            type="submit"
            className="press bg-primary text-white rounded-full px-7 py-3.5 text-[18px] font-light cursor-pointer"
          >
            Sign in with Google
          </button>
        </form>
        <p className="mt-6 text-xs text-ink-muted-48">
          Access is restricted to authorized Varistor employees.
        </p>
      </div>
    </div>
  );
}
