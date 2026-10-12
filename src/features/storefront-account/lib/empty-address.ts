/** A new address as the form starts it: a home address with nothing filled in. */
export const emptyAddress = () => ({
  label: "Home",
  region: "" as string,
  block: "",
  road: "",
  house: "",
  flat: "",
  floor: "",
  landmark: "",
  delivery_notes: "",
  is_default: false,
});
