"use client";

import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  return (
    <main>
      <h1>Bot Hive</h1>
      <button
        type="button"
        onClick={() =>
          authClient.signIn.social({
            provider: "github",
            callbackURL: "/dashboard",
          })
        }
      >
        Sign in with GitHub
      </button>
    </main>
  );
}
