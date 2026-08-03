/**
 * ISIN normalization + ISO 6166 mod-10 checksum (shared by quote feed).
 */

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export function normalizeIsin(raw) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "");
}

/** Convert ISIN body (letters→digits) for mod-10 check. */
function expandIsinChars(isin) {
  let out = "";
  for (const ch of isin.slice(0, 11)) {
    if (ch >= "0" && ch <= "9") out += ch;
    else out += String(ch.charCodeAt(0) - 55); // A=10 … Z=35
  }
  return out;
}

/** Luhn-style mod-10 over expanded digits (ISO 6166). */
export function isinChecksumValid(isin) {
  const id = normalizeIsin(isin);
  if (!ISIN_RE.test(id)) return false;
  const digits = expandIsinChars(id);
  let sum = 0;
  let alt = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(id[11]);
}

export function isValidIsin(isin) {
  return isinChecksumValid(isin);
}
