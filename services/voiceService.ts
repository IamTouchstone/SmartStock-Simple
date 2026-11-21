import { useEffect, useRef } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { useAudioRecorder, RecordingPresets, setAudioModeAsync, requestRecordingPermissionsAsync, createAudioPlayer } from 'expo-audio';

let currentRecorder: any = null;
let lastUri: string | null = null;

export function useVoiceService() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const ref = useRef(recorder);
  ref.current = recorder;

  useEffect(() => {
    currentRecorder = recorder;
    return () => { currentRecorder = null; };
  }, [recorder]);

  useEffect(() => {
    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      } catch (e) { console.log('setAudioMode error:', e); }
    })();
  }, []);
}

export const startRecording = async (): Promise<void> => {
  const rec: any = currentRecorder;
  if (!rec) throw new Error('Voice recorder not ready - open Agent again.');
  try {
    
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) throw new Error('Mic permission denied. Allow mic in phone Settings.');
    await rec.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
    await rec.record();
    console.log('VOICE started recording');
  } catch (e: any) {
    console.log('startRecording error:', e?.message);
    throw e;
  }
};

export const stopRecording = async (): Promise<string | null> => {
  if (!currentRecorder) return lastUri;
  try {
    await currentRecorder.stop();
    await new Promise(r => setTimeout(r, 150));
    const anyRec: any = currentRecorder;
    const uri = anyRec.uri ?? anyRec.getStatus?.()?.uri ?? anyRec._uri ?? lastUri;
    console.log('VOICE stopRecording uri:', uri);
    lastUri = uri ?? null;
    return lastUri;
  } catch (e) {
    console.log('stopRecording error:', e);
    return lastUri;
  }
};

export const playRecording = async (uri?: string | null): Promise<void> => {
  const toPlay = uri || lastUri;
  if (!toPlay) throw new Error('No recording to play.');
  try {
    const player = createAudioPlayer({ uri: toPlay });
    player.play();
  } catch (e: any) {
    console.log('playRecording error:', e?.message);
    throw e;
  }
};

export const transcribeRecording = async (uri: string): Promise<string | null> => {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key missing in .env - EXPO_PUBLIC_GEMINI_API_KEY');
  console.log('VOICE transcribe start, uri:', uri);

  const info: any = await FileSystem.getInfoAsync(uri).catch(() => null);
  console.log('VOICE file size:', info?.size);
  if (!info?.exists || !info?.size) throw new Error('Recording file is empty - speak for 2-3 seconds, not a quick tap.');

  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
  console.log('VOICE base64 length:', base64.length);
  if (!base64 || base64.length < 1000) throw new Error('Recording too short - hold mic, speak a full sentence, then tap again.');

  const models = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];
  const mimeTypes = ['audio/m4a', 'audio/mp4', 'audio/x-m4a'];
  let lastErr = '';

  for (const model of models) {
    for (const mime of mimeTypes) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Transcribe this audio exactly, word for word. Return ONLY the transcription, no explanation.' }, { inline_data: { mime_type: mime, data: base64 } }] }],
            generationConfig: { temperature: 0 },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await res.json();
        console.log(`VOICE transcribe ${model} ${mime} ok=${res.ok}`, JSON.stringify(data?.error || data?.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 100) || ''));
        if (res.ok) {
          const out = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('').trim() || '';
          if (out) return out;
          lastErr = 'Gemini returned empty transcription';
        } else {
          lastErr = data?.error?.message || 'Gemini transcription failed';
        }
      } catch (e: any) {
        lastErr = e?.name === 'AbortError' ? `Gemini ${model} timed out after 30s` : String(e?.message || e);
        console.log('VOICE transcribe error:', lastErr);
      }
    }
  }
  throw new Error(lastErr || 'Transcription failed - check Metro log for VOICE transcribe error');
};