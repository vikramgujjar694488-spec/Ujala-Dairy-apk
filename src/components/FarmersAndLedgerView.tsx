import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Edit2,
  FileText,
  MessageSquare,
  Package,
  Printer,
  RefreshCw,
  Trash2,
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
  calculateFarmerLedger,
  computeBillSnapshotHash,
  formatCurrency,
  formatNumber,
  generateTenDayBillData,
  round2,
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
  const [advType, setAdvType] = useState<'advance' | 'payment'>('advance');
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

  // 5. 10-Day Billing State
  const [billFarmerId, setBillFarmerId] = useState<string>(state.farmers[0]?.id || '');
  const [billYearMonth, setBillYearMonth] = useState<string>(state.selectedDate.slice(0, 7));
  const [billCycle, setBillCycle] = useState<1 | 2 | 3>(1);
  const [activeBill, setActiveBill] = useState<TenDayBill | null>(null);

  // WhatsApp Preview Modal
  const [waModal, setWaModal] = useState<{ open: boolean; phone: string; message: string }>({
    open: false,
    phone: '',
    message: '',
  });

  const scheduleLabel = (sched: FarmerShiftSchedule) => {
    if (sched === 'morning') return lang === 'hi' ? 'केवल सुबह' : 'Morning Only';
    if (sched === 'evening') return lang === 'hi' ? 'केवल शाम' : 'Evening Only';
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
    setFSchedule(f.shiftSchedule);
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
      shiftSchedule: fSchedule,
      openingBalance: round2(Number(fOpeningBal) || 0),
      notes: fNotes.trim(),
      active: existing ? existing.active : true,
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

  const openBillWhatsApp = (bill: TenDayBill) => {
    const farmer = state.farmers.find((f) => f.id === bill.farmerId);
    const msg = [
      `*${state.dairyName || 'Ujalaa Dairy'} — 10-दिन का दूध बिल*`,
      `बिल नं: ${bill.billNumber}`,
      `किसान: ${bill.farmerCode} - ${bill.farmerName}`,
      `अवधि: ${bill.fromDate} से ${bill.toDate}`,
      `--------------------------------`,
      `सुबह का दूध: ${formatNumber(bill.morningLiters, 3)} L (${formatCurrency(bill.morningAmount)})`,
      `शाम का दूध: ${formatNumber(bill.eveningLiters, 3)} L (${formatCurrency(bill.eveningAmount)})`,
      `कुल दूध: ${formatNumber(bill.totalLiters, 3)} L`,
      `औसत FAT: ${formatNumber(bill.avgFat)} | औसत SNF: ${formatNumber(bill.avgSnf)}`,
      `कुल दूध राशि: ${formatCurrency(bill.totalMilkAmount)}`,
      `पिछला बकाया: ${formatCurrency(bill.previousBalance)}`,
      `एडवांस कटौती: ${formatCurrency(bill.advancesInPeriod)}`,
      `दाना/पशु-आहार कटौती: ${formatCurrency(bill.feedDeductionsInPeriod)}`,
      `अन्य कटौती/भुगतान: ${formatCurrency(bill.inlineDeductions + bill.paymentsInPeriod)}`,
      `--------------------------------`,
      `*अंतिम देय राशि (Net Payable): ${formatCurrency(bill.netPayable)}*`,
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
          {lang === 'hi' ? '9. किसान प्रबंधन' : '9. Farmers'}
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
          {lang === 'hi' ? '10. किसान का खाता (Ledger)' : '10. Farmer Ledger'}
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
          {lang === 'hi' ? '11. एडवांस और भुगतान' : '11. Advance & Payments'}
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
          {lang === 'hi' ? '12. दाना और पशु-आहार' : '12. Cattle Feed'}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('billing')}
          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
            subTab === 'billing'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          {lang === 'hi' ? '13. 10-दिन बिलिंग' : '13. 10-Day Billing'}
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
          <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
            <h3 className="text-base font-bold text-slate-900 mb-3">
              {lang === 'hi'
                ? `पंजीकृत किसानों की सूची (${state.farmers.length}) — नाम पर क्लिक कर पूरा खाता देखें`
                : `Registered Farmers (${state.farmers.length}) — Click name to open Ledger`}
            </h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-blue-50 text-blue-950 border-b border-blue-100">
                  <th className="py-2.5 px-3 text-left">ID</th>
                  <th className="py-2.5 px-3 text-left">
                    {lang === 'hi' ? 'किसान का नाम — निर्धारित समय' : 'Farmer Name — Shift Schedule'}
                  </th>
                  <th className="py-2.5 px-3 text-left">{lang === 'hi' ? 'मोबाइल / गाँव' : 'Mobile'}</th>
                  <th className="py-2.5 px-3 text-right">
                    {lang === 'hi' ? 'कुल दूध (L)' : 'Total Milk'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    {lang === 'hi' ? 'वर्तमान शेष बकाया' : 'Closing Balance'}
                  </th>
                  <th className="py-2.5 px-3 text-center">
                    {lang === 'hi' ? 'स्थिति' : 'Status'}
                  </th>
                  <th className="py-2.5 px-3 text-center">
                    {lang === 'hi' ? 'कार्य' : 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {state.farmers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
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
                        <td className="py-2.5 px-3 font-bold text-slate-700">{f.code}</td>
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => {
                              setLedgerFarmerId(f.id);
                              setSubTab('ledger');
                            }}
                            className="text-left font-bold text-blue-700 hover:underline"
                          >
                            {f.name} — {scheduleLabel(f.shiftSchedule)}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {f.mobile || '—'} {f.village ? `· ${f.village}` : ''}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold">
                          {formatNumber(ledger.totalLiters, 3)} L
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-blue-900">
                          {formatCurrency(ledger.closingBalance)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => onSaveFarmer({ ...f, active: !f.active }, true)}
                            className={`px-2 py-1 rounded-md text-[11px] font-semibold ${
                              f.active
                                ? 'text-emerald-700 bg-emerald-50'
                                : 'text-slate-500 bg-slate-100'
                            }`}
                          >
                            {f.active
                              ? lang === 'hi'
                                ? 'सक्रिय (Active)'
                                : 'Active'
                              : lang === 'hi'
                              ? 'निष्क्रिय (Inactive)'
                              : 'Inactive'}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEditFarmer(f)}
                              aria-label={`Edit ${f.name}`}
                              className="min-h-[32px] px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 rounded-lg font-semibold flex items-center gap-1"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteFarmerTarget(f)}
                              aria-label={`Delete ${f.name}`}
                              className="min-h-[32px] px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-semibold flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
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
      )}

      {/* SUBTAB 2: INDIVIDUAL FARMER LEDGER / PASSBOOK (Section 10) */}
      {subTab === 'ledger' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
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
                    {formatCurrency(ledgerData.totalMilkAmount)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block">
                    {lang === 'hi' ? 'कुल एडवांस' : 'Total Advance'}
                  </span>
                  <span className="font-bold text-amber-700 text-sm tabular-nums mt-0.5 block">
                    {formatCurrency(ledgerData.totalAdvances)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block">
                    {lang === 'hi' ? 'दाना/अन्य कटौती' : 'Feed/Deductions'}
                  </span>
                  <span className="font-bold text-red-600 text-sm tabular-nums mt-0.5 block">
                    {formatCurrency(
                      ledgerData.totalFeedDeductions + ledgerData.totalInlineDeductions
                    )}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block">
                    {lang === 'hi' ? 'कुल भुगतान किया' : 'Total Paid'}
                  </span>
                  <span className="font-bold text-slate-900 text-sm tabular-nums mt-0.5 block">
                    {formatCurrency(ledgerData.totalPayments)}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200">
                  <span className="text-emerald-900 font-semibold block">
                    {lang === 'hi' ? 'शेष बकाया (Balance)' : 'Closing Balance'}
                  </span>
                  <span className="font-bold text-emerald-800 text-sm tabular-nums mt-0.5 block">
                    {formatCurrency(ledgerData.closingBalance)}
                  </span>
                </div>
              </div>

              {/* Ledger Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                      <th className="py-2.5 px-3 text-left">{lang === 'hi' ? 'तारीख' : 'Date'}</th>
                      <th className="py-2.5 px-3 text-left">{lang === 'hi' ? 'शिफ्ट' : 'Shift'}</th>
                      <th className="py-2.5 px-3 text-left">
                        {lang === 'hi' ? 'विवरण' : 'Particulars'}
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        {lang === 'hi' ? 'लीटर (FAT/SNF/रेट)' : 'Milk Details'}
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        {lang === 'hi' ? 'दूध राशि (+)' : 'Milk Cr (+)'}
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        {lang === 'hi' ? 'एडवांस/दाना/भुगतान (-)' : 'Deductions/Paid (-)'}
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        {lang === 'hi' ? 'बाकी बकाया' : 'Running Balance'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
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
                            <td className="py-2 px-3">{row.date}</td>
                            <td className="py-2 px-3">
                              {row.shift === 'morning'
                                ? 'सुबह'
                                : row.shift === 'evening'
                                ? 'शाम'
                                : '—'}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-900">
                              {lang === 'hi' ? row.descriptionHi : row.descriptionEn}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-600">
                              {row.liters
                                ? `${formatNumber(row.liters, 3)} L (${row.fat}/${row.snf} @ ₹${row.rate})`
                                : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-semibold text-blue-700">
                              {row.milkAmount > 0 ? formatCurrency(row.milkAmount) : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-semibold text-red-600">
                              {debitTotal > 0 ? formatCurrency(debitTotal) : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-slate-900">
                              {formatCurrency(row.runningBalance)}
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
                ? 'किसान एडवांस और भुगतान एंट्री (Advance & Payment)'
                : 'Farmer Advance & Settlement Payment'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {lang === 'hi'
                ? 'प्रत्येक लेन-देन की यूनिक ID बनती है ताकि एक ही एडवांस दो बार न जुड़े और दूध खरीद राशि में दोबारा न गिना जाए'
                : 'Each transaction has a unique ID to prevent duplicate entry'}
            </p>

            <form onSubmit={handleSaveAdvSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'तारीख *' : 'Date *'}
                  </label>
                  <input
                    type="date"
                    value={advDate}
                    onChange={(e) => setAdvDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'किसान चुनें *' : 'Farmer *'}
                  </label>
                  <select
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
                    value={advType}
                    onChange={(e) => setAdvType(e.target.value as 'advance' | 'payment')}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="advance">
                      {lang === 'hi' ? 'एडवांस दिया (Advance Given)' : 'Advance Given'}
                    </option>
                    <option value="payment">
                      {lang === 'hi' ? 'बिल भुगतान किया (Settlement Payment)' : 'Bill Payment'}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'यूनिक रसीद/लेन-देन ID' : 'Unique Txn ID'}
                  </label>
                  <input
                    type="text"
                    placeholder={lang === 'hi' ? 'स्वतः या कस्टम (जैसे ADV-101)' : 'Auto or custom'}
                    value={advTxnCode}
                    onChange={(e) => setAdvTxnCode(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'राशि (₹) *' : 'Amount (₹) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="500.00"
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

          <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              {lang === 'hi' ? 'एडवांस और भुगतान सूची' : 'Advances & Payments History'}
            </h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-2 px-3 text-left">ID</th>
                  <th className="py-2 px-3 text-left">{lang === 'hi' ? 'तारीख' : 'Date'}</th>
                  <th className="py-2 px-3 text-left">{lang === 'hi' ? 'किसान' : 'Farmer'}</th>
                  <th className="py-2 px-3 text-left">{lang === 'hi' ? 'प्रकार' : 'Type'}</th>
                  <th className="py-2 px-3 text-left">{lang === 'hi' ? 'तरीका' : 'Method'}</th>
                  <th className="py-2 px-3 text-right">{lang === 'hi' ? 'राशि' : 'Amount'}</th>
                  <th className="py-2 px-3 text-center">{lang === 'hi' ? 'कार्य' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {state.advancesAndPayments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      {lang === 'hi' ? 'अभी कोई रिकॉर्ड नहीं है' : 'No records yet'}
                    </td>
                  </tr>
                ) : (
                  state.advancesAndPayments.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 px-3 font-mono">{a.txnCode}</td>
                      <td className="py-2 px-3">{a.date}</td>
                      <td className="py-2 px-3 font-bold">{a.farmerName}</td>
                      <td className="py-2 px-3">
                        {a.type === 'advance' ? 'एडवांस (Advance)' : 'भुगतान (Payment)'}
                      </td>
                      <td className="py-2 px-3 uppercase">{a.paymentMethod}</td>
                      <td className="py-2 px-3 text-right font-bold">
                        {formatCurrency(a.amount)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setDeleteAdvId(a.id)}
                          className="px-2 py-1 bg-red-50 text-red-600 rounded-lg"
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
                    {lang === 'hi' ? 'तारीख *' : 'Date *'}
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

          <div className="bg-white border border-slate-200 rounded-2xl p-5 overflow-x-auto">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              {lang === 'hi' ? 'दाना और पशु-आहार रिकॉर्ड सूची' : 'Cattle Feed Records'}
            </h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-2 px-3 text-left">{lang === 'hi' ? 'तारीख' : 'Date'}</th>
                  <th className="py-2 px-3 text-left">{lang === 'hi' ? 'किसान' : 'Farmer'}</th>
                  <th className="py-2 px-3 text-left">{lang === 'hi' ? 'सामग्री' : 'Item'}</th>
                  <th className="py-2 px-3 text-right">
                    {lang === 'hi' ? 'मात्रा × कीमत' : 'Qty × Price'}
                  </th>
                  <th className="py-2 px-3 text-right">{lang === 'hi' ? 'कुल कीमत' : 'Total'}</th>
                  <th className="py-2 px-3 text-left">{lang === 'hi' ? 'प्रकार' : 'Mode'}</th>
                  <th className="py-2 px-3 text-center">{lang === 'hi' ? 'कार्य' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {state.cattleFeed.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      {lang === 'hi' ? 'अभी कोई रिकॉर्ड नहीं है' : 'No records yet'}
                    </td>
                  </tr>
                ) : (
                  state.cattleFeed.map((cf) => (
                    <tr key={cf.id}>
                      <td className="py-2 px-3">{cf.date}</td>
                      <td className="py-2 px-3 font-bold">{cf.farmerName}</td>
                      <td className="py-2 px-3">{cf.itemName}</td>
                      <td className="py-2 px-3 text-right">
                        {cf.quantity} × {formatCurrency(cf.unitPrice)}
                      </td>
                      <td className="py-2 px-3 text-right font-bold">
                        {formatCurrency(cf.totalAmount)}
                      </td>
                      <td className="py-2 px-3">
                        {cf.paymentMode === 'deduct_from_milk'
                          ? 'दूध खाते से कटौती'
                          : 'नकद प्राप्त'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setDeleteFeedId(cf.id)}
                          className="px-2 py-1 bg-red-50 text-red-600 rounded-lg"
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

      {/* SUBTAB 5: 10-DAY BILLING SYSTEM (Section 13) */}
      {subTab === 'billing' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 no-print">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              {lang === 'hi'
                ? '10-दिन का बिलिंग सिस्टम (10-Day Cycle Billing)'
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
                      {activeBill.fromDate} से {activeBill.toDate}
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

              {/* Morning vs Evening Summary & Final Net Payable */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">सुबह का दूध / राशि</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">
                    {formatNumber(activeBill.morningLiters, 3)} L ·{' '}
                    {formatCurrency(activeBill.morningAmount)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">शाम का दूध / राशि</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">
                    {formatNumber(activeBill.eveningLiters, 3)} L ·{' '}
                    {formatCurrency(activeBill.eveningAmount)}
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
                  <span className="text-blue-900 font-semibold block">कुल दूध राशि</span>
                  <span className="font-bold text-blue-900 text-sm mt-0.5 block">
                    {formatCurrency(activeBill.totalMilkAmount)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs tabular-nums">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">पिछला बकाया (+)</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">
                    {formatCurrency(activeBill.previousBalance)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">एडवांस (-)</span>
                  <span className="font-bold text-red-600 mt-0.5 block">
                    {formatCurrency(activeBill.advancesInPeriod)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">दाना/पशु-आहार (-)</span>
                  <span className="font-bold text-red-600 mt-0.5 block">
                    {formatCurrency(activeBill.feedDeductionsInPeriod)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block">अन्य कटौती/भुगतान (-)</span>
                  <span className="font-bold text-red-600 mt-0.5 block">
                    {formatCurrency(activeBill.inlineDeductions + activeBill.paymentsInPeriod)}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-300">
                  <span className="text-emerald-900 font-bold block">अंतिम देय राशि</span>
                  <span className="font-bold text-emerald-800 text-base mt-0.5 block">
                    {formatCurrency(activeBill.netPayable)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Saved Bills Archive */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 no-print overflow-x-auto">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              {lang === 'hi'
                ? `पुराने सेव किए गए 10-दिन के बिल (${state.bills.length})`
                : `Saved 10-Day Bills (${state.bills.length})`}
            </h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-2 px-3 text-left">बिल नं</th>
                  <th className="py-2 px-3 text-left">किसान</th>
                  <th className="py-2 px-3 text-left">अवधि</th>
                  <th className="py-2 px-3 text-right">कुल दूध</th>
                  <th className="py-2 px-3 text-right">दूध राशि</th>
                  <th className="py-2 px-3 text-right">अंतिम देय राशि</th>
                  <th className="py-2 px-3 text-center">खोलें</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {state.bills.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      {lang === 'hi' ? 'कोई पुराना बिल सेव नहीं है' : 'No saved bills yet'}
                    </td>
                  </tr>
                ) : (
                  state.bills.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono">{b.billNumber}</td>
                      <td className="py-2 px-3 font-bold">
                        {b.farmerCode} — {b.farmerName}
                      </td>
                      <td className="py-2 px-3">
                        {b.fromDate} से {b.toDate}
                      </td>
                      <td className="py-2 px-3 text-right">{formatNumber(b.totalLiters, 3)} L</td>
                      <td className="py-2 px-3 text-right">{formatCurrency(b.totalMilkAmount)}</td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-700">
                        {formatCurrency(b.netPayable)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setActiveBill(b)}
                          className="px-2.5 py-1 bg-blue-50 text-blue-700 font-semibold rounded-lg"
                        >
                          {lang === 'hi' ? 'बिल खोलें' : 'Open'}
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
