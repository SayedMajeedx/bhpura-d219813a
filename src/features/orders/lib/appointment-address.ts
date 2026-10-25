import { bookingPlaceText } from "@/lib/bookings/format";

/**
 * Where a booking's service happens, as its order shows it. A booking keeps its place on itself
 * (`bookings.location`: the area, the venue), and its order points at no saved address, so the
 * order screen said "No address details" under "Event address" for every booking. An address
 * the order does carry wins; otherwise the booking's place is shown as the address.
 */

type AddressLike = {
  formatted_address?: string | null;
  region?: string | null;
  block?: string | null;
  road?: string | null;
  house?: string | null;
  flat?: string | null;
  floor?: string | null;
  landmark?: string | null;
};

const ADDRESS_PARTS = [
  "formatted_address",
  "region",
  "block",
  "road",
  "house",
  "flat",
  "floor",
  "landmark",
] as const;

export function hasAddressDetails(address: AddressLike | null | undefined): boolean {
  return Boolean(address && ADDRESS_PARTS.some((part) => String(address[part] ?? "").trim()));
}

export function appointmentAddress<T extends AddressLike>(
  address: T | null | undefined,
  bookingLocation: unknown,
): T | AddressLike | null | undefined {
  if (hasAddressDetails(address)) return address;
  const place = bookingPlaceText(bookingLocation);
  if (!place) return address;
  return { ...(address ?? {}), formatted_address: place };
}
