let getEventFn: any = null;
let setCookieFn: any = null;
let deleteCookieFn: any = null;
let getCookieFn: any = null;

import(/* @vite-ignore */ "vinxi/http")
  .then((m) => {
    getEventFn = m.getEvent;
    setCookieFn = m.setCookie;
    deleteCookieFn = m.deleteCookie;
    getCookieFn = m.getCookie;
  })
  .catch(() => {});

export function writeImpersonationCookie(token: string) {
  if (getEventFn && setCookieFn) {
    const event = getEventFn();
    if (event) {
      setCookieFn(event, "boutq_impersonation_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
      });
    }
  }
}

export function clearImpersonationCookie() {
  if (getEventFn && deleteCookieFn) {
    const event = getEventFn();
    if (event) {
      deleteCookieFn(event, "boutq_impersonation_token", {
        path: "/",
      });
    }
  }
}

export function readImpersonationCookie(): string | undefined {
  if (getEventFn && getCookieFn) {
    const event = getEventFn();
    if (!event) return undefined;
    return getCookieFn(event, "boutq_impersonation_token");
  }
  return undefined;
}
