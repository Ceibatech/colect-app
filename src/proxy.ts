import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { ROLE_ONLY_ROUTE_PREFIXES } from "@/lib/permissions/constants";

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Les routes API gèrent elles-mêmes leur authentification
  // (requireApiUser/requireApiPermission) et répondent en JSON avec le bon
  // code HTTP (401/403) — un redirect HTML vers /login n'a pas de sens pour
  // un client `fetch()` ou un consommateur externe de l'API (§61).
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Non authentifié sur une route protégée -> /login
  if (!session && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authentifié qui retourne sur /login -> /dashboard
  if (session && isPublicPath) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Contrôle grossier par rôle sur certains préfixes de route.
  // Rappel : ceci ne remplace pas le contrôle fin par permission fait dans
  // chaque Server Action / Route Handler (cahier des charges §60).
  if (session) {
    const restriction = ROLE_ONLY_ROUTE_PREFIXES.find((r) => pathname.startsWith(r.prefix));
    if (restriction && !restriction.roles.includes(session.roleCode)) {
      return NextResponse.redirect(new URL("/dashboard?error=forbidden", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf :
     * - fichiers statiques Next.js (_next/static, _next/image)
     * - favicon.ico
     * - fichiers publics (extension présente, ex. .svg, .png)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
