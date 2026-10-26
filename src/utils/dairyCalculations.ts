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
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const farmerAdvPay = advancesAndPayments
    .filter((ap) => ap.farmerId === farmer.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const farmerFeed = cattleFeed
    .filter((cf) => cf.farmerId === farmer.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

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
  farmerCode?: string;
  farmerName?: string;
  date?: string;
  shift?: ShiftType | string;
  liters: number;
  fat: number;
  snf: number;
  rate?: number;
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

  // 1. YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = cleaned.match(/(?:^|\b)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\b|$)/);
  if (ymdMatch) {
    const res = formatYMD(Number(ymdMatch[1]), Number(ymdMatch[2]), Number(ymdMatch[3]));
    if (res) return res;
  }

  // 2. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY or DD/MM/YY
  const dmyMatch = cleaned.match(/(?:^|\b)(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\b|$)/);
  if (dmyMatch) {
    const res = formatYMD(Number(dmyMatch[3]), Number(dmyMatch[2]), Number(dmyMatch[1]));
    if (res) return res;
  }

  // 3. DD/MM or DD-MM
  const dmMatch = cleaned.match(/(?:^|\b)(\d{1,2})[/-](\d{1,2})(?:\b|$)/);
  if (dmMatch) {
    const res = formatYMD(fbYear, Number(dmMatch[2]), Number(dmMatch[1]));
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
  'पर्ची',
  'डेयरी',
  'उजाला',
]);

export function cleanScannedFarmerName(rawName?: string): string | undefined {
  if (!rawName) return undefined;
  const ascii = convertDevanagariDigitsToAscii(String(rawName));
  const stripped = ascii
    .replace(/[,:;()[\]{}=+|/\\]+/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\b/g, ' ')
    .trim();
  if (!stripped) return undefined;

  const words = stripped
    .split(/\s+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, '').trim())
    .filter((w) => {
      if (!w) return false;
      const lower = w.toLowerCase();
      if (SLIP_NOISE_WORDS.has(lower)) return false;
      if (/^[0-9.]+$/.test(lower)) return false;
      return true;
    });

  const joined = words.join(' ').trim();
  return joined.length >= 2 ? joined : undefined;
}

function normalizeNameForComparison(name: string): string {
  return convertDevanagariDigitsToAscii(String(name || ''))
    .toLowerCase()
    .replace(/[,:;()[\]{}=+|/\\._-]+/g, ' ')
    .replace(/(?:^|\s)(श्री|श्रीमती|जी|किसान|नाम|shri|smt|mr|mrs|ji)(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches a farmer from the registered farmers list using strict priority:
 * 1. Farmer Name FIRST ("यदि फोटो में किसान का नाम मैच हो तो नाम से मिलान करके एंट्री सेव करे")
 * 2. Farmer Code SECOND ("यदि नाम नहीं हो तो फिर कोड से मिलान कर एंट्री सेव करे")
 */
export function matchFarmerByNameThenCode(
  farmers: Farmer[],
  rawName?: string,
  rawCode?: string
): Farmer | undefined {
  if (!farmers || farmers.length === 0) return undefined;

  // Priority 1: Match by Farmer Name FIRST
  const cleanedRawName = cleanScannedFarmerName(rawName);
  if (cleanedRawName) {
    const targetName = normalizeNameForComparison(cleanedRawName);
    if (targetName.length >= 2) {
      // 1a. Exact normalized name match
      const exactMatch = farmers.find(
        (f) => normalizeNameForComparison(f.name) === targetName
      );
      if (exactMatch) return exactMatch;

      // 1b. Substring / containment match (e.g. "रामलाल" in "रामलाल गुर्जर" or vice versa)
      const substringMatch = farmers.find((f) => {
        const fNorm = normalizeNameForComparison(f.name);
        if (!fNorm || fNorm.length < 2) return false;
        return fNorm.includes(targetName) || targetName.includes(fNorm);
      });
      if (substringMatch) return substringMatch;

      // 1c. First/primary token match (e.g. "रामलाल शर्मा" vs "रामलाल" when first name has >= 2 chars)
      const targetTokens = targetName.split(' ').filter((t) => t.length >= 2);
      if (targetTokens.length > 0) {
        const firstToken = targetTokens[0];
        const tokenMatch = farmers.find((f) => {
          const fTokens = normalizeNameForComparison(f.name)
            .split(' ')
            .filter((t) => t.length >= 2);
          return fTokens.length > 0 && fTokens[0] === firstToken;
        });
        if (tokenMatch) return tokenMatch;
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
 * Parses handwritten/printed text lines from a milk slip, multi-farmer register page,
 * or multi-date morning/evening farmer passbook into ScannedSlipRawRow items.
 */
export function parseMilkSlipTextToRows(
  rawText: string,
  defaultDate?: string,
  defaultShift?: ShiftType
): ScannedSlipRawRow[] {
  if (!rawText || !rawText.trim()) return [];
  const asciiText = convertDevanagariDigitsToAscii(rawText);
  const rawLines = asciiText
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter(Boolean);

  const results: ScannedSlipRawRow[] = [];

  const normalizeFat = (v: number): number => {
    if (v >= 25 && v <= 99 && Number.isInteger(v)) return round2(v / 10);
    return round2(v);
  };
  const normalizeSnf = (v: number): number => {
    if (v >= 70 && v <= 105 && Number.isInteger(v)) return round2(v / 10);
    return round2(v);
  };
  const normalizeLiters = (v: number): number => {
    if (v >= 1000 && v <= 9999 && Number.isInteger(v)) return round3(v / 1000);
    return round3(v);
  };

  // Sticky context for multi-row passbook / register pages
  let stickyFarmerName: string | undefined;
  let stickyFarmerCode: string | undefined;
  let stickyDate: string | undefined = undefined;
  let stickyShift: ShiftType | undefined = defaultShift;
  let hasExplicitFarmerHeader = false;

  // Helper to extract date token from a line and return { dateStr, remainingLine }
  const extractDateFromLine = (
    inputLine: string
  ): { dateStr?: string; remainingLine: string } => {
    let working = inputLine;
    let foundDate: string | undefined;

    // 1. YYYY-MM-DD or YYYY/MM/DD
    const ymd = working.match(/\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/);
    if (ymd) {
      foundDate = ymd[1];
      working = working.replace(ymd[0], ' ');
      return { dateStr: foundDate, remainingLine: working };
    }

    // 2. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY or DD/MM/YY
    const dmy = working.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/);
    if (dmy) {
      foundDate = dmy[1];
      working = working.replace(dmy[0], ' ');
      return { dateStr: foundDate, remainingLine: working };
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
        return { dateStr: foundDate, remainingLine: working };
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
        return { dateStr: foundDate, remainingLine: working };
      }
    }

    return { dateStr: undefined, remainingLine: working };
  };

  // Expand dual-shift lines (where a single line has both Morning and Evening entries for a date)
  const expandedSegments: {
    text: string;
    explicitDate?: string;
    lineDate?: string;
    forcedShift?: ShiftType;
  }[] = [];

  for (const rawLine of rawLines) {
    const { dateStr, remainingLine } = extractDateFromLine(rawLine);
    if (dateStr) {
      stickyDate = dateStr;
    }
    const effectiveLineDate = dateStr || stickyDate;

    // Check if the line has both Morning and Evening segments on the same row:
    // e.g. "रामलाल 21/10/2026 सुबह 5.5 4.5 8.5 शाम 6.2 4.8 8.6"
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
      });
      expandedSegments.push({
        text: `${prefix} ${eveBody}`.trim(),
        explicitDate: dateStr,
        lineDate: effectiveLineDate,
        forcedShift: 'evening',
      });
    } else {
      expandedSegments.push({
        text: remainingLine.trim(),
        explicitDate: dateStr,
        lineDate: effectiveLineDate,
      });
    }
  }

  // Pre-scan expandedSegments to detect if this is a multi-date passbook page
  // (e.g. a single farmer's 10-11 entries from 21 to 31 date, or 1-10 / 11-20)
  let dayPrefixedRowCount = 0;
  const seenDayPrefixes = new Set<number>();
  for (const seg of expandedSegments) {
    const toks = seg.text.split(/[\s,|/:-]+/).filter(Boolean);
    const nums: number[] = [];
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
    if (!line) continue;

    // Detect shift on this segment
    let lineShift: ShiftType | undefined = seg.forcedShift;
    if (!lineShift) {
      if (
        /(?:^|\s|[(:,-])(सुबह|सवेरे|सवेरा|प्रातः|प्रात|मॉर्निंग|morning|subah|am)(?:$|\s|[):,-])/i.test(
          line
        )
      ) {
        lineShift = 'morning';
      } else if (
        /(?:^|\s|[(:,-])(शाम|सांझ|सायं|इवनिंग|evening|sham|shaam|pm)(?:$|\s|[):,-])/i.test(
          line
        )
      ) {
        lineShift = 'evening';
      }
    }
    if (lineShift) {
      stickyShift = lineShift;
    }
    const effectiveShift = lineShift || stickyShift;

    // Extract labeled values first if present
    const fatMatch = line.match(/(?:fat|फैट|फेट|f)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i);
    const snfMatch = line.match(/(?:snf|एसएनएफ|डिग्री|s|clr)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i);
    const litMatch = line.match(
      /(?:liters?|ltr|qty|मात्रा|लीटर|वजन|दूध|l|wt)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i
    );
    const rateMatch = line.match(/(?:rate|रेट|दर|भाव)\s*[:=-]?\s*(\d+(?:\.\d+)?)/i);
    const codeMatch = line.match(/(?:id|code|कोड|क्र\.?|no)\s*[:=-]?\s*([A-Za-z0-9]+)/i);
    const nameLabelMatch = line.match(
      /(?:किसान(?:\s*का\s*नाम)?|नाम|farmer(?:\s*name)?|name)\s*[:=-]\s*([^\d,;:|/]+)/i
    );

    if (fatMatch && litMatch) {
      const fat = normalizeFat(Number(fatMatch[1]));
      const snf = snfMatch ? normalizeSnf(Number(snfMatch[1])) : 8.5;
      const liters = normalizeLiters(Number(litMatch[1]));
      const rate = rateMatch ? round2(Number(rateMatch[1])) : undefined;
      const cleanedName = cleanScannedFarmerName(
        nameLabelMatch ? nameLabelMatch[1] : line.replace(/(?:fat|फैट|फेट|snf|एसएनएफ|डिग्री|clr|liters?|ltr|qty|मात्रा|लीटर|वजन|दूध|rate|रेट|दर|भाव|id|code|कोड|क्र\.?|no)\s*[:=-]?\s*[A-Za-z0-9.]+/gi, ' ')
      );
      const rowCode = codeMatch ? codeMatch[1] : undefined;
      if (cleanedName) stickyFarmerName = cleanedName;
      if (rowCode) stickyFarmerCode = rowCode;

      if (fat > 0 && snf > 0 && liters > 0) {
        results.push({
          farmerCode: rowCode || stickyFarmerCode,
          farmerName: cleanedName || stickyFarmerName,
          date: seg.explicitDate || stickyDate || defaultDate,
          shift: effectiveShift,
          liters,
          fat,
          snf,
          rate,
        });
        continue;
      }
    }

    // Otherwise extract all numbers and words from the line
    const tokens = line.split(/[\s,|/:-]+/).filter(Boolean);
    const numbers: number[] = [];
    const textWords: string[] = [];

    for (const tok of tokens) {
      const cleanedTok = tok.replace(/[L₹lkgKGलीटर()[\]]/g, '');
      const cleanedNum = cleanedTok.replace(/[^0-9.]/g, '');
      const numVal = Number(cleanedNum);
      if (
        cleanedNum !== '' &&
        Number.isFinite(numVal) &&
        numVal > 0 &&
        /^[0-9]+(?:\.[0-9]+)?$/.test(cleanedTok)
      ) {
        numbers.push(numVal);
      } else {
        textWords.push(tok);
      }
    }

    const lineFarmerName = cleanScannedFarmerName(textWords.join(' '));

    // If this line has fewer than 2 numbers, it may be a header line (e.g., "किसान: रामलाल गुर्जर (101)" or "दिनांक 21/10/2026")
    if (numbers.length < 2) {
      if (lineFarmerName) {
        stickyFarmerName = lineFarmerName;
        hasExplicitFarmerHeader = true;
      }
      if (numbers.length === 1 && Number.isInteger(numbers[0])) {
        if (lineFarmerName || codeMatch || /[()]/.test(line) || numbers[0] > 31) {
          stickyFarmerCode = String(numbers[0]);
          hasExplicitFarmerHeader = true;
        } else if (numbers[0] >= 1 && numbers[0] <= 31 && !seg.explicitDate) {
          stickyDate = String(numbers[0]);
        } else {
          stickyFarmerCode = String(numbers[0]);
          hasExplicitFarmerHeader = true;
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
      numbers[0] <= 31
    ) {
      const mLit = normalizeLiters(numbers[1]);
      const mFat = normalizeFat(numbers[2]);
      const mSnf = normalizeSnf(numbers[3]);
      const eLit = normalizeLiters(numbers[4]);
      const eFat = normalizeFat(numbers[5]);
      const eSnf = normalizeSnf(numbers[6]);
      if (
        mFat >= 2.5 &&
        mFat <= 11.0 &&
        mSnf >= 7.0 &&
        mSnf <= 10.5 &&
        eFat >= 2.5 &&
        eFat <= 11.0 &&
        eSnf >= 7.0 &&
        eSnf <= 10.5
      ) {
        const dayStr = String(numbers[0]);
        stickyDate = dayStr;
        const resolvedName = lineFarmerName || stickyFarmerName;
        const resolvedCode = (codeMatch ? codeMatch[1] : undefined) || stickyFarmerCode;
        results.push({
          farmerCode: resolvedCode,
          farmerName: resolvedName,
          date: dayStr,
          shift: 'morning',
          liters: mLit,
          fat: mFat,
          snf: mSnf,
        });
        results.push({
          farmerCode: resolvedCode,
          farmerName: resolvedName,
          date: dayStr,
          shift: 'evening',
          liters: eLit,
          fat: eFat,
          snf: eSnf,
        });
        continue;
      }
    }

    if (numbers.length >= 3) {
      let farmerCode: string | undefined = codeMatch ? codeMatch[1] : undefined;
      let nums = [...numbers];

      // If 4+ numbers and first is an integer:
      // Check if it's a day-of-month (1..31) in a passbook (e.g. 21..31) or a farmer code
      if (nums.length >= 4 && Number.isInteger(nums[0])) {
        if (
          !rowDate &&
          nums[0] >= 1 &&
          nums[0] <= 31 &&
          !codeMatch &&
          (hasExplicitFarmerHeader || isPassbookDateSequence || lineFarmerName)
        ) {
          rowDate = String(nums[0]);
          stickyDate = rowDate;
          nums = nums.slice(1);
        } else {
          farmerCode = String(nums[0]);
          nums = nums.slice(1);
        }
      } else if (nums.length === 3 && Number.isInteger(nums[0])) {
        // Check if nums[0] is either a 3-digit farmer code (100..999) OR a day-of-month/code followed by (Liters, FAT) without SNF
        const c1 = normalizeFat(nums[1]);
        const c2 = normalizeFat(nums[2]);
        const hasSnf =
          (nums[1] >= 7.5 && nums[1] <= 10.2) || (nums[2] >= 7.5 && nums[2] <= 10.2);

        if (
          !rowDate &&
          nums[0] >= 1 &&
          nums[0] <= 31 &&
          !codeMatch &&
          (hasExplicitFarmerHeader || isPassbookDateSequence || Boolean(lineShift)) &&
          !hasSnf &&
          ((c1 >= 2.5 && c1 <= 11.0) || (c2 >= 2.5 && c2 <= 11.0))
        ) {
          rowDate = String(nums[0]);
          stickyDate = rowDate;
          const isSecondFat = c2 >= 2.5 && c2 <= 11.0;
          const fat = isSecondFat ? c2 : c1;
          const liters = isSecondFat ? normalizeLiters(nums[1]) : normalizeLiters(nums[2]);
          if (fat > 0 && liters > 0) {
            const resolvedName = lineFarmerName || stickyFarmerName;
            const resolvedCode = farmerCode || stickyFarmerCode;
            results.push({
              farmerCode: resolvedCode,
              farmerName: resolvedName,
              date: rowDate || stickyDate || defaultDate,
              shift: effectiveShift,
              liters,
              fat,
              snf: 8.5,
            });
            continue;
          }
        } else if (
          nums[0] >= 100 &&
          nums[0] <= 999 &&
          !hasSnf &&
          ((c1 >= 2.5 && c1 <= 11.0) || (c2 >= 2.5 && c2 <= 11.0))
        ) {
          // e.g. "101 5.5 4.5" -> Farmer Code 101, Liters 5.5, FAT 4.5 (default SNF 8.5)
          farmerCode = String(nums[0]);
          const isSecondFat = c2 >= 2.5 && c2 <= 11.0;
          const fat = isSecondFat ? c2 : c1;
          const liters = isSecondFat ? normalizeLiters(nums[1]) : normalizeLiters(nums[2]);
          if (fat > 0 && liters > 0) {
            if (lineFarmerName) stickyFarmerName = lineFarmerName;
            stickyFarmerCode = farmerCode;
            results.push({
              farmerCode,
              farmerName: lineFarmerName || (hasExplicitFarmerHeader ? stickyFarmerName : undefined),
              date: rowDate || stickyDate || defaultDate,
              shift: effectiveShift,
              liters,
              fat,
              snf: 8.5,
            });
            continue;
          }
        }
      }

      const isOneDecimal = (val: number) =>
        Math.abs(val * 10 - Math.round(val * 10)) < 0.001;

      const converted = nums.map((n) => ({
        raw: n,
        asFat: normalizeFat(n),
        asSnf: normalizeSnf(n),
        asLiters: normalizeLiters(n),
      }));

      let fatIdx = -1;
      let snfIdx = -1;

      const isValidFat = (v: number) => v >= 2.5 && v <= 11.0;
      const isValidSnf = (v: number) => v >= 7.0 && v <= 10.5;

      // Check standard [Liters, FAT, SNF] pattern first (where index 1 is FAT and index 2 is SNF, with FAT <= SNF)
      if (
        converted.length >= 3 &&
        isValidFat(converted[1].asFat) &&
        isValidSnf(converted[2].asSnf) &&
        isOneDecimal(converted[2].asSnf) &&
        converted[1].asFat <= converted[2].asSnf &&
        !(
          converted[0].asFat >= 2.5 &&
          converted[0].asFat < converted[1].asSnf &&
          isValidSnf(converted[1].asSnf) &&
          converted[2].raw > 10.5
        )
      ) {
        fatIdx = 1;
        snfIdx = 2;
      } else if (
        converted.length >= 3 &&
        isValidFat(converted[0].asFat) &&
        isValidSnf(converted[1].asSnf) &&
        isOneDecimal(converted[1].asSnf) &&
        converted[0].asFat <= converted[1].asSnf
      ) {
        // Standard [FAT, SNF, Liters] pattern
        fatIdx = 0;
        snfIdx = 1;
      } else {
        snfIdx = converted.findIndex(
          (c) => isValidSnf(c.asSnf) && isOneDecimal(c.asSnf)
        );
        if (snfIdx === -1) {
          snfIdx = converted.findIndex((c) => isValidSnf(c.asSnf));
        }

        if (
          snfIdx > 0 &&
          isValidFat(converted[snfIdx - 1].asFat) &&
          isOneDecimal(converted[snfIdx - 1].asFat)
        ) {
          fatIdx = snfIdx - 1;
        }
        if (fatIdx === -1) {
          fatIdx = converted.findIndex(
            (c, idx) =>
              idx !== snfIdx && isValidFat(c.asFat) && isOneDecimal(c.asFat)
          );
        }
        if (fatIdx === -1) {
          fatIdx = converted.findIndex(
            (c, idx) => idx !== snfIdx && isValidFat(c.asFat)
          );
        }
      }

      if (snfIdx === -1) snfIdx = 1;
      if (fatIdx === -1) fatIdx = 0;

      const litIdx = converted.findIndex((_, idx) => idx !== snfIdx && idx !== fatIdx);
      if (litIdx !== -1) {
        const fat = converted[fatIdx].asFat;
        const snf = converted[snfIdx].asSnf;
        const liters = converted[litIdx].asLiters;
        const remainingIdx = converted.findIndex(
          (_, idx) => idx !== snfIdx && idx !== fatIdx && idx !== litIdx
        );
        const rate =
          remainingIdx !== -1 && converted[remainingIdx].raw >= 15
            ? round2(converted[remainingIdx].raw)
            : undefined;

        if (fat > 0 && snf > 0 && liters > 0) {
          const resolvedName =
            lineFarmerName || (!farmerCode ? stickyFarmerName : undefined);
          const resolvedCode =
            farmerCode || (!lineFarmerName ? stickyFarmerCode : undefined);
          if (lineFarmerName) stickyFarmerName = lineFarmerName;
          if (farmerCode) stickyFarmerCode = farmerCode;

          results.push({
            farmerCode: resolvedCode,
            farmerName: resolvedName,
            date: rowDate || stickyDate || defaultDate,
            shift: effectiveShift,
            liters,
            fat,
            snf,
            rate,
          });
        }
      }
    } else if (numbers.length === 2) {
      // 2 numbers on a line: e.g. "5.5 4.5" or "रामलाल 5.5 4.5" (Liters + FAT, default SNF 8.5)
      const n0Fat = normalizeFat(numbers[0]);
      const n1Fat = normalizeFat(numbers[1]);
      let fat = 4.5;
      let liters = 1;
      if (n1Fat >= 2.5 && n1Fat <= 11.0) {
        fat = n1Fat;
        liters = normalizeLiters(numbers[0]);
      } else if (n0Fat >= 2.5 && n0Fat <= 11.0) {
        fat = n0Fat;
        liters = normalizeLiters(numbers[1]);
      } else {
        liters = normalizeLiters(numbers[0]);
        fat = n1Fat;
      }
      if (fat > 0 && liters > 0) {
        const rowCode = codeMatch ? codeMatch[1] : undefined;
        const resolvedName = lineFarmerName || (!rowCode ? stickyFarmerName : undefined);
        const resolvedCode = rowCode || (!lineFarmerName ? stickyFarmerCode : undefined);
        if (lineFarmerName) stickyFarmerName = lineFarmerName;
        if (rowCode) stickyFarmerCode = rowCode;

        results.push({
          farmerCode: resolvedCode,
          farmerName: resolvedName,
          date: rowDate || stickyDate || defaultDate,
          shift: effectiveShift,
          liters,
          fat,
          snf: 8.5,
        });
      }
    }
  }

  return results;
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
  statusHi: string;
  statusEn: string;
}

/**
 * Matches scanned slip rows to registered farmers (strictly matching by Name FIRST, then Code SECOND),
 * resolves per-row Date and Morning/Evening Shift (for multi-date / multi-shift passbook photos),
 * looks up rate chart (or nearest/standard fallback rate),
 * truncates totalAmount to a whole integer (e.g., 253.85 -> 253),
 * enforces max 2 entries per farmer per shift (1 Cow + 1 Buffalo) and blocks duplicate same-animal entries in the same date+shift,
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

  // Detect if this is a single-farmer multi-row passbook batch (5+ rows, e.g. 10-11 rows for 21-31 date)
  // where individual row dates were not extracted by OCR
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
      rawFat >= 25 && rawFat <= 99 && Number.isInteger(rawFat)
        ? round2(rawFat / 10)
        : round2(rawFat);
    const snf =
      rawSnf >= 70 && rawSnf <= 105 && Number.isInteger(rawSnf)
        ? round2(rawSnf / 10)
        : rawSnf > 0
        ? round2(rawSnf)
        : 8.5;
    const liters =
      rawLiters >= 1000 && rawLiters <= 9999 && Number.isInteger(rawLiters)
        ? round3(rawLiters / 1000)
        : round3(rawLiters);

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
    // 1. Farmer Name match FIRST ("यदि फोटो में किसान का नाम मैच हो तो नाम से मिलान करके एंट्री सेव करे")
    // 2. Farmer Code match SECOND ("यदि नाम नहीं हो तो फिर कोड से मिलान कर एंट्री सेव करे")
    let matchedFarmer = matchFarmerByNameThenCode(
      allFarmers,
      cleanedRowName,
      cleanedRowCode
    );

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

    // 3. If row has no farmer name/code of its own (e.g. subsequent date/shift row on a single farmer's card),
    //    reuse the farmer matched on the previous row of the same photo/slip
    if (!matchedFarmer && !cleanedRowName && !cleanedRowCode && carryForwardFarmer) {
      matchedFarmer = carryForwardFarmer;
    }

    // 4. If row has an explicit farmerName or farmerCode that doesn't exist in allFarmers yet:
    //    In multi-farmer slips or when no farmers exist (or no fallbackFarmerId), auto-create the farmer
    //    so multi-farmer pages never merge distinct farmers into one.
    if (!matchedFarmer && (cleanedRowName || cleanedRowCode)) {
      if (allFarmers.length === 0 || scannedRows.length > 1 || !fallbackFarmerId) {
        const existingCodes = new Set(allFarmers.map((f) => String(f.code).trim()));
        let newCode = cleanedRowCode || String(101 + allFarmers.length);
        if (!cleanedRowCode && existingCodes.has(newCode)) {
          newCode = String(101 + allFarmers.length + i);
        }
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
    }

    // 5. Fallback to selected farmer in form or first active farmer
    if (!matchedFarmer && fallbackFarmerId) {
      matchedFarmer = allFarmers.find((f) => f.id === fallbackFarmerId);
    }
    if (!matchedFarmer && carryForwardFarmer) {
      matchedFarmer = carryForwardFarmer;
    }
    if (!matchedFarmer && activeFarmers.length > 0) {
      matchedFarmer = activeFarmers[0];
    }
    if (!matchedFarmer && allFarmers.length > 0) {
      matchedFarmer = allFarmers[0];
    }
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

    const milkType = classifyMilkType(fat);
    const chart = rateCharts[milkType] || rateCharts.cow || rateCharts.buffalo;
    const exactLookup = lookupRateFromChart(rateCharts[milkType], fat, snf);

    let rate: number | null = null;
    if (exactLookup.found && exactLookup.rate !== null) {
      rate = exactLookup.rate;
    } else if (row.rate && Number.isFinite(Number(row.rate)) && Number(row.rate) > 0) {
      rate = round2(Number(row.rate));
    } else {
      const nearest = lookupNearestRateFromChart(chart, fat, snf);
      if (nearest !== null && nearest > 0) {
        rate = nearest;
      } else {
        // Standard dairy fallback rate so photo auto-entry works even before rate chart import
        rate =
          milkType === 'buffalo'
            ? round2(Math.max(25, fat * 7.5 + (snf - 8.5) * 2.0))
            : round2(Math.max(22, fat * 6.5 + (snf - 8.5) * 1.8));
      }
    }

    // Whole-integer truncation for farmer milk purchase: 253.85 -> 253
    const totalAmount = truncatePurchaseAmount(liters * rate);
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 8);

    const candidateEntry: MilkCollectionEntry = {
      id: `col_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
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
      notes: 'फोटो/कैमरा से प्रिव्यू के बाद सेव',
      createdAt: now.toISOString(),
    };

    const animalHi = milkType === 'cow' ? 'गाय' : 'भैंस';
    const animalEn = milkType === 'cow' ? 'Cow' : 'Buffalo';
    const existingCheck = canSaveFarmerShiftMilkEntry(existingCollections, candidateEntry);
    const batchCheck = canSaveFarmerShiftMilkEntry(savedEntries, candidateEntry);

    if (!existingCheck.allowed) {
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
        statusHi: `फोटो में दोबारा (${animalHi}) — सेव नहीं होगी`,
        statusEn: `Duplicate in Photo (${animalEn}) — Will Not Save`,
      });
    } else {
      savedEntries.push(candidateEntry);
      previewItems.push({
        entry: candidateEntry,
        isDuplicate: false,
        statusHi: `सेव के लिए तैयार (${animalHi})`,
        statusEn: `Ready to Save (${animalEn})`,
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


