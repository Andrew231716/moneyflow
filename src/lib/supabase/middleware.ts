import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirect } from "@/features/auth/safe-redirect";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || url.includes("YOUR_PROJECT")) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/register");
  const isPublic =
    isAuthPage ||
    pathname === "/offline" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon.svg" ||
    pathname.startsWith("/api/open-banking/callback");

  if (!user && !isPublic) {
    if (pathname.startsWith("/api/")) {
      const response = NextResponse.json({ error: "Devi accedere per usare Open Banking." }, { status: 401 });
      supabaseResponse.cookies.getAll().forEach(c => response.cookies.set(c));
      return response;
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    const response = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach(c => response.cookies.set(c));
    return response;
  }

  if (user && isAuthPage) {
    const redirectUrl = request.nextUrl.clone();
    const destination = safeRedirect(request.nextUrl.searchParams.get("redirect"));
    const response = NextResponse.redirect(new URL(destination, redirectUrl.origin));
    supabaseResponse.cookies.getAll().forEach(c => response.cookies.set(c));
    return response;
  }

  return supabaseResponse;
}
