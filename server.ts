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

      const promptText = `You are an ultra-accurate Indian Dairy Milk Collection Slip, PDF Bill, Multi-Farmer Register & 10-Day Farmer Passbook Vision/PDF AI (Hindi & English).
Read ALL handwritten or printed milk collection entries from this document/photo with ZERO mistakes.
Default Date context (if year/month is omitted on the slip): ${defaultDate || new Date().toISOString().slice(0, 10)}
Default Shift context (if shift is omitted on the slip): ${defaultShift || 'morning'}
${farmerContext}

Strict Rules for Zero-Error Extraction:
1. First Identify the Farmer Name (कि.नाम / किसान का नाम) and Match Registered Farmers:
   - Look for the Farmer Name FIRST on the page header or on each row (e.g. "5 – पवन बैरागी", "3 – रघुवीर जी", "रामलाल गुर्जर").
   - Match the Farmer Name against the Registered Farmers list above FIRST. When matched, output the EXACT registered "farmerName" and "farmerCode" from the Registered Farmers list!
   - NEVER invent or fabricate new farmer names from headers, labels, or noise text.
   - If the document is a single-farmer 10-day bill or passbook with the farmer's name at the top, apply that registered farmer's name and code to every entry row in the document.
2. Read the Fields After Farmer Name (Date, Shift, FAT, SNF, Rate, Qty/Liters, Amount):
   - Carefully check column headers or units ("L"/"लीटर" = liters/qty, "FAT"/"फैट" = fat, "SNF" = snf, "₹/L"/"रेट"/"दर" = rate, "₹"/"कुल रकम" = amount).
   - Note that some tables order columns as [Date, Shift, Qty(L), FAT, SNF, Rate, Amount] while others order them as [Date, Shift, FAT, SNF, Rate, Qty(L), Amount]. Always place milk quantity (Liters) in "liters" and price per liter (₹/L) in "rate"!
3. Ignore ALL Summary, Total, Balance, and Payment Rows:
   - NEVER include rows like "कुल योग", "सुबह का टोटल", "शाम का टोटल", "सुबह + शाम का कुल टोटल", "पिछला बकाया", "एडवांस", "अंतिम शेष देय रकम", "भुगतान", "Total", "Grand Total", "औसत" as milk entries.
4. Mathematical Self-Verification (CRITICAL FOR ZERO MISTAKES):
   - If Rate (दर) and Amount (रकम/राशि) are visible on a row, verify that Liters × Rate ≈ Amount.
   - If Liters and Rate were swapped (e.g. liters is 45.90 and rate is 1.96), swap them back so Rate is in 18..120 ₹/L and Liters is the milk quantity!
   - FAT must be between 2.5 and 11.5 (if written as 2 digits without decimal like 45 or 62, convert to 4.5 or 6.2).
   - SNF must be between 7.0 and 10.5 (if written as 2 digits like 85 or 88, convert to 8.5 or 8.8; if SNF is not written on the slip, set snf to 8.5).
5. Multi-Date & Morning/Evening Shift Extraction:
   - Read the exact date from the top header (e.g. "आज की दूध कलेक्शन (26-10-2026)" or "दिनांक: 26/10/2026") or row and output "date" in YYYY-MM-DD or DD-MM-YYYY format.
   - Output "shift" as "morning" (सुबह/AM/M) or "evening" (शाम/PM/E). If a single date row has BOTH Morning and Evening milk quantities, output TWO separate entry objects for that date.
6. Strictly ONE Entry Per Farmer Card/Row (No Duplicates):
   - Never split a single farmer's card or row into 2 or 3 separate entries. Output only ONE entry per farmer for a given date, shift, and animal type.`;

      const candidateModels = [
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite-preview',
        'gemini-2.5-flash',
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
                          description: 'Farmer name matched from Registered Farmers or visible on row/header',
                        },
                        farmerCode: {
                          type: Type.STRING,
                          description: 'Farmer ID or code matched from Registered Farmers or visible on row/header',
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
                          description: 'Milk quantity in liters (Qty L, e.g. 1.96 or 5.25)',
                        },
                        fat: {
                          type: Type.NUMBER,
                          description: 'Milk FAT percentage between 2.5 and 11.5 (e.g. 5.3)',
                        },
                        snf: {
                          type: Type.NUMBER,
                          description: 'Milk SNF percentage between 7.0 and 10.5 (e.g. 8.3, default 8.5 if not shown)',
                        },
                        rate: {
                          type: Type.NUMBER,
                          description: 'Optional rate per liter (₹/L, e.g. 45.90) if written on slip',
                        },
                        amount: {
                          type: Type.NUMBER,
                          description: 'Optional total amount (₹, e.g. 89) if written on slip, used to verify Liters * Rate = Amount',
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
          const mappedEntries = rawEntries
            .filter((en: Record<string, unknown>) => {
              const nameStr = String(en.farmerName || '').toLowerCase().trim();
              if (
                /^(total|grand\s*total|sub\s*total|morning\s*total|evening\s*total|कुल|योग|कुल\s*योग|औसत|average|सुबह\s*का\s*टोटल|शाम\s*का\s*टोटल|कुल\s*दूध|पिछला\s*बकाया|एडवांस|शेष\s*देय)$/.test(
                  nameStr
                )
              ) {
                return false;
              }
              return Number(en.liters) > 0 && Number(en.fat) > 0;
            })
            .map((en: Record<string, unknown>) => {
              let liters = Number(en.liters) || 0;
              const fat = Number(en.fat) || 0;
              const snf = Number(en.snf) > 0 ? Number(en.snf) : 8.5;
              let rate = Number(en.rate) > 0 ? Number(en.rate) : undefined;
              const amount = Number(en.amount) > 0 ? Number(en.amount) : undefined;

              // Guard against Rate & Liters being swapped (e.g. when columns are FAT | SNF | Rate | Qty)
              if (rate && liters >= 22 && liters <= 115 && rate < 22) {
                const tmp = liters;
                liters = rate;
                rate = tmp;
              }

              // Mathematical self-correction: if Rate and Amount are present and Liters was misread
              if (rate && rate >= 15 && rate <= 120 && amount && amount >= 10) {
                const expectedLiters = amount / rate;
                if (
                  expectedLiters >= 0.2 &&
                  expectedLiters <= 200 &&
                  Math.abs(liters * rate - amount) > Math.max(3, amount * 0.05)
                ) {
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

          // Deduplicate entries by (farmerCode || farmerName, date, shift, milkType) unless single-farmer 5+ passbook
          const distinctFarmers = new Set(
            mappedEntries
              .map((e: Record<string, unknown>) => String(e.farmerCode || e.farmerName || '').trim())
              .filter(Boolean)
          );
          const distinctDates = new Set(
            mappedEntries.map((e: Record<string, unknown>) => String(e.date || '').trim()).filter(Boolean)
          );
          const isSingleFarmerPassbook =
            mappedEntries.length >= 5 && distinctFarmers.size <= 1 && distinctDates.size <= 1;

          const entries: Record<string, unknown>[] = [];
          const seenKeys = new Set<string>();
          for (const en of mappedEntries) {
            if (isSingleFarmerPassbook) {
              entries.push(en);
              continue;
            }
            const fKey = String(en.farmerCode || en.farmerName || '')
              .trim()
              .toLowerCase();
            if (!fKey) {
              entries.push(en);
              continue;
            }
            const dKey = String(en.date || defaultDate || '').trim();
            const sKey = String(en.shift || defaultShift || 'morning')
              .trim()
              .toLowerCase();
            const mKey = String(
              en.milkType || (Number(en.fat) > 5.0 ? 'buffalo' : 'cow')
            )
              .trim()
              .toLowerCase();
            const compKey = `${fKey}|${dKey}|${sKey}|${mKey}`;
            if (!seenKeys.has(compKey)) {
              seenKeys.add(compKey);
              entries.push(en);
            }
          }

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
