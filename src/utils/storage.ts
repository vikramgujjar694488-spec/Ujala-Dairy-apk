import { DairyAppState } from '../types/dairy';

const STORAGE_KEY = 'ujalaa_dairy_state_v1';
const IDB_NAME = 'UjalaaDairyDB';
const IDB_STORE = 'appState';

export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentShiftByHour(): 'morning' | 'evening' {
  const hour = new Date().getHours();
  return hour < 14 ? 'morning' : 'evening';
}

export function createInitialEmptyState(): DairyAppState {
  return {
    dairyName: 'Ujalaa Dairy',
    dairyPhone: '',
    dairyAddress: '',
    language: 'hi',
    selectedDate: getTodayDateString(),
    selectedShift: getCurrentShiftByHour(),
    expenseCategories: [
      'परिवहन',
      'बिजली',
      'मशीन/उपकरण',
      'मजदूरी',
      'पशु-आहार',
      'मरम्मत',
      'अन्य खर्च',
    ],
    // Rule 1.7: No demo farmers, fake milk entries, fake sales, or fake amounts pre-populated!
    farmers: [],
    collections: [],
    leaves: [],
    sales: [],
    advancesAndPayments: [],
    cattleFeed: [],
    expenses: [],
    rateCharts: {
      cow: null,
      buffalo: null,
    },
    bills: [],
  };
}

function saveToIndexedDB(state: DairyAppState): void {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return;
  try {
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(state, STORAGE_KEY);
    };
  } catch {
    // Ignore IndexedDB errors if restricted
  }
}

export function loadStateFromIndexedDB(): Promise<DairyAppState | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      resolve(null);
      return;
    }
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, 'readonly');
        const getReq = tx.objectStore(IDB_STORE).get(STORAGE_KEY);
        getReq.onsuccess = () => {
          resolve((getReq.result as DairyAppState) || null);
        };
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function loadDairyState(): DairyAppState {
  const initial = createInitialEmptyState();
  if (typeof window === 'undefined') return initial;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw);
    return sanitizeAndMergeState(parsed);
  } catch {
    return initial;
  }
}

export function saveDairyState(state: DairyAppState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveToIndexedDB(state);
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

export function sanitizeAndMergeState(raw: any): DairyAppState {
  const base = createInitialEmptyState();
  if (!raw || typeof raw !== 'object') return base;

  // Deduplicate arrays by id
  const dedup = <T extends { id: string }>(arr: any): T[] => {
    if (!Array.isArray(arr)) return [];
    const map = new Map<string, T>();
    for (const item of arr) {
      if (item && typeof item === 'object' && typeof item.id === 'string') {
        map.set(item.id, item as T);
      }
    }
    return Array.from(map.values());
  };

  return {
    dairyName: typeof raw.dairyName === 'string' && raw.dairyName.trim() ? raw.dairyName : base.dairyName,
    dairyPhone: typeof raw.dairyPhone === 'string' ? raw.dairyPhone : '',
    dairyAddress: typeof raw.dairyAddress === 'string' ? raw.dairyAddress : '',
    language: raw.language === 'en' ? 'en' : 'hi',
    selectedDate:
      typeof raw.selectedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.selectedDate)
        ? raw.selectedDate
        : base.selectedDate,
    selectedShift: raw.selectedShift === 'evening' ? 'evening' : 'morning',
    expenseCategories:
      Array.isArray(raw.expenseCategories) && raw.expenseCategories.length > 0
        ? Array.from(new Set(raw.expenseCategories.map(String)))
        : base.expenseCategories,
    farmers: dedup(raw.farmers),
    collections: dedup(raw.collections),
    leaves: dedup(raw.leaves),
    sales: dedup(raw.sales),
    advancesAndPayments: dedup(raw.advancesAndPayments),
    cattleFeed: dedup(raw.cattleFeed),
    expenses: dedup(raw.expenses),
    rateCharts: {
      cow: raw.rateCharts?.cow && typeof raw.rateCharts.cow === 'object' ? raw.rateCharts.cow : null,
      buffalo:
        raw.rateCharts?.buffalo && typeof raw.rateCharts.buffalo === 'object'
          ? raw.rateCharts.buffalo
          : null,
    },
    bills: dedup(raw.bills),
  };
}

export function validateBackupJson(jsonString: string): {
  valid: boolean;
  state: DairyAppState | null;
  errorHi: string | null;
  errorEn: string | null;
} {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return {
        valid: false,
        state: null,
        errorHi: 'अमान्य बैकअप फ़ाइल: JSON ऑब्जेक्ट नहीं मिला।',
        errorEn: 'Invalid backup file: Not a valid JSON object.',
      };
    }
    const payload = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    if (!Array.isArray(payload.farmers) || !Array.isArray(payload.collections)) {
      return {
        valid: false,
        state: null,
        errorHi: 'अमान्य बैकअप फ़ाइल: इसमें किसान या दूध कलेक्शन संरचना मौजूद नहीं है।',
        errorEn: 'Invalid backup file: Missing farmers or collections structure.',
      };
    }
    return {
      valid: true,
      state: sanitizeAndMergeState(payload),
      errorHi: null,
      errorEn: null,
    };
  } catch {
    return {
      valid: false,
      state: null,
      errorHi: 'अमान्य JSON फ़ाइल: फ़ाइल पढ़ने में त्रुटि हुई।',
      errorEn: 'Invalid JSON file: Failed to parse JSON.',
    };
  }
}
