import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  CheckCircle2,
  Columns,
  Download,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import {
  DairyAppState,
  ExpenseEntry,
  MilkType,
  PaymentMethod,
  RateChartMatrix,
  ShiftType,
} from '../types/dairy';
import {
  classifyMilkType,
  ExcelImportMode,
  FlexibleExcelParseResult,
  formatCurrency,
  formatDateDMY,
  lookupRateFromChart,
  makeRateKey,
  parseExcelWithMode,
  round2,
} from '../utils/dairyCalculations';
import { ConfirmDialog } from './Modals';

interface RateChartAndExpensesViewProps {
  state: DairyAppState;
  initialSection?: 'ratechart' | 'expenses';
  onSaveRateChart: (milkType: MilkType, chart: RateChartMatrix | null) => void;
  onRecalculateOldEntries: (milkType: MilkType) => number;
  onSaveExpense: (entry: ExpenseEntry, isEdit: boolean) => void;
  onDeleteExpense: (id: string) => void;
  onAddExpenseCategory: (category: string) => void;
}

export const RateChartAndExpensesView: React.FC<RateChartAndExpensesViewProps> = ({
  state,
  initialSection = 'ratechart',
  onSaveRateChart,
  onRecalculateOldEntries,
  onSaveExpense,
  onDeleteExpense,
  onAddExpenseCategory,
}) => {
  const lang = state.language;
  const [activeSub, setActiveSub] = useState<'ratechart' | 'expenses'>(initialSection);

  React.useEffect(() => {
    setActiveSub(initialSection);
  }, [initialSection]);

  // Requirement 7: 3-Option Excel Import State
  const [activeChartTab, setActiveChartTab] = useState<MilkType>('cow');
  const [importOptionTab, setImportOptionTab] = useState<'option1' | 'option2' | 'option3'>(
    'option1'
  );
  const [importMode, setImportMode] = useState<ExcelImportMode>('auto_detect');
  const [manualFatCol, setManualFatCol] = useState<number>(0);
  const [manualSnfCol, setManualSnfCol] = useState<number>(1);
  const [manualRateCol, setManualRateCol] = useState<number>(2);

  const [workbookSheets, setWorkbookSheets] = useState<{
    milkType: MilkType;
    fileName: string;
    sheetNames: string[];
    sheetsData: Record<string, unknown[][]>;
  } | null>(null);
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [previewResult, setPreviewResult] = useState<
    (FlexibleExcelParseResult & { milkType: MilkType }) | null
  >(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // Rate Lookup Tester State
  const [searchFat, setSearchFat] = useState<string>('4.5');
  const [searchSnf, setSearchSnf] = useState<string>('8.5');

  // Confirmation Modals
  const [confirmRecalcType, setConfirmRecalcType] = useState<MilkType | null>(null);
  const [confirmClearType, setConfirmClearType] = useState<MilkType | null>(null);

  // Expense Form State
  const [editingExpId, setEditingExpId] = useState<string | null>(null);
  const [expDate, setExpDate] = useState<string>(state.selectedDate);
  const [expShift, setExpShift] = useState<ShiftType | 'general'>('general');
  const [expCat, setExpCat] = useState<string>(state.expenseCategories[0] || 'परिवहन');
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [expAmount, setExpAmount] = useState<string>('');
  const [expMethod, setExpMethod] = useState<PaymentMethod>('cash');
  const [expDesc, setExpDesc] = useState<string>('');
  const [expError, setExpError] = useState<string | null>(null);
  const [deleteExpId, setDeleteExpId] = useState<string | null>(null);

  // Re-run parser whenever mode, sheet, or manual column selection changes
  const runParseAndPreview = (
    grid: unknown[][],
    milkType: MilkType,
    fileName: string,
    sheetName: string,
    mode: ExcelImportMode,
    fatCol: number,
    snfCol: number,
    rateCol: number
  ) => {
    const parsed = parseExcelWithMode(grid, milkType, fileName, sheetName, mode, {
      fatCol,
      snfCol,
      rateCol,
    });
    if (parsed.detectedColumns && mode === 'auto_detect') {
      setManualFatCol(parsed.detectedColumns.fatCol);
      setManualSnfCol(parsed.detectedColumns.snfCol);
      setManualRateCol(parsed.detectedColumns.rateCol);
    }
    setPreviewResult({
      milkType,
      ...parsed,
    });
  };

  // Handle Excel (.xls / .xlsx / .csv) file selection
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, milkType: MilkType) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportNotice(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const sheetsData: Record<string, unknown[][]> = {};
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          sheetsData[name] = XLSX.utils.sheet_to_json(ws, {
            header: 1,
            defval: '',
          }) as unknown[][];
        }

        const firstSheet = wb.SheetNames[0];
        setWorkbookSheets({
          milkType,
          fileName: file.name,
          sheetNames: wb.SheetNames,
          sheetsData,
        });
        setSelectedSheetName(firstSheet);
        setActiveChartTab(milkType);

        runParseAndPreview(
          sheetsData[firstSheet],
          milkType,
          file.name,
          firstSheet,
          importMode,
          manualFatCol,
          manualSnfCol,
          manualRateCol
        );
      } catch {
        setPreviewResult({
          milkType,
          chart: null,
          detectedLayout: 'unknown',
          detectedColumns: null,
          confidence: 'none',
          needsUserConfirmation: false,
          columnsInfo: [],
          totalRowsRead: 0,
          validRowCount: 0,
          invalidOrEmptyRowCount: 0,
          duplicateCount: 0,
          duplicateKeys: [],
          previewRows: [],
          errors: [
            lang === 'hi'
              ? 'Excel फ़ाइल पढ़ने में त्रुटि हुई। कृपया वैध .xls, .xlsx या .csv फ़ाइल चुनें।'
              : 'Failed to read Excel file. Please select a valid .xls, .xlsx, or .csv file.',
          ],
          warnings: [],
        });
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheetName(sheetName);
    if (!workbookSheets) return;
    const grid = workbookSheets.sheetsData[sheetName];
    runParseAndPreview(
      grid,
      workbookSheets.milkType,
      workbookSheets.fileName,
      sheetName,
      importMode,
      manualFatCol,
      manualSnfCol,
      manualRateCol
    );
  };

  const handleModeChange = (
    newMode: ExcelImportMode,
    overrideCols?: { fatCol: number; snfCol: number; rateCol: number }
  ) => {
    setImportMode(newMode);
    const fc = overrideCols ? overrideCols.fatCol : manualFatCol;
    const sc = overrideCols ? overrideCols.snfCol : manualSnfCol;
    const rc = overrideCols ? overrideCols.rateCol : manualRateCol;
    if (overrideCols) {
      setManualFatCol(fc);
      setManualSnfCol(sc);
      setManualRateCol(rc);
    }
    if (workbookSheets && selectedSheetName) {
      const grid = workbookSheets.sheetsData[selectedSheetName];
      runParseAndPreview(
        grid,
        workbookSheets.milkType,
        workbookSheets.fileName,
        selectedSheetName,
        newMode,
        fc,
        sc,
        rc
      );
    }
  };

  const handleManualColumnChange = (role: 'fat' | 'snf' | 'rate', colIdx: number) => {
    const nextFat = role === 'fat' ? colIdx : manualFatCol;
    const nextSnf = role === 'snf' ? colIdx : manualSnfCol;
    const nextRate = role === 'rate' ? colIdx : manualRateCol;
    setManualFatCol(nextFat);
    setManualSnfCol(nextSnf);
    setManualRateCol(nextRate);

    const effectiveMode: ExcelImportMode =
      importMode === 'format_c' ? 'format_c' : 'manual_columns';
    setImportMode(effectiveMode);

    if (workbookSheets && selectedSheetName) {
      const grid = workbookSheets.sheetsData[selectedSheetName];
      runParseAndPreview(
        grid,
        workbookSheets.milkType,
        workbookSheets.fileName,
        selectedSheetName,
        effectiveMode,
        nextFat,
        nextSnf,
        nextRate
      );
    }
  };

  const handlePreviewMilkTypeChange = (newMilkType: MilkType) => {
    if (!workbookSheets || !selectedSheetName) return;
    const updatedWb = { ...workbookSheets, milkType: newMilkType };
    setWorkbookSheets(updatedWb);
    setActiveChartTab(newMilkType);
    const grid = updatedWb.sheetsData[selectedSheetName];
    runParseAndPreview(
      grid,
      newMilkType,
      updatedWb.fileName,
      selectedSheetName,
      importMode,
      manualFatCol,
      manualSnfCol,
      manualRateCol
    );
  };

  const confirmSavePreviewedChart = () => {
    if (!previewResult || !previewResult.chart) return;
    const mType = previewResult.milkType;
    onSaveRateChart(mType, previewResult.chart);
    setImportNotice(
      lang === 'hi'
        ? `${mType === 'cow' ? 'गाय' : 'भैंस'} का रेट चार्ट सफलतापूर्वक सेव हो गया! (कुल ${
            Object.keys(previewResult.chart.rates).length
          } रेट संयोजन · ${previewResult.chart.rowCount} SNF × ${previewResult.chart.colCount} FAT)`
        : `${mType === 'cow' ? 'Cow' : 'Buffalo'} Rate Chart saved (${
            Object.keys(previewResult.chart.rates).length
          } rates)!`
    );
    setPreviewResult(null);
    setWorkbookSheets(null);
  };

  // Sample Excel builders for Format A (FAT-SNF-Rate), Format B (SNF-FAT-Rate), and 2D Matrix Grid
  const buildFormatAGrid = (milkType: MilkType): (string | number)[][] => {
    const fats =
      milkType === 'cow'
        ? [3.0, 3.2, 3.5, 3.8, 4.0, 4.2, 4.5, 4.8, 5.0]
        : [5.1, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];
    const snfs = [7.8, 8.0, 8.2, 8.4, 8.5, 8.6, 8.8, 9.0];
    const rows: (string | number)[][] = [['FAT', 'SNF', 'Rate']];
    for (const fat of fats) {
      for (const snf of snfs) {
        const rate =
          milkType === 'cow'
            ? round2(fat * 5.2 + (snf - 7.5) * 12.0)
            : round2(fat * 6.5 + (snf - 7.5) * 14.0);
        rows.push([fat, snf, rate]);
      }
    }
    return rows;
  };

  const buildFormatBGrid = (milkType: MilkType): (string | number)[][] => {
    const fats =
      milkType === 'cow'
        ? [3.0, 3.2, 3.5, 3.8, 4.0, 4.2, 4.5, 4.8, 5.0]
        : [5.1, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];
    const snfs = [7.8, 8.0, 8.2, 8.4, 8.5, 8.6, 8.8, 9.0];
    const rows: (string | number)[][] = [['SNF', 'FAT', 'Rate']];
    for (const snf of snfs) {
      for (const fat of fats) {
        const rate =
          milkType === 'cow'
            ? round2(fat * 5.2 + (snf - 7.5) * 12.0)
            : round2(fat * 6.5 + (snf - 7.5) * 14.0);
        rows.push([snf, fat, rate]);
      }
    }
    return rows;
  };

  const buildStandardExcelGrid = (milkType: MilkType): (string | number)[][] => {
    const fats =
      milkType === 'cow'
        ? [3.0, 3.2, 3.5, 3.8, 4.0, 4.2, 4.5, 4.8, 5.0]
        : [5.1, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];
    const snfs = [7.8, 8.0, 8.2, 8.4, 8.5, 8.6, 8.8, 9.0];

    const header: (string | number)[] = ['SNF / FAT', ...fats];
    const rows: (string | number)[][] = [header];

    for (const snf of snfs) {
      const row: (string | number)[] = [snf];
      for (const fat of fats) {
        const baseRate =
          milkType === 'cow'
            ? round2(fat * 5.2 + (snf - 7.5) * 12.0)
            : round2(fat * 6.5 + (snf - 7.5) * 14.0);
        row.push(baseRate);
      }
      rows.push(row);
    }
    return rows;
  };

  const handleDownloadSampleExcel = (
    milkType: MilkType,
    layout: 'format_a' | 'format_b' | 'matrix' = 'format_a'
  ) => {
    const grid =
      layout === 'format_a'
        ? buildFormatAGrid(milkType)
        : layout === 'format_b'
        ? buildFormatBGrid(milkType)
        : buildStandardExcelGrid(milkType);
    const ws = XLSX.utils.aoa_to_sheet(grid);
    const wb = XLSX.utils.book_new();
    const sheetName = milkType === 'cow' ? 'Cow_Rate_Chart' : 'Buffalo_Rate_Chart';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const suffix =
      layout === 'format_a' ? 'FAT_SNF_Rate' : layout === 'format_b' ? 'SNF_FAT_Rate' : 'Matrix';
    XLSX.writeFile(
      wb,
      milkType === 'cow'
        ? `Ujalaa_Cow_${suffix}.xlsx`
        : `Ujalaa_Buffalo_${suffix}.xlsx`
    );
  };

  const handlePreviewSampleExcel = (
    milkType: MilkType,
    layout: 'format_a' | 'format_b' | 'matrix' = 'matrix'
  ) => {
    const grid =
      layout === 'format_a'
        ? buildFormatAGrid(milkType)
        : layout === 'format_b'
        ? buildFormatBGrid(milkType)
        : buildStandardExcelGrid(milkType);
    const suffix =
      layout === 'format_a'
        ? 'FormatA_FAT_SNF_Rate.xlsx'
        : layout === 'format_b'
        ? 'FormatB_SNF_FAT_Rate.xlsx'
        : 'Rate_Chart.xlsx';
    const fileName =
      milkType === 'cow' ? `Ujalaa_Cow_${suffix}` : `Ujalaa_Buffalo_${suffix}`;
    const sheetName = milkType === 'cow' ? 'Cow_Rate_Chart' : 'Buffalo_Rate_Chart';
    const targetMode: ExcelImportMode =
      layout === 'format_a'
        ? 'format_a'
        : layout === 'format_b'
        ? 'format_b'
        : 'auto_detect';

    setWorkbookSheets({
      milkType,
      fileName,
      sheetNames: [sheetName],
      sheetsData: { [sheetName]: grid },
    });
    setSelectedSheetName(sheetName);
    setActiveChartTab(milkType);
    setImportMode(targetMode);

    const fc = layout === 'format_b' ? 1 : 0;
    const sc = layout === 'format_b' ? 0 : 1;
    setManualFatCol(fc);
    setManualSnfCol(sc);
    setManualRateCol(2);

    runParseAndPreview(grid, milkType, fileName, sheetName, targetMode, fc, sc, 2);
  };

  // Rate Lookup Tester
  const sFat = Number(searchFat);
  const sSnf = Number(searchSnf);
  const sType = Number.isFinite(sFat) && sFat > 0 ? classifyMilkType(sFat) : 'cow';
  const lookupTest = lookupRateFromChart(state.rateCharts[sType], sFat, sSnf);

  // Current displayed chart
  const displayedChart = state.rateCharts[activeChartTab];

  // Expense Form Submit
  const handleSaveExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setExpError(null);
    const amt = Number(expAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setExpError(
        lang === 'hi' ? 'कृपया वैध खर्च राशि (₹ > 0) दर्ज करें।' : 'Please enter valid expense amount.'
      );
      return;
    }

    const entry: ExpenseEntry = {
      id: editingExpId || `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: expDate,
      shift: expShift,
      category: expCat,
      amount: round2(amt),
      paymentMethod: expMethod,
      description: expDesc.trim(),
      createdAt: new Date().toISOString(),
    };

    onSaveExpense(entry, Boolean(editingExpId));
    setEditingExpId(null);
    setExpAmount('');
    setExpDesc('');
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveSub('ratechart')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
            activeSub === 'ratechart'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          {lang === 'hi'
            ? '6 & 17. Excel रेट चार्ट प्रबंधन (3 इंपोर्ट विकल्प)'
            : '6 & 17. Excel Rate Chart Management (3 Import Options)'}
        </button>

        <button
          type="button"
          onClick={() => setActiveSub('expenses')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
            activeSub === 'expenses'
              ? 'bg-blue-600 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Wallet className="w-4 h-4" />
          {lang === 'hi' ? '16. डेयरी खर्च प्रबंधन (Expenses)' : '16. Dairy Expense Management'}
        </button>
      </div>

      {/* SECTION 6 & 17: EXCEL RATE CHART IMPORT & MANAGEMENT */}
      {activeSub === 'ratechart' && (
        <div className="space-y-5">
          {importNotice && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{importNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setImportNotice(null)}
                className="text-emerald-700 underline"
              >
                OK
              </button>
            </div>
          )}

          {/* REQUIREMENT 7: 3-OPTION EXCEL RATE CHART IMPORT SELECTOR */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                {lang === 'hi'
                  ? 'गाय और भैंस के Excel रेट चार्ट इंपोर्ट के 3 आसान विकल्प (.xlsx / .xls / .csv)'
                  : '3 Easy Options to Import Cow & Buffalo Excel Rate Charts (.xlsx / .xls / .csv)'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {lang === 'hi'
                  ? 'अलग-अलग डेयरी की Excel फाइलों में FAT, SNF और Rate अलग-अलग कॉलम में हो सकते हैं — नीचे अपने अनुसार विकल्प चुनें'
                  : 'Choose Auto-Detect, Manual Column Selection, or 3 Standard Excel Formats below'}
              </p>
            </div>

            {/* 3 Option Selector Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                data-testid="excel-option-1-btn"
                onClick={() => {
                  setImportOptionTab('option1');
                  handleModeChange('auto_detect');
                }}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  importOptionTab === 'option1'
                    ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/20'
                    : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-blue-900">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    {lang === 'hi' ? 'विकल्प 1: ऑटो डिटेक्ट (Auto Detect)' : 'Option 1: Auto Detect'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  {lang === 'hi'
                    ? 'FAT, फैट, SNF, एसएनएफ, Rate, रेट, मूल्य कॉलम या 2D चार्ट अपने-आप पहचानेगा'
                    : 'Automatically detects FAT, SNF, and Rate columns or 2D grid'}
                </p>
              </button>

              <button
                type="button"
                data-testid="excel-option-2-btn"
                onClick={() => {
                  setImportOptionTab('option2');
                  handleModeChange('manual_columns');
                }}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  importOptionTab === 'option2'
                    ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/20'
                    : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-blue-900">
                  <Columns className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    {lang === 'hi'
                      ? 'विकल्प 2: FAT और SNF कॉलम मैन्युअल चुनना'
                      : 'Option 2: Manual Column Selection'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  {lang === 'hi'
                    ? 'ड्रॉपडाउन में Excel के कॉलम नाम और शुरुआती मान देखकर FAT, SNF, रेट चुनें'
                    : 'Select FAT, SNF, and Rate columns from dropdowns with sample values'}
                </p>
              </button>

              <button
                type="button"
                data-testid="excel-option-3-btn"
                onClick={() => {
                  setImportOptionTab('option3');
                  handleModeChange('format_a', { fatCol: 0, snfCol: 1, rateCol: 2 });
                }}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  importOptionTab === 'option3'
                    ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/20'
                    : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-blue-900">
                  <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    {lang === 'hi'
                      ? 'विकल्प 3: तीन सामान्य Excel फॉर्मेट में से चुनना'
                      : 'Option 3: Choose from 3 Standard Formats'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  {lang === 'hi'
                    ? 'फॉर्मेट A (FAT-SNF-Rate), फॉर्मेट B (SNF-FAT-Rate), या फॉर्मेट C (कस्टम कॉलम)'
                    : 'Format A (FAT-SNF-Rate), Format B (SNF-FAT-Rate), or Format C (Custom)'}
                </p>
              </button>
            </div>

            {/* Option Details Panel */}
            {importOptionTab === 'option1' && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                <p className="font-bold text-slate-800">
                  {lang === 'hi'
                    ? 'विकल्प 1 (ऑटो डिटेक्ट) सक्रिय है — समर्थित कॉलम हेडर:'
                    : 'Option 1 (Auto Detect) Active — Supported Column Headers:'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-600">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <strong className="text-slate-900">FAT के लिए:</strong> FAT, Fat, फैट, फेट, Milk
                    Fat
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <strong className="text-slate-900">SNF के लिए:</strong> SNF, Snf, एसएनएफ, स्नैप,
                    Solids Not Fat
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <strong className="text-slate-900">रेट के लिए:</strong> Rate, रेट, Price, Amount,
                    मूल्य, दर
                  </div>
                </div>
              </div>
            )}

            {importOptionTab === 'option2' && (
              <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-3">
                <p className="text-xs font-bold text-blue-950">
                  {lang === 'hi'
                    ? 'विकल्प 2: FAT, SNF और रेट कॉलम मैन्युअल चुनें (कॉलम नाम और शुरुआती सैंपल मान सहित):'
                    : 'Option 2: Manually Select FAT, SNF, and Rate Columns:'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="manual-fat-col"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      {lang === 'hi' ? '1. FAT कॉलम चुनें' : '1. Select FAT Column'}
                    </label>
                    <select
                      id="manual-fat-col"
                      value={manualFatCol}
                      onChange={(e) => handleManualColumnChange('fat', Number(e.target.value))}
                      className="w-full min-h-[42px] px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl"
                    >
                      {(previewResult?.columnsInfo && previewResult.columnsInfo.length > 0
                        ? previewResult.columnsInfo
                        : [
                            { colIndex: 0, colLetter: 'A', headerName: 'कॉलम A (1st)', sampleValues: ['3.5', '4.0'] },
                            { colIndex: 1, colLetter: 'B', headerName: 'कॉलम B (2nd)', sampleValues: ['8.5', '8.6'] },
                            { colIndex: 2, colLetter: 'C', headerName: 'कॉलम C (3rd)', sampleValues: ['35.0', '42.0'] },
                            { colIndex: 3, colLetter: 'D', headerName: 'कॉलम D (4th)', sampleValues: [] },
                          ]
                      ).map((col) => (
                        <option key={col.colIndex} value={col.colIndex}>
                          {col.colLetter}: {col.headerName}
                          {col.sampleValues.length > 0
                            ? ` (सैंपल: ${col.sampleValues.join(', ')})`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="manual-snf-col"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      {lang === 'hi' ? '2. SNF कॉलम चुनें' : '2. Select SNF Column'}
                    </label>
                    <select
                      id="manual-snf-col"
                      value={manualSnfCol}
                      onChange={(e) => handleManualColumnChange('snf', Number(e.target.value))}
                      className="w-full min-h-[42px] px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl"
                    >
                      {(previewResult?.columnsInfo && previewResult.columnsInfo.length > 0
                        ? previewResult.columnsInfo
                        : [
                            { colIndex: 0, colLetter: 'A', headerName: 'कॉलम A (1st)', sampleValues: ['3.5', '4.0'] },
                            { colIndex: 1, colLetter: 'B', headerName: 'कॉलम B (2nd)', sampleValues: ['8.5', '8.6'] },
                            { colIndex: 2, colLetter: 'C', headerName: 'कॉलम C (3rd)', sampleValues: ['35.0', '42.0'] },
                            { colIndex: 3, colLetter: 'D', headerName: 'कॉलम D (4th)', sampleValues: [] },
                          ]
                      ).map((col) => (
                        <option key={col.colIndex} value={col.colIndex}>
                          {col.colLetter}: {col.headerName}
                          {col.sampleValues.length > 0
                            ? ` (सैंपल: ${col.sampleValues.join(', ')})`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="manual-rate-col"
                      className="block text-xs font-bold text-slate-700 mb-1"
                    >
                      {lang === 'hi' ? '3. रेट कॉलम चुनें' : '3. Select Rate Column'}
                    </label>
                    <select
                      id="manual-rate-col"
                      value={manualRateCol}
                      onChange={(e) => handleManualColumnChange('rate', Number(e.target.value))}
                      className="w-full min-h-[42px] px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-xl"
                    >
                      {(previewResult?.columnsInfo && previewResult.columnsInfo.length > 0
                        ? previewResult.columnsInfo
                        : [
                            { colIndex: 0, colLetter: 'A', headerName: 'कॉलम A (1st)', sampleValues: ['3.5', '4.0'] },
                            { colIndex: 1, colLetter: 'B', headerName: 'कॉलम B (2nd)', sampleValues: ['8.5', '8.6'] },
                            { colIndex: 2, colLetter: 'C', headerName: 'कॉलम C (3rd)', sampleValues: ['35.0', '42.0'] },
                            { colIndex: 3, colLetter: 'D', headerName: 'कॉलम D (4th)', sampleValues: [] },
                          ]
                      ).map((col) => (
                        <option key={col.colIndex} value={col.colIndex}>
                          {col.colLetter}: {col.headerName}
                          {col.sampleValues.length > 0
                            ? ` (सैंपल: ${col.sampleValues.join(', ')})`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {importOptionTab === 'option3' && (
              <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-3">
                <p className="text-xs font-bold text-blue-950">
                  {lang === 'hi'
                    ? 'विकल्प 3: तीन सामान्य Excel फॉर्मेट में से अपना फॉर्मेट चुनें:'
                    : 'Option 3: Select One of the 3 Standard Excel Formats:'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    data-testid="format-a-btn"
                    onClick={() =>
                      handleModeChange('format_a', { fatCol: 0, snfCol: 1, rateCol: 2 })
                    }
                    className={`p-3 rounded-xl border text-left text-xs ${
                      importMode === 'format_a'
                        ? 'bg-blue-600 text-white border-blue-700 font-bold'
                        : 'bg-white text-slate-800 border-slate-300'
                    }`}
                  >
                    <div className="font-bold">
                      {lang === 'hi'
                        ? 'फॉर्मेट A: FAT पहले, SNF बाद में'
                        : 'Format A: FAT First, SNF Second'}
                    </div>
                    <div
                      className={`text-[11px] mt-1 ${
                        importMode === 'format_a' ? 'text-blue-100' : 'text-slate-500'
                      }`}
                    >
                      कॉलम 1: FAT · कॉलम 2: SNF · कॉलम 3: रेट
                    </div>
                  </button>

                  <button
                    type="button"
                    data-testid="format-b-btn"
                    onClick={() =>
                      handleModeChange('format_b', { fatCol: 1, snfCol: 0, rateCol: 2 })
                    }
                    className={`p-3 rounded-xl border text-left text-xs ${
                      importMode === 'format_b'
                        ? 'bg-blue-600 text-white border-blue-700 font-bold'
                        : 'bg-white text-slate-800 border-slate-300'
                    }`}
                  >
                    <div className="font-bold">
                      {lang === 'hi'
                        ? 'फॉर्मेट B: SNF पहले, FAT बाद में'
                        : 'Format B: SNF First, FAT Second'}
                    </div>
                    <div
                      className={`text-[11px] mt-1 ${
                        importMode === 'format_b' ? 'text-blue-100' : 'text-slate-500'
                      }`}
                    >
                      कॉलम 1: SNF · कॉलम 2: FAT · कॉलम 3: रेट
                    </div>
                  </button>

                  <button
                    type="button"
                    data-testid="format-c-btn"
                    onClick={() => handleModeChange('format_c')}
                    className={`p-3 rounded-xl border text-left text-xs ${
                      importMode === 'format_c'
                        ? 'bg-blue-600 text-white border-blue-700 font-bold'
                        : 'bg-white text-slate-800 border-slate-300'
                    }`}
                  >
                    <div className="font-bold">
                      {lang === 'hi' ? 'फॉर्मेट C: कस्टम कॉलम चुनें' : 'Format C: Custom Columns'}
                    </div>
                    <div
                      className={`text-[11px] mt-1 ${
                        importMode === 'format_c' ? 'text-blue-100' : 'text-slate-500'
                      }`}
                    >
                      उपयोगकर्ता स्वयं तय करे कि कौन-सा कॉलम क्या है
                    </div>
                  </button>
                </div>

                {importMode === 'format_c' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-blue-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {lang === 'hi' ? 'FAT कॉलम' : 'FAT Column'}
                      </label>
                      <select
                        value={manualFatCol}
                        onChange={(e) => handleManualColumnChange('fat', Number(e.target.value))}
                        className="w-full min-h-[40px] px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl"
                      >
                        {(previewResult?.columnsInfo && previewResult.columnsInfo.length > 0
                          ? previewResult.columnsInfo
                          : [
                              { colIndex: 0, colLetter: 'A', headerName: 'कॉलम A', sampleValues: [] },
                              { colIndex: 1, colLetter: 'B', headerName: 'कॉलम B', sampleValues: [] },
                              { colIndex: 2, colLetter: 'C', headerName: 'कॉलम C', sampleValues: [] },
                              { colIndex: 3, colLetter: 'D', headerName: 'कॉलम D', sampleValues: [] },
                            ]
                        ).map((col) => (
                          <option key={col.colIndex} value={col.colIndex}>
                            {col.colLetter}: {col.headerName}
                            {col.sampleValues.length > 0
                              ? ` (${col.sampleValues.join(', ')})`
                              : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {lang === 'hi' ? 'SNF कॉलम' : 'SNF Column'}
                      </label>
                      <select
                        value={manualSnfCol}
                        onChange={(e) => handleManualColumnChange('snf', Number(e.target.value))}
                        className="w-full min-h-[40px] px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl"
                      >
                        {(previewResult?.columnsInfo && previewResult.columnsInfo.length > 0
                          ? previewResult.columnsInfo
                          : [
                              { colIndex: 0, colLetter: 'A', headerName: 'कॉलम A', sampleValues: [] },
                              { colIndex: 1, colLetter: 'B', headerName: 'कॉलम B', sampleValues: [] },
                              { colIndex: 2, colLetter: 'C', headerName: 'कॉलम C', sampleValues: [] },
                              { colIndex: 3, colLetter: 'D', headerName: 'कॉलम D', sampleValues: [] },
                            ]
                        ).map((col) => (
                          <option key={col.colIndex} value={col.colIndex}>
                            {col.colLetter}: {col.headerName}
                            {col.sampleValues.length > 0
                              ? ` (${col.sampleValues.join(', ')})`
                              : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {lang === 'hi' ? 'रेट कॉलम' : 'Rate Column'}
                      </label>
                      <select
                        value={manualRateCol}
                        onChange={(e) => handleManualColumnChange('rate', Number(e.target.value))}
                        className="w-full min-h-[40px] px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl"
                      >
                        {(previewResult?.columnsInfo && previewResult.columnsInfo.length > 0
                          ? previewResult.columnsInfo
                          : [
                              { colIndex: 0, colLetter: 'A', headerName: 'कॉलम A', sampleValues: [] },
                              { colIndex: 1, colLetter: 'B', headerName: 'कॉलम B', sampleValues: [] },
                              { colIndex: 2, colLetter: 'C', headerName: 'कॉलम C', sampleValues: [] },
                              { colIndex: 3, colLetter: 'D', headerName: 'कॉलम D', sampleValues: [] },
                            ]
                        ).map((col) => (
                          <option key={col.colIndex} value={col.colIndex}>
                            {col.colLetter}: {col.headerName}
                            {col.sampleValues.length > 0
                              ? ` (${col.sampleValues.join(', ')})`
                              : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Separate Cow & Buffalo Excel Upload Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cow Rate Chart Upload Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-blue-600 block">
                    {lang === 'hi' ? 'FAT 5.0 तक और 5.0 सहित' : 'FAT <= 5.0'}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    {lang === 'hi'
                      ? '1. गाय के दूध का रेट चार्ट (Cow Rate Chart)'
                      : '1. Cow Milk Rate Chart'}
                  </h3>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                    state.rateCharts.cow
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {state.rateCharts.cow
                    ? lang === 'hi'
                      ? `उपलब्ध (${state.rateCharts.cow.rowCount}×${state.rateCharts.cow.colCount})`
                      : `Loaded (${state.rateCharts.cow.rowCount}×${state.rateCharts.cow.colCount})`
                    : lang === 'hi'
                    ? 'इंपोर्ट नहीं हुआ'
                    : 'Not Imported'}
                </span>
              </div>

              {state.rateCharts.cow && (
                <p className="text-xs text-slate-600 tabular-nums">
                  फ़ाइल: <strong>{state.rateCharts.cow.fileName}</strong> (शीट:{' '}
                  {state.rateCharts.cow.sheetName}) · कुल रेट सेल:{' '}
                  {Object.keys(state.rateCharts.cow.rates).length}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <label className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  <span>
                    {lang === 'hi'
                      ? 'गाय का रेट चार्ट इंपोर्ट करें (.xls / .xlsx / .csv)'
                      : 'Import Cow Excel (.xls / .xlsx / .csv)'}
                  </span>
                  <input
                    type="file"
                    accept=".xls,.xlsx,.csv"
                    onChange={(e) => handleFileUpload(e, 'cow')}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => handlePreviewSampleExcel('cow', 'format_a')}
                  className="min-h-[40px] px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold rounded-xl"
                >
                  {lang === 'hi'
                    ? 'फॉर्मेट A (FAT-SNF-Rate) Preview'
                    : 'Preview Format A (FAT-SNF)'}
                </button>

                <button
                  type="button"
                  onClick={() => handlePreviewSampleExcel('cow', 'format_b')}
                  className="min-h-[40px] px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold rounded-xl"
                >
                  {lang === 'hi'
                    ? 'फॉर्मेट B (SNF-FAT-Rate) Preview'
                    : 'Preview Format B (SNF-FAT)'}
                </button>

                <button
                  type="button"
                  onClick={() => handlePreviewSampleExcel('cow', 'matrix')}
                  className="min-h-[40px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                >
                  {lang === 'hi'
                    ? 'मानक गाय Excel चार्ट Preview करें'
                    : 'Preview Standard Cow Excel'}
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadSampleExcel('cow', 'format_a')}
                  className="min-h-[40px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{lang === 'hi' ? 'नमूना .xlsx डाउनलोड' : 'Sample .xlsx'}</span>
                </button>
              </div>
            </div>

            {/* Buffalo Rate Chart Upload Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-indigo-600 block">
                    {lang === 'hi' ? 'FAT 5.0 से अधिक (5.1+)' : 'FAT > 5.0 (5.1+)'}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    {lang === 'hi'
                      ? '2. भैंस के दूध का रेट चार्ट (Buffalo Rate Chart)'
                      : '2. Buffalo Milk Rate Chart'}
                  </h3>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                    state.rateCharts.buffalo
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {state.rateCharts.buffalo
                    ? lang === 'hi'
                      ? `उपलब्ध (${state.rateCharts.buffalo.rowCount}×${state.rateCharts.buffalo.colCount})`
                      : `Loaded (${state.rateCharts.buffalo.rowCount}×${state.rateCharts.buffalo.colCount})`
                    : lang === 'hi'
                    ? 'इंपोर्ट नहीं हुआ'
                    : 'Not Imported'}
                </span>
              </div>

              {state.rateCharts.buffalo && (
                <p className="text-xs text-slate-600 tabular-nums">
                  फ़ाइल: <strong>{state.rateCharts.buffalo.fileName}</strong> (शीट:{' '}
                  {state.rateCharts.buffalo.sheetName}) · कुल रेट सेल:{' '}
                  {Object.keys(state.rateCharts.buffalo.rates).length}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <label className="min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  <span>
                    {lang === 'hi'
                      ? 'भैंस का रेट चार्ट इंपोर्ट करें (.xls / .xlsx / .csv)'
                      : 'Import Buffalo Excel (.xls / .xlsx / .csv)'}
                  </span>
                  <input
                    type="file"
                    accept=".xls,.xlsx,.csv"
                    onChange={(e) => handleFileUpload(e, 'buffalo')}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => handlePreviewSampleExcel('buffalo', 'format_a')}
                  className="min-h-[40px] px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold rounded-xl"
                >
                  {lang === 'hi'
                    ? 'फॉर्मेट A (FAT-SNF-Rate) Preview'
                    : 'Preview Format A (FAT-SNF)'}
                </button>

                <button
                  type="button"
                  onClick={() => handlePreviewSampleExcel('buffalo', 'format_b')}
                  className="min-h-[40px] px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold rounded-xl"
                >
                  {lang === 'hi'
                    ? 'फॉर्मेट B (SNF-FAT-Rate) Preview'
                    : 'Preview Format B (SNF-FAT)'}
                </button>

                <button
                  type="button"
                  onClick={() => handlePreviewSampleExcel('buffalo', 'matrix')}
                  className="min-h-[40px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                >
                  {lang === 'hi'
                    ? 'मानक भैंस Excel चार्ट Preview करें'
                    : 'Preview Standard Buffalo Excel'}
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadSampleExcel('buffalo', 'format_a')}
                  className="min-h-[40px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{lang === 'hi' ? 'नमूना .xlsx डाउनलोड' : 'Sample .xlsx'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Pre-Import Preview & Validation Panel (Requirement 7) */}
          {previewResult && (
            <div
              data-testid="excel-preview-panel"
              className="bg-blue-50/90 border-2 border-blue-400 rounded-2xl p-5 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-200 pb-3">
                <div>
                  <h3 className="text-base font-bold text-blue-950">
                    {lang === 'hi'
                      ? `इंपोर्ट से पहले रेट चार्ट Preview (${
                          previewResult.milkType === 'cow' ? 'गाय का दूध' : 'भैंस का दूध'
                        })`
                      : `Rate Chart Pre-Import Preview (${previewResult.milkType})`}
                  </h3>
                  <p className="text-xs text-blue-800 mt-0.5 tabular-nums">
                    फ़ाइल: <strong>{workbookSheets?.fileName}</strong> · कुल पढ़ी गई पंक्तियाँ/सेल:{' '}
                    <strong>{previewResult.totalRowsRead}</strong> · वैध रेट:{' '}
                    <strong>{previewResult.validRowCount}</strong> · खाली/अमान्य पंक्तियाँ:{' '}
                    <strong>{previewResult.invalidOrEmptyRowCount}</strong> · डुप्लिकेट FAT-SNF:{' '}
                    <strong>{previewResult.duplicateCount}</strong>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Switch Cow vs Buffalo target before saving */}
                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-blue-300">
                    <span className="text-xs font-bold text-slate-700">
                      {lang === 'hi' ? 'चार्ट प्रकार:' : 'Target Chart:'}
                    </span>
                    <select
                      aria-label="Target chart milk type"
                      value={previewResult.milkType}
                      onChange={(e) => handlePreviewMilkTypeChange(e.target.value as MilkType)}
                      className="text-xs font-bold text-blue-800 bg-transparent focus:outline-none"
                    >
                      <option value="cow">{lang === 'hi' ? 'गाय का चार्ट (Cow)' : 'Cow Chart'}</option>
                      <option value="buffalo">
                        {lang === 'hi' ? 'भैंस का चार्ट (Buffalo)' : 'Buffalo Chart'}
                      </option>
                    </select>
                  </div>

                  {workbookSheets && workbookSheets.sheetNames.length > 1 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-blue-950">
                        {lang === 'hi' ? 'Excel शीट चुनें:' : 'Select Sheet:'}
                      </label>
                      <select
                        value={selectedSheetName}
                        onChange={(e) => handleSheetChange(e.target.value)}
                        className="px-3 py-1.5 text-xs bg-white border border-blue-300 rounded-lg font-semibold"
                      >
                        {workbookSheets.sheetNames.map((sName) => (
                          <option key={sName} value={sName}>
                            {sName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Detected Columns Summary & Quick Column Remap inside Preview */}
              {previewResult.columnsInfo.length >= 3 && (
                <div className="bg-white/90 border border-blue-200 rounded-xl p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-slate-800">
                      {previewResult.detectedLayout === 'matrix_grid'
                        ? lang === 'hi'
                          ? 'पहचाना गया फॉर्मेट: 2D मैट्रिक्स (SNF पंक्तियाँ × FAT कॉलम)'
                          : 'Detected Format: 2D Matrix Grid'
                        : lang === 'hi'
                        ? `पहचाना गया कॉलम मैपिंग (${
                            previewResult.confidence === 'high'
                              ? 'ऑटो-डिटेक्ट सफल'
                              : 'कृपया कॉलम की पुष्टि करें'
                          }):`
                        : 'Detected Column Mapping:'}
                    </span>
                    <span className="text-[11px] text-blue-700 font-semibold">
                      {lang === 'hi'
                        ? 'गलत कॉलम होने पर नीचे से तुरंत बदलें:'
                        : 'Change columns below if needed:'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                        {lang === 'hi' ? 'FAT कॉलम' : 'FAT Column'}
                      </label>
                      <select
                        data-testid="preview-fat-col-select"
                        value={manualFatCol}
                        onChange={(e) => handleManualColumnChange('fat', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
                      >
                        {previewResult.columnsInfo.map((c) => (
                          <option key={c.colIndex} value={c.colIndex}>
                            {c.colLetter}: {c.headerName} (सैंपल: {c.sampleValues.join(', ')})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                        {lang === 'hi' ? 'SNF कॉलम' : 'SNF Column'}
                      </label>
                      <select
                        data-testid="preview-snf-col-select"
                        value={manualSnfCol}
                        onChange={(e) => handleManualColumnChange('snf', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
                      >
                        {previewResult.columnsInfo.map((c) => (
                          <option key={c.colIndex} value={c.colIndex}>
                            {c.colLetter}: {c.headerName} (सैंपल: {c.sampleValues.join(', ')})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                        {lang === 'hi' ? 'रेट (Rate) कॉलम' : 'Rate Column'}
                      </label>
                      <select
                        data-testid="preview-rate-col-select"
                        value={manualRateCol}
                        onChange={(e) => handleManualColumnChange('rate', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg"
                      >
                        {previewResult.columnsInfo.map((c) => (
                          <option key={c.colIndex} value={c.colIndex}>
                            {c.colLetter}: {c.headerName} (सैंपल: {c.sampleValues.join(', ')})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {previewResult.errors.map((err, i) => (
                <div
                  key={i}
                  className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{err}</span>
                </div>
              ))}

              {previewResult.warnings.map((warn, i) => (
                <div
                  key={i}
                  className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs font-semibold text-amber-900 flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>{warn}</span>
                </div>
              ))}

              {previewResult.chart && (
                <>
                  {/* Sample Row Preview: FAT | SNF | प्रति लीटर रेट */}
                  {previewResult.previewRows.length > 0 && (
                    <div className="bg-white rounded-xl border border-blue-200 p-3">
                      <h4 className="text-xs font-bold text-slate-800 mb-2">
                        {lang === 'hi'
                          ? `पढ़ी गई पंक्तियों का सैंपल प्रीव्यू (FAT · SNF · प्रति लीटर रेट — कुल ${previewResult.previewRows.length} वैध रेट):`
                          : `Sample Rows Preview (${previewResult.previewRows.length} valid rates):`}
                      </h4>
                      <div className="overflow-x-auto max-h-[180px]">
                        <table className="w-full text-xs border-collapse tabular-nums">
                          <thead>
                            <tr className="bg-slate-100 text-slate-800 border-b border-slate-200">
                              <th className="py-1.5 px-3 text-left">#</th>
                              <th className="py-1.5 px-3 text-right">FAT</th>
                              <th className="py-1.5 px-3 text-right">SNF</th>
                              <th className="py-1.5 px-3 text-right">
                                {lang === 'hi' ? 'प्रति लीटर रेट (₹)' : 'Rate / Liter (₹)'}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {previewResult.previewRows.slice(0, 15).map((r, idx) => (
                              <tr
                                key={idx}
                                className={r.isDuplicate ? 'bg-amber-50/70' : 'hover:bg-slate-50'}
                              >
                                <td className="py-1 px-3 text-slate-500">{idx + 1}</td>
                                <td className="py-1 px-3 text-right font-bold">{r.fat.toFixed(1)}</td>
                                <td className="py-1 px-3 text-right font-bold">{r.snf.toFixed(1)}</td>
                                <td className="py-1 px-3 text-right font-bold text-blue-700">
                                  ₹{r.rate.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Full 2D Matrix Preview */}
                  <div className="overflow-x-auto max-h-[240px] bg-white rounded-xl border border-blue-200">
                    <table className="w-full text-xs border-collapse tabular-nums">
                      <thead>
                        <tr className="bg-blue-600 text-white">
                          <th className="py-2 px-3 text-left">SNF \ FAT</th>
                          {previewResult.chart.fats.map((f) => (
                            <th key={f} className="py-2 px-3 text-right">
                              {f.toFixed(1)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewResult.chart.snfs.map((s) => (
                          <tr key={s}>
                            <td className="py-1.5 px-3 font-bold bg-slate-50">{s.toFixed(1)}</td>
                            {previewResult.chart!.fats.map((f) => {
                              const r = previewResult.chart!.rates[makeRateKey(f, s)];
                              return (
                                <td key={f} className="py-1.5 px-3 text-right">
                                  {r !== undefined ? `₹${r.toFixed(2)}` : '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-blue-900">
                      {state.rateCharts[previewResult.milkType]
                        ? lang === 'hi'
                          ? 'नोट: पुराना रेट चार्ट पहले से मौजूद है। नया चार्ट सेव करने पर भी पुरानी दूध एंट्रियों की राशि बिना आपकी अनुमति के नहीं बदलेगी।'
                          : 'Note: Replacing the rate chart will NOT alter historical milk entries unless you explicitly recalculate.'
                        : lang === 'hi'
                        ? 'यह रेट चार्ट ऐप में सेव हो जाएगा और आगे की खरीद/बिक्री गणना में काम आएगा।'
                        : 'This rate chart will be saved for all new calculations.'}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewResult(null);
                          setWorkbookSheets(null);
                        }}
                        className="min-h-[42px] px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-xl"
                      >
                        {lang === 'hi' ? 'रद्द करें (पुराना चार्ट रखें)' : 'Cancel (Keep Old)'}
                      </button>
                      <button
                        type="button"
                        onClick={confirmSavePreviewedChart}
                        className="min-h-[42px] px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {lang === 'hi'
                          ? 'पुष्टि करें और रेट चार्ट सेव करें'
                          : 'Confirm & Save Rate Chart'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* FAT & SNF Rate Finder Tool */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Search className="w-4 h-4 text-blue-600" />
              {lang === 'hi'
                ? 'FAT और SNF से सटीक रेट खोजें (Exact Rate Lookup Tester)'
                : 'Exact FAT & SNF Rate Finder'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">FAT</label>
                <input
                  type="number"
                  step="0.1"
                  value={searchFat}
                  onChange={(e) => setSearchFat(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">SNF</label>
                <input
                  type="number"
                  step="0.1"
                  value={searchSnf}
                  onChange={(e) => setSearchSnf(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl tabular-nums"
                />
              </div>
              <div className="sm:col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <span className="text-slate-500 block">
                  {lang === 'hi' ? 'दूध का प्रकार और लागू रेट:' : 'Milk Type & Exact Rate:'}
                </span>
                <span className="font-bold text-sm text-blue-900 tabular-nums mt-0.5 block">
                  {sType === 'cow' ? 'गाय (Cow · FAT ≤ 5.0)' : 'भैंस (Buffalo · FAT > 5.0)'} —{' '}
                  {lookupTest.found && lookupTest.rate !== null
                    ? `${formatCurrency(lookupTest.rate)} प्रति लीटर`
                    : lookupTest.warningHi}
                </span>
              </div>
            </div>
          </div>

          {/* Saved Rate Chart Matrix Viewer & Recalculate Old Entries Option */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveChartTab('cow')}
                  className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold ${
                    activeChartTab === 'cow' ? 'bg-blue-600 text-white' : 'text-slate-600'
                  }`}
                >
                  {lang === 'hi' ? 'गाय का रेट चार्ट देखें' : 'Cow Rate Chart'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChartTab('buffalo')}
                  className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold ${
                    activeChartTab === 'buffalo' ? 'bg-blue-600 text-white' : 'text-slate-600'
                  }`}
                >
                  {lang === 'hi' ? 'भैंस का रेट चार्ट देखें' : 'Buffalo Rate Chart'}
                </button>
              </div>

              {displayedChart && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmRecalcType(activeChartTab)}
                    className="min-h-[38px] px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {lang === 'hi'
                      ? 'पुरानी एंट्रियों को नए रेट से दोबारा गणना करें (Recalculate)'
                      : 'Recalculate Old Entries'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearType(activeChartTab)}
                    className="min-h-[38px] px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-xl flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {lang === 'hi' ? 'चार्ट हटाएँ' : 'Remove Chart'}
                  </button>
                </div>
              )}
            </div>

            {!displayedChart ? (
              <div className="py-10 text-center text-sm text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                {lang === 'hi'
                  ? `अभी ${
                      activeChartTab === 'cow' ? 'गाय' : 'भैंस'
                    } का कोई रेट चार्ट सेव नहीं है। ऊपर दिए गए बटन से अपनी Excel (.xls / .xlsx) फ़ाइल इंपोर्ट करें या मानक चार्ट Preview करें।`
                  : `No ${activeChartTab} rate chart saved yet. Import an Excel file above.`}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-xs border-collapse tabular-nums">
                  <thead>
                    <tr className="bg-blue-50 text-blue-950 border-b border-blue-200">
                      <th className="py-2.5 px-3 text-left font-bold">SNF \ FAT</th>
                      {displayedChart.fats.map((fat) => (
                        <th key={fat} className="py-2.5 px-3 text-right font-bold">
                          {fat.toFixed(1)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedChart.snfs.map((snf) => (
                      <tr key={snf} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold bg-slate-50 text-slate-800">
                          {snf.toFixed(1)}
                        </td>
                        {displayedChart.fats.map((fat) => {
                          const r = displayedChart.rates[makeRateKey(fat, snf)];
                          return (
                            <td key={fat} className="py-2 px-3 text-right">
                              {r !== undefined ? `₹${r.toFixed(2)}` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 16: EXPENSE MANAGEMENT */}
      {activeSub === 'expenses' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              {lang === 'hi' ? 'डेयरी खर्च प्रबंधन (Dairy Expense Management)' : 'Expense Management'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {lang === 'hi'
                ? 'यदि खर्च किसी खास शिफ्ट का नहीं है, तो "दैनिक/सामान्य" चुनें ताकि वह किसी एक शिफ्ट के लाभ-हानि को गलत न करे'
                : 'Choose Morning, Evening, or General Daily so shift profit/loss is not distorted'}
            </p>

            <form onSubmit={handleSaveExpenseSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? `तारीख (${formatDateDMY(expDate)}) *` : `Date (${formatDateDMY(expDate)}) *`}
                  </label>
                  <input
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'खर्च की श्रेणी *' : 'Category *'}
                  </label>
                  <select
                    value={expCat}
                    onChange={(e) => setExpCat(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    {state.expenseCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'संबंधित शिफ्ट' : 'Related Shift'}
                  </label>
                  <select
                    value={expShift}
                    onChange={(e) => setExpShift(e.target.value as ShiftType | 'general')}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="general">
                      {lang === 'hi'
                        ? 'दैनिक/सामान्य (किसी एक शिफ्ट पर नहीं)'
                        : 'General Daily (Not shift-specific)'}
                    </option>
                    <option value="morning">
                      {lang === 'hi' ? 'सुबह की शिफ्ट (Morning)' : 'Morning Shift'}
                    </option>
                    <option value="evening">
                      {lang === 'hi' ? 'शाम की शिफ्ट (Evening)' : 'Evening Shift'}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'राशि (₹) *' : 'Amount (₹) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="250.00"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'भुगतान का तरीका' : 'Payment Mode'}
                  </label>
                  <select
                    value={expMethod}
                    onChange={(e) => setExpMethod(e.target.value as PaymentMethod)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl"
                  >
                    <option value="cash">{lang === 'hi' ? 'नकद (Cash)' : 'Cash'}</option>
                    <option value="upi">UPI</option>
                    <option value="bank">{lang === 'hi' ? 'बैंक (Bank)' : 'Bank'}</option>
                    <option value="other">{lang === 'hi' ? 'अन्य (Other)' : 'Other'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === 'hi' ? 'विवरण' : 'Description'}
                  </label>
                  <input
                    type="text"
                    placeholder={lang === 'hi' ? 'खर्च का विवरण...' : 'Details...'}
                    value={expDesc}
                    onChange={(e) => setExpDesc(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    className="w-full min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl"
                  >
                    {lang === 'hi' ? 'खर्च सेव करें' : 'Save Expense'}
                  </button>
                </div>
              </div>

              {expError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
                  {expError}
                </div>
              )}
            </form>

            {/* Add Custom Expense Category */}
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder={lang === 'hi' ? 'नई खर्च श्रेणी जोड़ें...' : 'New expense category...'}
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="min-h-[38px] px-3 py-1.5 text-xs border border-slate-300 rounded-xl"
              />
              <button
                type="button"
                onClick={() => {
                  if (newCategoryName.trim()) {
                    onAddExpenseCategory(newCategoryName.trim());
                    setExpCat(newCategoryName.trim());
                    setNewCategoryName('');
                  }
                }}
                className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 rounded-xl flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                {lang === 'hi' ? 'नई श्रेणी जोड़ें' : 'Add Category'}
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5 overflow-hidden">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              {lang === 'hi' ? 'सभी दर्ज किए गए खर्च' : 'Recorded Expenses'}
            </h3>
            <table className="w-full text-[11px] sm:text-xs border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="py-2 px-1.5 text-left border border-slate-300">{lang === 'hi' ? 'तारीख / शिफ्ट' : 'Date / Shift'}</th>
                  <th className="py-2 px-1.5 text-left border border-slate-300">{lang === 'hi' ? 'श्रेणी व विवरण' : 'Category'}</th>
                  <th className="py-2 px-1.5 text-right border border-slate-300">{lang === 'hi' ? 'राशि' : 'Amount'}</th>
                  <th className="py-2 px-1 text-center border border-slate-300">{lang === 'hi' ? 'कार्य' : 'Act'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 tabular-nums">
                {state.expenses.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500 border border-slate-300">
                      {lang === 'hi' ? 'अभी कोई खर्च रिकॉर्ड नहीं है' : 'No expenses recorded'}
                    </td>
                  </tr>
                ) : (
                  state.expenses.map((e) => (
                    <tr key={e.id}>
                      <td className="py-2 px-1.5 border border-slate-300">
                        <div className="font-bold text-slate-900">{formatDateDMY(e.date)}</div>
                        <div className="text-[10px] text-slate-500">
                          {e.shift === 'morning'
                            ? 'सुबह'
                            : e.shift === 'evening'
                            ? 'शाम'
                            : 'दैनिक/सामान्य'}
                        </div>
                      </td>
                      <td className="py-2 px-1.5 border border-slate-300">
                        <div className="font-bold text-slate-900">{e.category}</div>
                        <div className="text-[10px] text-slate-600">{e.description || '—'}</div>
                      </td>
                      <td className="py-2 px-1.5 text-right text-xs sm:text-sm font-extrabold text-red-600 border border-slate-300 whitespace-nowrap">
                        {formatCurrency(e.amount)}
                      </td>
                      <td className="py-2 px-1 text-center border border-slate-300">
                        <button
                          type="button"
                          onClick={() => setDeleteExpId(e.id)}
                          className="p-1.5 bg-red-50 text-red-600 rounded-lg inline-flex"
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

      {/* Confirm Recalculate Old Entries Modal */}
      <ConfirmDialog
        open={Boolean(confirmRecalcType)}
        title={
          lang === 'hi'
            ? 'पुरानी दूध एंट्रियों की राशि दोबारा गणना करें?'
            : 'Recalculate Historical Milk Entries?'
        }
        message={
          lang === 'hi'
            ? `क्या आप वाकई सभी पुरानी ${
                confirmRecalcType === 'cow' ? 'गाय' : 'भैंस'
              } की दूध एंट्रियों को नए रेट चार्ट के अनुसार अपडेट करना चाहते हैं?`
            : 'Are you sure you want to update all historical milk collection entries using this rate chart?'
        }
        confirmLabel={lang === 'hi' ? 'हाँ, दोबारा गणना करें' : 'Yes, Recalculate'}
        danger={false}
        onCancel={() => setConfirmRecalcType(null)}
        onConfirm={() => {
          if (confirmRecalcType) {
            const count = onRecalculateOldEntries(confirmRecalcType);
            setImportNotice(
              lang === 'hi'
                ? `${count} पुरानी दूध एंट्रियाँ नए रेट चार्ट के अनुसार अपडेट की गईं।`
                : `${count} historical entries recalculated.`
            );
          }
          setConfirmRecalcType(null);
        }}
      />

      {/* Confirm Clear Rate Chart Modal */}
      <ConfirmDialog
        open={Boolean(confirmClearType)}
        title={lang === 'hi' ? 'रेट चार्ट हटाएँ?' : 'Remove Rate Chart?'}
        message={
          lang === 'hi'
            ? 'क्या आप इस रेट चार्ट को हटाना चाहते हैं? पहले से सेव दूध एंट्रियाँ सुरक्षित रहेंगी।'
            : 'Are you sure you want to remove this rate chart? Existing milk entries will remain intact.'
        }
        onCancel={() => setConfirmClearType(null)}
        onConfirm={() => {
          if (confirmClearType) {
            onSaveRateChart(confirmClearType, null);
          }
          setConfirmClearType(null);
        }}
      />

      {/* Confirm Delete Expense Modal */}
      <ConfirmDialog
        open={Boolean(deleteExpId)}
        title={lang === 'hi' ? 'खर्च रिकॉर्ड हटाएँ?' : 'Delete Expense?'}
        message={
          lang === 'hi'
            ? 'क्या आप इस खर्च एंट्री को हटाना चाहते हैं?'
            : 'Are you sure you want to delete this expense record?'
        }
        onCancel={() => setDeleteExpId(null)}
        onConfirm={() => {
          if (deleteExpId) onDeleteExpense(deleteExpId);
          setDeleteExpId(null);
        }}
      />
    </div>
  );
};
