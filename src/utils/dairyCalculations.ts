import {
  AdvancePaymentEntry,
  CattleFeedEntry,
  Customer,
  ExpenseEntry,
  Farmer,
  FarmerLeaveRecord,
  MilkCollectionEntry,
  MilkType,
  RateChartMatrix,
  ShiftType,
  TenDayBill,
  WholesaleSaleEntry,
} from '../types/dairy';

export function round2(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function round3(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 1000) / 1000;
}

/**
 * Farmer Milk Purchase Rule:
 * Drops all decimal digits after the point so 253.85 becomes 253 (whole integer).
 * Sales keep decimals via round2, whereas farmer purchases & 10-day bills use whole integers only.
 */
export function truncatePurchaseAmount(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.trunc(round2(val));
}

export function formatNumber(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return '—';
  }
  return val.toFixed(decimals);
}

export function formatCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return '—';
  }
  const sign = val < 0 ? '-' : '';
  const abs = Math.abs(val);
  return `${sign}₹${abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatWholeCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return '—';
  }
  const intVal = truncatePurchaseAmount(val);
  const sign = intVal < 0 ? '-' : '';
  const abs = Math.abs(intVal);
  return `${sign}₹${abs.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Formats any YYYY-MM-DD (or ISO / MM-DD) date string into DD-MM-YYYY (दिन-महीना-साल).
 * Examples:
 * - "2026-10-26" -> "26-10-2026"
 * - "2026-10-26T07:00:00Z" -> "26-10-2026"
 * - "10-26" -> "26-10"
 */
export function formatDateDMY(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const trimmed = String(dateStr).trim();
  if (!trimmed || trimmed === '—') return '—';

  const isoPrefixMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefixMatch) {
    return `${isoPrefixMatch[3]}-${isoPrefixMatch[2]}-${isoPrefixMatch[1]}`;
  }

  const slashYmdMatch = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (slashYmdMatch) {
    return `${slashYmdMatch[3]}-${slashYmdMatch[2]}-${slashYmdMatch[1]}`;
  }

  const dmyMatch = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[1]}-${dmyMatch[2]}-${dmyMatch[3]}`;
  }

  const mmDdMatch = trimmed.match(/^(\d{2})-(\d{2})$/);
  if (mmDdMatch) {
    return `${mmDdMatch[2]}-${mmDdMatch[1]}`;
  }

  return trimmed;
}

/**
 * Formats YYYY-MM month-year string into MM-YYYY (महीना-साल).
 * Example: "2026-10" -> "10-2026"
 */
export function formatMonthYear(yearMonth: string | null | undefined): string {
  if (!yearMonth) return '—';
  const trimmed = String(yearMonth).trim();
  if (!trimmed) return '—';
  const ymMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (ymMatch) {
    return `${ymMatch[2]}-${ymMatch[1]}`;
  }
  return trimmed;
}


/**
 * Requirement 2: Auto-Decimal System for FAT and SNF
 * - Typing "51" -> "5.1" (completedTwoDigits: true)
 * - Typing "50" -> "5.0" (completedTwoDigits: true)
 * - Typing "85" -> "8.5" (completedTwoDigits: true)
 * - Typing "86" -> "8.6" (completedTwoDigits: true)
 * - Supports backspace, manual decimal editing, and corrections cleanly.
 */
export function formatAutoDecimalFatSnf(
  newRaw: string,
  prevVal = ''
): { value: string; completed: boolean } {
  const cleaned = newRaw.replace(/[^0-9.]/g, '');
  if (!cleaned) {
    return { value: '', completed: false };
  }

  // Detect if user is deleting characters (Backspace)
  const isDeleting = newRaw.length < prevVal.length;
  if (isDeleting) {
    // If previous was "5.1" and user pressed backspace -> "5." -> return "5" for smooth backspace
    if (cleaned.endsWith('.') && prevVal.includes('.') && !newRaw.endsWith('.')) {
      return { value: cleaned.slice(0, -1), completed: false };
    }
    if (cleaned.length === 2 && cleaned.endsWith('.')) {
      return { value: cleaned.slice(0, 1), completed: false };
    }
    return { value: cleaned, completed: false };
  }

  // If user manually typed a dot, prevent multiple dots and allow up to 2 decimals
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    const intPart = parts[0].slice(0, 2);
    const decPart = parts.slice(1).join('').slice(0, 2);
    const formatted = `${intPart}.${decPart}`;
    // If 1+ integer digit and 1+ decimal digit were just completed via auto-dot or typing
    const completed = intPart.length >= 1 && decPart.length === 1 && prevVal === `${intPart}.`;
    return { value: formatted, completed };
  }

  // Pure digits typed without a dot:
  // 1 digit (e.g. "5") -> keep as "5"
  if (cleaned.length === 1) {
    return { value: cleaned, completed: false };
  }

  // 2 digits (e.g. "51" -> "5.1", "50" -> "5.0", "85" -> "8.5")
  if (cleaned.length === 2) {
    return {
      value: `${cleaned[0]}.${cleaned[1]}`,
      completed: true,
    };
  }

  // 3 digits (e.g. "105" -> "10.5" or "512" -> "5.12")
  if (cleaned.length >= 3) {
    const firstTwo = Number(cleaned.slice(0, 2));
    if (firstTwo >= 10 && firstTwo <= 15) {
      return {
        value: `${cleaned.slice(0, 2)}.${cleaned.slice(2, 3)}`,
        completed: true,
      };
    }
    return {
      value: `${cleaned[0]}.${cleaned.slice(1, 3)}`,
      completed: true,
    };
  }

  return { value: cleaned, completed: false };
}

/**
 * Requirement 3: Smart Auto-Entry for Milk Quantity (Liters)
 * Example: User types "5" then "258" -> "5.258" liters without needing to type a dot,
 * and auto-advances when 3 decimal digits are filled.
 * Also supports integer ("5"), 1-2 decimal values ("5.2", "5.25"), manual dots ("12.5"),
 * and two-digit liter mode when needed.
 */
export function formatSmartMilkQuantity(
  newRaw: string,
  prevVal = '',
  twoDigitLiterMode = false
): { value: string; completedThreeDecimals: boolean } {
  const cleaned = newRaw.replace(/[^0-9.]/g, '');
  if (!cleaned) {
    return { value: '', completedThreeDecimals: false };
  }

  const isDeleting = newRaw.length < prevVal.length;
  if (isDeleting) {
    if (cleaned.endsWith('.')) {
      return { value: cleaned.slice(0, -1), completedThreeDecimals: false };
    }
    return { value: cleaned, completedThreeDecimals: false };
  }

  const intDigitsTarget = twoDigitLiterMode ? 2 : 1;

  // If the string already contains a dot (either from previous auto-insertion or manual dot)
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    const intPart = parts[0] || '0';
    const decPart = parts.slice(1).join('').slice(0, 3);
    const val = `${intPart}.${decPart}`;
    return {
      value: val,
      completedThreeDecimals: decPart.length === 3,
    };
  }

  // No dot present yet in cleaned digits:
  if (cleaned.length <= intDigitsTarget) {
    return { value: cleaned, completedThreeDecimals: false };
  }

  // Insert decimal point automatically after intDigitsTarget digits
  const intPart = cleaned.slice(0, intDigitsTarget);
  const decPart = cleaned.slice(intDigitsTarget, intDigitsTarget + 3);
  return {
    value: `${intPart}.${decPart}`,
    completedThreeDecimals: decPart.length === 3,
  };
}

/**
 * Combines whole liters and decimal/ml digits into exact liter value
 * e.g. combineWholeAndDecimalLiters("5", "258") -> "5.258"
 */
export function combineWholeAndDecimalLiters(
  wholeStr: string,
  decStr: string
): { formatted: string; numeric: number; completedThreeDecimals: boolean } {
  const wClean = wholeStr.replace(/\D/g, '');
  const dClean = decStr.replace(/\D/g, '').slice(0, 3);
  if (!wClean && !dClean) {
    return { formatted: '', numeric: 0, completedThreeDecimals: false };
  }
  const w = wClean || '0';
  const formatted = dClean.length > 0 ? `${w}.${dClean}` : w;
  return {
    formatted,
    numeric: round3(Number(formatted) || 0),
    completedThreeDecimals: dClean.length === 3,
  };
}

/**
 * Rule 4 & 5: Automatic classification of Cow vs Buffalo milk based on FAT
 * FAT <= 5.0 => 'cow' (गाय का दूध)
 * FAT > 5.0  => 'buffalo' (भैंस का दूध)
 */
export function classifyMilkType(fat: number): MilkType {
  return fat <= 5.0 ? 'cow' : 'buffalo';
}

export function makeRateKey(fat: number, snf: number): string {
  return `${round2(fat).toFixed(2)}_${round2(snf).toFixed(2)}`;
}

/**
 * Exact lookup from Rate Chart Matrix without interpolation or guessing.
 */
export function lookupRateFromChart(
  chart: RateChartMatrix | null,
  fat: number | null | undefined,
  snf: number | null | undefined
): { found: boolean; rate: number | null; warningHi: string | null; warningEn: string | null } {
  if (fat === null || fat === undefined || !Number.isFinite(fat) || fat <= 0) {
    return {
      found: false,
      rate: null,
      warningHi: 'कृपया वैध FAT दर्ज करें।',
      warningEn: 'Please enter a valid FAT value.',
    };
  }
  if (snf === null || snf === undefined || !Number.isFinite(snf) || snf <= 0) {
    return {
      found: false,
      rate: null,
      warningHi: 'कृपया वैध SNF दर्ज करें।',
      warningEn: 'Please enter a valid SNF value.',
    };
  }
  if (!chart || Object.keys(chart.rates).length === 0) {
    const typeHi = chart?.milkType
      ? chart.milkType === 'cow'
        ? 'गाय'
        : 'भैंस'
      : classifyMilkType(fat) === 'cow'
      ? 'गाय'
      : 'भैंस';
    const typeEn = typeHi === 'गाय' ? 'Cow' : 'Buffalo';
    return {
      found: false,
      rate: null,
      warningHi: `दूध की राशि निकालने के लिए पहले ${typeHi} का रेट चार्ट इंपोर्ट करें।`,
      warningEn: `Please import the ${typeEn} rate chart first to calculate milk amount.`,
    };
  }

  const key = makeRateKey(fat, snf);
  const exactRate = chart.rates[key];
  if (exactRate !== undefined && Number.isFinite(exactRate) && exactRate > 0) {
    return {
      found: true,
      rate: round2(exactRate),
      warningHi: null,
      warningEn: null,
    };
  }

  return {
    found: false,
    rate: null,
    warningHi: `रेट चार्ट में FAT ${fat} और SNF ${snf} का सटीक रेट उपलब्ध नहीं है। अनुमानित रेट नहीं लगाया गया है।`,
    warningEn: `Exact rate for FAT ${fat} and SNF ${snf} is not available in the rate chart. No estimated rate applied.`,
  };
}

export interface CollectionSummary {
  entryCount: number;
  distinctFarmerCount: number;
  totalLiters: number;
  totalAmount: number;
  totalDeductions: number;
  totalNetPayable: number;
  avgFat: number | null;
  avgSnf: number | null;
  avgRate: number | null;
}

/**
 * Weighted average summary for milk collection entries:
 * avgFat = Σ(liters * fat) / totalLiters
 * avgSnf = Σ(liters * snf) / totalLiters
 * avgRate = totalAmount / totalLiters
 */
export function calculateCollectionSummary(entries: MilkCollectionEntry[]): CollectionSummary {
  if (!entries || entries.length === 0) {
    return {
      entryCount: 0,
      distinctFarmerCount: 0,
      totalLiters: 0,
      totalAmount: 0,
      totalDeductions: 0,
      totalNetPayable: 0,
      avgFat: null,
      avgSnf: null,
      avgRate: null,
    };
  }

  let totalLiters = 0;
  let totalAmount = 0;
  let totalDeductions = 0;
  let totalNetPayable = 0;
  let weightedFatSum = 0;
  let weightedSnfSum = 0;
  const farmerSet = new Set<string>();

  for (const e of entries) {
    const l = Number(e.liters) || 0;
    const f = Number(e.fat) || 0;
    const s = Number(e.snf) || 0;
    const amt = truncatePurchaseAmount(Number(e.totalAmount) || 0);
    const ded = truncatePurchaseAmount(Number(e.deduction) || 0);
    const net = truncatePurchaseAmount(
      e.netPayable !== undefined && e.netPayable !== null ? Number(e.netPayable) : amt - ded
    );

    if (e.farmerId) farmerSet.add(e.farmerId);
    totalLiters += l;
    totalAmount += amt;
    totalDeductions += ded;
    totalNetPayable += net;
    weightedFatSum += l * f;
    weightedSnfSum += l * s;
  }

  totalLiters = round3(totalLiters);
  totalAmount = truncatePurchaseAmount(totalAmount);
  totalDeductions = truncatePurchaseAmount(totalDeductions);
  totalNetPayable = truncatePurchaseAmount(totalNetPayable);

  if (totalLiters <= 0) {
    return {
      entryCount: entries.length,
      distinctFarmerCount: farmerSet.size,
      totalLiters: 0,
      totalAmount,
      totalDeductions,
      totalNetPayable,
      avgFat: null,
      avgSnf: null,
      avgRate: null,
    };
  }

  return {
    entryCount: entries.length,
    distinctFarmerCount: farmerSet.size,
    totalLiters,
    totalAmount,
    totalDeductions,
    totalNetPayable,
    avgFat: round2(weightedFatSum / totalLiters),
    avgSnf: round2(weightedSnfSum / totalLiters),
    avgRate: round2(totalAmount / totalLiters),
  };
}

export interface SaleSummary {
  entryCount: number;
  totalLiters: number;
  totalGrossAmount: number;
  totalCharges: number;
  totalNetReceivable: number;
  avgFat: number | null;
  avgSnf: number | null;
  avgRate: number | null;
}

export function calculateSaleSummary(entries: WholesaleSaleEntry[]): SaleSummary {
  if (!entries || entries.length === 0) {
    return {
      entryCount: 0,
      totalLiters: 0,
      totalGrossAmount: 0,
      totalCharges: 0,
      totalNetReceivable: 0,
      avgFat: null,
      avgSnf: null,
      avgRate: null,
    };
  }

  let totalLiters = 0;
  let totalGrossAmount = 0;
  let totalCharges = 0;
  let totalNetReceivable = 0;
  let weightedFatSum = 0;
  let weightedSnfSum = 0;

  for (const s of entries) {
    const l = Number(s.liters) || 0;
    const f = Number(s.avgFat) || 0;
    const snf = Number(s.avgSnf) || 0;
    const gross = Number(s.grossAmount) || 0;
    const chg = Number(s.otherCharges) || 0;
    const net = Number(s.netReceivable) || 0;

    totalLiters += l;
    totalGrossAmount += gross;
    totalCharges += chg;
    totalNetReceivable += net;
    weightedFatSum += l * f;
    weightedSnfSum += l * snf;
  }

  totalLiters = round3(totalLiters);
  totalGrossAmount = round2(totalGrossAmount);
  totalCharges = round2(totalCharges);
  totalNetReceivable = round2(totalNetReceivable);

  if (totalLiters <= 0) {
    return {
      entryCount: entries.length,
      totalLiters: 0,
      totalGrossAmount,
      totalCharges,
      totalNetReceivable,
      avgFat: null,
      avgSnf: null,
      avgRate: null,
    };
  }

  return {
    entryCount: entries.length,
    totalLiters,
    totalGrossAmount,
    totalCharges,
    totalNetReceivable,
    avgFat: round2(weightedFatSum / totalLiters),
    avgSnf: round2(weightedSnfSum / totalLiters),
    avgRate: round2(totalGrossAmount / totalLiters),
  };
}

export interface PresentFarmerDetail {
  farmer: Farmer;
  entries: MilkCollectionEntry[];
  totalLiters: number;
  totalAmount: number;
  latestTime: string;
}

export interface ShiftAttendanceSummary {
  date: string;
  shift: ShiftType;
  totalScheduledCount: number;
  rawScheduledCount: number;
  presentCount: number;
  pendingCount: number;
  onLeaveCount: number;
  completionPercentage: number;
  presentFarmers: PresentFarmerDetail[];
  pendingFarmers: Farmer[];
  onLeaveFarmers: Farmer[];
  notScheduledFarmers: Farmer[];
}

export function normalizeFarmerShiftSchedule(
  rawSchedule: unknown
): 'morning' | 'evening' | 'both' {
  if (typeof rawSchedule !== 'string') return 'both';
  const cleaned = rawSchedule.trim().toLowerCase();
  if (!cleaned) return 'both';
  if (
    cleaned === 'both' ||
    cleaned.includes('both') ||
    cleaned.includes('दोनों') ||
    (cleaned.includes('सुबह') && cleaned.includes('शाम')) ||
    (cleaned.includes('morning') && cleaned.includes('evening'))
  ) {
    return 'both';
  }
  if (
    cleaned === 'morning' ||
    cleaned === 'am' ||
    cleaned === 'केवल सुबह' ||
    cleaned === 'सुबह' ||
    cleaned.startsWith('1.')
  ) {
    return 'morning';
  }
  if (
    cleaned === 'evening' ||
    cleaned === 'pm' ||
    cleaned === 'केवल शाम' ||
    cleaned === 'शाम' ||
    cleaned.startsWith('2.')
  ) {
    return 'evening';
  }
  return 'both';
}

export function isFarmerScheduledForShift(
  farmer: { shiftSchedule?: unknown },
  shift: ShiftType
): boolean {
  const sched = normalizeFarmerShiftSchedule(farmer?.shiftSchedule);
  return sched === 'both' || sched === shift;
}

export function calculateShiftAttendance(
  farmers: Farmer[],
  collections: MilkCollectionEntry[],
  leaves: FarmerLeaveRecord[],
  date: string,
  shift: ShiftType
): ShiftAttendanceSummary {
  const activeFarmers = farmers
    .filter((f) => f && f.active !== false)
    .map((f) => ({
      ...f,
      shiftSchedule: normalizeFarmerShiftSchedule(f.shiftSchedule),
    }));
  const shiftCollections = collections.filter((c) => c.date === date && c.shift === shift);
  const shiftLeaves = new Set(
    leaves.filter((l) => l.date === date && l.shift === shift).map((l) => l.farmerId)
  );

  const entriesByFarmer = new Map<string, MilkCollectionEntry[]>();
  for (const entry of shiftCollections) {
    const existing = entriesByFarmer.get(entry.farmerId) || [];
    existing.push(entry);
    entriesByFarmer.set(entry.farmerId, existing);
  }

  const presentFarmers: PresentFarmerDetail[] = [];
  const pendingFarmers: Farmer[] = [];
  const onLeaveFarmers: Farmer[] = [];
  const notScheduledFarmers: Farmer[] = [];

  let rawScheduledCount = 0;

  for (const farmer of activeFarmers) {
    const isScheduledForShift = isFarmerScheduledForShift(farmer, shift);
    const farmerEntries = entriesByFarmer.get(farmer.id) || [];

    if (isScheduledForShift) {
      rawScheduledCount += 1;
    }

    if (farmerEntries.length > 0) {
      const totalLiters = round3(farmerEntries.reduce((s, e) => s + e.liters, 0));
      const totalAmount = truncatePurchaseAmount(
        farmerEntries.reduce((s, e) => s + truncatePurchaseAmount(e.totalAmount), 0)
      );
      const latestTime = farmerEntries[farmerEntries.length - 1].time;
      presentFarmers.push({
        farmer,
        entries: farmerEntries,
        totalLiters,
        totalAmount,
        latestTime,
      });
    } else if (isScheduledForShift) {
      if (shiftLeaves.has(farmer.id)) {
        onLeaveFarmers.push(farmer);
      } else {
        pendingFarmers.push(farmer);
      }
    } else {
      notScheduledFarmers.push(farmer);
    }
  }

  for (const [farmerId, farmerEntries] of entriesByFarmer.entries()) {
    if (!activeFarmers.some((f) => f.id === farmerId)) {
      const f = farmers.find((item) => item.id === farmerId) || {
        id: farmerId,
        code: farmerEntries[0].farmerCode || '—',
        name: farmerEntries[0].farmerName || 'अज्ञात किसान',
        mobile: '',
        village: '',
        shiftSchedule: 'both',
        openingBalance: 0,
        notes: '',
        active: false,
        createdAt: '',
      };
      const totalLiters = round3(farmerEntries.reduce((s, e) => s + e.liters, 0));
      const totalAmount = truncatePurchaseAmount(
        farmerEntries.reduce((s, e) => s + truncatePurchaseAmount(e.totalAmount), 0)
      );
      presentFarmers.push({
        farmer: f,
        entries: farmerEntries,
        totalLiters,
        totalAmount,
        latestTime: farmerEntries[farmerEntries.length - 1].time,
      });
    }
  }

  const presentCount = presentFarmers.length;
  const pendingCount = pendingFarmers.length;
  const onLeaveCount = onLeaveFarmers.length;
  const totalScheduledCount = presentCount + pendingCount;

  const completionPercentage =
    totalScheduledCount > 0
      ? Math.min(100, Math.round((presentCount / totalScheduledCount) * 100))
      : 0;

  return {
    date,
    shift,
    totalScheduledCount,
    rawScheduledCount,
    presentCount,
    pendingCount,
    onLeaveCount,
    completionPercentage,
    presentFarmers,
    pendingFarmers,
    onLeaveFarmers,
    notScheduledFarmers,
  };
}

export type ProfitLossStatus =
  | 'no_data'
  | 'sale_pending'
  | 'incomplete_match'
  | 'calculated';

export interface ReconciliationResult {
  status: ProfitLossStatus;
  statusLabelHi: string;
  statusLabelEn: string;
  purchasedLiters: number;
  purchaseAmount: number;
  avgPurchaseRate: number | null;
  soldLiters: number;
  grossSaleAmount: number;
  saleCharges: number;
  netSaleAmount: number;
  avgSaleRate: number | null;
  remainingStockLiters: number | null;
  remainingStockCostValue: number | null;
  quantityVarianceLiters: number | null;
  costOfSoldMilk: number | null;
  grossProfitLoss: number | null;
  expensesAmount: number;
  netProfitLoss: number | null;
}

export function calculateReconciliation(
  collections: MilkCollectionEntry[],
  sales: WholesaleSaleEntry[],
  expenses: ExpenseEntry[]
): ReconciliationResult {
  const colSummary = calculateCollectionSummary(collections);
  const saleSummary = calculateSaleSummary(sales);
  const expensesAmount = round2(expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));

  const purchasedLiters = colSummary.totalLiters;
  const purchaseAmount = colSummary.totalAmount;
  const avgPurchaseRate = colSummary.avgRate;

  const soldLiters = saleSummary.totalLiters;
  const grossSaleAmount = saleSummary.totalGrossAmount;
  const saleCharges = saleSummary.totalCharges;
  const netSaleAmount = saleSummary.totalNetReceivable;
  const avgSaleRate = saleSummary.avgRate;

  if (purchasedLiters === 0 && soldLiters === 0) {
    return {
      status: 'no_data',
      statusLabelHi: 'अभी कोई रिकॉर्ड नहीं है',
      statusLabelEn: 'No records yet',
      purchasedLiters: 0,
      purchaseAmount: 0,
      avgPurchaseRate: null,
      soldLiters: 0,
      grossSaleAmount: 0,
      saleCharges: 0,
      netSaleAmount: 0,
      avgSaleRate: null,
      remainingStockLiters: 0,
      remainingStockCostValue: 0,
      quantityVarianceLiters: 0,
      costOfSoldMilk: null,
      grossProfitLoss: null,
      expensesAmount,
      netProfitLoss: null,
    };
  }

  if (soldLiters === 0) {
    return {
      status: 'sale_pending',
      statusLabelHi: 'बिक्री का हिसाब बाकी',
      statusLabelEn: 'Wholesale sale entry pending',
      purchasedLiters,
      purchaseAmount,
      avgPurchaseRate,
      soldLiters: 0,
      grossSaleAmount: 0,
      saleCharges: 0,
      netSaleAmount: 0,
      avgSaleRate: null,
      remainingStockLiters: purchasedLiters,
      remainingStockCostValue: purchaseAmount,
      quantityVarianceLiters: purchasedLiters,
      costOfSoldMilk: null,
      grossProfitLoss: null,
      expensesAmount,
      netProfitLoss: null,
    };
  }

  if (purchasedLiters <= 0 || soldLiters > purchasedLiters + 0.001 || avgPurchaseRate === null) {
    return {
      status: 'incomplete_match',
      statusLabelHi: 'अपूर्ण हिसाब (खरीद लागत मिलान अनुपलब्ध)',
      statusLabelEn: 'Incomplete accounting (purchase cost basis unavailable)',
      purchasedLiters,
      purchaseAmount,
      avgPurchaseRate,
      soldLiters,
      grossSaleAmount,
      saleCharges,
      netSaleAmount,
      avgSaleRate,
      remainingStockLiters: null,
      remainingStockCostValue: null,
      quantityVarianceLiters: round3(purchasedLiters - soldLiters),
      costOfSoldMilk: null,
      grossProfitLoss: null,
      expensesAmount,
      netProfitLoss: null,
    };
  }

  const isFullSale = Math.abs(purchasedLiters - soldLiters) < 0.001;
  const costOfSoldMilk = isFullSale
    ? purchaseAmount
    : round2(soldLiters * avgPurchaseRate);
  const remainingStockLiters = round3(Math.max(0, purchasedLiters - soldLiters));
  const remainingStockCostValue = round2(Math.max(0, purchaseAmount - costOfSoldMilk));
  const grossProfitLoss = round2(netSaleAmount - costOfSoldMilk);
  const netProfitLoss = round2(grossProfitLoss - expensesAmount);

  return {
    status: 'calculated',
    statusLabelHi: netProfitLoss >= 0 ? 'शुद्ध लाभ' : 'शुद्ध हानि',
    statusLabelEn: netProfitLoss >= 0 ? 'Net Profit' : 'Net Loss',
    purchasedLiters,
    purchaseAmount,
    avgPurchaseRate,
    soldLiters,
    grossSaleAmount,
    saleCharges,
    netSaleAmount,
    avgSaleRate,
    remainingStockLiters,
    remainingStockCostValue,
    quantityVarianceLiters: remainingStockLiters,
    costOfSoldMilk,
    grossProfitLoss,
    expensesAmount,
    netProfitLoss,
  };
}

export interface FarmerLedgerRow {
  id: string;
  date: string;
  shift?: ShiftType;
  type: 'opening' | 'milk' | 'advance' | 'feed' | 'payment';
  descriptionHi: string;
  descriptionEn: string;
  liters?: number;
  fat?: number;
  snf?: number;
  rate?: number;
  milkAmount: number;
  advanceAmount: number;
  feedAmount: number;
  otherDeduction: number;
  paymentAmount: number;
  runningBalance: number;
}

export interface FarmerLedgerSummary {
  farmer: Farmer;
  rows: FarmerLedgerRow[];
  totalLiters: number;
  avgFat: number | null;
  avgSnf: number | null;
  avgRate: number | null;
  totalMilkAmount: number;
  totalAdvances: number;
  totalFeedDeductions: number;
  totalInlineDeductions: number;
  totalPayments: number;
  openingBalance: number;
  closingBalance: number;
}

export function calculateFarmerLedger(
  farmer: Farmer,
  collections: MilkCollectionEntry[],
  advancesAndPayments: AdvancePaymentEntry[],
  cattleFeed: CattleFeedEntry[]
): FarmerLedgerSummary {
  const farmerCollections = collections
    .filter((c) => c.farmerId === farmer.id)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));

  const farmerAdvPay = advancesAndPayments
    .filter((ap) => ap.farmerId === farmer.id)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));

  const farmerFeed = cattleFeed
    .filter((cf) => cf.farmerId === farmer.id)
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));

  const colSummary = calculateCollectionSummary(farmerCollections);

  type RawEvent = {
    sortKey: string;
    row: Omit<FarmerLedgerRow, 'runningBalance'>;
    delta: number;
  };

  const events: RawEvent[] = [];

  for (const c of farmerCollections) {
    const shiftHi = c.shift === 'morning' ? 'सुबह' : 'शाम';
    const shiftEn = c.shift === 'morning' ? 'Morning' : 'Evening';
    const typeHi = c.milkType === 'cow' ? 'गाय' : 'भैंस';
    const typeEn = c.milkType === 'cow' ? 'Cow' : 'Buffalo';
    const milkAmt = truncatePurchaseAmount(c.totalAmount);
    const dedAmt = truncatePurchaseAmount(c.deduction || 0);
    const delta = milkAmt - dedAmt;
    events.push({
      sortKey: `${c.date}_1_${c.shift === 'morning' ? '1' : '2'}_${c.time}_${c.id}`,
      delta,
      row: {
        id: c.id,
        date: c.date,
        shift: c.shift,
        type: 'milk',
        descriptionHi: `दूध खरीद (${shiftHi} · ${typeHi})`,
        descriptionEn: `Milk Collection (${shiftEn} · ${typeEn})`,
        liters: c.liters,
        fat: c.fat,
        snf: c.snf,
        rate: c.rate,
        milkAmount: milkAmt,
        advanceAmount: 0,
        feedAmount: 0,
        otherDeduction: dedAmt,
        paymentAmount: 0,
      },
    });
  }

  for (const ap of farmerAdvPay) {
    const isAdv = ap.type === 'advance';
    const amt = truncatePurchaseAmount(ap.amount);
    const periodTagHi =
      ap.billingCycle && ap.billingYearMonth
        ? ` [अवधि: ${getCycleLabelHi(ap.billingCycle, ap.billingYearMonth)}]`
        : ap.billingCycle
        ? ` [अवधि: ${getCycleLabelHi(ap.billingCycle)}]`
        : '';
    const periodTagEn =
      ap.billingCycle && ap.billingYearMonth
        ? ` [Period: ${getCycleLabelEn(ap.billingCycle, ap.billingYearMonth)}]`
        : '';
    events.push({
      sortKey: `${ap.date}_2_${ap.createdAt}_${ap.id}`,
      delta: -amt,
      row: {
        id: ap.id,
        date: ap.date,
        type: isAdv ? 'advance' : 'payment',
        descriptionHi: isAdv
          ? `एडवांस दिया (${ap.txnCode})${periodTagHi} ${ap.notes ? '- ' + ap.notes : ''}`
          : `भुगतान किया (${ap.txnCode})${periodTagHi} ${ap.notes ? '- ' + ap.notes : ''}`,
        descriptionEn: isAdv
          ? `Advance Given (${ap.txnCode})${periodTagEn} ${ap.notes ? '- ' + ap.notes : ''}`
          : `Payment Made (${ap.txnCode})${periodTagEn} ${ap.notes ? '- ' + ap.notes : ''}`,
        milkAmount: 0,
        advanceAmount: isAdv ? amt : 0,
        feedAmount: 0,
        otherDeduction: 0,
        paymentAmount: isAdv ? 0 : amt,
      },
    });
  }

  for (const cf of farmerFeed) {
    const isDeducted = cf.paymentMode === 'deduct_from_milk';
    const fAmt = truncatePurchaseAmount(cf.totalAmount);
    events.push({
      sortKey: `${cf.date}_3_${cf.createdAt}_${cf.id}`,
      delta: isDeducted ? -fAmt : 0,
      row: {
        id: cf.id,
        date: cf.date,
        type: 'feed',
        descriptionHi: `दाना/पशु-आहार: ${cf.itemName} (${cf.quantity} × ₹${cf.unitPrice})${
          isDeducted ? '' : ' [नकद भुगतान]'
        }`,
        descriptionEn: `Cattle Feed: ${cf.itemName} (${cf.quantity} × ₹${cf.unitPrice})${
          isDeducted ? '' : ' [Paid Cash]'
        }`,
        milkAmount: 0,
        advanceAmount: 0,
        feedAmount: isDeducted ? fAmt : 0,
        otherDeduction: 0,
        paymentAmount: 0,
      },
    });
  }

  events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const rows: FarmerLedgerRow[] = [];
  let runningBalance = truncatePurchaseAmount(farmer.openingBalance || 0);

  if (farmer.openingBalance !== 0) {
    rows.push({
      id: `open_${farmer.id}`,
      date: farmer.createdAt ? farmer.createdAt.slice(0, 10) : '—',
      type: 'opening',
      descriptionHi: 'शुरुआती बकाया (Opening Balance)',
      descriptionEn: 'Opening Balance',
      milkAmount: 0,
      advanceAmount: 0,
      feedAmount: 0,
      otherDeduction: 0,
      paymentAmount: 0,
      runningBalance,
    });
  }

  for (const ev of events) {
    runningBalance = truncatePurchaseAmount(runningBalance + ev.delta);
    rows.push({
      ...ev.row,
      runningBalance,
    });
  }

  const totalAdvances = truncatePurchaseAmount(
    farmerAdvPay
      .filter((a) => a.type === 'advance')
      .reduce((s, a) => s + truncatePurchaseAmount(a.amount), 0)
  );
  const totalPayments = truncatePurchaseAmount(
    farmerAdvPay
      .filter((a) => a.type === 'payment')
      .reduce((s, a) => s + truncatePurchaseAmount(a.amount), 0)
  );
  const totalFeedDeductions = truncatePurchaseAmount(
    farmerFeed
      .filter((f) => f.paymentMode === 'deduct_from_milk')
      .reduce((s, f) => s + truncatePurchaseAmount(f.totalAmount), 0)
  );

  return {
    farmer,
    rows,
    totalLiters: colSummary.totalLiters,
    avgFat: colSummary.avgFat,
    avgSnf: colSummary.avgSnf,
    avgRate: colSummary.avgRate,
    totalMilkAmount: colSummary.totalAmount,
    totalAdvances,
    totalFeedDeductions,
    totalInlineDeductions: colSummary.totalDeductions,
    totalPayments,
    openingBalance: truncatePurchaseAmount(farmer.openingBalance || 0),
    closingBalance: runningBalance,
  };
}

export function getCycleFromDate(dateStr: string): { yearMonth: string; cycle: 1 | 2 | 3 } {
  const safeDate =
    dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? dateStr
      : new Date().toISOString().slice(0, 10);
  const yearMonth = safeDate.slice(0, 7);
  const day = Number(safeDate.slice(8, 10)) || 1;
  const cycle: 1 | 2 | 3 = day <= 10 ? 1 : day <= 20 ? 2 : 3;
  return { yearMonth, cycle };
}

export function getCycleLabelHi(cycle: 1 | 2 | 3, yearMonth?: string): string {
  const base =
    cycle === 1
      ? '1 से 10 तारीख'
      : cycle === 2
      ? '11 से 20 तारीख'
      : '21 से महीने के अंत तक';
  return yearMonth ? `${base} (${formatMonthYear(yearMonth)})` : base;
}

export function getCycleLabelEn(cycle: 1 | 2 | 3, yearMonth?: string): string {
  const base =
    cycle === 1
      ? '1st to 10th'
      : cycle === 2
      ? '11th to 20th'
      : '21st to End of Month';
  return yearMonth ? `${base} (${formatMonthYear(yearMonth)})` : base;
}

export function getPreviousTenDayCycle(
  yearMonth: string,
  cycle: 1 | 2 | 3
): { yearMonth: string; cycle: 1 | 2 | 3 } {
  if (cycle === 3) return { yearMonth, cycle: 2 };
  if (cycle === 2) return { yearMonth, cycle: 1 };
  const [yStr, mStr] = (yearMonth || '2026-01').split('-');
  let y = Number(yStr) || 2026;
  let m = (Number(mStr) || 1) - 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return {
    yearMonth: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`,
    cycle: 3,
  };
}

export function getAdvancePaymentEffectiveCycle(
  entry: Pick<AdvancePaymentEntry, 'date' | 'billingYearMonth' | 'billingCycle'>
): { yearMonth: string; cycle: 1 | 2 | 3 } {
  if (
    entry.billingYearMonth &&
    /^\d{4}-\d{2}$/.test(entry.billingYearMonth) &&
    (entry.billingCycle === 1 || entry.billingCycle === 2 || entry.billingCycle === 3)
  ) {
    return { yearMonth: entry.billingYearMonth, cycle: entry.billingCycle };
  }
  const fromDate = getCycleFromDate(entry.date);
  if (entry.billingCycle === 1 || entry.billingCycle === 2 || entry.billingCycle === 3) {
    return { yearMonth: fromDate.yearMonth, cycle: entry.billingCycle };
  }
  return fromDate;
}

function compareYearMonthCycle(
  aYm: string,
  aCycle: 1 | 2 | 3,
  bYm: string,
  bCycle: 1 | 2 | 3
): number {
  if (aYm !== bYm) return aYm.localeCompare(bYm);
  return aCycle - bCycle;
}

export function getTenDayCycleDates(
  yearMonth: string,
  cycle: 1 | 2 | 3
): { fromDate: string; toDate: string } {
  const [yStr, mStr] = yearMonth.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const pad = (n: number) => String(n).padStart(2, '0');

  if (cycle === 1) {
    return {
      fromDate: `${year}-${pad(month)}-01`,
      toDate: `${year}-${pad(month)}-10`,
    };
  }
  if (cycle === 2) {
    return {
      fromDate: `${year}-${pad(month)}-11`,
      toDate: `${year}-${pad(month)}-20`,
    };
  }
  const lastDay = new Date(year, month, 0).getDate();
  return {
    fromDate: `${year}-${pad(month)}-21`,
    toDate: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export function computeBillSnapshotHash(
  farmer: Farmer,
  collections: MilkCollectionEntry[],
  advancesAndPayments: AdvancePaymentEntry[],
  cattleFeed: CattleFeedEntry[],
  toDate: string
): string {
  const targetCycle = getCycleFromDate(toDate);
  const cPart = collections
    .filter((c) => c.farmerId === farmer.id && c.date <= toDate)
    .map(
      (c) =>
        `${c.id}:${c.liters}:${truncatePurchaseAmount(c.totalAmount)}:${truncatePurchaseAmount(
          c.deduction || 0
        )}`
    )
    .join('|');
  const aPart = advancesAndPayments
    .filter((a) => {
      if (a.farmerId !== farmer.id) return false;
      const eff = getAdvancePaymentEffectiveCycle(a);
      return compareYearMonthCycle(eff.yearMonth, eff.cycle, targetCycle.yearMonth, targetCycle.cycle) <= 0;
    })
    .map((a) => {
      const eff = getAdvancePaymentEffectiveCycle(a);
      return `${a.id}:${a.type}:${eff.yearMonth}-${eff.cycle}:${truncatePurchaseAmount(a.amount)}`;
    })
    .join('|');
  const fPart = cattleFeed
    .filter((f) => f.farmerId === farmer.id && f.date <= toDate)
    .map((f) => `${f.id}:${f.paymentMode}:${truncatePurchaseAmount(f.totalAmount)}`)
    .join('|');
  return `${truncatePurchaseAmount(farmer.openingBalance || 0)}#${cPart}#${aPart}#${fPart}`;
}

export function generateTenDayBillData(
  farmer: Farmer,
  yearMonth: string,
  cycle: 1 | 2 | 3,
  collections: MilkCollectionEntry[],
  advancesAndPayments: AdvancePaymentEntry[],
  cattleFeed: CattleFeedEntry[]
): Omit<TenDayBill, 'id' | 'billNumber' | 'createdAt'> {
  const { fromDate, toDate } = getTenDayCycleDates(yearMonth, cycle);
  const prevCycleInfo = getPreviousTenDayCycle(yearMonth, cycle);
  const prevCycleDates = getTenDayCycleDates(prevCycleInfo.yearMonth, prevCycleInfo.cycle);

  const prevCollections = collections.filter(
    (c) => c.farmerId === farmer.id && c.date < fromDate
  );
  const prevAdvPay = advancesAndPayments.filter((a) => {
    if (a.farmerId !== farmer.id) return false;
    const eff = getAdvancePaymentEffectiveCycle(a);
    return compareYearMonthCycle(eff.yearMonth, eff.cycle, yearMonth, cycle) < 0;
  });
  const prevFeed = cattleFeed.filter(
    (f) => f.farmerId === farmer.id && f.date < fromDate && f.paymentMode === 'deduct_from_milk'
  );

  const prevMilkNet = prevCollections.reduce(
    (s, c) =>
      s + (truncatePurchaseAmount(c.totalAmount) - truncatePurchaseAmount(c.deduction || 0)),
    0
  );
  const prevAdvAndPaymentsTotal = prevAdvPay.reduce(
    (s, a) => s + truncatePurchaseAmount(a.amount),
    0
  );
  const prevFeedTotal = prevFeed.reduce(
    (s, f) => s + truncatePurchaseAmount(f.totalAmount),
    0
  );
  const previousBalance = truncatePurchaseAmount(
    truncatePurchaseAmount(farmer.openingBalance || 0) +
      prevMilkNet -
      prevAdvAndPaymentsTotal -
      prevFeedTotal
  );

  // Also compute the immediate previous 10-day period's payable vs paid breakdown for bill transparency
  const prevCyclePaidAmount = truncatePurchaseAmount(
    advancesAndPayments
      .filter((a) => {
        if (a.farmerId !== farmer.id || a.type !== 'payment') return false;
        const eff = getAdvancePaymentEffectiveCycle(a);
        return (
          eff.yearMonth === prevCycleInfo.yearMonth && eff.cycle === prevCycleInfo.cycle
        );
      })
      .reduce((s, a) => s + truncatePurchaseAmount(a.amount), 0)
  );
  const previousBillPayableBeforePayment = truncatePurchaseAmount(
    previousBalance + prevCyclePaidAmount
  );
  const previousCycleLabelHi =
    prevCollections.some((c) => c.date >= prevCycleDates.fromDate && c.date <= prevCycleDates.toDate) ||
    prevCyclePaidAmount > 0 ||
    previousBalance !== 0
      ? getCycleLabelHi(prevCycleInfo.cycle, prevCycleInfo.yearMonth)
      : undefined;

  const periodCollections = collections.filter(
    (c) => c.farmerId === farmer.id && c.date >= fromDate && c.date <= toDate
  );
  const morningEntries = periodCollections.filter((c) => c.shift === 'morning');
  const eveningEntries = periodCollections.filter((c) => c.shift === 'evening');

  const periodSummary = calculateCollectionSummary(periodCollections);
  const morningSummary = calculateCollectionSummary(morningEntries);
  const eveningSummary = calculateCollectionSummary(eveningEntries);

  const periodAdvances = truncatePurchaseAmount(
    advancesAndPayments
      .filter((a) => {
        if (a.farmerId !== farmer.id || a.type !== 'advance') return false;
        const eff = getAdvancePaymentEffectiveCycle(a);
        return eff.yearMonth === yearMonth && eff.cycle === cycle;
      })
      .reduce((s, a) => s + truncatePurchaseAmount(a.amount), 0)
  );

  const periodPayments = truncatePurchaseAmount(
    advancesAndPayments
      .filter((a) => {
        if (a.farmerId !== farmer.id || a.type !== 'payment') return false;
        const eff = getAdvancePaymentEffectiveCycle(a);
        return eff.yearMonth === yearMonth && eff.cycle === cycle;
      })
      .reduce((s, a) => s + truncatePurchaseAmount(a.amount), 0)
  );

  const periodFeed = truncatePurchaseAmount(
    cattleFeed
      .filter(
        (f) =>
          f.farmerId === farmer.id &&
          f.paymentMode === 'deduct_from_milk' &&
          f.date >= fromDate &&
          f.date <= toDate
      )
      .reduce((s, f) => s + truncatePurchaseAmount(f.totalAmount), 0)
  );

  const billPayableBeforePayment = truncatePurchaseAmount(
    previousBalance +
      periodSummary.totalAmount -
      periodSummary.totalDeductions -
      periodAdvances -
      periodFeed
  );

  const netPayable = truncatePurchaseAmount(billPayableBeforePayment - periodPayments);

  const snapshotHash = computeBillSnapshotHash(
    farmer,
    collections,
    advancesAndPayments,
    cattleFeed,
    toDate
  );

  return {
    farmerId: farmer.id,
    farmerName: farmer.name,
    farmerCode: farmer.code,
    yearMonth,
    cycle,
    fromDate,
    toDate,
    morningLiters: morningSummary.totalLiters,
    morningAmount: morningSummary.totalAmount,
    eveningLiters: eveningSummary.totalLiters,
    eveningAmount: eveningSummary.totalAmount,
    totalLiters: periodSummary.totalLiters,
    avgFat: periodSummary.avgFat,
    avgSnf: periodSummary.avgSnf,
    avgRate: periodSummary.avgRate,
    totalMilkAmount: periodSummary.totalAmount,
    inlineDeductions: periodSummary.totalDeductions,
    advancesInPeriod: periodAdvances,
    feedDeductionsInPeriod: periodFeed,
    paymentsInPeriod: periodPayments,
    previousBalance,
    netPayable,
    billPayableBeforePayment,
    previousCycleLabelHi,
    previousBillPayableBeforePayment,
    previousBillPaidAmount: prevCyclePaidAmount,
    snapshotHash,
  };
}

// ============================================================================
// Requirement 7: 3-Mode Excel Rate Chart Import System
// Supports:
//   1. Option 1: Auto-Detect (Header aliases + data range heuristics + 2D Matrix)
//   2. Option 2: Manual Column Selection (with column names and sample values)
//   3. Option 3: Three Standard Excel Formats:
//      - Format A: FAT (Col 1), SNF (Col 2), Rate (Col 3)
//      - Format B: SNF (Col 1), FAT (Col 2), Rate (Col 3)
//      - Format C: Custom Column Mapping
// ============================================================================

export type ExcelImportMode =
  | 'auto_detect'
  | 'manual_columns'
  | 'format_a' // FAT first, SNF second, Rate third
  | 'format_b' // SNF first, FAT second, Rate third
  | 'format_c'; // Custom user-selected columns

export interface ExcelColumnInfo {
  colIndex: number;
  colLetter: string;
  headerName: string;
  sampleValues: string[];
}

export interface RateTriplePreview {
  fat: number;
  snf: number;
  rate: number;
  isDuplicate?: boolean;
}

export interface FlexibleExcelParseResult {
  chart: RateChartMatrix | null;
  detectedLayout: 'three_column_list' | 'matrix_grid' | 'unknown';
  detectedColumns: {
    fatCol: number;
    snfCol: number;
    rateCol: number;
  } | null;
  confidence: 'high' | 'ambiguous' | 'none';
  needsUserConfirmation: boolean;
  columnsInfo: ExcelColumnInfo[];
  totalRowsRead: number;
  validRowCount: number;
  invalidOrEmptyRowCount: number;
  duplicateCount: number;
  duplicateKeys: string[];
  previewRows: RateTriplePreview[];
  errors: string[];
  warnings: string[];
}

const FAT_HEADER_ALIASES = [
  'fat',
  'f.a.t',
  'f.a.t.',
  'फैट',
  'फेट',
  'मिल्क फैट',
  'milk fat',
  'milkfat',
  'fat%',
  'fat %',
  'फैट %',
  'फेट %',
];

const SNF_HEADER_ALIASES = [
  'snf',
  's.n.f',
  's.n.f.',
  'एसएनएफ',
  'स्नैप',
  'सॉलिड्स नॉट फैट',
  'solids not fat',
  'solidsnotfat',
  'snf%',
  'snf %',
  'एसएनएफ %',
  'स्नैप %',
  'clr/snf',
];

const RATE_HEADER_ALIASES = [
  'rate',
  'रेट',
  'price',
  'amount',
  'मूल्य',
  'दर',
  'रकम',
  'भाव',
  'milk rate',
  'rate/l',
  'rate per liter',
  'प्रति लीटर रेट',
  'rs',
  'rupees',
  '₹',
];

function matchHeaderRole(rawHeader: string): 'fat' | 'snf' | 'rate' | null {
  const norm = rawHeader
    .toLowerCase()
    .replace(/[_:\-()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!norm) return null;

  // If cell contains both SNF and FAT (e.g., "SNF / FAT" corner header of a 2D matrix), return null
  if (norm.includes('fat') && norm.includes('snf')) return null;
  if (norm.includes('फैट') && norm.includes('एसएनएफ')) return null;

  for (const alias of FAT_HEADER_ALIASES) {
    if (norm === alias || norm.startsWith(alias + ' ') || norm.endsWith(' ' + alias)) {
      return 'fat';
    }
  }
  for (const alias of SNF_HEADER_ALIASES) {
    if (norm === alias || norm.startsWith(alias + ' ') || norm.endsWith(' ' + alias)) {
      return 'snf';
    }
  }
  for (const alias of RATE_HEADER_ALIASES) {
    if (norm === alias || norm.startsWith(alias + ' ') || norm.endsWith(' ' + alias)) {
      return 'rate';
    }
  }
  return null;
}

export function inspectExcelSheetColumns(grid: unknown[][]): {
  hasHeaderRow: boolean;
  columnsInfo: ExcelColumnInfo[];
  autoDetectedMapping: {
    fatCol: number;
    snfCol: number;
    rateCol: number;
    confidence: 'high' | 'ambiguous' | 'none';
  };
} {
  const cleanRows = (grid || []).filter(
    (row) =>
      Array.isArray(row) &&
      row.some((c) => c !== null && c !== undefined && String(c).trim() !== '')
  );

  if (cleanRows.length === 0) {
    return {
      hasHeaderRow: false,
      columnsInfo: [],
      autoDetectedMapping: { fatCol: 0, snfCol: 1, rateCol: 2, confidence: 'none' },
    };
  }

  const maxCols = Math.max(...cleanRows.slice(0, 15).map((r) => r.length));
  const firstRow = cleanRows[0];

  // Check if first row is text headers or already numbers
  let firstRowTextCount = 0;
  for (let c = 0; c < firstRow.length; c++) {
    const valStr = String(firstRow[c] ?? '').trim();
    if (valStr !== '' && !Number.isFinite(Number(valStr))) {
      firstRowTextCount++;
    }
  }
  const hasHeaderRow = firstRowTextCount > 0;

  const columnsInfo: ExcelColumnInfo[] = [];
  let detectedFatCol = -1;
  let detectedSnfCol = -1;
  let detectedRateCol = -1;

  for (let c = 0; c < maxCols; c++) {
    const colLetter = String.fromCharCode(65 + (c % 26));
    const rawHdr = hasHeaderRow ? String(firstRow[c] ?? '').trim() : '';
    const headerName = rawHdr || `कॉलम ${colLetter} (Col ${c + 1})`;

    const sampleValues: string[] = [];
    const startRow = hasHeaderRow ? 1 : 0;
    for (let r = startRow; r < cleanRows.length && sampleValues.length < 3; r++) {
      const cell = cleanRows[r]?.[c];
      if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
        sampleValues.push(String(cell).trim());
      }
    }

    columnsInfo.push({
      colIndex: c,
      colLetter,
      headerName,
      sampleValues,
    });

    if (hasHeaderRow && rawHdr) {
      const role = matchHeaderRole(rawHdr);
      if (role === 'fat' && detectedFatCol === -1) detectedFatCol = c;
      else if (role === 'snf' && detectedSnfCol === -1) detectedSnfCol = c;
      else if (role === 'rate' && detectedRateCol === -1) detectedRateCol = c;
    }
  }

  if (detectedFatCol !== -1 && detectedSnfCol !== -1 && detectedRateCol !== -1) {
    return {
      hasHeaderRow,
      columnsInfo,
      autoDetectedMapping: {
        fatCol: detectedFatCol,
        snfCol: detectedSnfCol,
        rateCol: detectedRateCol,
        confidence: 'high',
      },
    };
  }

  // Heuristic value inspection if headers didn't explicitly match all 3
  if (maxCols >= 3) {
    const startRow = hasHeaderRow ? 1 : 0;
    const colAverages: number[] = [];
    for (let c = 0; c < Math.min(6, maxCols); c++) {
      const nums: number[] = [];
      for (let r = startRow; r < Math.min(startRow + 25, cleanRows.length); r++) {
        const n = Number(String(cleanRows[r]?.[c] ?? '').trim());
        if (Number.isFinite(n) && n > 0) nums.push(n);
      }
      colAverages[c] = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : -1;
    }

    // Typical milk rate is > 15 (e.g. ₹25 - ₹80), while FAT is 2.5 - 11.0 and SNF is 7.0 - 10.5
    let guessRate = detectedRateCol;
    if (guessRate === -1) {
      guessRate = colAverages.findIndex((avg) => avg >= 15);
    }
    if (guessRate !== -1) {
      const otherCols = [0, 1, 2].filter((idx) => idx !== guessRate);
      if (otherCols.length === 2) {
        const c0 = otherCols[0];
        const c1 = otherCols[1];
        // If one column average is ~8.0-9.5 and the other is ~3.0-7.5
        const c0IsSnf = colAverages[c0] >= 7.5 && colAverages[c0] <= 10.0 && colAverages[c1] < 7.5;
        return {
          hasHeaderRow,
          columnsInfo,
          autoDetectedMapping: {
            fatCol: detectedFatCol !== -1 ? detectedFatCol : c0IsSnf ? c1 : c0,
            snfCol: detectedSnfCol !== -1 ? detectedSnfCol : c0IsSnf ? c0 : c1,
            rateCol: guessRate,
            confidence: 'ambiguous',
          },
        };
      }
    }
  }

  return {
    hasHeaderRow,
    columnsInfo,
    autoDetectedMapping: {
      fatCol: detectedFatCol !== -1 ? detectedFatCol : 0,
      snfCol: detectedSnfCol !== -1 ? detectedSnfCol : 1,
      rateCol: detectedRateCol !== -1 ? detectedRateCol : 2,
      confidence: 'none',
    },
  };
}

/**
 * Parses a 3-column (or multi-column) row list using specified FAT, SNF, and Rate column indices.
 */
export function parseColumnMappedRateChart(
  grid: unknown[][],
  milkType: MilkType,
  fileName: string,
  sheetName: string,
  fatCol: number,
  snfCol: number,
  rateCol: number,
  confidence: 'high' | 'ambiguous' | 'none' = 'high'
): FlexibleExcelParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { hasHeaderRow, columnsInfo } = inspectExcelSheetColumns(grid);

  if (!grid || grid.length === 0) {
    errors.push('चयनित Excel फ़ाइल या शीट खाली है। कृपया वैध डेटा वाली फ़ाइल चुनें।');
    return {
      chart: null,
      detectedLayout: 'unknown',
      detectedColumns: null,
      confidence: 'none',
      needsUserConfirmation: false,
      columnsInfo,
      totalRowsRead: 0,
      validRowCount: 0,
      invalidOrEmptyRowCount: 0,
      duplicateCount: 0,
      duplicateKeys: [],
      previewRows: [],
      errors,
      warnings,
    };
  }

  if (fatCol === snfCol || fatCol === rateCol || snfCol === rateCol) {
    errors.push(
      'अमान्य कॉलम चयन: FAT, SNF और रेट तीनों के लिए अलग-अलग कॉलम चुनना अनिवार्य है।'
    );
    return {
      chart: null,
      detectedLayout: 'three_column_list',
      detectedColumns: { fatCol, snfCol, rateCol },
      confidence,
      needsUserConfirmation: true,
      columnsInfo,
      totalRowsRead: 0,
      validRowCount: 0,
      invalidOrEmptyRowCount: 0,
      duplicateCount: 0,
      duplicateKeys: [],
      previewRows: [],
      errors,
      warnings,
    };
  }

  const startRow = hasHeaderRow ? 1 : 0;
  const rates: Record<string, number> = {};
  const fatSet = new Set<number>();
  const snfSet = new Set<number>();
  const previewRows: RateTriplePreview[] = [];
  const duplicateKeySet = new Set<string>();

  let totalRowsRead = 0;
  let validRowCount = 0;
  let invalidOrEmptyRowCount = 0;
  let duplicateCount = 0;

  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r];
    if (
      !Array.isArray(row) ||
      row.every((c) => c === null || c === undefined || String(c).trim() === '')
    ) {
      continue;
    }

    totalRowsRead++;
    const rawFat = String(row[fatCol] ?? '').trim();
    const rawSnf = String(row[snfCol] ?? '').trim();
    const rawRate = String(row[rateCol] ?? '').trim();

    const fatNum = Number(rawFat);
    const snfNum = Number(rawSnf);
    const rateNum = Number(rawRate);

    if (
      rawFat === '' ||
      rawSnf === '' ||
      rawRate === '' ||
      !Number.isFinite(fatNum) ||
      !Number.isFinite(snfNum) ||
      !Number.isFinite(rateNum) ||
      fatNum <= 0 ||
      fatNum > 20 ||
      snfNum <= 0 ||
      snfNum > 20 ||
      rateNum <= 0
    ) {
      invalidOrEmptyRowCount++;
      continue;
    }

    const fat = round2(fatNum);
    const snf = round2(snfNum);
    const rate = round2(rateNum);
    const key = makeRateKey(fat, snf);

    const isDup = rates[key] !== undefined;
    if (isDup) {
      duplicateCount++;
      duplicateKeySet.add(`FAT ${fat.toFixed(1)} - SNF ${snf.toFixed(1)}`);
    }

    rates[key] = rate;
    fatSet.add(fat);
    snfSet.add(snf);
    validRowCount++;
    previewRows.push({ fat, snf, rate, isDuplicate: isDup });
  }

  if (validRowCount === 0) {
    errors.push(
      'चुने गए कॉलमों में कोई भी मान्य संख्यात्मक FAT, SNF और रेट (Rate > 0) नहीं मिला। कृपया कॉलम चयन की जाँच करें।'
    );
    return {
      chart: null,
      detectedLayout: 'three_column_list',
      detectedColumns: { fatCol, snfCol, rateCol },
      confidence,
      needsUserConfirmation: true,
      columnsInfo,
      totalRowsRead,
      validRowCount: 0,
      invalidOrEmptyRowCount,
      duplicateCount: 0,
      duplicateKeys: [],
      previewRows: [],
      errors,
      warnings,
    };
  }

  if (invalidOrEmptyRowCount > 0) {
    warnings.push(
      `चेतावनी: फ़ाइल में ${invalidOrEmptyRowCount} पंक्तियाँ खाली या अमान्य थीं जिन्हें छोड़ दिया गया है।`
    );
  }

  if (duplicateCount > 0) {
    warnings.push(
      `डुप्लिकेट चेतावनी: ${duplicateCount} डुप्लिकेट FAT-SNF संयोजन मिले (${Array.from(
        duplicateKeySet
      )
        .slice(0, 5)
        .join(', ')})। नवीनतम पंक्ति का रेट लागू किया गया है।`
    );
  }

  if (confidence === 'ambiguous') {
    warnings.push(
      'कॉलम के नाम स्पष्ट नहीं थे इसलिए मानों के आधार पर कॉलम पहचाने गए हैं। कृपया नीचे प्रीव्यू और कॉलम की पुष्टि करें।'
    );
  }

  const fats = Array.from(fatSet).sort((a, b) => a - b);
  const snfs = Array.from(snfSet).sort((a, b) => a - b);

  return {
    chart: {
      milkType,
      fileName,
      sheetName,
      updatedAt: new Date().toISOString(),
      fats,
      snfs,
      rates,
      rowCount: snfs.length,
      colCount: fats.length,
      invalidCellCount: invalidOrEmptyRowCount,
    },
    detectedLayout: 'three_column_list',
    detectedColumns: { fatCol, snfCol, rateCol },
    confidence,
    needsUserConfirmation: confidence !== 'high',
    columnsInfo,
    totalRowsRead,
    validRowCount,
    invalidOrEmptyRowCount,
    duplicateCount,
    duplicateKeys: Array.from(duplicateKeySet),
    previewRows,
    errors,
    warnings,
  };
}

/**
 * Unified entry point for all 3 Excel Import Options:
 * - 'auto_detect': Automatically detects whether the Excel sheet is a 3-column list (matching FAT/SNF/Rate headers) or a 2D Matrix Grid.
 * - 'format_a': Col 0 = FAT, Col 1 = SNF, Col 2 = Rate
 * - 'format_b': Col 0 = SNF, Col 1 = FAT, Col 2 = Rate
 * - 'format_c' / 'manual_columns': Uses customFatCol, customSnfCol, customRateCol
 */
export function parseExcelWithMode(
  grid: unknown[][],
  milkType: MilkType,
  fileName: string,
  sheetName: string,
  mode: ExcelImportMode,
  customCols?: { fatCol: number; snfCol: number; rateCol: number }
): FlexibleExcelParseResult {
  const { columnsInfo, autoDetectedMapping } = inspectExcelSheetColumns(grid);

  if (mode === 'format_a') {
    return parseColumnMappedRateChart(grid, milkType, fileName, sheetName, 0, 1, 2, 'high');
  }

  if (mode === 'format_b') {
    return parseColumnMappedRateChart(grid, milkType, fileName, sheetName, 1, 0, 2, 'high');
  }

  if (mode === 'format_c' || mode === 'manual_columns') {
    const fc = customCols?.fatCol ?? 0;
    const sc = customCols?.snfCol ?? 1;
    const rc = customCols?.rateCol ?? 2;
    return parseColumnMappedRateChart(grid, milkType, fileName, sheetName, fc, sc, rc, 'high');
  }

  // Mode = 'auto_detect'
  // 1. If header aliases matched FAT, SNF, and Rate in 3 columns -> parse as 3-column list
  if (autoDetectedMapping.confidence === 'high') {
    return parseColumnMappedRateChart(
      grid,
      milkType,
      fileName,
      sheetName,
      autoDetectedMapping.fatCol,
      autoDetectedMapping.snfCol,
      autoDetectedMapping.rateCol,
      'high'
    );
  }

  // 2. Check if sheet has <= 4 columns and looks like a 3-column FAT/SNF/Rate table
  if (columnsInfo.length >= 3 && columnsInfo.length <= 4 && autoDetectedMapping.confidence === 'ambiguous') {
    return parseColumnMappedRateChart(
      grid,
      milkType,
      fileName,
      sheetName,
      autoDetectedMapping.fatCol,
      autoDetectedMapping.snfCol,
      autoDetectedMapping.rateCol,
      'ambiguous'
    );
  }

  // 3. Otherwise try 2D Matrix Grid parser (SNF rows x FAT columns)
  const matrixRes = parseExcelGridToRateChart(grid, milkType, fileName, sheetName);
  if (matrixRes.chart) {
    const previewRows: RateTriplePreview[] = [];
    for (const s of matrixRes.chart.snfs) {
      for (const f of matrixRes.chart.fats) {
        const r = matrixRes.chart.rates[makeRateKey(f, s)];
        if (r !== undefined) {
          previewRows.push({ fat: f, snf: s, rate: r });
        }
      }
    }
    return {
      chart: matrixRes.chart,
      detectedLayout: 'matrix_grid',
      detectedColumns: null,
      confidence: 'high',
      needsUserConfirmation: false,
      columnsInfo,
      totalRowsRead: matrixRes.chart.rowCount * matrixRes.chart.colCount,
      validRowCount: previewRows.length,
      invalidOrEmptyRowCount: matrixRes.chart.invalidCellCount,
      duplicateCount: 0,
      duplicateKeys: [],
      previewRows,
      errors: matrixRes.errors,
      warnings: matrixRes.warnings,
    };
  }

  // 4. Fallback to ambiguous 3-column parse so user can see errors or pick columns manually
  return parseColumnMappedRateChart(
    grid,
    milkType,
    fileName,
    sheetName,
    autoDetectedMapping.fatCol,
    autoDetectedMapping.snfCol,
    autoDetectedMapping.rateCol,
    'none'
  );
}

/**
 * Parses a 2D array from Excel (.xls / .xlsx) or CSV into a RateChartMatrix (Matrix layout).
 */
export function parseExcelGridToRateChart(
  grid: unknown[][],
  milkType: MilkType,
  fileName: string,
  sheetName: string
): {
  chart: RateChartMatrix | null;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!grid || grid.length < 2) {
    errors.push('शीट में पर्याप्त पंक्तियाँ नहीं हैं (कम से कम 2 पंक्तियाँ होनी चाहिए)।');
    return { chart: null, errors, warnings };
  }

  const cleanRows = grid.filter(
    (row) =>
      Array.isArray(row) &&
      row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
  );

  if (cleanRows.length < 2) {
    errors.push('शीट खाली है या मान्य डेटा नहीं मिला।');
    return { chart: null, errors, warnings };
  }

  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(10, cleanRows.length); r++) {
    const row = cleanRows[r];
    let numericCount = 0;
    for (let c = 1; c < row.length; c++) {
      const n = Number(String(row[c] ?? '').trim());
      if (Number.isFinite(n) && n > 0 && n <= 20) {
        numericCount++;
      }
    }
    if (numericCount >= 2) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    errors.push(
      'FAT/SNF हेडर पंक्ति नहीं मिली। कृपया सुनिश्चित करें कि पहली पंक्ति में FAT के मान या वैध FAT, SNF, Rate कॉलम हों।'
    );
    return { chart: null, errors, warnings };
  }

  const headerRow = cleanRows[headerRowIdx];
  const cornerLabel = String(headerRow[0] ?? '').toUpperCase();

  const colValues: { colIndex: number; val: number }[] = [];
  for (let c = 1; c < headerRow.length; c++) {
    const raw = String(headerRow[c] ?? '').trim();
    if (!raw) continue;
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0 && num <= 20) {
      colValues.push({ colIndex: c, val: round2(num) });
    }
  }

  const rowValues: { rowIndex: number; val: number }[] = [];
  for (let r = headerRowIdx + 1; r < cleanRows.length; r++) {
    const raw = String(cleanRows[r][0] ?? '').trim();
    if (!raw) continue;
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0 && num <= 20) {
      rowValues.push({ rowIndex: r, val: round2(num) });
    }
  }

  if (colValues.length === 0 || rowValues.length === 0) {
    errors.push('FAT या SNF की संख्यात्मक पंक्तियाँ/कॉलम पढ़ने में असमर्थ।');
    return { chart: null, errors, warnings };
  }

  let colsAreFat = true;
  if (cornerLabel.includes('FAT') && cornerLabel.includes('SNF')) {
    const fatPos = cornerLabel.indexOf('FAT');
    const snfPos = cornerLabel.indexOf('SNF');
    colsAreFat = snfPos < fatPos;
  } else {
    const avgCol = colValues.reduce((s, x) => s + x.val, 0) / colValues.length;
    const avgRow = rowValues.reduce((s, x) => s + x.val, 0) / rowValues.length;
    if (milkType === 'cow' && avgRow <= 5.5 && avgCol >= 7.0) {
      colsAreFat = false;
    }
  }

  const rates: Record<string, number> = {};
  const fatSet = new Set<number>();
  const snfSet = new Set<number>();
  let invalidCellCount = 0;

  for (const rItem of rowValues) {
    const rowArr = cleanRows[rItem.rowIndex];
    for (const cItem of colValues) {
      const fat = colsAreFat ? cItem.val : rItem.val;
      const snf = colsAreFat ? rItem.val : cItem.val;
      const rawCell = rowArr[cItem.colIndex];
      const cellStr = rawCell === null || rawCell === undefined ? '' : String(rawCell).trim();
      const rateNum = Number(cellStr);

      if (cellStr === '' || !Number.isFinite(rateNum) || rateNum <= 0) {
        invalidCellCount++;
      } else {
        fatSet.add(fat);
        snfSet.add(snf);
        rates[makeRateKey(fat, snf)] = round2(rateNum);
      }
    }
  }

  if (Object.keys(rates).length === 0) {
    errors.push('रेट चार्ट में कोई भी मान्य सकारात्मक रेट (Rate > 0) नहीं मिला।');
    return { chart: null, errors, warnings };
  }

  if (invalidCellCount > 0) {
    warnings.push(
      `चेतावनी: रेट चार्ट में ${invalidCellCount} सेल खाली या अमान्य पाए गए। उन FAT/SNF संयोजनों के लिए रेट उपलब्ध नहीं होगा।`
    );
  }

  const fats = Array.from(fatSet).sort((a, b) => a - b);
  const snfs = Array.from(snfSet).sort((a, b) => a - b);

  return {
    chart: {
      milkType,
      fileName,
      sheetName,
      updatedAt: new Date().toISOString(),
      fats,
      snfs,
      rates,
      rowCount: snfs.length,
      colCount: fats.length,
      invalidCellCount,
    },
    errors,
    warnings,
  };
}

/**
 * Pure Milk Profit & Loss Calculation (केवल दूध खरीद एवं बिक्री के अंतर से लाभ-हानि)
 * इसमें कोई भी अतिरिक्त खर्च (expenses) नहीं जोड़ा जाता।
 * केवल कुल दूध बिक्री राशि (Sale Amount) - कुल दूध खरीद राशि (Purchase Amount) = लाभ/हानि।
 */
export interface PureProfitLossReport {
  purchasedLiters: number;
  purchaseAmount: number;
  avgPurchaseRate: number | null;
  avgPurchaseFat: number | null;
  avgPurchaseSnf: number | null;

  soldLiters: number;
  saleAmount: number;
  avgSaleRate: number | null;
  avgSaleFat: number | null;
  avgSaleSnf: number | null;

  // Pure difference: Sale Amount - Purchase Amount
  netDifference: number; // +ve = Profit (लाभ), -ve = Loss (हानि)
  isProfit: boolean;
  statusLabelHi: string;
  statusLabelEn: string;
  marginPerLiter: number | null;

  // Volume difference: Sold Liters - Purchased Liters
  litersDifference: number;

  entryCountPurchases: number;
  entryCountSales: number;
}

export function calculatePureProfitLoss(
  collections: MilkCollectionEntry[],
  sales: WholesaleSaleEntry[]
): PureProfitLossReport {
  const colSum = calculateCollectionSummary(collections);
  const saleSum = calculateSaleSummary(sales);

  const purchasedLiters = colSum.totalLiters;
  const purchaseAmount = colSum.totalAmount;
  const soldLiters = saleSum.totalLiters;
  const saleAmount = saleSum.totalNetReceivable;

  const netDifference = round2(saleAmount - purchaseAmount);
  const isProfit = netDifference >= 0;
  const marginPerLiter = purchasedLiters > 0 ? round2(netDifference / purchasedLiters) : null;
  const litersDifference = round3(soldLiters - purchasedLiters);

  let statusLabelHi = 'बराबर (No Profit / No Loss)';
  let statusLabelEn = 'Breakeven';
  if (netDifference > 0) {
    statusLabelHi = 'शुद्ध लाभ (Profit)';
    statusLabelEn = 'Net Profit';
  } else if (netDifference < 0) {
    statusLabelHi = 'शुद्ध हानि (Loss)';
    statusLabelEn = 'Net Loss';
  }

  return {
    purchasedLiters,
    purchaseAmount,
    avgPurchaseRate: colSum.avgRate,
    avgPurchaseFat: colSum.avgFat,
    avgPurchaseSnf: colSum.avgSnf,
    soldLiters,
    saleAmount,
    avgSaleRate: saleSum.avgRate,
    avgSaleFat: saleSum.avgFat,
    avgSaleSnf: saleSum.avgSnf,
    netDifference,
    isProfit,
    statusLabelHi,
    statusLabelEn,
    marginPerLiter,
    litersDifference,
    entryCountPurchases: colSum.entryCount,
    entryCountSales: saleSum.entryCount,
  };
}

// ============================================================================
// Camera / Photo Slip OCR Entry Parser & Auto-Save Builder
// ============================================================================

export interface ScannedSlipRawRow {
  id?: string;
  farmerCode?: string;
  farmerName?: string;
  date?: string;
  shift?: ShiftType | string;
  milkType?: MilkType | string;
  liters: number;
  fat: number;
  snf: number;
  rate?: number;
  manualRate?: boolean;
  amount?: number;
  overwriteExisting?: boolean;
  isManualRow?: boolean;
}

/**
 * Converts Devanagari digits (०-९) to ASCII digits (0-9).
 */
export function convertDevanagariDigitsToAscii(input: string): string {
  const map: Record<string, string> = {
    '०': '0',
    '१': '1',
    '२': '2',
    '३': '3',
    '४': '4',
    '५': '5',
    '६': '6',
    '७': '7',
    '८': '8',
    '९': '9',
  };
  return String(input || '').replace(/[०-९]/g, (ch) => map[ch] || ch);
}

/**
 * Normalizes a scanned date string from a milk slip/passbook into YYYY-MM-DD.
 * Supports:
 * - "2026-10-21", "2026/10/21"
 * - "21/10/2026", "21-10-2026", "21.10.2026", "21/10/26"
 * - "21/10", "21-10" (uses fallbackDate's year)
 * - "21", "दिनांक 21", "21 तारीख", "ता. 21" (uses fallbackDate's year & month)
 */
export function normalizeScannedDate(rawDate: string | undefined, fallbackDate: string): string {
  const safeFallback =
    fallbackDate && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)
      ? fallbackDate
      : new Date().toISOString().slice(0, 10);
  if (!rawDate) return safeFallback;

  const cleaned = convertDevanagariDigitsToAscii(String(rawDate)).trim();
  if (!cleaned) return safeFallback;

  const [fbYearStr, fbMonthStr] = safeFallback.split('-');
  const fbYear = Number(fbYearStr) || new Date().getFullYear();
  const fbMonth = Number(fbMonthStr) || new Date().getMonth() + 1;

  const formatYMD = (y: number, m: number, d: number): string | null => {
    const year = y < 100 ? 2000 + y : y;
    if (year < 2000 || year > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(
      2,
      '0'
    )}`;
  };

  // Normalize OCR spaces around date separators (e.g. "28 - 10 - 2026" -> "28-10-2026", "28 / 10 / 26" -> "28/10/26")
  const compact = cleaned.replace(/(\d)\s*([-/.])\s*(\d)/g, "$1$2$3").replace(/(\d)\s*([-/.])\s*(\d)/g, "$1$2$3");

  // 1. YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = compact.match(/(?:^|\b)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\b|$)/);
  if (ymdMatch) {
    const res = formatYMD(Number(ymdMatch[1]), Number(ymdMatch[2]), Number(ymdMatch[3]));
    if (res) return res;
  }

  // 2. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY or DD/MM/YY
  const dmyMatch = compact.match(/(?:^|\b)(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\b|$)/);
  if (dmyMatch) {
    const p1 = Number(dmyMatch[1]);
    const p2 = Number(dmyMatch[2]);
    const p3 = Number(dmyMatch[3]);
    const res = formatYMD(p3, p2, p1) || (p2 > 12 && p1 <= 12 ? formatYMD(p3, p1, p2) : null);
    if (res) return res;
  }

  // 3. DD/MM or DD-MM
  const dmMatch = compact.match(/(?:^|\b)(\d{1,2})[/-](\d{1,2})(?:\b|$)/);
  if (dmMatch) {
    const p1 = Number(dmMatch[1]);
    const p2 = Number(dmMatch[2]);
    const res = formatYMD(fbYear, p2, p1) || (p2 > 12 && p1 <= 12 ? formatYMD(fbYear, p1, p2) : null);
    if (res) return res;
  }

  // 4. Day of month only (e.g. "21", "दिनांक 21", "21 तारीख", "ता. 21")
  const dayOnlyMatch = cleaned.match(
    /^(?:दिनांक|तारीख|ता\.?|date|dt\.?)?\s*[:=-]?\s*(\d{1,2})\s*(?:तारीख|ता\.?)?$/i
  );
  if (dayOnlyMatch) {
    const res = formatYMD(fbYear, fbMonth, Number(dayOnlyMatch[1]));
    if (res) return res;
  }

  return safeFallback;
}

/**
 * Normalizes a scanned shift string (Hindi or English) into 'morning' | 'evening'.
 */
export function normalizeScannedShift(
  rawShift: string | undefined,
  fallbackShift: ShiftType
): ShiftType {
  if (!rawShift) return fallbackShift;
  const s = convertDevanagariDigitsToAscii(String(rawShift)).trim().toLowerCase();
  if (!s) return fallbackShift;

  if (
    s === 'morning' ||
    s === 'm' ||
    s === 'am' ||
    s === 'a.m.' ||
    s === 'subah' ||
    s === 'savere' ||
    s.includes('morning') ||
    s.includes('subah') ||
    s.includes('सुबह') ||
    s.includes('सवेरे') ||
    s.includes('सवेरा') ||
    s.includes('प्रातः') ||
    s.includes('प्रात') ||
    s.includes('मॉर्निंग') ||
    s === 'सु' ||
    s === 'स'
  ) {
    return 'morning';
  }

  if (
    s === 'evening' ||
    s === 'e' ||
    s === 'pm' ||
    s === 'p.m.' ||
    s === 'sham' ||
    s === 'shaam' ||
    s === 'sanjh' ||
    s.includes('evening') ||
    s.includes('sham') ||
    s.includes('shaam') ||
    s.includes('शाम') ||
    s.includes('सांझ') ||
    s.includes('सायं') ||
    s.includes('इवनिंग') ||
    s === 'शा'
  ) {
    return 'evening';
  }

  return fallbackShift;
}

const SLIP_NOISE_WORDS = new Set([
  'fat',
  'snf',
  'clr',
  'liter',
  'liters',
  'ltr',
  'qty',
  'wt',
  'rate',
  'amt',
  'amount',
  'total',
  'milk',
  'cow',
  'buffalo',
  'buf',
  'date',
  'dt',
  'shift',
  'morning',
  'evening',
  'subah',
  'sham',
  'shaam',
  'am',
  'pm',
  'm',
  'e',
  'l',
  'f',
  's',
  'rs',
  'inr',
  'id',
  'code',
  'no',
  'name',
  'farmer',
  'फैट',
  'फेट',
  'एसएनएफ',
  'डिग्री',
  'मात्रा',
  'लीटर',
  'वजन',
  'दूध',
  'रेट',
  'दर',
  'भाव',
  'कुल',
  'रकम',
  'योग',
  'राशि',
  'कोड',
  'क्र',
  'क्रमांक',
  'किसान',
  'नाम',
  'दिनांक',
  'तारीख',
  'ता',
  'शिफ्ट',
  'समय',
  'सुबह',
  'सवेरे',
  'सवेरा',
  'प्रातः',
  'प्रात',
  'मॉर्निंग',
  'शाम',
  'सांझ',
  'सायं',
  'इवनिंग',
  'गाय',
  'भैंस',
  'भेंस',
  'भेस',
  'भैस',
  'गाय',
  'गाये',
  'पशु',
  'मवेशी',
  'प्रकार',
  'पर्ची',
  'डेयरी',
  'उजाला',
  'कलेक्शन',
  'डैशबोर्ड',
  'बिक्री',
  'बैकअप',
  'खर्च',
  'दिन',
  'आज',
  'का',
  'की',
  'के',
  'से',
  'मे',
  'में',
  'पर',
  'कुल',
  'रकम',
  'राशि',
  'लीटर',
  'मात्रा',
  'रेट',
  'दर',
  'फैट',
  'फेट',
  'किसान',
  'कोड',
  'सुबह',
  'शाम',
  'animal',
  'cattle',
  'type',
  'milk',
  'dairy',
  'ujalaa',
  'ujala',
  'restore',
  'english',
  'slip',
  'receipt',
  're',
  'kb',
]);

export function cleanScannedFarmerName(rawName?: string): string | undefined {
  if (!rawName) return undefined;
  const ascii = convertDevanagariDigitsToAscii(String(rawName));
  const stripped = ascii
    .replace(/[^\u0900-\u097FA-Za-z0-9\s–—-]/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\b/g, ' ')
    .trim();
  if (!stripped) return undefined;

  const words = stripped
    .split(/\s+/)
    .map((w) => w.replace(/^[-–—.]+|[-–—.]+$/g, '').trim())
    .filter((w) => {
      if (!w) return false;
      const lower = w.toLowerCase();
      if (SLIP_NOISE_WORDS.has(lower)) return false;
      if (/^[0-9.]+$/.test(lower)) return false;
      if (!/[\u0900-\u097FA-Za-z]/.test(lower)) return false;
      return true;
    });

  const joined = words.join(' ').trim();
  const letterCount = (joined.match(/[\u0900-\u097FA-Za-z]/g) || []).length;
  return joined.length >= 2 && letterCount >= 2 ? joined : undefined;
}

function normalizeNameForComparison(name: string): string {
  return convertDevanagariDigitsToAscii(String(name || ''))
    .toLowerCase()
    .replace(/[,:;()[\]{}=+|/\\._–—-]+/g, ' ')
    .replace(/(?:^|\s)(श्री|श्रीमती|जी|किसान|नाम|कोड|shri|smt|mr|mrs|ji|code)(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePureNameWithoutDigits(name: string): string {
  return normalizeNameForComparison(name)
    .replace(/\b\d+(?:\.\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts Devanagari Hindi names or English/Hinglish names to a normalized phonetic Latin skeleton
 * so "पवन बैरागी" matches "Pawan Bairagi", "रघुवीर" matches "Raghuveer", "रामलाल" matches "Ramlal", etc.
 */
export function transliterateToPhoneticLatin(input: string): string {
  const devToLat: Record<string, string> = {
    अ: 'a', आ: 'a', इ: 'i', ई: 'i', उ: 'u', ऊ: 'u', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au',
    क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n',
    च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
    ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
    त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
    प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm',
    य: 'y', र: 'r', ल: 'l', व: 'v',
    श: 'sh', ष: 'sh', स: 's', ह: 'h',
    क्ष: 'ksh', त्र: 'tr', ज्ञ: 'gy',
    ड़: 'd', ढ़: 'dh', क़: 'k', ख़: 'kh', ग़: 'g', ज़: 'z', फ़: 'f',
    'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri',
    'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
    'ं': 'n', 'ँ': 'n', 'ः': 'h', '्': '', '़': '',
  };

  const str = normalizePureNameWithoutDigits(input);
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (devToLat[ch] !== undefined) {
      out += devToLat[ch];
    } else if (/[a-z0-9\s]/.test(ch)) {
      out += ch;
    }
  }
  return out
    .replace(/w/g, 'v')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches a farmer from the registered farmers list using strict priority:
 * 1. Farmer Name FIRST ("पहले किसान का नाम देखकर मिलान करे — कोई नया नाम अपने आप ऐड न करे")
 * 2. Farmer Code SECOND ("यदि नाम नहीं हो तो फिर कोड से मिलान कर एंट्री सेव करे")
 */
export function matchFarmerByNameThenCode(
  farmers: Farmer[],
  rawName?: string,
  rawCode?: string
): Farmer | undefined {
  if (!farmers || farmers.length === 0) return undefined;

  // Step 0: Check rawName WITH digits preserved first (e.g. "5 – पवन बैरागी" matching f.name = "5 – पवन बैरागी")
  if (rawName && String(rawName).trim().length >= 2) {
    const fullTarget = normalizeNameForComparison(rawName);
    if (fullTarget.length >= 2 && !/^\d+$/.test(fullTarget)) {
      const fullExact = farmers.find((f) => normalizeNameForComparison(f.name) === fullTarget);
      if (fullExact) return fullExact;
    }
  }

  // Priority 1: Match by Farmer Name FIRST (pure text without numbers/prefixes)
  const cleanedRawName = cleanScannedFarmerName(rawName);
  if (cleanedRawName) {
    const targetName = normalizePureNameWithoutDigits(cleanedRawName);
    if (targetName.length >= 2) {
      // 1a. Exact pure name match (e.g. "पवन बैरागी" matches "5 – पवन बैरागी" or "पवन बैरागी")
      const exactMatch = farmers.find(
        (f) => normalizePureNameWithoutDigits(f.name) === targetName
      );
      if (exactMatch) return exactMatch;

      // 1b. Substring / containment match (e.g. "रामलाल" in "4 – रामलाल जी" or "रामलाल गुर्जर")
      const substringMatch = farmers.find((f) => {
        const fNorm = normalizePureNameWithoutDigits(f.name);
        if (!fNorm || fNorm.length < 2) return false;
        return fNorm.includes(targetName) || targetName.includes(fNorm);
      });
      if (substringMatch) return substringMatch;

      // 1c. First/primary token match (e.g. "रघुवीर" vs "3 – रघुवीर जी" when first name has >= 2 chars)
      const targetTokens = targetName.split(' ').filter((t) => t.length >= 2);
      if (targetTokens.length > 0) {
        const firstToken = targetTokens[0];
        const tokenMatch = farmers.find((f) => {
          const fTokens = normalizePureNameWithoutDigits(f.name)
            .split(' ')
            .filter((t) => t.length >= 2);
          return fTokens.length > 0 && (fTokens[0] === firstToken || fTokens.includes(firstToken));
        });
        if (tokenMatch) return tokenMatch;
      }

      // 1d. Phonetic Devanagari <-> English/Hinglish match (e.g. "Pawan Bairagi" matches "5 – पवन बैरागी")
      const targetPhonetic = transliterateToPhoneticLatin(targetName);
      if (targetPhonetic.length >= 3) {
        const phoneticMatch = farmers.find((f) => {
          const fPhonetic = transliterateToPhoneticLatin(f.name);
          if (!fPhonetic || fPhonetic.length < 3) return false;
          if (fPhonetic === targetPhonetic) return true;
          if (fPhonetic.includes(targetPhonetic) || targetPhonetic.includes(fPhonetic)) return true;
          const tFirst = targetPhonetic.split(' ')[0];
          const fFirst = fPhonetic.split(' ')[0];
          return tFirst.length >= 3 && tFirst === fFirst;
        });
        if (phoneticMatch) return phoneticMatch;
      }
    }
  }

  // Priority 2: Match by Farmer Code SECOND (when name is absent or did not match any farmer)
  const candidateCode = rawCode
    ? convertDevanagariDigitsToAscii(String(rawCode)).trim()
    : rawName && /^\d+$/.test(convertDevanagariDigitsToAscii(String(rawName)).trim())
    ? convertDevanagariDigitsToAscii(String(rawName)).trim()
    : '';

  if (candidateCode) {
    const cleanCode = candidateCode.toLowerCase();
    const strippedCode = cleanCode.replace(/^0+/, '') || '0';
    const codeMatch = farmers.find((f) => {
      const fCode = convertDevanagariDigitsToAscii(String(f.code || ''))
        .trim()
        .toLowerCase();
      if (!fCode) return false;
      const fStripped = fCode.replace(/^0+/, '') || '0';
      return fCode === cleanCode || fStripped === strippedCode;
    });
    if (codeMatch) return codeMatch;

    // Also check if a farmer's name starts with "<code > –" (e.g. "5 – पवन बैरागी") when only prefix number is given
    const prefixNameMatch = farmers.find((f) => {
      const m = convertDevanagariDigitsToAscii(String(f.name || '').trim()).match(/^(\d+)\s*[-–—]/);
      return Boolean(m && (m[1] === cleanCode || m[1].replace(/^0+/, '') === strippedCode));
    });
    if (prefixNameMatch) return prefixNameMatch;
  }

  return undefined;
}

export function lookupNearestRateFromChart(
  chart: RateChartMatrix | null | undefined,
  fat: number,
  snf: number
): number | null {
  if (!chart || !chart.rates) return null;
  const exact = lookupRateFromChart(chart, fat, snf);
  if (exact.found && exact.rate !== null) return exact.rate;

  let bestRate: number | null = null;
  let bestDist = Infinity;
  for (const [key, val] of Object.entries(chart.rates)) {
    const r = Number(val);
    if (!Number.isFinite(r) || r <= 0) continue;
    const parts = key.split('_');
    if (parts.length !== 2) continue;
    const kFat = Number(parts[0]);
    const kSnf = Number(parts[1]);
    if (!Number.isFinite(kFat) || !Number.isFinite(kSnf)) continue;
    const dist = Math.abs(kFat - fat) * 2 + Math.abs(kSnf - snf);
    if (dist < bestDist) {
      bestDist = dist;
      bestRate = round2(r);
    }
  }
  return bestRate;
}

/**
 * Helper to detect if a line contains a registered farmer's name from `state.farmers`.
 * If matched, returns the matched Farmer and the remaining line text AFTER the farmer's name
 * ("पहले किसान का नाम देखकर उसके आगे date shift fat snf rate qty देखकर प्रिव्यू सही बताए").
 */
function matchAndSliceRegisteredFarmerInLine(
  line: string,
  registeredFarmers?: Farmer[]
): {
  matchedFarmer?: Farmer;
  slicedLine: string;
} {
  if (!registeredFarmers || registeredFarmers.length === 0 || !line) {
    return { slicedLine: line };
  }

  // Sort candidates by pure name length descending so longer names ("देवाजी भोपा जी") match first
  const candidates = [...registeredFarmers].sort(
    (a, b) =>
      normalizePureNameWithoutDigits(b.name).length -
      normalizePureNameWithoutDigits(a.name).length
  );

  for (const farmer of candidates) {
    const rawFarmerName = convertDevanagariDigitsToAscii(String(farmer.name || '').trim());
    const pureFarmerName = normalizePureNameWithoutDigits(rawFarmerName);
    if (!pureFarmerName || pureFarmerName.length < 2) continue;

    // Build patterns to search in line:
    // 1. Exact full farmer.name (e.g. "5 – पवन बैरागी" or "5 - पवन बैरागी")
    // 2. Pure name without prefix numbers/ji (e.g. "पवन बैरागी" or "रघुवीर जी" or "रघुवीर")
    const rawNameWithoutPrefix = rawFarmerName.replace(/^\d+\s*[-–—]\s*/, '').trim();
    const searchVariants = Array.from(
      new Set(
        [rawFarmerName, rawNameWithoutPrefix, pureFarmerName].filter(
          (v) => v && v.length >= 2 && !/^\d+$/.test(v)
        )
      )
    );

    for (const variant of searchVariants) {
      const escaped = variant
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/[\s–—-]+/g, '[\\s–—-]+');
      const regex = new RegExp(escaped, 'i');
      const m = regex.exec(line);
      if (m) {
        // Slice everything AFTER the matched farmer name (and any trailing "जी" or "किसान कोड: X")
        const afterName = line
          .slice(m.index + m[0].length)
          .replace(/^\s*(?:जी|ji)\b/i, '')
          .replace(/(?:किसान\s*कोड|कोड|farmer\s*code|code)\s*[:=-]?\s*\d+/gi, ' ')
          .trim();
        return {
          matchedFarmer: farmer,
          slicedLine: afterName,
        };
      }
    }
  }

  // Second pass: check primary first-name token (length >= 3, e.g. "पवन" for "5 – पवन बैरागी")
  for (const farmer of candidates) {
    const pureFarmerName = normalizePureNameWithoutDigits(farmer.name);
    const primaryTok = pureFarmerName.split(' ')[0];
    if (!primaryTok || primaryTok.length < 3 || /^\d+$/.test(primaryTok)) continue;
    const escaped = primaryTok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|\\s|-|–|—)(${escaped})(?=\\s|$|[,;:|])`, 'i');
    const m = regex.exec(line);
    if (m) {
      const afterName = line
        .slice(m.index + m[0].length)
        .replace(/^\s*(?:जी|ji)\b/i, '')
        .replace(/(?:किसान\s*कोड|कोड|farmer\s*code|code)\s*[:=-]?\s*\d+/gi, ' ')
        .trim();
      return {
        matchedFarmer: farmer,
        slicedLine: afterName,
      };
    }
  }

  // Third pass: if OCR slightly altered a Hindi character in the name (e.g. "3 - खुबवीर जी  किसान कोड: 2" for "3 – रघुवीर जी"),
  // match by explicit "किसान कोड: X" or "<prefix> - <HindiName>" when registered farmer has that code/prefix!
  const explicitKisanCodeMatch = line.match(
    /(?:किसान\s*कोड|farmer\s*code)\s*[:=-]?\s*([A-Za-z0-9]+)/i
  );
  if (explicitKisanCodeMatch && explicitKisanCodeMatch.index !== undefined) {
    const targetCode = explicitKisanCodeMatch[1].trim().toLowerCase();
    const matchedByCode = registeredFarmers.find(
      (f) => String(f.code || '').trim().toLowerCase() === targetCode
    );
    if (matchedByCode) {
      const afterCode = line
        .slice(explicitKisanCodeMatch.index + explicitKisanCodeMatch[0].length)
        .trim();
      return {
        matchedFarmer: matchedByCode,
        slicedLine: afterCode,
      };
    }
  }

  return { slicedLine: line };
}

/**
 * Parses handwritten/printed text lines from a milk slip, PDF bill, multi-farmer register page,
 * vertical thermal analyzer slip, or multi-date morning/evening farmer passbook into ScannedSlipRawRow items.
 * Follows strict priority:
 * 1. First match Farmer Name ("पहले किसान का नाम देखकर")
 * 2. Then look ahead ("उसके आगे") for Date, Shift, FAT, SNF, Rate, Qty (Liters), and Amount
 * 3. Mathematical cross-verification (Liters * Rate ≈ Amount) and zero garbage/summary rows.
 */
export function parseMilkSlipTextToRows(
  rawText: string,
  defaultDate?: string,
  defaultShift?: ShiftType,
  registeredFarmers?: Farmer[]
): ScannedSlipRawRow[] {
  if (!rawText || !rawText.trim()) return [];
  // Normalize Devanagari digits, Devanagari danda (।/॥ -> |), comma decimals (e.g. "5,5" -> "5.5"), and double dots ("4..5" -> "4.5")
  const asciiText = convertDevanagariDigitsToAscii(rawText)
    .replace(/[।॥]/g, ' | ')
    .replace(/(\d),(\d{1,3})(?!\d)/g, '$1.$2')
    .replace(/(\d)\.\.+(\d)/g, '$1.$2');

  const rawSplitLines = asciiText
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Pre-split any single line that has multiple registered farmers (or multiple "Code – Name" blocks)
  // merged onto the same line after milk numbers ("पहले किसान का नाम देखकर उसके आगे date shift fat snf rate qty")
  const initialLines: string[] = [];
  for (const line of rawSplitLines) {
    if (registeredFarmers && registeredFarmers.length > 0) {
      const boundaryPositions: number[] = [];
      for (const f of registeredFarmers) {
        const rawFName = convertDevanagariDigitsToAscii(String(f.name || '').trim());
        const pureFName = normalizePureNameWithoutDigits(rawFName);
        const variants = Array.from(
          new Set([rawFName, pureFName].filter((v) => v && v.length >= 2 && !/^\d+$/.test(v)))
        );
        for (const v of variants) {
          const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s–—-]+/g, '[\\s–—-]+');
          const rx = new RegExp(esc, 'gi');
          let m: RegExpExecArray | null;
          while ((m = rx.exec(line)) !== null) {
            if (!boundaryPositions.some((pos) => Math.abs(pos - m!.index) < 12)) {
              boundaryPositions.push(m.index);
            }
          }
        }
      }
      boundaryPositions.sort((a, b) => a - b);
      if (boundaryPositions.length >= 2) {
        let validSplitPoints = [boundaryPositions[0]];
        for (let k = 1; k < boundaryPositions.length; k++) {
          const prevPos = validSplitPoints[validSplitPoints.length - 1];
          const curPos = boundaryPositions[k];
          const between = line.slice(prevPos, curPos);
          // Only split if there are at least 2 numbers between the previous farmer name and this farmer name
          const numMatches = between.match(/\d+(?:\.\d+)?/g);
          if (numMatches && numMatches.length >= 2) {
            validSplitPoints.push(curPos);
          }
        }
        if (validSplitPoints.length >= 2) {
          for (let k = 0; k < validSplitPoints.length; k++) {
            const start = k === 0 ? 0 : validSplitPoints[k];
            const end = k + 1 < validSplitPoints.length ? validSplitPoints[k + 1] : line.length;
            const sub = line.slice(start, end).trim();
            if (sub) initialLines.push(sub);
          }
          continue;
        }
      }
    }
    initialLines.push(line);
  }

  // Step 0: Pre-join standalone vertical card label lines with their immediately following value line
  // (e.g. "लीटर\n1.96 L" -> "लीटर: 1.96 L", "FAT\n5.3" -> "FAT: 5.3", "SNF\n8.3" -> "SNF: 8.3", "रेट\n₹45.90" -> "रेट: ₹45.90", "कुल रकम:\n₹89" -> "कुल रकम: ₹89")
  const rawLines: string[] = [];
  const standaloneLabelRegex =
    /^(?:लीटर|मात्रा(?:\s*\(L\))?|वजन|दूध|qty(?:\s*\(l\))?|liters?|fat|फैट|फेट|snf|एसएनएफ|डिग्री|clr|रेट(?:\s*\/?\s*l)?|दर|भाव|rate(?:\s*\/?\s*l)?|कुल\s*रकम(?:\s*\(पूर्णांक\))?|कुल\s*राशि|रकम|राशि|amount|total\s*amt|किसान\s*कोड|कोड|किसान(?:\s*का\s*नाम)?|नाम|तारीख|दिनांक)\s*[:=-]?$/i;

  for (let i = 0; i < initialLines.length; i++) {
    const cur = initialLines[i];
    if (standaloneLabelRegex.test(cur) && i + 1 < initialLines.length) {
      const nextLine = initialLines[i + 1];
      if (!standaloneLabelRegex.test(nextLine)) {
        rawLines.push(`${cur.replace(/[:=-]+$/, '')}: ${nextLine}`);
        i++;
        continue;
      }
    }
    rawLines.push(cur);
  }

  const results: ScannedSlipRawRow[] = [];

  const normalizeFat = (v: number): number => {
    if (v >= 25 && v <= 115 && Number.isInteger(v)) return round2(v / 10);
    return round2(v);
  };
  const normalizeSnf = (v: number): number => {
    if (v >= 70 && v <= 105 && Number.isInteger(v)) return round2(v / 10);
    return round2(v);
  };
  const normalizeLiters = (v: number): number => {
    // Do NOT divide 4-digit calendar years (2020..2035) by 1000
    if (v >= 2020 && v <= 2035 && Number.isInteger(v)) return round3(v);
    if (v >= 1000 && v <= 9999 && Number.isInteger(v)) return round3(v / 1000);
    return round3(v);
  };

  // Sticky context for multi-row passbook / register pages
  let stickyFarmerName: string | undefined;
  let stickyFarmerCode: string | undefined;
  let stickyDate: string | undefined = undefined;
  let stickyShift: ShiftType | undefined = defaultShift;
  let hasExplicitFarmerHeader = false;
  let hasFullDateInSlip = false;

  // Multi-line vertical thermal slip / card accumulator
  let pendingVerticalSlip: {
    farmerCode?: string;
    farmerName?: string;
    date?: string;
    shift?: ShiftType;
    milkType?: MilkType;
    liters?: number;
    fat?: number;
    snf?: number;
    rate?: number;
    amount?: number;
  } = {};

  const flushPendingVerticalSlipIfReady = () => {
    if (
      pendingVerticalSlip.liters &&
      pendingVerticalSlip.liters > 0 &&
      pendingVerticalSlip.fat &&
      pendingVerticalSlip.fat > 0
    ) {
      let finalLiters = pendingVerticalSlip.liters;
      const r = pendingVerticalSlip.rate;
      const amt = pendingVerticalSlip.amount;
      if (r && r >= 15 && r <= 120 && amt && amt >= 10) {
        const expected = amt / r;
        if (
          expected >= 0.2 &&
          expected <= 200 &&
          Math.abs(finalLiters * r - amt) > Math.max(3, amt * 0.05)
        ) {
          const roundedExp = round3(expected);
          if (Math.abs(roundedExp * r - amt) <= 2.5) {
            finalLiters = roundedExp;
          }
        }
      }
      results.push({
        farmerCode: pendingVerticalSlip.farmerCode || stickyFarmerCode,
        farmerName: pendingVerticalSlip.farmerName || stickyFarmerName,
        date: pendingVerticalSlip.date || stickyDate || defaultDate,
        shift: pendingVerticalSlip.shift || stickyShift || defaultShift,
        milkType: pendingVerticalSlip.milkType,
        liters: finalLiters,
        fat: pendingVerticalSlip.fat,
        snf: pendingVerticalSlip.snf || 8.5,
        rate: pendingVerticalSlip.rate,
        amount: pendingVerticalSlip.amount,
      });
      pendingVerticalSlip = {};
    }
  };

  // Helper to extract date token from a line and strip ALL date tokens so secondary dates in ranges ("21-10-2026 से 31-10-2026") never turn into numbers
  const extractDateFromLine = (
    inputLine: string
  ): { dateStr?: string; isFullDate?: boolean; remainingLine: string } => {
    // Collapse OCR spaces inside full dates (e.g. "28 - 10 - 2026" -> "28-10-2026", "28 / 10 / 2026" -> "28/10/2026")
    let working = inputLine
      .replace(/\b(\d{1,2})\s*([-/.])\s*(\d{1,2})\s*\2\s*(\d{2,4})\b/g, "$1$2$3$2$4")
      .replace(/\b(\d{4})\s*([-/.])\s*(\d{1,2})\s*\2\s*(\d{1,2})\b/g, "$1$2$3$2$4");
    let foundDate: string | undefined;
    let isFullDate = false;

    // 1. Strip all YYYY-MM-DD or YYYY/MM/DD dates, keeping the first one
    const ymdMatches = working.match(/\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/g);
    if (ymdMatches && ymdMatches.length > 0) {
      foundDate = ymdMatches[0];
      isFullDate = true;
      working = working.replace(/(?:(?:दिनांक|तारीख|ता\.?|date|dt\.?)\s*[:=-]?\s*)?\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/gi, ' ');
    }

    // 2. Strip all DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY or DD/MM/YY dates, keeping the first one
    const dmyMatches = working.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/g);
    if (dmyMatches && dmyMatches.length > 0) {
      if (!foundDate) {
        foundDate = dmyMatches[0];
        isFullDate = true;
      }
      working = working.replace(/(?:(?:दिनांक|तारीख|ता\.?|date|dt\.?)\s*[:=-]?\s*)?\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/gi, ' ');
    }

    if (foundDate) {
      return { dateStr: foundDate, isFullDate, remainingLine: working };
    }

    // 3. DD/MM or DD-MM (strictly slash or hyphen, NEVER dot so decimals like 5.5 are untouched)
    const dm = working.match(
      /(?:(?:दिनांक|तारीख|ता\.?|date|dt\.?)\s*[:=-]?\s*)?\b(\d{1,2}[/-]\d{1,2})\b/i
    );
    if (dm) {
      const parts = dm[1].split(/[/-]/);
      const d = Number(parts[0]);
      const m = Number(parts[1]);
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        foundDate = dm[1];
        working = working.replace(dm[0], ' ');
        return { dateStr: foundDate, isFullDate: false, remainingLine: working };
      }
    }

    // 4. Labeled day-of-month: "दिनांक 21", "तारीख 21", "21 तारीख", "ता. 21"
    const dayLabeled = working.match(
      /(?:(?:दिनांक|तारीख|ता\.?|date|dt\.?)\s*[:=-]?\s*(\d{1,2})|(?:^|\s)(\d{1,2})\s*(?:तारीख))(?=\s|$|[,;:|])/i
    );
    if (dayLabeled) {
      const dayVal = Number(dayLabeled[1] || dayLabeled[2]);
      if (dayVal >= 1 && dayVal <= 31) {
        foundDate = String(dayVal);
        working = working.replace(dayLabeled[0], ' ');
        return { dateStr: foundDate, isFullDate: false, remainingLine: working };
      }
    }

    return { dateStr: undefined, isFullDate: false, remainingLine: working };
  };

  // Strict non-entry summary / header line detector
  const isSummaryOrHeaderNoiseLine = (lineStr: string): boolean => {
    const t = lineStr.trim();
    if (!t) return true;
    // Skip bill/report summary, total, balance, payment, or date-range header lines
    if (
      /(?:आज\s*की\s*दूध\s*कलेक्शन|कुल\s*किसान|सुबह\s*का\s*टोटल|शाम\s*का\s*टोटल|सुबह\s*टोटल|शाम\s*टोटल|सुबह\s*\+\s*शाम|कुल\s*टोटल|कुल\s*दूध|पिछला\s*बकाया|एडवांस|जोड़-घटाव|अंतिम\s*शेष|शेष\s*देय|कुल\s*देय|भुगतान\s*राशि|यहीं\s*पर\s*भुगतान|बिल\s*नं|अवधि\s*[:=-]|औसत\s*fat|औसत\s*snf|कुल\s*योग|महायोग|grand\s*total|sub\s*total|morning\s*total|evening\s*total|opening\s*balance|net\s*payable)/i.test(
        t
      )
    ) {
      return true;
    }
    if (/^(?:योग|औसत|total\s*[:=-]|\s*total\s*$|प्रिंट\b)/i.test(t)) {
      return true;
    }
    // Skip Android status bar / app navigation chrome lines
    if (/\b(?:kb\/s|volte|ujalaa\s*dairy|कलेक्शन\s*\/\s*restore|डैशबोर्ड\s+कलेक्शन)\b/i.test(t)) {
      return true;
    }
    // Skip column-header-only lines (e.g. "लीटर FAT SNF रेट कुल रकम:") when they contain no digits
    if (!/\d/.test(t) && /\b(?:fat|snf)\b/i.test(t) && /(?:लीटर|रेट|कुल\s*रकम|rate|qty)/i.test(t)) {
      return true;
    }
    // Date range line like "21-10-2026 से 31-10-2026" or "01-10-2026 to 10-10-2026"
    if (/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s*(?:से|to|-|–)\s*\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/i.test(t)) {
      return true;
    }
    return false;
  };

  // Expand dual-shift lines (where a single line has both Morning and Evening entries for a date)
  const expandedSegments: {
    text: string;
    explicitDate?: string;
    lineDate?: string;
    forcedShift?: ShiftType;
    preMatchedFarmer?: Farmer;
  }[] = [];

  for (const rawLine of rawLines) {
    if (isSummaryOrHeaderNoiseLine(rawLine)) {
      // Even if this is a report title/header line (e.g. "आज की दूध कलेक्शन (28-10-2026)"),
      // capture its date into stickyDate unless it is a multi-date range ("21-10-2026 से 31-10-2026")!
      const isDateRangeHeader =
        /(?:अवधि\s*[:=-]|\b\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4}\s*(?:से|to|-|–)\s*\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4}\b)/i.test(
          rawLine
        );
      if (!isDateRangeHeader) {
        const headerDateInfo = extractDateFromLine(rawLine);
        if (headerDateInfo.dateStr && headerDateInfo.isFullDate) {
          stickyDate = headerDateInfo.dateStr;
          hasFullDateInSlip = true;
        }
      }
      continue;
    }

    // First check if a registered farmer's name appears in this line!
    // ("पहले किसान का नाम देखकर उसके आगे date shift fat snf rate qty देखकर प्रिव्यू सही बताए")
    const { matchedFarmer: preMatchedFarmer, slicedLine } = matchAndSliceRegisteredFarmerInLine(
      rawLine,
      registeredFarmers
    );

    const lineAfterFarmer = preMatchedFarmer ? slicedLine : rawLine;

    // Strip time stamps like 07:15:22 or 06:45 AM so they don't pollute numbers
    const withoutTimestamps = lineAfterFarmer.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ');

    const { dateStr, isFullDate, remainingLine } = extractDateFromLine(withoutTimestamps);
    if (isFullDate) {
      hasFullDateInSlip = true;
    }
    if (dateStr) {
      stickyDate = dateStr;
    }
    const effectiveLineDate = dateStr || stickyDate;

    // Check if the line has both Morning and Evening segments on the same row:
    const dualShiftRegex =
      /^(.*?)(?:^|[\s,;:()[\]-])(सुबह|सवेरे|सवेरा|प्रातः|प्रात|मॉर्निंग|morning|subah|am)(?=[\s,;:()[\]-])([\s\S]+?)(?:^|[\s,;:()[\]-])(शाम|सांझ|सायं|इवनिंग|evening|sham|shaam|pm)(?=[\s,;:()[\]-])([\s\S]+)$/i;
    const dualMatch = remainingLine.match(dualShiftRegex);
    if (dualMatch) {
      const prefix = dualMatch[1].trim();
      const mornBody = dualMatch[3].trim();
      const eveBody = dualMatch[5].trim();
      expandedSegments.push({
        text: `${prefix} ${mornBody}`.trim(),
        explicitDate: dateStr,
        lineDate: effectiveLineDate,
        forcedShift: 'morning',
        preMatchedFarmer,
      });
      expandedSegments.push({
        text: `${prefix} ${eveBody}`.trim(),
        explicitDate: dateStr,
        lineDate: effectiveLineDate,
        forcedShift: 'evening',
        preMatchedFarmer,
      });
    } else {
      expandedSegments.push({
        text: remainingLine.trim(),
        explicitDate: dateStr,
        lineDate: effectiveLineDate,
        preMatchedFarmer,
      });
    }
  }

  // Pre-scan expandedSegments to detect if this is a multi-date passbook page
  let dayPrefixedRowCount = 0;
  const seenDayPrefixes = new Set<number>();
  for (const seg of expandedSegments) {
    const toks = seg.text.split(/[\s,|/:-]+/).filter(Boolean);
    const nums: number[] = [];
    for (const tok of toks) {
      const cleanedTok = tok.replace(/[L₹·•lkgKGलीटर()[\]]/g, '');
      const cleanedNum = cleanedTok.replace(/[^0-9.]/g, '');
      const numVal = Number(cleanedNum);
      if (
        cleanedNum !== '' &&
        Number.isFinite(numVal) &&
        numVal > 0 &&
        /^[0-9]+(?:\.[0-9]+)?$/.test(cleanedTok)
      ) {
        nums.push(numVal);
      }
    }
    if (
      nums.length >= 3 &&
      Number.isInteger(nums[0]) &&
      nums[0] >= 1 &&
      nums[0] <= 31
    ) {
      dayPrefixedRowCount++;
      seenDayPrefixes.add(nums[0]);
    }
  }
  const isPassbookDateSequence =
    dayPrefixedRowCount >= 2 && seenDayPrefixes.size >= 2;

  for (const seg of expandedSegments) {
    const line = seg.text;

    // If a registered farmer was matched on this line, flush any completed previous vertical card FIRST, then lock this farmer!
    if (seg.preMatchedFarmer) {
      flushPendingVerticalSlipIfReady();
      stickyFarmerName = seg.preMatchedFarmer.name;
      stickyFarmerCode = seg.preMatchedFarmer.code;
      pendingVerticalSlip = {
        farmerName: seg.preMatchedFarmer.name,
        farmerCode: seg.preMatchedFarmer.code,
      };
      hasExplicitFarmerHeader = true;
    }

    if (!line && !seg.explicitDate) continue;

    // Detect shift on this segment
    let lineShift: ShiftType | undefined = seg.forcedShift;
    if (!lineShift) {
      if (
        /(?:^|\s|[(:·,|-])(सुबह|सवेरे|सवेरा|प्रातः|प्रात|मॉर्निंग|morning|subah|am)(?:$|\s|[):·,|-])/i.test(
          line
        )
      ) {
        lineShift = 'morning';
      } else if (
        /(?:^|\s|[(:·,|-])(शाम|सांझ|सायं|इवनिंग|evening|sham|shaam|pm)(?:$|\s|[):·,|-])/i.test(
          line
        )
      ) {
        lineShift = 'evening';
      }
    }
    if (lineShift) {
      stickyShift = lineShift;
      pendingVerticalSlip.shift = lineShift;
    }
    if (seg.explicitDate) {
      pendingVerticalSlip.date = seg.explicitDate;
    }
    const effectiveShift = lineShift || stickyShift;

    // Detect explicit animal type if written on line (including OCR variants भेंस/भेस/भैस)
    let lineMilkType: MilkType | undefined;
    if (/(?:^|\s|[(:·,|-])(भैंस|भेंस|भेस|भैस|buffalo|buf|bm)(?:$|\s|[):·,|-])/i.test(line)) {
      lineMilkType = 'buffalo';
      pendingVerticalSlip.milkType = 'buffalo';
    } else if (/(?:^|\s|[(:·,|-])(गाय|गाये|cow|cm)(?:$|\s|[):·,|-])/i.test(line)) {
      lineMilkType = 'cow';
      pendingVerticalSlip.milkType = 'cow';
    }
    const effectiveMilkType = lineMilkType || pendingVerticalSlip.milkType;

    // Extract labeled values first if present
    const fatMatch = line.match(
      /(?:(?:fat|फैट|फेट)\s*[:=-]?\s*|(?:^|\s)f\s*[:=-]\s*)(\d+(?:\.\d+)?)/i
    );
    const snfMatch = line.match(
      /(?:(?:snf|एसएनएफ|डिग्री|clr)\s*[:=-]?\s*|(?:^|\s)s\s*[:=-]\s*)(\d+(?:\.\d+)?)/i
    );
    const litMatch = line.match(
      /(?:(?:liters?|ltr|qty|quantity|मात्रा|लीटर|वजन|दूध|wt|weight)\s*[:=-]?\s*|(?:^|\s)l\s*[:=-]\s*)(\d+(?:\.\d+)?)/i
    );
    const rateMatch = line.match(/(?:rate|रेट|दर|भाव)\s*(?:\/?\s*l)?\s*[:=-]?\s*[₹·•]?\s*(\d+(?:\.\d+)?)/i);
    const amtMatch = line.match(
      /(?:amount|amt|total|कुल\s*राशि|कुल\s*रकम|राशि|रकम|कुल)\s*[:=-]?\s*[₹·•]?\s*(\d+(?:\.\d+)?)/i
    );
    const codeMatch = line.match(/(?:किसान\s*कोड|id|code|कोड|क्र\.?|no)\s*[:=-]?\s*([A-Za-z0-9]+)/i);
    const nameLabelMatch = line.match(
      /(?:किसान(?:\s*का\s*नाम)?|नाम|farmer(?:\s*name)?|name)\s*[:=-]\s*([^\d,;:|/]+)/i
    );

    const lineNumericCount = (line.match(/\d+(?:\.\d+)?/g) || []).length;

    // Update vertical slip accumulator for single-label lines
    if ((codeMatch || nameLabelMatch) && !seg.preMatchedFarmer) {
      flushPendingVerticalSlipIfReady();
    }
    if (codeMatch && !seg.preMatchedFarmer) {
      pendingVerticalSlip.farmerCode = codeMatch[1];
      stickyFarmerCode = codeMatch[1];
      hasExplicitFarmerHeader = true;
    }
    if (nameLabelMatch && !seg.preMatchedFarmer) {
      const nm = cleanScannedFarmerName(nameLabelMatch[1]);
      if (nm) {
        pendingVerticalSlip.farmerName = nm;
        stickyFarmerName = nm;
        hasExplicitFarmerHeader = true;
      }
    }
    if (rateMatch && lineNumericCount < 3) {
      pendingVerticalSlip.rate = round2(Number(rateMatch[1]));
    }
    if (amtMatch && lineNumericCount < 3) {
      pendingVerticalSlip.amount = round2(Number(amtMatch[1]));
      // If pendingVerticalSlip already has liters & fat, receiving total amount completes this card! Flush immediately!
      if (pendingVerticalSlip.liters && pendingVerticalSlip.fat) {
        flushPendingVerticalSlipIfReady();
        continue;
      }
    }
    if (snfMatch && lineNumericCount < 3) {
      pendingVerticalSlip.snf = normalizeSnf(Number(snfMatch[1]));
    }

    if (fatMatch && litMatch) {
      let liters = normalizeLiters(Number(litMatch[1]));
      const fat = normalizeFat(Number(fatMatch[1]));
      const snf = snfMatch ? normalizeSnf(Number(snfMatch[1])) : pendingVerticalSlip.snf || 8.5;
      const rate = rateMatch ? round2(Number(rateMatch[1])) : pendingVerticalSlip.rate;
      const amount = amtMatch ? round2(Number(amtMatch[1])) : pendingVerticalSlip.amount;

      if (rate && rate >= 15 && rate <= 120 && amount && amount >= 10) {
        const expected = amount / rate;
        if (
          expected >= 0.2 &&
          expected <= 200 &&
          Math.abs(liters * rate - amount) > Math.max(3, amount * 0.05)
        ) {
          const roundedExp = round3(expected);
          if (Math.abs(roundedExp * rate - amount) <= 2.5) {
            liters = roundedExp;
          }
        }
      }

      const cleanedName = seg.preMatchedFarmer
        ? seg.preMatchedFarmer.name
        : cleanScannedFarmerName(
            nameLabelMatch
              ? nameLabelMatch[1]
              : line.replace(
                  /(?:fat|फैट|फेट|snf|एसएनएफ|डिग्री|clr|liters?|ltr|qty|quantity|मात्रा|लीटर|वजन|दूध|weight|rate|रेट|दर|भाव|amount|amt|total|राशि|रकम|id|code|कोड|क्र\.?|no)\s*[:=-]?\s*[A-Za-z0-9.₹·•]+/gi,
                  ' '
                )
          );
      const rowCode = seg.preMatchedFarmer
        ? seg.preMatchedFarmer.code
        : codeMatch
        ? codeMatch[1]
        : undefined;
      if (cleanedName) stickyFarmerName = cleanedName;
      if (rowCode) stickyFarmerCode = rowCode;

      if (fat > 0 && snf > 0 && liters > 0) {
        results.push({
          farmerCode: rowCode || stickyFarmerCode,
          farmerName: cleanedName || stickyFarmerName,
          date: seg.explicitDate || stickyDate || defaultDate,
          shift: effectiveShift,
          milkType: effectiveMilkType,
          liters,
          fat,
          snf,
          rate,
          amount,
        });
        pendingVerticalSlip = {};
        continue;
      }
    } else if (fatMatch && !litMatch && lineNumericCount < 3) {
      if (pendingVerticalSlip.fat) {
        flushPendingVerticalSlipIfReady();
      }
      pendingVerticalSlip.fat = normalizeFat(Number(fatMatch[1]));
      continue;
    } else if (litMatch && !fatMatch && lineNumericCount < 3) {
      if (pendingVerticalSlip.liters) {
        flushPendingVerticalSlipIfReady();
      }
      pendingVerticalSlip.liters = normalizeLiters(Number(litMatch[1]));
      continue;
    } else if ((snfMatch || rateMatch || amtMatch) && lineNumericCount < 3) {
      continue;
    }

    // Handle standalone single-value lines in PDF/photo cards (e.g. "1.96 L", "₹45.90", "·45.90", "₹89")
    const standaloneLiterMatch = line.match(/^\s*(\d+(?:\.\d+)?)\s*(?:L|ltr|लीटर)\s*$/i);
    if (standaloneLiterMatch) {
      if (pendingVerticalSlip.liters) {
        flushPendingVerticalSlipIfReady();
      }
      pendingVerticalSlip.liters = normalizeLiters(Number(standaloneLiterMatch[1]));
      continue;
    }
    const standaloneRupeeMatch = line.match(/^\s*[₹·•]\s*(\d+(?:\.\d+)?)\s*$/);
    if (standaloneRupeeMatch) {
      const rVal = Number(standaloneRupeeMatch[1]);
      if (
        standaloneRupeeMatch[1].includes('.') &&
        rVal >= 15 &&
        rVal <= 120 &&
        !pendingVerticalSlip.rate
      ) {
        pendingVerticalSlip.rate = round2(rVal);
      } else {
        pendingVerticalSlip.amount = round2(rVal);
        if (pendingVerticalSlip.liters && pendingVerticalSlip.fat) {
          flushPendingVerticalSlipIfReady();
        }
      }
      continue;
    }

    // Detect "Code – Farmer Name" pattern when not already matched to a registered farmer
    const codeDashNameMatch = !seg.preMatchedFarmer
      ? line.match(
          /(?:^|\s)(\d{1,4})\s*[-–—]\s*([^\d|;:]{2,35}?)(?=\s*(?:किसान\s*कोड|id|code|कोड|\d|$|[|;:]))/i
        )
      : null;

    // If a "Code – Farmer Name" header appears at the start of the line, slice AFTER the farmer name + code badge
    // so prefix numbers (e.g. "1  5 – पवन बैरागी  किसान कोड: 1") never enter the milk numbers array!
    let workingLineForNumbers = line;
    if (codeDashNameMatch && codeDashNameMatch.index !== undefined) {
      const afterDashName = line
        .slice(codeDashNameMatch.index + codeDashNameMatch[0].length)
        .replace(/(?:किसान\s*कोड|कोड|farmer\s*code|code)\s*[:=-]?\s*\d+/gi, ' ')
        .trim();
      workingLineForNumbers = afterDashName;
    } else if (seg.preMatchedFarmer) {
      workingLineForNumbers = line
        .replace(/(?:किसान\s*कोड|कोड|farmer\s*code|code)\s*[:=-]?\s*\d+/gi, ' ')
        .trim();
    }

    // Extract structured numeric tokens (preserving whether each number had '.', 'L', or '₹'/'·')
    interface RichNumToken {
      raw: number;
      rawStr: string;
      hasDecimalPoint: boolean;
      hasLiterUnit: boolean;
      hasRupeeSymbol: boolean;
    }
    const richTokens: RichNumToken[] = [];
    const textWords: string[] = [];

    // Pre-join "1.96 L" -> "1.96L" and "₹ 45.90" / "·45.90" -> "₹45.90" before splitting
    const normalizedWorkingLine = workingLineForNumbers
      .replace(/(\d+(?:\.\d+)?)\s+(L|ltr|लीटर)\b/gi, '$1$2')
      .replace(/[₹·•]\s*(\d+(?:\.\d+)?)/g, '₹$1');

    const rawTokens = normalizedWorkingLine.split(/[\s,|/:-]+/).filter(Boolean);
    for (const tok of rawTokens) {
      const hasLiterUnit = /(?:L|ltr|लीटर)$/i.test(tok);
      const hasRupeeSymbol = /^[₹·•]|^Rs\.?/i.test(tok);
      const cleanedTok = tok.replace(/[L₹·•lkgKGलीटर()[\]]/g, '');
      const cleanedNum = cleanedTok.replace(/[^0-9.]/g, '');
      const numVal = Number(cleanedNum);
      if (
        cleanedNum !== '' &&
        Number.isFinite(numVal) &&
        numVal > 0 &&
        /^[0-9]+(?:\.[0-9]+)?$/.test(cleanedTok)
      ) {
        richTokens.push({
          raw: numVal,
          rawStr: cleanedNum,
          hasDecimalPoint: cleanedNum.includes('.'),
          hasLiterUnit,
          hasRupeeSymbol,
        });
      } else {
        textWords.push(tok);
      }
    }

    const lineFarmerNamePreCheck = seg.preMatchedFarmer
      ? seg.preMatchedFarmer.name
      : cleanScannedFarmerName(
          codeDashNameMatch ? codeDashNameMatch[2] : textWords.join(" ")
        );

    if (
      pendingVerticalSlip.liters &&
      pendingVerticalSlip.liters > 0 &&
      richTokens.length >= 2 &&
      !richTokens.some((t) => t.hasLiterUnit) &&
      !seg.preMatchedFarmer &&
      !codeDashNameMatch &&
      !codeMatch &&
      !nameLabelMatch &&
      !lineFarmerNamePreCheck
    ) {
      richTokens.unshift({
        raw: pendingVerticalSlip.liters,
        rawStr: String(pendingVerticalSlip.liters),
        hasDecimalPoint: true,
        hasLiterUnit: true,
        hasRupeeSymbol: false,
      });
    }

    const numbers = richTokens.map((t) => t.raw);

    const lineFarmerName = seg.preMatchedFarmer
      ? seg.preMatchedFarmer.name
      : cleanScannedFarmerName(
          codeDashNameMatch ? codeDashNameMatch[2] : textWords.join(' ')
        );

    // Check if this line is a Farmer Card Header line
    const hasDecimalNumber = richTokens.some((t) => t.hasDecimalPoint);
    const hasValidSnfCandidate = richTokens.some((t) => {
      const s = normalizeSnf(t.raw);
      return s >= 7.0 && s <= 10.5 && (t.hasDecimalPoint || (t.raw >= 70 && t.raw <= 105));
    });
    const isCardFarmerHeaderLine =
      (Boolean(seg.preMatchedFarmer) ||
        Boolean(codeDashNameMatch) ||
        Boolean(codeMatch) ||
        Boolean(nameLabelMatch)) &&
      Boolean(lineFarmerName) &&
      !hasDecimalNumber &&
      !hasValidSnfCandidate;

    // Handle single-number or header lines
    if (numbers.length < 2 || isCardFarmerHeaderLine) {
      if (isCardFarmerHeaderLine) {
        flushPendingVerticalSlipIfReady();
      }
      const isExplicitHeaderLine =
        Boolean(seg.preMatchedFarmer) ||
        Boolean(codeDashNameMatch) ||
        Boolean(codeMatch) ||
        Boolean(nameLabelMatch);

      if (lineFarmerName && (isExplicitHeaderLine || !hasExplicitFarmerHeader)) {
        stickyFarmerName = lineFarmerName;
        pendingVerticalSlip.farmerName = lineFarmerName;
        if (!codeMatch && !codeDashNameMatch && !seg.preMatchedFarmer) {
          stickyFarmerCode = undefined;
        }
        hasExplicitFarmerHeader = true;
      }
      const parenCodeHeaderMatch = line.match(/\((\d{1,5})\)/);
      if (seg.preMatchedFarmer) {
        stickyFarmerCode = seg.preMatchedFarmer.code;
        pendingVerticalSlip.farmerCode = seg.preMatchedFarmer.code;
        hasExplicitFarmerHeader = true;
      } else if (codeMatch) {
        // Explicit "किसान कोड: 1" ALWAYS wins over "5 – पवन बैरागी" prefix
        stickyFarmerCode = codeMatch[1];
        pendingVerticalSlip.farmerCode = codeMatch[1];
        hasExplicitFarmerHeader = true;
      } else if (codeDashNameMatch) {
        stickyFarmerCode = codeDashNameMatch[1];
        pendingVerticalSlip.farmerCode = codeDashNameMatch[1];
        hasExplicitFarmerHeader = true;
      } else if (parenCodeHeaderMatch) {
        stickyFarmerCode = parenCodeHeaderMatch[1];
        pendingVerticalSlip.farmerCode = parenCodeHeaderMatch[1];
        hasExplicitFarmerHeader = true;
      } else if (richTokens.length === 1 && !isCardFarmerHeaderLine) {
        const onlyTok = richTokens[0];
        // If it's a decimal number on its own line in a vertical card (e.g. "5.3" or "8.3")
        if (onlyTok.hasDecimalPoint) {
          const val = onlyTok.raw;
          if (!pendingVerticalSlip.fat && val >= 2.5 && val <= 11.5) {
            pendingVerticalSlip.fat = round2(val);
          } else if (!pendingVerticalSlip.snf && val >= 7.0 && val <= 10.5) {
            pendingVerticalSlip.snf = round2(val);
          } else if (!pendingVerticalSlip.liters && val >= 0.1 && val <= 200) {
            pendingVerticalSlip.liters = round3(val);
          }
        } else if (
          Number.isInteger(onlyTok.raw) &&
          !onlyTok.hasRupeeSymbol &&
          !onlyTok.hasLiterUnit
        ) {
          if ((lineFarmerName || onlyTok.raw >= 100) && !stickyFarmerCode) {
            stickyFarmerCode = String(onlyTok.raw);
            pendingVerticalSlip.farmerCode = String(onlyTok.raw);
            hasExplicitFarmerHeader = true;
          } else if (
            onlyTok.raw >= 1 &&
            onlyTok.raw <= 31 &&
            !seg.explicitDate &&
            !hasFullDateInSlip &&
            isPassbookDateSequence
          ) {
            stickyDate = String(onlyTok.raw);
            pendingVerticalSlip.date = String(onlyTok.raw);
          }
        }
      }
      continue;
    }

    let rowDate = seg.explicitDate;

    // Support dual-shift passbook table row: [Day (1..31), MornLiters, MornFat, MornSnf, EveLiters, EveFat, EveSnf]
    if (
      numbers.length === 7 &&
      Number.isInteger(numbers[0]) &&
      numbers[0] >= 1 &&
      numbers[0] <= 31 &&
      numbers[5] < 15 &&
      numbers[6] < 15
    ) {
      const mLit = normalizeLiters(numbers[1]);
      const mFat = normalizeFat(numbers[2]);
      const mSnf = normalizeSnf(numbers[3]);
      const eLit = normalizeLiters(numbers[4]);
      const eFat = normalizeFat(numbers[5]);
      const eSnf = normalizeSnf(numbers[6]);
      if (
        mFat >= 2.5 &&
        mFat <= 11.5 &&
        mSnf >= 7.0 &&
        mSnf <= 10.5 &&
        eFat >= 2.5 &&
        eFat <= 11.5 &&
        eSnf >= 7.0 &&
        eSnf <= 10.5
      ) {
        const dayStr = String(numbers[0]);
        stickyDate = dayStr;
        const resolvedName = lineFarmerName || stickyFarmerName;
        const resolvedCode =
          (seg.preMatchedFarmer
            ? seg.preMatchedFarmer.code
            : codeMatch
            ? codeMatch[1]
            : undefined) || stickyFarmerCode;
        results.push({
          farmerCode: resolvedCode,
          farmerName: resolvedName,
          date: dayStr,
          shift: 'morning',
          milkType: effectiveMilkType,
          liters: mLit,
          fat: mFat,
          snf: mSnf,
        });
        results.push({
          farmerCode: resolvedCode,
          farmerName: resolvedName,
          date: dayStr,
          shift: 'evening',
          milkType: effectiveMilkType,
          liters: eLit,
          fat: eFat,
          snf: eSnf,
        });
        pendingVerticalSlip = {};
        continue;
      }
    }

    if (richTokens.length >= 3) {
      let farmerCode: string | undefined = seg.preMatchedFarmer
        ? seg.preMatchedFarmer.code
        : codeMatch
        ? codeMatch[1]
        : codeDashNameMatch
        ? codeDashNameMatch[1]
        : undefined;

      let toks = [...richTokens];
      let verifiedRate: number | undefined;
      let verifiedAmount: number | undefined;

      // Strip leading integer tokens (SerialNo, FarmerCode, or Day 1..31) BEFORE milk metrics when not already sliced by farmer name
      if (!seg.preMatchedFarmer && !codeDashNameMatch) {
        if (
          toks.length >= 5 &&
          !toks[0].hasDecimalPoint &&
          !toks[1].hasDecimalPoint &&
          !toks[0].hasLiterUnit &&
          !toks[1].hasLiterUnit &&
          normalizeFat(toks[2].raw) >= 2.5 &&
          normalizeFat(toks[2].raw) <= 11.5 &&
          normalizeSnf(toks[3].raw) >= 7.0 &&
          normalizeSnf(toks[3].raw) <= 10.5 &&
          toks[2].hasDecimalPoint &&
          toks[3].hasDecimalPoint &&
          !(
            toks.length === 5 &&
            toks[0].raw >= 1 &&
            toks[0].raw <= 31 &&
            toks[3].raw >= 18 &&
            toks[3].raw <= 120 &&
            Math.abs((toks[1].raw / 10) * toks[3].raw - toks[4].raw) <= 2.0
          )
        ) {
          // Wait: only treat [toks[0], toks[1]] as [SerialNo, FarmerCode] if toks.length >= 6 OR toks[4] is not Amount
          if (
            toks.length >= 6 &&
            normalizeFat(toks[3].raw) >= 2.5 &&
            normalizeFat(toks[3].raw) <= 11.5 &&
            normalizeSnf(toks[4].raw) >= 7.0 &&
            normalizeSnf(toks[4].raw) <= 10.5
          ) {
            farmerCode = String(toks[1].raw);
            toks = toks.slice(2);
          }
        }
        if (
          toks.length === richTokens.length &&
          toks.length >= 4 &&
          !toks[0].hasDecimalPoint &&
          !toks[0].hasLiterUnit &&
          !toks[0].hasRupeeSymbol
        ) {
          // Check if 4-token row is actually [IntegerLiters, FAT, SNF, Rate] (e.g. "6 5.3 8.3 45.90")
          const isFourTokenIntLiterWithRate =
            toks.length === 4 &&
            !hasExplicitFarmerHeader &&
            !isPassbookDateSequence &&
            !codeMatch &&
            toks[0].raw >= 1 &&
            toks[0].raw <= 50 &&
            toks[1].hasDecimalPoint &&
            toks[2].hasDecimalPoint &&
            normalizeFat(toks[1].raw) >= 2.5 &&
            normalizeFat(toks[1].raw) <= 11.5 &&
            normalizeSnf(toks[2].raw) >= 7.0 &&
            normalizeSnf(toks[2].raw) <= 10.5 &&
            toks[3].raw >= 20 &&
            toks[3].raw <= 120 &&
            (toks[3].hasDecimalPoint || toks[3].hasRupeeSymbol);

          const restHasFatAndSnf =
            toks
              .slice(1)
              .some(
                (t) =>
                  normalizeFat(t.raw) >= 2.5 &&
                  normalizeFat(t.raw) <= 11.5 &&
                  t.hasDecimalPoint
              ) &&
            toks
              .slice(1)
              .some(
                (t) =>
                  normalizeSnf(t.raw) >= 7.0 &&
                  normalizeSnf(t.raw) <= 10.5 &&
                  t.hasDecimalPoint
              );

          if (!isFourTokenIntLiterWithRate && (restHasFatAndSnf || toks.length >= 5)) {
            if (
              !rowDate &&
              toks[0].raw >= 1 &&
              toks[0].raw <= 31 &&
              !codeMatch &&
              (hasExplicitFarmerHeader || isPassbookDateSequence || lineFarmerName)
            ) {
              rowDate = String(toks[0].raw);
              stickyDate = rowDate;
              toks = toks.slice(1);
            } else {
              if (!farmerCode) farmerCode = String(toks[0].raw);
              toks = toks.slice(1);
            }
          }
        }
      }

      // Mathematical Check across remaining tokens:
      // Does the last token equal `Amount` where `Liters * Rate ≈ Amount` for ANY pair of earlier tokens (regardless of whether Rate is before Qty or Qty is before Rate)?
      if (toks.length >= 4) {
        const lastIdx = toks.length - 1;
        const lastTok = toks[lastIdx];
        if (lastTok.raw >= 5 && !lastTok.hasLiterUnit) {
          let matchedRateIdx = -1;
          let repairedQtyIdx = -1;
          let repairedQtyVal = 0;

          for (let rCand = 0; rCand < lastIdx; rCand++) {
            const rVal = toks[rCand].raw;
            if (rVal < 18 || rVal > 120 || toks[rCand].hasLiterUnit) continue;
            for (let qCand = 0; qCand < lastIdx; qCand++) {
              if (qCand === rCand) continue;
              if (toks[qCand].hasRupeeSymbol) continue;
              const rawQ = normalizeLiters(toks[qCand].raw);
              const tenthQ =
                !toks[qCand].hasDecimalPoint && toks[qCand].raw >= 10 && toks[qCand].raw <= 250
                  ? round3(toks[qCand].raw / 10)
                  : rawQ;

              const candidateQs = tenthQ !== rawQ ? [rawQ, tenthQ] : [rawQ];
              for (const qVal of candidateQs) {
                const prod = qVal * rVal;
                const isCloseMatch =
                  Math.abs(prod - lastTok.raw) <= 1.6 ||
                  Math.floor(prod) === Math.floor(lastTok.raw) ||
                  Math.round(prod) === Math.round(lastTok.raw);
                if (!isCloseMatch) continue;

                // Ensure the other remaining tokens contain valid 1-decimal FAT and SNF
                const rem = toks.filter((_, k) => k !== lastIdx && k !== rCand && k !== qCand);
                if (
                  rem.length >= 2 &&
                  rem.some(
                    (t) =>
                      normalizeFat(t.raw) >= 2.5 &&
                      normalizeFat(t.raw) <= 11.5 &&
                      (t.hasDecimalPoint || (t.raw >= 25 && t.raw <= 115))
                  ) &&
                  rem.some(
                    (t) =>
                      normalizeSnf(t.raw) >= 7.0 &&
                      normalizeSnf(t.raw) <= 10.5 &&
                      (t.hasDecimalPoint || (t.raw >= 70 && t.raw <= 105))
                  )
                ) {
                  matchedRateIdx = rCand;
                  if (qVal !== rawQ) {
                    repairedQtyIdx = qCand;
                    repairedQtyVal = qVal;
                  }
                  break;
                }
              }
              if (matchedRateIdx !== -1) break;
            }
            if (matchedRateIdx !== -1) break;
          }

          if (matchedRateIdx !== -1) {
            if (repairedQtyIdx !== -1) {
              toks[repairedQtyIdx] = {
                ...toks[repairedQtyIdx],
                raw: repairedQtyVal,
                rawStr: String(repairedQtyVal),
                hasDecimalPoint: true,
              };
            }
            verifiedRate = round2(toks[matchedRateIdx].raw);
            verifiedAmount = round2(lastTok.raw);
            toks = toks.filter((_, k) => k !== lastIdx && k !== matchedRateIdx);
          }
        }
      }

      // Check 3-number shorthand: [Day/Code, Liters, FAT] without SNF
      if (toks.length === 3 && !toks[0].hasDecimalPoint && !toks[0].hasLiterUnit) {
        const c1 = normalizeFat(toks[1].raw);
        const c2 = normalizeFat(toks[2].raw);
        const hasSnf =
          (toks[1].raw >= 7.5 && toks[1].raw <= 10.2 && toks[1].hasDecimalPoint) ||
          (toks[2].raw >= 7.5 && toks[2].raw <= 10.2 && toks[2].hasDecimalPoint);

        if (
          !rowDate &&
          toks[0].raw >= 1 &&
          toks[0].raw <= 31 &&
          !codeMatch &&
          (hasExplicitFarmerHeader || isPassbookDateSequence || Boolean(lineShift)) &&
          !hasSnf &&
          ((c1 >= 2.5 && c1 <= 11.5) || (c2 >= 2.5 && c2 <= 11.5))
        ) {
          rowDate = String(toks[0].raw);
          stickyDate = rowDate;
          const isSecondFat = c2 >= 2.5 && c2 <= 11.5;
          const fat = isSecondFat ? c2 : c1;
          let liters = isSecondFat ? normalizeLiters(toks[1].raw) : normalizeLiters(toks[2].raw);
          if (verifiedRate && verifiedAmount) {
            const expL = round3(verifiedAmount / verifiedRate);
            if (
              Math.abs(liters * verifiedRate - verifiedAmount) > 3 &&
              Math.abs(expL * verifiedRate - verifiedAmount) <= 2.5
            ) {
              liters = expL;
            }
          }
          if (fat > 0 && liters > 0) {
            const resolvedName = lineFarmerName || stickyFarmerName;
            const resolvedCode = farmerCode || stickyFarmerCode;
            results.push({
              farmerCode: resolvedCode,
              farmerName: resolvedName,
              date: rowDate || stickyDate || defaultDate,
              shift: effectiveShift,
              milkType: effectiveMilkType,
              liters,
              fat,
              snf: 8.5,
              rate: verifiedRate,
              amount: verifiedAmount,
            });
            pendingVerticalSlip = {};
            continue;
          }
        } else if (
          toks[0].raw >= 100 &&
          toks[0].raw <= 999 &&
          !hasSnf &&
          ((c1 >= 2.5 && c1 <= 11.5) || (c2 >= 2.5 && c2 <= 11.5))
        ) {
          farmerCode = String(toks[0].raw);
          const isSecondFat = c2 >= 2.5 && c2 <= 11.5;
          const fat = isSecondFat ? c2 : c1;
          const liters = isSecondFat ? normalizeLiters(toks[1].raw) : normalizeLiters(toks[2].raw);
          if (fat > 0 && liters > 0) {
            if (lineFarmerName) stickyFarmerName = lineFarmerName;
            stickyFarmerCode = farmerCode;
            results.push({
              farmerCode,
              farmerName: lineFarmerName || (hasExplicitFarmerHeader ? stickyFarmerName : undefined),
              date: rowDate || stickyDate || defaultDate,
              shift: effectiveShift,
              milkType: effectiveMilkType,
              liters,
              fat,
              snf: 8.5,
              rate: verifiedRate,
              amount: verifiedAmount,
            });
            pendingVerticalSlip = {};
            continue;
          }
        }
      }

      // Strict 1-decimal check: must have an actual decimal point in rawStr (e.g. "5.3", "8.3", "9.0")
      // or be a 2-digit analyzer integer (e.g. 45 -> 4.5, 85 -> 8.5), NEVER a plain 1-digit integer like 5, 7, 8!
      const hasAnyDecimalToken = toks.some((t) => t.hasDecimalPoint);
      const isOneDecimalToken = (c: {
        raw: number;
        hasDecimalPoint: boolean;
        hasLiterUnit: boolean;
        hasRupeeSymbol: boolean;
      }) => {
        if (c.hasLiterUnit || c.hasRupeeSymbol) return false;
        if (c.hasDecimalPoint) {
          return Math.abs(c.raw * 10 - Math.round(c.raw * 10)) < 0.001;
        }
        if (hasAnyDecimalToken) return false;
        return c.raw >= 25 && c.raw <= 115 && Number.isInteger(c.raw);
      };

      const converted = toks.map((t) => ({
        ...t,
        asFat:
          t.hasRupeeSymbol || (hasAnyDecimalToken && !t.hasDecimalPoint)
            ? t.raw
            : normalizeFat(t.raw),
        asSnf:
          t.hasRupeeSymbol || (hasAnyDecimalToken && !t.hasDecimalPoint)
            ? t.raw
            : normalizeSnf(t.raw),
        asLiters: normalizeLiters(t.raw),
      }));

      let fatIdx = -1;
      let snfIdx = -1;

      const isValidFat = (v: number) => v >= 2.5 && v <= 11.5;
      const isValidSnf = (v: number) => v >= 7.0 && v <= 10.5;

      // Pattern A: [Qty, FAT, SNF, ...] where index 1 is FAT and index 2 is SNF
      if (
        converted.length >= 3 &&
        !converted[1].hasLiterUnit &&
        !converted[2].hasLiterUnit &&
        isValidFat(converted[1].asFat) &&
        isValidSnf(converted[2].asSnf) &&
        isOneDecimalToken(converted[1]) &&
        isOneDecimalToken(converted[2]) &&
        converted[1].asFat <= converted[2].asSnf &&
        !(
          !converted[0].hasLiterUnit &&
          isOneDecimalToken(converted[0]) &&
          converted[0].asFat >= 2.5 &&
          converted[0].asFat <= converted[1].asSnf &&
          isValidSnf(converted[1].asSnf) &&
          (converted[2].raw > 10.5 || !isOneDecimalToken(converted[2]))
        )
      ) {
        fatIdx = 1;
        snfIdx = 2;
      } else if (
        // Pattern B: [FAT, SNF, ...] (e.g. "FAT | SNF | Rate | Qty" or "FAT | SNF | Qty")
        converted.length >= 3 &&
        !converted[0].hasLiterUnit &&
        !converted[1].hasLiterUnit &&
        isValidFat(converted[0].asFat) &&
        isValidSnf(converted[1].asSnf) &&
        isOneDecimalToken(converted[0]) &&
        isOneDecimalToken(converted[1]) &&
        converted[0].asFat <= converted[1].asSnf
      ) {
        fatIdx = 0;
        snfIdx = 1;
      } else {
        snfIdx = converted.findIndex(
          (c) => !c.hasLiterUnit && !c.hasRupeeSymbol && isValidSnf(c.asSnf) && isOneDecimalToken(c)
        );
        if (snfIdx === -1) {
          snfIdx = converted.findIndex(
            (c) => !c.hasLiterUnit && !c.hasRupeeSymbol && isValidSnf(c.asSnf)
          );
        }

        if (
          snfIdx > 0 &&
          !converted[snfIdx - 1].hasLiterUnit &&
          !converted[snfIdx - 1].hasRupeeSymbol &&
          isValidFat(converted[snfIdx - 1].asFat) &&
          isOneDecimalToken(converted[snfIdx - 1])
        ) {
          fatIdx = snfIdx - 1;
        }
        if (fatIdx === -1) {
          fatIdx = converted.findIndex(
            (c, idx) =>
              idx !== snfIdx &&
              !c.hasLiterUnit &&
              !c.hasRupeeSymbol &&
              isValidFat(c.asFat) &&
              isOneDecimalToken(c)
          );
        }
        if (fatIdx === -1) {
          fatIdx = converted.findIndex(
            (c, idx) =>
              idx !== snfIdx && !c.hasLiterUnit && !c.hasRupeeSymbol && isValidFat(c.asFat)
          );
        }
      }

      if (snfIdx !== -1 && fatIdx !== -1) {
        const fat = converted[fatIdx].asFat;
        const snf = converted[snfIdx].asSnf;
        const otherIndices = converted
          .map((_, idx) => idx)
          .filter((idx) => idx !== fatIdx && idx !== snfIdx);

        if (otherIndices.length >= 1) {
          let litIdx = otherIndices[0];
          let rateIdx = otherIndices.length >= 2 ? otherIndices[1] : -1;

          // Smartly distinguish Qty (Liters) vs Rate when there are 2 remaining numbers (e.g. "FAT | SNF | Rate | Qty" vs "Qty | FAT | SNF | Rate")
          if (otherIndices.length >= 2) {
            const idxA = otherIndices[0];
            const idxB = otherIndices[1];
            const tokA = converted[idxA];
            const tokB = converted[idxB];

            if (tokA.hasLiterUnit || tokB.hasRupeeSymbol) {
              litIdx = idxA;
              rateIdx = idxB;
            } else if (tokB.hasLiterUnit || tokA.hasRupeeSymbol) {
              litIdx = idxB;
              rateIdx = idxA;
            } else if (verifiedRate !== undefined) {
              litIdx = idxA;
              rateIdx = -1;
            } else if (tokA.raw >= 20 && tokA.raw <= 115 && tokB.raw < 20) {
              // e.g. [5.3, 8.3, 45.90, 1.96] -> 45.90 is Rate, 1.96 is Qty (Liters)!
              rateIdx = idxA;
              litIdx = idxB;
            } else if (tokB.raw >= 20 && tokB.raw <= 115 && tokA.raw < 20) {
              // e.g. [1.96, 5.3, 8.3, 45.90] or [5.3, 8.3, 1.96, 45.90] -> 1.96 is Qty, 45.90 is Rate!
              litIdx = idxA;
              rateIdx = idxB;
            } else if (tokA.raw >= 20 && tokB.raw >= 20) {
              const expRate = fat >= 5.0 ? fat * 7.5 : fat * 6.8;
              if (Math.abs(tokA.raw - expRate) < Math.abs(tokB.raw - expRate)) {
                rateIdx = idxA;
                litIdx = idxB;
              } else {
                litIdx = idxA;
                rateIdx = idxB;
              }
            }
          }

          let liters = converted[litIdx].asLiters;
          const rate =
            verifiedRate ||
            (rateIdx !== -1 &&
            converted[rateIdx].raw >= 15 &&
            converted[rateIdx].raw <= 120
              ? round2(converted[rateIdx].raw)
              : undefined);

          if (rate && verifiedAmount && Math.abs(liters * rate - verifiedAmount) > 3) {
            const expL = round3(verifiedAmount / rate);
            if (expL >= 0.2 && expL <= 200 && Math.abs(expL * rate - verifiedAmount) <= 2.5) {
              liters = expL;
            }
          }

          if (isValidFat(fat) && isValidSnf(snf) && liters > 0 && liters <= 250) {
            // Do NOT carry over stickyFarmerName to a row that has its own distinct farmerCode (e.g. "102 7.25 5.2 8.8")
            // and do NOT carry over stickyFarmerCode to a row that has its own distinct lineFarmerName (e.g. "श्यामलाल 5.0 4.2 8.4")
            const resolvedName =
              lineFarmerName ||
              (!farmerCode || farmerCode === stickyFarmerCode ? stickyFarmerName : undefined);
            const resolvedCode =
              farmerCode ||
              (!lineFarmerName || lineFarmerName === stickyFarmerName
                ? stickyFarmerCode
                : undefined);

            if (lineFarmerName) {
              stickyFarmerName = lineFarmerName;
              if (!farmerCode) stickyFarmerCode = undefined;
            }
            if (farmerCode) {
              stickyFarmerCode = farmerCode;
              if (!lineFarmerName) stickyFarmerName = undefined;
            }

            const isUnnamedContinuationLine =
              !seg.preMatchedFarmer &&
              !lineFarmerName &&
              !farmerCode &&
              !codeMatch &&
              !codeDashNameMatch &&
              !rowDate &&
              !lineShift &&
              !lineMilkType &&
              !isPassbookDateSequence;
            const targetDate = rowDate || stickyDate || defaultDate;
            const alreadyHasEntryForSameFarmerShift =
              isUnnamedContinuationLine &&
              Boolean(resolvedCode || resolvedName) &&
              results.some(
                (prev) =>
                  ((resolvedCode && prev.farmerCode === resolvedCode) ||
                    (resolvedName && prev.farmerName === resolvedName)) &&
                  prev.date === targetDate &&
                  prev.shift === effectiveShift
              );

            if (!alreadyHasEntryForSameFarmerShift) {
              results.push({
                farmerCode: resolvedCode,
                farmerName: resolvedName,
                date: targetDate,
                shift: effectiveShift,
                milkType: effectiveMilkType,
                liters,
                fat,
                snf,
                rate,
                amount: verifiedAmount,
              });
            }
            pendingVerticalSlip = {};
          }
        }
      }
    } else if (richTokens.length === 2) {
      // Check if this 2-number line is actually [Rate, Amount] (e.g. "₹45.90 ₹89" or "45.90 89") wrapped from a card/row
      const looksLikeRateAndAmount =
        richTokens[0].hasRupeeSymbol ||
        richTokens[1].hasRupeeSymbol ||
        (!richTokens[0].hasLiterUnit &&
          !richTokens[1].hasLiterUnit &&
          numbers[0] >= 15 &&
          numbers[0] <= 120 &&
          numbers[1] >= 15);
      if (looksLikeRateAndAmount) {
        if (pendingVerticalSlip.liters && pendingVerticalSlip.fat) {
          pendingVerticalSlip.rate = round2(numbers[0]);
          pendingVerticalSlip.amount = round2(numbers[1]);
          flushPendingVerticalSlipIfReady();
        } else if (results.length > 0 && !results[results.length - 1].rate) {
          results[results.length - 1].rate = round2(numbers[0]);
          results[results.length - 1].amount = round2(numbers[1]);
        }
        continue;
      }

      // Check if this 2-number line is [FAT, SNF] when pendingVerticalSlip is accumulating
      if (
        !richTokens[0].hasLiterUnit &&
        !richTokens[1].hasLiterUnit &&
        richTokens[0].hasDecimalPoint &&
        richTokens[1].hasDecimalPoint &&
        numbers[0] >= 2.5 &&
        numbers[0] <= 11.5 &&
        numbers[1] >= 7.0 &&
        numbers[1] <= 10.5 &&
        (pendingVerticalSlip.farmerName || pendingVerticalSlip.farmerCode) &&
        !pendingVerticalSlip.fat &&
        !pendingVerticalSlip.snf
      ) {
        pendingVerticalSlip.fat = round2(numbers[0]);
        pendingVerticalSlip.snf = round2(numbers[1]);
        continue;
      }

      // 2 numbers on a line: e.g. "5.5 4.5" or "रामलाल 5.5 4.5" (Liters + FAT, default SNF 8.5)
      const hasDec = richTokens[0].hasDecimalPoint || richTokens[1].hasDecimalPoint;
      const n0Fat = hasDec && !richTokens[0].hasDecimalPoint ? numbers[0] : normalizeFat(numbers[0]);
      const n1Fat = hasDec && !richTokens[1].hasDecimalPoint ? numbers[1] : normalizeFat(numbers[1]);
      let fat = 4.5;
      let liters = 1;
      if (richTokens[0].hasLiterUnit && n1Fat >= 2.5 && n1Fat <= 11.5) {
        liters = normalizeLiters(numbers[0]);
        fat = n1Fat;
      } else if (richTokens[1].hasLiterUnit && n0Fat >= 2.5 && n0Fat <= 11.5) {
        fat = n0Fat;
        liters = normalizeLiters(numbers[1]);
      } else if (n1Fat >= 2.5 && n1Fat <= 11.5) {
        fat = n1Fat;
        liters = normalizeLiters(numbers[0]);
      } else if (n0Fat >= 2.5 && n0Fat <= 11.5) {
        fat = n0Fat;
        liters = normalizeLiters(numbers[1]);
      } else {
        liters = normalizeLiters(numbers[0]);
        fat = n1Fat;
      }
      if (fat >= 2.5 && fat <= 11.5 && liters > 0 && liters <= 250) {
        const rowCode = seg.preMatchedFarmer
          ? seg.preMatchedFarmer.code
          : codeMatch
          ? codeMatch[1]
          : codeDashNameMatch
          ? codeDashNameMatch[1]
          : undefined;
        const resolvedName = lineFarmerName || stickyFarmerName;
        const resolvedCode = rowCode || stickyFarmerCode;
        if (lineFarmerName) stickyFarmerName = lineFarmerName;
        if (rowCode) stickyFarmerCode = rowCode;

        const isUnnamedContinuation2 =
          !seg.preMatchedFarmer &&
          !lineFarmerName &&
          !rowCode &&
          !rowDate &&
          !lineShift &&
          !lineMilkType &&
          !isPassbookDateSequence;
        const targetDate = rowDate || stickyDate || defaultDate;
        const alreadyExistsForFarmerShift =
          isUnnamedContinuation2 &&
          Boolean(resolvedCode || resolvedName) &&
          results.some(
            (prev) =>
              ((resolvedCode && prev.farmerCode === resolvedCode) ||
                (resolvedName && prev.farmerName === resolvedName)) &&
              prev.date === targetDate &&
              prev.shift === effectiveShift
          );

        if (!alreadyExistsForFarmerShift) {
          results.push({
            farmerCode: resolvedCode,
            farmerName: resolvedName,
            date: targetDate,
            shift: effectiveShift,
            milkType: effectiveMilkType,
            liters,
            fat,
            snf: 8.5,
          });
        }
        pendingVerticalSlip = {};
      }
    }
  }

  flushPendingVerticalSlipIfReady();

  // Whole-Slip Smart Number Extractor Fallback ONLY when a single short slip (<= 8 lines) had separated numbers
  if (results.length === 0 && expandedSegments.length >= 2 && expandedSegments.length <= 8) {
    const allNums: number[] = [];
    for (const seg of expandedSegments) {
      const toks = seg.text.split(/[\s,|/:-]+/).filter(Boolean);
      for (const tok of toks) {
        const cleanedTok = tok.replace(/[L₹lkgKGलीटर()[\]]/g, '');
        const cleanedNum = cleanedTok.replace(/[^0-9.]/g, '');
        const numVal = Number(cleanedNum);
        if (
          cleanedNum !== '' &&
          Number.isFinite(numVal) &&
          numVal > 0 &&
          /^[0-9]+(?:\.[0-9]+)?$/.test(cleanedTok)
        ) {
          allNums.push(numVal);
        }
      }
    }
    if (allNums.length >= 2 && allNums.length <= 7) {
      const singleLineFallback = parseMilkSlipTextToRows(
        allNums.join(' '),
        stickyDate || defaultDate,
        stickyShift || defaultShift,
        registeredFarmers
      );
      for (const r of singleLineFallback) {
        results.push({
          ...r,
          farmerCode: r.farmerCode || pendingVerticalSlip.farmerCode || stickyFarmerCode,
          farmerName: r.farmerName || pendingVerticalSlip.farmerName || stickyFarmerName,
          date: pendingVerticalSlip.date || stickyDate || r.date || defaultDate,
          shift: pendingVerticalSlip.shift || stickyShift || r.shift || defaultShift,
          milkType: pendingVerticalSlip.milkType || r.milkType,
        });
      }
    }
  }

  // Deduplicate intra-slip OCR duplicates for the same farmer + date + shift + animalType
  // (while preserving multi-row undated passbooks for a single farmer)
  const distinctFarmersInResults = new Set(
    results.map((r) => (r.farmerCode || r.farmerName || "").trim()).filter(Boolean)
  );
  const distinctDatesInResults = new Set(results.map((r) => r.date || "").filter(Boolean));
  const isUndatedSingleFarmerBatch =
    results.length >= 5 && distinctFarmersInResults.size <= 1 && distinctDatesInResults.size <= 1;

  if (!isUndatedSingleFarmerBatch && results.length > 1) {
    const deduped: ScannedSlipRawRow[] = [];
    const seenKeyToIndex = new Map<string, number>();
    for (const r of results) {
      const fKey = (r.farmerCode || r.farmerName || "").trim().toLowerCase();
      if (!fKey) {
        deduped.push(r);
        continue;
      }
      const dKey = normalizeScannedDate(r.date, defaultDate || "2026-10-25");
      const sKey = normalizeScannedShift(r.shift ? String(r.shift) : undefined, defaultShift || "morning");
      const mKey =
        r.milkType === "cow" || r.milkType === "गाय"
          ? "cow"
          : r.milkType === "buffalo" || r.milkType === "भैंस"
          ? "buffalo"
          : classifyMilkType(Number(r.fat) || 4.5);
      const compositeKey = `${fKey}|${dKey}|${sKey}|${mKey}`;
      const existingIdx = seenKeyToIndex.get(compositeKey);
      if (existingIdx === undefined) {
        seenKeyToIndex.set(compositeKey, deduped.length);
        deduped.push(r);
      } else {
        // Merge rate/amount if the later duplicate had rate/amount and earlier did not
        const prev = deduped[existingIdx];
        if (!prev.rate && r.rate) prev.rate = r.rate;
        if (!prev.amount && r.amount) prev.amount = r.amount;
      }
    }
    return deduped;
  }

  return results;
}

/**
 * Parses PDF `/ToUnicode` CMap blocks (`beginbfchar ... endbfchar` and `beginbfrange ... endbfrange`)
 * into a glyph-code -> Unicode string map so CID-encoded PDFs (Chrome/Android Print-to-PDF, Devanagari Hindi PDFs)
 * decode accurately into Unicode text.
 */
function parsePdfToUnicodeCMap(streamText: string, cMap: Map<number, string>): void {
  if (!streamText.includes('beginbfchar') && !streamText.includes('beginbfrange')) return;

  const decodeHexToUnicodeStr = (hex: string): string => {
    const clean = hex.replace(/[^0-9A-Fa-f]/g, '');
    if (!clean) return '';
    if (clean.length % 4 === 0) {
      let s = '';
      for (let i = 0; i + 3 < clean.length; i += 4) {
        const cp = parseInt(clean.slice(i, i + 4), 16);
        if (cp > 0 && cp !== 0xfeff) s += String.fromCharCode(cp);
      }
      return s;
    }
    const cp = parseInt(clean, 16);
    return cp > 0 ? String.fromCharCode(cp) : '';
  };

  // 1. beginbfchar ... endbfchar
  const bfCharRegex = /beginbfchar([\s\S]*?)endbfchar/g;
  let m: RegExpExecArray | null;
  while ((m = bfCharRegex.exec(streamText)) !== null) {
    const body = m[1];
    const pairRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let pm: RegExpExecArray | null;
    while ((pm = pairRegex.exec(body)) !== null) {
      const srcCode = parseInt(pm[1], 16);
      const dstStr = decodeHexToUnicodeStr(pm[2]);
      if (Number.isFinite(srcCode) && dstStr) {
        cMap.set(srcCode, dstStr);
      }
    }
  }

  // 2. beginbfrange ... endbfrange
  const bfRangeRegex = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = bfRangeRegex.exec(streamText)) !== null) {
    const body = m[1];
    // Form A: <start> <end> <dstStart>
    const rangeRegex = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]+)\])/g;
    let rm: RegExpExecArray | null;
    while ((rm = rangeRegex.exec(body)) !== null) {
      const startCode = parseInt(rm[1], 16);
      const endCode = parseInt(rm[2], 16);
      if (!Number.isFinite(startCode) || !Number.isFinite(endCode) || endCode < startCode || endCode - startCode > 1024) {
        continue;
      }
      if (rm[3] !== undefined) {
        const baseClean = rm[3].replace(/[^0-9A-Fa-f]/g, '');
        if (baseClean.length <= 4) {
          const dstStart = parseInt(baseClean, 16);
          for (let code = startCode; code <= endCode; code++) {
            const chCode = dstStart + (code - startCode);
            if (chCode > 0) cMap.set(code, String.fromCharCode(chCode));
          }
        }
      } else if (rm[4] !== undefined) {
        const arrItems = rm[4].match(/<([0-9A-Fa-f]+)>/g) || [];
        for (let idx = 0; idx < arrItems.length && startCode + idx <= endCode; idx++) {
          const itemHex = arrItems[idx].replace(/[<>]/g, '');
          const dstStr = decodeHexToUnicodeStr(itemHex);
          if (dstStr) cMap.set(startCode + idx, dstStr);
        }
      }
    }
  }
}

/**
 * Extracts readable Hindi/English text and numbers from a PDF content stream or raw PDF string.
 * Supports parenthesized PDF strings `(...)`, TJ arrays `[(...) ...]`, ToUnicode CMap glyph decoding,
 * and UTF-16BE / printable ASCII hex strings `<...>`.
 */
export function extractTextFromPdfContent(
  pdfStreamText: string,
  cMap?: Map<number, string>
): string {
  if (!pdfStreamText) return '';

  // Automatically extract any ToUnicode CMap definitions present in pdfStreamText
  const effectiveCMap = cMap ? new Map(cMap) : new Map<number, string>();
  if (pdfStreamText.includes('beginbfchar') || pdfStreamText.includes('beginbfrange')) {
    parsePdfToUnicodeCMap(pdfStreamText, effectiveCMap);
  }

  // Strip CMap definitions and XMP metadata blocks so their hex mappings are never read as page text
  const cleanedStreamText = pdfStreamText
    .replace(/begincmap[\s\S]*?endcmap/g, ' ')
    .replace(/beginbfchar[\s\S]*?endbfchar/g, ' ')
    .replace(/beginbfrange[\s\S]*?endbfrange/g, ' ')
    .replace(/<\?xpacket[\s\S]*?\?>/g, ' ');

  if (!cleanedStreamText.trim() || (!cleanedStreamText.includes('BT') && pdfStreamText.includes('/CIDInit'))) {
    return '';
  }

  const extractedLines: string[] = [];

  // Decode PDF parenthesized string escapes (\n, \r, \t, \ddd octal, \(, \))
  const decodePdfParenString = (raw: string): string => {
    const unescaped = raw
      .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, ' ')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');

    // Check UTF-16BE BOM (\xFE\xFF)
    if (unescaped.length >= 4 && unescaped.charCodeAt(0) === 0xfe && unescaped.charCodeAt(1) === 0xff) {
      let out = '';
      for (let i = 2; i + 1 < unescaped.length; i += 2) {
        const code = (unescaped.charCodeAt(i) << 8) | unescaped.charCodeAt(i + 1);
        if (code > 0) out += String.fromCharCode(code);
      }
      return out;
    }

    // If effectiveCMap is available and string contains 2-byte big-endian glyph indices (with \x00 high bytes)
    if (effectiveCMap.size > 0 && unescaped.includes('\x00') && unescaped.length % 2 === 0) {
      let mappedOut = '';
      let mappedCount = 0;
      for (let i = 0; i + 1 < unescaped.length; i += 2) {
        const gid = (unescaped.charCodeAt(i) << 8) | unescaped.charCodeAt(i + 1);
        const mapped = effectiveCMap.get(gid);
        if (mapped) {
          mappedOut += mapped;
          mappedCount++;
        }
      }
      if (mappedCount > 0) return mappedOut;
    }

    // Strip non-printable binary control chars
    return unescaped.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  };

  const decodePdfHexString = (hexRaw: string): string => {
    const cleanHex = hexRaw.replace(/[^0-9A-Fa-f]/g, '');
    if (cleanHex.length === 0) return '';

    // 1. Explicit UTF-16BE BOM (FEFF...)
    if (cleanHex.length % 4 === 0 && /^FEFF/i.test(cleanHex)) {
      let out = '';
      for (let i = 4; i + 3 < cleanHex.length; i += 4) {
        const code = parseInt(cleanHex.slice(i, i + 4), 16);
        if (code > 0 && code !== 0xfeff) out += String.fromCharCode(code);
      }
      return out;
    }

    // 2. If ToUnicode CMap is available, decode 2-byte (4 hex char) or 1-byte (2 hex char) glyph IDs via effectiveCMap
    if (effectiveCMap.size > 0) {
      if (cleanHex.length % 4 === 0) {
        let out = '';
        let hit = 0;
        for (let i = 0; i + 3 < cleanHex.length; i += 4) {
          const gid = parseInt(cleanHex.slice(i, i + 4), 16);
          const mapped = effectiveCMap.get(gid);
          if (mapped !== undefined) {
            out += mapped;
            hit++;
          }
        }
        if (hit > 0) return out;
      }
      if (cleanHex.length % 2 === 0) {
        let out = '';
        let hit = 0;
        for (let i = 0; i + 1 < cleanHex.length; i += 2) {
          const gid = parseInt(cleanHex.slice(i, i + 2), 16);
          const mapped = effectiveCMap.get(gid);
          if (mapped !== undefined) {
            out += mapped;
            hit++;
          }
        }
        if (hit > 0) return out;
      }
    }

    // 3. Direct UTF-16BE Devanagari/ASCII (where every 4-hex code is either 0020..007E, 0900..097F, or 20B9 ₹)
    if (cleanHex.length % 4 === 0) {
      let out = '';
      let allValidUtf16 = true;
      let hasDevanagariOrBom = false;
      for (let i = 0; i + 3 < cleanHex.length; i += 4) {
        const code = parseInt(cleanHex.slice(i, i + 4), 16);
        if (
          (code >= 0x0020 && code <= 0x007e) ||
          (code >= 0x0900 && code <= 0x097f) ||
          code === 0x20b9 ||
          code === 0x2013 ||
          code === 0x2014
        ) {
          if (code >= 0x0900) hasDevanagariOrBom = true;
          out += String.fromCharCode(code);
        } else {
          allValidUtf16 = false;
          break;
        }
      }
      // Only accept unmapped 00xx 4-hex strings if there is actual Devanagari OR if there is no CMap
      // (prevents unmapped CID glyph IDs 0020..007E from being misread as random ASCII characters!)
      if (allValidUtf16 && (hasDevanagariOrBom || effectiveCMap.size === 0)) {
        return out;
      }
    }

    // 4. 1-byte printable ASCII hex (ONLY if there are NO '00' null bytes, which indicate 16-bit glyph IDs!)
    if (cleanHex.length % 2 === 0 && !/(?:^|(?:[0-9A-Fa-f]{2})+?)00/.test(cleanHex)) {
      let out = '';
      let allPrintable = true;
      for (let i = 0; i + 1 < cleanHex.length; i += 2) {
        const code = parseInt(cleanHex.slice(i, i + 2), 16);
        if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9) {
          out += String.fromCharCode(code);
        } else {
          allPrintable = false;
          break;
        }
      }
      if (allPrintable) return out;
    }

    return '';
  };

  // Extract from BT ... ET text blocks if present
  const btBlocks = cleanedStreamText.match(/BT[\s\S]*?ET/g);
  const targetChunks = btBlocks && btBlocks.length > 0 ? btBlocks : [cleanedStreamText];

  for (const chunk of targetChunks) {
    let currentLineTokens: string[] = [];
    const tokenRegex = /\(((?:\\.|[^\\()])*)\)|<([0-9A-Fa-f\s]{2,})>|((?:^|\s)(?:Td|TD|Tm|T\*|ET|')(?=\s|$|\(|<|\[))/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(chunk)) !== null) {
      if (match[1] !== undefined) {
        const s = decodePdfParenString(match[1]).trim();
        if (s) currentLineTokens.push(s);
      } else if (match[2] !== undefined) {
        const s = decodePdfHexString(match[2]).trim();
        if (s) currentLineTokens.push(s);
      } else if (match[3] !== undefined) {
        if (currentLineTokens.length > 0) {
          extractedLines.push(currentLineTokens.join(' '));
          currentLineTokens = [];
        }
      }
    }
    if (currentLineTokens.length > 0) {
      extractedLines.push(currentLineTokens.join(' '));
    }
  }

  return extractedLines.join('\n').trim();
}

/**
 * Extracts text from a PDF file buffer (Uint8Array / ArrayBuffer), automatically decompressing
 * FlateDecode streams via DecompressionStream and decoding ToUnicode CMap tables (works 100% offline in Android APK & Web!).
 */
export async function extractTextFromPdfBuffer(
  buffer: ArrayBuffer | Uint8Array
): Promise<string> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const latin1Decoder = new TextDecoder('latin1');
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
  const rawLatin1 = latin1Decoder.decode(bytes);

  const allStreams: string[] = [rawLatin1];

  // 1. Decompress all FlateDecode streams first so we can collect all ToUnicode CMaps before decoding page text
  if (typeof DecompressionStream !== 'undefined') {
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m: RegExpExecArray | null;
    while ((m = streamRegex.exec(rawLatin1)) !== null) {
      const bodyStr = m[1];
      if (!bodyStr || bodyStr.length < 4 || bodyStr.length > 2_000_000) continue;
      const streamBytes = new Uint8Array(bodyStr.length);
      for (let i = 0; i < bodyStr.length; i++) {
        streamBytes[i] = bodyStr.charCodeAt(i) & 0xff;
      }

      for (const fmt of ['deflate', 'deflate-raw'] as const) {
        try {
          const ds = new DecompressionStream(fmt);
          const writer = ds.writable.getWriter();
          writer.write(streamBytes).catch(() => {});
          writer.close().catch(() => {});
          const decompressedBuf = await new Response(ds.readable).arrayBuffer();
          const decompressedStr = utf8Decoder.decode(decompressedBuf);
          if (decompressedStr && decompressedStr.trim()) {
            allStreams.push(decompressedStr);
            break;
          }
        } catch {
          // Not a valid deflate stream or unsupported format
        }
      }
    }
  }

  // 2. Build combined ToUnicode CMap from any CMap streams in the PDF
  const cMap = new Map<number, string>();
  for (const s of allStreams) {
    parsePdfToUnicodeCMap(s, cMap);
  }

  // 3. Extract readable page text from all page content streams using the CMap
  const chunks: string[] = [];
  // If we decompressed inner streams, extract from inner streams first; also check uncompressed BT..ET in rawLatin1
  const streamsToExtract = allStreams.length > 1 ? allStreams.slice(1) : allStreams;
  for (const s of streamsToExtract) {
    const parsedStreamText = extractTextFromPdfContent(s, cMap);
    if (parsedStreamText) {
      chunks.push(parsedStreamText);
    }
  }
  if (chunks.length === 0) {
    const directText = extractTextFromPdfContent(rawLatin1, cMap);
    if (directText) chunks.push(directText);
  }

  return chunks.join('\n').trim();
}

export interface ShiftMilkEntryValidationResult {
  allowed: boolean;
  reasonHi?: string;
  reasonEn?: string;
  existingConflict?: MilkCollectionEntry;
  existingCowEntry?: MilkCollectionEntry;
  existingBuffaloEntry?: MilkCollectionEntry;
}

/**
 * Enforces the rule:
 * "किसी भी किसान की एक शिफ्ट में केवल दो दूध एंट्री ही हो एक भैंस की और एक गाय की
 *  यदि किसान की एंट्री पहले से मौजूद हो व फोटो से एंट्री में उसी शिफ्ट तारीख में उसी पशु की एंट्री आ जाए तो वह एंट्री सेव नहीं हो"
 */
export function canSaveFarmerShiftMilkEntry(
  existingCollections: MilkCollectionEntry[],
  candidate: {
    farmerId: string;
    date: string;
    shift: ShiftType;
    milkType: MilkType;
  },
  editingEntryId?: string
): ShiftMilkEntryValidationResult {
  const sameShiftEntries = (existingCollections || []).filter(
    (c) =>
      c.farmerId === candidate.farmerId &&
      c.date === candidate.date &&
      c.shift === candidate.shift &&
      (!editingEntryId || c.id !== editingEntryId)
  );

  const existingCowEntry = sameShiftEntries.find((c) => c.milkType === 'cow');
  const existingBuffaloEntry = sameShiftEntries.find((c) => c.milkType === 'buffalo');

  if (candidate.milkType === 'cow' && existingCowEntry) {
    return {
      allowed: false,
      existingConflict: existingCowEntry,
      existingCowEntry,
      existingBuffaloEntry,
      reasonHi: `इस किसान की इस तारीख (${candidate.date}) और शिफ्ट (${
        candidate.shift === 'morning' ? 'सुबह' : 'शाम'
      }) में गाय (Cow) के दूध की एंट्री पहले से मौजूद है! किसी भी किसान की एक शिफ्ट में केवल दो दूध एंट्री ही हो सकती हैं (एक भैंस की और एक गाय की)।`,
      reasonEn:
        'A Cow milk entry already exists for this farmer in this date & shift! Only 2 entries per shift (1 Buffalo and 1 Cow) are allowed.',
    };
  }

  if (candidate.milkType === 'buffalo' && existingBuffaloEntry) {
    return {
      allowed: false,
      existingConflict: existingBuffaloEntry,
      existingCowEntry,
      existingBuffaloEntry,
      reasonHi: `इस किसान की इस तारीख (${candidate.date}) और शिफ्ट (${
        candidate.shift === 'morning' ? 'सुबह' : 'शाम'
      }) में भैंस (Buffalo) के दूध की एंट्री पहले से मौजूद है! किसी भी किसान की एक शिफ्ट में केवल दो दूध एंट्री ही हो सकती हैं (एक भैंस की और एक गाय की)।`,
      reasonEn:
        'A Buffalo milk entry already exists for this farmer in this date & shift! Only 2 entries per shift (1 Buffalo and 1 Cow) are allowed.',
    };
  }

  if (sameShiftEntries.length >= 2) {
    return {
      allowed: false,
      existingConflict: sameShiftEntries[0],
      existingCowEntry,
      existingBuffaloEntry,
      reasonHi: `इस किसान की इस शिफ्ट में पहले से दो दूध एंट्री (एक गाय और एक भैंस) मौजूद हैं! एक शिफ्ट में अधिकतम दो एंट्री ही हो सकती हैं।`,
      reasonEn:
        'This farmer already has 2 milk entries (1 Cow and 1 Buffalo) in this shift!',
    };
  }

  return {
    allowed: true,
    existingCowEntry,
    existingBuffaloEntry,
  };
}

export interface ScannedSlipPreviewItem {
  entry: MilkCollectionEntry;
  isDuplicate: boolean;
  duplicateSource?: 'existing' | 'batch';
  existingConflictId?: string;
  overwriteExisting?: boolean;
  manualRate?: boolean;
  isManualRow?: boolean;
  rowWarningsHi?: string[];
  statusHi: string;
  statusEn: string;
}

/**
 * Matches scanned slip rows to registered farmers (strictly matching by Name FIRST, then Code SECOND),
 * NEVER auto-creating fake/new farmers when registered farmers exist ("कोई नया नाम अपने आप ऐड न करे"),
 * resolves per-row Date and Morning/Evening Shift,
 * looks up rate chart (or nearest/standard fallback rate),
 * truncates totalAmount to a whole integer (e.g., 253.85 -> 253),
 * and builds both previewItems and savable MilkCollectionEntry items.
 */
export function buildCollectionEntriesFromScannedSlip(
  scannedRows: ScannedSlipRawRow[],
  farmers: Farmer[],
  rateCharts: { cow: RateChartMatrix | null; buffalo: RateChartMatrix | null },
  date: string,
  shift: ShiftType,
  fallbackFarmerId?: string,
  existingCollections: MilkCollectionEntry[] = []
): {
  entries: MilkCollectionEntry[];
  savedEntries: MilkCollectionEntry[];
  previewItems: ScannedSlipPreviewItem[];
  skippedDuplicates: MilkCollectionEntry[];
  autoCreatedFarmers: Farmer[];
  warningsHi: string[];
  errors: string[];
} {
  const savedEntries: MilkCollectionEntry[] = [];
  const previewItems: ScannedSlipPreviewItem[] = [];
  const skippedDuplicates: MilkCollectionEntry[] = [];
  const autoCreatedFarmers: Farmer[] = [];
  const errors: string[] = [];
  const allFarmers = [...farmers];
  const activeFarmers = allFarmers.filter((f) => f && f.active !== false);

  let carryForwardFarmer: Farmer | undefined;
  let matchedRegisteredFarmerCount = 0;

  // Pre-scan all rows to see if ANY row matches a registered farmer by Name or Code
  for (const r of scannedRows) {
    const m = matchFarmerByNameThenCode(allFarmers, r.farmerName, r.farmerCode);
    if (m) {
      matchedRegisteredFarmerCount++;
      if (!carryForwardFarmer) {
        carryForwardFarmer = m;
      }
    }
  }

  // Detect if this is a single-farmer multi-row passbook batch (5+ rows, e.g. 10-11 rows for 21-31 date)
  const distinctInputCodes = new Set(
    scannedRows
      .map((r) => (r.farmerCode ? convertDevanagariDigitsToAscii(String(r.farmerCode)).trim() : ''))
      .filter(Boolean)
  );
  const distinctInputNames = new Set(
    scannedRows.map((r) => cleanScannedFarmerName(r.farmerName) || '').filter(Boolean)
  );
  const resolvedInitialDates = new Set(
    scannedRows.map((r) => normalizeScannedDate(r.date, date))
  );
  const isSingleFarmerUndatedPassbookBatch =
    scannedRows.length >= 5 &&
    distinctInputCodes.size <= 1 &&
    distinctInputNames.size <= 1 &&
    resolvedInitialDates.size === 1;

  const [ymYearStr, ymMonthStr, ymDayStr] = date.split('-');
  const ymYear = Number(ymYearStr) || 2026;
  const ymMonth = Number(ymMonthStr) || 10;
  const baseDay = Number(ymDayStr) || 21;
  const maxDaysInMonth = new Date(ymYear, ymMonth, 0).getDate() || 31;
  const autoCycleStartDay =
    scannedRows.length === 11 || baseDay >= 21
      ? 21
      : baseDay >= 11 && baseDay <= 20
      ? 11
      : 1;

  for (let i = 0; i < scannedRows.length; i++) {
    const row = scannedRows[i];
    const rawFat = Number(row.fat) || 0;
    const rawSnf = Number(row.snf) || 8.5;
    const rawLiters = Number(row.liters) || 0;

    const fat =
      rawFat >= 25 && rawFat <= 115 && Number.isInteger(rawFat)
        ? round2(rawFat / 10)
        : round2(rawFat);
    const snf =
      rawSnf >= 70 && rawSnf <= 105 && Number.isInteger(rawSnf)
        ? round2(rawSnf / 10)
        : rawSnf > 0
        ? round2(rawSnf)
        : 8.5;
    let liters =
      rawLiters >= 1000 && rawLiters <= 9999 && Number.isInteger(rawLiters)
        ? round3(rawLiters / 1000)
        : round3(rawLiters);

    const rowWarningsHi: string[] = [];
    if (row.rate && row.amount && Number(row.rate) >= 15 && Number(row.amount) >= 10) {
      const r = Number(row.rate);
      const amt = Number(row.amount);
      if (Math.abs(liters * r - amt) > Math.max(3, amt * 0.05)) {
        const repairedLiters = round3(amt / r);
        if (
          repairedLiters >= 0.2 &&
          repairedLiters <= 200 &&
          Math.abs(repairedLiters * r - amt) <= 2.5
        ) {
          liters = repairedLiters;
          rowWarningsHi.push(`रकम (₹${amt}) व दर (₹${r}) के आधार पर लीटर ${liters} किया गया`);
        }
      }
    }

    if (
      !Number.isFinite(fat) ||
      fat <= 0 ||
      !Number.isFinite(snf) ||
      snf <= 0 ||
      !Number.isFinite(liters) ||
      liters <= 0
    ) {
      errors.push(
        `पंक्ति ${i + 1}: अमान्य FAT (${row.fat}), SNF (${row.snf}) या मात्रा (${row.liters})`
      );
      continue;
    }

    if (fat < 2.5 || fat > 11.5) {
      rowWarningsHi.push(`FAT (${fat}) असामान्य है — कृपया जाँचें`);
    }
    if (snf < 7.0 || snf > 10.5) {
      rowWarningsHi.push(`SNF (${snf}) असामान्य है — कृपया जाँचें`);
    }
    if (liters > 80) {
      rowWarningsHi.push(`लीटर (${liters} L) अधिक है — कृपया जाँचें`);
    }

    // Resolve per-row Date and Shift (falls back to current selected date & shift)
    let entryDate = normalizeScannedDate(row.date, date);
    const entryShift = normalizeScannedShift(
      row.shift ? String(row.shift) : undefined,
      shift
    );

    if (isSingleFarmerUndatedPassbookBatch) {
      const assignedDay = Math.min(maxDaysInMonth, autoCycleStartDay + i);
      entryDate = `${String(ymYear).padStart(4, '0')}-${String(ymMonth).padStart(2, '0')}-${String(
        assignedDay
      ).padStart(2, '0')}`;
    }

    const cleanedRowName = cleanScannedFarmerName(row.farmerName);
    let cleanedRowCode = row.farmerCode
      ? convertDevanagariDigitsToAscii(String(row.farmerCode)).trim()
      : undefined;

    // Match Farmer with strict priority:
    // 1. Farmer Name match FIRST (raw row.farmerName first, then cleanedRowName)
    // 2. Farmer Code match SECOND
    let matchedFarmer =
      matchFarmerByNameThenCode(allFarmers, row.farmerName, cleanedRowCode) ||
      matchFarmerByNameThenCode(allFarmers, cleanedRowName, cleanedRowCode);

    // Special guard for single-farmer passbook rows where day-of-month (1..31, e.g. 21..31)
    // was placed in farmerCode by an external OCR JSON response and doesn't match any farmer code
    if (
      !matchedFarmer &&
      !cleanedRowName &&
      cleanedRowCode &&
      /^\d{1,2}$/.test(cleanedRowCode) &&
      Number(cleanedRowCode) >= 1 &&
      Number(cleanedRowCode) <= 31 &&
      (!row.date || normalizeScannedDate(row.date, date) === date) &&
      (Boolean(fallbackFarmerId) || Boolean(carryForwardFarmer) || scannedRows.length >= 3)
    ) {
      entryDate = normalizeScannedDate(cleanedRowCode, date);
      cleanedRowCode = undefined;
    }

    // 3. STRICT NO-AUTO-CREATE & NO-FAKE-PREVIEW RULE:
    // When the dairy already has registered farmers (farmers.length > 0):
    // - Never auto-create fake/new farmers ("कोई नया नाम अपने आप ऐड न करे").
    // - If at least one row matched a registered farmer and this row has a different unmatched name/code, skip it.
    const hasInitialRegisteredFarmers = farmers.length > 0;
    if (
      !matchedFarmer &&
      hasInitialRegisteredFarmers &&
      !fallbackFarmerId &&
      matchedRegisteredFarmerCount >= 1 &&
      (Boolean(cleanedRowName) || Boolean(cleanedRowCode))
    ) {
      errors.push(
        `पंक्ति ${i + 1}: किसान "${cleanedRowName || cleanedRowCode}" पंजीकृत किसानों में नहीं मिला — गलत एंट्री प्रिव्यू से हटाई गई।`
      );
      continue;
    }

    // Unnamed rows (e.g. passbook date rows under a farmer header) inherit carryForwardFarmer
    if (!matchedFarmer && carryForwardFarmer && !cleanedRowName && !cleanedRowCode) {
      matchedFarmer = carryForwardFarmer;
    }
    if (!matchedFarmer && fallbackFarmerId) {
      matchedFarmer = allFarmers.find((f) => f.id === fallbackFarmerId);
    }
    // Only fall back to carryForwardFarmer / activeFarmers[0] when registered farmers exist in the dairy
    // (so when farmers.length > 0, no new farmer is ever auto-created)
    if (!matchedFarmer && hasInitialRegisteredFarmers) {
      matchedFarmer = carryForwardFarmer || activeFarmers[0] || allFarmers[0];
    }
    // Only if the entire dairy has 0 registered farmers at all, create a temporary fallback farmer per distinct name/code
    if (!matchedFarmer) {
      const newCode = cleanedRowCode || String(101 + i);
      const newName = cleanedRowName || `किसान ${newCode}`;
      const newFarmer: Farmer = {
        id: `farmer_auto_${Date.now()}_${i}`,
        code: newCode,
        name: newName,
        mobile: '',
        village: '',
        defaultMilkType: classifyMilkType(fat),
        shiftSchedule: 'both',
        openingBalance: 0,
        notes: 'फोटो पर्ची से स्वतः जोड़ा गया किसान',
        active: true,
        createdAt: new Date().toISOString(),
      };
      allFarmers.push(newFarmer);
      activeFarmers.push(newFarmer);
      autoCreatedFarmers.push(newFarmer);
      matchedFarmer = newFarmer;
    }

    carryForwardFarmer = matchedFarmer;

    const rawMilkTypeStr = String(row.milkType || '').trim().toLowerCase();
    const milkType: MilkType =
      rawMilkTypeStr === 'cow' || rawMilkTypeStr === 'गाय'
        ? 'cow'
        : rawMilkTypeStr === 'buffalo' || rawMilkTypeStr === 'भैंस'
        ? 'buffalo'
        : classifyMilkType(fat);
    const chart = rateCharts[milkType] || rateCharts.cow || rateCharts.buffalo;
    const exactLookup = lookupRateFromChart(rateCharts[milkType], fat, snf);

    let rate: number | null = null;
    if (row.manualRate && row.rate && Number.isFinite(Number(row.rate)) && Number(row.rate) > 0) {
      rate = round2(Number(row.rate));
    } else if (row.rate && Number.isFinite(Number(row.rate)) && Number(row.rate) >= 15 && Number(row.rate) <= 120) {
      // If the PDF/slip explicitly printed the exact rate (e.g. ₹45.90), honor it or use exact chart rate
      rate = round2(Number(row.rate));
    } else if (exactLookup.found && exactLookup.rate !== null) {
      rate = exactLookup.rate;
    } else {
      const nearest = lookupNearestRateFromChart(chart, fat, snf);
      if (nearest !== null && nearest > 0) {
        rate = nearest;
      } else {
        rate =
          milkType === 'buffalo'
            ? round2(Math.max(25, fat * 7.5 + (snf - 8.5) * 2.0))
            : round2(Math.max(22, fat * 6.5 + (snf - 8.5) * 1.8));
      }
    }

    // Whole-integer truncation for farmer milk purchase: 253.85 -> 253 (or exact printed integer amount if consistent)
    const computedAmount = truncatePurchaseAmount(liters * rate);
    const totalAmount =
      !row.manualRate &&
      row.amount &&
      Number.isFinite(Number(row.amount)) &&
      Math.abs(computedAmount - Math.floor(Number(row.amount))) <= 1
        ? Math.floor(Number(row.amount))
        : computedAmount;
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 8);

    const candidateEntry: MilkCollectionEntry = {
      id: row.id || `col_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      date: entryDate,
      time: timeStr,
      shift: entryShift,
      farmerId: matchedFarmer.id,
      farmerName: matchedFarmer.name,
      farmerCode: matchedFarmer.code,
      milkType,
      liters,
      fat,
      snf,
      rate,
      totalAmount,
      deduction: 0,
      netPayable: totalAmount,
      notes: 'फोटो/PDF से प्रिव्यू के बाद सेव',
      createdAt: now.toISOString(),
    };

    const animalHi = milkType === 'cow' ? 'गाय' : 'भैंस';
    const animalEn = milkType === 'cow' ? 'Cow' : 'Buffalo';
    const existingCheck = canSaveFarmerShiftMilkEntry(existingCollections, candidateEntry);
    const batchCheck = canSaveFarmerShiftMilkEntry(savedEntries, candidateEntry);

    if (!batchCheck.allowed && !row.isManualRow) {
      // Automatically drop intra-photo OCR duplicate rows for the exact same farmer + date + shift + animalType
      // so the user never sees 2-3 duplicate entries for the same farmer from a single photo scan!
      continue;
    }

    if (!existingCheck.allowed && !row.overwriteExisting) {
      skippedDuplicates.push(candidateEntry);
      errors.push(
        `${matchedFarmer.code}-${matchedFarmer.name} (${formatDateDMY(entryDate)} ${
          entryShift === 'morning' ? 'सुबह' : 'शाम'
        }): ${animalHi} दूध की एंट्री पहले से मौजूद है — यह एंट्री सेव नहीं होगी।`
      );
      previewItems.push({
        entry: candidateEntry,
        isDuplicate: true,
        duplicateSource: 'existing',
        existingConflictId: existingCheck.existingConflict?.id,
        overwriteExisting: false,
        manualRate: Boolean(row.manualRate),
        isManualRow: Boolean(row.isManualRow),
        rowWarningsHi,
        statusHi: `पहले से मौजूद (${animalHi}) — सेव नहीं होगी`,
        statusEn: `Already Exists (${animalEn}) — Will Not Save`,
      });
    } else if (!batchCheck.allowed) {
      skippedDuplicates.push(candidateEntry);
      errors.push(
        `${matchedFarmer.code}-${matchedFarmer.name} (${formatDateDMY(entryDate)} ${
          entryShift === 'morning' ? 'सुबह' : 'शाम'
        }): फोटो में ${animalHi} दूध की एंट्री दोबारा आई है — यह एंट्री सेव नहीं होगी।`
      );
      previewItems.push({
        entry: candidateEntry,
        isDuplicate: true,
        duplicateSource: 'batch',
        overwriteExisting: false,
        manualRate: Boolean(row.manualRate),
        isManualRow: Boolean(row.isManualRow),
        rowWarningsHi,
        statusHi: `फोटो में दोबारा (${animalHi}) — सेव नहीं होगी`,
        statusEn: `Duplicate in Photo (${animalEn}) — Will Not Save`,
      });
    } else {
      if (!existingCheck.allowed && row.overwriteExisting && existingCheck.existingConflict) {
        candidateEntry.id = existingCheck.existingConflict.id;
      }
      savedEntries.push(candidateEntry);
      previewItems.push({
        entry: candidateEntry,
        isDuplicate: false,
        existingConflictId: existingCheck.existingConflict?.id,
        overwriteExisting: Boolean(row.overwriteExisting),
        manualRate: Boolean(row.manualRate),
        isManualRow: Boolean(row.isManualRow),
        rowWarningsHi,
        statusHi: row.overwriteExisting
          ? `पुरानी एंट्री अपडेट होगी (${animalHi})`
          : `सेव के लिए तैयार (${animalHi})`,
        statusEn: row.overwriteExisting
          ? `Will Update Existing (${animalEn})`
          : `Ready to Save (${animalEn})`,
      });
    }
  }

  return {
    entries: savedEntries,
    savedEntries,
    previewItems,
    skippedDuplicates,
    autoCreatedFarmers,
    warningsHi: errors,
    errors,
  };
}

// ============================================================================
// 10-Day Wholesale Milk Sale Billing System ("बिक्री का 10-दिन का बिल")
// All wholesale sale rates, shift totals, and 10-day bill totals retain exact
// 2-decimal precision (round2) as required.
// ============================================================================

export interface TenDaySaleDayRow {
  date: string;
  morningLiters: number;
  morningFat: number | null;
  morningSnf: number | null;
  morningRate: number | null;
  morningAmount: number;
  eveningLiters: number;
  eveningFat: number | null;
  eveningSnf: number | null;
  eveningRate: number | null;
  eveningAmount: number;
  totalLiters: number;
  totalAmount: number;
  avgFat: number | null;
  avgSnf: number | null;
}

export interface TenDaySaleBillReport {
  billNumber: string;
  fromDate: string;
  toDate: string;
  cycle: 1 | 2 | 3 | 'custom';
  yearMonth: string;
  buyerFilter: string;
  buyerLabelHi: string;
  buyerLabelEn: string;
  customerCode?: string;
  customerMobile?: string;
  morningSummary: SaleSummary;
  eveningSummary: SaleSummary;
  totalSummary: SaleSummary;
  dayWiseRows: TenDaySaleDayRow[];
  entries: WholesaleSaleEntry[];
  whatsAppMessageHi: string;
  whatsAppMessageEn: string;
}

export function generateTenDaySaleBillData(
  sales: WholesaleSaleEntry[],
  customers: Customer[],
  options: {
    customerFilter?: string; // 'all' | customer.id | 'buyer:Name'
    yearMonth: string; // YYYY-MM
    cycle: 1 | 2 | 3 | 'custom';
    customFromDate?: string;
    customToDate?: string;
    dairyName?: string;
  }
): TenDaySaleBillReport {
  const {
    customerFilter = 'all',
    yearMonth,
    cycle,
    customFromDate,
    customToDate,
    dairyName = 'Ujalaa Dairy',
  } = options;

  let fromDate = customFromDate || `${yearMonth}-01`;
  let toDate = customToDate || `${yearMonth}-10`;

  if (cycle !== 'custom') {
    const range = getTenDayCycleDates(yearMonth, cycle);
    fromDate = range.fromDate;
    toDate = range.toDate;
  }

  // Resolve buyer / customer filter
  let buyerLabelHi = 'सभी ग्राहक (All Buyers)';
  let buyerLabelEn = 'All Buyers / Customers';
  let customerCode: string | undefined;
  let customerMobile: string | undefined;

  const matchedCustomer =
    customerFilter && customerFilter !== 'all' && !customerFilter.startsWith('buyer:')
      ? customers.find((c) => c.id === customerFilter)
      : undefined;

  const matchedBuyerName =
    customerFilter && customerFilter.startsWith('buyer:')
      ? customerFilter.slice('buyer:'.length).trim()
      : undefined;

  if (matchedCustomer) {
    buyerLabelHi = `${matchedCustomer.code} — ${matchedCustomer.name}`;
    buyerLabelEn = `${matchedCustomer.code} — ${matchedCustomer.name}`;
    customerCode = matchedCustomer.code;
    customerMobile = matchedCustomer.mobile || '';
  } else if (matchedBuyerName) {
    buyerLabelHi = matchedBuyerName;
    buyerLabelEn = matchedBuyerName;
  }

  // Filter sales in date range and matching customer/buyer
  const periodSales = (sales || [])
    .filter((s) => {
      if (s.date < fromDate || s.date > toDate) return false;
      if (!customerFilter || customerFilter === 'all') return true;
      if (matchedCustomer) {
        return (
          s.customerId === matchedCustomer.id ||
          s.buyerName.trim().toLowerCase() === matchedCustomer.name.trim().toLowerCase()
        );
      }
      if (matchedBuyerName) {
        return s.buyerName.trim().toLowerCase() === matchedBuyerName.toLowerCase();
      }
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift));

  const morningEntries = periodSales.filter((s) => s.shift === 'morning');
  const eveningEntries = periodSales.filter((s) => s.shift === 'evening');

  const morningSummary = calculateSaleSummary(morningEntries);
  const eveningSummary = calculateSaleSummary(eveningEntries);
  const totalSummary = calculateSaleSummary(periodSales);

  // Build day-wise rows
  const uniqueDates = Array.from(new Set(periodSales.map((s) => s.date))).sort();
  const dayWiseRows: TenDaySaleDayRow[] = uniqueDates.map((dt) => {
    const dtAll = periodSales.filter((s) => s.date === dt);
    const mSum = calculateSaleSummary(dtAll.filter((s) => s.shift === 'morning'));
    const eSum = calculateSaleSummary(dtAll.filter((s) => s.shift === 'evening'));
    const tSum = calculateSaleSummary(dtAll);
    return {
      date: dt,
      morningLiters: mSum.totalLiters,
      morningFat: mSum.avgFat,
      morningSnf: mSum.avgSnf,
      morningRate: mSum.avgRate,
      morningAmount: mSum.totalNetReceivable,
      eveningLiters: eSum.totalLiters,
      eveningFat: eSum.avgFat,
      eveningSnf: eSum.avgSnf,
      eveningRate: eSum.avgRate,
      eveningAmount: eSum.totalNetReceivable,
      totalLiters: tSum.totalLiters,
      totalAmount: tSum.totalNetReceivable,
      avgFat: tSum.avgFat,
      avgSnf: tSum.avgSnf,
    };
  });

  const cycleSuffix = cycle === 'custom' ? 'CUSTOM' : `C${cycle}`;
  const codeSuffix = customerCode || (matchedBuyerName ? matchedBuyerName.slice(0, 4).toUpperCase() : 'ALL');
  const billNumber = `SB-${yearMonth.replace('-', '')}-${cycleSuffix}-${codeSuffix}`;

  const whatsAppMessageHi = [
    `*${dairyName} — 10-दिन का दूध बिक्री बिल*`,
    `बिल नं: ${billNumber}`,
    `ग्राहक: *${buyerLabelHi}*`,
    `अवधि: ${formatDateDMY(fromDate)} से ${formatDateDMY(toDate)}`,
    `------------------------`,
    `सुबह की बिक्री: ${morningSummary.totalLiters.toFixed(3)} L (₹${morningSummary.totalNetReceivable.toFixed(2)})`,
    `शाम की बिक्री: ${eveningSummary.totalLiters.toFixed(3)} L (₹${eveningSummary.totalNetReceivable.toFixed(2)})`,
    `------------------------`,
    `*कुल दूध मात्रा:* ${totalSummary.totalLiters.toFixed(3)} L`,
    `औसत FAT / SNF: ${totalSummary.avgFat !== null ? totalSummary.avgFat.toFixed(2) : '—'} / ${totalSummary.avgSnf !== null ? totalSummary.avgSnf.toFixed(2) : '—'}`,
    `औसत दर (Rate/L): ${totalSummary.avgRate !== null ? `₹${totalSummary.avgRate.toFixed(2)}` : '—'}`,
    totalSummary.totalCharges > 0 ? `अन्य शुल्क/छूट: ₹${totalSummary.totalCharges.toFixed(2)}` : null,
    `*कुल देय बिक्री बिल राशि: ₹${totalSummary.totalNetReceivable.toFixed(2)}*`,
  ]
    .filter(Boolean)
    .join('\n');

  const whatsAppMessageEn = [
    `*${dairyName} — 10-Day Milk Sale Bill*`,
    `Bill No: ${billNumber}`,
    `Customer: *${buyerLabelEn}*`,
    `Period: ${formatDateDMY(fromDate)} to ${formatDateDMY(toDate)}`,
    `------------------------`,
    `Morning Sale: ${morningSummary.totalLiters.toFixed(3)} L (₹${morningSummary.totalNetReceivable.toFixed(2)})`,
    `Evening Sale: ${eveningSummary.totalLiters.toFixed(3)} L (₹${eveningSummary.totalNetReceivable.toFixed(2)})`,
    `------------------------`,
    `*Total Milk Sold:* ${totalSummary.totalLiters.toFixed(3)} L`,
    `Avg FAT / SNF: ${totalSummary.avgFat !== null ? totalSummary.avgFat.toFixed(2) : '—'} / ${totalSummary.avgSnf !== null ? totalSummary.avgSnf.toFixed(2) : '—'}`,
    `Avg Rate/L: ${totalSummary.avgRate !== null ? `₹${totalSummary.avgRate.toFixed(2)}` : '—'}`,
    totalSummary.totalCharges > 0 ? `Other Charges: ₹${totalSummary.totalCharges.toFixed(2)}` : null,
    `*Total Net Sale Bill Amount: ₹${totalSummary.totalNetReceivable.toFixed(2)}*`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    billNumber,
    fromDate,
    toDate,
    cycle,
    yearMonth,
    buyerFilter: customerFilter,
    buyerLabelHi,
    buyerLabelEn,
    customerCode,
    customerMobile,
    morningSummary,
    eveningSummary,
    totalSummary,
    dayWiseRows,
    entries: periodSales,
    whatsAppMessageHi,
    whatsAppMessageEn,
  };
}

/**
 * Extracts numeric code from strings like "1", "02", "C03", "F-10" for natural numeric ordering (1, 2, 3... 10).
 */
export function extractNumericCode(code?: string | null): number {
  if (!code) return Number.MAX_SAFE_INTEGER;
  const trimmed = String(code).trim();
  if (!trimmed) return Number.MAX_SAFE_INTEGER;
  const exactInt = Number(trimmed);
  if (Number.isFinite(exactInt) && exactInt >= 0) {
    return exactInt;
  }
  const match = trimmed.match(/\d+/);
  if (match) {
    const parsed = parseInt(match[0], 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Compares two farmer/customer codes in ascending numerical order (1, 2, 3 ... 10).
 */
export function compareCodeAsc(
  codeA?: string | null,
  codeB?: string | null,
  nameA?: string | null,
  nameB?: string | null
): number {
  const numA = extractNumericCode(codeA);
  const numB = extractNumericCode(codeB);
  if (numA !== numB) {
    return numA - numB;
  }
  const strA = String(codeA || '').trim();
  const strB = String(codeB || '').trim();
  const cmpCode = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
  if (cmpCode !== 0) return cmpCode;
  return String(nameA || '').trim().localeCompare(String(nameB || '').trim(), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function sortFarmersByCode<T extends { code?: string; name?: string }>(farmers: T[]): T[] {
  return [...farmers].sort((a, b) => compareCodeAsc(a.code, b.code, a.name, b.name));
}

export function sortCustomersByCode<T extends { code?: string; name?: string }>(customers: T[]): T[] {
  return [...customers].sort((a, b) => compareCodeAsc(a.code, b.code, a.name, b.name));
}

/**
 * Sorts milk purchase collection entries strictly by Farmer Code No (1, 2, 3...),
 * then shift (morning before evening), then date & time.
 */
export function sortCollectionsByFarmerCode(
  entries: MilkCollectionEntry[],
  farmers: Farmer[] = []
): MilkCollectionEntry[] {
  const farmerMap = new Map<string, Farmer>();
  for (const f of farmers) {
    farmerMap.set(f.id, f);
  }
  return [...entries].sort((a, b) => {
    const fA = farmerMap.get(a.farmerId);
    const fB = farmerMap.get(b.farmerId);
    const codeA = a.farmerCode || fA?.code || '';
    const codeB = b.farmerCode || fB?.code || '';
    const nameA = a.farmerName || fA?.name || '';
    const nameB = b.farmerName || fB?.name || '';
    const codeCmp = compareCodeAsc(codeA, codeB, nameA, nameB);
    if (codeCmp !== 0) return codeCmp;
    if (a.shift !== b.shift) {
      return a.shift === 'morning' ? -1 : 1;
    }
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return (a.time || '').localeCompare(b.time || '');
  });
}

/**
 * Sorts wholesale milk sale entries strictly by Customer Code No (1, 2, 3...),
 * then shift (morning before evening), then date & time.
 */
export function sortSalesByCustomerCode(
  sales: WholesaleSaleEntry[],
  customers: Customer[] = []
): WholesaleSaleEntry[] {
  const byId = new Map<string, Customer>();
  const byName = new Map<string, Customer>();
  for (const c of customers) {
    byId.set(c.id, c);
    byName.set(c.name.trim().toLowerCase(), c);
  }
  return [...sales].sort((a, b) => {
    const custA =
      (a.customerId ? byId.get(a.customerId) : undefined) ||
      byName.get((a.buyerName || '').trim().toLowerCase());
    const custB =
      (b.customerId ? byId.get(b.customerId) : undefined) ||
      byName.get((b.buyerName || '').trim().toLowerCase());
    const codeA = a.customerCode || custA?.code || '';
    const codeB = b.customerCode || custB?.code || '';
    const nameA = a.buyerName || custA?.name || '';
    const nameB = b.buyerName || custB?.name || '';
    const codeCmp = compareCodeAsc(codeA, codeB, nameA, nameB);
    if (codeCmp !== 0) return codeCmp;
    if (a.shift !== b.shift) {
      return a.shift === 'morning' ? -1 : 1;
    }
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return (a.time || '').localeCompare(b.time || '');
  });
}

export interface AllFarmersTenDayBillRow {
  rowId: string;
  farmerId: string;
  farmerCode: string;
  farmerName: string;
  farmerMobile: string;
  shift: ShiftType;
  isDualShiftFarmer: boolean;
  shiftRowIndex: 1 | 2;
  entryCount: number;
  avgFat: number | null;
  avgSnf: number | null;
  avgRate: number | null;
  totalLiters: number;
  totalAmount: number;
  farmerCombinedLiters: number;
  farmerCombinedAmount: number;
}

export interface AllFarmersTenDayBillReport {
  fromDate: string;
  toDate: string;
  mode: 'morning' | 'evening' | 'both';
  rows: AllFarmersTenDayBillRow[];
  distinctFarmerCount: number;
  morningSummary: ReturnType<typeof calculateCollectionSummary>;
  eveningSummary: ReturnType<typeof calculateCollectionSummary>;
  overallSummary: ReturnType<typeof calculateCollectionSummary>;
}

/**
 * Builds the 10-Day Bill rows for All Farmers sorted strictly by Farmer Code No (1, 2, 3...):
 * - mode === 'morning': 1 row per farmer who supplied morning milk
 * - mode === 'evening': 1 row per farmer who supplied evening milk
 * - mode === 'both': for each farmer in Code No order (1, 2, 3...),
 *   if they supplied in both shifts, emits TWO separate rows (Line 1: सुबह, Line 2: शाम);
 *   if they supplied in only one shift, emits 1 row for that shift.
 */
function computeWeightedEntryRate(
  entries: MilkCollectionEntry[],
  fallbackAvgRate: number | null
): number | null {
  let rateLiters = 0;
  let weightedRateSum = 0;
  for (const e of entries) {
    const l = Number(e.liters) || 0;
    const r = Number(e.rate) || 0;
    if (l > 0 && r > 0) {
      rateLiters += l;
      weightedRateSum += l * r;
    }
  }
  if (rateLiters > 0) {
    return round2(weightedRateSum / rateLiters);
  }
  return fallbackAvgRate;
}

export function buildAllFarmersTenDayBillRows(
  farmers: Farmer[],
  collections: MilkCollectionEntry[],
  fromDate: string,
  toDate: string,
  mode: 'morning' | 'evening' | 'both'
): AllFarmersTenDayBillReport {
  const periodCollections = collections.filter(
    (c) => c.date >= fromDate && c.date <= toDate
  );

  // Merge registered farmers and any farmers referenced in periodCollections
  const farmerMap = new Map<string, { id: string; code: string; name: string; mobile: string }>();
  for (const f of farmers) {
    farmerMap.set(f.id, {
      id: f.id,
      code: f.code || '',
      name: f.name || '',
      mobile: f.mobile || '',
    });
  }
  for (const c of periodCollections) {
    if (!farmerMap.has(c.farmerId)) {
      farmerMap.set(c.farmerId, {
        id: c.farmerId,
        code: c.farmerCode || '',
        name: c.farmerName || '',
        mobile: '',
      });
    }
  }

  const sortedFarmers = sortFarmersByCode(Array.from(farmerMap.values()));
  const rows: AllFarmersTenDayBillRow[] = [];
  const activeFarmerIds = new Set<string>();

  for (const farmer of sortedFarmers) {
    const fEntries = periodCollections.filter((c) => c.farmerId === farmer.id);
    if (fEntries.length === 0) continue;

    const mEntries = fEntries.filter((c) => c.shift === 'morning');
    const eEntries = fEntries.filter((c) => c.shift === 'evening');
    const mSum = calculateCollectionSummary(mEntries);
    const eSum = calculateCollectionSummary(eEntries);
    const combSum = calculateCollectionSummary(fEntries);
    const mAvgRate = computeWeightedEntryRate(mEntries, mSum.avgRate);
    const eAvgRate = computeWeightedEntryRate(eEntries, eSum.avgRate);

    if (mode === 'morning') {
      if (mEntries.length > 0) {
        activeFarmerIds.add(farmer.id);
        rows.push({
          rowId: `${farmer.id}-morning`,
          farmerId: farmer.id,
          farmerCode: farmer.code,
          farmerName: farmer.name,
          farmerMobile: farmer.mobile,
          shift: 'morning',
          isDualShiftFarmer: false,
          shiftRowIndex: 1,
          entryCount: mEntries.length,
          avgFat: mSum.avgFat,
          avgSnf: mSum.avgSnf,
          avgRate: mAvgRate,
          totalLiters: mSum.totalLiters,
          totalAmount: mSum.totalNetPayable,
          farmerCombinedLiters: mSum.totalLiters,
          farmerCombinedAmount: mSum.totalNetPayable,
        });
      }
    } else if (mode === 'evening') {
      if (eEntries.length > 0) {
        activeFarmerIds.add(farmer.id);
        rows.push({
          rowId: `${farmer.id}-evening`,
          farmerId: farmer.id,
          farmerCode: farmer.code,
          farmerName: farmer.name,
          farmerMobile: farmer.mobile,
          shift: 'evening',
          isDualShiftFarmer: false,
          shiftRowIndex: 1,
          entryCount: eEntries.length,
          avgFat: eSum.avgFat,
          avgSnf: eSum.avgSnf,
          avgRate: eAvgRate,
          totalLiters: eSum.totalLiters,
          totalAmount: eSum.totalNetPayable,
          farmerCombinedLiters: eSum.totalLiters,
          farmerCombinedAmount: eSum.totalNetPayable,
        });
      }
    } else {
      const hasM = mEntries.length > 0;
      const hasE = eEntries.length > 0;
      const isDual = hasM && hasE;
      if (hasM || hasE) {
        activeFarmerIds.add(farmer.id);
      }
      if (hasM) {
        rows.push({
          rowId: `${farmer.id}-morning`,
          farmerId: farmer.id,
          farmerCode: farmer.code,
          farmerName: farmer.name,
          farmerMobile: farmer.mobile,
          shift: 'morning',
          isDualShiftFarmer: isDual,
          shiftRowIndex: 1,
          entryCount: mEntries.length,
          avgFat: mSum.avgFat,
          avgSnf: mSum.avgSnf,
          avgRate: mAvgRate,
          totalLiters: mSum.totalLiters,
          totalAmount: mSum.totalNetPayable,
          farmerCombinedLiters: combSum.totalLiters,
          farmerCombinedAmount: combSum.totalNetPayable,
        });
      }
      if (hasE) {
        rows.push({
          rowId: `${farmer.id}-evening`,
          farmerId: farmer.id,
          farmerCode: farmer.code,
          farmerName: farmer.name,
          farmerMobile: farmer.mobile,
          shift: 'evening',
          isDualShiftFarmer: isDual,
          shiftRowIndex: isDual ? 2 : 1,
          entryCount: eEntries.length,
          avgFat: eSum.avgFat,
          avgSnf: eSum.avgSnf,
          avgRate: eAvgRate,
          totalLiters: eSum.totalLiters,
          totalAmount: eSum.totalNetPayable,
          farmerCombinedLiters: combSum.totalLiters,
          farmerCombinedAmount: combSum.totalNetPayable,
        });
      }
    }
  }

  const morningPeriodEntries = periodCollections.filter((c) => c.shift === 'morning');
  const eveningPeriodEntries = periodCollections.filter((c) => c.shift === 'evening');
  const relevantEntries =
    mode === 'morning'
      ? morningPeriodEntries
      : mode === 'evening'
      ? eveningPeriodEntries
      : periodCollections;

  const rawMorningSum = calculateCollectionSummary(morningPeriodEntries);
  const rawEveningSum = calculateCollectionSummary(eveningPeriodEntries);
  const rawOverallSum = calculateCollectionSummary(relevantEntries);

  return {
    fromDate,
    toDate,
    mode,
    rows,
    distinctFarmerCount: activeFarmerIds.size,
    morningSummary: {
      ...rawMorningSum,
      avgRate: computeWeightedEntryRate(morningPeriodEntries, rawMorningSum.avgRate),
    },
    eveningSummary: {
      ...rawEveningSum,
      avgRate: computeWeightedEntryRate(eveningPeriodEntries, rawEveningSum.avgRate),
    },
    overallSummary: {
      ...rawOverallSum,
      avgRate: computeWeightedEntryRate(relevantEntries, rawOverallSum.avgRate),
    },
  };
}



