import { redirect } from "next/navigation";

// Legacy route — the marketing/sign-in content moved to `/`.
// Keep the redirect so any old `/login` links keep working.
export default function LoginPage() {
  redirect("/");
}
