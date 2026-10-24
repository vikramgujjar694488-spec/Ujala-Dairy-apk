import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMilkType,
  lookupRateFromChart,
  calculateCollectionSummary,
  calculateShiftAttendance,
  calculateReconciliation,
  calculateFarmerLedger,
  generateTenDayBillData,
  parseExcelGridToRateChart,
  formatAutoDecimalFatSnf,
  formatSmartMilkQuantity,
  combineWholeAndDecimalLiters,
  parseExcelWithMode,
} from './dairyCalculations';
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
