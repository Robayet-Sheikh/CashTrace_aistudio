import 'dotenv/config';
import express, {type Request, type Response} from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GoogleGenAI, ThinkingLevel, Type} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_ID = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error('GEMINI_API_KEY_MISSING');
    (err as Error & {statusCode?: number}).statusCode = 503;
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sendAiError(res: Response, error: unknown, language: 'bn' | 'en' = 'en'): void {
  const message = error instanceof Error ? error.message : String(error || 'Unknown AI error');
  const statusHint = (error as {status?: number; statusCode?: number})?.statusCode ??
    (error as {status?: number})?.status;

  if (message === 'GEMINI_API_KEY_MISSING') {
    res.status(503).json({
      error:
        language === 'bn'
          ? 'AI সেবা চালু করতে Secrets প্যানেলে GEMINI_API_KEY সেট করুন।'
          : 'GEMINI_API_KEY is not configured in Settings > Secrets.',
      code: 'GEMINI_API_KEY_MISSING',
    });
    return;
  }

  if (statusHint === 403 || message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID')) {
    res.status(403).json({
      error:
        language === 'bn'
          ? 'Gemini API Key অনুমতি পায়নি। Settings > Secrets প্যানেল চেক করুন।'
          : 'Gemini API key permission denied or invalid. Check Settings > Secrets.',
      code: 'PERMISSION_DENIED',
    });
    return;
  }

  if (statusHint === 429 || message.includes('RESOURCE_EXHAUSTED')) {
    res.status(429).json({
      error:
        language === 'bn'
          ? 'এই মুহূর্তে AI কোটা পূর্ণ হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।'
          : 'AI quota temporarily exhausted. Please try again shortly.',
      code: 'RESOURCE_EXHAUSTED',
    });
    return;
  }

  res.status(statusHint && statusHint >= 400 && statusHint < 600 ? statusHint : 500).json({
    error:
      language === 'bn'
        ? `AI প্রসেসিং ব্যর্থ হয়েছে: ${message.slice(0, 180)}`
        : `AI request failed: ${message.slice(0, 180)}`,
    code: 'AI_ERROR',
  });
}

async function createServer() {
  const app = express();
  app.use(express.json({limit: '15mb'}));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      aiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
    });
  });

  // 1. Smart Text & Voice-to-Transaction Parser
  app.post('/api/ai/smart-entry', async (req: Request, res: Response) => {
    const lang: 'bn' | 'en' = req.body?.language === 'bn' ? 'bn' : 'en';
    try {
      const {
        text,
        audioBase64,
        audioMimeType,
        categories = [],
        wallets = [],
        currency = '৳',
        todayDate = new Date().toISOString().slice(0, 10),
      } = req.body || {};

      if (!text && !audioBase64) {
        res.status(400).json({
          error:
            lang === 'bn'
              ? 'লেনদেনের বিবরণ লিখুন অথবা ভয়েস রেকর্ড করুন।'
              : 'Provide transaction text or a voice recording.',
        });
        return;
      }

      const ai = getGeminiClient();
      const walletListStr = (wallets as Array<{id: string; name: string}>)
        .map((w) => `${w.id}: ${w.name}`)
        .join(', ');
      const catListStr = (categories as Array<{name: string; type: string}>)
        .map((c) => `${c.name} (${c.type})`)
        .join(', ');

      const instruction = [
        `You are a personal finance transaction extractor for CashTrace.`,
        `User language: ${lang === 'bn' ? 'Bengali' : 'English'}. Currency: ${currency}. Today's date: ${todayDate}.`,
        `Available wallets (id: name): ${walletListStr || 'cash: Cash'}.`,
        `Available categories: ${catListStr || 'Food (expense), Salary (income)'}.`,
        `Extract one or more transactions from the user's natural Bengali/Banglish/English text or spoken voice audio.`,
        `Rules:`,
        `- Infer type: 'income', 'expense', or 'transfer'.`,
        `- Match category closely to one of the Available categories above if possible; otherwise use the closest sensible category name.`,
        `- Match walletId to one of the Available wallet ids (default to the first wallet id '${wallets?.[0]?.id || 'cash'}' if unspecified).`,
        `- Resolve relative dates like 'আজ/today', 'গতকাল/yesterday' using todayDate (${todayDate}) in YYYY-MM-DD format.`,
        `- Clean concise title in the user's language (${lang === 'bn' ? 'Bengali/Banglish as appropriate' : 'English'}).`,
        `- Positive numeric amount.`,
      ].join('\n');

      const parts: Array<{text: string} | {inlineData: {mimeType: string; data: string}}> = [];
      if (audioBase64 && audioMimeType) {
        parts.push({
          inlineData: {
            mimeType: String(audioMimeType),
            data: String(audioBase64),
          },
        });
      }
      parts.push({
        text: text
          ? `Extract transactions from this input:\n"${String(text).slice(0, 2000)}"`
          : `Transcribe the spoken audio and extract all financial transactions mentioned.`,
      });

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: {parts},
        config: {
          systemInstruction: instruction,
          thinkingConfig: {thinkingLevel: ThinkingLevel.LOW},
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcript: {
                type: Type.STRING,
                description: 'Transcribed or normalized input summary.',
              },
              transactions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: {type: Type.STRING, description: 'income | expense | transfer'},
                    title: {type: Type.STRING},
                    amount: {type: Type.NUMBER},
                    category: {type: Type.STRING},
                    walletId: {type: Type.STRING},
                    date: {type: Type.STRING, description: 'YYYY-MM-DD'},
                    subcategory: {type: Type.STRING},
                  },
                  required: ['type', 'title', 'amount', 'category', 'walletId', 'date'],
                },
              },
            },
            required: ['transcript', 'transactions'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{"transcript":"","transactions":[]}').trim());
      res.json(parsed);
    } catch (error) {
      sendAiError(res, error, lang);
    }
  });

  // 2. Receipt Photo & SMS / Statement Scanner
  app.post('/api/ai/scan-receipt', async (req: Request, res: Response) => {
    const lang: 'bn' | 'en' = req.body?.language === 'bn' ? 'bn' : 'en';
    try {
      const {
        imageBase64,
        imageMimeType,
        rawText,
        categories = [],
        wallets = [],
        currency = '৳',
        todayDate = new Date().toISOString().slice(0, 10),
      } = req.body || {};

      if (!imageBase64 && !rawText) {
        res.status(400).json({
          error:
            lang === 'bn'
              ? 'রসিদের ছবি আপলোড করুন অথবা SMS/স্টেটমেন্ট টেক্সট পেস্ট করুন।'
              : 'Upload a receipt image or paste SMS/statement text.',
        });
        return;
      }

      const ai = getGeminiClient();
      const walletListStr = (wallets as Array<{id: string; name: string}>)
        .map((w) => `${w.id}: ${w.name}`)
        .join(', ');
      const catListStr = (categories as Array<{name: string; type: string}>)
        .map((c) => `${c.name} (${c.type})`)
        .join(', ');

      const instruction = [
        `You are a financial receipt, bazar memo, and mobile-banking SMS parser for CashTrace.`,
        `Today's date: ${todayDate}. Default currency: ${currency}. User language: ${lang === 'bn' ? 'Bengali' : 'English'}.`,
        `Wallets: ${walletListStr || 'cash: Cash'}.`,
        `Categories: ${catListStr || 'Shopping (expense), Food (expense)'}.`,
        `If given a store receipt photo with line items, return either a concise summary transaction OR grouped transactions if distinct categories apply, AND also list individual line items in 'shoppingItems' if it looks like grocery/bazar items.`,
        `If given bank/bKash/Nagad SMS alerts or statement lines, extract EVERY individual transaction (Cash In / Received -> income, Payment / Cash Out / Send Money -> expense).`,
        `Match walletId intelligently (e.g. bKash/Nagad SMS -> mobile wallet id if present, otherwise '${wallets?.[0]?.id || 'cash'}').`,
      ].join('\n');

      const parts: Array<{text: string} | {inlineData: {mimeType: string; data: string}}> = [];
      if (imageBase64 && imageMimeType) {
        parts.push({
          inlineData: {
            mimeType: String(imageMimeType),
            data: String(imageBase64),
          },
        });
      }
      parts.push({
        text: rawText
          ? `Parse this receipt / bKash / Nagad / Bank SMS or statement:\n${String(rawText).slice(0, 6000)}`
          : `Analyze this receipt or handwritten bazar memo image and extract the transactions and itemized items.`,
      });

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: {parts},
        config: {
          systemInstruction: instruction,
          thinkingConfig: {thinkingLevel: ThinkingLevel.LOW},
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              merchantOrSource: {type: Type.STRING},
              summary: {type: Type.STRING},
              transactions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: {type: Type.STRING, description: 'income | expense'},
                    title: {type: Type.STRING},
                    amount: {type: Type.NUMBER},
                    category: {type: Type.STRING},
                    walletId: {type: Type.STRING},
                    date: {type: Type.STRING, description: 'YYYY-MM-DD'},
                  },
                  required: ['type', 'title', 'amount', 'category', 'walletId', 'date'],
                },
              },
              shoppingItems: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: {type: Type.STRING},
                    quantity: {type: Type.STRING},
                    estimatedPrice: {type: Type.NUMBER},
                  },
                  required: ['name'],
                },
              },
            },
            required: ['merchantOrSource', 'summary', 'transactions', 'shoppingItems'],
          },
        },
      });

      const parsed = JSON.parse(
        (response.text ?? '{"merchantOrSource":"","summary":"","transactions":[],"shoppingItems":[]}').trim()
      );
      res.json(parsed);
    } catch (error) {
      sendAiError(res, error, lang);
    }
  });

  // 3. Monthly Financial Advisor Insights
  app.post('/api/ai/advisor', async (req: Request, res: Response) => {
    const lang: 'bn' | 'en' = req.body?.language === 'bn' ? 'bn' : 'en';
    try {
      const {monthTitle, currency = '৳', summary} = req.body || {};
      if (!summary) {
        res.status(400).json({error: 'Missing financial summary.'});
        return;
      }

      const ai = getGeminiClient();
      const instruction = [
        `You are a sharp, encouraging personal finance advisor inside CashTrace.`,
        `Respond strictly in ${lang === 'bn' ? 'natural, clear Bengali (বাংলা)' : 'clear, concise English'}.`,
        `Analyze the user's real numbers for ${monthTitle} (currency ${currency}).`,
        `Give practical, specific observations grounded strictly in the provided figures (never invent numbers not present in the summary).`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `Financial snapshot JSON:\n${JSON.stringify(summary)}`,
        config: {
          systemInstruction: instruction,
          thinkingConfig: {thinkingLevel: ThinkingLevel.LOW},
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              healthStatus: {type: Type.STRING, description: 'strong | balanced | caution'},
              headline: {type: Type.STRING},
              highlights: {
                type: Type.ARRAY,
                items: {type: Type.STRING},
              },
              actionableTips: {
                type: Type.ARRAY,
                items: {type: Type.STRING},
              },
              forecastNote: {type: Type.STRING},
            },
            required: ['healthStatus', 'headline', 'highlights', 'actionableTips', 'forecastNote'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error) {
      sendAiError(res, error, lang);
    }
  });

  // 4. Context-Aware Ledger & Debt Assistant Chat
  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    const lang: 'bn' | 'en' = req.body?.language === 'bn' ? 'bn' : 'en';
    try {
      const {message, history = [], financialContext = {}} = req.body || {};
      if (!message || !String(message).trim()) {
        res.status(400).json({error: lang === 'bn' ? 'প্রশ্ন লিখুন।' : 'Message is required.'});
        return;
      }

      const ai = getGeminiClient();
      const systemInstruction = [
        `You are CashTrace AI Assistant — a practical, concise personal finance, debt-planning, and budgeting helper.`,
        `Reply in ${lang === 'bn' ? 'Bengali (or matching the user language cleanly)' : 'English'}.`,
        `Always base numbers strictly on the user's live ledger context below. Keep answers concise, bulleted, and actionable. If asked to draft a polite debt reminder message ("taagada"), write a ready-to-copy message.`,
        `User Live Financial Context:\n${JSON.stringify(financialContext).slice(0, 12000)}`,
      ].join('\n\n');

      const historyText = (history as Array<{role: string; text: string}>)
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
        .join('\n');

      const prompt = historyText
        ? `Previous conversation:\n${historyText}\n\nUser's new question:\n${String(message).slice(0, 2000)}`
        : String(message).slice(0, 2000);

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: prompt,
        config: {
          systemInstruction,
          thinkingConfig: {thinkingLevel: ThinkingLevel.LOW},
        },
      });

      res.json({reply: (response.text ?? '').trim()});
    } catch (error) {
      sendAiError(res, error, lang);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CashTrace server running on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start CashTrace server:', err);
  process.exit(1);
});
