import express from 'express';
import OpenAI from 'openai';
import Groq from 'groq-sdk';

const router = express.Router();

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const groqClient = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const FALLBACK_LANG = 'en';
const FALLBACK_MODEL = 'gpt-4o-mini';

const buildSystemPrompt = (language = FALLBACK_LANG) =>
  [
    `You are “Khushi from ITM”, the official assistant of IndianTradeMart (indiantrademart.com), a B2B marketplace that connects trusted manufacturers, suppliers, and buyers across India.`,
    `Always answer in the user’s selected language code: ${language}. If language is 'hi', reply in natural Hindi; otherwise use English.`,
    `Core duties: help users find products, suppliers, manufacturers; guide vendor registration (“Sell with Us/Become a Vendor” -> fill business + GST/license details, upload docs, verify phone/email, then list products); explain buying flow (search products, compare vendors, raise inquiries/RFQs, track responses).`,
    `Tone: concise, friendly, professional, action-oriented. Offer 2–3 short steps or quick calls-to-action. Ask a brief clarifying question if intent is unclear.`,
    `Safety: never share API keys or internal info; if asked about sensitive data, politely refuse.`,
  ].join(' ');

const validateMessages = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  return messages.every(
    (m) =>
      m &&
      typeof m === 'object' &&
      typeof m.role === 'string' &&
      typeof m.text === 'string' &&
      m.text.trim().length > 0
  );
};

router.post('/', async (req, res) => {
  try {
    const { messages, language, model } = req.body || {};

    if (!validateMessages(messages)) {
      return res.status(400).json({ error: 'messages[] with role/text required' });
    }

    const lang = (language || FALLBACK_LANG).toLowerCase();
    if (!openaiClient && !groqClient) {
      return res.status(500).json({ error: 'No AI provider configured (OPENAI_API_KEY or GROQ_API_KEY missing)' });
    }

    const selectedModel = model || process.env.OPENAI_MODEL || FALLBACK_MODEL;

    let completion;
    let providerUsed = 'openai';

    // Try OpenAI first if configured
    if (openaiClient) {
      try {
        completion = await openaiClient.chat.completions.create({
          model: selectedModel,
          temperature: 0.6,
          max_tokens: 512,
          messages: [
            { role: 'system', content: buildSystemPrompt(lang) },
            ...messages.map((m) => ({ role: m.role, content: m.text })),
          ],
        });
      } catch (err) {
        const status = err?.status || err?.response?.status;
        const detail = err?.error?.message || err?.response?.data || err?.message;
        console.error('[chatbot] OpenAI error', status, detail);
        const quotaError =
          status === 429 || (typeof detail === 'string' && detail.toLowerCase().includes('quota'));

        if (!quotaError || !groqClient) {
          return res.status(502).json({ error: detail || 'Upstream model error (OpenAI)' });
        }
        // fallback to Groq
        providerUsed = 'groq';
      }
    } else {
      providerUsed = 'groq';
    }

    // Groq fallback / primary when OpenAI quota fails or OpenAI missing
    if (providerUsed === 'groq') {
      try {
        const groqModel =
          process.env.GROQ_MODEL ||
          (process.env.OPENAI_MODEL && process.env.OPENAI_MODEL.startsWith('gpt-') ? 'llama-3.3-70b-versatile' : 'llama-3.3-70b-versatile');

        completion = await groqClient.chat.completions.create({
          model: groqModel,
          temperature: 0.6,
          max_tokens: 512,
          messages: [
            { role: 'system', content: buildSystemPrompt(lang) },
            ...messages.map((m) => ({ role: m.role, content: m.text })),
          ],
        });
      } catch (err) {
        const status = err?.status || err?.response?.status;
        const detail = err?.error?.message || err?.response?.data || err?.message;
        console.error('[chatbot] Groq error', status, detail);
        return res.status(502).json({ error: detail || 'Upstream model error (Groq)' });
      }
    }

    const text =
      completion?.choices?.[0]?.message?.content ||
      'Sorry, I could not generate a response right now.';
    return res.json({ text, provider: providerUsed });
    return res.json({ text, provider: 'groq' });
  } catch (err) {
    console.error('[chatbot] error', err);
    res.status(500).json({ error: 'Internal error generating reply' });
  }
});

export default router;
