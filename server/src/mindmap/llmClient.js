/**
 * llmClient.js - Modul LLM Client (MSM-04)
 *
 * Memanggil LLM API eksternal untuk menghasilkan struktur JSON mind map.
 *
 * Provider via env LLM_PROVIDER:
 *   - "groq"       -> Llama-3.3-70b di Groq (GRATIS, 30 req/min)
 *   - "anthropic"  -> Claude Opus 4.6 (perlu billing console.anthropic.com)
 *   - "openai"     -> GPT-4o-mini  (perlu billing platform.openai.com)
 *   - "mock"       -> deterministik lokal (offline)
 */

import { splitSentences, tokenize } from './preprocess.js';
import { clusterSentences } from './embedding.js';

const PROVIDER = process.env.LLM_PROVIDER || 'mock';
const MAX_BRANCHES = 6;
const MAX_DEPTH = 3;

const DEFAULT_MODEL = {
  groq:      'llama-3.3-70b-versatile',
  anthropic: 'claude-opus-4-6',
  openai:    'gpt-4o-mini',
};

function toConcept(sentence, max = 3) {
  const tokens = tokenize(sentence);
  if (!tokens.length) return sentence.split(/\s+/).slice(0, max).join(' ');
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const ranked = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max).map(([t]) => t);
  return ranked.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

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

function friendlyError(provider, status, body) {
  try {
    const j = typeof body === 'string' ? JSON.parse(body) : body;
    const msg = j?.error?.message || j?.message || JSON.stringify(j);
    if (status === 401) {
      const keyName = { groq: 'GROQ_API_KEY', anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' }[provider];
      return `${provider} API: kunci API tidak valid atau ter-revoke. Cek ${keyName} di server/.env`;
    }
    if (status === 429 && /quota|insufficient|billing/i.test(msg)) {
      const url = { groq: 'console.groq.com', anthropic: 'console.anthropic.com/settings/billing', openai: 'platform.openai.com/settings/organization/billing' }[provider];
      return `${provider} API: kredit/quota habis. Cek di ${url}. Pesan asli: ${msg}`;
    }
    if (status === 429) return `${provider} API: rate-limit. Tunggu sebentar lalu coba lagi.`;
    if (status >= 500) return `${provider} API down (${status}). Coba lagi nanti.`;
    return `${provider} API error ${status}: ${msg}`;
  } catch {
    return `${provider} API error ${status}: ${body}`;
  }
}

/** Groq menggunakan endpoint OpenAI-compatible. */
async function callGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY belum diset di server/.env. Daftar gratis di console.groq.com');
  const model = process.env.LLM_MODEL || DEFAULT_MODEL.groq;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user',   content: prompt.user }
      ]
    })
  });
  if (!res.ok) throw new Error(friendlyError('groq', res.status, await res.text()));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY belum diset di server/.env');
  const model = process.env.LLM_MODEL || DEFAULT_MODEL.anthropic;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: 4096, temperature: 0,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }]
    })
  });
  if (!res.ok) throw new Error(friendlyError('anthropic', res.status, await res.text()));
  const data = await res.json();
  return (data.content && data.content[0] && data.content[0].text) || '';
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY belum diset di server/.env');
  const model = process.env.LLM_MODEL || DEFAULT_MODEL.openai;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, response_format: { type: 'json_object' }, temperature: 0,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user',   content: prompt.user }
      ]
    })
  });
  if (!res.ok) throw new Error(friendlyError('openai', res.status, await res.text()));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function safeJsonParse(raw) {
  if (!raw) throw new Error('Output LLM kosong');
  let text = raw.trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1) text = text.slice(first, last + 1);
  return JSON.parse(text);
}

export async function generateMindMap(prompt, text) {
  if (PROVIDER === 'mock') return mockGenerate(text);
  let raw;
  if (PROVIDER === 'groq')      raw = await callGroq(prompt);
  else if (PROVIDER === 'anthropic') raw = await callAnthropic(prompt);
  else if (PROVIDER === 'openai')    raw = await callOpenAI(prompt);
  else throw new Error(`LLM_PROVIDER tidak dikenali: ${PROVIDER}. Pilihan: groq | anthropic | openai | mock`);
  return safeJsonParse(raw);
}

export const _internals = { MAX_BRANCHES, MAX_DEPTH, DEFAULT_MODEL };
export default { generateMindMap, mockGenerate };
