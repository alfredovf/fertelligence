import { NextResponse, type NextRequest } from "next/server";

// Filtro rápido: sin cookie de sesión no se entra a las áreas privadas.
// La validación real de la sesión y del rol se hace en el servidor (lib/session.ts).
const PRIVATE = ["/admin", "/docente", "/alumno", "/perfil", "/terminos"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PRIVATE.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !request.cookies.has("fertelligence_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/ingresar";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|api|icon.svg|sw.js|manifest.webmanifest).*)"] };
