import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Edit2,
  FileText,
  MessageSquare,
  Moon,
  Package,
  Printer,
  RefreshCw,
  Sun,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Wallet,
} from 'lucide-react';
import {
  AdvancePaymentEntry,
  CattleFeedEntry,
  DairyAppState,
  Farmer,
  FarmerShiftSchedule,
  MilkType,
  PaymentMethod,
  TenDayBill,
} from '../types/dairy';
import {
  calculateCollectionSummary,
  calculateFarmerLedger,
  calculatePureProfitLoss,
  calculateSaleSummary,
  computeBillSnapshotHash,
  formatCurrency,
  formatDateDMY,
  formatMonthYear,
  formatNumber,
  formatWholeCurrency,
  generateTenDayBillData,
  getAdvancePaymentEffectiveCycle,
  getCycleFromDate,
  getCycleLabelEn,
  getCycleLabelHi,
  getTenDayCycleDates,
  normalizeFarmerShiftSchedule,
  round2,
  round3,
  truncatePurchaseAmount,
} from '../utils/dairyCalculations';
import { ConfirmDialog, WhatsAppPreviewModal } from './Modals';

export type FarmerSectionSubTab = 'farmers' | 'ledger' | 'advances' | 'feed' | 'billing';

interface FarmersAndLedgerViewProps {
  state: DairyAppState;
  initialSubTab?: FarmerSectionSubTab;
  onSaveFarmer: (farmer: Farmer, isEdit: boolean) => void;
  onDeleteFarmer: (id: string) => void;
  onSaveAdvancePayment: (entry: AdvancePaymentEntry, isEdit: boolean) => void;
  onDeleteAdvancePayment: (id: string) => void;
  onSaveCattleFeed: (entry: CattleFeedEntry, isEdit: boolean) => void;
  onDeleteCattleFeed: (id: string) => void;
  onSaveBill: (bill: TenDayBill) => void;
  onDeleteBill: (id: string) => void;
}

export const FarmersAndLedgerView: React.FC<FarmersAndLedgerViewProps> = ({
  state,
  initialSubTab = 'farmers',
  onSaveFarmer,
  onDeleteFarmer,
  onSaveAdvancePayment,
  onDeleteAdvancePayment,
  onSaveCattleFeed,
  onDeleteCattleFeed,
  onSaveBill,
  onDeleteBill,
}) => {
  const lang = state.language;
  const [subTab, setSubTab] = useState<FarmerSectionSubTab>(initialSubTab);

  // Sync if parent switches tab
  React.useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  // 1. Farmer Form State
  const [editingFarmerId, setEditingFarmerId] = useState<string | null>(null);
  const [fCode, setFCode] = useState<string>('');
  const [fName, setFName] = useState<string>('');
  const [fMobile, setFMobile] = useState<string>('');
  const [fVillage, setFVillage] = useState<string>('');
  const [fMilkType, setFMilkType] = useState<MilkType>('cow');
  const [fSchedule, setFSchedule] = useState<FarmerShiftSchedule>('both');
  const [fOpeningBal, setFOpeningBal] = useState<string>('0');
  const [fNotes, setFNotes] = useState<string>('');
  const [farmerError, setFarmerError] = useState<string | null>(null);
  const [deleteFarmerTarget, setDeleteFarmerTarget] = useState<Farmer | null>(null);

  // 2. Selected Farmer for Ledger
  const [ledgerFarmerId, setLedgerFarmerId] = useState<string>(
    state.farmers[0]?.id || ''
  );
  const [ledgerShiftFilter, setLedgerShiftFilter] = useState<'all' | 'morning' | 'evening'>('all');

  // 3. Advance / Payment Form State
  const [editingAdvId, setEditingAdvId] = useState<string | null>(null);
  const [advDate, setAdvDate] = useState<string>(state.selectedDate);
  const [advFarmerId, setAdvFarmerId] = useState<string>('');
  const [advType, setAdvType] = useState<'advance' | 'payment'>('payment');
  const [advBillingYearMonth, setAdvBillingYearMonth] = useState<string>(
    state.selectedDate.slice(0, 7)
  );
  const [advBillingCycle, setAdvBillingCycle] = useState<1 | 2 | 3>(
    getCycleFromDate(state.selectedDate).cycle
  );
  const [advTxnCode, setAdvTxnCode] = useState<string>('');
  const [advAmount, setAdvAmount] = useState<string>('');
  const [advMethod, setAdvMethod] = useState<PaymentMethod>('cash');
  const [advNotes, setAdvNotes] = useState<string>('');
  const [advError, setAdvError] = useState<string | null>(null);
  const [deleteAdvId, setDeleteAdvId] = useState<string | null>(null);

  // 4. Cattle Feed Form State
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [feedDate, setFeedDate] = useState<string>(state.selectedDate);
  const [feedFarmerId, setFeedFarmerId] = useState<string>('');
  const [feedItemName, setFeedItemName] = useState<string>('');
  const [feedQty, setFeedQty] = useState<string>('1');
  const [feedUnitPrice, setFeedUnitPrice] = useState<string>('');
  const [feedMode, setFeedMode] = useState<'deduct_from_milk' | 'cash_paid'>('deduct_from_milk');
  const [feedNotes, setFeedNotes] = useState<string>('');
  const [feedError, setFeedError] = useState<string | null>(null);
  const [deleteFeedId, setDeleteFeedId] = useState<string | null>(null);

  // 5. 10-Day Billing & Clean Reports State (Only 4 Reports: सुबह, शाम, 10-दिन सुबह-शाम, लाभ-हानि)
  const [billFarmerId, setBillFarmerId] = useState<string>(state.farmers[0]?.id || '');
  const [billYearMonth, setBillYearMonth] = useState<string>(state.selectedDate.slice(0, 7));
  const [billCycle, setBillCycle] = useState<1 | 2 | 3>(
    getCycleFromDate(state.selectedDate).cycle
  );
  const [activeBill, setActiveBill] = useState<TenDayBill | null>(null);
  const [quickBillPayAmount, setQuickBillPayAmount] = useState<string>('');
  const [quickBillPayMethod, setQuickBillPayMethod] = useState<PaymentMethod>('cash');
  const [quickBillPayNotes, setQuickBillPayNotes] = useState<string>('');
  const [activeCleanReport, setActiveCleanReport] = useState<
    'morning' | 'evening' | 'tenday' | 'profit_loss'
  >('tenday');
  const [reportSingleDate, setReportSingleDate] = useState<string>(state.selectedDate);
  const [reportFarmerFilter, setReportFarmerFilter] = useState<string>('all');

  // WhatsApp Preview Modal
  const [waModal, setWaModal] = useState<{ open: boolean; phone: string; message: string }>({
    open: false,
    phone: '',
    message: '',
  });

  const scheduleLabel = (sched: FarmerShiftSchedule) => {
    const norm = normalizeFarmerShiftSchedule(sched);
    if (norm === 'morning') return lang === 'hi' ? 'केवल सुबह' : 'Morning Only';
    if (norm === 'evening') return lang === 'hi' ? 'केवल शाम' : 'Evening Only';
    return lang === 'hi' ? 'सुबह और शाम दोनों समय' : 'Morning & Evening';
  };

  // --- Farmer Handlers ---
  const resetFarmerForm = () => {
    setEditingFarmerId(null);
    setFCode('');
    setFName('');
    setFMobile('');
    setFVillage('');
    setFMilkType('cow');
    setFSchedule('both');
    setFOpeningBal('0');
    setFNotes('');
    setFarmerError(null);
  };

  const handleEditFarmer = (f: Farmer) => {
    setEditingFarmerId(f.id);
    setFCode(f.code);
    setFName(f.name);
    setFMobile(f.mobile);
    setFVillage(f.village);
    setFMilkType(f.defaultMilkType || 'cow');
    setFSchedule(normalizeFarmerShiftSchedule(f.shiftSchedule));
    setFOpeningBal(String(f.openingBalance || 0));
    setFNotes(f.notes || '');
    setFarmerError(null);
  };

  const handleSaveFarmerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFarmerError(null);
    const code = fCode.trim();
    const name = fName.trim();
    if (!code || !name) {
      setFarmerError(
        lang === 'hi'
          ? 'कृपया किसान ID और किसान का नाम अनिवार्य रूप से भरें।'
          : 'Farmer ID and Farmer Name are required.'
      );
      return;
    }

    // Duplicate ID check
    const duplicate = state.farmers.find(
      (f) => f.code.toLowerCase() === code.toLowerCase() && f.id !== editingFarmerId
    );
    if (duplicate) {
      setFarmerError(
        lang === 'hi'
          ? `डुप्लिकेट किसान ID चेतावनी: ID "${code}" पहले से किसान "${duplicate.name}" के लिए मौजूद है!`
          : `Duplicate Farmer ID: "${code}" already exists for "${duplicate.name}"!`
      );
      return;
    }

    const existing = editingFarmerId
      ? state.farmers.find((f) => f.id === editingFarmerId)
      : undefined;

    const farmerObj: Farmer = {
      id: editingFarmerId || `farmer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      code,
      name,
      mobile: fMobile.trim(),
      village: fVillage.trim(),
      defaultMilkType: fMilkType,
      shiftSchedule: normalizeFarmerShiftSchedule(fSchedule),
      openingBalance: truncatePurchaseAmount(Number(fOpeningBal) || 0),
      notes: fNotes.trim(),
      active: existing ? existing.active !== false : true,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
    };

    onSaveFarmer(farmerObj, Boolean(editingFarmerId));
    if (!ledgerFarmerId) setLedgerFarmerId(farmerObj.id);
    if (!billFarmerId) setBillFarmerId(farmerObj.id);
    resetFarmerForm();
  };

  const farmerHasHistory = (fId: string) => {
    return (
      state.collections.some((c) => c.farmerId === fId) ||
      state.advancesAndPayments.some((a) => a.farmerId === fId) ||
      state.cattleFeed.some((cf) => cf.farmerId === fId)
    );
  };

  // --- Advance / Payment Handlers ---
  const handleSaveAdvSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdvError(null);
    const farmer = state.farmers.find((f) => f.id === advFarmerId);
    const amt = Number(advAmount);
    const code =
      advTxnCode.trim() ||
      `${advType === 'advance' ? 'ADV' : 'PAY'}-${Date.now().toString().slice(-5)}`;

    if (!farmer) {
      setAdvError(lang === 'hi' ? 'कृपया किसान चुनें।' : 'Please select a farmer.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setAdvError(
        lang === 'hi' ? 'कृपया वैध राशि (₹ > 0) दर्ज करें।' : 'Please enter a valid amount.'
      );
      return;
    }

    // Prevent duplicate transaction ID (TEST 21)
    const dupTxn = state.advancesAndPayments.find(
      (a) =>
        a.id !== editingAdvId &&
        (a.txnCode.toLowerCase() === code.toLowerCase() ||
          (a.farmerId === farmer.id &&
            a.date === advDate &&
            a.type === advType &&
            a.amount === round2(amt) &&
            a.notes === advNotes.trim() &&
            advTxnCode.trim() !== ''))
    );
    if (dupTxn) {
      setAdvError(
        lang === 'hi'
          ? `डुप्लिकेट लेन-देन चेतावनी: यूनिक ID "${code}" पहले से दर्ज है! एक ही एडवांस/भुगतान दो बार नहीं जोड़ा जा सकता।`
          : `Duplicate transaction ID "${code}" detected!`
      );
      return;
    }

    const entry: AdvancePaymentEntry = {
      id: editingAdvId || `adv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      txnCode: code,
      date: advDate,
      farmerId: farmer.id,
      farmerName: farmer.name,
      type: advType,
      amount: round2(amt),
      paymentMethod: advMethod,
      billingYearMonth: advBillingYearMonth || advDate.slice(0, 7),
      billingCycle: advBillingCycle,
      notes: advNotes.trim(),
      createdAt: new Date().toISOString(),
    };

    onSaveAdvancePayment(entry, Boolean(editingAdvId));
    setEditingAdvId(null);
    setAdvTxnCode('');
    setAdvAmount('');
    setAdvNotes('');
  };

  // --- Cattle Feed Handlers ---
  const liveFeedTotal = round2((Number(feedQty) || 0) * (Number(feedUnitPrice) || 0));

  const handleSaveFeedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedError(null);
    const farmer = state.farmers.find((f) => f.id === feedFarmerId);
    const q = Number(feedQty);
    const p = Number(feedUnitPrice);

    if (!farmer || !feedItemName.trim() || !Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p <= 0) {
      setFeedError(
        lang === 'hi'
          ? 'कृपया किसान, सामग्री का नाम, मात्रा और प्रति यूनिट कीमत सही भरें।'
          : 'Please fill farmer, item name, quantity, and unit price.'
      );
      return;
    }

    const entry: CattleFeedEntry = {
      id: editingFeedId || `feed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      txnCode: `FD-${Date.now().toString().slice(-5)}`,
      date: feedDate,
      farmerId: farmer.id,
      farmerName: farmer.name,
      itemName: feedItemName.trim(),
      quantity: round2(q),
      unitPrice: round2(p),
      totalAmount: liveFeedTotal,
      paymentMode: feedMode,
      notes: feedNotes.trim(),
      createdAt: new Date().toISOString(),
    };

    onSaveCattleFeed(entry, Boolean(editingFeedId));
    setEditingFeedId(null);
    setFeedItemName('');
    setFeedQty('1');
    setFeedUnitPrice('');
    setFeedNotes('');
  };

  // --- 10-Day Bill Generation ---
  const handleCreateOrUpdateBill = () => {
    const farmer = state.farmers.find((f) => f.id === billFarmerId);
    if (!farmer) return;
    const data = generateTenDayBillData(
      farmer,
      billYearMonth,
      billCycle,
      state.collections,
      state.advancesAndPayments,
      state.cattleFeed
    );

    const existingBill = state.bills.find(
      (b) =>
        b.farmerId === farmer.id &&
        b.yearMonth === billYearMonth &&
        b.cycle === billCycle
    );

    const newBill: TenDayBill = {
      ...data,
      id: existingBill ? existingBill.id : `bill_${Date.now()}`,
      billNumber: existingBill
        ? existingBill.billNumber
        : `UD-${billYearMonth.replace('-', '')}-C${billCycle}-${farmer.code}`,
      createdAt: new Date().toISOString(),
    };

    onSaveBill(newBill);
    setActiveBill(newBill);
  };

  const handleQuickBillPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBill) return;
    const farmer = state.farmers.find((f) => f.id === activeBill.farmerId);
    const amt = Number(quickBillPayAmount);
    if (!farmer || !Number.isFinite(amt) || amt <= 0) return;

    const cycleLabel = getCycleLabelHi(activeBill.cycle);
    const entry: AdvancePaymentEntry = {
      id: `adv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      txnCode: `PAY-${Date.now().toString().slice(-5)}`,
      date: state.selectedDate,
      farmerId: farmer.id,
      farmerName: farmer.name,
      type: 'payment',
      amount: round2(amt),
      paymentMethod: quickBillPayMethod,
      billingYearMonth: activeBill.yearMonth,
      billingCycle: activeBill.cycle,
      notes: quickBillPayNotes.trim() || `बिल भुगतान (${cycleLabel})`,
      createdAt: new Date().toISOString(),
    };

    const nextAdvances = [entry, ...state.advancesAndPayments];
    onSaveAdvancePayment(entry, false);

    // Immediately recalculate and save the updated bill
    const updatedData = generateTenDayBillData(
      farmer,
      activeBill.yearMonth,
      activeBill.cycle,
      state.collections,
      nextAdvances,
      state.cattleFeed
    );
    const updatedBill: TenDayBill = {
      ...updatedData,
      id: activeBill.id,
      billNumber: activeBill.billNumber,
      createdAt: new Date().toISOString(),
    };
    onSaveBill(updatedBill);
    setActiveBill(updatedBill);
    setQuickBillPayAmount('');
    setQuickBillPayNotes('');
  };

  const openBillWhatsApp = (bill: TenDayBill) => {
    const farmer = state.farmers.find((f) => f.id === bill.farmerId);
    const cycleLabel = getCycleLabelHi(bill.cycle);
    const payableBeforePayment =
      bill.billPayableBeforePayment ?? bill.netPayable + bill.paymentsInPeriod;
    const prevAdjLine =
      bill.previousBalance > 0
        ? `पिछली अवधि का कम भुगतान / बकाया (+): +${formatWholeCurrency(bill.previousBalance)}`
        : bill.previousBalance < 0
        ? `पिछली अवधि का ज्यादा भुगतान समायोजन (-): -${formatWholeCurrency(Math.abs(bill.previousBalance))}`
        : `पिछला बकाया / समायोजन: ₹0`;
    const carryForwardLine =
      bill.netPayable > 0
        ? `*शेष देय राशि (अगली अवधि में जुड़ेगा): ${formatWholeCurrency(bill.netPayable)}*`
        : bill.netPayable < 0
        ? `*अतिरिक्त/ज्यादा भुगतान (अगली अवधि से कटेगा): -${formatWholeCurrency(Math.abs(bill.netPayable))}*`
        : `*अंतिम देय राशि: ₹0 (चुकता)*`;

    const msg = [
      `*${state.dairyName || 'Ujalaa Dairy'} — 10-दिन का दूध बिल*`,
      `बिल नं: ${bill.billNumber}`,
      `किसान: ${bill.farmerCode} - ${bill.farmerName}`,
      `अवधि: ${cycleLabel} (${formatDateDMY(bill.fromDate)} से ${formatDateDMY(bill.toDate)})`,
      `--------------------------------`,
      `सुबह का दूध: ${formatNumber(bill.morningLiters, 3)} L (${formatWholeCurrency(bill.morningAmount)})`,
      `शाम का दूध: ${formatNumber(bill.eveningLiters, 3)} L (${formatWholeCurrency(bill.eveningAmount)})`,
      `कुल दूध: ${formatNumber(bill.totalLiters, 3)} L`,
      `औसत FAT: ${formatNumber(bill.avgFat)} | औसत SNF: ${formatNumber(bill.avgSnf)}`,
      `कुल दूध राशि: ${formatWholeCurrency(bill.totalMilkAmount)}`,
      prevAdjLine,
      `एडवांस कटौती (-): ${formatWholeCurrency(bill.advancesInPeriod)}`,
      `दाना/पशु-आहार कटौती (-): ${formatWholeCurrency(bill.feedDeductionsInPeriod)}`,
      `कुल देय बिल राशि: ${formatWholeCurrency(payableBeforePayment)}`,
      `इस अवधि में भुगतान (-): ${formatWholeCurrency(bill.paymentsInPeriod)}`,
      `--------------------------------`,
      carryForwardLine,
    ].join('\n');

    setWaModal({
      open: true,
      phone: farmer?.mobile || '',
      message: msg,
    });
  };

  const activeLedgerFarmer =
    state.farmers.find((f) => f.id === ledgerFarmerId) || state.farmers[0] || null;
  const ledgerData = activeLedgerFarmer
    ? calculateFarmerLedger(
        activeLedgerFarmer,
        state.collections,
        state.advancesAndPayments,
        state.cattleFeed
      )
    : null;

  return (
    <div className="space-y-5">
      {/* Sub-navigation bar for Farmer & Accounting Modules */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 flex flex-wrap items-center gap-1.5 no-print">
        <button
          type="button"
          onClick={() => setSubTab('farmers')}
          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'farmers'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          {lang === 'hi' ? 'किसान प्रबंधन' : 'Farmers'}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('ledger')}
          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'ledger'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          {lang === 'hi' ? 'किसान का खाता (Ledger)' : 'Farmer Ledger'}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('advances')}
          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'advances'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Wallet className="w-4 h-4" />
          {lang === 'hi' ? 'एडवांस और भुगतान' : 'Advance & Payments'}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('feed')}
          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'feed'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4" />
          {lang === 'hi' ? 'दाना और पशु-आहार' : 'Cattle Feed'}
        </button>

        <button
          type="button"
          data-testid="subtab-billing-reports-btn"
          onClick={() => setSubTab('billing')}
          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'billing'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          {lang === 'hi' ? '10-दिन बिलिंग व रिपोर्ट' : '10-Day Billing & Reports'}
        </button>
      </div>

      {/* SUBTAB 1: FARMER MANAGEMENT (Section 9 + Additional Feature #1) */}
      {subTab === 'farmers' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {editingFarmerId
                      ? lang === 'hi'
                        ? 'किसान प्रोफाइल एडिट करें'
                        : 'Edit Farmer Profile'
                      : lang === 'hi'
                      ? 'नया किसान जोड़ें (Add Farmer)'
                      : 'Add New Farmer'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {lang === 'hi'
                      ? 'किसान का दूध आने का निर्धारित समय चुनें (केवल सुबह, केवल शाम, या सुबह और शाम दोनों समय)'
                      : 'Choose the farmer shift schedule (Morning only, Evening only, or Both)'}
                  </p>
                </div>
              </div>
              {editingFarmerId && (
                <button
                  type="button"
                  onClick={resetFarmerForm}
                  className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg"
                >
                  {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
                </button>
              )}
            </div>

            <form onSubmit={handleSaveFarmerSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="f-code" className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'किसान ID / कोड *' : 'Farmer ID / Code *'}
                  </label>
                  <input
                    id="f-code"
                    type="text"
                    placeholder="जैसे 101"
                    value={fCode}
                    onChange={(e) => setFCode(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
                  />
                </div>

                <div>
                  <label htmlFor="f-name" className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'किसान का नाम *' : 'Farmer Name *'}
                  </label>
                  <input
                    id="f-name"
                    type="text"
                    placeholder={lang === 'hi' ? 'जैसे रामलाल' : 'e.g. Ramlal'}
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="f-schedule"
                    className="block text-xs font-bold text-blue-900 mb-1"
                  >
                    {lang === 'hi'
                      ? 'यह किसान किस समय दूध लाता है? *'
                      : 'When does this farmer bring milk? *'}
                  </label>
                  <select
                    id="f-schedule"
                    value={fSchedule}
                    onChange={(e) => setFSchedule(e.target.value as FarmerShiftSchedule)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm font-semibold bg-blue-50/60 border border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="morning">
                      {lang === 'hi' ? '1. केवल सुबह (Morning Only)' : '1. Morning Only'}
                    </option>
                    <option value="evening">
                      {lang === 'hi' ? '2. केवल शाम (Evening Only)' : '2. Evening Only'}
                    </option>
                    <option value="both">
                      {lang === 'hi'
                        ? '3. सुबह और शाम दोनों समय (Both Shifts)'
                        : '3. Both Morning & Evening'}
                    </option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="f-mobile" className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'मोबाइल नंबर' : 'Mobile Number'}
                  </label>
                  <input
                    id="f-mobile"
                    type="tel"
                    placeholder="9876543210"
                    value={fMobile}
                    onChange={(e) => setFMobile(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
                  />
                </div>

                <div>
                  <label
                    htmlFor="f-village"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    {lang === 'hi' ? 'गाँव / पता' : 'Village / Address'}
                  </label>
                  <input
                    id="f-village"
                    type="text"
                    placeholder={lang === 'hi' ? 'गाँव का नाम' : 'Village'}
                    value={fVillage}
                    onChange={(e) => setFVillage(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="f-opening"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    {lang === 'hi' ? 'शुरुआती बकाया (₹)' : 'Opening Balance (₹)'}
                  </label>
                  <input
                    id="f-opening"
                    type="number"
                    step="0.01"
                    value={fOpeningBal}
                    onChange={(e) => setFOpeningBal(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
                  />
                </div>

                <div>
                  <label htmlFor="f-notes" className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'टिप्पणी' : 'Notes'}
                  </label>
                  <input
                    id="f-notes"
                    type="text"
                    value={fNotes}
                    onChange={(e) => setFNotes(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {farmerError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{farmerError}</span>
                </div>
              )}

              <button
                type="submit"
                className="min-h-[46px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {editingFarmerId
                  ? lang === 'hi'
                    ? 'किसान जानकारी अपडेट करें'
                    : 'Update Farmer'
                  : lang === 'hi'
                  ? 'किसान सेव करें'
                  : 'Save Farmer'}
              </button>
            </form>
          </div>

          {/* Farmers Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-2.5">
              {lang === 'hi'
                ? `पंजीकृत किसानों की सूची (${state.farmers.length}) — नाम पर क्लिक कर खाता देखें`
                : `Registered Farmers (${state.farmers.length}) — Click name to open Ledger`}
            </h3>
            <div>
              <table className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums">
                <thead>
                  <tr className="bg-blue-50 text-blue-950">
                    <th className="py-2 px-1.5 sm:px-2.5 text-left border border-slate-300">
                      {lang === 'hi' ? 'किसान (ID व नाम)' : 'Farmer (ID & Name)'}
                    </th>
                    <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">
                      {lang === 'hi' ? 'कुल दूध' : 'Milk'}
                    </th>
                    <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">
                      {lang === 'hi' ? 'शेष बकाया' : 'Balance'}
                    </th>
                    <th className="py-2 px-1 sm:px-2 text-center border border-slate-300">
                      {lang === 'hi' ? 'कार्य' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.farmers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500 border border-slate-300">
                        {lang === 'hi'
                          ? 'अभी कोई किसान नहीं जोड़ा गया है।'
                          : 'No farmers added yet.'}
                      </td>
                    </tr>
                  ) : (
                    state.farmers.map((f) => {
                      const ledger = calculateFarmerLedger(
                        f,
                        state.collections,
                        state.advancesAndPayments,
                        state.cattleFeed
                      );
                      return (
                        <tr key={f.id} className="hover:bg-slate-50">
                          <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                            <button
                              type="button"
                              onClick={() => {
                                setLedgerFarmerId(f.id);
                                setSubTab('ledger');
                              }}
                              className="text-left font-bold text-blue-700 hover:underline leading-tight block"
                            >
                              <span className="text-slate-800">{f.code}</span> — {f.name}
                            </button>
                            <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                              {scheduleLabel(f.shiftSchedule)}
                              {f.mobile ? ` · ${f.mobile}` : ''}
                              {f.village ? ` · ${f.village}` : ''}
                            </span>
                          </td>
                          <td className="py-2 px-1.5 sm:px-2.5 text-right font-bold whitespace-nowrap border border-slate-300">
                            {formatNumber(ledger.totalLiters, 2)} L
                          </td>
                          <td className="py-2 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                            <span className="font-bold text-blue-900 block">
                              {formatWholeCurrency(ledger.closingBalance)}
                            </span>
                            <button
                              type="button"
                              onClick={() => onSaveFarmer({ ...f, active: !f.active }, true)}
                              className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold inline-block ${
                                f.active
                                  ? 'text-emerald-700 bg-emerald-50'
                                  : 'text-slate-500 bg-slate-100'
                              }`}
                            >
                              {f.active
                                ? lang === 'hi'
                                  ? 'सक्रिय'
                                  : 'Active'
                                : lang === 'hi'
                                ? 'निष्क्रिय'
                                : 'Inactive'}
                            </button>
                          </td>
                          <td className="py-2 px-1 sm:px-2 text-center border border-slate-300">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditFarmer(f)}
                                aria-label={`Edit ${f.name}`}
                                className="min-h-[28px] px-1.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 rounded-lg font-semibold flex items-center gap-0.5"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteFarmerTarget(f)}
                                aria-label={`Delete ${f.name}`}
                                className="min-h-[28px] px-1.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-semibold flex items-center gap-0.5"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: INDIVIDUAL FARMER LEDGER / PASSBOOK (Section 10) */}
      {subTab === 'ledger' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'hi'
                  ? 'प्रत्येक किसान का अलग खाता / लेजर (Individual Farmer Passbook)'
                  : 'Individual Farmer Ledger & Passbook'}
              </h2>
              <p className="text-xs text-slate-500">
                {lang === 'hi'
                  ? 'दूध खरीद, एडवांस, दाना कटौती, भुगतान और शेष बकाया का पूरा कालानुक्रमिक विवरण'
                  : 'Complete chronological account of milk, advances, cattle feed deductions, and payments'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={lang === 'hi' ? 'किसान चुनें' : 'Select Farmer'}
                value={activeLedgerFarmer?.id || ''}
                onChange={(e) => setLedgerFarmerId(e.target.value)}
                className="min-h-[40px] px-3 py-1.5 text-xs font-bold bg-blue-50 text-blue-900 border border-blue-200 rounded-xl"
              >
                {state.farmers.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} — {f.name} ({scheduleLabel(f.shiftSchedule)})
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setLedgerShiftFilter('all')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
                    ledgerShiftFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {lang === 'hi' ? 'सभी' : 'All'}
                </button>
                <button
                  type="button"
                  onClick={() => setLedgerShiftFilter('morning')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
                    ledgerShiftFilter === 'morning'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  {lang === 'hi' ? 'सुबह' : 'Morning'}
                </button>
                <button
                  type="button"
                  onClick={() => setLedgerShiftFilter('evening')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
                    ledgerShiftFilter === 'evening'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  {lang === 'hi' ? 'शाम' : 'Evening'}
                </button>
              </div>
            </div>
          </div>

          {!ledgerData ? (
            <div className="py-8 text-center text-sm text-slate-500">
              {lang === 'hi'
                ? 'खाता देखने के लिए पहले किसान जोड़ें।'
                : 'Add a farmer first to view their ledger.'}
            </div>
          ) : (
            <>
              {/* Farmer Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block">
                    {lang === 'hi' ? 'कुल दूध (L)' : 'Total Liters'}
                  </span>
                  <span className="font-bold text-slate-900 text-sm tabular-nums mt-0.5 block">
                    {formatNumber(ledgerData.totalLiters, 3)} L
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block">
                    {lang === 'hi' ? 'औसत FAT / SNF' : 'Avg FAT / SNF'}
                  </span>
                  <span className="font-bold text-slate-900 text-sm tabular-nums mt-0.5 block">
                    {formatNumber(ledgerData.avgFat)} / {formatNumber(ledgerData.avgSnf)}
                  </span>
                </div>
                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100">
                  <span className="text-blue-900 block">
                    {lang === 'hi' ? 'कुल दूध राशि' : 'Milk Amount'}
                  </span>
                  <span className="font-bold text-blue-800 text-sm tabular-nums mt-0.5 block">
                    {formatWholeCurrency(ledgerData.totalMilkAmount)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block">
                    {lang === 'hi' ? 'कुल एडवांस' : 'Total Advance'}
                  </span>
                  <span className="font-bold text-amber-700 text-sm tabular-nums mt-0.5 block">
                    {formatWholeCurrency(ledgerData.totalAdvances)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block">
                    {lang === 'hi' ? 'दाना/अन्य कटौती' : 'Feed/Deductions'}
                  </span>
                  <span className="font-bold text-red-600 text-sm tabular-nums mt-0.5 block">
                    {formatWholeCurrency(
                      ledgerData.totalFeedDeductions + ledgerData.totalInlineDeductions
                    )}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block">
                    {lang === 'hi' ? 'कुल भुगतान किया' : 'Total Paid'}
                  </span>
                  <span className="font-bold text-slate-900 text-sm tabular-nums mt-0.5 block">
                    {formatWholeCurrency(ledgerData.totalPayments)}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200">
                  <span className="text-emerald-900 font-semibold block">
                    {lang === 'hi' ? 'शेष बकाया (Balance)' : 'Closing Balance'}
                  </span>
                  <span className="font-bold text-emerald-800 text-sm tabular-nums mt-0.5 block">
                    {formatWholeCurrency(ledgerData.closingBalance)}
                  </span>
                </div>
              </div>

              {/* Ledger Table */}
              <div>
                <table className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums">
                  <thead>
                    <tr className="bg-slate-50 text-slate-800">
                      <th className="py-2 px-1 sm:px-2.5 text-left border border-slate-300">
                        {lang === 'hi' ? 'तारीख / शिफ्ट' : 'Date / Shift'}
                      </th>
                      <th className="py-2 px-1 sm:px-2.5 text-left border border-slate-300">
                        {lang === 'hi' ? 'विवरण · लीटर | FAT | SNF | रेट' : 'Particulars · L | FAT | SNF | Rate'}
                      </th>
                      <th className="py-2 px-1 sm:px-2 text-right border border-slate-300">
                        {lang === 'hi' ? 'जमा(+) / नामे(-)' : 'Cr(+) / Dr(-)'}
                      </th>
                      <th className="py-2 px-1 sm:px-2 text-right border border-slate-300">
                        {lang === 'hi' ? 'बाकी बकाया' : 'Balance'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerData.rows
                      .filter(
                        (r) =>
                          ledgerShiftFilter === 'all' ||
                          !r.shift ||
                          r.shift === ledgerShiftFilter
                      )
                      .map((row) => {
                        const debitTotal =
                          row.advanceAmount +
                          row.feedAmount +
                          row.otherDeduction +
                          row.paymentAmount;
                        return (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="py-2 px-1 sm:px-2.5 whitespace-nowrap border border-slate-300">
                              <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm block leading-tight">
                                {formatDateDMY(row.date)}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-500 block leading-tight mt-0.5">
                                {row.shift === 'morning'
                                  ? 'सुबह'
                                  : row.shift === 'evening'
                                  ? 'शाम'
                                  : '—'}
                              </span>
                            </td>
                            <td className="py-2 px-1 sm:px-2.5 border border-slate-300">
                              <span className="font-bold text-slate-900 text-xs sm:text-sm block leading-tight">
                                {lang === 'hi' ? row.descriptionHi : row.descriptionEn}
                              </span>
                              {row.liters ? (
                                <div className="mt-1 inline-grid grid-cols-4 divide-x divide-slate-300 border border-slate-300 rounded bg-slate-50 text-xs font-extrabold tabular-nums">
                                  <span className="px-1 sm:px-1.5 py-0.5 text-slate-900">
                                    {formatNumber(row.liters, 2)}L
                                  </span>
                                  <span className="px-1 sm:px-1.5 py-0.5 text-amber-950 bg-amber-50/70">
                                    F:{formatNumber(row.fat, 1)}
                                  </span>
                                  <span className="px-1 sm:px-1.5 py-0.5 text-indigo-950 bg-indigo-50/70">
                                    S:{formatNumber(row.snf, 1)}
                                  </span>
                                  <span className="px-1 sm:px-1.5 py-0.5 text-blue-900">
                                    ₹{formatNumber(row.rate, 2)}
                                  </span>
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2 px-1 sm:px-2 text-right whitespace-nowrap border border-slate-300">
                              {row.milkAmount > 0 && (
                                <span className="font-extrabold text-blue-800 text-xs sm:text-sm block">
                                  +{formatWholeCurrency(row.milkAmount)}
                                </span>
                              )}
                              {debitTotal > 0 && (
                                <span className="font-extrabold text-red-600 text-xs sm:text-sm block">
                                  -{formatWholeCurrency(debitTotal)}
                                </span>
                              )}
                              {row.milkAmount === 0 && debitTotal === 0 && '—'}
                            </td>
                            <td className="py-2 px-1 sm:px-2 text-right font-extrabold text-slate-900 text-xs sm:text-sm whitespace-nowrap border border-slate-300">
                              {formatWholeCurrency(row.runningBalance)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* SUBTAB 3: ADVANCES & PAYMENTS (Section 11) */}
      {subTab === 'advances' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              {lang === 'hi'
                ? 'किसान एडवांस और 10-दिन अवधि भुगतान एंट्री (Advance & Period Payment)'
                : 'Farmer Advance & 10-Day Period Settlement Payment'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {lang === 'hi'
                ? 'चुनें कि यह भुगतान 1 से 10 तारीख, 11 से 20 तारीख या 21 से महीने के अंत में से किस अवधि का हो रहा है। कम या ज्यादा भुगतान होने पर अंतर अगली अवधि के बिल में स्वतः जुड़ या कट जाएगा।'
                : 'Select which 10-day period (1–10, 11–20, or 21–End of Month) is being paid. Any short or excess payment automatically adjusts in the next period bill.'}
            </p>

            <form onSubmit={handleSaveAdvSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi'
                      ? `भुगतान की तारीख (${formatDateDMY(advDate)}) *`
                      : `Payment Date (${formatDateDMY(advDate)}) *`}
                  </label>
                  <input
                    type="date"
                    value={advDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAdvDate(val);
                      if (val && val.length >= 10) {
                        const info = getCycleFromDate(val);
                        setAdvBillingYearMonth(info.yearMonth);
                        setAdvBillingCycle(info.cycle);
                      }
                    }}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'किसान चुनें *' : 'Farmer *'}
                  </label>
                  <select
                    data-testid="adv-farmer-select"
                    value={advFarmerId}
                    onChange={(e) => setAdvFarmerId(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="">{lang === 'hi' ? '-- किसान चुनें --' : '-- Select --'}</option>
                    {state.farmers.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.code} — {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'लेन-देन का प्रकार *' : 'Transaction Type *'}
                  </label>
                  <select
                    data-testid="adv-type-select"
                    value={advType}
                    onChange={(e) => setAdvType(e.target.value as 'advance' | 'payment')}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="payment">
                      {lang === 'hi' ? 'बिल भुगतान किया (Settlement Payment)' : 'Bill Payment'}
                    </option>
                    <option value="advance">
                      {lang === 'hi' ? 'एडवांस दिया (Advance Given)' : 'Advance Given'}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'यूनिक रसीद/लेन-देन ID' : 'Unique Txn ID'}
                  </label>
                  <input
                    type="text"
                    placeholder={lang === 'hi' ? 'स्वतः या कस्टम (जैसे PAY-101)' : 'Auto or custom'}
                    value={advTxnCode}
                    onChange={(e) => setAdvTxnCode(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              {/* 10-Day Billing Period Selection Box */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-blue-950 block">
                      {lang === 'hi'
                        ? 'यह भुगतान / एडवांस किस 10-दिन की अवधि का हो रहा है? *'
                        : 'Which 10-Day Billing Period is this payment for? *'}
                    </span>
                    <span className="text-[11px] text-blue-800">
                      {lang === 'hi'
                        ? 'कम भुगतान होने पर बकाया अगली अवधि में जुड़ जाएगा और ज्यादा भुगतान होने पर अगली अवधि से कट जाएगा'
                        : 'Underpayment adds to next period; overpayment deducts from next period'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-blue-900">
                      {lang === 'hi' ? 'महीना:' : 'Month:'}
                    </label>
                    <input
                      type="month"
                      data-testid="adv-billing-month-input"
                      value={advBillingYearMonth}
                      onChange={(e) => setAdvBillingYearMonth(e.target.value)}
                      className="min-h-[38px] px-2.5 py-1.5 text-xs font-mono bg-white border border-blue-300 rounded-lg tabular-nums"
                    />
                  </div>
                </div>

                <div
                  data-testid="adv-billing-cycle-selector"
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                >
                  {([1, 2, 3] as const).map((c) => {
                    const active = advBillingCycle === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        data-testid={`adv-cycle-btn-${c}`}
                        onClick={() => setAdvBillingCycle(c)}
                        className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold border text-left flex items-center justify-between ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white text-slate-800 border-slate-300 hover:bg-blue-50'
                        }`}
                      >
                        <span>
                          {lang === 'hi'
                            ? `अवधि ${c}: ${getCycleLabelHi(c)}`
                            : `Cycle ${c}: ${getCycleLabelEn(c)}`}
                        </span>
                        {active && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* Live Period Bill & Carry-Forward Adjustment Preview */}
                {(() => {
                  const selFarmer = state.farmers.find((f) => f.id === advFarmerId);
                  if (!selFarmer || !advBillingYearMonth) return null;
                  const periodBill = generateTenDayBillData(
                    selFarmer,
                    advBillingYearMonth,
                    advBillingCycle,
                    state.collections,
                    state.advancesAndPayments,
                    state.cattleFeed
                  );
                  const enteredAmt = truncatePurchaseAmount(Number(advAmount) || 0);
                  const projectedNetAfterThisEntry = periodBill.netPayable - enteredAmt;
                  const payableBeforePay =
                    periodBill.billPayableBeforePayment ??
                    periodBill.netPayable + periodBill.paymentsInPeriod;

                  return (
                    <div
                      data-testid="adv-period-live-summary"
                      className="p-3 bg-white border border-blue-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs tabular-nums"
                    >
                      <div>
                        <span className="text-slate-500 block">
                          {getCycleLabelHi(advBillingCycle)} का कुल बिल
                        </span>
                        <span className="font-bold text-slate-900">
                          {formatWholeCurrency(payableBeforePay)}
                        </span>
                        {periodBill.previousBalance !== 0 && (
                          <span className="text-[11px] text-slate-500 block">
                            (पिछला समायोजन:{' '}
                            {periodBill.previousBalance > 0
                              ? `+${formatWholeCurrency(periodBill.previousBalance)}`
                              : `-${formatWholeCurrency(Math.abs(periodBill.previousBalance))}`}
                            )
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-500 block">पहले से भुगतान / अभी शेष</span>
                        <span className="font-bold text-slate-900">
                          {formatWholeCurrency(periodBill.paymentsInPeriod)} /{' '}
                          {formatWholeCurrency(periodBill.netPayable)}
                        </span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-slate-500 block">
                          इस भुगतान के बाद अगली अवधि में समायोजन:
                        </span>
                        {projectedNetAfterThisEntry > 0 ? (
                          <span className="font-bold text-amber-800 block">
                            कम भुगतान बकाया: +{formatWholeCurrency(projectedNetAfterThisEntry)} (अगली अवधि के बिल में जुड़ेगा)
                          </span>
                        ) : projectedNetAfterThisEntry < 0 ? (
                          <span className="font-bold text-indigo-700 block">
                            ज्यादा/अतिरिक्त भुगतान: -{formatWholeCurrency(Math.abs(projectedNetAfterThisEntry))} (अगली अवधि के बिल से कटेगा)
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-700 block">
                            ₹0 — इस अवधि का बिल पूरा चुकता (बराबर)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'भुगतान राशि (₹) *' : 'Amount (₹) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    data-testid="adv-amount-input"
                    placeholder="500"
                    value={advAmount}
                    onChange={(e) => setAdvAmount(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'भुगतान का तरीका *' : 'Payment Mode *'}
                  </label>
                  <select
                    value={advMethod}
                    onChange={(e) => setAdvMethod(e.target.value as PaymentMethod)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="cash">{lang === 'hi' ? 'नकद (Cash)' : 'Cash'}</option>
                    <option value="bank">{lang === 'hi' ? 'बैंक (Bank)' : 'Bank'}</option>
                    <option value="upi">UPI</option>
                    <option value="other">{lang === 'hi' ? 'अन्य (Other)' : 'Other'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'टिप्पणी' : 'Notes'}
                  </label>
                  <input
                    type="text"
                    value={advNotes}
                    onChange={(e) => setAdvNotes(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              {advError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
                  {advError}
                </div>
              )}

              <button
                type="submit"
                data-testid="save-adv-payment-btn"
                className="min-h-[46px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl"
              >
                {editingAdvId
                  ? lang === 'hi'
                    ? 'अपडेट करें'
                    : 'Update'
                  : lang === 'hi'
                  ? 'एडवांस / भुगतान सेव करें'
                  : 'Save Entry'}
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-2.5">
              {lang === 'hi' ? 'एडवांस और भुगतान सूची' : 'Advances & Payments History'}
            </h3>
            <table className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums">
              <thead>
                <tr className="bg-slate-50">
                  <th className="py-2 px-1.5 sm:px-2.5 text-left border border-slate-300">
                    {lang === 'hi' ? 'तारीख / किसान' : 'Date / Farmer'}
                  </th>
                  <th className="py-2 px-1.5 sm:px-2.5 text-left border border-slate-300">
                    {lang === 'hi' ? 'अवधि व प्रकार' : 'Period & Type'}
                  </th>
                  <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">
                    {lang === 'hi' ? 'राशि' : 'Amount'}
                  </th>
                  <th className="py-2 px-1 sm:px-2 text-center border border-slate-300">
                    {lang === 'hi' ? 'कार्य' : 'Action'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.advancesAndPayments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500 border border-slate-300">
                      {lang === 'hi' ? 'अभी कोई रिकॉर्ड नहीं है' : 'No records yet'}
                    </td>
                  </tr>
                ) : (
                  state.advancesAndPayments.map((a) => {
                    const eff = getAdvancePaymentEffectiveCycle(a);
                    return (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                          <span className="font-bold text-slate-900 block leading-tight">
                            {a.farmerName}
                          </span>
                          <span className="text-[11px] text-slate-600 font-mono font-semibold block leading-tight mt-0.5">
                            {formatDateDMY(a.date)} · {a.txnCode}
                          </span>
                        </td>
                        <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded text-[11px] font-semibold inline-block">
                            {getCycleLabelHi(eff.cycle, eff.yearMonth)}
                          </span>
                          <span className="text-[11px] text-slate-600 block mt-0.5">
                            {a.type === 'advance' ? 'एडवांस' : 'भुगतान'} · {a.paymentMethod.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 px-1.5 sm:px-2.5 text-right font-bold whitespace-nowrap border border-slate-300">
                          {formatCurrency(a.amount)}
                        </td>
                        <td className="py-2 px-1 sm:px-2 text-center border border-slate-300">
                          <button
                            type="button"
                            onClick={() => setDeleteAdvId(a.id)}
                            className="px-1.5 py-1 bg-red-50 text-red-600 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 4: CATTLE FEED & SUPPLEMENTS (Section 12) */}
      {subTab === 'feed' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              {lang === 'hi'
                ? 'दाना और पशु-आहार का हिसाब (Cattle Feed & Supplements)'
                : 'Cattle Feed & Supplements Deduction'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {lang === 'hi'
                ? 'किसान को दिए गए पशु-आहार का रिकॉर्ड रखें और उसे दूध बिल से ऑटोमैटिक घटाएँ'
                : 'Record cattle feed supplied to farmers and link to their ledger'}
            </p>

            <form onSubmit={handleSaveFeedSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi'
                      ? `तारीख (${formatDateDMY(feedDate)}) *`
                      : `Date (${formatDateDMY(feedDate)}) *`}
                  </label>
                  <input
                    type="date"
                    value={feedDate}
                    onChange={(e) => setFeedDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'किसान चुनें *' : 'Farmer *'}
                  </label>
                  <select
                    value={feedFarmerId}
                    onChange={(e) => setFeedFarmerId(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="">{lang === 'hi' ? '-- किसान चुनें --' : '-- Select --'}</option>
                    {state.farmers.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.code} — {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'सामग्री का नाम (दाना/खल/चूरी) *' : 'Item Name *'}
                  </label>
                  <input
                    type="text"
                    placeholder={lang === 'hi' ? 'जैसे पशु-आहार बोरी 50Kg' : 'Cattle Feed 50kg'}
                    value={feedItemName}
                    onChange={(e) => setFeedItemName(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'कटौती का प्रकार *' : 'Payment / Deduction Mode *'}
                  </label>
                  <select
                    value={feedMode}
                    onChange={(e) =>
                      setFeedMode(e.target.value as 'deduct_from_milk' | 'cash_paid')
                    }
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="deduct_from_milk">
                      {lang === 'hi'
                        ? 'दूध के खाते से काटना है (Deduct from Milk Bill)'
                        : 'Deduct from Milk Bill'}
                    </option>
                    <option value="cash_paid">
                      {lang === 'hi' ? 'तुरंत नकद प्राप्त (Paid Cash)' : 'Paid Cash Immediately'}
                    </option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'मात्रा (Quantity) *' : 'Quantity *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={feedQty}
                    onChange={(e) => setFeedQty(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'प्रति यूनिट कीमत (₹) *' : 'Unit Price (₹) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="1250"
                    value={feedUnitPrice}
                    onChange={(e) => setFeedUnitPrice(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'कुल कीमत (₹)' : 'Total Price (₹)'}
                  </label>
                  <div className="w-full min-h-[44px] px-3 py-2.5 text-sm font-bold font-mono bg-blue-50 text-blue-900 border border-blue-200 rounded-xl tabular-nums">
                    {formatCurrency(liveFeedTotal)}
                  </div>
                </div>
                <div>
                  <button
                    type="submit"
                    className="w-full min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl"
                  >
                    {lang === 'hi' ? 'दाना एंट्री सेव करें' : 'Save Cattle Feed'}
                  </button>
                </div>
              </div>

              {feedError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
                  {feedError}
                </div>
              )}
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-2.5">
              {lang === 'hi' ? 'दाना और पशु-आहार रिकॉर्ड सूची' : 'Cattle Feed Records'}
            </h3>
            <table className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums">
              <thead>
                <tr className="bg-slate-50">
                  <th className="py-2 px-1.5 sm:px-2.5 text-left border border-slate-300">
                    {lang === 'hi' ? 'तारीख / किसान' : 'Date / Farmer'}
                  </th>
                  <th className="py-2 px-1.5 sm:px-2.5 text-left border border-slate-300">
                    {lang === 'hi' ? 'सामग्री व मात्रा' : 'Item & Qty'}
                  </th>
                  <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">
                    {lang === 'hi' ? 'कुल कीमत' : 'Total'}
                  </th>
                  <th className="py-2 px-1 sm:px-2 text-center border border-slate-300">
                    {lang === 'hi' ? 'कार्य' : 'Action'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.cattleFeed.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500 border border-slate-300">
                      {lang === 'hi' ? 'अभी कोई रिकॉर्ड नहीं है' : 'No records yet'}
                    </td>
                  </tr>
                ) : (
                  state.cattleFeed.map((cf) => (
                    <tr key={cf.id} className="hover:bg-slate-50">
                      <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                        <span className="font-bold text-slate-900 block leading-tight">
                          {cf.farmerName}
                        </span>
                        <span className="text-[11px] text-slate-600 font-mono font-semibold block leading-tight mt-0.5">
                          {formatDateDMY(cf.date)}
                        </span>
                      </td>
                      <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                        <span className="font-medium text-slate-900 block leading-tight">
                          {cf.itemName}
                        </span>
                        <span className="text-[11px] text-slate-500 block leading-tight">
                          {cf.quantity} × {formatCurrency(cf.unitPrice)}
                        </span>
                      </td>
                      <td className="py-2 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                        <span className="font-bold text-slate-900 block">
                          {formatCurrency(cf.totalAmount)}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {cf.paymentMode === 'deduct_from_milk' ? 'दूध से कटौती' : 'नकद'}
                        </span>
                      </td>
                      <td className="py-2 px-1 sm:px-2 text-center border border-slate-300">
                        <button
                          type="button"
                          onClick={() => setDeleteFeedId(cf.id)}
                          className="px-1.5 py-1 bg-red-50 text-red-600 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 5: 10-DAY BILLING & CLEAN REPORTS (केवल 4 रिपोर्ट: सुबह, शाम, 10-दिन सुबह-शाम, लाभ-हानि) */}
      {subTab === 'billing' && (
        <div className="space-y-5">
          {/* CLEAN 4-REPORTS CARD INSIDE 10-DAY BILLING SECTION */}
          <div
            data-testid="ten-day-billing-reports-section"
            className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5 no-print">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {lang === 'hi'
                    ? '10-दिन की डेयरी रिपोर्ट्स (सुबह · शाम · सुबह-शाम · लाभ-हानि)'
                    : '10-Day Dairy Reports (Morning · Evening · Morning-Evening · Profit & Loss)'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {lang === 'hi'
                    ? 'केवल आवश्यक 4 साफ-सुथरी 10-दिन की रिपोर्ट — किसी भी रिपोर्ट पर क्लिक करके देखें व प्रिंट करें'
                    : 'Clean 4 essential 10-day reports inside 10-Day Billing'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center gap-1.5 self-start sm:self-auto"
              >
                <Printer className="w-4 h-4" />
                {lang === 'hi' ? 'रिपोर्ट प्रिंट करें' : 'Print Report'}
              </button>
            </div>

            {/* ONLY 4 REPORT OPTIONS AS REQUESTED */}
            <div
              data-testid="clean-four-report-tabs"
              className="grid grid-cols-2 sm:grid-cols-4 gap-2 no-print"
            >
              <button
                type="button"
                data-testid="report-btn-morning"
                onClick={() => setActiveCleanReport('morning')}
                className={`min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                  activeCleanReport === 'morning'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Sun className="w-4 h-4 shrink-0" />
                <span>{lang === 'hi' ? '10 दिन की सुबह की रिपोर्ट' : '10-Day Morning Report'}</span>
              </button>

              <button
                type="button"
                data-testid="report-btn-evening"
                onClick={() => setActiveCleanReport('evening')}
                className={`min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                  activeCleanReport === 'evening'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Moon className="w-4 h-4 shrink-0" />
                <span>{lang === 'hi' ? '10 दिन की शाम की रिपोर्ट' : '10-Day Evening Report'}</span>
              </button>

              <button
                type="button"
                data-testid="report-btn-tenday"
                onClick={() => setActiveCleanReport('tenday')}
                className={`min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                  activeCleanReport === 'tenday'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Calendar className="w-4 h-4 shrink-0" />
                <span>
                  {lang === 'hi' ? '10 दिन की सुबह-शाम की रिपोर्ट' : '10-Day Morning-Evening'}
                </span>
              </button>

              <button
                type="button"
                data-testid="report-btn-profit-loss"
                onClick={() => setActiveCleanReport('profit_loss')}
                className={`min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                  activeCleanReport === 'profit_loss'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <TrendingUp className="w-4 h-4 shrink-0" />
                <span>{lang === 'hi' ? 'लाभ-हानि रिपोर्ट' : 'Profit & Loss Report'}</span>
              </button>
            </div>

            {/* REPORT 1 & 2: 10 दिन की सुबह की रिपोर्ट (10-Day Morning) / 10 दिन की शाम की रिपोर्ट (10-Day Evening) */}
            {(activeCleanReport === 'morning' || activeCleanReport === 'evening') &&
              (() => {
                const shiftType = activeCleanReport === 'morning' ? 'morning' : 'evening';
                const shiftLabelHi =
                  shiftType === 'morning'
                    ? '10 दिन की सुबह की रिपोर्ट (10-Day Morning Report)'
                    : '10 दिन की शाम की रिपोर्ट (10-Day Evening Report)';
                const { fromDate, toDate } = getTenDayCycleDates(billYearMonth, billCycle);
                const entries = state.collections.filter(
                  (c) =>
                    c.date >= fromDate &&
                    c.date <= toDate &&
                    c.shift === shiftType &&
                    (reportFarmerFilter === 'all' || c.farmerId === reportFarmerFilter)
                );
                const sum = calculateCollectionSummary(entries);

                // Build day-by-day rows for the 10-day cycle
                const startDay = Number(fromDate.slice(8, 10));
                const endDay = Number(toDate.slice(8, 10));
                const shiftDayRows: Array<{
                  date: string;
                  count: number;
                  liters: number;
                  avgFat: number | null;
                  avgSnf: number | null;
                  avgRate: number | null;
                  amount: number;
                }> = [];

                for (let d = startDay; d <= endDay; d++) {
                  const dStr = `${billYearMonth}-${String(d).padStart(2, '0')}`;
                  const dayEntries = entries.filter((c) => c.date === dStr);
                  const dSum = calculateCollectionSummary(dayEntries);
                  shiftDayRows.push({
                    date: dStr,
                    count: dSum.entryCount,
                    liters: dSum.totalLiters,
                    avgFat: dSum.avgFat,
                    avgSnf: dSum.avgSnf,
                    avgRate: dSum.avgRate,
                    amount: dSum.totalAmount,
                  });
                }

                return (
                  <div
                    data-testid={`clean-report-view-${shiftType}`}
                    className="space-y-4 pt-2 border-t border-slate-100"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 no-print">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? 'महीना चुनें' : 'Month'}
                        </label>
                        <input
                          type="month"
                          value={billYearMonth}
                          onChange={(e) => setBillYearMonth(e.target.value)}
                          className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? '10-दिन की अवधि' : '10-Day Period'}
                        </label>
                        <select
                          value={billCycle}
                          onChange={(e) => setBillCycle(Number(e.target.value) as 1 | 2 | 3)}
                          className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                        >
                          <option value={1}>1 से 10 तारीख (Cycle 1)</option>
                          <option value={2}>11 से 20 तारीख (Cycle 2)</option>
                          <option value={3}>21 से महीने के अंत तक (Cycle 3)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? 'किसान चुनें (वैकल्पिक)' : 'Filter Farmer'}
                        </label>
                        <select
                          value={reportFarmerFilter}
                          onChange={(e) => setReportFarmerFilter(e.target.value)}
                          className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                        >
                          <option value="all">सभी किसान (All Farmers)</option>
                          {state.farmers.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.code} — {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 block">
                          10-दिन कुल {shiftType === 'morning' ? 'सुबह' : 'शाम'} एंट्रियाँ
                        </span>
                        <span className="text-base font-bold text-slate-900 mt-0.5 block">
                          {sum.entryCount}
                        </span>
                      </div>
                      <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200">
                        <span className="text-blue-900 font-semibold block">
                          10-दिन कुल {shiftType === 'morning' ? 'सुबह' : 'शाम'} दूध (लीटर)
                        </span>
                        <span className="text-base font-bold text-blue-900 mt-0.5 block">
                          {formatNumber(sum.totalLiters, 3)} L
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 block">औसत FAT / SNF</span>
                        <span className="text-base font-bold text-slate-900 mt-0.5 block">
                          {formatNumber(sum.avgFat)} / {formatNumber(sum.avgSnf)}
                        </span>
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                        <span className="text-emerald-900 font-semibold block">
                          10-दिन कुल {shiftType === 'morning' ? 'सुबह' : 'शाम'} राशि
                        </span>
                        <span className="text-base font-bold text-emerald-800 mt-0.5 block">
                          {formatWholeCurrency(sum.totalAmount)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <table className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="py-2 px-1 sm:px-2.5 text-left border border-slate-300">तारीख</th>
                            <th className="py-2 px-1 sm:px-2 text-right border border-slate-300">
                              {shiftType === 'morning' ? 'सुबह' : 'शाम'} L
                            </th>
                            <th className="py-2 px-1 sm:px-2 text-center border border-slate-300 bg-amber-50/70 text-amber-950">
                              FAT
                            </th>
                            <th className="py-2 px-1 sm:px-2 text-center border border-slate-300 bg-indigo-50/70 text-indigo-950">
                              SNF
                            </th>
                            <th className="py-2 px-1 sm:px-2 text-right border border-slate-300">रेट</th>
                            <th className="py-2 px-1 sm:px-2.5 text-right border border-slate-300">
                              {shiftType === 'morning' ? 'सुबह' : 'शाम'} राशि
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {shiftDayRows.map((r) => (
                            <tr key={r.date} className="hover:bg-slate-50">
                              <td className="py-1.5 px-1 sm:px-2.5 font-mono font-bold text-slate-900 whitespace-nowrap border border-slate-300">
                                {formatDateDMY(r.date)}
                                <span className="text-[10px] text-slate-400 ml-0.5">({r.count})</span>
                              </td>
                              <td className="py-1.5 px-1 sm:px-2 text-right font-extrabold text-blue-900 whitespace-nowrap border border-slate-300">
                                {formatNumber(r.liters, 2)}
                              </td>
                              <td className="py-1.5 px-1 sm:px-2 text-center font-extrabold text-amber-950 bg-amber-50/30 whitespace-nowrap border border-slate-300">
                                {formatNumber(r.avgFat, 1)}
                              </td>
                              <td className="py-1.5 px-1 sm:px-2 text-center font-extrabold text-indigo-950 bg-indigo-50/30 whitespace-nowrap border border-slate-300">
                                {formatNumber(r.avgSnf, 1)}
                              </td>
                              <td className="py-1.5 px-1 sm:px-2 text-right font-bold text-blue-900 whitespace-nowrap border border-slate-300">
                                {r.avgRate !== null ? `₹${r.avgRate.toFixed(1)}` : '—'}
                              </td>
                              <td className="py-1.5 px-1 sm:px-2.5 text-right font-extrabold text-emerald-800 whitespace-nowrap border border-slate-300">
                                {formatWholeCurrency(r.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-blue-50/80 font-extrabold tabular-nums">
                            <td className="py-2 px-1 sm:px-2.5 border border-slate-300">
                              कुल ({formatDateDMY(fromDate)} से {formatDateDMY(toDate)})
                            </td>
                            <td className="py-2 px-1 sm:px-2 text-right text-blue-900 whitespace-nowrap border border-slate-300">
                              {formatNumber(sum.totalLiters, 2)}
                            </td>
                            <td className="py-2 px-1 sm:px-2 text-center text-amber-950 bg-amber-50/60 whitespace-nowrap border border-slate-300">
                              {formatNumber(sum.avgFat, 1)}
                            </td>
                            <td className="py-2 px-1 sm:px-2 text-center text-indigo-950 bg-indigo-50/60 whitespace-nowrap border border-slate-300">
                              {formatNumber(sum.avgSnf, 1)}
                            </td>
                            <td className="py-2 px-1 sm:px-2 text-right text-blue-900 whitespace-nowrap border border-slate-300">
                              {sum.avgRate !== null ? `₹${sum.avgRate.toFixed(1)}` : '—'}
                            </td>
                            <td className="py-2 px-1 sm:px-2.5 text-right text-emerald-800 whitespace-nowrap border border-slate-300">
                              {formatWholeCurrency(sum.totalAmount)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}

            {/* REPORT 3: 10 दिन की सुबह-शाम की रिपोर्ट (10-Day Morning-Evening Report) */}
            {activeCleanReport === 'tenday' &&
              (() => {
                const { fromDate, toDate } = getTenDayCycleDates(billYearMonth, billCycle);
                const periodEntries = state.collections.filter(
                  (c) =>
                    c.date >= fromDate &&
                    c.date <= toDate &&
                    (reportFarmerFilter === 'all' || c.farmerId === reportFarmerFilter)
                );
                const mornEntries = periodEntries.filter((c) => c.shift === 'morning');
                const eveEntries = periodEntries.filter((c) => c.shift === 'evening');
                const mornSum = calculateCollectionSummary(mornEntries);
                const eveSum = calculateCollectionSummary(eveEntries);
                const totalSum = calculateCollectionSummary(periodEntries);

                // Build day-by-day rows from fromDate to toDate
                const startDay = Number(fromDate.slice(8, 10));
                const endDay = Number(toDate.slice(8, 10));
                const dayRows: Array<{
                  date: string;
                  mornLiters: number;
                  mornAmt: number;
                  eveLiters: number;
                  eveAmt: number;
                  totLiters: number;
                  totAmt: number;
                }> = [];
                for (let d = startDay; d <= endDay; d++) {
                  const dStr = `${billYearMonth}-${String(d).padStart(2, '0')}`;
                  const dMorn = mornEntries.filter((c) => c.date === dStr);
                  const dEve = eveEntries.filter((c) => c.date === dStr);
                  const mL = round3(dMorn.reduce((s, c) => s + c.liters, 0));
                  const mA = truncatePurchaseAmount(
                    dMorn.reduce((s, c) => s + truncatePurchaseAmount(c.totalAmount), 0)
                  );
                  const eL = round3(dEve.reduce((s, c) => s + c.liters, 0));
                  const eA = truncatePurchaseAmount(
                    dEve.reduce((s, c) => s + truncatePurchaseAmount(c.totalAmount), 0)
                  );
                  dayRows.push({
                    date: dStr,
                    mornLiters: mL,
                    mornAmt: mA,
                    eveLiters: eL,
                    eveAmt: eA,
                    totLiters: round3(mL + eL),
                    totAmt: mA + eA,
                  });
                }

                return (
                  <div
                    data-testid="clean-report-view-tenday"
                    className="space-y-4 pt-2 border-t border-slate-100"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 no-print">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? 'महीना चुनें' : 'Month'}
                        </label>
                        <input
                          type="month"
                          value={billYearMonth}
                          onChange={(e) => setBillYearMonth(e.target.value)}
                          className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? '10-दिन की अवधि' : '10-Day Period'}
                        </label>
                        <select
                          value={billCycle}
                          onChange={(e) => setBillCycle(Number(e.target.value) as 1 | 2 | 3)}
                          className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                        >
                          <option value={1}>1 से 10 तारीख (Cycle 1)</option>
                          <option value={2}>11 से 20 तारीख (Cycle 2)</option>
                          <option value={3}>21 से महीने के अंत तक (Cycle 3)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? 'किसान चुनें (वैकल्पिक)' : 'Filter Farmer'}
                        </label>
                        <select
                          value={reportFarmerFilter}
                          onChange={(e) => setReportFarmerFilter(e.target.value)}
                          className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                        >
                          <option value="all">सभी किसान (All Farmers)</option>
                          {state.farmers.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.code} — {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 block">10-दिन सुबह का दूध / राशि</span>
                        <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                          {formatNumber(mornSum.totalLiters, 3)} L ·{' '}
                          {formatWholeCurrency(mornSum.totalAmount)}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-500 block">10-दिन शाम का दूध / राशि</span>
                        <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                          {formatNumber(eveSum.totalLiters, 3)} L ·{' '}
                          {formatWholeCurrency(eveSum.totalAmount)}
                        </span>
                      </div>
                      <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200">
                        <span className="text-blue-900 font-semibold block">
                          10-दिन कुल दूध · FAT/SNF
                        </span>
                        <span className="text-sm font-bold text-blue-900 mt-0.5 block">
                          {formatNumber(totalSum.totalLiters, 3)} L ·{' '}
                          {formatNumber(totalSum.avgFat)}/{formatNumber(totalSum.avgSnf)}
                        </span>
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                        <span className="text-emerald-900 font-semibold block">
                          10-दिन कुल खरीद राशि
                        </span>
                        <span className="text-base font-bold text-emerald-800 mt-0.5 block">
                          {formatWholeCurrency(totalSum.totalAmount)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <table className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="py-2 px-1.5 sm:px-2.5 text-left border border-slate-300">तारीख</th>
                            <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">सुबह (L / ₹)</th>
                            <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">शाम (L / ₹)</th>
                            <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">कुल (L / ₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dayRows.map((r) => (
                            <tr key={r.date} className="hover:bg-slate-50">
                              <td className="py-1.5 px-1.5 sm:px-2.5 font-mono font-bold text-slate-900 whitespace-nowrap border border-slate-300">
                                {formatDateDMY(r.date)}
                              </td>
                              <td className="py-1.5 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                                <span className="block font-bold text-slate-900 leading-tight">
                                  {formatNumber(r.mornLiters, 2)} L
                                </span>
                                <span className="block text-xs font-semibold text-slate-600 leading-tight">
                                  {formatWholeCurrency(r.mornAmt)}
                                </span>
                              </td>
                              <td className="py-1.5 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                                <span className="block font-bold text-slate-900 leading-tight">
                                  {formatNumber(r.eveLiters, 2)} L
                                </span>
                                <span className="block text-xs font-semibold text-slate-600 leading-tight">
                                  {formatWholeCurrency(r.eveAmt)}
                                </span>
                              </td>
                              <td className="py-1.5 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                                <span className="block font-extrabold text-blue-900 leading-tight">
                                  {formatNumber(r.totLiters, 2)} L
                                </span>
                                <span className="block text-xs font-extrabold text-emerald-800 leading-tight">
                                  {formatWholeCurrency(r.totAmt)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-blue-50/80 font-extrabold tabular-nums">
                            <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                              कुल ({formatDateDMY(fromDate)} से {formatDateDMY(toDate)})
                            </td>
                            <td className="py-2 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                              <span className="block leading-tight">
                                {formatNumber(mornSum.totalLiters, 2)} L
                              </span>
                              <span className="block text-xs text-slate-700 leading-tight">
                                {formatWholeCurrency(mornSum.totalAmount)}
                              </span>
                            </td>
                            <td className="py-2 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                              <span className="block leading-tight">
                                {formatNumber(eveSum.totalLiters, 2)} L
                              </span>
                              <span className="block text-xs text-slate-700 leading-tight">
                                {formatWholeCurrency(eveSum.totalAmount)}
                              </span>
                            </td>
                            <td className="py-2 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                              <span className="block text-blue-900 leading-tight">
                                {formatNumber(totalSum.totalLiters, 2)} L
                              </span>
                              <span className="block text-xs text-emerald-800 leading-tight">
                                {formatWholeCurrency(totalSum.totalAmount)}
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}

            {/* REPORT 4: लाभ-हानि रिपोर्ट (Profit & Loss Report) */}
            {activeCleanReport === 'profit_loss' &&
              (() => {
                const { fromDate, toDate } = getTenDayCycleDates(billYearMonth, billCycle);
                const periodCollections = state.collections.filter(
                  (c) => c.date >= fromDate && c.date <= toDate
                );
                const periodSales = state.sales.filter(
                  (s) => s.date >= fromDate && s.date <= toDate
                );
                const mornPL = calculatePureProfitLoss(
                  periodCollections.filter((c) => c.shift === 'morning'),
                  periodSales.filter((s) => s.shift === 'morning')
                );
                const evePL = calculatePureProfitLoss(
                  periodCollections.filter((c) => c.shift === 'evening'),
                  periodSales.filter((s) => s.shift === 'evening')
                );
                const totalPL = calculatePureProfitLoss(periodCollections, periodSales);

                const startDay = Number(fromDate.slice(8, 10));
                const endDay = Number(toDate.slice(8, 10));
                const plRows: Array<{
                  date: string;
                  buyLiters: number;
                  buyAmt: number;
                  saleLiters: number;
                  saleAmt: number;
                  netDiff: number;
                  isProfit: boolean;
                }> = [];

                for (let d = startDay; d <= endDay; d++) {
                  const dStr = `${billYearMonth}-${String(d).padStart(2, '0')}`;
                  const dCol = periodCollections.filter((c) => c.date === dStr);
                  const dSal = periodSales.filter((s) => s.date === dStr);
                  const dPL = calculatePureProfitLoss(dCol, dSal);
                  plRows.push({
                    date: dStr,
                    buyLiters: dPL.purchasedLiters,
                    buyAmt: dPL.purchaseAmount,
                    saleLiters: dPL.soldLiters,
                    saleAmt: dPL.saleAmount,
                    netDiff: dPL.netDifference,
                    isProfit: dPL.isProfit,
                  });
                }

                return (
                  <div
                    data-testid="clean-report-view-profit-loss"
                    className="space-y-4 pt-2 border-t border-slate-100"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 no-print">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? 'महीना चुनें' : 'Month'}
                        </label>
                        <input
                          type="month"
                          value={billYearMonth}
                          onChange={(e) => setBillYearMonth(e.target.value)}
                          className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-xl tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {lang === 'hi' ? '10-दिन की अवधि' : '10-Day Period'}
                        </label>
                        <select
                          value={billCycle}
                          onChange={(e) => setBillCycle(Number(e.target.value) as 1 | 2 | 3)}
                          className="w-full min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                        >
                          <option value={1}>1 से 10 तारीख (Cycle 1)</option>
                          <option value={2}>11 से 20 तारीख (Cycle 2)</option>
                          <option value={3}>21 से महीने के अंत तक (Cycle 3)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                      <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200">
                        <span className="text-blue-900 font-semibold block">
                          कुल दूध खरीद (Purchase)
                        </span>
                        <span className="text-sm font-bold text-blue-900 mt-0.5 block">
                          {formatNumber(totalPL.purchasedLiters, 3)} L ·{' '}
                          {formatWholeCurrency(totalPL.purchaseAmount)}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-700 font-semibold block">
                          कुल दूध बिक्री (Wholesale Sale)
                        </span>
                        <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                          {formatNumber(totalPL.soldLiters, 3)} L ·{' '}
                          {formatCurrency(totalPL.saleAmount)}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-slate-600 block">सुबह व शाम का लाभ/हानि</span>
                        <span className="text-xs font-bold text-slate-900 mt-0.5 block">
                          सुबह: {mornPL.netDifference >= 0 ? '+' : ''}
                          {formatCurrency(mornPL.netDifference)} | शाम:{' '}
                          {evePL.netDifference >= 0 ? '+' : ''}
                          {formatCurrency(evePL.netDifference)}
                        </span>
                      </div>
                      <div
                        data-testid="clean-report-pl-net-card"
                        className={`p-3 rounded-xl border-2 ${
                          totalPL.isProfit
                            ? 'bg-emerald-50 border-emerald-400'
                            : 'bg-rose-50 border-rose-400'
                        }`}
                      >
                        <span className="text-slate-800 font-bold block">
                          शुद्ध लाभ / हानि (बिक्री - खरीद)
                        </span>
                        <span
                          className={`text-base font-extrabold mt-0.5 block ${
                            totalPL.isProfit ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {totalPL.netDifference >= 0
                            ? `+${formatCurrency(totalPL.netDifference)} (लाभ)`
                            : `${formatCurrency(totalPL.netDifference)} (हानि)`}
                        </span>
                      </div>
                    </div>

                    <div>
                      <table className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="py-2 px-1.5 sm:px-2.5 text-left border border-slate-300">तारीख</th>
                            <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">खरीद (L / ₹)</th>
                            <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">बिक्री (L / ₹)</th>
                            <th className="py-2 px-1.5 sm:px-2.5 text-right border border-slate-300">लाभ / हानि</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plRows.map((r) => (
                            <tr key={r.date} className="hover:bg-slate-50">
                              <td className="py-1.5 px-1.5 sm:px-2.5 font-mono font-bold text-slate-900 whitespace-nowrap border border-slate-300">
                                {formatDateDMY(r.date)}
                              </td>
                              <td className="py-1.5 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                                <span className="block font-bold text-slate-900 leading-tight">
                                  {formatNumber(r.buyLiters, 2)} L
                                </span>
                                <span className="block text-xs font-semibold text-slate-600 leading-tight">
                                  {formatWholeCurrency(r.buyAmt)}
                                </span>
                              </td>
                              <td className="py-1.5 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                                <span className="block font-bold text-slate-900 leading-tight">
                                  {formatNumber(r.saleLiters, 2)} L
                                </span>
                                <span className="block text-xs font-semibold text-slate-600 leading-tight">
                                  {formatCurrency(r.saleAmt)}
                                </span>
                              </td>
                              <td
                                className={`py-1.5 px-1.5 sm:px-2.5 text-right font-extrabold whitespace-nowrap border border-slate-300 ${
                                  r.isProfit ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {r.netDiff >= 0
                                  ? `+${formatCurrency(r.netDiff)}`
                                  : formatCurrency(r.netDiff)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-blue-50/80 font-extrabold tabular-nums">
                            <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                              कुल ({formatDateDMY(fromDate)} से {formatDateDMY(toDate)})
                            </td>
                            <td className="py-2 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                              <span className="block leading-tight">
                                {formatNumber(totalPL.purchasedLiters, 2)} L
                              </span>
                              <span className="block text-xs text-slate-700 leading-tight">
                                {formatWholeCurrency(totalPL.purchaseAmount)}
                              </span>
                            </td>
                            <td className="py-2 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                              <span className="block leading-tight">
                                {formatNumber(totalPL.soldLiters, 2)} L
                              </span>
                              <span className="block text-xs text-slate-700 leading-tight">
                                {formatCurrency(totalPL.saleAmount)}
                              </span>
                            </td>
                            <td
                              className={`py-2 px-1.5 sm:px-2.5 text-right whitespace-nowrap border border-slate-300 ${
                                totalPL.isProfit ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {totalPL.netDifference >= 0
                                ? `+${formatCurrency(totalPL.netDifference)}`
                                : formatCurrency(totalPL.netDifference)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 no-print">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              {lang === 'hi'
                ? 'किसान का 10-दिन बिल बनाएँ (10-Day Cycle Farmer Bill)'
                : '10-Day Cycle Farmer Billing'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {lang === 'hi'
                ? 'चक्र 1: 1 से 10 तारीख · चक्र 2: 11 से 20 तारीख · चक्र 3: 21 से महीने के अंत तक'
                : 'Cycle 1: 1–10 · Cycle 2: 11–20 · Cycle 3: 21–End of Month'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'hi' ? 'किसान चुनें' : 'Select Farmer'}
                </label>
                <select
                  value={billFarmerId}
                  onChange={(e) => setBillFarmerId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                >
                  <option value="">{lang === 'hi' ? '-- किसान चुनें --' : '-- Select --'}</option>
                  {state.farmers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.code} — {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'hi' ? 'महीना और वर्ष' : 'Month & Year'}
                </label>
                <input
                  type="month"
                  value={billYearMonth}
                  onChange={(e) => setBillYearMonth(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === 'hi' ? '10-दिन का चक्र चुनें' : '10-Day Cycle'}
                </label>
                <select
                  value={billCycle}
                  onChange={(e) => setBillCycle(Number(e.target.value) as 1 | 2 | 3)}
                  className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                >
                  <option value={1}>
                    {lang === 'hi' ? 'चक्र 1: 1 से 10 तारीख' : 'Cycle 1: 1st to 10th'}
                  </option>
                  <option value={2}>
                    {lang === 'hi' ? 'चक्र 2: 11 से 20 तारीख' : 'Cycle 2: 11th to 20th'}
                  </option>
                  <option value={3}>
                    {lang === 'hi'
                      ? 'चक्र 3: 21 से महीने के अंत तक'
                      : 'Cycle 3: 21st to End of Month'}
                  </option>
                </select>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleCreateOrUpdateBill}
                  className="w-full min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl"
                >
                  {lang === 'hi' ? '10-दिन का बिल बनाएँ / खोलें' : 'Generate / Open Bill'}
                </button>
              </div>
            </div>
          </div>

          {/* Printable Bill Preview */}
          {activeBill && (
            <div className="bg-white border-2 border-blue-200 rounded-2xl p-6 space-y-4">
              {/* Stale Bill Warning if underlying entries changed after bill creation */}
              {(() => {
                const f = state.farmers.find((x) => x.id === activeBill.farmerId);
                if (!f) return null;
                const currentHash = computeBillSnapshotHash(
                  f,
                  state.collections,
                  state.advancesAndPayments,
                  state.cattleFeed,
                  activeBill.toDate
                );
                if (currentHash !== activeBill.snapshotHash) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between gap-2 text-xs text-amber-900 no-print">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          {lang === 'hi'
                            ? 'चेतावनी: इस बिल के बनने के बाद पुराने रिकॉर्ड में बदलाव किया गया है। कृपया बिल को पुनर्गणना (Recalculate) करें।'
                            : 'Warning: Underlying records were modified after this bill was generated. Please recalculate.'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCreateOrUpdateBill}
                        className="px-3 py-1.5 bg-amber-600 text-white font-semibold rounded-lg flex items-center gap-1 shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        {lang === 'hi' ? 'बिल पुनर्गणना करें' : 'Recalculate'}
                      </button>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 gap-3">
                <div>
                  <h3 className="text-xl font-bold text-blue-900">
                    {state.dairyName || 'Ujalaa Dairy'} — 10-दिन का किसान दूध बिल
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                    बिल नं: <strong>{activeBill.billNumber}</strong> · अवधि:{' '}
                    <strong>
                      {formatDateDMY(activeBill.fromDate)} से {formatDateDMY(activeBill.toDate)}
                    </strong>
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-1">
                    किसान: {activeBill.farmerCode} — {activeBill.farmerName}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 no-print">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    {lang === 'hi' ? 'प्रिंट / PDF सेव करें' : 'Print / Save PDF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openBillWhatsApp(activeBill)}
                    className="min-h-[40px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-4 h-4" />
                    {lang === 'hi' ? 'WhatsApp पर भेजें' : 'Share on WhatsApp'}
                  </button>
                </div>
              </div>

              {/* Morning vs Evening Summary & Final Net Payable (Whole Integer Only) */}
              <div
                data-testid="ten-day-bill-summary"
                className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums"
              >
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">सुबह का दूध / राशि</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">
                    {formatNumber(activeBill.morningLiters, 3)} L ·{' '}
                    {formatWholeCurrency(activeBill.morningAmount)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">शाम का दूध / राशि</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">
                    {formatNumber(activeBill.eveningLiters, 3)} L ·{' '}
                    {formatWholeCurrency(activeBill.eveningAmount)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">कुल लीटर · औसत FAT/SNF</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">
                    {formatNumber(activeBill.totalLiters, 3)} L ·{' '}
                    {formatNumber(activeBill.avgFat)}/{formatNumber(activeBill.avgSnf)}
                  </span>
                </div>
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-blue-900 font-semibold block">कुल दूध राशि (पूर्णांक)</span>
                  <span
                    data-testid="bill-total-milk-amount"
                    className="font-bold text-blue-900 text-sm mt-0.5 block"
                  >
                    {formatWholeCurrency(activeBill.totalMilkAmount)}
                  </span>
                </div>
              </div>

              {/* Bordered 10-Day Bill Saved Milk Entries Grid (Liters | FAT | SNF | Rate | Amount) */}
              {(() => {
                const billEntries = state.collections
                  .filter(
                    (c) =>
                      c.farmerId === activeBill.farmerId &&
                      c.date >= activeBill.fromDate &&
                      c.date <= activeBill.toDate
                  )
                  .sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift));

                return (
                  <div className="space-y-1.5">
                    <h4 className="text-xs sm:text-sm font-extrabold text-slate-800">
                      {lang === 'hi'
                        ? `इस बिल की सेव की गई दूध एंट्रियाँ (${billEntries.length} एंट्री · ${formatDateDMY(activeBill.fromDate)} से ${formatDateDMY(activeBill.toDate)})`
                        : `Saved Milk Entries in this Bill (${billEntries.length})`}
                    </h4>
                    <table
                      data-testid="bill-saved-entries-table"
                      className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums"
                    >
                      <thead>
                        <tr className="bg-blue-50 text-blue-950">
                          <th className="py-1.5 px-1 sm:px-2 text-left font-bold border border-slate-300">
                            {lang === 'hi' ? 'तारीख / शिफ्ट' : 'Date / Shift'}
                          </th>
                          <th className="py-1.5 px-1 sm:px-2 text-right font-bold border border-slate-300">
                            {lang === 'hi' ? 'लीटर' : 'Liters'}
                          </th>
                          <th className="py-1.5 px-1 sm:px-2 text-center font-bold border border-slate-300 bg-amber-50/80 text-amber-950">
                            FAT
                          </th>
                          <th className="py-1.5 px-1 sm:px-2 text-center font-bold border border-slate-300 bg-indigo-50/80 text-indigo-950">
                            SNF
                          </th>
                          <th className="py-1.5 px-1 sm:px-2 text-right font-bold border border-slate-300">
                            {lang === 'hi' ? 'रेट' : 'Rate'}
                          </th>
                          <th className="py-1.5 px-1 sm:px-2 text-right font-bold border border-slate-300">
                            {lang === 'hi' ? 'राशि' : 'Amount'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {billEntries.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-4 text-center text-slate-500 border border-slate-300">
                              {lang === 'hi'
                                ? 'इस 10-दिन की अवधि में कोई दूध एंट्री नहीं है।'
                                : 'No milk entries in this 10-day period.'}
                            </td>
                          </tr>
                        ) : (
                          billEntries.map((ce) => (
                            <tr key={ce.id} className="hover:bg-slate-50">
                              <td className="py-1.5 px-1 sm:px-2 border border-slate-300 whitespace-nowrap">
                                <span className="font-mono font-bold text-slate-900 block leading-tight">
                                  {formatDateDMY(ce.date)}
                                </span>
                                <span className="text-[11px] font-semibold text-slate-600 block leading-tight">
                                  {ce.shift === 'morning' ? 'सुबह' : 'शाम'} ·{' '}
                                  {ce.milkType === 'cow' ? 'गाय' : 'भैंस'}
                                </span>
                              </td>
                              <td className="py-1.5 px-1 sm:px-2 text-right font-extrabold text-slate-900 whitespace-nowrap border border-slate-300">
                                {formatNumber(ce.liters, 2)}
                              </td>
                              <td className="py-1.5 px-1 sm:px-2 text-center font-extrabold text-amber-950 bg-amber-50/40 whitespace-nowrap border border-slate-300">
                                {formatNumber(ce.fat, 1)}
                              </td>
                              <td className="py-1.5 px-1 sm:px-2 text-center font-extrabold text-indigo-950 bg-indigo-50/40 whitespace-nowrap border border-slate-300">
                                {formatNumber(ce.snf, 1)}
                              </td>
                              <td className="py-1.5 px-1 sm:px-2 text-right font-bold text-blue-900 whitespace-nowrap border border-slate-300">
                                ₹{formatNumber(ce.rate, 2)}
                              </td>
                              <td className="py-1.5 px-1 sm:px-2 text-right font-extrabold text-emerald-800 whitespace-nowrap border border-slate-300">
                                {formatWholeCurrency(ce.totalAmount)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs tabular-nums">
                <div
                  data-testid="bill-previous-adjustment-box"
                  className={`p-3 rounded-xl border ${
                    activeBill.previousBalance > 0
                      ? 'bg-amber-50 border-amber-300'
                      : activeBill.previousBalance < 0
                      ? 'bg-indigo-50 border-indigo-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <span className="text-slate-700 font-semibold block">
                    {activeBill.previousBalance > 0
                      ? 'पिछली अवधि का कम भुगतान बकाया (+)'
                      : activeBill.previousBalance < 0
                      ? 'पिछली अवधि का ज्यादा भुगतान कटा (-)'
                      : 'पिछला बकाया / समायोजन'}
                  </span>
                  <span
                    data-testid="bill-previous-balance"
                    className={`font-bold text-sm mt-0.5 block ${
                      activeBill.previousBalance > 0
                        ? 'text-amber-900'
                        : activeBill.previousBalance < 0
                        ? 'text-indigo-800'
                        : 'text-slate-900'
                    }`}
                  >
                    {activeBill.previousBalance > 0
                      ? `+${formatWholeCurrency(activeBill.previousBalance)}`
                      : activeBill.previousBalance < 0
                      ? `-${formatWholeCurrency(Math.abs(activeBill.previousBalance))}`
                      : formatWholeCurrency(0)}
                  </span>
                  {activeBill.previousCycleLabelHi && (
                    <span className="text-[10px] text-slate-600 block mt-0.5">
                      ({activeBill.previousCycleLabelHi})
                    </span>
                  )}
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">एडवांस कटौती (-)</span>
                  <span className="font-bold text-red-600 mt-0.5 block">
                    {formatWholeCurrency(activeBill.advancesInPeriod)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">दाना/अन्य कटौती (-)</span>
                  <span className="font-bold text-red-600 mt-0.5 block">
                    {formatWholeCurrency(
                      activeBill.feedDeductionsInPeriod + activeBill.inlineDeductions
                    )}
                  </span>
                </div>

                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200">
                  <span className="text-blue-950 font-semibold block">
                    कुल देय बिल (भुगतान पूर्व)
                  </span>
                  <span
                    data-testid="bill-payable-before-payment"
                    className="font-bold text-blue-900 text-sm mt-0.5 block"
                  >
                    {formatWholeCurrency(
                      activeBill.billPayableBeforePayment ??
                        activeBill.netPayable + activeBill.paymentsInPeriod
                    )}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-600 font-semibold block">
                    इस अवधि ({getCycleLabelHi(activeBill.cycle)}) का भुगतान (-)
                  </span>
                  <span
                    data-testid="bill-payments-in-period"
                    className="font-bold text-emerald-700 text-sm mt-0.5 block"
                  >
                    {formatWholeCurrency(activeBill.paymentsInPeriod)}
                  </span>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    activeBill.netPayable > 0
                      ? 'bg-emerald-50 border-emerald-300'
                      : activeBill.netPayable < 0
                      ? 'bg-indigo-50 border-indigo-300'
                      : 'bg-slate-100 border-slate-300'
                  }`}
                >
                  <span className="text-slate-900 font-bold block">
                    {activeBill.netPayable > 0
                      ? 'अंतिम शेष देय (कम भुगतान)'
                      : activeBill.netPayable < 0
                      ? 'अतिरिक्त/ज्यादा भुगतान (-)'
                      : 'अंतिम देय राशि (चुकता)'}
                  </span>
                  <span
                    data-testid="bill-net-payable"
                    className={`font-bold text-base mt-0.5 block ${
                      activeBill.netPayable > 0
                        ? 'text-emerald-800'
                        : activeBill.netPayable < 0
                        ? 'text-indigo-800'
                        : 'text-slate-800'
                    }`}
                  >
                    {activeBill.netPayable < 0
                      ? `-${formatWholeCurrency(Math.abs(activeBill.netPayable))}`
                      : formatWholeCurrency(activeBill.netPayable)}
                  </span>
                  <span
                    data-testid="bill-carry-forward-note"
                    className="text-[10px] font-semibold text-slate-700 block mt-0.5"
                  >
                    {activeBill.netPayable > 0
                      ? 'अगली अवधि के बिल में जुड़ेगा (+)'
                      : activeBill.netPayable < 0
                      ? 'अगली अवधि के बिल से कटेगा (-)'
                      : 'हिसाब बराबर'}
                  </span>
                </div>
              </div>

              {/* Explicit Previous & Next Period Adjustment Explanation Banner on Bill */}
              <div
                data-testid="bill-adjustment-banner"
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 tabular-nums"
              >
                <div className="font-bold text-slate-800">
                  10-दिन अवधि ({getCycleLabelHi(activeBill.cycle)}) भुगतान व समायोजन विवरण:
                </div>
                {activeBill.previousBalance !== 0 ? (
                  <div className="text-slate-700">
                    • पिछली अवधि ({activeBill.previousCycleLabelHi || 'पिछला चक्र'}) से समायोजन:{' '}
                    {activeBill.previousBalance > 0 ? (
                      <strong className="text-amber-800">
                        कम भुगतान का बकाया +{formatWholeCurrency(activeBill.previousBalance)} इस बिल में जोड़ा गया है।
                      </strong>
                    ) : (
                      <strong className="text-indigo-700">
                        ज्यादा भुगतान का -{formatWholeCurrency(Math.abs(activeBill.previousBalance))} इस बिल से घटाया गया है।
                      </strong>
                    )}
                  </div>
                ) : (
                  <div className="text-slate-600">
                    • पिछली अवधि से कोई कम या ज्यादा भुगतान समायोजन बकाया नहीं है (₹0)।
                  </div>
                )}
                <div className="text-slate-700">
                  • इस अवधि ({getCycleLabelHi(activeBill.cycle)}) का कुल देय बिल:{' '}
                  <strong>
                    {formatWholeCurrency(
                      activeBill.billPayableBeforePayment ??
                        activeBill.netPayable + activeBill.paymentsInPeriod
                    )}
                  </strong>{' '}
                  | भुगतान हुआ: <strong>{formatWholeCurrency(activeBill.paymentsInPeriod)}</strong>{' '}
                  |{' '}
                  {activeBill.netPayable > 0 ? (
                    <strong className="text-emerald-800">
                      शेष +{formatWholeCurrency(activeBill.netPayable)} (यदि कम भुगतान रहता है तो अगली अवधि में जुड़ेगा)
                    </strong>
                  ) : activeBill.netPayable < 0 ? (
                    <strong className="text-indigo-700">
                      अतिरिक्त भुगतान -{formatWholeCurrency(Math.abs(activeBill.netPayable))} (अगली अवधि के बिल से कटेगा)
                    </strong>
                  ) : (
                    <strong className="text-emerald-700">बिल पूर्ण रूप से चुकता (₹0)</strong>
                  )}
                </div>
              </div>

              {/* Inline Quick Payment for this 10-Day Bill Period */}
              <form
                onSubmit={handleQuickBillPayment}
                className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-end gap-3 no-print"
              >
                <div className="flex-1">
                  <label className="block text-xs font-bold text-blue-950 mb-1">
                    इस अवधि ({getCycleLabelHi(activeBill.cycle)}) का भुगतान सीधे दर्ज करें (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    data-testid="quick-bill-pay-amount"
                    placeholder={`जैसे ${Math.max(0, activeBill.netPayable)}`}
                    value={quickBillPayAmount}
                    onChange={(e) => setQuickBillPayAmount(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono bg-white border border-blue-300 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-blue-950 mb-1">तरीका</label>
                  <select
                    value={quickBillPayMethod}
                    onChange={(e) => setQuickBillPayMethod(e.target.value as PaymentMethod)}
                    className="min-h-[40px] px-3 py-1.5 text-xs bg-white border border-blue-300 rounded-lg"
                  >
                    <option value="cash">नकद (Cash)</option>
                    <option value="upi">UPI</option>
                    <option value="bank">बैंक (Bank)</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-blue-950 mb-1">टिप्पणी</label>
                  <input
                    type="text"
                    placeholder="वैकल्पिक नोट"
                    value={quickBillPayNotes}
                    onChange={(e) => setQuickBillPayNotes(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 text-xs bg-white border border-blue-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  data-testid="quick-bill-pay-submit-btn"
                  className="min-h-[40px] px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg shrink-0"
                >
                  भुगतान जोड़ें और बिल अपडेट करें
                </button>
              </form>
            </div>
          )}

          {/* Saved Bills Archive */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5 no-print">
            <h3 className="text-sm font-bold text-slate-900 mb-2.5">
              {lang === 'hi'
                ? `पुराने सेव किए गए 10-दिन के बिल (${state.bills.length})`
                : `Saved 10-Day Bills (${state.bills.length})`}
            </h3>
            <table className="w-full text-xs sm:text-sm border-collapse border border-slate-300 tabular-nums">
              <thead>
                <tr className="bg-slate-50">
                  <th className="py-2 px-1 sm:px-2.5 text-left border border-slate-300">किसान / बिल नं</th>
                  <th className="py-2 px-1 sm:px-2.5 text-left border border-slate-300">अवधि (DD-MM-YYYY)</th>
                  <th className="py-2 px-1 sm:px-2.5 text-right border border-slate-300">दूध · FAT/SNF · देय</th>
                  <th className="py-2 px-1 sm:px-2 text-center border border-slate-300">खोलें</th>
                </tr>
              </thead>
              <tbody>
                {state.bills.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500 border border-slate-300">
                      {lang === 'hi' ? 'कोई पुराना बिल सेव नहीं है' : 'No saved bills yet'}
                    </td>
                  </tr>
                ) : (
                  state.bills.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-2 px-1 sm:px-2.5 border border-slate-300">
                        <span className="font-bold text-slate-900 block leading-tight">
                          {b.farmerCode} — {b.farmerName}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono block leading-tight mt-0.5">
                          {b.billNumber}
                        </span>
                      </td>
                      <td className="py-2 px-1 sm:px-2.5 border border-slate-300">
                        <span className="font-mono font-bold text-slate-800 block leading-tight">
                          {formatDateDMY(b.fromDate)}
                        </span>
                        <span className="font-mono font-semibold text-slate-600 text-[11px] block leading-tight">
                          से {formatDateDMY(b.toDate)}
                        </span>
                      </td>
                      <td className="py-2 px-1 sm:px-2.5 text-right whitespace-nowrap border border-slate-300">
                        <span className="font-extrabold text-emerald-700 text-xs sm:text-sm block leading-tight">
                          {formatWholeCurrency(b.netPayable)}
                        </span>
                        <div className="mt-1 inline-grid grid-cols-3 divide-x divide-slate-300 border border-slate-300 rounded bg-slate-50 text-[11px] font-bold">
                          <span className="px-1 py-0.5 text-slate-900">{formatNumber(b.totalLiters, 1)}L</span>
                          <span className="px-1 py-0.5 text-amber-950 bg-amber-50/70">F:{formatNumber(b.avgFat, 1)}</span>
                          <span className="px-1 py-0.5 text-indigo-950 bg-indigo-50/70">S:{formatNumber(b.avgSnf, 1)}</span>
                        </div>
                      </td>
                      <td className="py-2 px-1 sm:px-2 text-center border border-slate-300">
                        <button
                          type="button"
                          onClick={() => setActiveBill(b)}
                          className="px-2 py-1 bg-blue-50 text-blue-700 font-bold rounded-lg whitespace-nowrap"
                        >
                          {lang === 'hi' ? 'खोलें' : 'Open'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Farmer Confirmation Modal (Protects Historical Records - Rule 9) */}
      <ConfirmDialog
        open={Boolean(deleteFarmerTarget)}
        title={
          deleteFarmerTarget && farmerHasHistory(deleteFarmerTarget.id)
            ? lang === 'hi'
              ? 'किसान के पुराने रिकॉर्ड मौजूद हैं — निष्क्रिय (Inactive) करें?'
              : 'Farmer Has Historical Records — Mark Inactive?'
            : lang === 'hi'
            ? 'किसान प्रोफाइल हटाएँ?'
            : 'Delete Farmer Profile?'
        }
        message={
          deleteFarmerTarget && farmerHasHistory(deleteFarmerTarget.id)
            ? lang === 'hi'
              ? `किसान "${deleteFarmerTarget.name}" की पुरानी दूध/खाता एंट्रियाँ मौजूद हैं। पुराने रिकॉर्ड नष्ट न हों, इसके लिए इस किसान को स्थायी रूप से हटाने के बजाय "Inactive (निष्क्रिय)" किया जाएगा।`
              : `Farmer "${deleteFarmerTarget.name}" has historical records. To protect past accounting, they will be marked Inactive instead of deleting past records.`
            : lang === 'hi'
            ? `क्या आप वाकई किसान "${deleteFarmerTarget?.name}" को हटाना चाहते हैं?`
            : `Are you sure you want to delete farmer "${deleteFarmerTarget?.name}"?`
        }
        confirmLabel={
          deleteFarmerTarget && farmerHasHistory(deleteFarmerTarget.id)
            ? lang === 'hi'
              ? 'हाँ, Inactive करें'
              : 'Mark Inactive'
            : lang === 'hi'
            ? 'हाँ, हटाएँ'
            : 'Delete'
        }
        onCancel={() => setDeleteFarmerTarget(null)}
        onConfirm={() => {
          if (deleteFarmerTarget) {
            if (farmerHasHistory(deleteFarmerTarget.id)) {
              onSaveFarmer({ ...deleteFarmerTarget, active: false }, true);
            } else {
              onDeleteFarmer(deleteFarmerTarget.id);
            }
          }
          setDeleteFarmerTarget(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteAdvId)}
        title={lang === 'hi' ? 'एडवांस/भुगतान हटाएँ?' : 'Delete Advance/Payment?'}
        message={
          lang === 'hi'
            ? 'क्या आप इस एडवांस/भुगतान रिकॉर्ड को हटाना चाहते हैं? किसान का बकाया बैलेंस तुरंत अपडेट हो जाएगा।'
            : 'Delete this transaction? Farmer balance will recalculate automatically.'
        }
        onCancel={() => setDeleteAdvId(null)}
        onConfirm={() => {
          if (deleteAdvId) onDeleteAdvancePayment(deleteAdvId);
          setDeleteAdvId(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteFeedId)}
        title={lang === 'hi' ? 'दाना/पशु-आहार एंट्री हटाएँ?' : 'Delete Cattle Feed Entry?'}
        message={
          lang === 'hi'
            ? 'क्या आप इस दाना/पशु-आहार रिकॉर्ड को हटाना चाहते हैं?'
            : 'Delete this cattle feed entry?'
        }
        onCancel={() => setDeleteFeedId(null)}
        onConfirm={() => {
          if (deleteFeedId) onDeleteCattleFeed(deleteFeedId);
          setDeleteFeedId(null);
        }}
      />

      <WhatsAppPreviewModal
        open={waModal.open}
        title={lang === 'hi' ? '10-दिन का बिल WhatsApp पर भेजें' : 'Share 10-Day Bill on WhatsApp'}
        phone={waModal.phone}
        message={waModal.message}
        lang={lang}
        onClose={() => setWaModal((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
};
