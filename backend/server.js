// SmartStock Phase 2 — Vercel Orchestrator
// Single server: POST /api/agent only. No db.json, no emailService.
// Firestore is source of truth. Firebase Admin bypasses firestore.rules,
// so we re-enforce sameOrg() in code on every request.

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Firebase Admin (never crash on startup) ---
let db = null;
try {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
    if (!raw) {
      console.warn('[SmartStock] FIREBASE_SERVICE_ACCOUNT_JSON not set - /api/agent will 500, /api/health will still work');
    } else {
      const svc = JSON.parse(raw);
      // Vercel env vars escape newlines as \\n - fix them
      if (svc.private_key) {
        svc.private_key = svc.private_key.replace(/\\n/g, '\n');
      }
      if (!svc.project_id || !svc.private_key || !svc.client_email) {
        console.warn('[SmartStock] FIREBASE_SERVICE_ACCOUNT_JSON incomplete - missing project_id / private_key / client_email');
      } else {
        admin.initializeApp({ credential: admin.credential.cert(svc) });
        db = admin.firestore();
        console.log('[SmartStock] Firestore connected:', svc.project_id);
      }
    }
  } else {
    db = admin.firestore();
  }
} catch (e) {
  console.error('[SmartStock] Firebase init failed, continuing without DB:', e.message);
  db = null;
}

// --- Helpers ---
async function verifyUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new Error('NO_TOKEN');
  const decoded = await admin.auth().verifyIdToken(token);
  const snap = await db.collection('users').doc(decoded.uid).get();
  if (!snap.exists) throw new Error('NO_PROFILE');
  const profile = snap.data();
  const org_id = profile.org_id || '';
  const role = profile.role || 'Staff';
  if (!org_id) throw new Error('NO_ORG');
  return { uid: decoded.uid, org_id, role, email: decoded.email || '' };
}

async function callGroq(messages) {
  const key = process.env.GROQ_API_KEY || '';
  if (!key) throw new Error('NO_GROQ_KEY');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'GROQ_FAILED');
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(messages) {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) throw new Error('NO_GEMINI_KEY');
  const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'GEMINI_FAILED');
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// --- Tavily Web Search ---
async function webSearch(query) {
  const key = process.env.TAVILY_API_KEY || '';
  if (!key) return '';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn('[SmartStock] Tavily failed:', data?.detail || res.status);
      return '';
    }
    const parts = [];
    if (data.answer) parts.push(`Web Answer: ${data.answer}`);
    if (Array.isArray(data.results)) {
      for (const r of data.results.slice(0, 5)) {
        parts.push(`- ${r.title || ''}: ${r.content || ''} (${r.url || ''})`);
      }
    }
    return parts.join('\n').slice(0, 4000);
  } catch (e) {
    console.warn('[SmartStock] Tavily error:', e.message);
    return '';
  }
}

function needsWebSearch(message) {
  const m = message.toLowerCase();
  return /price|market|current|today|latest|news|naira|dollar|exchange|rate|supplier|lagos|nigeria|online|internet|web|search|google|what is|who is|trending/.test(m);
}

// --- Routes ---
app.get('/', (req, res) => res.json({ ok: true, service: 'smartstock-phase2', time: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({ ok: true, hasFirestore: !!db, hasGroq: !!process.env.GROQ_API_KEY, hasGemini: !!process.env.GEMINI_API_KEY, hasTavily: !!process.env.TAVILY_API_KEY }));

app.post('/api/agent', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ ok: false, error: 'SERVER_NOT_CONFIGURED' });
    const user = await verifyUser(req);
    const { message = '', history = [] } = req.body || {};
    if (!message.trim()) return res.status(400).json({ ok: false, error: 'EMPTY_MESSAGE' });

    // Org-scoped context: NEVER return data from another org.
    const [prodSnap, invSnap, salesSnap] = await Promise.all([
      db.collection('products').where('org_id', '==', user.org_id).limit(20).get(),
      db.collection('inventory').where('org_id', '==', user.org_id).limit(20).get(),
      db.collection('sales').where('org_id', '==', user.org_id).orderBy('created_at', 'desc').limit(10).get(),
    ]);
    const context = {
      org_id: user.org_id,
      role: user.role,
      products: prodSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      inventory: invSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      recentSales: salesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    };

    // Web search only when needed - never leaks org data to Tavily, only the user's question
    let webContext = '';
    let usedWebSearch = false;
    if (needsWebSearch(message)) {
      webContext = await webSearch(message);
      usedWebSearch = !!webContext;
    }

    const system = `You are SmartStock Agent for org ${user.org_id}. User role: ${user.role}.

CREATOR: SmartStock was created by Anagbaoso Chukwuebuka Bernie, also known as Touchstone.
Pronunciation: Ah-nah-BAH-oh-so Chook-woo-eh-BOO-kah BER-nie.
If asked who created / built / founded SmartStock, answer with his full name and that pronunciation. Never claim anyone else created it.

RULES:
- For internal business questions (products, prices in YOUR store, stock, sales), answer using ONLY the org context below. Never invent products, prices, or stock. If data is missing, say so.
- For external / current-world questions (market prices, exchange rate, news, suppliers, general knowledge), use the Web Search Results below if present. Clearly say when info is from the web.
- Never mix them: do NOT present web prices as your store's prices.
- Keep answers short, actionable.

Org Context: ${JSON.stringify(context).slice(0, 8000)}

${usedWebSearch ? `Web Search Results:\n${webContext}` : 'Web Search Results: none (question was internal only).'}`;
    const messages = [
      { role: 'system', content: system },
      ...history.slice(-10),
      { role: 'user', content: message },
    ];

    let reply = '';
    let provider = 'groq';
    try { reply = await callGroq(messages); }
    catch (e) {
      console.warn('[Agent] Groq failed, fallback Gemini:', e.message);
      provider = 'gemini';
      reply = await callGemini(messages);
    }

    await db.collection('activity_logs').add({
      org_id: user.org_id, uid: user.uid, type: 'AGENT_CHAT',
      message: message.slice(0, 500), provider, usedWebSearch, created_at: new Date().toISOString(),
    });

    return res.json({ ok: true, reply, provider, usedWebSearch, org_id: user.org_id });
  } catch (e) {
    if (e.message === 'NO_TOKEN') return res.status(401).json({ ok: false, error: 'NO_TOKEN' });
    if (e.message === 'NO_PROFILE' || e.message === 'NO_ORG') return res.status(403).json({ ok: false, error: e.message });
    console.error('[Agent] error:', e);
    return res.status(500).json({ ok: false, error: 'AGENT_FAILED' });
  }
});

const PORT = process.env.PORT || 3000;
if (process.env.VERCEL !== '1') app.listen(PORT, () => console.log(`SmartStock Phase 2 on :${PORT}`));
module.exports = app;