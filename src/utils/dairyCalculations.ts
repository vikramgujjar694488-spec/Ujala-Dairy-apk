import {
  AdvancePaymentEntry,
  CattleFeedEntry,
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
    const amt = Number(e.totalAmount) || 0;
    const ded = Number(e.deduction) || 0;
    const net = Number(e.netPayable) || 0;

    if (e.farmerId) farmerSet.add(e.farmerId);
    totalLiters += l;
    totalAmount += amt;
    totalDeductions += ded;
    totalNetPayable += net;
    weightedFatSum += l * f;
    weightedSnfSum += l * s;
  }

  totalLiters = round3(totalLiters);
  totalAmount = round2(totalAmount);
  totalDeductions = round2(totalDeductions);
  totalNetPayable = round2(totalNetPayable);

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

export function calculateShiftAttendance(
  farmers: Farmer[],
  collections: MilkCollectionEntry[],
  leaves: FarmerLeaveRecord[],
  date: string,
  shift: ShiftType
): ShiftAttendanceSummary {
  const activeFarmers = farmers.filter((f) => f.active);
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
    const isScheduledForShift =
      farmer.shiftSchedule === 'both' || farmer.shiftSchedule === shift;
    const farmerEntries = entriesByFarmer.get(farmer.id) || [];

    if (isScheduledForShift) {
      rawScheduledCount += 1;
    }

    if (farmerEntries.length > 0) {
      const totalLiters = round3(farmerEntries.reduce((s, e) => s + e.liters, 0));
      const totalAmount = round2(farmerEntries.reduce((s, e) => s + e.totalAmount, 0));
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
      const totalAmount = round2(farmerEntries.reduce((s, e) => s + e.totalAmount, 0));
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
    const delta = round2(c.totalAmount - (c.deduction || 0));
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
        milkAmount: c.totalAmount,
        advanceAmount: 0,
        feedAmount: 0,
        otherDeduction: c.deduction || 0,
        paymentAmount: 0,
      },
    });
  }

  for (const ap of farmerAdvPay) {
    const isAdv = ap.type === 'advance';
    events.push({
      sortKey: `${ap.date}_2_${ap.createdAt}_${ap.id}`,
      delta: -round2(ap.amount),
      row: {
        id: ap.id,
        date: ap.date,
        type: isAdv ? 'advance' : 'payment',
        descriptionHi: isAdv
          ? `एडवांस दिया (${ap.txnCode}) ${ap.notes ? '- ' + ap.notes : ''}`
          : `भुगतान किया (${ap.txnCode}) ${ap.notes ? '- ' + ap.notes : ''}`,
        descriptionEn: isAdv
          ? `Advance Given (${ap.txnCode}) ${ap.notes ? '- ' + ap.notes : ''}`
          : `Payment Made (${ap.txnCode}) ${ap.notes ? '- ' + ap.notes : ''}`,
        milkAmount: 0,
        advanceAmount: isAdv ? ap.amount : 0,
        feedAmount: 0,
        otherDeduction: 0,
        paymentAmount: isAdv ? 0 : ap.amount,
      },
    });
  }

  for (const cf of farmerFeed) {
    const isDeducted = cf.paymentMode === 'deduct_from_milk';
    events.push({
      sortKey: `${cf.date}_3_${cf.createdAt}_${cf.id}`,
      delta: isDeducted ? -round2(cf.totalAmount) : 0,
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
        feedAmount: isDeducted ? cf.totalAmount : 0,
        otherDeduction: 0,
        paymentAmount: 0,
      },
    });
  }

  events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const rows: FarmerLedgerRow[] = [];
  let runningBalance = round2(farmer.openingBalance || 0);

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
    runningBalance = round2(runningBalance + ev.delta);
    rows.push({
      ...ev.row,
      runningBalance,
    });
  }

  const totalAdvances = round2(
    farmerAdvPay.filter((a) => a.type === 'advance').reduce((s, a) => s + a.amount, 0)
  );
  const totalPayments = round2(
    farmerAdvPay.filter((a) => a.type === 'payment').reduce((s, a) => s + a.amount, 0)
  );
  const totalFeedDeductions = round2(
    farmerFeed
      .filter((f) => f.paymentMode === 'deduct_from_milk')
      .reduce((s, f) => s + f.totalAmount, 0)
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
    openingBalance: round2(farmer.openingBalance || 0),
    closingBalance: runningBalance,
  };
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
  const cPart = collections
    .filter((c) => c.farmerId === farmer.id && c.date <= toDate)
    .map((c) => `${c.id}:${c.liters}:${c.totalAmount}:${c.deduction}`)
    .join('|');
  const aPart = advancesAndPayments
    .filter((a) => a.farmerId === farmer.id && a.date <= toDate)
    .map((a) => `${a.id}:${a.type}:${a.amount}`)
    .join('|');
  const fPart = cattleFeed
    .filter((f) => f.farmerId === farmer.id && f.date <= toDate)
    .map((f) => `${f.id}:${f.paymentMode}:${f.totalAmount}`)
    .join('|');
  return `${farmer.openingBalance}#${cPart}#${aPart}#${fPart}`;
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

  const prevCollections = collections.filter(
    (c) => c.farmerId === farmer.id && c.date < fromDate
  );
  const prevAdvPay = advancesAndPayments.filter(
    (a) => a.farmerId === farmer.id && a.date < fromDate
  );
  const prevFeed = cattleFeed.filter(
    (f) => f.farmerId === farmer.id && f.date < fromDate && f.paymentMode === 'deduct_from_milk'
  );

  const prevMilkNet = prevCollections.reduce(
    (s, c) => s + (c.totalAmount - (c.deduction || 0)),
    0
  );
  const prevAdvAndPaymentsTotal = prevAdvPay.reduce((s, a) => s + a.amount, 0);
  const prevFeedTotal = prevFeed.reduce((s, f) => s + f.totalAmount, 0);
  const previousBalance = round2(
    (farmer.openingBalance || 0) + prevMilkNet - prevAdvAndPaymentsTotal - prevFeedTotal
  );

  const periodCollections = collections.filter(
    (c) => c.farmerId === farmer.id && c.date >= fromDate && c.date <= toDate
  );
  const morningEntries = periodCollections.filter((c) => c.shift === 'morning');
  const eveningEntries = periodCollections.filter((c) => c.shift === 'evening');

  const periodSummary = calculateCollectionSummary(periodCollections);
  const morningSummary = calculateCollectionSummary(morningEntries);
  const eveningSummary = calculateCollectionSummary(eveningEntries);

  const periodAdvances = round2(
    advancesAndPayments
      .filter(
        (a) =>
          a.farmerId === farmer.id &&
          a.type === 'advance' &&
          a.date >= fromDate &&
          a.date <= toDate
      )
      .reduce((s, a) => s + a.amount, 0)
  );

  const periodPayments = round2(
    advancesAndPayments
      .filter(
        (a) =>
          a.farmerId === farmer.id &&
          a.type === 'payment' &&
          a.date >= fromDate &&
          a.date <= toDate
      )
      .reduce((s, a) => s + a.amount, 0)
  );

  const periodFeed = round2(
    cattleFeed
      .filter(
        (f) =>
          f.farmerId === farmer.id &&
          f.paymentMode === 'deduct_from_milk' &&
          f.date >= fromDate &&
          f.date <= toDate
      )
      .reduce((s, f) => s + f.totalAmount, 0)
  );

  const netPayable = round2(
    previousBalance +
      periodSummary.totalAmount -
      periodSummary.totalDeductions -
      periodAdvances -
      periodFeed -
      periodPayments
  );

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
