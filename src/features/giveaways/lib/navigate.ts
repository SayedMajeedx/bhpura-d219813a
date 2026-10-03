/** Sends the browser to another address (Instagram's consent screen). Its own function so tests can watch it. */
export function goTo(url: string): void {
  window.location.assign(url);
}
