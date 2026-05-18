/**
 * llmClient.js - Modul LLM Client (MSM-04)
 *
 * Memanggil LLM API eksternal (Anthropic Claude atau OpenAI) untuk
 * menghasilkan struktur JSON mind map berdasarkan prompt dari
 * autoCoT.buildPrompt.
 *
 * Provider dipilih melalui environment variable LLM_PROVIDER
 * ("anthropic" | "openai" | "mock"). Mode "mock" mengaktifkan
 * pipeline deterministik lokal sehingga sistem tetap berjalan tanpa
 * koneksi internet atau API key (penting untuk demo dan unit test).
 */

import { splitSentences, tokenize } from './preprocess.js';
import { clusterSentences } from './embedding.js';

const PROVIDER = process.env.LLM_PROVIDER || 'mock';
const MAX_BRANCHES = 6;
const MAX_DEPTH = 3; // root = 0, so 3 → 4 level

/**
 * Pilih frasa pendek dari kalimat: dua kata terpenting (TF tertinggi).
 * @param {string} sentence
 * @param {number} max - jumlah kata maksimum dalam frasa
 * @returns {string}
 */
function toConcept(sentence, max = 3) {
  const tokens = tokenize(sentence);
  if (!tokens.length) return sentence.split(/\s+/).slice(0, max).join(' ');
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const ranked = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([t]) => t);
  return ranked
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Generator mind map deterministik (mock LLM). Memetakan tiap cluster
 * kalimat ke cabang utama, dan kalimat-anggota ke sub-konsep.
 *
 * @param {string} text
 * @returns {{concept:string, level:number, children:Array}}
 */
export function mockGenerate(text) {
  const sentences = splitSentences(text);
  if (!sentences.length) {
    return { concept: 'Mind Map', level: 0, children: [] };
  }
  const tokens = tokenize(text);
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const topTopic = ranked.length
    ? ranked.slice(0, 2)
        .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
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
        .map(i => ({
          concept: toConcept(sentences[i], 3),
          level: 2,
          children: []
        }));
      return {
        concept: toConcept(branchSentence, 2),
        level: 1,
        children
      };
    })
    .filter(Boolean);

  return {
    concept: topTopic,
    level: 0,
    children: branches
  };
}

/**
 * Panggil Anthropic Claude API.
 * @param {{system:string, user:string}} prompt
 * @returns {Promise<string>}
 */
async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY belum diset');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'claude-sonnet-4-6',
      max_tokens: 2000,
      temperature: 0,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }]
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return (data.content && data.content[0] && data.content[0].text) || '';
}

/**
 * Panggil OpenAI Chat Completions dengan JSON mode.
 * @param {{system:string, user:string}} prompt
 * @returns {Promise<string>}
 */
async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY belum diset');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ]
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Parse string ke object JSON; toleran terhadap fence markdown.
 * @param {string} raw
 * @returns {any}
 */
function safeJsonParse(raw) {
  if (!raw) throw new Error('Output LLM kosong');
  let text = raw.trim();
  // strip ```json fences if present
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  }
  // ambil substring antara { dan } terluar pertama
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1) text = text.slice(first, last + 1);
  return JSON.parse(text);
}

/**
 * Public API: hasilkan struktur mind map berbasis prompt + teks asli.
 *
 * @param {{system:string, user:string}} prompt
 * @param {string} text - teks asli, dipakai bila provider = mock
 * @returns {Promise<Object>} pohon { concept, level, children }
 */
export async function generateMindMap(prompt, text) {
  if (PROVIDER === 'mock') {
    return mockGenerate(text);
  }
  let raw;
  if (PROVIDER === 'anthropic') {
    raw = await callAnthropic(prompt);
  } else if (PROVIDER === 'openai') {
    raw = await callOpenAI(prompt);
  } else {
    throw new Error(`LLM_PROVIDER tidak dikenali: ${PROVIDER}`);
  }
  return safeJsonParse(raw);
}

export const _internals = { MAX_BRANCHES, MAX_DEPTH };
export default { generateMindMap, mockGenerate };
