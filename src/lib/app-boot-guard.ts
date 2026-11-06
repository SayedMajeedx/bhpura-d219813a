/**
 * A way out of a start that never finishes. The installed admin has no reload button or address
 * bar, so a page whose code could not load, or whose first read never came back, left the person
 * stuck until they closed the app by hand. If the app has not settled after a while this offers a
 * reload, in the page's language, and takes the offer away again once it has. It runs before the
 * app's own code, so it needs none of it: this is written into the page's head as it is.
 */
export const BOOT_GUARD_AFTER_MS = 15_000;

export const appBootGuardScript = `(function () {
  var bar = null;
  function settled() {
    var router = window.__TSR_ROUTER__;
    return !!(router && router.state && router.state.status === "idle" && !router.state.isLoading);
  }
  function offer() {
    var ar = document.documentElement.lang !== "en";
    bar = document.createElement("div");
    bar.setAttribute("role", "alert");
    bar.setAttribute("data-boot-guard", "");
    bar.dir = ar ? "rtl" : "ltr";
    bar.style.cssText =
      "position:fixed;inset-inline:0;bottom:0;z-index:2147483647;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:black;color:white;font:14px/1.4 system-ui,sans-serif";
    var text = document.createElement("span");
    text.textContent = ar ? "الصفحة تأخرت في الفتح." : "This page is taking too long to open.";
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = ar ? "إعادة التحميل" : "Reload";
    button.style.cssText =
      "min-height:44px;padding:0 16px;border:0;border-radius:8px;background:white;color:black;font:inherit;font-weight:600;cursor:pointer";
    button.onclick = function () {
      location.reload();
    };
    bar.appendChild(text);
    bar.appendChild(button);
    (document.body || document.documentElement).appendChild(bar);
  }
  setTimeout(function check() {
    if (settled()) {
      if (bar) bar.remove();
      return;
    }
    if (!bar) offer();
    setTimeout(check, 1000);
  }, ${BOOT_GUARD_AFTER_MS});
})();`;
