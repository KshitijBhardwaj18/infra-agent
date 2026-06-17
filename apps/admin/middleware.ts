import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];
const ALWAYS_ALLOWED = ["/_next", "/favicon.ico"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (ALWAYS_ALLOWED.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const sessionCookie =
    request.cookies.get("__Secure-better-auth.session_token") ??
    request.cookies.get("better-auth.session_token");

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (sessionCookie?.value) {
      const verified = await verifyAdmin(request, sessionCookie);
      if (verified) {
        return NextResponse.redirect(new URL("/users", request.url));
      }
    }
    return NextResponse.next();
  }

  if (!sessionCookie?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const verified = await verifyAdmin(request, sessionCookie);
  if (!verified) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

async function verifyAdmin(
  request: NextRequest,
  cookie: { name: string; value: string },
): Promise<boolean> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  try {
    // NOT /api/auth/me-with-role — that prefix is owned by better-auth's
    // catch-all handler on the API and would never reach our Nest controller.
    const res = await fetch(`${apiUrl}/api/me-with-role`, {
      headers: { cookie: `${cookie.name}=${cookie.value}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { systemRole?: string };
    return data.systemRole === "ADMIN";
  } catch {
    return true;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
