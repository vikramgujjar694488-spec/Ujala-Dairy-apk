import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMilkType,
  lookupRateFromChart,
  calculateCollectionSummary,
  calculateSaleSummary,
  calculateShiftAttendance,
  calculateReconciliation,
  calculateFarmerLedger,
  generateTenDayBillData,
  parseExcelGridToRateChart,
  formatAutoDecimalFatSnf,
  formatSmartMilkQuantity,
  combineWholeAndDecimalLiters,
  parseExcelWithMode,
  calculatePureProfitLoss,
  truncatePurchaseAmount,
  formatWholeCurrency,
  parseMilkSlipTextToRows,
  buildCollectionEntriesFromScannedSlip,
  generateTenDaySaleBillData,
  normalizeFarmerShiftSchedule,
  isFarmerScheduledForShift,
  matchFarmerByNameThenCode,
  normalizeScannedDate,
  normalizeScannedShift,
  canSaveFarmerShiftMilkEntry,
  getCycleFromDate,
  getCycleLabelHi,
  getCycleLabelEn,
  formatDateDMY,
  formatMonthYear,
} from './dairyCalculations';
import {
  createInitialEmptyState,
  getCurrentShiftByHour,
  getTodayDateString,
  mergeDairyStates,
  validateBackupJson,
} from './storage';
import {
  Farmer,
  MilkCollectionEntry,
  FarmerLeaveRecord,
  WholesaleSaleEntry,
  AdvancePaymentEntry,
  CattleFeedEntry,
  ExpenseEntry,
} from '../types/dairy';

test('TEST 1 & TEST 2: Cow vs Buffalo milk classification by FAT threshold 5.0', () => {
  assert.equal(classifyMilkType(4.0), 'cow');
  assert.equal(classifyMilkType(5.0), 'cow'); // 5.0 inclusive is Cow
  assert.equal(classifyMilkType(5.1), 'buffalo'); // > 5.0 is Buffalo
  assert.equal(classifyMilkType(6.5), 'buffalo');
});

test('UPDATE TEST 2 & TEST 3: Auto-Decimal System for FAT (51 -> 5.1) and SNF (85 -> 8.5) with Backspace support', () => {
  // Typing "5" then "1" in FAT -> "5.1" and completed: true
  const step1 = formatAutoDecimalFatSnf('5', '');
  assert.equal(step1.value, '5');
  assert.equal(step1.completed, false);

  const step2 = formatAutoDecimalFatSnf('51', '5');
  assert.equal(step2.value, '5.1');
  assert.equal(step2.completed, true);

  // Typing "50" -> "5.0"
  const fat50 = formatAutoDecimalFatSnf('50', '5');
  assert.equal(fat50.value, '5.0');
  assert.equal(fat50.completed, true);

  // Typing "85" in SNF -> "8.5" and completed: true
  const snf85 = formatAutoDecimalFatSnf('85', '8');
  assert.equal(snf85.value, '8.5');
  assert.equal(snf85.completed, true);

  // Typing "86" in SNF -> "8.6"
  const snf86 = formatAutoDecimalFatSnf('86', '8');
  assert.equal(snf86.value, '8.6');
  assert.equal(snf86.completed, true);

  // Backspace from "5.1" -> "5." -> cleanly becomes "5"
  const afterBackspace = formatAutoDecimalFatSnf('5.', '5.1');
  assert.equal(afterBackspace.value, '5');
  assert.equal(afterBackspace.completed, false);
});

test('UPDATE TEST 4: Smart Auto-Entry for Milk Quantity (5 then 258 -> 5.258)', () => {
  const q1 = formatSmartMilkQuantity('5', '');
  assert.equal(q1.value, '5');
  assert.equal(q1.completedThreeDecimals, false);

  const q2 = formatSmartMilkQuantity('52', '5');
  assert.equal(q2.value, '5.2');
  assert.equal(q2.completedThreeDecimals, false);

  const q3 = formatSmartMilkQuantity('5.25', '5.2');
  assert.equal(q3.value, '5.25');
  assert.equal(q3.completedThreeDecimals, false);

  const q4 = formatSmartMilkQuantity('5.258', '5.25');
  assert.equal(q4.value, '5.258');
  assert.equal(q4.completedThreeDecimals, true);

  // Also direct paste/typing "5258" -> "5.258"
  const direct = formatSmartMilkQuantity('5258', '');
  assert.equal(direct.value, '5.258');
  assert.equal(direct.completedThreeDecimals, true);

  // Combine whole and decimal helper
  const combined = combineWholeAndDecimalLiters('5', '258');
  assert.equal(combined.formatted, '5.258');
  assert.equal(combined.numeric, 5.258);
  assert.equal(combined.completedThreeDecimals, true);
});

test('UPDATE TEST 9, 10, 11, 12, 13, 14: 3-Option Excel Rate Chart Import (Auto-Detect, Manual Columns, Format A, Format B, Format C, Duplicate warning)', () => {
  // Format A: FAT first, SNF second, Rate third
  const formatAGrid = [
    ['FAT', 'SNF', 'Rate'],
    [4.0, 8.5, 34.0],
    [4.5, 8.5, 36.5],
    [5.0, 8.5, 40.0],
  ];
  const resA = parseExcelWithMode(formatAGrid, 'cow', 'formatA.xlsx', 'Sheet1', 'format_a');
  assert.equal(resA.errors.length, 0);
  assert.ok(resA.chart);
  assert.equal(lookupRateFromChart(resA.chart, 4.5, 8.5).rate, 36.5);

  // Format B: SNF first, FAT second, Rate third
  const formatBGrid = [
    ['SNF', 'FAT', 'Rate'],
    [8.5, 5.1, 46.5],
    [8.5, 6.0, 52.0],
    [9.0, 6.5, 56.0],
  ];
  const resB = parseExcelWithMode(formatBGrid, 'buffalo', 'formatB.xlsx', 'Sheet1', 'format_b');
  assert.equal(resB.errors.length, 0);
  assert.ok(resB.chart);
  assert.equal(lookupRateFromChart(resB.chart, 5.1, 8.5).rate, 46.5);
  assert.equal(lookupRateFromChart(resB.chart, 6.0, 8.5).rate, 52.0);

  // Option 1: Auto-Detect with Hindi Headers (एसएनएफ, फैट, रेट) in non-standard order
  const hindiAutoGrid = [
    ['एसएनएफ', 'रेट', 'फैट'],
    [8.5, 38.25, 4.8],
    [8.6, 39.5, 5.0],
  ];
  const resAuto = parseExcelWithMode(
    hindiAutoGrid,
    'cow',
    'hindi_auto.xlsx',
    'Sheet1',
    'auto_detect'
  );
  assert.equal(resAuto.errors.length, 0);
  assert.equal(resAuto.confidence, 'high');
  assert.ok(resAuto.chart);
  assert.equal(lookupRateFromChart(resAuto.chart, 4.8, 8.5).rate, 38.25);
  assert.equal(lookupRateFromChart(resAuto.chart, 5.0, 8.6).rate, 39.5);

  // Option 2 / Format C: Custom Column Mapping + Duplicate FAT-SNF and Invalid Row handling
  const customGrid = [
    ['क्र.', 'दर (Price)', 'Milk Fat', 'Solids Not Fat'],
    [1, 45.0, 5.5, 8.5],
    [2, 46.0, 5.5, 8.5], // Duplicate FAT 5.5 - SNF 8.5
    [3, 'invalid', '', 8.5], // Invalid row
  ];
  const resCustom = parseExcelWithMode(
    customGrid,
    'buffalo',
    'custom.xlsx',
    'Sheet1',
    'format_c',
    { fatCol: 2, snfCol: 3, rateCol: 1 }
  );
  assert.equal(resCustom.errors.length, 0);
  assert.equal(resCustom.totalRowsRead, 3);
  assert.equal(resCustom.validRowCount, 2);
  assert.equal(resCustom.invalidOrEmptyRowCount, 1);
  assert.equal(resCustom.duplicateCount, 1);
  assert.ok(resCustom.chart);
  assert.equal(lookupRateFromChart(resCustom.chart, 5.5, 8.5).rate, 46.0);
});

test('TEST 3, TEST 4, TEST 9, TEST 10: Excel 2D matrix grid parsing and exact Rate Chart lookup without interpolation', () => {
  const cowGrid = [
    ['SNF / FAT', '3.5', '4.0', '4.5', '5.0'],
    ['8.0', '30.00', '32.50', '35.00', '38.00'],
    ['8.5', '31.50', '34.00', '36.50', '40.00'],
  ];
  const parsed = parseExcelGridToRateChart(cowGrid, 'cow', 'cow_rates.xlsx', 'Sheet1');
  assert.equal(parsed.errors.length, 0);
  assert.ok(parsed.chart);
  assert.equal(parsed.chart.colCount, 4);
  assert.equal(parsed.chart.rowCount, 2);

  // Exact match
  const foundRes = lookupRateFromChart(parsed.chart, 4.0, 8.5);
  assert.equal(foundRes.found, true);
  assert.equal(foundRes.rate, 34.0);

  // Missing FAT/SNF must NOT interpolate or guess
  const missingRes = lookupRateFromChart(parsed.chart, 4.2, 8.3);
  assert.equal(missingRes.found, false);
  assert.equal(missingRes.rate, null);
  assert.ok(missingRes.warningHi?.includes('सटीक रेट उपलब्ध नहीं'));
});

test('TEST 6, TEST 7, TEST 8: Weighted average collection summary, distinct farmer count, and zero-liter handling', () => {
  // Empty entries -> null averages (no NaN / Infinity)
  const emptySum = calculateCollectionSummary([]);
  assert.equal(emptySum.totalLiters, 0);
  assert.equal(emptySum.distinctFarmerCount, 0);
  assert.equal(emptySum.avgFat, null);
  assert.equal(emptySum.avgSnf, null);
  assert.equal(emptySum.avgRate, null);

  const entries: MilkCollectionEntry[] = [
    {
      id: 'c1',
      date: '2026-10-23',
      time: '07:10:00',
      shift: 'morning',
      farmerId: 'f1',
      farmerName: 'रामलाल',
      farmerCode: '101',
      milkType: 'cow',
      liters: 10,
      fat: 4.0,
      snf: 8.0,
      rate: 32,
      totalAmount: 320,
      deduction: 0,
      netPayable: 320,
      notes: '',
      createdAt: '2026-10-23T07:10:00Z',
    },
    {
      id: 'c2',
      date: '2026-10-23',
      time: '07:20:00',
      shift: 'morning',
      farmerId: 'f2',
      farmerName: 'श्यामलाल',
      farmerCode: '102',
      milkType: 'buffalo',
      liters: 30,
      fat: 6.0,
      snf: 9.0,
      rate: 52,
      totalAmount: 1560,
      deduction: 60,
      netPayable: 1500,
      notes: '',
      createdAt: '2026-10-23T07:20:00Z',
    },
  ];

  const sum = calculateCollectionSummary(entries);
  assert.equal(sum.entryCount, 2);
  assert.equal(sum.distinctFarmerCount, 2);
  assert.equal(sum.totalLiters, 40);
  assert.equal(sum.totalAmount, 1880);
  // Weighted FAT = (10*4 + 30*6)/40 = 220/40 = 5.50
  assert.equal(sum.avgFat, 5.5);
  // Weighted SNF = (10*8 + 30*9)/40 = 350/40 = 8.75
  assert.equal(sum.avgSnf, 8.75);
  // Weighted Rate = 1880 / 40 = 47.00
  assert.equal(sum.avgRate, 47.0);
});

test('TEST 17 & Reconciliation: Profit/Loss never fakes profit without sales and uses proportional COGS', () => {
  const collections: MilkCollectionEntry[] = [
    {
      id: 'c1',
      date: '2026-10-23',
      time: '07:00:00',
      shift: 'morning',
      farmerId: 'f1',
      farmerName: 'रामलाल',
      farmerCode: '101',
      milkType: 'cow',
      liters: 100,
      fat: 4.5,
      snf: 8.5,
      rate: 40,
      totalAmount: 4000,
      deduction: 0,
      netPayable: 4000,
      notes: '',
      createdAt: '',
    },
  ];
  const expenses: ExpenseEntry[] = [
    {
      id: 'e1',
      date: '2026-10-23',
      shift: 'morning',
      category: 'परिवहन',
      amount: 100,
      paymentMethod: 'cash',
      description: 'Auto fare',
      createdAt: '',
    },
  ];

  const pendingRec = calculateReconciliation(collections, [], expenses);
  assert.equal(pendingRec.status, 'sale_pending');
  assert.equal(pendingRec.statusLabelHi, 'बिक्री का हिसाब बाकी');
  assert.equal(pendingRec.netProfitLoss, null);

  const sales: WholesaleSaleEntry[] = [
    {
      id: 's1',
      date: '2026-10-23',
      time: '09:00:00',
      shift: 'morning',
      buyerName: 'City Dairy',
      milkType: 'cow',
      liters: 60,
      avgFat: 4.5,
      avgSnf: 8.5,
      rate: 45,
      isManualRate: true,
      grossAmount: 2700,
      otherCharges: 0,
      netReceivable: 2700,
      notes: '',
      createdAt: '',
    },
  ];

  const calcRec = calculateReconciliation(collections, sales, expenses);
  assert.equal(calcRec.status, 'calculated');
  assert.equal(calcRec.costOfSoldMilk, 2400);
  assert.equal(calcRec.remainingStockLiters, 40);
  assert.equal(calcRec.remainingStockCostValue, 1600);
  assert.equal(calcRec.grossProfitLoss, 300);
  assert.equal(calcRec.netProfitLoss, 200);
});

test('ADDITIONAL MANDATORY TESTS 1-10: Shift-wise farmer schedule, attendance, multi-entry deduplication, and leave handling', () => {
  const farmers: Farmer[] = [
    {
      id: 'f_morn',
      code: '101',
      name: 'रामलाल',
      mobile: '9876543210',
      village: 'रामपुर',
      shiftSchedule: 'morning',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
    {
      id: 'f_eve',
      code: '102',
      name: 'मोहनलाल',
      mobile: '9876543211',
      village: 'रामपुर',
      shiftSchedule: 'evening',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
    {
      id: 'f_both',
      code: '103',
      name: 'श्यामलाल',
      mobile: '9876543212',
      village: 'रामपुर',
      shiftSchedule: 'both',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
  ];

  const collections: MilkCollectionEntry[] = [
    {
      id: 'm1',
      date: '2026-10-23',
      time: '06:30:00',
      shift: 'morning',
      farmerId: 'f_morn',
      farmerName: 'रामलाल',
      farmerCode: '101',
      milkType: 'cow',
      liters: 5.5,
      fat: 4.2,
      snf: 8.4,
      rate: 35,
      totalAmount: 192.5,
      deduction: 0,
      netPayable: 192.5,
      notes: '',
      createdAt: '',
    },
    {
      id: 'm2',
      date: '2026-10-23',
      time: '07:15:00',
      shift: 'morning',
      farmerId: 'f_morn',
      farmerName: 'रामलाल',
      farmerCode: '101',
      milkType: 'cow',
      liters: 4.5,
      fat: 4.2,
      snf: 8.4,
      rate: 35,
      totalAmount: 157.5,
      deduction: 0,
      netPayable: 157.5,
      notes: '',
      createdAt: '',
    },
  ];

  const mornAtt = calculateShiftAttendance(farmers, collections, [], '2026-10-23', 'morning');
  assert.equal(mornAtt.totalScheduledCount, 2);
  assert.equal(mornAtt.presentCount, 1);
  assert.equal(mornAtt.pendingCount, 1);
  assert.equal(mornAtt.completionPercentage, 50);
  assert.equal(mornAtt.presentFarmers[0].farmer.id, 'f_morn');
  assert.equal(mornAtt.presentFarmers[0].totalLiters, 10);
  assert.equal(mornAtt.pendingFarmers[0].id, 'f_both');
  assert.equal(mornAtt.notScheduledFarmers.length, 1);
  assert.equal(mornAtt.notScheduledFarmers[0].id, 'f_eve');

  const eveAtt = calculateShiftAttendance(farmers, collections, [], '2026-10-23', 'evening');
  assert.equal(eveAtt.totalScheduledCount, 2);
  assert.equal(eveAtt.presentCount, 0);
  assert.equal(eveAtt.pendingCount, 2);
  assert.equal(eveAtt.notScheduledFarmers[0].id, 'f_morn');

  const leaves: FarmerLeaveRecord[] = [
    { id: 'l1', date: '2026-10-23', shift: 'morning', farmerId: 'f_both', reason: 'छुट्टी' },
  ];
  const mornWithLeave = calculateShiftAttendance(
    farmers,
    collections,
    leaves,
    '2026-10-23',
    'morning'
  );
  assert.equal(mornWithLeave.pendingCount, 0);
  assert.equal(mornWithLeave.onLeaveCount, 1);
  assert.equal(mornWithLeave.completionPercentage, 100);
});

test('TEST 15 & TEST 16: Farmer Ledger and 10-Day Billing accuracy without double counting', () => {
  const farmer: Farmer = {
    id: 'f1',
    code: '101',
    name: 'रामलाल',
    mobile: '9876543210',
    village: 'रामपुर',
    shiftSchedule: 'both',
    openingBalance: 500,
    notes: '',
    active: true,
    createdAt: '2026-10-01T00:00:00Z',
  };

  const collections: MilkCollectionEntry[] = [
    {
      id: 'c1',
      date: '2026-10-05',
      time: '07:00:00',
      shift: 'morning',
      farmerId: 'f1',
      farmerName: 'रामलाल',
      farmerCode: '101',
      milkType: 'cow',
      liters: 20,
      fat: 4.5,
      snf: 8.5,
      rate: 40,
      totalAmount: 800,
      deduction: 50,
      netPayable: 750,
      notes: '',
      createdAt: '2026-10-05T07:00:00Z',
    },
  ];

  const advPay: AdvancePaymentEntry[] = [
    {
      id: 'ap1',
      txnCode: 'ADV-001',
      date: '2026-10-06',
      farmerId: 'f1',
      farmerName: 'रामलाल',
      type: 'advance',
      amount: 200,
      paymentMethod: 'cash',
      notes: '',
      createdAt: '2026-10-06T10:00:00Z',
    },
  ];

  const feed: CattleFeedEntry[] = [
    {
      id: 'cf1',
      txnCode: 'FD-001',
      date: '2026-10-07',
      farmerId: 'f1',
      farmerName: 'रामलाल',
      itemName: 'खल-चूरी बोरी',
      quantity: 1,
      unitPrice: 300,
      totalAmount: 300,
      paymentMode: 'deduct_from_milk',
      notes: '',
      createdAt: '2026-10-07T10:00:00Z',
    },
  ];

  const ledger = calculateFarmerLedger(farmer, collections, advPay, feed);
  assert.equal(ledger.closingBalance, 750);

  const bill = generateTenDayBillData(farmer, '2026-10', 1, collections, advPay, feed);
  assert.equal(bill.fromDate, '2026-10-01');
  assert.equal(bill.toDate, '2026-10-10');
  assert.equal(bill.previousBalance, 500);
  assert.equal(bill.totalMilkAmount, 800);
  assert.equal(bill.inlineDeductions, 50);
  assert.equal(bill.advancesInPeriod, 200);
  assert.equal(bill.feedDeductionsInPeriod, 300);
  assert.equal(bill.netPayable, 750);
});

test('TEST 18: Pure Profit & Loss report (Sale Amount - Purchase Amount ONLY, no expenses)', () => {
  const dummyCollections: MilkCollectionEntry[] = [
    {
      id: 'c1',
      date: '2026-10-24',
      time: '07:00:00',
      shift: 'morning',
      farmerId: 'f1',
      farmerName: 'किसान 1',
      farmerCode: '101',
      milkType: 'cow',
      liters: 100,
      fat: 4.0,
      snf: 8.5,
      rate: 40.0,
      totalAmount: 4000.0,
      deduction: 0,
      netPayable: 4000.0,
      notes: '',
      createdAt: '2026-10-24T07:00:00Z',
    },
    {
      id: 'c2',
      date: '2026-10-24',
      time: '18:00:00',
      shift: 'evening',
      farmerId: 'f2',
      farmerName: 'किसान 2',
      farmerCode: '102',
      milkType: 'buffalo',
      liters: 100,
      fat: 6.5,
      snf: 9.0,
      rate: 55.0,
      totalAmount: 5500.0,
      deduction: 0,
      netPayable: 5500.0,
      notes: '',
      createdAt: '2026-10-24T18:00:00Z',
    },
  ];

  const dummySales: WholesaleSaleEntry[] = [
    {
      id: 's1',
      date: '2026-10-24',
      time: '08:30:00',
      shift: 'morning',
      buyerName: 'राम डेयरी',
      milkType: 'cow',
      liters: 100,
      avgFat: 4.0,
      avgSnf: 8.5,
      rate: 45.0,
      isManualRate: false,
      grossAmount: 4500.0,
      otherCharges: 0,
      netReceivable: 4500.0,
      notes: '',
      createdAt: '2026-10-24T08:30:00Z',
    },
    {
      id: 's2',
      date: '2026-10-24',
      time: '19:30:00',
      shift: 'evening',
      buyerName: 'शर्मा स्वीट्स',
      milkType: 'buffalo',
      liters: 100,
      avgFat: 6.5,
      avgSnf: 9.0,
      rate: 62.0,
      isManualRate: false,
      grossAmount: 6200.0,
      otherCharges: 0,
      netReceivable: 6200.0,
      notes: '',
      createdAt: '2026-10-24T19:30:00Z',
    },
  ];

  const result = calculatePureProfitLoss(dummyCollections, dummySales);

  // Total purchased: 200 L, Total purchase amount: Rs 9500 (4000 + 5500)
  assert.equal(result.purchasedLiters, 200);
  assert.equal(result.purchaseAmount, 9500);

  // Total sold: 200 L, Total sale amount: Rs 10700 (4500 + 6200)
  assert.equal(result.soldLiters, 200);
  assert.equal(result.saleAmount, 10700);

  // Pure difference = 10700 - 9500 = +1200
  assert.equal(result.netDifference, 1200);
  assert.equal(result.isProfit, true);
  assert.equal(result.marginPerLiter, 6.0); // 1200 / 200 = 6 Rs/L margin
  assert.equal(result.litersDifference, 0);
});

test('NEW FEATURE TEST 19: Farmer purchase truncates decimals (253.85 -> 253), 10-day bills sum whole numbers only, while Sales keep decimals', () => {
  // 1. Direct truncation check: 253.85 -> 253
  assert.equal(truncatePurchaseAmount(253.85), 253);
  assert.equal(truncatePurchaseAmount(253.99), 253);
  assert.equal(formatWholeCurrency(253.85), '₹253');

  const farmer: Farmer = {
    id: 'f101',
    code: '101',
    name: 'रामलाल गुर्जर',
    mobile: '9876543210',
    village: 'रामपुरा',
    shiftSchedule: 'both',
    openingBalance: 0,
    notes: '',
    active: true,
    createdAt: '2026-10-01T00:00:00Z',
  };

  // Two entries whose raw calculation would be 253.85 each:
  // In farmer milk purchase, .85 is dropped -> 253 each -> 10-day bill total must be 253 + 253 = 506 (NOT 507.70)
  const collections: MilkCollectionEntry[] = [
    {
      id: 'c_morn',
      date: '2026-10-02',
      time: '07:00:00',
      shift: 'morning',
      farmerId: 'f101',
      farmerName: 'रामलाल गुर्जर',
      farmerCode: '101',
      milkType: 'cow',
      liters: 6.955,
      fat: 4.5,
      snf: 8.5,
      rate: 36.5,
      totalAmount: 253.85,
      deduction: 0,
      netPayable: 253.85,
      notes: '',
      createdAt: '',
    },
    {
      id: 'c_eve',
      date: '2026-10-02',
      time: '18:00:00',
      shift: 'evening',
      farmerId: 'f101',
      farmerName: 'रामलाल गुर्जर',
      farmerCode: '101',
      milkType: 'cow',
      liters: 6.955,
      fat: 4.5,
      snf: 8.5,
      rate: 36.5,
      totalAmount: 253.85,
      deduction: 0,
      netPayable: 253.85,
      notes: '',
      createdAt: '',
    },
  ];

  const colSum = calculateCollectionSummary(collections);
  assert.equal(colSum.totalAmount, 506); // 253 + 253 = 506 (no decimal addition)
  assert.equal(colSum.totalNetPayable, 506);

  const bill = generateTenDayBillData(farmer, '2026-10', 1, collections, [], []);
  assert.equal(bill.morningAmount, 253);
  assert.equal(bill.eveningAmount, 253);
  assert.equal(bill.totalMilkAmount, 506);
  assert.equal(bill.netPayable, 506);

  // Meanwhile, Wholesale Milk Sales MUST retain decimal points (253.85 + 253.85 = 507.70)
  const sales: WholesaleSaleEntry[] = [
    {
      id: 's1',
      date: '2026-10-02',
      time: '08:00:00',
      shift: 'morning',
      buyerName: 'शर्मा डेयरी',
      milkType: 'cow',
      liters: 6.955,
      avgFat: 4.5,
      avgSnf: 8.5,
      rate: 36.5,
      isManualRate: false,
      grossAmount: 253.85,
      otherCharges: 0,
      netReceivable: 253.85,
      notes: '',
      createdAt: '',
    },
    {
      id: 's2',
      date: '2026-10-02',
      time: '19:00:00',
      shift: 'evening',
      buyerName: 'शर्मा डेयरी',
      milkType: 'cow',
      liters: 6.955,
      avgFat: 4.5,
      avgSnf: 8.5,
      rate: 36.5,
      isManualRate: false,
      grossAmount: 253.85,
      otherCharges: 0,
      netReceivable: 253.85,
      notes: '',
      createdAt: '',
    },
  ];
  const saleSum = calculateSaleSummary(sales);
  assert.equal(saleSum.totalGrossAmount, 507.7);
  assert.equal(saleSum.totalNetReceivable, 507.7);
});

test('NEW FEATURE TEST 20: Camera / Written Slip OCR parser & auto-entry builder truncates purchase amount to integer', () => {
  const rawSlip = '101 6.955 4.5 8.5';
  const rows = parseMilkSlipTextToRows(rawSlip);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].farmerCode, '101');
  assert.equal(rows[0].liters, 6.955);
  assert.equal(rows[0].fat, 4.5);
  assert.equal(rows[0].snf, 8.5);

  const cowGrid = [
    ['SNF / FAT', '4.0', '4.5', '5.0'],
    ['8.5', '34.00', '36.50', '40.00'],
  ];
  const cowChart = parseExcelGridToRateChart(cowGrid, 'cow', 'cow.xlsx', 'Sheet1').chart;

  const farmers: Farmer[] = [
    {
      id: 'f101',
      code: '101',
      name: 'रामलाल गुर्जर',
      mobile: '9876543210',
      village: 'रामपुरा',
      shiftSchedule: 'both',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
  ];

  // 6.955 L * 36.50 Rs/L = 253.8575 -> round2 = 253.86 -> truncated integer = 253
  const built = buildCollectionEntriesFromScannedSlip(
    rows,
    farmers,
    { cow: cowChart, buffalo: null },
    '2026-10-24',
    'morning'
  );
  assert.equal(built.entries.length, 1);
  assert.equal(built.entries[0].farmerCode, '101');
  assert.equal(built.entries[0].rate, 36.5);
  assert.equal(built.entries[0].totalAmount, 253);
  assert.equal(built.entries[0].netPayable, 253);
});

test('NEW FEATURE TEST 21: 10-Day Wholesale Milk Sale Bill (बिक्री का 10-दिन का बिल) calculates exact decimal totals by cycle and customer', () => {
  const customers = [
    {
      id: 'cust1',
      code: 'C01',
      name: 'शर्मा डेयरी प्लांट',
      mobile: '9876543210',
      address: 'जयपुर रोड',
      defaultMilkType: 'cow' as const,
      active: true,
      createdAt: '',
    },
  ];

  const sales: WholesaleSaleEntry[] = [
    {
      id: 's_oct2_m',
      date: '2026-10-02',
      time: '08:00:00',
      shift: 'morning',
      customerId: 'cust1',
      customerCode: 'C01',
      buyerName: 'शर्मा डेयरी प्लांट',
      milkType: 'cow',
      liters: 10.5,
      avgFat: 4.5,
      avgSnf: 8.5,
      rate: 42.35,
      isManualRate: false,
      grossAmount: 444.68,
      otherCharges: 0,
      netReceivable: 444.68,
      notes: '',
      createdAt: '',
    },
    {
      id: 's_oct5_e',
      date: '2026-10-05',
      time: '19:00:00',
      shift: 'evening',
      customerId: 'cust1',
      customerCode: 'C01',
      buyerName: 'शर्मा डेयरी प्लांट',
      milkType: 'buffalo',
      liters: 15.25,
      avgFat: 6.2,
      avgSnf: 9.0,
      rate: 56.5,
      isManualRate: true,
      grossAmount: 861.63,
      otherCharges: 0,
      netReceivable: 861.63,
      notes: '',
      createdAt: '',
    },
    {
      id: 's_oct15_m',
      date: '2026-10-15',
      time: '08:00:00',
      shift: 'morning',
      customerId: 'cust1',
      customerCode: 'C01',
      buyerName: 'शर्मा डेयरी प्लांट',
      milkType: 'cow',
      liters: 20,
      avgFat: 4.5,
      avgSnf: 8.5,
      rate: 40,
      isManualRate: true,
      grossAmount: 800,
      otherCharges: 0,
      netReceivable: 800,
      notes: '',
      createdAt: '',
    },
  ];

  // Cycle 1: Oct 1 to Oct 10 for cust1 -> should include Oct 2 and Oct 5, exclude Oct 15
  const saleBillC1 = generateTenDaySaleBillData(sales, customers, {
    customerFilter: 'cust1',
    yearMonth: '2026-10',
    cycle: 1,
    dairyName: 'Ujalaa Dairy',
  });

  assert.equal(saleBillC1.fromDate, '2026-10-01');
  assert.equal(saleBillC1.toDate, '2026-10-10');
  assert.equal(saleBillC1.entries.length, 2);
  assert.equal(saleBillC1.dayWiseRows.length, 2);
  assert.equal(saleBillC1.morningSummary.totalLiters, 10.5);
  assert.equal(saleBillC1.morningSummary.totalNetReceivable, 444.68);
  assert.equal(saleBillC1.eveningSummary.totalLiters, 15.25);
  assert.equal(saleBillC1.eveningSummary.totalNetReceivable, 861.63);
  assert.equal(saleBillC1.totalSummary.totalLiters, 25.75);
  // Exact decimal sum: 444.68 + 861.63 = 1306.31
  assert.equal(saleBillC1.totalSummary.totalNetReceivable, 1306.31);
  assert.ok(saleBillC1.whatsAppMessageHi.includes('₹1306.31'));
});

test('NEW FEATURE TEST 22: Backup JSON validation & Merge/Replace Restore works even with pasted WhatsApp/Code-Fenced text', () => {
  const stateA = createInitialEmptyState();
  stateA.farmers.push({
    id: 'f1',
    code: '101',
    name: 'रामलाल',
    mobile: '9876543210',
    village: '',
    shiftSchedule: 'both',
    openingBalance: 0,
    notes: '',
    active: true,
    createdAt: '',
  });

  const stateB = createInitialEmptyState();
  stateB.farmers.push({
    id: 'f2',
    code: '102',
    name: 'मोहनलाल',
    mobile: '9876543211',
    village: '',
    shiftSchedule: 'morning',
    openingBalance: 0,
    notes: '',
    active: true,
    createdAt: '',
  });

  // Simulate user copying backup JSON inside markdown or with leading text
  const wrappedBackupText = 'यहाँ आपका बैकअप कोड है:\n```json\n' + JSON.stringify({ app: 'Ujalaa Dairy', data: stateB }) + '\n```';
  const validated = validateBackupJson(wrappedBackupText);
  assert.equal(validated.valid, true);
  assert.ok(validated.state);
  assert.equal(validated.state.farmers.length, 1);
  assert.equal(validated.state.farmers[0].name, 'मोहनलाल');

  // Merge stateA and validated.state -> both farmers preserved
  const merged = mergeDairyStates(stateA, validated.state);
  assert.equal(merged.farmers.length, 2);
});

test('NEW FEATURE TEST 23: Automatic Today Date & 12:00 PM Noon Shift Cutoff (Before 12 PM = Morning, 12 PM onwards = Evening)', () => {
  // 06:30 AM -> morning
  assert.equal(getCurrentShiftByHour(new Date(2026, 9, 25, 6, 30, 0)), 'morning');
  // 11:59 AM -> morning
  assert.equal(getCurrentShiftByHour(new Date(2026, 9, 25, 11, 59, 59)), 'morning');
  // 12:00 PM (Noon) -> evening
  assert.equal(getCurrentShiftByHour(new Date(2026, 9, 25, 12, 0, 0)), 'evening');
  // 13:30 PM -> evening
  assert.equal(getCurrentShiftByHour(new Date(2026, 9, 25, 13, 30, 0)), 'evening');
  // 18:45 PM -> evening
  assert.equal(getCurrentShiftByHour(new Date(2026, 9, 25, 18, 45, 0)), 'evening');

  // Saved state from yesterday (24th) with 'morning' shift must automatically reset to TODAY's date & current shift on load/validate
  const staleState = createInitialEmptyState();
  staleState.selectedDate = '2026-10-24';
  staleState.selectedShift = 'morning';
  const validated = validateBackupJson(JSON.stringify(staleState));
  assert.equal(validated.valid, true);
  assert.equal(validated.state?.selectedDate, getTodayDateString());
  assert.equal(validated.state?.selectedShift, getCurrentShiftByHour());
});

test('NEW FEATURE TEST 24: Farmers with Both Shifts (सुबह और शाम दोनों समय) ALWAYS appear in Pending (अभी दूध आना बाकी है) in BOTH Morning and Evening shifts and NEVER in Other (अन्य)', () => {
  assert.equal(normalizeFarmerShiftSchedule('both'), 'both');
  assert.equal(normalizeFarmerShiftSchedule('सुबह और शाम दोनों समय'), 'both');
  assert.equal(normalizeFarmerShiftSchedule('Morning & Evening'), 'both');
  assert.equal(normalizeFarmerShiftSchedule(undefined), 'both');
  assert.equal(normalizeFarmerShiftSchedule(''), 'both');
  assert.equal(normalizeFarmerShiftSchedule('morning'), 'morning');
  assert.equal(normalizeFarmerShiftSchedule('केवल सुबह'), 'morning');
  assert.equal(normalizeFarmerShiftSchedule('evening'), 'evening');
  assert.equal(normalizeFarmerShiftSchedule('केवल शाम'), 'evening');

  const farmers: Farmer[] = [
    {
      id: 'f_both_std',
      code: '101',
      name: 'रामलाल (Both)',
      mobile: '9876543210',
      village: 'रामपुर',
      shiftSchedule: 'both',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
    {
      id: 'f_both_hi',
      code: '102',
      name: 'श्यामलाल (सुबह और शाम)',
      mobile: '9876543211',
      village: 'रामपुर',
      // Simulate legacy/imported Hindi schedule string or undefined
      shiftSchedule: ('सुबह और शाम दोनों समय' as unknown) as Farmer['shiftSchedule'],
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
    {
      id: 'f_both_undef',
      code: '103',
      name: 'मोहनलाल (Default Both)',
      mobile: '9876543212',
      village: 'रामपुर',
      shiftSchedule: (undefined as unknown) as Farmer['shiftSchedule'],
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
    {
      id: 'f_morn_only',
      code: '104',
      name: 'सोहन (केवल सुबह)',
      mobile: '9876543213',
      village: 'रामपुर',
      shiftSchedule: 'morning',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
    {
      id: 'f_eve_only',
      code: '105',
      name: 'गोपाल (केवल शाम)',
      mobile: '9876543214',
      village: 'रामपुर',
      shiftSchedule: 'evening',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
  ];

  // Check isFarmerScheduledForShift
  assert.equal(isFarmerScheduledForShift(farmers[0], 'morning'), true);
  assert.equal(isFarmerScheduledForShift(farmers[0], 'evening'), true);
  assert.equal(isFarmerScheduledForShift(farmers[1], 'morning'), true);
  assert.equal(isFarmerScheduledForShift(farmers[1], 'evening'), true);
  assert.equal(isFarmerScheduledForShift(farmers[2], 'morning'), true);
  assert.equal(isFarmerScheduledForShift(farmers[2], 'evening'), true);

  // Morning attendance: All 3 both-shift farmers + 1 morning-only farmer = 4 in pendingFarmers ("अभी दूध आना बाकी है")
  // Only the evening-only farmer is in notScheduledFarmers ("अन्य")
  const mornAtt = calculateShiftAttendance(farmers, [], [], '2026-10-25', 'morning');
  assert.equal(mornAtt.totalScheduledCount, 4);
  assert.equal(mornAtt.pendingCount, 4);
  assert.deepEqual(
    mornAtt.pendingFarmers.map((f) => f.code),
    ['101', '102', '103', '104']
  );
  assert.equal(mornAtt.notScheduledFarmers.length, 1);
  assert.equal(mornAtt.notScheduledFarmers[0].code, '105');

  // Evening attendance: All 3 both-shift farmers + 1 evening-only farmer = 4 in pendingFarmers ("अभी दूध आना बाकी है")
  // Only the morning-only farmer is in notScheduledFarmers ("अन्य")
  const eveAtt = calculateShiftAttendance(farmers, [], [], '2026-10-25', 'evening');
  assert.equal(eveAtt.totalScheduledCount, 4);
  assert.equal(eveAtt.pendingCount, 4);
  assert.deepEqual(
    eveAtt.pendingFarmers.map((f) => f.code),
    ['101', '102', '103', '105']
  );
  assert.equal(eveAtt.notScheduledFarmers.length, 1);
  assert.equal(eveAtt.notScheduledFarmers[0].code, '104');
});

test('NEW FEATURE TEST 25: Photo Slip OCR parsing supports Devanagari digits, 2-number slips (Liters + FAT), nearest chart rate, and fallback rate when chart is empty', () => {
  // 1. Devanagari digits + 2 numbers only (Liters + FAT, SNF defaults to 8.5)
  const devSlip = '१०१ ६.५ ४.५';
  const rows = parseMilkSlipTextToRows(devSlip);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].farmerCode, '101');
  assert.equal(rows[0].liters, 6.5);
  assert.equal(rows[0].fat, 4.5);
  assert.equal(rows[0].snf, 8.5);

  // 2. Even if rateCharts are completely null/empty, buildCollectionEntriesFromScannedSlip auto-saves using standard dairy rate fallback and auto-creates farmer if none exist
  const builtNoChart = buildCollectionEntriesFromScannedSlip(
    rows,
    [],
    { cow: null, buffalo: null },
    '2026-10-25',
    'evening'
  );
  assert.equal(builtNoChart.entries.length, 1);
  assert.equal(builtNoChart.autoCreatedFarmers.length, 1);
  assert.equal(builtNoChart.entries[0].farmerCode, '101');
  assert.equal(builtNoChart.entries[0].liters, 6.5);
  assert.equal(builtNoChart.entries[0].fat, 4.5);
  assert.equal(builtNoChart.entries[0].snf, 8.5);
  assert.ok(builtNoChart.entries[0].rate > 0);
  assert.equal(
    builtNoChart.entries[0].totalAmount,
    Math.trunc(builtNoChart.entries[0].totalAmount)
  );
});

test('NEW FEATURE TEST 26: Multi-Farmer Photo Slip matches by Farmer Name FIRST, and if Name is absent/unmatched then matches by Farmer Code SECOND', () => {
  const farmers: Farmer[] = [
    {
      id: 'f101',
      code: '101',
      name: 'रामलाल गुर्जर',
      mobile: '9876543210',
      village: 'रामपुर',
      shiftSchedule: 'both',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
    {
      id: 'f102',
      code: '102',
      name: 'मोहन लाल',
      mobile: '9876543211',
      village: 'रामपुर',
      shiftSchedule: 'both',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
    {
      id: 'f103',
      code: '103',
      name: 'श्यामलाल',
      mobile: '9876543212',
      village: 'रामपुर',
      shiftSchedule: 'both',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
  ];

  // 1. Direct helper check: Name match takes priority over Code match when Name matches
  const matchedByNamePriority = matchFarmerByNameThenCode(farmers, 'मोहन लाल', '101');
  assert.equal(matchedByNamePriority?.id, 'f102');
  assert.equal(matchedByNamePriority?.name, 'मोहन लाल');

  // 2. When Name is absent, matches by Code
  const matchedByCodeWhenNoName = matchFarmerByNameThenCode(farmers, undefined, '103');
  assert.equal(matchedByCodeWhenNoName?.id, 'f103');

  // 3. When Name does not match any farmer, falls back to matching by Code
  const matchedByCodeWhenNameUnmatched = matchFarmerByNameThenCode(farmers, 'अंजाना नाम', '101');
  assert.equal(matchedByCodeWhenNameUnmatched?.id, 'f101');

  // 4. Multi-farmer register page in 1 photo/slip (3 different farmers on one page)
  const multiFarmerSlip = [
    'रामलाल गुर्जर 6.5 4.5 8.5',
    '102 7.25 5.2 8.8',
    'श्यामलाल 5.0 4.2 8.4',
  ].join('\n');

  const parsedRows = parseMilkSlipTextToRows(multiFarmerSlip, '2026-10-25', 'morning');
  assert.equal(parsedRows.length, 3);

  const built = buildCollectionEntriesFromScannedSlip(
    parsedRows,
    farmers,
    { cow: null, buffalo: null },
    '2026-10-25',
    'morning'
  );
  assert.equal(built.entries.length, 3);
  assert.equal(built.entries[0].farmerId, 'f101');
  assert.equal(built.entries[0].farmerName, 'रामलाल गुर्जर');
  assert.equal(built.entries[0].liters, 6.5);

  assert.equal(built.entries[1].farmerId, 'f102');
  assert.equal(built.entries[1].farmerCode, '102');
  assert.equal(built.entries[1].liters, 7.25);

  assert.equal(built.entries[2].farmerId, 'f103');
  assert.equal(built.entries[2].farmerName, 'श्यामलाल');
  assert.equal(built.entries[2].liters, 5.0);
});

test('NEW FEATURE TEST 27: Single Photo with Multiple Dates and Morning + Evening Shifts for a Farmer saves each entry with its respective Date and Shift', () => {
  assert.equal(normalizeScannedDate('21/10/2026', '2026-10-25'), '2026-10-21');
  assert.equal(normalizeScannedDate('22-10-26', '2026-10-25'), '2026-10-22');
  assert.equal(normalizeScannedDate('23/10', '2026-10-25'), '2026-10-23');
  assert.equal(normalizeScannedDate('दिनांक 24', '2026-10-25'), '2026-10-24');
  assert.equal(normalizeScannedShift('सुबह', 'evening'), 'morning');
  assert.equal(normalizeScannedShift('शाम', 'morning'), 'evening');

  const farmers: Farmer[] = [
    {
      id: 'f101',
      code: '101',
      name: 'रामलाल गुर्जर',
      mobile: '9876543210',
      village: 'रामपुर',
      shiftSchedule: 'both',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
  ];

  // Passbook page for farmer रामलाल गुर्जर with:
  // - 21/10/2026 Morning & Evening on the same line (dual-shift row)
  // - 22/10/2026 Morning & Evening on separate lines
  const passbookSlip = [
    'किसान: रामलाल गुर्जर (101)',
    '21/10/2026 सुबह 5.5 4.5 8.5 शाम 6.2 4.8 8.6',
    '22/10/2026 सुबह 5.8 4.6 8.5',
    '22/10/2026 शाम 6.4 5.1 8.7',
  ].join('\n');

  const rows = parseMilkSlipTextToRows(passbookSlip, '2026-10-25', 'morning');
  assert.equal(rows.length, 4);

  const built = buildCollectionEntriesFromScannedSlip(
    rows,
    farmers,
    { cow: null, buffalo: null },
    '2026-10-25',
    'morning'
  );

  assert.equal(built.entries.length, 4);
  // All 4 entries matched to रामलाल गुर्जर (101)
  assert.ok(built.entries.every((e) => e.farmerId === 'f101' && e.farmerCode === '101'));

  // Entry 1: 2026-10-21 Morning
  assert.equal(built.entries[0].date, '2026-10-21');
  assert.equal(built.entries[0].shift, 'morning');
  assert.equal(built.entries[0].liters, 5.5);
  assert.equal(built.entries[0].fat, 4.5);

  // Entry 2: 2026-10-21 Evening
  assert.equal(built.entries[1].date, '2026-10-21');
  assert.equal(built.entries[1].shift, 'evening');
  assert.equal(built.entries[1].liters, 6.2);
  assert.equal(built.entries[1].fat, 4.8);

  // Entry 3: 2026-10-22 Morning
  assert.equal(built.entries[2].date, '2026-10-22');
  assert.equal(built.entries[2].shift, 'morning');
  assert.equal(built.entries[2].liters, 5.8);
  assert.equal(built.entries[2].fat, 4.6);

  // Entry 4: 2026-10-22 Evening
  assert.equal(built.entries[3].date, '2026-10-22');
  assert.equal(built.entries[3].shift, 'evening');
  assert.equal(built.entries[3].liters, 6.4);
  assert.equal(built.entries[3].fat, 5.1);
});

test('NEW FEATURE TEST 28: Max 2 Milk Entries per Farmer per Shift (1 Cow + 1 Buffalo) and strict duplicate blocking by animal type', () => {
  const existing: MilkCollectionEntry[] = [
    {
      id: 'c_cow_1',
      date: '2026-10-25',
      time: '07:00:00',
      shift: 'morning',
      farmerId: 'f101',
      farmerName: 'रामलाल गुर्जर',
      farmerCode: '101',
      milkType: 'cow',
      liters: 5.0,
      fat: 4.5,
      snf: 8.5,
      rate: 36,
      totalAmount: 180,
      deduction: 0,
      netPayable: 180,
      notes: '',
      createdAt: '',
    },
  ];

  // 1. Trying to add another Cow entry in the same shift & date for f101 -> BLOCKED
  const dupCowCheck = canSaveFarmerShiftMilkEntry(existing, {
    farmerId: 'f101',
    date: '2026-10-25',
    shift: 'morning',
    milkType: 'cow',
  });
  assert.equal(dupCowCheck.allowed, false);
  assert.ok(dupCowCheck.reasonHi?.includes('गाय'));

  // 2. Trying to add a Buffalo entry in the same shift & date for f101 -> ALLOWED (1 Cow + 1 Buffalo = 2 entries)
  const buffaloCheck = canSaveFarmerShiftMilkEntry(existing, {
    farmerId: 'f101',
    date: '2026-10-25',
    shift: 'morning',
    milkType: 'buffalo',
  });
  assert.equal(buffaloCheck.allowed, true);

  // 3. Once both Cow and Buffalo exist in that shift, any 3rd entry is BLOCKED
  const withBoth: MilkCollectionEntry[] = [
    ...existing,
    {
      ...existing[0],
      id: 'c_buf_1',
      milkType: 'buffalo',
      fat: 6.0,
      rate: 52,
      totalAmount: 260,
      netPayable: 260,
    },
  ];
  const thirdCheck = canSaveFarmerShiftMilkEntry(withBoth, {
    farmerId: 'f101',
    date: '2026-10-25',
    shift: 'morning',
    milkType: 'cow',
  });
  assert.equal(thirdCheck.allowed, false);
});

test('NEW FEATURE TEST 29: Photo Milk Entry Preview Items and Duplicate Entry Blocking against existing collections', () => {
  const farmers: Farmer[] = [
    {
      id: 'f101',
      code: '101',
      name: 'रामलाल गुर्जर',
      mobile: '9876543210',
      village: 'रामपुर',
      shiftSchedule: 'both',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
    {
      id: 'f102',
      code: '102',
      name: 'मोहन लाल',
      mobile: '9876543211',
      village: 'रामपुर',
      shiftSchedule: 'both',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
  ];

  // Existing collection already has Farmer 101 Cow milk on 2026-10-25 morning
  const existingCollections: MilkCollectionEntry[] = [
    {
      id: 'existing_101_cow',
      date: '2026-10-25',
      time: '06:45:00',
      shift: 'morning',
      farmerId: 'f101',
      farmerName: 'रामलाल गुर्जर',
      farmerCode: '101',
      milkType: 'cow',
      liters: 5.0,
      fat: 4.5,
      snf: 8.5,
      rate: 37.5,
      totalAmount: 187,
      deduction: 0,
      netPayable: 187,
      notes: '',
      createdAt: '',
    },
  ];

  // Photo contains:
  // Row 1: Farmer 101 Cow milk (FAT 4.6 <= 5.0) on 2026-10-25 morning -> DUPLICATE (already exists!)
  // Row 2: Farmer 101 Buffalo milk (FAT 6.0 > 5.0) on 2026-10-25 morning -> ALLOWED (different animal in same shift)
  // Row 3: Farmer 102 Cow milk (FAT 4.4 <= 5.0) on 2026-10-25 morning -> ALLOWED
  const slipText = [
    '101 6.0 4.6 8.5',
    '101 4.0 6.0 8.8',
    '102 8.0 4.4 8.5',
  ].join('\n');

  const rows = parseMilkSlipTextToRows(slipText, '2026-10-25', 'morning');
  const result = buildCollectionEntriesFromScannedSlip(
    rows,
    farmers,
    { cow: null, buffalo: null },
    '2026-10-25',
    'morning',
    undefined,
    existingCollections
  );

  // All 3 rows appear in previewItems so user can see why Row 1 won't save
  assert.equal(result.previewItems.length, 3);
  assert.equal(result.previewItems[0].isDuplicate, true);
  assert.equal(result.previewItems[0].entry.farmerCode, '101');
  assert.equal(result.previewItems[0].entry.milkType, 'cow');

  assert.equal(result.previewItems[1].isDuplicate, false);
  assert.equal(result.previewItems[1].entry.farmerCode, '101');
  assert.equal(result.previewItems[1].entry.milkType, 'buffalo');

  assert.equal(result.previewItems[2].isDuplicate, false);
  assert.equal(result.previewItems[2].entry.farmerCode, '102');
  assert.equal(result.previewItems[2].entry.milkType, 'cow');

  // Only the 2 non-duplicate entries are in result.entries to be saved
  assert.equal(result.entries.length, 2);
  assert.equal(result.skippedDuplicates.length, 1);
  assert.equal(result.entries[0].farmerCode, '101');
  assert.equal(result.entries[0].milkType, 'buffalo');
  assert.equal(result.entries[1].farmerCode, '102');
  assert.equal(result.entries[1].milkType, 'cow');
});

test('NEW FEATURE TEST 30: 10-Day Billing Period selection in Payments and automatic underpayment/overpayment carry-forward to next period bill', () => {
  assert.equal(getCycleFromDate('2026-10-05').cycle, 1);
  assert.equal(getCycleFromDate('2026-10-15').cycle, 2);
  assert.equal(getCycleFromDate('2026-10-25').cycle, 3);
  assert.equal(getCycleLabelHi(1), '1 से 10 तारीख');
  assert.equal(getCycleLabelHi(2), '11 से 20 तारीख');
  assert.equal(getCycleLabelHi(3), '21 से महीने के अंत तक');

  const farmer: Farmer = {
    id: 'f101',
    code: '101',
    name: 'रामलाल गुर्जर',
    mobile: '9876543210',
    village: 'रामपुर',
    shiftSchedule: 'both',
    openingBalance: 0,
    notes: '',
    active: true,
    createdAt: '',
  };

  // Milk collections across Cycle 1 (1-10 Oct), Cycle 2 (11-20 Oct), Cycle 3 (21-31 Oct)
  const collections: MilkCollectionEntry[] = [
    {
      id: 'c_oct_05',
      date: '2026-10-05',
      time: '07:00:00',
      shift: 'morning',
      farmerId: 'f101',
      farmerName: 'रामलाल गुर्जर',
      farmerCode: '101',
      milkType: 'cow',
      liters: 25,
      fat: 4.5,
      snf: 8.5,
      rate: 40,
      totalAmount: 1000,
      deduction: 0,
      netPayable: 1000,
      notes: '',
      createdAt: '',
    },
    {
      id: 'c_oct_15',
      date: '2026-10-15',
      time: '07:00:00',
      shift: 'morning',
      farmerId: 'f101',
      farmerName: 'रामलाल गुर्जर',
      farmerCode: '101',
      milkType: 'cow',
      liters: 25,
      fat: 4.5,
      snf: 8.5,
      rate: 40,
      totalAmount: 1000,
      deduction: 0,
      netPayable: 1000,
      notes: '',
      createdAt: '',
    },
    {
      id: 'c_oct_25',
      date: '2026-10-25',
      time: '07:00:00',
      shift: 'morning',
      farmerId: 'f101',
      farmerName: 'रामलाल गुर्जर',
      farmerCode: '101',
      milkType: 'cow',
      liters: 25,
      fat: 4.5,
      snf: 8.5,
      rate: 40,
      totalAmount: 1000,
      deduction: 0,
      netPayable: 1000,
      notes: '',
      createdAt: '',
    },
  ];

  // Case A: Underpayment in Cycle 1 (1-10 Oct):
  // Bill for Cycle 1 is ₹1000. Farmer is paid ₹800 on 2026-10-12 but tagged for Cycle 1 (1 से 10 तारीख)!
  // Remaining ₹200 underpayment (कम भुगतान) must carry forward and ADD to Cycle 2's bill.
  // Case B: Overpayment in Cycle 2 (11-20 Oct):
  // Cycle 2 milk is ₹1000 + ₹200 previous balance = ₹1200 payable.
  // Farmer is paid ₹1500 for Cycle 2 (₹300 extra / ज्यादा भुगतान).
  // That -₹300 must carry forward and DEDUCT from Cycle 3's bill (₹1000 - ₹300 = ₹700).
  const payments: AdvancePaymentEntry[] = [
    {
      id: 'pay_c1',
      txnCode: 'PAY-C1',
      date: '2026-10-12', // Paid on 12th, but explicitly selected for Cycle 1 (1-10)!
      farmerId: 'f101',
      farmerName: 'रामलाल गुर्जर',
      type: 'payment',
      amount: 800,
      paymentMethod: 'cash',
      billingYearMonth: '2026-10',
      billingCycle: 1,
      notes: '1 से 10 तारीख का भुगतान',
      createdAt: '',
    },
    {
      id: 'pay_c2',
      txnCode: 'PAY-C2',
      date: '2026-10-21', // Paid on 21st, but explicitly selected for Cycle 2 (11-20)!
      farmerId: 'f101',
      farmerName: 'रामलाल गुर्जर',
      type: 'payment',
      amount: 1500,
      paymentMethod: 'cash',
      billingYearMonth: '2026-10',
      billingCycle: 2,
      notes: '11 से 20 तारीख का भुगतान',
      createdAt: '',
    },
  ];

  // Verify Cycle 1 (1-10 Oct) Bill:
  const bill1 = generateTenDayBillData(farmer, '2026-10', 1, collections, payments, []);
  assert.equal(bill1.totalMilkAmount, 1000);
  assert.equal(bill1.previousBalance, 0);
  assert.equal(bill1.billPayableBeforePayment, 1000);
  assert.equal(bill1.paymentsInPeriod, 800);
  assert.equal(bill1.netPayable, 200); // ₹200 कम भुगतान (short paid)

  // Verify Cycle 2 (11-20 Oct) Bill:
  const bill2 = generateTenDayBillData(farmer, '2026-10', 2, collections, payments, []);
  assert.equal(bill2.totalMilkAmount, 1000);
  assert.equal(bill2.previousBalance, 200); // +₹200 carried forward from Cycle 1
  assert.equal(bill2.billPayableBeforePayment, 1200); // ₹1000 milk + ₹200 previous short payment
  assert.equal(bill2.paymentsInPeriod, 1500); // Paid ₹1500 for Cycle 2
  assert.equal(bill2.netPayable, -300); // -₹300 ज्यादा भुगतान (excess paid)

  // Verify Cycle 3 (21-31 Oct) Bill:
  const bill3 = generateTenDayBillData(farmer, '2026-10', 3, collections, payments, []);
  assert.equal(bill3.totalMilkAmount, 1000);
  assert.equal(bill3.previousBalance, -300); // -₹300 carried forward from Cycle 2
  assert.equal(bill3.billPayableBeforePayment, 700); // ₹1000 milk - ₹300 excess payment = ₹700
  assert.equal(bill3.paymentsInPeriod, 0);
  assert.equal(bill3.netPayable, 700);
});

test('NEW FEATURE TEST 31: Single farmer 10-11 entries from 21st to 31st date (21 से 31 तारीख तक की 10-11 एंट्री) in one photo parse & save accurately across all APK/OCR formats', () => {
  const farmers: Farmer[] = [
    {
      id: 'f101',
      code: '101',
      name: 'रामलाल गुर्जर',
      mobile: '9876543210',
      village: 'रामपुर',
      shiftSchedule: 'both',
      openingBalance: 0,
      notes: '',
      active: true,
      createdAt: '',
    },
  ];

  // Format A: Passbook photo with 11 rows (21 to 31) and NO farmer header line (farmer selected in dropdown)
  const passbookNoHeader = [
    '21 5.5 4.5 8.5',
    '22 6.0 4.6 8.5',
    '23 5.8 4.4 8.5',
    '24 6.2 4.7 8.6',
    '25 5.9 4.5 8.5',
    '26 6.4 4.8 8.6',
    '27 5.7 4.5 8.5',
    '28 6.1 4.6 8.5',
    '29 6.3 4.7 8.6',
    '30 5.6 4.4 8.5',
    '31 6.5 4.8 8.6',
  ].join('\n');

  const rowsA = parseMilkSlipTextToRows(passbookNoHeader, '2026-10-25', 'morning');
  assert.equal(rowsA.length, 11);
  assert.equal(rowsA[0].date, '21');
  assert.equal(rowsA[10].date, '31');

  const builtA = buildCollectionEntriesFromScannedSlip(
    rowsA,
    farmers,
    { cow: null, buffalo: null },
    '2026-10-25',
    'morning',
    'f101',
    []
  );
  assert.equal(builtA.entries.length, 11);
  assert.equal(builtA.skippedDuplicates.length, 0);
  assert.equal(builtA.autoCreatedFarmers.length, 0);
  assert.equal(builtA.entries[0].date, '2026-10-21');
  assert.equal(builtA.entries[0].farmerCode, '101');
  assert.equal(builtA.entries[0].farmerName, 'रामलाल गुर्जर');
  assert.equal(builtA.entries[10].date, '2026-10-31');
  assert.equal(builtA.entries[10].farmerCode, '101');

  // Format B: APK OCR output where Hindi header turns into "00000: 000000 (101)" followed by 21..31 rows
  const ocrHeaderSlip = `00000: 000000 (101)\n${passbookNoHeader}`;
  const rowsB = parseMilkSlipTextToRows(ocrHeaderSlip, '2026-10-25', 'morning');
  assert.equal(rowsB.length, 11);
  assert.equal(rowsB[0].farmerCode, '101');
  assert.equal(rowsB[0].date, '21');
  assert.equal(rowsB[10].date, '31');

  const builtB = buildCollectionEntriesFromScannedSlip(
    rowsB,
    farmers,
    { cow: null, buffalo: null },
    '2026-10-25',
    'morning',
    undefined,
    []
  );
  assert.equal(builtB.entries.length, 11);
  assert.equal(builtB.entries[0].date, '2026-10-21');
  assert.equal(builtB.entries[10].date, '2026-10-31');
  assert.equal(builtB.entries[10].farmerCode, '101');

  // Format C: 11 undated rows for a single farmer (where date column 21..31 was cropped out in photo)
  const undated11Rows = Array.from({ length: 11 }, (_, idx) => ({
    liters: 5.0 + idx * 0.1,
    fat: 4.5,
    snf: 8.5,
  }));
  const builtC = buildCollectionEntriesFromScannedSlip(
    undated11Rows,
    farmers,
    { cow: null, buffalo: null },
    '2026-10-25',
    'morning',
    'f101',
    []
  );
  assert.equal(builtC.entries.length, 11);
  assert.equal(builtC.skippedDuplicates.length, 0);
  assert.equal(builtC.entries[0].date, '2026-10-21');
  assert.equal(builtC.entries[5].date, '2026-10-26');
  assert.equal(builtC.entries[10].date, '2026-10-31');
});

test('TEST 28: formatDateDMY and formatMonthYear format all dates in DD-MM-YYYY (दिन-महीना-साल)', () => {
  assert.equal(formatDateDMY('2026-10-26'), '26-10-2026');
  assert.equal(formatDateDMY('2026-01-05'), '05-01-2026');
  assert.equal(formatDateDMY('10-26'), '26-10');
  assert.equal(formatDateDMY(''), '—');
  assert.equal(formatMonthYear('2026-10'), '10-2026');
  assert.equal(getCycleLabelHi(1, '2026-10'), '1 से 10 तारीख (10-2026)');
  assert.equal(getCycleLabelHi(3, '2026-10'), '21 से महीने के अंत तक (10-2026)');
  assert.equal(getCycleLabelEn(2, '2026-10'), '11th to 20th (10-2026)');
});
