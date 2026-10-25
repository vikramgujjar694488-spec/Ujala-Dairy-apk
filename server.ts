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

  app.use(express.json({ limit: '15mb' }));

  // POST /api/scan-milk-slip — Extracts handwritten or printed milk collection entries from a photo
  app.post('/api/scan-milk-slip', async (req, res) => {
    try {
      const { imageBase64, mimeType, farmers } = req.body || {};
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

      const farmerContext = Array.isArray(farmers) && farmers.length > 0
        ? `Registered Farmers in this dairy:\n${farmers
            .map((f: { code?: string; name?: string }) => `- Code: "${f.code}", Name: "${f.name}"`)
            .join('\n')}`
        : 'No registered farmer list provided.';

      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: cleanBase64,
              },
            },
            {
              text: `You are an expert Indian Dairy Milk Collection Slip / Register OCR reader (Hindi & English).
Read all handwritten or printed milk collection entries from this photo.
${farmerContext}

Rules for extracting milk entries:
1. Each entry typically has:
   - Farmer Code / ID (e.g., "101", "1", "05") and/or Farmer Name (in Hindi or English, e.g., "रामलाल", "Ramlal"). Match to the closest registered farmer if possible.
   - Liters / Quantity (मात्रा / लीटर / वजन, e.g., 5.250, 10, 4.5). Note: If written as 4 digits like 5258 for quantity, interpret as 5.258 liters.
   - FAT (फैट, typically between 2.5 and 11.0, e.g., 4.5, 6.2. If written as 2 digits like 45 or 62 without a dot, convert to 4.5 or 6.2).
   - SNF (एसएनएफ / डिग्री, typically between 7.0 and 10.5, e.g., 8.5, 8.8. If written as 2 digits like 85 or 88 without a dot, convert to 8.5 or 8.8).
   - Optional Rate per liter (दर / रेट, e.g., 40, 48.25) if written on the slip.
2. Return all detected milk collection entries in the structured JSON array.`,
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
                description: 'Brief transcription of text/numbers seen on the slip',
              },
              entries: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    farmerCode: {
                      type: Type.STRING,
                      description: 'Farmer ID or code if visible (e.g. 101)',
                    },
                    farmerName: {
                      type: Type.STRING,
                      description: 'Farmer name if visible (e.g. रामलाल)',
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
                      description: 'Milk SNF value (e.g. 8.5)',
                    },
                    rate: {
                      type: Type.NUMBER,
                      description: 'Optional rate per liter if explicitly written on slip',
                    },
                  },
                  required: ['liters', 'fat', 'snf'],
                },
              },
            },
            required: ['entries'],
          },
        },
      });

      const rawJson = (response.text || '{}').trim();
      const parsed = JSON.parse(rawJson);
      res.json({
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        rawTextSummary: parsed.rawTextSummary || '',
      });
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
