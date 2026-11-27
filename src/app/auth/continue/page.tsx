import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { ClerkContinue } from "@/components/auth/ClerkAuth";
import { clerkEnabled } from "@/lib/auth/clerk";
import { getDict } from "@/lib/i18n/server";

export const metadata = { title: "Opening your salon" };

/** Where every Clerk sign-in lands (password, Google, Apple, Microsoft, email code): it opens the salon. */
export default async function ContinueAfterClerk() {
  if (!clerkEnabled) redirect("/login");
  const { lang } = await getDict();
  return (
    <AuthShell title="Welcome" subtitle="Opening your salon's command centre.">
      <ClerkContinue lang={lang} />
    </AuthShell>
  );
}
