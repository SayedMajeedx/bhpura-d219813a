import { Link } from "@tanstack/react-router";
import { type AnchorHTMLAttributes } from "react";

/** A storefront link that stays in the app for internal paths and opens external URLs normally. */
export function StorefrontLink({
  href,
  ...props
}: { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const value = String(href || "#products").trim();
  const internalAbsolute =
    /^https?:\/\/(?:www\.)?(?:[a-zA-Z0-9-]+\.)?(?:boutq\.store|workers\.dev)(?:\/|$)/i.test(value);
  const destination = internalAbsolute ? value.replace(/^https?:\/\/[^/]+/i, "") || "/" : value;
  const external = /^(?:https?:)?\/\//i.test(destination) || /^(?:mailto|tel):/i.test(destination);
  if (external || destination.startsWith("#")) return <a href={destination} {...props} />;
  return <Link to={destination as any} preload="intent" {...(props as any)} />;
}
