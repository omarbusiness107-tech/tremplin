import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_LOCALE, LOCALES, matchLocale } from "@/i18n/config";
import { updateSession } from "@/lib/supabase/proxy";

const LOCALE_COOKIE = "tremplin-locale";

/**
 * Next 16's `proxy` convention (what earlier versions called middleware).
 *
 * Two jobs: keep the Supabase session cookie fresh, and make sure every
 * page URL carries a locale.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasLocale = LOCALES.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (!hasLocale) {
    // A returning visitor's own choice beats their browser's header,
    // which is often the OS default rather than anything they picked.
    const remembered = request.cookies.get(LOCALE_COOKIE)?.value;
    const locale =
      remembered && LOCALES.includes(remembered as (typeof LOCALES)[number])
        ? remembered
        : matchLocale(request.headers.get("accept-language"));

    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }

  const response = await updateSession(request);

  // Remember the locale that is actually being served, so the next visit
  // to a bare URL lands in the same language.
  const current = pathname.split("/")[1];
  if (current && response.cookies.get(LOCALE_COOKIE)?.value !== current) {
    response.cookies.set(LOCALE_COOKIE, current, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, the auth route handlers (which are
    // locale-independent and must not be redirected mid-OAuth), and
    // image files.
    "/((?!_next/static|_next/image|auth/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

export { DEFAULT_LOCALE };
