// services/voiceParser.ts
// Parses spoken transcription into fields for Add Product / Order / Booking.
// Supports English and Nigerian Pidgin variations.

export interface VoiceParseResult {
  name?: string;
  qty?: number;
  price?: number;
  expiryDate?: string; // YYYY-MM-DD (first day of month)
}

export const parseVoiceText = (text: string): VoiceParseResult => {
  const result: VoiceParseResult = {};
  if (!text) return result;

  // Normalise text: remove punctuation, collapse spaces, lower case
  const normalized = text
    .replace(/[.,!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Remove common filler words in pidgin
  const fillerWords = ['wey', 'be', 'na', 'for', 'the', 'a', 'an'];
  const tokens = normalized.split(' ').filter(t => !fillerWords.includes(t));
  const cleaned = tokens.join(' ');

  // Quantity regex – capture a number followed by a unit word
  const qtyMatch = cleaned.match(/(\d+)\s*(cartons|bags|pcs|goats|order|items?)/i);
  if (qtyMatch) {
    result.qty = parseInt(qtyMatch[1], 10);
  }

  // Price regex – optional Naira symbol or word, number with optional commas/decimals
  const priceMatch = cleaned.match(/(?:₦|naira)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i);
  if (priceMatch) {
    const num = priceMatch[1].replace(/,/g, '');
    result.price = parseFloat(num);
  }

  // Expiry date regex – month name + year OR numeric mm/yyyy or mm/dd/yyyy
  const monthNames = [
    'january','february','march','april','may','june','july','august','september','october','november','december',
    'jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'
  ];
  const monthRegex = new RegExp(`(${monthNames.join('|')})\\s+(\\d{4})`, 'i');
  const monthMatch = cleaned.match(monthRegex);
  if (monthMatch) {
    const monthStr = monthMatch[1];
    const year = monthMatch[2];
    const monthMap: { [key: string]: string } = {
      january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12',
      jan:'01',feb:'02',mar:'03',apr:'04',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'
    };
    const month = monthMap[monthStr.toLowerCase()] ?? '01';
    result.expiryDate = `${year}-${month}-01`;
  } else {
    const numDateMatch = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (numDateMatch) {
      let month = parseInt(numDateMatch[1], 10);
      // If month looks like a day (>12) swap with second capture
      if (month > 12) {
        month = parseInt(numDateMatch[2], 10);
      }
      let year = parseInt(numDateMatch[3] || numDateMatch[2], 10);
      if (year < 100) year += 2000;
      const monthStr = month.toString().padStart(2, '0');
      result.expiryDate = `${year}-${monthStr}-01`;
    }
  }

  // Name extraction – take tokens before qty or price if they exist, otherwise first two words
  const nameTokens: string[] = [];
  if (result.qty !== undefined) {
    const idx = tokens.findIndex(t => t === result.qty?.toString());
    if (idx > 0) nameTokens.push(...tokens.slice(0, idx));
  } else if (result.price !== undefined) {
    const idx = tokens.findIndex(t => t === result.price?.toString());
    if (idx > 0) nameTokens.push(...tokens.slice(0, idx));
  }
  if (nameTokens.length === 0) {
    const firstNumIdx = tokens.findIndex(t => /^\d+$/.test(t));
    nameTokens.push(...(firstNumIdx > 0 ? tokens.slice(0, firstNumIdx) : tokens.slice(0, 2)));
  }
  result.name = nameTokens.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');

  return result;
};
