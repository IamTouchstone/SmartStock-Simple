// services/visionExpiryService.ts - Expo Go compatible, NO native build
// Uses Gemini Vision only. NEVER fakes a date - returns null if not clearly readable.
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { parseExpiryFromText } from './expiryParser';

export interface VisionResult {
  expiry: string | null; // YYYY-MM-DD or null
  production?: string | null;
  batchNo?: string | null;
  rawText: string;
  source: 'GEMINI' | 'NONE';
  reason?: string;
}

// Compress to 1200px - this alone fixes 50% of unreadable label photos
async function compressForVision(uri: string): Promise<{ uri: string; base64: string }> {
  const compressed = await manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    { compress: 0.7, format: SaveFormat.JPEG }
  );
  const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { uri: compressed.uri, base64 };
}

async function askGemini(base64: string): Promise<VisionResult> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) return { expiry: null, rawText: '', source: 'NONE', reason: 'GEMINI_KEY_MISSING' };

  const prompt = `Read the production and expiry / best-before date printed on this product label.

Rules:
- Look ONLY for PD / MFG / Production Date and EXP / B.B. / BB / Best Before / Use By.
- Return the EXPIRY / BEST BEFORE date, NOT the production date.
- Formats you may see: DD-MM-YYYY, DD/MM/YY, MM/YYYY, DD MMM YYYY (e.g. 06 NOV 2027), 12/2027.
- If only MM/YYYY is printed (e.g. 12/2027), return the last day of that month (2027-12-31).
- If the text is blurry, glare, cut off, or you cannot read it clearly, return null. DO NOT GUESS. DO NOT INVENT A DATE.
- Return ONLY JSON, no other text.

JSON format:
{"expiry": "YYYY-MM-DD or null", "production": "YYYY-MM-DD or null", "batchNo": "string or null", "rawText": "exact text you saw, e.g. PD 08/2025 BB 12/2027"}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: base64 } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    }
  );
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text.trim()) return { expiry: null, rawText: '', source: 'GEMINI', reason: 'GEMINI_EMPTY' };

  try {
    const parsed = JSON.parse(text);
    if (!parsed.expiry) return { expiry: null, production: parsed.production || null, batchNo: parsed.batchNo || null, rawText: parsed.rawText || '', source: 'GEMINI', reason: 'GEMINI_NOT_READABLE' };
    return {
      expiry: parsed.expiry,
      production: parsed.production || null,
      batchNo: parsed.batchNo || null,
      rawText: parsed.rawText || text,
      source: 'GEMINI',
    };
  } catch {
    // Gemini returned non-JSON - try our local parser on its raw text
    const fallback = parseExpiryFromText(text);
    if (fallback.expiryDate) return { expiry: fallback.expiryDate, production: fallback.productionDate, batchNo: fallback.batchNo, rawText: text, source: 'GEMINI' };
    return { expiry: null, rawText: text, source: 'GEMINI', reason: 'GEMINI_PARSE_FAIL' };
  }
}

export async function scanExpiryFromPhoto(photoUri: string): Promise<VisionResult> {
  const { base64 } = await compressForVision(photoUri);
  // Gemini only - reads like a human. No fallback to old OCR engine.
  const gemini = await askGemini(base64);
  if (gemini.expiry) return gemini;
  // No fake date - return why
  return { expiry: null, production: gemini.production || null, batchNo: gemini.batchNo || null, rawText: gemini.rawText, source: 'NONE', reason: gemini.reason || 'NOT_READABLE' };
}