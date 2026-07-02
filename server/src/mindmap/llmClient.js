/**
 * llmClient.js - Modul LLM Client (MSM-04)
 *
 * Memanggil LLM API eksternal untuk menghasilkan struktur JSON mind map.
 *
 * Provider via env LLM_PROVIDER:
 *   - "groq"       -> Llama-3.3-70b di Groq (GRATIS, 30 req/min)
 *   - "anthropic"  -> Claude (perlu billing console.anthropic.com)
 *   - "openai"     -> GPT-4o-mini  (perlu billing platform.openai.com)
 *   - "sim"        -> simulator variabilitas OFFLINE (scripts/stochastic-llm.js),
 *                     reproducible; untuk uji stabilitas tanpa jaringan.
 *   - "mock"       -> deterministik lokal (offline)
 */

import { splitSentences, tokenize } from './preprocess.js';
import { clusterSentences } from './embedding.js';

const PROVIDER = process.env.LLM_PROVIDER || 'mock';
// Pengaman longgar untuk mock generator (BUKAN aturan keseimbangan).
const MOCK_MAX_BRANCHES = 24;

const DEFAULT_MODEL = {
  groq:      'llama-3.3-70b-versatile',
  anthropic: 'claude-sonnet-4-6',   // string model valid; override via LLM_MODEL
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

/**
 * mockGenerate - generator deterministik & OFFLINE (LLM_PROVIDER=mock).
 *
 * Catatan: mock ini DETERMINISTIK (FR-3) sehingga tidak cocok untuk mengukur
 * stabilitas (SCS akan = 1.0). Untuk evaluasi stabilitas gunakan provider LLM
 * nyata, atau simulator variabilitas di scripts/stochastic-llm.js (LLM_PROVIDER=sim).
 *
 * Bentuk pohon di sini TIDAK dipaksa seimbang: lebar tiap cabang mengikuti
 * ukuran cluster alami (tidak ada lagi pemotongan paksa ke 4 anak), dan
 * jumlah cabang root mengikuti jumlah cluster konten - bukan rumus tetap.
 */
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

  // Jumlah cluster mengikuti keragaman konten (heuristik akar), bukan dipaksa.
  const k = Math.min(MOCK_MAX_BRANCHES, Math.max(1, Math.round(Math.sqrt(sentences.length))));
  const { clusters, medoids } = clusterSentences(sentences, k);
  const branches = clusters
    .map((members, idx) => {
      if (!members.length) return null;
      const branchSentence = sentences[medoids[idx]];
      const children = members
        .filter(i => i !== medoids[idx])
        .slice(0, MOCK_MAX_BRANCHES)
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

/** Groq (endpoint OpenAI-compatible) — ROTASI BANYAK KUNCI + rate-limit. */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Ambil daftar kunci Groq (boleh gabung beberapa sumber):
 *   - GROQ_API_KEYS = "key1,key2,key3,..."   (dipisah koma / spasi / baris baru)
 *   - GROQ_API_KEY_1, GROQ_API_KEY_2, ... GROQ_API_KEY_20
 *   - GROQ_API_KEY                            (satu kunci, kompatibel lama)
 */
function loadGroqKeys() {
  const keys = [];
  (process.env.GROQ_API_KEYS || '').split(/[\s,]+/).forEach((k) => {
    if (k && k.trim()) keys.push(k.trim());
  });
  for (let i = 1; i <= 20; i += 1) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k && k.trim()) keys.push(k.trim());
  }
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()) {
    keys.push(process.env.GROQ_API_KEY.trim());
  }
  return [...new Set(keys)]; // buang duplikat
}

const GROQ_KEYS = loadGroqKeys();
let _groqStart = 0;               // mulai rotasi dari kunci ini
const _groqDailyDead = new Set(); // index kunci yang kuota HARIAN-nya habis

/**
 * callGroq dengan ROTASI kunci:
 *   - 429 kuota HARIAN (TPD/RPD)  -> tandai kunci mati, langsung pindah kunci lain.
 *   - 429 limit per-menit (TPM/RPM) -> coba kunci lain; kalau semua kena, tunggu lalu ulang.
 * Gagal HANYA jika semua kunci kuota hariannya habis, atau sudah menunggu MAX_WAIT_ROUNDS kali.
 */
async function callGroq(prompt) {
  if (!GROQ_KEYS.length) {
    throw new Error('Tidak ada kunci Groq. Isi GROQ_API_KEYS (dipisah koma) / GROQ_API_KEY_1..N / GROQ_API_KEY di server/.env');
  }
  const model = process.env.LLM_MODEL || DEFAULT_MODEL.groq;
  const temperature = parseFloat(process.env.LLM_TEMPERATURE || '0.2');
  const MAX_WAIT_ROUNDS = parseInt(process.env.GROQ_WAIT_ROUNDS || '8', 10);
  const body = JSON.stringify({
    model,
    response_format: { type: 'json_object' },
    temperature,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user',   content: prompt.user }
    ]
  });
  const N = GROQ_KEYS.length;

  for (let round = 0; round <= MAX_WAIT_ROUNDS; round += 1) {
    let sawMinuteLimit = false;
    let minWait = 15;
    for (let step = 0; step < N; step += 1) {
      const idx = (_groqStart + step) % N;
      if (_groqDailyDead.has(idx)) continue;
      let res;
      try {
        res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${GROQ_KEYS[idx]}` },
          body
        });
      } catch (netErr) {
        process.stdout.write(`\n  [Groq kunci #${idx + 1} gangguan jaringan -> coba kunci lain...]`);
        continue;
      }
      if (res.status === 429) {
        const raw = await res.text();
        const isDaily = /per day|TPD|tokens per day|requests per day|RPD|daily/i.test(raw);
        if (isDaily) {
          _groqDailyDead.add(idx);
          process.stdout.write(`\n  [Groq kunci #${idx + 1} kuota HARIAN habis -> pindah kunci (${_groqDailyDead.size}/${N} mati)]`);
        } else {
          sawMinuteLimit = true;
          const ra = parseFloat(res.headers.get('retry-after'));
          if (!Number.isNaN(ra) && ra > 0) minWait = Math.min(minWait, ra);
          process.stdout.write(`\n  [Groq kunci #${idx + 1} limit per-menit -> coba kunci lain...]`);
        }
        continue;
      }
      if (!res.ok) throw new Error(friendlyError('groq', res.status, await res.text()));
      const data = await res.json();
      _groqStart = idx; // lanjut dari kunci yang barusan sukses
      return data.choices?.[0]?.message?.content || '';
    }

    if (_groqDailyDead.size >= N) {
      throw new Error(`Semua ${N} kunci Groq kuota HARIAN-nya (TPD) habis. Tunggu reset ~24 jam, tambah kunci, atau pakai model lebih kecil (llama-3.1-8b-instant).`);
    }
    if (!sawMinuteLimit) {
      throw new Error('Groq: semua kunci gagal tanpa alasan rate-limit yang jelas (cek koneksi / API key valid).');
    }
    const waitS = Math.min(60, Math.max(5, minWait));
    process.stdout.write(`\n  [semua kunci aktif kena limit per-menit, tunggu ${waitS.toFixed(0)}s lalu ulang...]`);
    await sleep(waitS * 1000);
  }
  throw new Error('Groq: gagal setelah rotasi semua kunci + beberapa kali menunggu.');
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

// Counter untuk seed simulator (provider=sim). Tiap panggilan beda seed.
let _simCounter = parseInt(process.env.SIM_SEED || '1', 10);

export async function generateMindMap(prompt, text) {
  if (PROVIDER === 'mock') return mockGenerate(text);
  if (PROVIDER === 'sim') {
    const { simulateMindMap } = await import('../../scripts/stochastic-llm.js');
    return simulateMindMap(text, _simCounter++);
  }
  let raw;
  if (PROVIDER === 'groq')      raw = await callGroq(prompt);
  else if (PROVIDER === 'anthropic') raw = await callAnthropic(prompt);
  else if (PROVIDER === 'openai')    raw = await callOpenAI(prompt);
  else throw new Error(`LLM_PROVIDER tidak dikenali: ${PROVIDER}. Pilihan: groq | anthropic | openai | mock | sim`);
  return safeJsonParse(raw);
}

export const _internals = { MOCK_MAX_BRANCHES, DEFAULT_MODEL };
export default { generateMindMap, mockGenerate };
