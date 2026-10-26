import { DairyAppState, Farmer } from '../types/dairy';
import { normalizeFarmerShiftSchedule } from './dairyCalculations';

const STORAGE_KEY = 'ujalaa_dairy_state_v1';
const IDB_NAME = 'UjalaaDairyDB';
const IDB_STORE = 'appState';

export function getTodayDateString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns 'morning' before 12:00 PM (noon) and 'evening' from 12:00 PM onwards.
 */
export function getCurrentShiftByHour(now: Date = new Date()): 'morning' | 'evening' {
  const hour = now.getHours();
  return hour < 12 ? 'morning' : 'evening';
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
    customers: [],
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
          const res = getReq.result;
          resolve(res ? sanitizeAndMergeState(res) : null);
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

function normalizeFarmerRecord(f: any): Farmer {
  return {
    ...f,
    code: String(f?.code || '').trim(),
    name: String(f?.name || '').trim(),
    mobile: typeof f?.mobile === 'string' ? f.mobile : '',
    village: typeof f?.village === 'string' ? f.village : '',
    shiftSchedule: normalizeFarmerShiftSchedule(f?.shiftSchedule),
    openingBalance: Number(f?.openingBalance) || 0,
    notes: typeof f?.notes === 'string' ? f.notes : '',
    active: f?.active !== false,
    createdAt: typeof f?.createdAt === 'string' ? f.createdAt : '',
  };
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
    // Always sync to today's real local date and current shift (before 12 PM = morning, after 12 PM = evening)
    selectedDate: getTodayDateString(),
    selectedShift: getCurrentShiftByHour(),
    expenseCategories:
      Array.isArray(raw.expenseCategories) && raw.expenseCategories.length > 0
        ? Array.from(new Set(raw.expenseCategories.map(String)))
        : base.expenseCategories,
    farmers: dedup<Farmer>(raw.farmers).map(normalizeFarmerRecord),
    customers: dedup(raw.customers),
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

export interface LocalBackupSnapshot {
  id: string;
  label: string;
  createdAt: string;
  farmersCount: number;
  customersCount: number;
  collectionsCount: number;
  salesCount: number;
  state: DairyAppState;
}

const SNAPSHOTS_KEY = 'ujalaa_dairy_snapshots_v1';

export function mergeDairyStates(
  current: DairyAppState,
  incoming: DairyAppState
): DairyAppState {
  const mergeById = <T extends { id: string }>(a: T[], b: T[]): T[] => {
    const map = new Map<string, T>();
    for (const item of a || []) {
      if (item && item.id) map.set(item.id, item);
    }
    for (const item of b || []) {
      if (item && item.id) map.set(item.id, item);
    }
    return Array.from(map.values());
  };

  return {
    ...current,
    selectedDate: getTodayDateString(),
    selectedShift: getCurrentShiftByHour(),
    dairyName:
      incoming.dairyName && incoming.dairyName !== 'Ujalaa Dairy'
        ? incoming.dairyName
        : current.dairyName || incoming.dairyName,
    dairyPhone: incoming.dairyPhone || current.dairyPhone,
    dairyAddress: incoming.dairyAddress || current.dairyAddress,
    expenseCategories: Array.from(
      new Set([...(current.expenseCategories || []), ...(incoming.expenseCategories || [])])
    ),
    farmers: mergeById(current.farmers, incoming.farmers).map(normalizeFarmerRecord),
    customers: mergeById(current.customers || [], incoming.customers || []),
    collections: mergeById(current.collections, incoming.collections),
    leaves: mergeById(current.leaves, incoming.leaves),
    sales: mergeById(current.sales, incoming.sales),
    advancesAndPayments: mergeById(current.advancesAndPayments, incoming.advancesAndPayments),
    cattleFeed: mergeById(current.cattleFeed, incoming.cattleFeed),
    expenses: mergeById(current.expenses, incoming.expenses),
    rateCharts: {
      cow: incoming.rateCharts?.cow || current.rateCharts?.cow || null,
      buffalo: incoming.rateCharts?.buffalo || current.rateCharts?.buffalo || null,
    },
    bills: mergeById(current.bills, incoming.bills),
  };
}

export function loadBackupSnapshots(): LocalBackupSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object' && item.id && item.state)
      .map((item) => ({
        ...item,
        state: sanitizeAndMergeState(item.state),
      }));
  } catch {
    return [];
  }
}

export function saveBackupSnapshot(
  state: DairyAppState,
  customLabel?: string
): LocalBackupSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const existing = loadBackupSnapshots();
    const now = new Date();
    const snap: LocalBackupSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label:
        customLabel?.trim() ||
        `बैकअप ${now.toLocaleDateString('hi-IN')} ${now.toTimeString().slice(0, 5)}`,
      createdAt: now.toISOString(),
      farmersCount: state.farmers.length,
      customersCount: (state.customers || []).length,
      collectionsCount: state.collections.length,
      salesCount: state.sales.length,
      state: sanitizeAndMergeState(state),
    };
    const updated = [snap, ...existing].slice(0, 8);
    window.localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return loadBackupSnapshots();
  }
}

export function deleteBackupSnapshot(snapshotId: string): LocalBackupSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const updated = loadBackupSnapshots().filter((s) => s.id !== snapshotId);
    window.localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function serializeBackupPayload(state: DairyAppState): string {
  const payload = {
    app: 'Ujalaa Dairy',
    version: '1.1',
    exportedAt: new Date().toISOString(),
    data: state,
  };
  return JSON.stringify(payload, null, 2);
}

export function triggerReliableFileDownload(
  filename: string,
  content: string,
  mimeType = 'application/json;charset=utf-8'
): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const blob = new Blob([content], { type: mimeType });
    const nav = window.navigator as any;
    if (nav && typeof nav.msSaveOrOpenBlob === 'function') {
      nav.msSaveOrOpenBlob(blob, filename);
      return true;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        // ignore cleanup error
      }
    }, 1500);
    return true;
  } catch {
    try {
      // Fallback to Data URI for strict mobile WebViews / installed PWAs
      const dataUri = `data:${mimeType},${encodeURIComponent(content)}`;
      const a = document.createElement('a');
      a.href = dataUri;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    } catch {
      return false;
    }
  }
}

export function validateBackupJson(jsonString: string): {
  valid: boolean;
  state: DairyAppState | null;
  errorHi: string | null;
  errorEn: string | null;
} {
  try {
    let cleaned = (jsonString || '').trim();
    if (!cleaned) {
      return {
        valid: false,
        state: null,
        errorHi: 'बैकअप डेटा खाली है। कृपया वैध JSON फ़ाइल चुनें या कोड पेस्ट करें।',
        errorEn: 'Backup data is empty. Please select a valid JSON file or paste backup code.',
      };
    }

    // Strip BOM or markdown code fences if user copied from WhatsApp/chat
    cleaned = cleaned.replace(/^\uFEFF/, '');
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object') {
      return {
        valid: false,
        state: null,
        errorHi: 'अमान्य बैकअप फ़ाइल: JSON ऑब्जेक्ट नहीं मिला।',
        errorEn: 'Invalid backup file: Not a valid JSON object.',
      };
    }
    const payload = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    const hasRecognizedArrays =
      Array.isArray(payload.farmers) ||
      Array.isArray(payload.collections) ||
      Array.isArray(payload.sales) ||
      Array.isArray(payload.customers) ||
      (payload.rateCharts && typeof payload.rateCharts === 'object');

    if (!hasRecognizedArrays) {
      return {
        valid: false,
        state: null,
        errorHi: 'अमान्य बैकअप फ़ाइल: इसमें डेयरी डेटा (किसान, दूध कलेक्शन या बिक्री) नहीं मिला।',
        errorEn: 'Invalid backup file: Missing dairy data structure.',
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
      errorHi: 'अमान्य JSON डेटा: फ़ाइल या पेस्ट किए गए कोड को पढ़ने में त्रुटि हुई।',
      errorEn: 'Invalid JSON data: Failed to parse backup JSON.',
    };
  }
}

