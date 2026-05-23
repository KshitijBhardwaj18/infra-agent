"use client";

import { Github } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const handleSignIn = async () => {
    await signIn.social({ provider: "github", callbackURL: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <h1 className="mb-2 text-2xl font-bold">Heizen</h1>
        <p className="mb-8 text-sm text-[var(--muted)]">
          Deploy and manage infrastructure on AWS
        </p>
        <Button onClick={handleSignIn} className="w-full">
          <Github size={16} className="mr-2" />
          Sign in with GitHub
        </Button>
      </Card>
    </div>
  );
}
