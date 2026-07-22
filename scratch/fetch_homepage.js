async function test() {
  console.log("Fetching HTML of https://boutq.store/pura ...");
  try {
    const res = await fetch("https://boutq.store/pura");
    const html = await res.text();
    console.log("HTML length:", html.length);
    
    // Find all links matching /product/
    const matches = html.match(/\/product\/[a-zA-Z0-9-.]+/g) || [];
    console.log("Found product links in HTML:");
    if (matches.length === 0) {
      console.log("No product links found in HTML.");
    } else {
      Array.from(new Set(matches)).forEach((link) => {
        console.log("- " + link);
      });
    }
  } catch (err) {
    console.error("Error fetching homepage:", err);
  }
}

test();
