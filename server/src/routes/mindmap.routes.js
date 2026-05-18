/**
 * mindmap.routes.js - Endpoint Pemrosesan Mind Map (MBE-01 + MSM-*)
 *
 *   POST /api/mindmap/generate
 *     body : { text: string, demos?: number }
 *     auth : Bearer JWT
 *     resp : { mindmap, meta: { attempts, durationMs, stats, validation } }
 *
 * Mengintegrasikan pipeline Auto-CoT:
 *   preprocess → embedding/clustering → buildPrompt → LLM → validation
 * Retry maksimal 3x bila validasi gagal; tiap retry menyertakan pesan
 * error sebelumnya ke prompt untuk perbaikan (lihat autoCoT.buildPrompt).
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { buildPrompt } from '../mindmap/autoCoT.js';
import { generateMindMap } from '../mindmap/llmClient.js';
import { validate } from '../mindmap/validation.js';
import { summarize } from '../mindmap/preprocess.js';

const router = express.Router();
router.use(requireAuth);

const MAX_ATTEMPTS = 3;

router.post('/generate', async (req, res) => {
  const { text, demos } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    return res.status(400).json({
      message: 'Teks input minimal 20 karakter'
    });
  }
  const startedAt = Date.now();
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const prompt = buildPrompt(text, {
        demos: demos || 3,
        previousError: lastError
      });
      const tree = await generateMindMap(prompt, text);
      const validation = validate(tree, text);
      return res.json({
        mindmap: tree,
        meta: {
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          stats: validation.stats,
          preprocess: summarize(text),
          provider: process.env.LLM_PROVIDER || 'mock',
          validation: 'passed'
        }
      });
    } catch (err) {
      lastError = err.message;
      console.warn(`[mindmap] attempt ${attempt} failed:`, err.message);
      if (attempt === MAX_ATTEMPTS) {
        return res.status(422).json({
          message: 'Gagal menghasilkan mind map setelah retry maksimal',
          lastError: err.message,
          attempts: attempt
        });
      }
    }
  }
});

export default router;
