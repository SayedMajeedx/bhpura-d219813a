import { describe, it, expect } from "vitest";
import { parseCSV } from "../src/lib/csv-parser";

describe("parseCSV", () => {
  it("parses simple CSV data correctly", () => {
    const input = "name,price,stock\nAbaya,45,10\nScarf,12,25";
    const result = parseCSV(input);
    expect(result).toEqual([
      ["name", "price", "stock"],
      ["Abaya", "45", "10"],
      ["Scarf", "12", "25"],
    ]);
  });

  it("handles CRLF windows line endings", () => {
    const input = "col1,col2\r\nval1,val2\r\nval3,val4";
    const result = parseCSV(input);
    expect(result).toEqual([
      ["col1", "col2"],
      ["val1", "val2"],
      ["val3", "val4"],
    ]);
  });

  it("handles commas within quoted fields", () => {
    const input = 'id,title,description\n1,"Silk Abaya, Black","Premium, soft"';
    const result = parseCSV(input);
    expect(result).toEqual([
      ["id", "title", "description"],
      ["1", "Silk Abaya, Black", "Premium, soft"],
    ]);
  });

  it("handles escaped quotes within quoted fields", () => {
    const input = 'id,name\n1,"He said ""Hello"" to us"';
    const result = parseCSV(input);
    expect(result).toEqual([
      ["id", "name"],
      ["1", 'He said "Hello" to us'],
    ]);
  });

  it("handles newlines inside quoted fields", () => {
    const input = 'id,note\n1,"Line one\nLine two"';
    const result = parseCSV(input);
    expect(result).toEqual([
      ["id", "note"],
      ["1", "Line one\nLine two"],
    ]);
  });

  it("filters out completely empty rows and trailing empty lines", () => {
    const input = "\n\nname,phone\n\nFatima,33000000\n   \n\n";
    const result = parseCSV(input);
    expect(result).toEqual([
      ["name", "phone"],
      ["Fatima", "33000000"],
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(parseCSV("")).toEqual([]);
    expect(parseCSV("   \n\n  \r\n  ")).toEqual([]);
  });
});
