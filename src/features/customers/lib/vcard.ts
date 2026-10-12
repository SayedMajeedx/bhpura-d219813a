export function parseVCard(
  vcardText: string,
): Array<{ name: string; phone: string | null; email: string | null }> {
  const contacts: Array<{ name: string; phone: string | null; email: string | null }> = [];
  const blocks = vcardText.split("BEGIN:VCARD");
  for (const block of blocks) {
    if (!block.trim()) continue;
    let name = "";
    let phone: string | null = null;
    let email: string | null = null;

    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith("FN:")) {
        name = cleanLine.slice(3).trim();
      } else if (cleanLine.startsWith("N:") && !name) {
        const parts = cleanLine.slice(2).split(";");
        const first = parts[1] || "";
        const last = parts[0] || "";
        name = `${first} ${last}`.trim();
      } else if (cleanLine.startsWith("TEL")) {
        const parts = cleanLine.split(":");
        const phoneNum = parts[1] ? parts[1].replace(/[^\d+]/g, "").trim() : "";
        if (phoneNum) phone = phoneNum;
      } else if (cleanLine.startsWith("EMAIL")) {
        const parts = cleanLine.split(":");
        const emailAddr = parts[1] ? parts[1].trim() : "";
        if (emailAddr) email = emailAddr;
      }
    }
    if (name || phone || email) {
      contacts.push({ name: name || "WhatsApp Contact", phone, email });
    }
  }
  return contacts;
}
