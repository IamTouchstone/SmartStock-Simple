// services/expiryParser.ts
// Pure date parser - no OCR, no network, no API key.
// Parses expiry from text already read by Gemini Vision.
// Handles: EXP, BB, B.B., BEST BEFORE, USE BY, DD/MM/YY, DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY, MM/YYYY, MM/YY

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', SEPT: '09', OCT: '10', NOV: '11', DEC: '12',
};

function pad(n: string) { return n.padStart(2, '0'); }
function toISO(day: string, month: string, year: string): string | null {
  const y = year.length === 2 ? `20${year}` : year;
  const m = Number(month); const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(String(m))}-${pad(String(d))}`;
}
function lastDayOfMonth(year: string, month: string): string {
  const y = Number(year.length === 2 ? `20${year}` : year);
  const m = Number(month);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad(String(m))}-${pad(String(last))}`;
}

export type ParsedExpiry = {
  expiryDate: string | null;
  productionDate: string | null;
  batchNo: string | null;
};

export function parseExpiryFromText(ocrText: string): ParsedExpiry {
  if (!ocrText) return { expiryDate: null, productionDate: null, batchNo: null };
  const text = ocrText.toUpperCase().replace(/\s+/g, ' ');
  let expiryDate: string | null = null;
  let productionDate: string | null = null;

  // 1. Full date with EXP/BB label: EXP 26-10-2026, BB 01/11/26, BB 06 NOV 2029
  const full = text.match(/(EXP|EXPIRY|B\.?B\.?|BEST BEFORE|BEST BY|USE BY|USE BEFORE)\D{0,12}(\d{1,2})[\/\-. ](\d{1,2}|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[\/\-. ](\d{2,4})/);
  if (full) {
    const m = MONTHS[full[3]] || pad(full[3]);
    expiryDate = toISO(full[2], m, full[4]);
  }
  // 2. Month-year only: BB 12/2027 -> 31 Dec 2027
  if (!expiryDate) {
    const my = text.match(/(EXP|B\.?B\.?|BEST BEFORE|BEST BY)\D{0,12}(\d{1,2})[\/\-. ](\d{4})/);
    if (my) expiryDate = lastDayOfMonth(my[3], my[2]);
  }
  // 3. MM/YY on EXP/BB line: 12/27
  if (!expiryDate) {
    const myy = text.match(/(EXP|B\.?B\.?)\D{0,12}(\d{1,2})[\/\-.](\d{2})\b/);
    if (myy) expiryDate = lastDayOfMonth(myy[3], myy[2]);
  }
  // 4. Production date - never used as expiry
  const pd = text.match(/(PD|MFD|PRODUCTION|MANUFACTURED)\D{0,12}(\d{1,2})[\/\-. ](\d{1,2}|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[\/\-. ](\d{2,4})/);
  if (pd) {
    const m = MONTHS[pd[3]] || pad(pd[3]);
    productionDate = toISO(pd[2], m, pd[4]);
  }
  const batch = text.match(/(BN|BTH\.?\s*NO\.?|BATCH|LOT)\D{0,5}([A-Z0-9 ]{3,12})/);
  return { expiryDate, productionDate, batchNo: batch ? batch[2].trim() : null };
}

export function parseExpiryDateOnly(text: string): string | null {
  return parseExpiryFromText(text).expiryDate;
}