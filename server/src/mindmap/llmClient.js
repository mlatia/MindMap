/**
 * llmClient.js - Modul LLM Client (MSM-04)
 *
 * Memanggil LLM API eksternal (Anthropic Claude atau OpenAI) untuk
 * menghasilkan struktur JSON mind map berdasarkan prompt dari
 * autoCoT.buildPrompt.
 *
 * Provider dipilih melalui environment variable LLM_PROVIDER:
 *   - "anthropic"  -> Claude Opus 4.6 (default model jika LLM_MODEL kosong)
 *   - "openai"     -> GPT-4o-mini  (default model jika LLM_MODEL kosong)
 *   - "mock"       -> pipeline deterministik lokal (offline)
 *
 * Default sekarang anthropic (kualitas terbaik untuk hierarchical extraction).
 */

import { splitSentences, tokenize } from './preprocess.js';
import { clusterSentences } from './embedding.js';

const PROVIDER = process.env.LLM_PROVIDER || 'mock';
const MAX_BRANCHES = 6;
const MAX_DEPTH = 3;

const DEFAULT_MODEL = {
  anthropic: 'claude-opus-4-6',
  openai:    'gpt-4o-mini',
  google: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile',

};

/** Helper: ambil 1-3 kata kunci dari kalimat (untuk mock). */
function toConcept(sentence, max = 3) {
  const tokens = tokenize(sentence);
  if (!tokens.length) return sentence.split(/\s+/).slice(0, max).join(' ');
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const ranked = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([t]) => t);
  return ranked.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Mock generator deterministik (untuk dev offline). */
export function mockGenerate(text) {
  const sentences = splitSentences(text);
  if (!sentences.length) return { concept: 'Mind Map', level: 0, children: [] };
  const tokens = tokenize(text);
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const topTopic = ranked.length
    ? ranked.slice(0, 2).map(([w]) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Mind Map';

  const k = Math.min(MAX_BRANCHES, Math.max(2, Math.ceil(sentences.length / 2)));
  const { clusters, medoids } = clusterSentences(sentences, k);
  const branches = clusters
    .map((members, idx) => {
      if (!members.length) return null;
      const branchSentence = sentences[medoids[idx]];
      const children = members
        .filter(i => i !== medoids[idx])
        .slice(0, 4)
        .map(i => ({ concept: toConcept(sentences[i], 3), level: 2, children: [] }));
      return { concept: toConcept(branchSentence, 2), level: 1, children };
    })
    .filter(Boolean);

  return { concept: topTopic, level: 0, children: branches };
}

/** Friendly error untuk error response umum. */
function friendlyError(provider, status, body) {
  try {
    const j = typeof body === 'string' ? JSON.parse(body) : body;
    const msg = j?.error?.message || j?.message || JSON.stringify(j);
    if (status === 401) return `${provider} API: kunci API tidak valid atau ter-revoke. Cek ${provider === 'google' ? 'GOOGLE_API_KEY' : 'OPENAI_API_KEY'} di server/.env`;
    if (status === 429 && /quota|insufficient|billing/i.test(msg)) {
      return `${provider} API: kredit/quota habis. Top-up di ${provider === 'google' ? 'console.google.com/settings/billing' : 'platform.openai.com/settings/organization/billing'}. Pesan asli: ${msg}`;
    }
    if (status === 429) return `${provider} API: rate-limit. Tunggu sebentar lalu coba lagi.`;
    if (status >= 500) return `${provider} API down (${status}). Coba lagi nanti.`;
    return `${provider} API error ${status}: ${msg}`;
  } catch {
    return `${provider} API error ${status}: ${body}`;
  }
}

async function callAnthropic(prompt) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY belum diset di server/.env');
  const model = process.env.LLM_MODEL || DEFAULT_MODEL.groq;
  const res = await fetch('https://api.google.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'groq-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: 0,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }]
    })
  });
  if (!res.ok) throw new Error(friendlyError('Anthropic', res.status, await res.text()));
  const data = await res.json();
  return (data.content && data.content[0] && data.content[0].text) || '';
}
async function callGoogle(prompt) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY belum diset di server/.env');
  const model = process.env.LLM_MODEL || 'gemini-2.0-flash';

  // Handle prompt object (format Anthropic) atau string biasa
  const systemText = prompt.system || '';
  const userText = prompt.user || prompt.toString();
  const fullText = systemText ? `${systemText}\n\n${userText}` : userText;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ 
        parts: [{ text: fullText }]
      }],
      generationConfig: { temperature: 0.7 }
    })
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`Google API error ${res.status}: ${body}`);
  
  const data = JSON.parse(body);
  return data.candidates[0].content.parts[0].text;
}
async function callGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY belum diset');
  const model = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';

  const systemText = prompt.system || '';
  const userText = prompt.user || String(prompt);

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemText },
        { role: 'user', content: userText }
      ],
      temperature: 0.7
    })
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`Groq API error ${res.status}: ${body}`);

  const data = JSON.parse(body);
  return data.choices[0].message.content;
}
async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY belum diset di server/.env');
  const model = process.env.LLM_MODEL || DEFAULT_MODEL.openai;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user',   content: prompt.user }
      ]
    })
  });
  if (!res.ok) throw new Error(friendlyError('OpenAI', res.status, await res.text()));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/** Parse JSON tolerant: strip fence, ambil substring antar {} terluar. */
function safeJsonParse(raw) {
  if (!raw) throw new Error('Output LLM kosong');
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1) text = text.slice(first, last + 1);
  return JSON.parse(text);
}

/** Public API: hasilkan struktur mind map. */
export async function generateMindMap(prompt, text) {
  if (PROVIDER === 'mock') return mockGenerate(text);
  let raw;
  if (PROVIDER === 'groq') raw = await callGroq(prompt);
  else if (PROVIDER === 'openai') raw = await callOpenAI(prompt);
  else throw new Error(`LLM_PROVIDER tidak dikenali: ${PROVIDER}`);
  return safeJsonParse(raw);
}

export const _internals = { MAX_BRANCHES, MAX_DEPTH, DEFAULT_MODEL };
export default { generateMindMap, mockGenerate };
