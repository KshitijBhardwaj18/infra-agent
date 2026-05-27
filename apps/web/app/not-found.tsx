import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 rounded-full bg-muted p-3 w-fit">
          <Compass size={20} className="text-muted-foreground" />
        </div>
        <h1 className="text-base font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block">
          <Button variant="outline" size="sm">
            Back to dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
