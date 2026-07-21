export async function writeImpersonationCookie(token: string) {
  const { getEvent, setCookie } = await import(/* @vite-ignore */ "vinxi/http");
  const event = getEvent();
  if (event) {
    setCookie(event, "boutq_impersonation_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });
  }
}

export async function clearImpersonationCookie() {
  const { getEvent, deleteCookie } = await import(/* @vite-ignore */ "vinxi/http");
  const event = getEvent();
  if (event) {
    deleteCookie(event, "boutq_impersonation_token", {
      path: "/",
    });
  }
}

export async function readImpersonationCookie(): Promise<string | undefined> {
  const { getEvent, getCookie } = await import(/* @vite-ignore */ "vinxi/http");
  const event = getEvent();
  if (!event) return undefined;
  return getCookie(event, "boutq_impersonation_token");
}
