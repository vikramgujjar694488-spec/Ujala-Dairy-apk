import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  FileSpreadsheet,
  FileText,
  Globe,
  LayoutDashboard,
  Milk,
  Settings,
  Truck,
  Users,
} from 'lucide-react';
import {
  AdvancePaymentEntry,
  CattleFeedEntry,
  Customer,
  DairyAppState,
  ExpenseEntry,
  Farmer,
  Language,
  MilkCollectionEntry,
  MilkType,
  RateChartMatrix,
  ShiftType,
  TenDayBill,
  WholesaleSaleEntry,
} from './types/dairy';
import { lookupRateFromChart, round2 } from './utils/dairyCalculations';
import {
  loadDairyState,
  loadStateFromIndexedDB,
  saveDairyState,
} from './utils/storage';
import { DashboardView } from './components/DashboardView';
import { CollectionView } from './components/CollectionView';
import { WholesaleAndReconciliationView } from './components/WholesaleAndReconciliationView';
import {
  FarmerSectionSubTab,
  FarmersAndLedgerView,
} from './components/FarmersAndLedgerView';
import { RateChartAndExpensesView } from './components/RateChartAndExpensesView';
import { ReportsAndBackupView } from './components/ReportsAndBackupView';

type MainTab =
  | 'dashboard'
  | 'collection'
  | 'sales'
  | 'farmers'
  | 'ledger'
  | 'ratechart'
  | 'reports'
  | 'settings';

export default function App() {
  const [state, setState] = useState<DairyAppState>(() => loadDairyState());
  const [activeTab, setActiveTab] = useState<MainTab>('dashboard');
  const [farmerSubTab, setFarmerSubTab] = useState<FarmerSectionSubTab>('farmers');
  const [rateSubTab, setRateSubTab] = useState<'ratechart' | 'expenses'>('ratechart');
  const [reportSubTab, setReportSubTab] = useState<'reports' | 'backup' | 'settings'>('reports');

  // Recover from IndexedDB if LocalStorage was empty
  useEffect(() => {
    let mounted = true;
    loadStateFromIndexedDB().then((idbState) => {
      if (!mounted || !idbState) return;
      setState((prev) => {
        if (
          prev.farmers.length === 0 &&
          prev.collections.length === 0 &&
          (idbState.farmers.length > 0 || idbState.collections.length > 0)
        ) {
          return idbState;
        }
        return prev;
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Persist every state change to LocalStorage + IndexedDB
  useEffect(() => {
    saveDairyState(state);
  }, [state]);

  const lang = state.language;

  // Navigation handler supporting all 14 logical screens
  const handleNavigate = (target: string) => {
    if (target === 'dashboard') setActiveTab('dashboard');
    else if (target === 'collection') setActiveTab('collection');
    else if (target === 'sales') setActiveTab('sales');
    else if (target === 'farmers') {
      setFarmerSubTab('farmers');
      setActiveTab('farmers');
    } else if (target === 'ledger') {
      setFarmerSubTab('ledger');
      setActiveTab('ledger');
    } else if (target === 'advances') {
      setFarmerSubTab('advances');
      setActiveTab('ledger');
    } else if (target === 'feed') {
      setFarmerSubTab('feed');
      setActiveTab('ledger');
    } else if (target === 'billing') {
      setFarmerSubTab('billing');
      setActiveTab('ledger');
    } else if (target === 'ratechart') {
      setRateSubTab('ratechart');
      setActiveTab('ratechart');
    } else if (target === 'expenses') {
      setRateSubTab('expenses');
      setActiveTab('ratechart');
    } else if (target === 'reports') {
      setReportSubTab('reports');
      setActiveTab('reports');
    } else if (target === 'backup') {
      setReportSubTab('backup');
      setActiveTab('settings');
    } else if (target === 'settings') {
      setReportSubTab('settings');
      setActiveTab('settings');
    }
  };

  // --- State Updaters ---
  const handleChangeDate = (date: string) => {
    setState((prev) => ({ ...prev, selectedDate: date }));
  };

  const handleChangeShift = (shift: ShiftType) => {
    setState((prev) => ({ ...prev, selectedShift: shift }));
  };

  const handleToggleLanguage = () => {
    setState((prev) => ({
      ...prev,
      language: prev.language === 'hi' ? 'en' : 'hi',
    }));
  };

  const handleSaveCollection = (entry: MilkCollectionEntry, isEdit: boolean) => {
    setState((prev) => ({
      ...prev,
      collections: isEdit
        ? prev.collections.map((c) => (c.id === entry.id ? entry : c))
        : [...prev.collections, entry],
    }));
  };

  const handleDeleteCollection = (id: string) => {
    setState((prev) => ({
      ...prev,
      collections: prev.collections.filter((c) => c.id !== id),
    }));
  };

  const handleToggleFarmerLeave = (
    date: string,
    shift: ShiftType,
    farmerId: string,
    reason?: string
  ) => {
    setState((prev) => {
      const exists = prev.leaves.some(
        (l) => l.date === date && l.shift === shift && l.farmerId === farmerId
      );
      if (exists) {
        return {
          ...prev,
          leaves: prev.leaves.filter(
            (l) => !(l.date === date && l.shift === shift && l.farmerId === farmerId)
          ),
        };
      }
      return {
        ...prev,
        leaves: [
          ...prev.leaves,
          {
            id: `leave_${Date.now()}`,
            date,
            shift,
            farmerId,
            reason,
          },
        ],
      };
    });
  };

  const handleSaveSale = (entry: WholesaleSaleEntry, isEdit: boolean) => {
    setState((prev) => ({
      ...prev,
      sales: isEdit
        ? prev.sales.map((s) => (s.id === entry.id ? entry : s))
        : [...prev.sales, entry],
    }));
  };

  const handleDeleteSale = (id: string) => {
    setState((prev) => ({
      ...prev,
      sales: prev.sales.filter((s) => s.id !== id),
    }));
  };

  const handleSaveCustomer = (customer: Customer, isEdit: boolean) => {
    setState((prev) => ({
      ...prev,
      customers: isEdit
        ? (prev.customers || []).map((c) => (c.id === customer.id ? customer : c))
        : [...(prev.customers || []), customer],
    }));
  };

  const handleDeleteCustomer = (id: string) => {
    setState((prev) => ({
      ...prev,
      customers: (prev.customers || []).filter((c) => c.id !== id),
    }));
  };

  const handleSaveFarmer = (farmer: Farmer, isEdit: boolean) => {
    setState((prev) => ({
      ...prev,
      farmers: isEdit
        ? prev.farmers.map((f) => (f.id === farmer.id ? farmer : f))
        : [...prev.farmers, farmer],
    }));
  };

  const handleDeleteFarmer = (id: string) => {
    setState((prev) => ({
      ...prev,
      farmers: prev.farmers.filter((f) => f.id !== id),
    }));
  };

  const handleSaveAdvancePayment = (entry: AdvancePaymentEntry, isEdit: boolean) => {
    setState((prev) => ({
      ...prev,
      advancesAndPayments: isEdit
        ? prev.advancesAndPayments.map((a) => (a.id === entry.id ? entry : a))
        : [...prev.advancesAndPayments, entry],
    }));
  };

  const handleDeleteAdvancePayment = (id: string) => {
    setState((prev) => ({
      ...prev,
      advancesAndPayments: prev.advancesAndPayments.filter((a) => a.id !== id),
    }));
  };

  const handleSaveCattleFeed = (entry: CattleFeedEntry, isEdit: boolean) => {
    setState((prev) => ({
      ...prev,
      cattleFeed: isEdit
        ? prev.cattleFeed.map((cf) => (cf.id === entry.id ? entry : cf))
        : [...prev.cattleFeed, entry],
    }));
  };

  const handleDeleteCattleFeed = (id: string) => {
    setState((prev) => ({
      ...prev,
      cattleFeed: prev.cattleFeed.filter((cf) => cf.id !== id),
    }));
  };

  const handleSaveBill = (bill: TenDayBill) => {
    setState((prev) => {
      const exists = prev.bills.some((b) => b.id === bill.id);
      return {
        ...prev,
        bills: exists
          ? prev.bills.map((b) => (b.id === bill.id ? bill : b))
          : [bill, ...prev.bills],
      };
    });
  };

  const handleDeleteBill = (id: string) => {
    setState((prev) => ({
      ...prev,
      bills: prev.bills.filter((b) => b.id !== id),
    }));
  };

  const handleSaveRateChart = (milkType: MilkType, chart: RateChartMatrix | null) => {
    // Rule 17 & TEST 22: Updating rate chart NEVER modifies existing milk collection entries automatically
    setState((prev) => ({
      ...prev,
      rateCharts: {
        ...prev.rateCharts,
        [milkType]: chart,
      },
    }));
  };

  const handleRecalculateOldEntries = (milkType: MilkType): number => {
    const chart = state.rateCharts[milkType];
    if (!chart) return 0;
    let updatedCount = 0;

    setState((prev) => ({
      ...prev,
      collections: prev.collections.map((c) => {
        if (c.milkType !== milkType) return c;
        const lk = lookupRateFromChart(chart, c.fat, c.snf);
        if (lk.found && lk.rate !== null) {
          updatedCount++;
          const newTotal = round2(c.liters * lk.rate);
          const newNet = round2(newTotal - (c.deduction || 0));
          return {
            ...c,
            rate: lk.rate,
            totalAmount: newTotal,
            netPayable: newNet,
          };
        }
        return c;
      }),
    }));

    return updatedCount;
  };

  const handleSaveExpense = (entry: ExpenseEntry, isEdit: boolean) => {
    setState((prev) => ({
      ...prev,
      expenses: isEdit
        ? prev.expenses.map((e) => (e.id === entry.id ? entry : e))
        : [...prev.expenses, entry],
    }));
  };

  const handleDeleteExpense = (id: string) => {
    setState((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((e) => e.id !== id),
    }));
  };

  const handleAddExpenseCategory = (category: string) => {
    setState((prev) => ({
      ...prev,
      expenseCategories: Array.from(new Set([...prev.expenseCategories, category])),
    }));
  };

  const handleUpdateSettings = (
    dairyName: string,
    dairyPhone: string,
    dairyAddress: string,
    language: Language
  ) => {
    setState((prev) => ({
      ...prev,
      dairyName,
      dairyPhone,
      dairyAddress,
      language,
    }));
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 pb-20 lg:pb-8">
      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (5 Desktop Nav Links) — Zone 3 (Primary Action) */}
      <header className="sticky top-0 z-40 bg-blue-700 text-white border-b border-blue-800 shadow-xs no-print">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 sm:gap-8 px-3 sm:px-6 h-11 sm:h-14">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 text-left"
          >
            {state.dairyName || 'Ujalaa Dairy'}
          </button>

          {/* Zone 2: 5 concise single-line text navigation links on desktop */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-blue-100">
            <button
              type="button"
              onClick={() => handleNavigate('dashboard')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'dashboard' ? 'text-white underline underline-offset-4 font-bold' : ''
              }`}
            >
              {lang === 'hi' ? 'डैशबोर्ड' : 'Dashboard'}
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('collection')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'collection' ? 'text-white underline underline-offset-4 font-bold' : ''
              }`}
            >
              {lang === 'hi' ? 'दूध कलेक्शन' : 'Collection'}
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('sales')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'sales' ? 'text-white underline underline-offset-4 font-bold' : ''
              }`}
            >
              {lang === 'hi' ? 'बिक्री व मिलान' : 'Wholesale & P/L'}
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('farmers')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'farmers' || activeTab === 'ledger'
                  ? 'text-white underline underline-offset-4 font-bold'
                  : ''
              }`}
            >
              {lang === 'hi' ? 'किसान व खाता' : 'Farmers & Ledger'}
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('ratechart')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'ratechart' ? 'text-white underline underline-offset-4 font-bold' : ''
              }`}
            >
              {lang === 'hi' ? 'रेट चार्ट व खर्च' : 'Rate Chart & Expense'}
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('reports')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === 'reports' || activeTab === 'settings'
                  ? 'text-white underline underline-offset-4 font-bold'
                  : ''
              }`}
            >
              {lang === 'hi' ? 'रिपोर्ट व बैकअप' : 'Reports & Backup'}
            </button>
          </nav>

          {/* Zone 3: Language Switch & HTML Download Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleLanguage}
              aria-label="Toggle Language Hindi or English"
              className="min-h-[32px] sm:min-h-[38px] px-2.5 sm:px-3 py-1 text-xs font-bold text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'hi' ? 'English' : 'हिंदी'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2.5 sm:px-6 py-2 sm:py-5">
        {activeTab === 'dashboard' && (
          <DashboardView
            state={state}
            onChangeDate={handleChangeDate}
            onChangeShift={handleChangeShift}
            onNavigate={handleNavigate}
          />
        )}

        {activeTab === 'collection' && (
          <CollectionView
            state={state}
            onChangeDate={handleChangeDate}
            onChangeShift={handleChangeShift}
            onSaveEntry={handleSaveCollection}
            onDeleteEntry={handleDeleteCollection}
            onToggleFarmerLeave={handleToggleFarmerLeave}
            onNavigate={handleNavigate}
          />
        )}

        {activeTab === 'sales' && (
          <WholesaleAndReconciliationView
            state={state}
            onChangeDate={handleChangeDate}
            onChangeShift={handleChangeShift}
            onSaveSale={handleSaveSale}
            onDeleteSale={handleDeleteSale}
            onSaveCustomer={handleSaveCustomer}
            onDeleteCustomer={handleDeleteCustomer}
          />
        )}

        {(activeTab === 'farmers' || activeTab === 'ledger') && (
          <FarmersAndLedgerView
            state={state}
            initialSubTab={farmerSubTab}
            onSaveFarmer={handleSaveFarmer}
            onDeleteFarmer={handleDeleteFarmer}
            onSaveAdvancePayment={handleSaveAdvancePayment}
            onDeleteAdvancePayment={handleDeleteAdvancePayment}
            onSaveCattleFeed={handleSaveCattleFeed}
            onDeleteCattleFeed={handleDeleteCattleFeed}
            onSaveBill={handleSaveBill}
            onDeleteBill={handleDeleteBill}
          />
        )}

        {activeTab === 'ratechart' && (
          <RateChartAndExpensesView
            state={state}
            initialSection={rateSubTab}
            onSaveRateChart={handleSaveRateChart}
            onRecalculateOldEntries={handleRecalculateOldEntries}
            onSaveExpense={handleSaveExpense}
            onDeleteExpense={handleDeleteExpense}
            onAddExpenseCategory={handleAddExpenseCategory}
          />
        )}

        {(activeTab === 'reports' || activeTab === 'settings') && (
          <ReportsAndBackupView
            state={state}
            initialSub={reportSubTab}
            onRestoreState={(newState) => setState(newState)}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Section 21: डैशबोर्ड, कलेक्शन, बिक्री, किसान, हिसाब, रिपोर्ट, सेटिंग) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-7 items-center h-16 no-print"
      >
        {[
          {
            id: 'dashboard',
            hi: 'डैशबोर्ड',
            en: 'Home',
            icon: LayoutDashboard,
            isActive: activeTab === 'dashboard',
          },
          {
            id: 'collection',
            hi: 'कलेक्शन',
            en: 'Collect',
            icon: Milk,
            isActive: activeTab === 'collection',
          },
          {
            id: 'sales',
            hi: 'बिक्री',
            en: 'Sales',
            icon: Truck,
            isActive: activeTab === 'sales',
          },
          {
            id: 'farmers',
            hi: 'किसान',
            en: 'Farmers',
            icon: Users,
            isActive: activeTab === 'farmers' && farmerSubTab === 'farmers',
          },
          {
            id: 'ledger',
            hi: 'हिसाब',
            en: 'Ledger',
            icon: BookOpen,
            isActive: activeTab === 'ledger' || (activeTab === 'farmers' && farmerSubTab !== 'farmers'),
          },
          {
            id: 'ratechart',
            hi: 'रेट/खर्च',
            en: 'Rates',
            icon: FileSpreadsheet,
            isActive: activeTab === 'ratechart',
          },
          {
            id: 'reports',
            hi: 'रिपोर्ट/बैकअप',
            en: 'Reports',
            icon: FileText,
            isActive: activeTab === 'reports' || activeTab === 'settings',
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              className={`min-h-[48px] flex flex-col items-center justify-center px-1 transition-colors ${
                item.isActive
                  ? 'text-blue-600 font-bold'
                  : 'text-slate-500 hover:text-slate-900 font-medium'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-full">
                {lang === 'hi' ? item.hi : item.en}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
