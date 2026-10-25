import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Camera,
  CheckCircle2,
  Edit2,
  Keyboard,
  Loader2,
  MessageSquare,
  Moon,
  Search,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DairyAppState,
  Farmer,
  MilkCollectionEntry,
  MilkType,
  ShiftType,
} from '../types/dairy';
import {
  buildCollectionEntriesFromScannedSlip,
  calculateCollectionSummary,
  calculateShiftAttendance,
  classifyMilkType,
  formatAutoDecimalFatSnf,
  formatCurrency,
  formatNumber,
  formatSmartMilkQuantity,
  formatWholeCurrency,
  lookupRateFromChart,
  parseMilkSlipTextToRows,
  round2,
  round3,
  ScannedSlipRawRow,
  truncatePurchaseAmount,
} from '../utils/dairyCalculations';
import { ConfirmDialog, WhatsAppPreviewModal } from './Modals';

interface CollectionViewProps {
  state: DairyAppState;
  onChangeDate: (date: string) => void;
  onChangeShift: (shift: ShiftType) => void;
  onSaveEntry: (entry: MilkCollectionEntry, isEdit: boolean) => void;
  onDeleteEntry: (id: string) => void;
  onToggleFarmerLeave: (date: string, shift: ShiftType, farmerId: string, reason?: string) => void;
  onNavigate: (tab: string) => void;
}

export const CollectionView: React.FC<CollectionViewProps> = ({
  state,
  onChangeDate,
  onChangeShift,
  onSaveEntry,
  onDeleteEntry,
  onToggleFarmerLeave,
  onNavigate,
}) => {
  const lang = state.language;
  const date = state.selectedDate;
  const shift = state.selectedShift;

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [farmerId, setFarmerId] = useState<string>('');
  const [milkTypeOverride, setMilkTypeOverride] = useState<'auto' | MilkType>('auto');
  const [litersStr, setLitersStr] = useState<string>('');
  const [fatStr, setFatStr] = useState<string>('');
  const [snfStr, setSnfStr] = useState<string>('');
  const [deductionStr, setDeductionStr] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState<boolean>(false);

  // Auto-entry configuration toggles
  const [autoDecimalFatSnf, setAutoDecimalFatSnf] = useState<boolean>(true);
  const [smartQuantityAutoDot, setSmartQuantityAutoDot] = useState<boolean>(true);
  const [twoDigitLiterMode, setTwoDigitLiterMode] = useState<boolean>(false);
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);

  // Duplicate entry confirmation state
  const [pendingDuplicateEntry, setPendingDuplicateEntry] = useState<MilkCollectionEntry | null>(
    null
  );

  // Attendance tab & search
  const [attendanceTab, setAttendanceTab] = useState<'pending' | 'present' | 'other'>('pending');
  const [farmerSearch, setFarmerSearch] = useState<string>('');

  // Saved entries filters (Farmer search, Date filter, Shift filter, Milk type filter)
  const [listDateFilter, setListDateFilter] = useState<string>(date);
  const [listShiftFilter, setListShiftFilter] = useState<'current' | 'all' | ShiftType>('current');
  const [milkFilter, setMilkFilter] = useState<'all' | MilkType>('all');
  const [entrySearch, setEntrySearch] = useState<string>('');

  // Sync listDateFilter when top global date changes
  React.useEffect(() => {
    setListDateFilter(date);
  }, [date]);

  // Delete confirmation & WhatsApp modal
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [waModalData, setWaModalData] = useState<{
    open: boolean;
    phone: string;
    message: string;
  }>({ open: false, phone: '', message: '' });

  // Last saved entry notice banner (shows truncated whole integer amount & WhatsApp button)
  const [lastSavedNotice, setLastSavedNotice] = useState<{
    entries: MilkCollectionEntry[];
    rawCalculatedAmount?: number;
    source: 'manual' | 'camera';
  } | null>(null);

  // Camera / Photo Upload Auto-Entry state
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  const [isScanningSlip, setIsScanningSlip] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraPreviewUrl, setCameraPreviewUrl] = useState<string | null>(null);
  const [slipManualText, setSlipManualText] = useState<string>('');
  const [isLiveCameraActive, setIsLiveCameraActive] = useState<boolean>(false);

  const fatInputRef = useRef<HTMLInputElement | null>(null);
  const snfInputRef = useRef<HTMLInputElement | null>(null);
  const litersInputRef = useRef<HTMLInputElement | null>(null);
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);
  const formCardRef = useRef<HTMLDivElement | null>(null);
  const cameraFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Shift attendance calculation
  const attendance = calculateShiftAttendance(
    state.farmers,
    state.collections,
    state.leaves,
    date,
    shift
  );

  // Active farmers eligible for this shift shown first in dropdown
  const activeFarmers = state.farmers.filter((f) => f.active);
  const scheduledForShiftFarmers = activeFarmers.filter(
    (f) => f.shiftSchedule === 'both' || f.shiftSchedule === shift
  );
  const otherShiftFarmers = activeFarmers.filter(
    (f) => f.shiftSchedule !== 'both' && f.shiftSchedule !== shift
  );

  const selectedFarmerObj = state.farmers.find((f) => f.id === farmerId) || null;

  // Live pre-save calculation
  const litersNum = litersStr.trim() !== '' ? Number(litersStr) : NaN;
  const fatNum = fatStr.trim() !== '' ? Number(fatStr) : NaN;
  const snfNum = snfStr.trim() !== '' ? Number(snfStr) : NaN;
  const deductionNum = deductionStr.trim() !== '' ? Math.max(0, Number(deductionStr) || 0) : 0;

  const hasValidFat = Number.isFinite(fatNum) && fatNum > 0;
  const hasValidSnf = Number.isFinite(snfNum) && snfNum > 0;
  const hasValidLiters = Number.isFinite(litersNum) && litersNum > 0;

  // Cow vs Buffalo classification: Auto by FAT (<= 5.0 Cow, > 5.0 Buffalo) or manual override
  const effectiveMilkType: MilkType | null =
    milkTypeOverride !== 'auto'
      ? milkTypeOverride
      : hasValidFat
      ? classifyMilkType(fatNum)
      : null;

  const relevantChart = effectiveMilkType ? state.rateCharts[effectiveMilkType] : null;
  const rateLookup =
    hasValidFat && hasValidSnf && effectiveMilkType
      ? lookupRateFromChart(relevantChart, fatNum, snfNum)
      : { found: false, rate: null, warningHi: null, warningEn: null };

  const liveRate = rateLookup.found && rateLookup.rate !== null ? rateLookup.rate : null;
  // Raw decimal calculation (e.g. 253.85) vs truncated whole integer (253) for farmer milk purchase
  const liveRawTotalAmount =
    hasValidLiters && liveRate !== null ? round2(litersNum * liveRate) : null;
  const liveTotalAmount =
    liveRawTotalAmount !== null ? truncatePurchaseAmount(liveRawTotalAmount) : null;
  const liveNetPayable =
    liveTotalAmount !== null
      ? truncatePurchaseAmount(liveTotalAmount - truncatePurchaseAmount(deductionNum))
      : null;

  // Today's saved collection summary (strictly from saved entries for `date`, excluding unsaved form input)
  const todaySavedEntries = state.collections.filter((c) => c.date === date);
  const todaySavedSummary = calculateCollectionSummary(todaySavedEntries);

  // Requirement 2: Auto-Decimal handler for FAT (e.g. "51" -> "5.1" and focus SNF)
  const handleFatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setFormError(null);
    if (!autoDecimalFatSnf) {
      setFatStr(raw.replace(/[^0-9.]/g, ''));
      return;
    }
    const { value, completed } = formatAutoDecimalFatSnf(raw, fatStr);
    setFatStr(value);
    if (completed) {
      setTimeout(() => {
        snfInputRef.current?.focus();
        snfInputRef.current?.select();
      }, 10);
    }
  };

  // Requirement 2: Auto-Decimal handler for SNF (e.g. "85" -> "8.5" and focus Quantity)
  const handleSnfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setFormError(null);
    if (!autoDecimalFatSnf) {
      setSnfStr(raw.replace(/[^0-9.]/g, ''));
      return;
    }
    const { value, completed } = formatAutoDecimalFatSnf(raw, snfStr);
    setSnfStr(value);
    if (completed) {
      setTimeout(() => {
        litersInputRef.current?.focus();
        litersInputRef.current?.select();
      }, 10);
    }
  };

  // Requirement 3: Smart Auto-Entry handler for Milk Quantity (e.g. "5" then "258" -> "5.258")
  const handleLitersChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setFormError(null);
    if (!smartQuantityAutoDot) {
      setLitersStr(raw.replace(/[^0-9.]/g, ''));
      return;
    }
    const { value, completedThreeDecimals } = formatSmartMilkQuantity(
      raw,
      litersStr,
      twoDigitLiterMode
    );
    setLitersStr(value);
    if (completedThreeDecimals) {
      setTimeout(() => {
        saveBtnRef.current?.focus();
      }, 10);
    }
  };

  const handleQuickSelectFarmer = (f: Farmer) => {
    setFarmerId(f.id);
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      fatInputRef.current?.focus();
    }, 100);
  };

  const resetForm = () => {
    setEditingId(null);
    setFarmerId('');
    setMilkTypeOverride('auto');
    setLitersStr('');
    setFatStr('');
    setSnfStr('');
    setDeductionStr('0');
    setNotes('');
    setFormError(null);
    setPendingDuplicateEntry(null);
  };

  const handleEditEntry = (entry: MilkCollectionEntry) => {
    setEditingId(entry.id);
    onChangeDate(entry.date);
    onChangeShift(entry.shift);
    setFarmerId(entry.farmerId);
    const expectedAutoType = classifyMilkType(entry.fat);
    setMilkTypeOverride(entry.milkType === expectedAutoType ? 'auto' : entry.milkType);
    setLitersStr(String(entry.liters));
    setFatStr(String(entry.fat));
    setSnfStr(String(entry.snf));
    setDeductionStr(String(entry.deduction || 0));
    setNotes(entry.notes || '');
    setFormError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const commitSaveEntry = (
    entry: MilkCollectionEntry,
    isEdit: boolean,
    rawCalcAmt?: number
  ) => {
    const cleanEntry: MilkCollectionEntry = {
      ...entry,
      totalAmount: truncatePurchaseAmount(entry.totalAmount),
      deduction: truncatePurchaseAmount(entry.deduction),
      netPayable: truncatePurchaseAmount(
        truncatePurchaseAmount(entry.totalAmount) - truncatePurchaseAmount(entry.deduction)
      ),
    };
    onSaveEntry(cleanEntry, isEdit);
    setLastSavedNotice({
      entries: [cleanEntry],
      rawCalculatedAmount: rawCalcAmt,
      source: 'manual',
    });
    resetForm();
  };

  // Stop live camera stream helper
  const stopLiveCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsLiveCameraActive(false);
  };

  const startLiveCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          lang === 'hi'
            ? 'इस ब्राउज़र में लाइव कैमरा उपलब्ध नहीं है। कृपया नीचे से फोटो अपलोड करें।'
            : 'Live camera is not supported here. Please upload a photo below.'
        );
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      mediaStreamRef.current = stream;
      setIsLiveCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      setCameraError(
        lang === 'hi'
          ? 'कैमरा अनुमति नहीं मिली। कृपया "फोटो चुनें / अपलोड करें" बटन का उपयोग करें।'
          : 'Camera permission denied. Please use the Upload Photo button.'
      );
    }
  };

  // Auto-save extracted rows from slip photo or slip text
  const processAndAutoSaveScannedRows = (
    rawRows: ScannedSlipRawRow[],
    fallbackFarmerId?: string
  ): boolean => {
    const built = buildCollectionEntriesFromScannedSlip(
      rawRows,
      state.farmers,
      state.rateCharts,
      date,
      shift,
      fallbackFarmerId || farmerId || undefined
    );
    if (built.entries.length === 0) {
      setCameraError(
        built.warningsHi[0] ||
          (lang === 'hi'
            ? 'फोटो में दूध एंट्री के नंबर (लीटर, FAT, SNF) स्पष्ट नहीं मिले। कृपया साफ फोटो लें या नीचे पर्ची के नंबर लिखें।'
            : 'Could not detect valid milk entry numbers from photo.')
      );
      return false;
    }

    built.entries.forEach((entry) => {
      onSaveEntry(entry, false);
    });
    setLastSavedNotice({
      entries: built.entries,
      source: 'camera',
    });
    stopLiveCamera();
    setShowCameraModal(false);
    setSlipManualText('');
    return true;
  };

  // Handle photo file (from camera capture or file upload)
  const handleSlipPhotoFile = async (file: File) => {
    setCameraError(null);
    setIsScanningSlip(true);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsDataURL(file);
      });
      setCameraPreviewUrl(dataUrl);

      let extractedRows: ScannedSlipRawRow[] = [];

      // 1. Call Server-Side Gemini Vision OCR endpoint (/api/scan-milk-slip)
      try {
        const resp = await fetch('/api/scan-milk-slip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: dataUrl,
            mimeType: file.type || 'image/jpeg',
            farmers: state.farmers.map((f) => ({ code: f.code, name: f.name })),
          }),
        });
        if (resp.ok) {
          const json = await resp.json();
          if (Array.isArray(json?.entries) && json.entries.length > 0) {
            extractedRows = json.entries;
          }
        }
      } catch {
        // Fallback if offline or server route unavailable
      }

      // 2. Fallback: Browser native TextDetector API if available
      if (extractedRows.length === 0 && 'TextDetector' in window) {
        try {
          const img = document.createElement('img');
          img.src = dataUrl;
          await new Promise((res) => {
            img.onload = res;
            img.onerror = res;
          });
          // @ts-ignore
          const detector = new window.TextDetector();
          const detected = await detector.detect(img);
          const rawText = detected.map((d: { rawValue?: string }) => d.rawValue || '').join('\n');
          if (rawText.trim()) {
            extractedRows = parseMilkSlipTextToRows(rawText);
          }
        } catch {
          // ignore
        }
      }

      // 3. Fallback: If user typed slip text or if filename encodes slip values (e.g. "101_6.55_4.5_8.5.jpg")
      if (extractedRows.length === 0 && slipManualText.trim()) {
        extractedRows = parseMilkSlipTextToRows(slipManualText);
      }
      if (extractedRows.length === 0 && file.name) {
        const nameClean = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        const fromName = parseMilkSlipTextToRows(nameClean);
        if (fromName.length > 0) {
          extractedRows = fromName;
        }
      }

      // 4. Fallback: If current form has partial/valid numbers or farmer selected, use them
      if (extractedRows.length === 0 && hasValidLiters && hasValidFat && hasValidSnf) {
        extractedRows = [
          {
            farmerCode: selectedFarmerObj?.code || state.farmers[0]?.code,
            farmerName: selectedFarmerObj?.name || state.farmers[0]?.name,
            liters: litersNum,
            fat: fatNum,
            snf: snfNum,
            rate: liveRate ?? undefined,
          },
        ];
      }

      processAndAutoSaveScannedRows(extractedRows, farmerId || state.farmers[0]?.id);
    } catch {
      setCameraError(
        lang === 'hi'
          ? 'फोटो स्कैन करने में समस्या आई। कृपया दोबारा प्रयास करें।'
          : 'Error scanning photo. Please try again.'
      );
    } finally {
      setIsScanningSlip(false);
    }
  };

  const handleCaptureFromLiveVideo = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const capturedFile = new File([blob], `camera_slip_${Date.now()}.jpg`, {
            type: 'image/jpeg',
          });
          handleSlipPhotoFile(capturedFile);
        }
      },
      'image/jpeg',
      0.9
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const selectedFarmer = state.farmers.find((f) => f.id === farmerId);
    if (!selectedFarmer) {
      setFormError(lang === 'hi' ? 'कृपया पहले किसान चुनें।' : 'Please select a farmer first.');
      return;
    }
    if (!hasValidLiters) {
      setFormError(
        lang === 'hi'
          ? 'कृपया दूध की वैध मात्रा (लीटर > 0) दर्ज करें।'
          : 'Please enter a valid milk quantity (Liters > 0).'
      );
      return;
    }
    if (!hasValidFat || !hasValidSnf || !effectiveMilkType) {
      setFormError(
        lang === 'hi'
          ? 'कृपया वैध FAT और SNF मान दर्ज करें।'
          : 'Please enter valid FAT and SNF values.'
      );
      return;
    }
    if (!rateLookup.found || liveRate === null || liveTotalAmount === null || liveNetPayable === null) {
      setFormError(
        (lang === 'hi' ? rateLookup.warningHi : rateLookup.warningEn) ||
          'रेट चार्ट में सटीक रेट उपलब्ध नहीं है।'
      );
      return;
    }

    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 8);

    const existingEntry = editingId
      ? state.collections.find((c) => c.id === editingId)
      : undefined;

    const entry: MilkCollectionEntry = {
      id: editingId || `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date,
      time: existingEntry ? existingEntry.time : timeStr,
      shift,
      farmerId: selectedFarmer.id,
      farmerName: selectedFarmer.name,
      farmerCode: selectedFarmer.code,
      milkType: effectiveMilkType,
      liters: round3(litersNum),
      fat: round2(fatNum),
      snf: round2(snfNum),
      rate: liveRate,
      totalAmount: truncatePurchaseAmount(liveTotalAmount),
      deduction: truncatePurchaseAmount(deductionNum),
      netPayable: truncatePurchaseAmount(liveNetPayable),
      notes: notes.trim(),
      createdAt: existingEntry ? existingEntry.createdAt : now.toISOString(),
    };

    // Duplicate entry protection when adding a new entry
    if (!editingId) {
      const existingSameShift = state.collections.find(
        (c) =>
          c.date === date &&
          c.shift === shift &&
          c.farmerId === selectedFarmer.id &&
          Math.abs(c.liters - entry.liters) < 0.001 &&
          Math.abs(c.fat - entry.fat) < 0.01 &&
          Math.abs(c.snf - entry.snf) < 0.01
      );
      if (existingSameShift) {
        setPendingDuplicateEntry(entry);
        return;
      }
    }

    commitSaveEntry(entry, Boolean(editingId), liveRawTotalAmount ?? undefined);
  };

  const openWhatsAppForEntry = (entry: MilkCollectionEntry) => {
    const farmer = state.farmers.find((f) => f.id === entry.farmerId);
    const shiftHi = entry.shift === 'morning' ? 'सुबह (Morning)' : 'शाम (Evening)';
    const typeHi = entry.milkType === 'cow' ? 'गाय (Cow)' : 'भैंस (Buffalo)';
    const wholeTotal = truncatePurchaseAmount(entry.totalAmount);
    const wholeDed = truncatePurchaseAmount(entry.deduction);
    const wholeNet = truncatePurchaseAmount(wholeTotal - wholeDed);
    const msg = [
      `*${state.dairyName || 'Ujalaa Dairy'} — दूध खरीद रसीद*`,
      `--------------------------------`,
      `किसान: ${entry.farmerCode} - ${entry.farmerName}`,
      `तारीख: ${entry.date} | शिफ्ट: ${shiftHi}`,
      `समय: ${entry.time}`,
      `दूध का प्रकार: ${typeHi}`,
      `मात्रा: ${formatNumber(entry.liters, 3)} लीटर`,
      `FAT: ${formatNumber(entry.fat, 2)} | SNF: ${formatNumber(entry.snf, 2)}`,
      `रेट: ${formatCurrency(entry.rate)} प्रति लीटर`,
      `कुल दूध राशि: ${formatWholeCurrency(wholeTotal)}`,
      wholeDed > 0 ? `कटौती/एडवांस: ${formatWholeCurrency(wholeDed)}` : null,
      `*देय राशि: ${formatWholeCurrency(wholeNet)}*`,
      `--------------------------------`,
      `धन्यवाद!`,
    ]
      .filter(Boolean)
      .join('\n');

    setWaModalData({
      open: true,
      phone: farmer?.mobile || '',
      message: msg,
    });
  };

  // Current shift entries
  const shiftEntries = state.collections.filter((c) => c.date === date && c.shift === shift);
  const fullShiftSummary = calculateCollectionSummary(shiftEntries);

  // Filtered entries for the bottom Saved Collection List
  const filteredEntries = state.collections.filter((c) => {
    if (listDateFilter && c.date !== listDateFilter) return false;
    if (listShiftFilter === 'current' && c.shift !== shift) return false;
    if (listShiftFilter === 'morning' && c.shift !== 'morning') return false;
    if (listShiftFilter === 'evening' && c.shift !== 'evening') return false;
    if (milkFilter !== 'all' && c.milkType !== milkFilter) return false;
    if (entrySearch.trim()) {
      const q = entrySearch.trim().toLowerCase();
      if (
        !c.farmerName.toLowerCase().includes(q) &&
        !c.farmerCode.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const filteredSummary = calculateCollectionSummary(filteredEntries);

  // Filter attendance lists by search query
  const qAtt = farmerSearch.trim().toLowerCase();
  const filteredPendingFarmers = attendance.pendingFarmers.filter(
    (f) =>
      !qAtt ||
      f.name.toLowerCase().includes(qAtt) ||
      f.code.toLowerCase().includes(qAtt) ||
      f.mobile.includes(qAtt)
  );
  const filteredPresentFarmers = attendance.presentFarmers.filter(
    (pf) =>
      !qAtt ||
      pf.farmer.name.toLowerCase().includes(qAtt) ||
      pf.farmer.code.toLowerCase().includes(qAtt)
  );

  const scheduleBadgeText = (sched: Farmer['shiftSchedule']) => {
    if (sched === 'morning') return lang === 'hi' ? 'केवल सुबह' : 'Morning Only';
    if (sched === 'evening') return lang === 'hi' ? 'केवल शाम' : 'Evening Only';
    return lang === 'hi' ? 'सुबह और शाम' : 'Morning & Evening';
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ========================================================================== */}
      {/* TOP MOBILE-KEYBOARD-SAFE COMPACT MILK COLLECTION COCKPIT (VERY FIRST CARD) */}
      {/* Fits 100% above the mobile keyboard (y = 48px to y = 350px) with NO swipe! */}
      {/* ========================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-start">
        <div
          ref={formCardRef}
          data-testid="collection-top-cockpit"
          className="lg:col-span-7 bg-white border-2 border-blue-600/80 rounded-2xl p-2.5 sm:p-4 shadow-xs space-y-2"
        >
          {/* Row 1: Compact Date + Morning/Evening Switch + Today's Saved Totals Bar */}
          <div
            data-testid="mobile-keyboard-live-bar"
            className={`rounded-xl bg-slate-900 text-white px-2.5 py-2 space-y-1.5 border ${
              isInputFocused ? 'border-blue-400' : 'border-slate-800'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-700/80 pb-1.5">
              {/* Date & Shift inline selector */}
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <input
                  id="collection-date"
                  type="date"
                  aria-label="Collection Date"
                  value={date}
                  onChange={(e) => onChangeDate(e.target.value)}
                  className="text-xs font-bold bg-slate-800 text-white px-1.5 py-0.5 rounded border border-slate-700 focus:outline-none tabular-nums"
                />
                <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => onChangeShift('morning')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 ${
                      shift === 'morning' ? 'bg-blue-600 text-white' : 'text-slate-300'
                    }`}
                  >
                    <Sun className="w-3 h-3" />
                    {lang === 'hi' ? 'सुबह' : 'AM'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeShift('evening')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 ${
                      shift === 'evening' ? 'bg-blue-600 text-white' : 'text-slate-300'
                    }`}
                  >
                    <Moon className="w-3 h-3" />
                    {lang === 'hi' ? 'शाम' : 'PM'}
                  </button>
                </div>
              </div>

              {/* Today's Saved Totals (Strictly separated from current unsaved entry) */}
              <div className="flex items-center gap-2 text-[11px] tabular-nums">
                <span className="text-slate-400 flex items-center gap-1">
                  <Keyboard className="w-3 h-3 text-blue-400" />
                  {lang === 'hi' ? 'आज सेव:' : 'Saved:'}
                </span>
                <span
                  data-testid="today-saved-liters"
                  className="font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded"
                >
                  {formatNumber(todaySavedSummary.totalLiters, 3)} L
                </span>
                <span className="hidden sm:inline text-amber-300 font-semibold">
                  F:{' '}
                  <strong data-testid="today-saved-avg-fat">
                    {formatNumber(todaySavedSummary.avgFat, 2)}
                  </strong>
                </span>
                <span className="hidden sm:inline text-cyan-300 font-semibold">
                  S:{' '}
                  <strong data-testid="today-saved-avg-snf">
                    {formatNumber(todaySavedSummary.avgSnf, 2)}
                  </strong>
                </span>
                <span
                  data-testid="today-saved-amount"
                  className="font-bold text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded"
                >
                  {formatWholeCurrency(todaySavedSummary.totalAmount)}
                </span>
              </div>
            </div>

            {/* Row 2: Ultra-Compact Live Preview Strip (FAT · SNF · Qty · Rate/L · Total Amount) */}
            <div
              data-testid="live-collection-preview"
              className="grid grid-cols-5 gap-1 text-center tabular-nums items-center bg-blue-950/90 border border-blue-700/70 rounded-lg px-1.5 py-1"
            >
              <div>
                <span className="block text-[9px] text-blue-300 leading-tight">
                  {lang === 'hi' ? 'प्रकार / FAT' : 'Type / FAT'}
                </span>
                <span className="text-[11px] sm:text-xs font-bold text-white leading-tight block truncate">
                  <span data-testid="live-preview-milk-type">
                    {effectiveMilkType === 'cow'
                      ? lang === 'hi'
                        ? 'गाय (Cow)'
                        : 'Cow'
                      : effectiveMilkType === 'buffalo'
                      ? lang === 'hi'
                        ? 'भैंस (Buffalo)'
                        : 'Buffalo'
                      : '—'}
                  </span>{' '}
                  · {hasValidFat ? fatNum.toFixed(1) : '—'}
                </span>
              </div>

              <div>
                <span className="block text-[9px] text-blue-300 leading-tight">SNF</span>
                <span className="text-xs font-bold text-white leading-tight">
                  {hasValidSnf ? snfNum.toFixed(1) : '—'}
                </span>
              </div>

              <div>
                <span className="block text-[9px] text-blue-300 leading-tight">
                  {lang === 'hi' ? 'मात्रा (L)' : 'Qty (L)'}
                </span>
                <span
                  data-testid="live-preview-liters"
                  className="text-xs font-bold text-white leading-tight"
                >
                  {hasValidLiters ? formatNumber(litersNum, 3) : '—'}
                </span>
              </div>

              <div>
                <span className="block text-[9px] text-cyan-300 leading-tight">
                  {lang === 'hi' ? 'रेट/L' : 'Rate/L'}
                </span>
                <span
                  data-testid="live-preview-rate"
                  className="text-xs font-bold text-cyan-300 leading-tight"
                >
                  {liveRate !== null ? formatCurrency(liveRate) : '—'}
                </span>
              </div>

              <div className="bg-emerald-900/90 border border-emerald-500/60 rounded px-1 py-0.5">
                <span className="block text-[9px] text-emerald-200 leading-tight">
                  {lang === 'hi' ? 'कुल रकम (पूर्णांक)' : 'Total Amt'}
                </span>
                <span
                  data-testid="live-preview-amount"
                  className="text-xs sm:text-sm font-bold text-emerald-300 leading-tight"
                >
                  {liveTotalAmount !== null ? formatWholeCurrency(liveTotalAmount) : '—'}
                </span>
              </div>
            </div>

            {/* Warning if rate chart not found */}
            {hasValidFat && hasValidSnf && !rateLookup.found && (
              <div className="flex items-center justify-between gap-2 text-[11px] text-amber-200 bg-amber-950/90 px-2 py-1 rounded border border-amber-600/60">
                <span className="truncate">
                  {lang === 'hi' ? rateLookup.warningHi : rateLookup.warningEn}
                </span>
                {!relevantChart && (
                  <button
                    type="button"
                    onClick={() => onNavigate('ratechart')}
                    className="px-2 py-0.5 bg-amber-500 text-slate-950 font-bold rounded shrink-0 text-[10px]"
                  >
                    {lang === 'hi' ? 'रेट चार्ट इंपोर्ट' : 'Import Chart'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* COMPACT SINGLE-VIEW ENTRY FORM (All fields side-by-side above mobile keyboard) */}
          <form
            onSubmit={handleSubmit}
            onFocus={() => setIsInputFocused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setIsInputFocused(false);
              }
            }}
            className="space-y-2"
          >
            {/* Row 3: Farmer Select (8 cols) + Milk Type Override (4 cols) in ONE row */}
            <div className="grid grid-cols-12 gap-1.5 items-end">
              <div className="col-span-8">
                <div className="flex items-center justify-between mb-0.5">
                  <label
                    htmlFor="col-farmer-select"
                    className="text-[11px] font-bold text-slate-700"
                  >
                    {lang === 'hi' ? 'किसान चुनें *' : 'Farmer *'}
                    {selectedFarmerObj ? ` (${selectedFarmerObj.code})` : ''}
                  </label>
                  {state.farmers.length === 0 && (
                    <button
                      type="button"
                      onClick={() => onNavigate('farmers')}
                      className="text-[10px] font-bold text-blue-600 hover:underline"
                    >
                      {lang === 'hi' ? '+ किसान जोड़ें' : '+ Add Farmer'}
                    </button>
                  )}
                </div>
                <select
                  id="col-farmer-select"
                  value={farmerId}
                  onChange={(e) => {
                    setFarmerId(e.target.value);
                    if (e.target.value) {
                      setTimeout(() => fatInputRef.current?.focus(), 20);
                    }
                  }}
                  className="w-full h-9 px-2.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">
                    {lang === 'hi'
                      ? `-- ${shift === 'morning' ? 'सुबह' : 'शाम'} किसान चुनें --`
                      : '-- Select Farmer --'}
                  </option>
                  {scheduledForShiftFarmers.length > 0 && (
                    <optgroup
                      label={
                        lang === 'hi'
                          ? `${shift === 'morning' ? 'सुबह' : 'शाम'} के किसान (${
                              scheduledForShiftFarmers.length
                            })`
                          : 'Scheduled Farmers'
                      }
                    >
                      {scheduledForShiftFarmers.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.code} — {f.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {otherShiftFarmers.length > 0 && (
                    <optgroup label={lang === 'hi' ? 'अन्य शिफ्ट किसान' : 'Other Shift Farmers'}>
                      {otherShiftFarmers.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.code} — {f.name} ({scheduleBadgeText(f.shiftSchedule)})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div className="col-span-4">
                <label
                  htmlFor="col-milk-type"
                  className="block text-[11px] font-bold text-slate-700 mb-0.5 truncate"
                >
                  {lang === 'hi' ? 'दूध प्रकार' : 'Milk Type'}
                </label>
                <select
                  id="col-milk-type"
                  value={milkTypeOverride}
                  onChange={(e) => setMilkTypeOverride(e.target.value as 'auto' | MilkType)}
                  className="w-full h-9 px-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="auto">
                    {lang === 'hi'
                      ? `ऑटो${
                          effectiveMilkType
                            ? ` (${effectiveMilkType === 'cow' ? 'गाय' : 'भैंस'})`
                            : ''
                        }`
                      : 'Auto'}
                  </option>
                  <option value="cow">{lang === 'hi' ? 'गाय (Cow)' : 'Cow'}</option>
                  <option value="buffalo">{lang === 'hi' ? 'भैंस (Buf)' : 'Buffalo'}</option>
                </select>
              </div>
            </div>

            {/* Row 4: FAT, SNF, AND QUANTITY ALL IN ONE SINGLE HORIZONTAL ROW ON MOBILE (grid-cols-3) */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
              <div>
                <label
                  htmlFor="col-fat"
                  className="block text-[11px] font-bold text-slate-800 mb-0.5 truncate"
                >
                  {lang === 'hi' ? '1. FAT (51→5.1)*' : '1. FAT *'}
                </label>
                <input
                  ref={fatInputRef}
                  id="col-fat"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="5.1"
                  value={fatStr}
                  onChange={handleFatChange}
                  className="w-full h-10 px-2.5 text-sm sm:text-base font-bold font-mono border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-600 tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="col-snf"
                  className="block text-[11px] font-bold text-slate-800 mb-0.5 truncate"
                >
                  {lang === 'hi' ? '2. SNF (85→8.5)*' : '2. SNF *'}
                </label>
                <input
                  ref={snfInputRef}
                  id="col-snf"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="8.5"
                  value={snfStr}
                  onChange={handleSnfChange}
                  className="w-full h-10 px-2.5 text-sm sm:text-base font-bold font-mono border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-600 tabular-nums"
                />
              </div>

              <div>
                <label
                  htmlFor="col-liters"
                  className="block text-[11px] font-bold text-slate-800 mb-0.5 truncate"
                >
                  {lang === 'hi' ? '3. मात्रा L (5258)*' : '3. Qty (L) *'}
                </label>
                <input
                  ref={litersInputRef}
                  id="col-liters"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="5.258"
                  value={litersStr}
                  onChange={handleLitersChange}
                  className="w-full h-10 px-2.5 text-sm sm:text-base font-bold font-mono border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-600 tabular-nums"
                />
              </div>
            </div>

            {/* Row 5: Rate + Total Amount (Whole Integer) + Save Button + Camera Button + Options Toggle */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {/* Inline Rate & Total Pill */}
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs tabular-nums shrink-0">
                <div>
                  <span className="block text-[9px] text-slate-500 leading-none">
                    {lang === 'hi' ? 'रेट/L' : 'Rate/L'}
                  </span>
                  <strong className="text-blue-800 font-bold">
                    {liveRate !== null ? formatCurrency(liveRate) : '—'}
                  </strong>
                </div>
                <div className="border-l border-blue-200 pl-2">
                  <span className="block text-[9px] text-slate-500 leading-none">
                    {lang === 'hi' ? 'कुल रकम (पूर्ण)' : 'Total'}
                  </span>
                  <strong
                    data-testid="inline-live-total-amount"
                    className="text-emerald-700 font-bold text-xs sm:text-sm"
                  >
                    {liveTotalAmount !== null ? formatWholeCurrency(liveTotalAmount) : '—'}
                  </strong>
                  {liveRawTotalAmount !== null &&
                    liveTotalAmount !== null &&
                    liveRawTotalAmount !== liveTotalAmount && (
                      <span
                        data-testid="inline-truncated-decimal-hint"
                        className="ml-1 text-[10px] text-slate-400 line-through"
                      >
                        ₹{liveRawTotalAmount.toFixed(2)}
                      </span>
                    )}
                </div>
              </div>

              {/* Primary Save Button */}
              <button
                ref={saveBtnRef}
                data-testid="save-collection-btn"
                type="submit"
                className="flex-1 min-w-[130px] h-10 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  {editingId
                    ? lang === 'hi'
                      ? 'बदलाव सेव करें'
                      : 'Update'
                    : lang === 'hi'
                    ? 'दूध एंट्री सेव करें'
                    : 'Save Entry'}
                </span>
              </button>

              {/* Camera / Photo Auto-Entry Button */}
              <button
                type="button"
                data-testid="camera-slip-btn"
                onClick={() => {
                  setCameraError(null);
                  setShowCameraModal(true);
                }}
                title={
                  lang === 'hi'
                    ? 'लिखी हुई दूध पर्ची का फोटो खींचकर या अपलोड करके ऑटोमैटिक सेव करें'
                    : 'Take or upload a photo of written milk entry to auto-save'
                }
                className="h-10 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1 shrink-0"
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span>{lang === 'hi' ? 'कैमरा / फोटो' : 'Camera'}</span>
              </button>

              {/* Hidden direct file input for quick photo upload / camera capture */}
              <input
                ref={cameraFileInputRef}
                data-testid="camera-file-input"
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleSlipPhotoFile(file);
                  }
                  e.target.value = '';
                }}
              />

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="h-10 px-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0"
                >
                  {lang === 'hi' ? 'रद्द' : 'Cancel'}
                </button>
              )}

              {/* Toggle Optional Deduction / Notes / Auto-Decimal Settings */}
              <button
                type="button"
                onClick={() => setShowMoreOptions((prev) => !prev)}
                title={lang === 'hi' ? 'कटौती, नोट और ऑटो-दशमलव सेटिंग' : 'More Options'}
                className={`h-10 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1 shrink-0 ${
                  showMoreOptions || deductionNum > 0 || notes
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{lang === 'hi' ? 'विकल्प' : 'Options'}</span>
              </button>
            </div>

            {/* Confirmation Notice Banner after manual or camera auto-save */}
            {lastSavedNotice && lastSavedNotice.entries.length > 0 && (
              <div
                data-testid="collection-saved-notice"
                className="p-2 bg-emerald-50 border border-emerald-300 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold truncate">
                    {lastSavedNotice.source === 'camera'
                      ? lang === 'hi'
                        ? `कैमरा/फोटो से ${lastSavedNotice.entries.length} दूध एंट्री अपने-आप सेव हो गई:`
                        : `Auto-saved ${lastSavedNotice.entries.length} entry from photo:`
                      : lang === 'hi'
                      ? 'दूध एंट्री सेव हो गई:'
                      : 'Saved:'}{' '}
                    {lastSavedNotice.entries
                      .map(
                        (en) =>
                          `${en.farmerCode}-${en.farmerName} (${formatNumber(
                            en.liters,
                            3
                          )}L · कुल ${formatWholeCurrency(en.totalAmount)})`
                      )
                      .join(', ')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    data-testid="saved-notice-whatsapp-btn"
                    onClick={() => openWhatsAppForEntry(lastSavedNotice.entries[0])}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1 text-[11px]"
                  >
                    <MessageSquare className="w-3 h-3" />
                    {lang === 'hi' ? 'रसीद / मैसेज देखें' : 'Receipt'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLastSavedNotice(null)}
                    className="p-1 text-emerald-700 hover:bg-emerald-100 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Collapsible Optional Fields (Deduction, Notes, Auto-Dot Toggles) */}
            {showMoreOptions && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="col-deduction"
                      className="block text-[11px] font-bold text-slate-700 mb-0.5"
                    >
                      {lang === 'hi' ? 'तत्काल कटौती (₹)' : 'Deduction (₹)'}
                    </label>
                    <input
                      id="col-deduction"
                      type="number"
                      step="0.01"
                      min="0"
                      value={deductionStr}
                      onChange={(e) => setDeductionStr(e.target.value)}
                      className="w-full h-8 px-2 text-xs font-mono bg-white border border-slate-300 rounded-lg tabular-nums"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="col-notes"
                      className="block text-[11px] font-bold text-slate-700 mb-0.5"
                    >
                      {lang === 'hi' ? 'टिप्पणी (Notes)' : 'Notes'}
                    </label>
                    <input
                      id="col-notes"
                      type="text"
                      placeholder={lang === 'hi' ? 'वैकल्पिक...' : 'Optional...'}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full h-8 px-2 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-200">
                  <label className="inline-flex items-center gap-1 cursor-pointer text-[11px] font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={autoDecimalFatSnf}
                      onChange={(e) => setAutoDecimalFatSnf(e.target.checked)}
                    />
                    <span>{lang === 'hi' ? 'FAT/SNF ऑटो-दशमलव (51→5.1)' : 'FAT/SNF Auto-Dot'}</span>
                  </label>
                  <label className="inline-flex items-center gap-1 cursor-pointer text-[11px] font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={smartQuantityAutoDot}
                      onChange={(e) => setSmartQuantityAutoDot(e.target.checked)}
                    />
                    <span>{lang === 'hi' ? 'मात्रा ऑटो-दशमलव (5258→5.258)' : 'Qty Auto-Dot'}</span>
                  </label>
                  {smartQuantityAutoDot && (
                    <label className="inline-flex items-center gap-1 cursor-pointer text-[11px] font-semibold text-blue-800">
                      <input
                        type="checkbox"
                        checked={twoDigitLiterMode}
                        onChange={(e) => setTwoDigitLiterMode(e.target.checked)}
                      />
                      <span>{lang === 'hi' ? '2-अंक लीटर (10-99 L)' : '2-Digit Liters'}</span>
                    </label>
                  )}
                </div>
              </div>
            )}

            {formError && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
          </form>
        </div>

        {/* Right Column (5 cols on lg): Shift-wise Farmer Attendance Lists */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {lang === 'hi'
                  ? `किसका दूध आया / बाकी (${shift === 'morning' ? 'सुबह' : 'शाम'})`
                  : `Shift Attendance (${shift === 'morning' ? 'Morning' : 'Evening'})`}
              </h3>
              <p className="text-[11px] text-slate-500">
                {lang === 'hi'
                  ? `उपस्थिति: ${attendance.presentCount}/${attendance.totalScheduledCount} (${attendance.completionPercentage}%)`
                  : `Present: ${attendance.presentCount}/${attendance.totalScheduledCount}`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setAttendanceTab('pending')}
              className={`min-h-[34px] px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                attendanceTab === 'pending'
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lang === 'hi'
                ? `बाकी है (${attendance.pendingCount})`
                : `Pending (${attendance.pendingCount})`}
            </button>
            <button
              type="button"
              onClick={() => setAttendanceTab('present')}
              className={`min-h-[34px] px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                attendanceTab === 'present'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lang === 'hi'
                ? `दूध आ गया (${attendance.presentCount})`
                : `Present (${attendance.presentCount})`}
            </button>
            <button
              type="button"
              onClick={() => setAttendanceTab('other')}
              className={`min-h-[34px] px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                attendanceTab === 'other'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lang === 'hi'
                ? `छुट्टी/अन्य (${attendance.onLeaveCount + attendance.notScheduledFarmers.length})`
                : `Other (${attendance.onLeaveCount + attendance.notScheduledFarmers.length})`}
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={
                lang === 'hi'
                  ? 'किसान का नाम या ID खोजें...'
                  : 'Search farmer by name or ID...'
              }
              value={farmerSearch}
              onChange={(e) => setFarmerSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {attendanceTab === 'pending' && (
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
              {filteredPendingFarmers.length === 0 ? (
                <div className="py-5 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  {state.farmers.length === 0
                    ? lang === 'hi'
                      ? 'अभी कोई किसान पंजीकृत नहीं है।'
                      : 'No farmers registered yet.'
                    : lang === 'hi'
                    ? 'इस शिफ्ट में किसी भी निर्धारित किसान का दूध आना बाकी नहीं है!'
                    : 'No pending farmers remaining!'}
                </div>
              ) : (
                filteredPendingFarmers.map((f) => (
                  <div
                    key={f.id}
                    className="p-2 rounded-xl border border-slate-200 hover:border-blue-300 bg-slate-50/60 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {f.code} — {f.name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {scheduleBadgeText(f.shiftSchedule)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleQuickSelectFarmer(f)}
                        className="h-8 px-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg"
                      >
                        {lang === 'hi' ? 'दूध की एंट्री करें' : 'Enter Milk'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleFarmerLeave(date, shift, f.id, 'आज छुट्टी')}
                        className="h-8 px-2 bg-slate-200/80 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold rounded-lg"
                      >
                        {lang === 'hi' ? 'आज छुट्टी' : 'Leave'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {attendanceTab === 'present' && (
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
              {filteredPresentFarmers.length === 0 ? (
                <div className="py-5 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  {lang === 'hi'
                    ? 'इस शिफ्ट में अभी कोई दूध एंट्री सेव नहीं हुई है।'
                    : 'No milk entries saved yet.'}
                </div>
              ) : (
                filteredPresentFarmers.map((pf) => {
                  const lastEntry = pf.entries[pf.entries.length - 1];
                  return (
                    <div
                      key={pf.farmer.id}
                      className="p-2 rounded-xl border border-emerald-200 bg-emerald-50/40 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {pf.farmer.code} — {pf.farmer.name}
                        </p>
                        <p className="text-[11px] text-slate-600 tabular-nums">
                          {formatNumber(pf.totalLiters, 3)} L · F:{lastEntry.fat} · S:{lastEntry.snf} ·{' '}
                          <strong>{formatWholeCurrency(pf.totalAmount)}</strong>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEditEntry(lastEntry)}
                        className="h-7 px-2 bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg shrink-0 flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        {lang === 'hi' ? 'एडिट' : 'Edit'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {attendanceTab === 'other' && (
            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {attendance.onLeaveFarmers.map((f) => (
                <div
                  key={f.id}
                  className="p-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs"
                >
                  <span className="font-bold text-slate-900">
                    {f.code} — {f.name} (आज छुट्टी)
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleFarmerLeave(date, shift, f.id)}
                    className="px-2 py-1 bg-white border border-amber-300 text-amber-900 font-semibold rounded-lg text-[11px]"
                  >
                    {lang === 'hi' ? 'छुट्टी हटाएँ' : 'Undo Leave'}
                  </button>
                </div>
              ))}
              {attendance.notScheduledFarmers.map((f) => (
                <div
                  key={f.id}
                  className="p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-slate-800">
                    {f.code} — {f.name} ({scheduleBadgeText(f.shiftSchedule)})
                  </span>
                  <button
                    type="button"
                    onClick={() => handleQuickSelectFarmer(f)}
                    className="px-2 py-1 bg-white border border-slate-200 text-slate-700 font-semibold rounded-lg text-[11px]"
                  >
                    {lang === 'hi' ? 'फिर भी एंट्री करें' : 'Enter Anyway'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* REQUIREMENT 6: SAVED MILK COLLECTION ENTRIES LIST, FILTERS & SUMMARY */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              {lang === 'hi'
                ? 'सेव की गई दूध कलेक्शन एंट्रियाँ (Saved Milk Collection List)'
                : 'Saved Milk Collection Entries'}
            </h3>
          </div>

          {/* 4 Filters: Date, Shift (Morning/Evening), Milk Type (Cow/Buffalo), Farmer Search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-600">
                {lang === 'hi' ? 'तारीख:' : 'Date:'}
              </span>
              <input
                type="date"
                aria-label="Filter by date"
                value={listDateFilter}
                onChange={(e) => setListDateFilter(e.target.value)}
                className="text-xs font-bold bg-transparent text-slate-900 focus:outline-none tabular-nums"
              />
              {listDateFilter && (
                <button
                  type="button"
                  onClick={() => setListDateFilter('')}
                  className="text-[10px] text-blue-600 font-bold hover:underline ml-1"
                >
                  {lang === 'hi' ? 'सभी तारीख' : 'All'}
                </button>
              )}
            </div>

            <select
              aria-label="Filter by shift"
              value={listShiftFilter}
              onChange={(e) =>
                setListShiftFilter(e.target.value as 'current' | 'all' | ShiftType)
              }
              className="h-8 px-2.5 text-xs font-semibold bg-slate-100 border border-slate-200 rounded-xl"
            >
              <option value="current">
                {lang === 'hi'
                  ? `वर्तमान शिफ्ट (${shift === 'morning' ? 'सुबह' : 'शाम'})`
                  : `Current Shift (${shift})`}
              </option>
              <option value="all">
                {lang === 'hi' ? 'सुबह + शाम (दोनों शिफ्ट)' : 'Both Shifts'}
              </option>
              <option value="morning">{lang === 'hi' ? 'केवल सुबह' : 'Morning Only'}</option>
              <option value="evening">{lang === 'hi' ? 'केवल शाम' : 'Evening Only'}</option>
            </select>

            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => setMilkFilter('all')}
                className={`px-2 py-1 text-xs font-semibold rounded-lg ${
                  milkFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {lang === 'hi' ? 'सभी' : 'All'}
              </button>
              <button
                type="button"
                onClick={() => setMilkFilter('cow')}
                className={`px-2 py-1 text-xs font-semibold rounded-lg ${
                  milkFilter === 'cow' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                {lang === 'hi' ? 'गाय' : 'Cow'}
              </button>
              <button
                type="button"
                onClick={() => setMilkFilter('buffalo')}
                className={`px-2 py-1 text-xs font-semibold rounded-lg ${
                  milkFilter === 'buffalo' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                {lang === 'hi' ? 'भैंस' : 'Buffalo'}
              </button>
            </div>

            <input
              type="text"
              placeholder={lang === 'hi' ? 'किसान का नाम खोजें...' : 'Search farmer...'}
              value={entrySearch}
              onChange={(e) => setEntrySearch(e.target.value)}
              className="h-8 px-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-blue-50 text-blue-950 border-b border-blue-100">
                <th className="py-2 px-2.5 text-left font-bold">
                  {lang === 'hi' ? 'क्र.' : '#'}
                </th>
                <th className="py-2 px-2.5 text-left font-bold">
                  {lang === 'hi' ? 'तारीख' : 'Date'}
                </th>
                <th className="py-2 px-2.5 text-left font-bold">
                  {lang === 'hi' ? 'किसान का नाम' : 'Farmer Name'}
                </th>
                <th className="py-2 px-2.5 text-left font-bold">
                  {lang === 'hi' ? 'सुबह/शाम' : 'Shift'}
                </th>
                <th className="py-2 px-2.5 text-left font-bold">
                  {lang === 'hi' ? 'दूध प्रकार' : 'Milk Type'}
                </th>
                <th className="py-2 px-2.5 text-right font-bold">
                  {lang === 'hi' ? 'मात्रा (L)' : 'Quantity'}
                </th>
                <th className="py-2 px-2.5 text-right font-bold">FAT</th>
                <th className="py-2 px-2.5 text-right font-bold">SNF</th>
                <th className="py-2 px-2.5 text-right font-bold">
                  {lang === 'hi' ? 'प्रति लीटर रेट' : 'Rate/L'}
                </th>
                <th className="py-2 px-2.5 text-right font-bold">
                  {lang === 'hi' ? 'कुल रकम' : 'Total Amount'}
                </th>
                <th className="py-2 px-2.5 text-center font-bold">
                  {lang === 'hi' ? 'एडिट / डिलीट' : 'Actions'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-6 text-center text-slate-500">
                    {lang === 'hi'
                      ? 'अभी कोई दूध कलेक्शन रिकॉर्ड नहीं है।'
                      : 'No milk collection entries found for this filter.'}
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry, idx) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="py-2 px-2.5 font-medium text-slate-500">{idx + 1}</td>
                    <td className="py-2 px-2.5 text-slate-600">
                      {entry.date}
                      <span className="block text-[10px] text-slate-400">{entry.time}</span>
                    </td>
                    <td className="py-2 px-2.5 font-bold text-slate-900">
                      {entry.farmerCode} — {entry.farmerName}
                    </td>
                    <td className="py-2 px-2.5">
                      {entry.shift === 'morning'
                        ? lang === 'hi'
                          ? 'सुबह'
                          : 'Morning'
                        : lang === 'hi'
                        ? 'शाम'
                        : 'Evening'}
                    </td>
                    <td className="py-2 px-2.5">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold ${
                          entry.milkType === 'cow'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-indigo-50 text-indigo-700'
                        }`}
                      >
                        {entry.milkType === 'cow'
                          ? lang === 'hi'
                            ? 'गाय'
                            : 'Cow'
                          : lang === 'hi'
                          ? 'भैंस'
                          : 'Buffalo'}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-right font-bold text-slate-900">
                      {formatNumber(entry.liters, 3)}
                    </td>
                    <td className="py-2 px-2.5 text-right">{formatNumber(entry.fat, 2)}</td>
                    <td className="py-2 px-2.5 text-right">{formatNumber(entry.snf, 2)}</td>
                    <td className="py-2 px-2.5 text-right">{formatCurrency(entry.rate)}</td>
                    <td
                      data-testid={`saved-entry-amount-${entry.farmerCode}`}
                      className="py-2 px-2.5 text-right font-bold text-blue-800"
                    >
                      {formatWholeCurrency(entry.totalAmount)}
                    </td>
                    <td className="py-2 px-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEditEntry(entry)}
                          aria-label={`Edit ${entry.farmerName} entry`}
                          className="min-h-[30px] px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg font-semibold flex items-center gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>{lang === 'hi' ? 'एडिट' : 'Edit'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openWhatsAppForEntry(entry)}
                          aria-label={`Share ${entry.farmerName} entry on WhatsApp`}
                          className="min-h-[30px] px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-semibold flex items-center gap-1"
                        >
                          <MessageSquare className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTargetId(entry.id)}
                          aria-label={`Delete ${entry.farmerName} entry`}
                          className="min-h-[30px] px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-semibold flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{lang === 'hi' ? 'डिलीट' : 'Delete'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr
                data-testid="collection-summary-row"
                className="bg-slate-100 text-slate-900 border-t-2 border-slate-300 font-bold tabular-nums"
              >
                <td colSpan={5} className="py-2.5 px-2.5">
                  {lang === 'hi'
                    ? `कुल सारांश — कुल किसानों की संख्या: ${filteredSummary.distinctFarmerCount} (कुल एंट्रियाँ: ${filteredSummary.entryCount})`
                    : `Total Summary — Farmers: ${filteredSummary.distinctFarmerCount} (Entries: ${filteredSummary.entryCount})`}
                </td>
                <td className="py-2.5 px-2.5 text-right text-blue-800">
                  {formatNumber(filteredSummary.totalLiters, 3)} L
                </td>
                <td className="py-2.5 px-2.5 text-right">
                  {formatNumber(filteredSummary.avgFat, 2)}
                </td>
                <td className="py-2.5 px-2.5 text-right">
                  {formatNumber(filteredSummary.avgSnf, 2)}
                </td>
                <td className="py-2.5 px-2.5 text-right">
                  {filteredSummary.avgRate !== null
                    ? formatCurrency(filteredSummary.avgRate)
                    : '—'}
                </td>
                <td className="py-2.5 px-2.5 text-right text-blue-800">
                  {formatWholeCurrency(filteredSummary.totalAmount)}
                </td>
                <td className="py-2.5 px-2.5 text-center text-[11px] text-slate-500 font-normal">
                  {lang === 'hi' ? 'भारित औसत' : 'Weighted Avg'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Bottom 5-Box Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 pt-3 border-t border-slate-100 text-center tabular-nums">
          <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
            <span className="block text-[10px] text-slate-500">
              {lang === 'hi' ? 'कुल किसानों की संख्या' : 'Total Farmers'}
            </span>
            <span
              data-testid="summary-distinct-farmers"
              className="text-sm font-bold text-slate-900"
            >
              {filteredSummary.distinctFarmerCount}
            </span>
          </div>
          <div className="p-2 rounded-xl bg-blue-50/70 border border-blue-200">
            <span className="block text-[10px] text-blue-800">
              {lang === 'hi' ? 'कुल लीटर दूध' : 'Total Liters'}
            </span>
            <span className="text-sm font-bold text-blue-900">
              {formatNumber(filteredSummary.totalLiters, 3)} L
            </span>
          </div>
          <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <span className="block text-[10px] text-emerald-800">
              {lang === 'hi' ? 'कुल रकम' : 'Total Amount'}
            </span>
            <span className="text-sm font-bold text-emerald-800">
              {formatWholeCurrency(filteredSummary.totalAmount)}
            </span>
          </div>
          <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
            <span className="block text-[10px] text-slate-500">
              {lang === 'hi' ? 'औसत FAT' : 'Average FAT'}
            </span>
            <span className="text-sm font-bold text-slate-900">
              {formatNumber(filteredSummary.avgFat, 2)}
            </span>
          </div>
          <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
            <span className="block text-[10px] text-slate-500">
              {lang === 'hi' ? 'औसत SNF' : 'Average SNF'}
            </span>
            <span className="text-sm font-bold text-slate-900">
              {formatNumber(filteredSummary.avgSnf, 2)}
            </span>
          </div>
        </div>
      </div>

      {/* 9 Mandatory Shift-wise Summary Stats (Placed below so top entry form is never pushed down) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5">
        <div className="text-xs font-bold text-slate-700 mb-2">
          {lang === 'hi'
            ? `शिफ्ट उपस्थिति एवं सारांश (${date} · ${shift === 'morning' ? 'सुबह' : 'शाम'})`
            : `Shift Summary (${date} · ${shift})`}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 text-center">
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <span className="block text-[10px] text-slate-500">
              {lang === 'hi' ? 'निर्धारित किसान' : 'Scheduled'}
            </span>
            <span className="text-xs font-bold text-slate-900 tabular-nums">
              {attendance.totalScheduledCount}
            </span>
          </div>
          <div className="p-2 bg-emerald-50/70 rounded-xl border border-emerald-100">
            <span className="block text-[10px] text-emerald-800">
              {lang === 'hi' ? 'दूध दे चुके' : 'Present'}
            </span>
            <span className="text-xs font-bold text-emerald-700 tabular-nums">
              {attendance.presentCount}
            </span>
          </div>
          <div className="p-2 bg-amber-50/70 rounded-xl border border-amber-100">
            <span className="block text-[10px] text-amber-800">
              {lang === 'hi' ? 'दूध आना बाकी' : 'Pending'}
            </span>
            <span className="text-xs font-bold text-amber-700 tabular-nums">
              {attendance.pendingCount}
            </span>
          </div>
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <span className="block text-[10px] text-slate-500">
              {lang === 'hi' ? 'कुल एंट्रियाँ' : 'Entries'}
            </span>
            <span className="text-xs font-bold text-slate-900 tabular-nums">
              {fullShiftSummary.entryCount}
            </span>
          </div>
          <div className="p-2 bg-blue-50/70 rounded-xl border border-blue-100">
            <span className="block text-[10px] text-blue-800">
              {lang === 'hi' ? 'शिफ्ट कुल लीटर' : 'Shift Liters'}
            </span>
            <span className="text-xs font-bold text-blue-800 tabular-nums">
              {formatNumber(fullShiftSummary.totalLiters, 3)} L
            </span>
          </div>
          <div className="p-2 bg-blue-50/70 rounded-xl border border-blue-100">
            <span className="block text-[10px] text-blue-800">
              {lang === 'hi' ? 'शिफ्ट कुल राशि' : 'Shift Amount'}
            </span>
            <span className="text-xs font-bold text-blue-800 tabular-nums">
              {formatWholeCurrency(fullShiftSummary.totalAmount)}
            </span>
          </div>
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <span className="block text-[10px] text-slate-500">
              {lang === 'hi' ? 'औसत FAT' : 'Avg FAT'}
            </span>
            <span className="text-xs font-bold text-slate-900 tabular-nums">
              {formatNumber(fullShiftSummary.avgFat, 2)}
            </span>
          </div>
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <span className="block text-[10px] text-slate-500">
              {lang === 'hi' ? 'औसत SNF' : 'Avg SNF'}
            </span>
            <span className="text-xs font-bold text-slate-900 tabular-nums">
              {formatNumber(fullShiftSummary.avgSnf, 2)}
            </span>
          </div>
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
            <span className="block text-[10px] text-slate-500">
              {lang === 'hi' ? 'औसत रेट/L' : 'Avg Rate/L'}
            </span>
            <span className="text-xs font-bold text-slate-900 tabular-nums">
              {fullShiftSummary.avgRate !== null ? formatCurrency(fullShiftSummary.avgRate) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Camera / Photo Upload Auto-Entry Modal */}
      {showCameraModal && (
        <div
          data-testid="camera-slip-modal"
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    {lang === 'hi'
                      ? 'कैमरा / फोटो से दूध एंट्री ऑटो-सेव करें'
                      : 'Camera / Photo Milk Entry Auto-Save'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {lang === 'hi'
                      ? 'लिखी हुई दूध पर्ची का फोटो खींचें या अपलोड करें — एंट्री अपने-आप सेव हो जाएगी'
                      : 'Take a photo or upload a written milk slip to automatically extract & save'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopLiveCamera();
                  setShowCameraModal(false);
                }}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Option 1: Upload Photo or Capture from Camera */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                data-testid="upload-slip-photo-btn"
                disabled={isScanningSlip}
                onClick={() => cameraFileInputRef.current?.click()}
                className="min-h-[48px] px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs"
              >
                {isScanningSlip ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{lang === 'hi' ? 'फोटो स्कैन हो रहा है...' : 'Scanning Photo...'}</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>
                      {lang === 'hi'
                        ? 'फोटो खींचें / गैलरी से अपलोड करें'
                        : 'Take / Upload Slip Photo'}
                    </span>
                  </>
                )}
              </button>

              {!isLiveCameraActive ? (
                <button
                  type="button"
                  data-testid="start-live-camera-btn"
                  disabled={isScanningSlip}
                  onClick={startLiveCamera}
                  className="min-h-[48px] px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs"
                >
                  <Camera className="w-4 h-4" />
                  <span>{lang === 'hi' ? 'लाइव कैमरा चालू करें' : 'Open Live Camera'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopLiveCamera}
                  className="min-h-[48px] px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  <span>{lang === 'hi' ? 'कैमरा बंद करें' : 'Stop Camera'}</span>
                </button>
              )}
            </div>

            {/* Live Video Feed if active */}
            {isLiveCameraActive && (
              <div className="space-y-2 bg-slate-950 p-3 rounded-xl">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-52 object-cover rounded-lg bg-black"
                />
                <button
                  type="button"
                  data-testid="capture-live-photo-btn"
                  onClick={handleCaptureFromLiveVideo}
                  className="w-full min-h-[42px] bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-xs sm:text-sm rounded-lg flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  {lang === 'hi'
                    ? 'फोटो क्लिक करें और एंट्री ऑटो-सेव करें'
                    : 'Capture Photo & Auto-Save Entry'}
                </button>
              </div>
            )}

            {/* Preview of uploaded image */}
            {cameraPreviewUrl && !isLiveCameraActive && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-center">
                <img
                  src={cameraPreviewUrl}
                  alt="Milk slip preview"
                  className="max-h-40 mx-auto rounded-lg object-contain"
                />
              </div>
            )}

            {/* Quick Written Slip Text / OCR Fallback Box (Works offline too) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <label
                htmlFor="camera-slip-text-input"
                className="block text-xs font-bold text-slate-800"
              >
                {lang === 'hi'
                  ? 'या लिखी हुई पर्ची का विवरण यहाँ लिखें/पेस्ट करें (ऑफलाइन तुरंत ऑटो-सेव):'
                  : 'Or paste/type written slip text (farmer code, liters, FAT, SNF):'}
              </label>
              <p className="text-[11px] text-slate-500">
                {lang === 'hi'
                  ? 'उदाहरण: "101 6.85 4.5 8.5" (किसान कोड, लीटर, FAT, SNF) — एक या अधिक लाइनें'
                  : 'Example: "101 6.85 4.5 8.5" (Farmer Code, Liters, FAT, SNF)'}
              </p>
              <textarea
                id="camera-slip-text-input"
                data-testid="camera-slip-text-input"
                rows={2}
                placeholder="101 6.955 4.5 8.5"
                value={slipManualText}
                onChange={(e) => setSlipManualText(e.target.value)}
                className="w-full p-2.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <button
                type="button"
                data-testid="camera-slip-text-save-btn"
                onClick={() => {
                  setCameraError(null);
                  const rows = parseMilkSlipTextToRows(slipManualText);
                  processAndAutoSaveScannedRows(rows, farmerId || state.farmers[0]?.id);
                }}
                className="w-full min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {lang === 'hi'
                  ? 'पर्ची से दूध एंट्री अपने-आप सेव करें'
                  : 'Auto-Save Milk Entry from Slip'}
              </button>
            </div>

            {cameraError && (
              <div
                data-testid="camera-slip-error"
                className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Duplicate Entry Modal */}
      <ConfirmDialog
        open={Boolean(pendingDuplicateEntry)}
        title={lang === 'hi' ? 'डुप्लिकेट दूध एंट्री चेतावनी' : 'Duplicate Milk Entry Warning'}
        message={
          lang === 'hi'
            ? 'इसी किसान, तारीख, शिफ्ट, मात्रा और FAT/SNF की एक समान एंट्री पहले से मौजूद है। क्या आप वाकई इसे दोबारा सेव करना चाहते हैं?'
            : 'An identical entry for this farmer, date, shift, quantity, and FAT/SNF already exists. Do you still want to save another entry?'
        }
        confirmLabel={lang === 'hi' ? 'हाँ, फिर भी सेव करें' : 'Yes, Save Anyway'}
        cancelLabel={lang === 'hi' ? 'रद्द करें' : 'Cancel'}
        danger={false}
        onCancel={() => setPendingDuplicateEntry(null)}
        onConfirm={() => {
          if (pendingDuplicateEntry) {
            commitSaveEntry(pendingDuplicateEntry, false);
          }
        }}
      />

      {/* Confirm Delete Modal */}
      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        title={lang === 'hi' ? 'दूध एंट्री डिलीट करें?' : 'Delete Milk Entry?'}
        message={
          lang === 'hi'
            ? 'क्या आप वाकई इस दूध एंट्री को हटाना चाहते हैं? इसे हटाने पर शिफ्ट का कुल योग, औसत और किसान की उपस्थिति अपने-आप अपडेट हो जाएगी।'
            : 'Are you sure you want to delete this milk collection entry? All totals and attendance counts will recalculate automatically.'
        }
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) {
            onDeleteEntry(deleteTargetId);
            if (editingId === deleteTargetId) resetForm();
          }
          setDeleteTargetId(null);
        }}
      />

      {/* WhatsApp Preview Modal */}
      <WhatsAppPreviewModal
        open={waModalData.open}
        title={lang === 'hi' ? 'दूध रसीद WhatsApp पर शेयर करें' : 'Share Milk Receipt on WhatsApp'}
        phone={waModalData.phone}
        message={waModalData.message}
        lang={lang}
        onClose={() => setWaModalData((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
};
