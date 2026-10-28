import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Enable CORS so installed Android APK / Capacitor WebView can also call /api/scan-milk-slip
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '15mb' }));

  // POST /api/scan-milk-slip — Extracts handwritten or printed milk collection entries from a photo
  app.post('/api/scan-milk-slip', async (req, res) => {
    try {
      const { imageBase64, mimeType, farmers, defaultDate, defaultShift } = req.body || {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Photo data (imageBase64) is required.' });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const farmerContext =
        Array.isArray(farmers) && farmers.length > 0
          ? `Registered Farmers in this dairy:\n${farmers
              .map((f: { code?: string; name?: string }) => `- Name: "${f.name}", Code: "${f.code}"`)
              .join('\n')}`
          : 'No registered farmer list provided.';

      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

      const promptText = `You are an ultra-accurate Indian Dairy Milk Collection Slip, Multi-Farmer Register & 10-Day Farmer Passbook Vision AI (Hindi & English).
Read ALL handwritten or printed milk collection entries from this photo with ZERO mistakes.
Default Date context (if year/month is omitted on the slip): ${defaultDate || new Date().toISOString().slice(0, 10)}
Default Shift context (if shift is omitted on the slip): ${defaultShift || 'morning'}
${farmerContext}

Strict Rules for Zero-Error Extraction:
1. Identify the Document Layout First:
   - Layout A (Single Thermal Slip / Analyzer Receipt): Contains 1 entry with fields like Date (दिनांक/तारीख), Shift (सुबह/शाम/Morning/Evening/AM/PM), Code (कोड/ID), Name (नाम), Cattle/Milk Type (गाय/भैंस/Cow/Buffalo), Qty/Weight/Liters (मात्रा/लीटर/वजन), FAT (फैट), SNF/CLR (एसएनएफ/डिग्री), Rate (दर/रेट), and Total Amount (कुल राशि/रकम).
   - Layout B (Single-Farmer 10-11 Day Passbook Card, e.g. Dates 1-10, 11-20, or 21-31): Header has 1 Farmer's Name & Code. Rows have a Day/Date column (e.g. 1..10, 11..20, or 21..31), followed by Liters, FAT, SNF, Rate, Amount (sometimes separate Morning सुबह and Evening शाम sections or side-by-side columns). Copy the header Farmer Name & Code to every row.
   - Layout C (Multi-Farmer Daily Register Page): Each row is a different farmer (Code, Name, Liters, FAT, SNF, Rate, Amount).
2. Ignore Summary / Total Rows:
   - NEVER include bottom total/summary rows ("कुल योग", "Total", "Grand Total", "औसत") as a milk entry.
3. Mathematical Self-Verification (CRITICAL FOR ZERO MISTAKES):
   - If Rate (दर) and Amount (रकम/राशि) are visible on a row, verify that Liters × Rate ≈ Amount.
   - If a handwritten digit in Liters is ambiguous (e.g. 5.5 vs 5.8, or missing decimal point), compute Amount ÷ Rate to confirm the exact Liters!
   - FAT must be between 2.5 and 11.5 (if written as 2 digits without decimal like 45 or 62, convert to 4.5 or 6.2).
   - SNF must be between 7.0 and 10.5 (if written as 2 digits like 85 or 88, convert to 8.5 or 8.8; if SNF is not written on the slip, set snf to 8.5).
   - Do NOT confuse Rate (typically 25 to 90 ₹/L) or Amount (₹) with Liters, FAT, or SNF.
4. Farmer Matching Priority (Name FIRST, Code SECOND):
   - Match Farmer Name against the Registered Farmers list first. If matched, output the exact registered farmerName and farmerCode.
   - Otherwise output the exact farmerName and farmerCode written on the slip.
5. Multi-Date & Morning/Evening Shift Extraction:
   - Output "date" in YYYY-MM-DD format (using defaultDate's year and month if only day 1..31 or DD/MM is written).
   - Output "shift" as "morning" (सुबह/AM/M) or "evening" (शाम/PM/E). If a single date row has BOTH Morning and Evening milk quantities, output TWO separate entry objects for that date.`;

      const candidateModels = [
        'gemini-3-flash-preview',
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite-preview',
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
      ];

      let lastErr: unknown = null;
      for (const modelName of candidateModels) {
        try {
          const isGemini3 = modelName.startsWith('gemini-3');
          const response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType || 'image/jpeg',
                    data: cleanBase64,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
            config: {
              ...(isGemini3 ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  rawTextSummary: {
                    type: Type.STRING,
                    description: 'Complete transcription of all text, dates, shifts, names, and numbers seen on the slip',
                  },
                  entries: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        farmerName: {
                          type: Type.STRING,
                          description: 'Farmer name if visible on row or page header (e.g. रामलाल गुर्जर)',
                        },
                        farmerCode: {
                          type: Type.STRING,
                          description: 'Farmer ID or code if visible on row or page header (e.g. 101)',
                        },
                        date: {
                          type: Type.STRING,
                          description: 'Entry date in YYYY-MM-DD or DD-MM-YYYY or day number (1-31)',
                        },
                        shift: {
                          type: Type.STRING,
                          description: 'Shift: "morning" (सुबह) or "evening" (शाम)',
                        },
                        milkType: {
                          type: Type.STRING,
                          description: 'Optional milk type if explicitly written: "cow" (गाय) or "buffalo" (भैंस)',
                        },
                        liters: {
                          type: Type.NUMBER,
                          description: 'Milk quantity in liters (e.g. 5.25)',
                        },
                        fat: {
                          type: Type.NUMBER,
                          description: 'Milk FAT percentage between 2.5 and 11.5 (e.g. 4.5)',
                        },
                        snf: {
                          type: Type.NUMBER,
                          description: 'Milk SNF percentage between 7.0 and 10.5 (e.g. 8.5, default 8.5 if not shown)',
                        },
                        rate: {
                          type: Type.NUMBER,
                          description: 'Optional rate per liter (₹/L) if written on slip',
                        },
                        amount: {
                          type: Type.NUMBER,
                          description: 'Optional total amount (₹) if written on slip, used to verify Liters * Rate = Amount',
                        },
                      },
                      required: ['liters', 'fat'],
                    },
                  },
                },
                required: ['entries'],
              },
            },
          });

          const rawJson = (response.text || '{}').trim();
          const parsed = JSON.parse(rawJson);
          const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
          const entries = rawEntries
            .filter((en: Record<string, unknown>) => {
              const nameStr = String(en.farmerName || '').toLowerCase();
              if (/^(total|grand\s*total|कुल|योग|कुल\s*योग|औसत|average)$/.test(nameStr.trim())) {
                return false;
              }
              return Number(en.liters) > 0 && Number(en.fat) > 0;
            })
            .map((en: Record<string, unknown>) => {
              let liters = Number(en.liters) || 0;
              const fat = Number(en.fat) || 0;
              const snf = Number(en.snf) > 0 ? Number(en.snf) : 8.5;
              const rate = Number(en.rate) > 0 ? Number(en.rate) : undefined;
              const amount = Number(en.amount) > 0 ? Number(en.amount) : undefined;

              // Mathematical self-correction: if Rate and Amount are present and Liters was misread (e.g. missing decimal 55 -> 5.5)
              if (rate && rate >= 15 && rate <= 120 && amount && amount >= 10) {
                const expectedLiters = amount / rate;
                if (
                  expectedLiters >= 0.2 &&
                  expectedLiters <= 200 &&
                  Math.abs(liters * rate - amount) > Math.max(3, amount * 0.05)
                ) {
                  // Check if scaling liters by 10 or 100 or rounding expectedLiters matches
                  const roundedExpected = Math.round(expectedLiters * 100) / 100;
                  if (Math.abs(roundedExpected * rate - amount) <= 2.5) {
                    liters = roundedExpected;
                  }
                }
              }

              return {
                ...en,
                liters,
                fat,
                snf,
                rate,
                amount,
              };
            });

          res.json({
            entries,
            rawTextSummary: parsed.rawTextSummary || '',
            model: modelName,
          });
          return;
        } catch (err) {
          lastErr = err;
        }
      }

      const msg = lastErr instanceof Error ? lastErr.message : 'Failed to scan milk slip image';
      res.status(500).json({ error: msg });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to scan milk slip image';
      res.status(500).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ujalaa Dairy server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
