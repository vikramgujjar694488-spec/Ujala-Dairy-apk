import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

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

      const promptText = `You are an expert Indian Dairy Milk Collection Slip, Multi-Farmer Register & Farmer Passbook OCR reader (Hindi & English).
Read ALL handwritten or printed milk collection entries from this single photo.
Default Date context (if year/month is omitted on the slip): ${defaultDate || new Date().toISOString().slice(0, 10)}
Default Shift context (if shift is omitted on the slip): ${defaultShift || 'morning'}
${farmerContext}

Strict Rules for Extracting Milk Entries:
1. Single Farmer OR Multiple Farmers on One Page:
   - A photo may contain 1 entry, multiple entries for different farmers on a register page, OR multiple entries for 1 farmer across different dates and Morning/Evening shifts on a passbook/card.
   - Extract EVERY valid milk entry row from the page into the "entries" array.
2. Farmer Matching Priority (Name FIRST, Code SECOND):
   - First check if the Farmer Name (किसान का नाम in Hindi or English, e.g. "रामलाल", "Ramlal") is written and matches a registered farmer's Name. If it matches, set farmerName (and farmerCode) to that registered farmer.
   - If Farmer Name is not written or does not match, match by Farmer Code / ID (कोड / क्र., e.g. "101", "1", "05").
   - If a single farmer's Name or Code is written at the top header of a card/passbook page, copy that farmerName and farmerCode to ALL date/shift rows below it.
3. Multi-Date & Morning/Evening Shift Extraction:
   - If a date is written (e.g., "21/10/2026", "21-10", "दिनांक 21", or day column "1", "2", ... "25"), output it in "date" (prefer YYYY-MM-DD using defaultDate's year/month when only day or DD/MM is shown).
   - If shift is written ("सुबह", "सवेरे", "Morning", "AM", "M" -> "morning"; "शाम", "सांझ", "Evening", "PM", "E" -> "evening"), output "morning" or "evening" in "shift".
   - IMPORTANT: If a single date row has BOTH Morning (सुबह) and Evening (शाम) columns with milk quantities, output TWO separate objects in "entries" for that date — one with shift: "morning" and one with shift: "evening".
4. Quantities & Quality:
   - Liters / Quantity (मात्रा / लीटर / वजन, e.g., 5.250, 10, 4.5; if 4 digits like 5258 for quantity, interpret as 5.258).
   - FAT (फैट, typically 2.5 to 11.0; if 2 digits like 45 or 62 without dot, convert to 4.5 or 6.2).
   - SNF (एसएनएफ / डिग्री, typically 7.0 to 10.5; if 2 digits like 85 or 88 without dot, convert to 8.5 or 8.8; if SNF is not written, set snf to 8.5).
   - Optional Rate per liter (दर / रेट) if explicitly written.
5. Also include rawTextSummary with all text, dates, shifts, names, and numbers visible on the page.`;

      const candidateModels = [
        'gemini-3.1-flash-lite',
        'gemini-flash-latest',
        'gemini-3.8-flash',
      ];

      let lastErr: unknown = null;
      for (const modelName of candidateModels) {
        try {
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
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  rawTextSummary: {
                    type: Type.STRING,
                    description: 'Transcription of all text, dates, shifts, names, and numbers seen on the page',
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
                          description: 'Entry date if visible on row or page header (YYYY-MM-DD or DD/MM/YYYY or day number)',
                        },
                        shift: {
                          type: Type.STRING,
                          description: 'Shift if visible: "morning" (सुबह) or "evening" (शाम)',
                        },
                        liters: {
                          type: Type.NUMBER,
                          description: 'Milk quantity in liters (e.g. 5.25)',
                        },
                        fat: {
                          type: Type.NUMBER,
                          description: 'Milk FAT value (e.g. 4.5)',
                        },
                        snf: {
                          type: Type.NUMBER,
                          description: 'Milk SNF value (e.g. 8.5, default 8.5 if not shown)',
                        },
                        rate: {
                          type: Type.NUMBER,
                          description: 'Optional rate per liter if explicitly written on slip',
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
          const entries = Array.isArray(parsed.entries)
            ? parsed.entries.map((en: Record<string, unknown>) => ({
                ...en,
                snf: Number(en.snf) > 0 ? Number(en.snf) : 8.5,
              }))
            : [];
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
