import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Camera,
  CheckCircle2,
  Edit2,
  Image as ImageIcon,
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
  canSaveFarmerShiftMilkEntry,
  classifyMilkType,
  formatAutoDecimalFatSnf,
  formatCurrency,
  formatDateDMY,
  formatNumber,
  formatSmartMilkQuantity,
  formatWholeCurrency,
  isFarmerScheduledForShift,
  lookupRateFromChart,
  normalizeFarmerShiftSchedule,
  parseMilkSlipTextToRows,
  round2,
  round3,
  ScannedSlipPreviewItem,
  ScannedSlipRawRow,
  truncatePurchaseAmount,
} from '../utils/dairyCalculations';
import { ConfirmDialog, WhatsAppPreviewModal } from './Modals';

interface CollectionViewProps {
  state: DairyAppState;
  onChangeDate: (date: string) => void;
  onChangeShift: (shift: ShiftType) => void;
  onSaveEntry: (entry: MilkCollectionEntry, isEdit: boolean) => void;
  onSaveBatchEntries?: (entries: MilkCollectionEntry[], newFarmers?: Farmer[]) => void;
  onDeleteEntry: (id: string) => void;
  onToggleFarmerLeave: (date: string, shift: ShiftType, farmerId: string, reason?: string) => void;
  onSaveFarmer?: (farmer: Farmer, isEdit: boolean) => void;
  onNavigate: (tab: string) => void;
}

const OCR_SPACE_API_URL = 'https://api.ocr.space/parse/image';

async function compressImageFileToDataUrl(
  file: File,
  maxDimension = 1280,
  quality = 0.84
): Promise<{ dataUrl: string; mimeType: string }> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (err) => reject(err);
      image.src = rawDataUrl;
    });

    const width = img.naturalWidth || img.width || 800;
    const height = img.naturalHeight || img.height || 600;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { dataUrl: rawDataUrl, mimeType: file.type || 'image/jpeg' };
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);
    const compressed = canvas.toDataURL('image/jpeg', quality);
    if (compressed && compressed.startsWith('data:image/')) {
      return { dataUrl: compressed, mimeType: 'image/jpeg' };
    }
  } catch {
    // Fallback to rawDataUrl if canvas fails (e.g. non-standard image in test)
  }

  return { dataUrl: rawDataUrl, mimeType: file.type || 'image/jpeg' };
}

export const CollectionView: React.FC<CollectionViewProps> = ({
  state,
  onChangeDate,
  onChangeShift,
  onSaveEntry,
  onSaveBatchEntries,
  onDeleteEntry,
  onToggleFarmerLeave,
  onSaveFarmer,
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

  // Camera / Gallery Photo Upload & Preview state
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  const [isScanningSlip, setIsScanningSlip] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraPreviewUrl, setCameraPreviewUrl] = useState<string | null>(null);
  const [slipManualText, setSlipManualText] = useState<string>('');
  const [isLiveCameraActive, setIsLiveCameraActive] = useState<boolean>(false);
  // Quick 1-tap / multi-row photo assist fields when a photo is loaded
  const [photoQuickFarmerId, setPhotoQuickFarmerId] = useState<string>('');
  const [photoQuickDate, setPhotoQuickDate] = useState<string>(date);
  const [photoQuickShift, setPhotoQuickShift] = useState<ShiftType>(shift);
  const [photoQuickLiters, setPhotoQuickLiters] = useState<string>('');
  const [photoQuickFat, setPhotoQuickFat] = useState<string>('');
  const [photoQuickSnf, setPhotoQuickSnf] = useState<string>('8.5');
  const [photoStagedRows, setPhotoStagedRows] = useState<ScannedSlipRawRow[]>([]);
  // Photo Entry Preview Items (shown BEFORE saving so user can inspect Date, Code, Name, FAT, SNF, Liters, Rate, Amount & Duplicates)
  const [photoPreviewItems, setPhotoPreviewItems] = useState<ScannedSlipPreviewItem[]>([]);
  const [photoPendingAutoFarmers, setPhotoPendingAutoFarmers] = useState<Farmer[]>([]);
  // Single Farmer 21-31 Date (10-11 Entries) Passbook Grid inside Photo Modal
  const [showPassbook21To31Grid, setShowPassbook21To31Grid] = useState<boolean>(false);
  const [passbookYearMonth, setPassbookYearMonth] = useState<string>(date.slice(0, 7));
  const [passbookCycle, setPassbookCycle] = useState<1 | 2 | 3>(3);
  const [passbookShift, setPassbookShift] = useState<ShiftType>(shift);
  const [passbookDayInputs, setPassbookDayInputs] = useState<
    Record<number, { liters: string; fat: string; snf: string }>
  >(() => {
    const init: Record<number, { liters: string; fat: string; snf: string }> = {};
    for (let d = 1; d <= 31; d++) {
      init[d] = { liters: '', fat: '', snf: '8.5' };
    }
    return init;
  });

  React.useEffect(() => {
    setPhotoQuickDate(date);
    setPassbookYearMonth(date.slice(0, 7));
  }, [date]);

  React.useEffect(() => {
    setPhotoQuickShift(shift);
    setPassbookShift(shift);
  }, [shift]);

  const fatInputRef = useRef<HTMLInputElement | null>(null);
  const snfInputRef = useRef<HTMLInputElement | null>(null);
  const litersInputRef = useRef<HTMLInputElement | null>(null);
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);
  const formCardRef = useRef<HTMLDivElement | null>(null);
  // Separate refs for Camera Capture (with capture="environment") and Gallery Picker (without capture)
  const cameraFileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Shift attendance calculation (normalizes 'both' / 'सुबह और शाम' so both-shift farmers are always in pendingFarmers)
  const attendance = calculateShiftAttendance(
    state.farmers,
    state.collections,
    state.leaves,
    date,
    shift
  );

  // Active farmers eligible for this shift shown first in dropdown (both-shift farmers included in BOTH shifts)
  const activeFarmers = state.farmers.filter((f) => f.active !== false);
  const scheduledForShiftFarmers = activeFarmers.filter((f) =>
    isFarmerScheduledForShift(f, shift)
  );
  const otherShiftFarmers = activeFarmers.filter((f) => !isFarmerScheduledForShift(f, shift));

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
            ? 'इस ब्राउज़र में लाइव कैमरा उपलब्ध नहीं है। कृपया "कैमरा से फोटो खींचें" या "गैलरी से फोटो चुनें" बटन दबाएँ।'
            : 'Live camera is not supported here. Please use Camera or Gallery button.'
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
          ? 'कैमरा अनुमति नहीं मिली। कृपया "कैमरा से फोटो खींचें" या "गैलरी से फोटो चुनें" बटन का उपयोग करें।'
          : 'Camera permission denied. Please use the Take Photo or Gallery button.'
      );
    }
  };

  // Stage extracted rows into Photo Preview Table BEFORE saving (shows Date, Farmer Code, Name, FAT, SNF, Liters, Rate, Amount, and Duplicate status)
  const stageScannedRowsForPreview = (
    rawRows: ScannedSlipRawRow[],
    fallbackFarmerId?: string
  ): boolean => {
    const effectiveFallbackFarmerId =
      fallbackFarmerId || photoQuickFarmerId || farmerId || undefined;
    const built = buildCollectionEntriesFromScannedSlip(
      rawRows,
      state.farmers,
      state.rateCharts,
      date,
      shift,
      effectiveFallbackFarmerId,
      state.collections
    );
    if (built.previewItems.length === 0) {
      setCameraError(
        built.warningsHi[0] ||
          (lang === 'hi'
            ? 'फोटो लोड हो गया है! फोटो में हस्तलिखित नंबर अस्पष्ट होने के कारण नीचे फोटो देखकर मात्रा (लीटर) और FAT भरकर प्रिव्यू देखें या "21 से 31 तारीख (10-11 एंट्री) तालिका" का उपयोग करें।'
            : 'Photo loaded! Please confirm Liters and FAT below or use the 21-31 Passbook Table to preview and save.')
      );
      return false;
    }

    setPhotoStagedRows(rawRows);
    setPhotoPreviewItems(built.previewItems);
    setPhotoPendingAutoFarmers(built.autoCreatedFarmers || []);
    if (built.skippedDuplicates.length > 0 && built.entries.length === 0) {
      setCameraError(
        lang === 'hi'
          ? 'प्रिव्यू तैयार है: फोटो की सभी एंट्रियाँ (उसी तारीख, शिफ्ट और पशु प्रकार — गाय/भैंस) पहले से मौजूद हैं, इसलिए दोबारा सेव नहीं होंगी। यदि यह 21 से 31 तारीख की एंट्रियाँ हैं, तो ऊपर "21 से 31 तारीख लगाएँ" बटन दबाएँ।'
          : 'Preview ready: All entries in the photo already exist for the same farmer, date, shift & animal type.'
      );
    } else if (built.skippedDuplicates.length > 0) {
      setCameraError(
        lang === 'hi'
          ? `नोट: ${built.skippedDuplicates.length} एंट्री पहले से उसी तारीख/शिफ्ट/पशु (गाय/भैंस) में मौजूद होने के कारण सेव नहीं होगी। बाकी ${built.entries.length} एंट्री नीचे सेव बटन दबाकर सेव करें।`
          : `Note: ${built.skippedDuplicates.length} duplicate entry will be skipped. Click Save below to save the remaining ${built.entries.length} entries.`
      );
    } else {
      setCameraError(null);
    }
    return true;
  };

  // Apply a single farmer to all current photo preview rows & re-stage
  const handleApplyFarmerToPreview = (targetFarmerId: string) => {
    setPhotoQuickFarmerId(targetFarmerId);
    const chosenFarmer = state.farmers.find((f) => f.id === targetFarmerId);
    if (!chosenFarmer || photoPreviewItems.length === 0) return;

    const updatedRows: ScannedSlipRawRow[] = photoPreviewItems.map((item) => ({
      farmerCode: chosenFarmer.code,
      farmerName: chosenFarmer.name,
      date: item.entry.date,
      shift: item.entry.shift,
      liters: item.entry.liters,
      fat: item.entry.fat,
      snf: item.entry.snf,
      rate: item.entry.rate,
    }));
    stageScannedRowsForPreview(updatedRows, chosenFarmer.id);
  };

  // Apply sequential dates for a 10-11 day billing cycle (1-10, 11-20, or 21-31) to all current photo preview rows
  const handleApplyCycleDatesToPreview = (cycleNum: 1 | 2 | 3) => {
    if (photoPreviewItems.length === 0) return;
    const ym = (passbookYearMonth || date.slice(0, 7)).slice(0, 7);
    const [yStr, mStr] = ym.split('-');
    const y = Number(yStr) || 2026;
    const m = Number(mStr) || 10;
    const maxDay = new Date(y, m, 0).getDate() || 31;
    const startDay = cycleNum === 1 ? 1 : cycleNum === 2 ? 11 : 21;

    const chosenFarmer =
      state.farmers.find((f) => f.id === photoQuickFarmerId) ||
      selectedFarmerObj ||
      state.farmers.find((f) => f.id === photoPreviewItems[0]?.entry.farmerId);

    const updatedRows: ScannedSlipRawRow[] = photoPreviewItems.map((item, idx) => {
      const dayVal = Math.min(maxDay, startDay + idx);
      const nextDate = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(
        dayVal
      ).padStart(2, '0')}`;
      return {
        farmerCode: chosenFarmer?.code || item.entry.farmerCode,
        farmerName: chosenFarmer?.name || item.entry.farmerName,
        date: nextDate,
        shift: item.entry.shift,
        liters: item.entry.liters,
        fat: item.entry.fat,
        snf: item.entry.snf,
        rate: item.entry.rate,
      };
    });
    stageScannedRowsForPreview(updatedRows, chosenFarmer?.id);
  };

  // Confirm and save non-duplicate entries from Photo Preview Table (Atomically saves all 10-11 entries in APK & Web)
  const handleConfirmSavePhotoPreview = () => {
    const savableEntries = photoPreviewItems
      .filter((item) => !item.isDuplicate)
      .map((item) => ({
        ...item.entry,
        totalAmount: truncatePurchaseAmount(item.entry.totalAmount),
        deduction: truncatePurchaseAmount(item.entry.deduction),
        netPayable: truncatePurchaseAmount(
          truncatePurchaseAmount(item.entry.totalAmount) -
            truncatePurchaseAmount(item.entry.deduction)
        ),
      }));

    if (savableEntries.length === 0) {
      setCameraError(
        lang === 'hi'
          ? 'सेव करने के लिए कोई नई एंट्री नहीं है (सभी एंट्रियाँ पहले से उसी शिफ्ट और पशु प्रकार में मौजूद हैं)।'
          : 'No new entries to save (all entries already exist for the same shift and animal type).'
      );
      return;
    }

    const usedFarmerIds = new Set(savableEntries.map((e) => e.farmerId));
    const usedAutoFarmers = photoPendingAutoFarmers.filter((nf) => usedFarmerIds.has(nf.id));

    if (onSaveBatchEntries) {
      onSaveBatchEntries(savableEntries, usedAutoFarmers);
    } else {
      if (usedAutoFarmers.length > 0 && onSaveFarmer) {
        usedAutoFarmers.forEach((nf) => {
          onSaveFarmer(nf, false);
        });
      }
      savableEntries.forEach((entry) => {
        onSaveEntry(entry, false);
      });
    }

    // Automatically adjust Saved Entries table filters if entries span multiple dates or shifts
    const uniqueDates = Array.from(new Set(savableEntries.map((e) => e.date)));
    const uniqueShifts = Array.from(new Set(savableEntries.map((e) => e.shift)));
    if (uniqueDates.length > 1) {
      setListDateFilter('');
    } else if (uniqueDates.length === 1 && uniqueDates[0] !== date) {
      setListDateFilter(uniqueDates[0]);
    }
    if (uniqueShifts.length > 1 || (uniqueShifts.length === 1 && uniqueShifts[0] !== shift)) {
      setListShiftFilter('all');
    }

    setLastSavedNotice({
      entries: savableEntries,
      source: 'camera',
    });
    stopLiveCamera();
    setShowCameraModal(false);
    setSlipManualText('');
    setPhotoQuickLiters('');
    setPhotoQuickFat('');
    setPhotoStagedRows([]);
    setPhotoPreviewItems([]);
    setPhotoPendingAutoFarmers([]);
  };

  // Handle photo file (from camera capture or gallery selection — works in both Web Preview & Installed Android APK)
  const handleSlipPhotoFile = async (file: File) => {
    setCameraError(null);
    setShowCameraModal(true);
    setIsScanningSlip(true);
    const defaultTargetFarmerId =
      photoQuickFarmerId || farmerId || scheduledForShiftFarmers[0]?.id || state.farmers[0]?.id || '';
    if (!photoQuickFarmerId && defaultTargetFarmerId) {
      setPhotoQuickFarmerId(defaultTargetFarmerId);
    }

    try {
      const { dataUrl, mimeType } = await compressImageFileToDataUrl(file, 1280, 0.84);
      setCameraPreviewUrl(dataUrl);

      let extractedRows: ScannedSlipRawRow[] = [];

      // Engine 1: Local/Preview Server Gemini Vision OCR endpoint (/api/scan-milk-slip) with 5s timeout
      const isCapacitorOrFileApk =
        typeof window !== 'undefined' &&
        (window.location.protocol === 'capacitor:' ||
          window.location.protocol === 'file:' ||
          Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()));

      if (!isCapacitorOrFileApk) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5500);
          const resp = await fetch('/api/scan-milk-slip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: dataUrl,
              mimeType,
              farmers: state.farmers.map((f) => ({ code: f.code, name: f.name })),
              defaultDate: date,
              defaultShift: shift,
            }),
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          if (resp.ok) {
            const json = await resp.json();
            if (Array.isArray(json?.entries) && json.entries.length > 0) {
              extractedRows = json.entries;
            } else if (typeof json?.rawTextSummary === 'string' && json.rawTextSummary.trim()) {
              extractedRows = parseMilkSlipTextToRows(json.rawTextSummary, date, shift);
            }
          }
        } catch {
          // Proceed to APK-compatible OCR engines below
        }
      }

      // Engine 2: Direct HTTPS Table OCR (ocr.space Engine 2) — works inside installed Android APK (CORS *)
      if (extractedRows.length === 0) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 7500);
          const formBody = new URLSearchParams();
          formBody.append('apikey', 'helloworld');
          formBody.append('base64Image', dataUrl);
          formBody.append('isTable', 'true');
          formBody.append('OCREngine', '2');
          formBody.append('scale', 'true');

          const ocrResp = await fetch(OCR_SPACE_API_URL, {
            method: 'POST',
            body: formBody,
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          if (ocrResp.ok) {
            const ocrJson = await ocrResp.json();
            const parsedText = ocrJson?.ParsedResults?.[0]?.ParsedText || '';
            if (typeof parsedText === 'string' && parsedText.trim()) {
              const rowsFromOcrSpace = parseMilkSlipTextToRows(parsedText, date, shift);
              if (rowsFromOcrSpace.length > 0) {
                extractedRows = rowsFromOcrSpace;
              }
            }
          }
        } catch {
          // Proceed to on-device Tesseract OCR fallback
        }
      }

      // Engine 3: Bundled On-Device Tesseract.js OCR (works 100% locally inside installed APK)
      if (extractedRows.length === 0) {
        try {
          const TesseractModule = await import('tesseract.js');
          const recognizeFn =
            TesseractModule.recognize ||
            (TesseractModule.default && TesseractModule.default.recognize);
          if (typeof recognizeFn === 'function') {
            const ocrResult = await Promise.race([
              recognizeFn(dataUrl, 'eng'),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
            ]);
            const rawText = ocrResult?.data?.text || '';
            if (rawText.trim()) {
              const rowsFromTesseract = parseMilkSlipTextToRows(rawText, date, shift);
              if (rowsFromTesseract.length > 0) {
                extractedRows = rowsFromTesseract;
              }
            }
          }
        } catch {
          // Ignore and try next fallback
        }
      }

      // Engine 4: Browser/Android WebView native TextDetector API if available
      if (extractedRows.length === 0 && typeof window !== 'undefined' && 'TextDetector' in window) {
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
            extractedRows = parseMilkSlipTextToRows(rawText, date, shift);
          }
        } catch {
          // ignore
        }
      }

      // Engine 5: If user typed slip text or if filename encodes slip values (e.g. "101_6.55_4.5_8.5.jpg")
      if (extractedRows.length === 0 && slipManualText.trim()) {
        extractedRows = parseMilkSlipTextToRows(slipManualText, date, shift);
      }
      if (extractedRows.length === 0 && file.name) {
        const nameClean = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        const fromName = parseMilkSlipTextToRows(nameClean, date, shift);
        if (fromName.length > 0) {
          extractedRows = fromName;
        }
      }

      // Engine 6: If current form or quick photo input has valid numbers entered before clicking photo, use them
      if (extractedRows.length === 0) {
        const qLit = Number(photoQuickLiters);
        const qFat = Number(photoQuickFat);
        const qSnf = Number(photoQuickSnf) > 0 ? Number(photoQuickSnf) : 8.5;
        if (Number.isFinite(qLit) && qLit > 0 && Number.isFinite(qFat) && qFat > 0) {
          const chosenFarmer =
            state.farmers.find((f) => f.id === defaultTargetFarmerId) ||
            selectedFarmerObj ||
            state.farmers[0];
          extractedRows = [
            {
              farmerCode: chosenFarmer?.code,
              farmerName: chosenFarmer?.name,
              date: photoQuickDate || date,
              shift: photoQuickShift || shift,
              liters: qLit,
              fat: qFat,
              snf: qSnf,
            },
          ];
        } else if (hasValidLiters && hasValidFat) {
          extractedRows = [
            {
              farmerCode: selectedFarmerObj?.code || state.farmers[0]?.code,
              farmerName: selectedFarmerObj?.name || state.farmers[0]?.name,
              date,
              shift,
              liters: litersNum,
              fat: fatNum,
              snf: hasValidSnf ? snfNum : 8.5,
              rate: liveRate ?? undefined,
            },
          ];
        }
      }

      stageScannedRowsForPreview(extractedRows, defaultTargetFarmerId);
    } catch {
      setCameraError(
        lang === 'hi'
          ? 'फोटो स्कैन करने में समस्या आई। कृपया नीचे फोटो देखकर मात्रा व FAT भरें।'
          : 'Error scanning photo. Please enter Liters and FAT below.'
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

    // Enforce max 2 milk entries per farmer per shift: 1 Cow ('cow') and 1 Buffalo ('buffalo').
    // Strictly block if the same animal type already exists in this date + shift.
    const shiftValidation = canSaveFarmerShiftMilkEntry(
      state.collections,
      entry,
      editingId || undefined
    );
    if (!shiftValidation.allowed) {
      setFormError(
        (lang === 'hi' ? shiftValidation.reasonHi : shiftValidation.reasonEn) ||
          'किसी भी किसान की एक शिफ्ट में केवल दो दूध एंट्री ही हो सकती हैं (एक भैंस की और एक गाय की)।'
      );
      return;
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
      `तारीख: ${formatDateDMY(entry.date)} | शिफ्ट: ${shiftHi}`,
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
    const norm = normalizeFarmerShiftSchedule(sched);
    if (norm === 'morning') return lang === 'hi' ? 'केवल सुबह' : 'Morning Only';
    if (norm === 'evening') return lang === 'hi' ? 'केवल शाम' : 'Evening Only';
    return lang === 'hi' ? 'सुबह और शाम दोनों समय' : 'Morning & Evening';
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
              <div className="flex items-center gap-1.5 flex-wrap">
                <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <input
                  id="collection-date"
                  type="date"
                  aria-label="Collection Date"
                  value={date}
                  onChange={(e) => onChangeDate(e.target.value)}
                  className="text-xs font-bold bg-slate-800 text-white px-1.5 py-0.5 rounded border border-slate-700 focus:outline-none tabular-nums"
                />
                <span
                  data-testid="collection-date-dmy-badge"
                  className="text-[11px] font-extrabold text-amber-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 tabular-nums"
                >
                  {formatDateDMY(date)}
                </span>
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

              {/* Camera / Photo Auto-Entry Modal Button */}
              <button
                type="button"
                data-testid="camera-slip-btn"
                onClick={() => {
                  setCameraError(null);
                  if (!photoQuickFarmerId) {
                    setPhotoQuickFarmerId(
                      farmerId || scheduledForShiftFarmers[0]?.id || state.farmers[0]?.id || ''
                    );
                  }
                  setShowCameraModal(true);
                }}
                title={
                  lang === 'hi'
                    ? 'लिखी हुई दूध पर्ची का कैमरा से फोटो खींचकर या गैलरी से अपलोड करके ऑटोमैटिक सेव करें'
                    : 'Take a camera photo or pick from gallery to auto-save milk entry'
                }
                className="h-10 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1 shrink-0"
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span>{lang === 'hi' ? 'कैमरा / फोटो' : 'Camera'}</span>
              </button>

              {/* Direct Gallery Photo Picker Button (Opens Phone Gallery without Camera forced) */}
              <button
                type="button"
                data-testid="direct-gallery-slip-btn"
                onClick={() => {
                  setCameraError(null);
                  galleryFileInputRef.current?.click();
                }}
                title={
                  lang === 'hi'
                    ? 'गैलरी से लिखी हुई दूध पर्ची का फोटो चुनें'
                    : 'Choose milk slip photo from Gallery'
                }
                className="h-10 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1 shrink-0"
              >
                <ImageIcon className="w-4 h-4 shrink-0" />
                <span>{lang === 'hi' ? 'गैलरी से फोटो' : 'Gallery'}</span>
              </button>

              {/* File input 1: Direct Camera Capture (capture="environment", sr-only for Android WebView APK compatibility) */}
              <input
                ref={cameraFileInputRef}
                id="camera-file-input"
                data-testid="camera-file-input"
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleSlipPhotoFile(file);
                  }
                  e.target.value = '';
                }}
              />

              {/* File input 2: Phone Gallery / File Picker (NO capture attribute, sr-only for Android WebView APK compatibility) */}
              <input
                ref={galleryFileInputRef}
                id="gallery-file-input"
                data-testid="gallery-file-input"
                type="file"
                accept="image/*"
                className="sr-only"
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
                  <span className="font-bold">
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
                          `${en.farmerCode}-${en.farmerName} [${formatDateDMY(en.date)} ${
                            en.shift === 'morning' ? 'सुबह' : 'शाम'
                          }: ${formatNumber(en.liters, 3)}L · कुल ${formatWholeCurrency(
                            en.totalAmount
                          )}]`
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
              data-testid="attendance-tab-pending"
              onClick={() => setAttendanceTab('pending')}
              className={`min-h-[34px] px-1.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition-colors ${
                attendanceTab === 'pending'
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lang === 'hi'
                ? `अभी दूध आना बाकी है (${attendance.pendingCount})`
                : `Pending (${attendance.pendingCount})`}
            </button>
            <button
              type="button"
              data-testid="attendance-tab-present"
              onClick={() => setAttendanceTab('present')}
              className={`min-h-[34px] px-1.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition-colors ${
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
              data-testid="attendance-tab-other"
              onClick={() => setAttendanceTab('other')}
              className={`min-h-[34px] px-1.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition-colors ${
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
                  const hasCow = pf.entries.some((e) => e.milkType === 'cow');
                  const hasBuffalo = pf.entries.some((e) => e.milkType === 'buffalo');
                  return (
                    <div
                      key={pf.farmer.id}
                      className="p-2 rounded-xl border border-emerald-200 bg-emerald-50/40 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {pf.farmer.code} — {pf.farmer.name}
                          <span className="ml-1.5 text-[10px] font-semibold text-emerald-800">
                            ({hasCow && hasBuffalo ? 'गाय + भैंस (2/2)' : hasCow ? 'गाय (1/2)' : 'भैंस (1/2)'})
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-600 tabular-nums">
                          {formatNumber(pf.totalLiters, 3)} L · F:{lastEntry.fat} · S:{lastEntry.snf} ·{' '}
                          <strong>{formatWholeCurrency(pf.totalAmount)}</strong>
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {(!hasCow || !hasBuffalo) && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setFarmerId(pf.farmer.id);
                              setMilkTypeOverride(hasCow ? 'buffalo' : 'cow');
                              setFormError(null);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                              setTimeout(() => fatInputRef.current?.focus(), 80);
                            }}
                            className="h-7 px-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg shrink-0"
                          >
                            {hasCow
                              ? lang === 'hi'
                                ? '+ भैंस एंट्री'
                                : '+ Buffalo'
                              : lang === 'hi'
                              ? '+ गाय एंट्री'
                              : '+ Cow'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEditEntry(lastEntry)}
                          className="h-7 px-2 bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg shrink-0 flex items-center gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          {lang === 'hi' ? 'एडिट' : 'Edit'}
                        </button>
                      </div>
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
                <span className="text-[11px] font-extrabold text-blue-900 bg-white px-1.5 py-0.5 rounded border border-slate-200 tabular-nums">
                  {formatDateDMY(listDateFilter)}
                </span>
              )}
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

        <div>
          <table
            data-testid="saved-collection-entries-table"
            className="w-full text-xs sm:text-sm border border-slate-300 border-collapse tabular-nums"
          >
            <thead>
              <tr className="bg-blue-50 text-blue-950 border-b border-slate-300">
                <th className="py-2 px-1.5 sm:px-2.5 text-left font-extrabold border border-slate-300">
                  {lang === 'hi' ? 'किसान / तारीख' : 'Farmer / Date'}
                </th>
                <th className="py-2 px-1 sm:px-2 text-right font-extrabold border border-slate-300">
                  {lang === 'hi' ? 'लीटर' : 'Liters'}
                </th>
                <th className="py-2 px-1 sm:px-2 text-center font-extrabold border border-slate-300">
                  FAT
                </th>
                <th className="py-2 px-1 sm:px-2 text-center font-extrabold border border-slate-300">
                  SNF
                </th>
                <th className="py-2 px-1 sm:px-2 text-right font-extrabold border border-slate-300">
                  {lang === 'hi' ? 'रेट' : 'Rate'}
                </th>
                <th className="py-2 px-1.5 sm:px-2 text-right font-extrabold border border-slate-300">
                  {lang === 'hi' ? 'रकम / कार्य' : 'Amt / Act'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 tabular-nums">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500 border border-slate-300">
                    {lang === 'hi'
                      ? 'अभी कोई दूध कलेक्शन रिकॉर्ड नहीं है।'
                      : 'No milk collection entries found for this filter.'}
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry, idx) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                      <span className="font-extrabold text-slate-900 block leading-tight text-xs sm:text-sm">
                        <span className="text-slate-400 font-normal mr-0.5">{idx + 1}.</span>
                        {entry.farmerCode} — {entry.farmerName}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600 block leading-tight mt-0.5">
                        {formatDateDMY(entry.date)} ·{' '}
                        {entry.shift === 'morning'
                          ? lang === 'hi'
                            ? 'सुबह'
                            : 'AM'
                          : lang === 'hi'
                          ? 'शाम'
                          : 'PM'}{' '}
                        ·{' '}
                        <span
                          className={`px-1 py-0.2 rounded font-bold ${
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
                      </span>
                    </td>
                    <td className="py-2 px-1 sm:px-2 text-right font-extrabold text-slate-900 whitespace-nowrap border border-slate-300 text-xs sm:text-sm">
                      {formatNumber(entry.liters, 2)} L
                    </td>
                    <td className="py-2 px-1 sm:px-2 text-center font-extrabold text-amber-900 whitespace-nowrap border border-slate-300 bg-amber-50/40 text-xs sm:text-sm">
                      {formatNumber(entry.fat, 1)}
                    </td>
                    <td className="py-2 px-1 sm:px-2 text-center font-extrabold text-indigo-900 whitespace-nowrap border border-slate-300 bg-indigo-50/40 text-xs sm:text-sm">
                      {formatNumber(entry.snf, 1)}
                    </td>
                    <td className="py-2 px-1 sm:px-2 text-right font-extrabold text-blue-900 whitespace-nowrap border border-slate-300 bg-blue-50/30 text-xs sm:text-sm">
                      ₹{formatNumber(entry.rate, 2)}
                    </td>
                    <td className="py-2 px-1.5 sm:px-2 text-right whitespace-nowrap border border-slate-300">
                      <span
                        data-testid={`saved-entry-amount-${entry.farmerCode}`}
                        className="font-extrabold text-emerald-800 block leading-tight text-xs sm:text-sm"
                      >
                        {formatWholeCurrency(entry.totalAmount)}
                      </span>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <button
                          type="button"
                          onClick={() => handleEditEntry(entry)}
                          aria-label={`Edit ${entry.farmerName} entry`}
                          className="min-h-[24px] px-1.5 py-0.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded font-semibold flex items-center gap-0.5 text-[10px]"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span className="hidden sm:inline">{lang === 'hi' ? 'एडिट' : 'Edit'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openWhatsAppForEntry(entry)}
                          aria-label={`Share ${entry.farmerName} entry on WhatsApp`}
                          className="min-h-[24px] px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded font-semibold flex items-center text-[10px]"
                        >
                          <MessageSquare className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTargetId(entry.id)}
                          aria-label={`Delete ${entry.farmerName} entry`}
                          className="min-h-[24px] px-1.5 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 rounded font-semibold flex items-center gap-0.5 text-[10px]"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span className="hidden sm:inline">{lang === 'hi' ? 'डिलीट' : 'Delete'}</span>
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
                className="bg-slate-100 text-slate-900 border-t-2 border-slate-400 font-extrabold tabular-nums text-xs sm:text-sm"
              >
                <td className="py-2 px-1.5 sm:px-2.5 border border-slate-300">
                  {lang === 'hi'
                    ? `कुल (${filteredSummary.distinctFarmerCount} किसान · ${filteredSummary.entryCount} एंट्री)`
                    : `Total (${filteredSummary.distinctFarmerCount} Farmers · ${filteredSummary.entryCount})`}
                </td>
                <td className="py-2 px-1 sm:px-2 text-right whitespace-nowrap text-blue-900 border border-slate-300">
                  {formatNumber(filteredSummary.totalLiters, 2)} L
                </td>
                <td className="py-2 px-1 sm:px-2 text-center whitespace-nowrap text-amber-900 border border-slate-300">
                  {formatNumber(filteredSummary.avgFat, 1)}
                </td>
                <td className="py-2 px-1 sm:px-2 text-center whitespace-nowrap text-indigo-900 border border-slate-300">
                  {formatNumber(filteredSummary.avgSnf, 1)}
                </td>
                <td className="py-2 px-1 sm:px-2 text-right whitespace-nowrap text-blue-900 border border-slate-300">
                  {filteredSummary.avgRate !== null
                    ? `₹${formatNumber(filteredSummary.avgRate, 2)}`
                    : '—'}
                </td>
                <td className="py-2 px-1.5 sm:px-2 text-right whitespace-nowrap text-emerald-800 border border-slate-300">
                  {formatWholeCurrency(filteredSummary.totalAmount)}
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
            ? `शिफ्ट उपस्थिति एवं सारांश (${formatDateDMY(date)} · ${shift === 'morning' ? 'सुबह' : 'शाम'})`
            : `Shift Summary (${formatDateDMY(date)} · ${shift})`}
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

      {/* Camera / Gallery Photo Upload & Preview Modal */}
      {showCameraModal && (
        <div
          data-testid="camera-slip-modal"
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white rounded-2xl max-w-3xl w-full p-4 sm:p-5 space-y-4 shadow-xl border border-slate-200 max-h-[94vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    {lang === 'hi'
                      ? 'कैमरा / गैलरी फोटो से दूध खरीद प्रिव्यू एवं सेव'
                      : 'Camera or Gallery Photo Milk Entry Preview & Save'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {lang === 'hi'
                      ? 'सेव करने से पहले तारीख, किसान कोड, नाम, फैट, SNF, लीटर, रेट और अमाउंट का प्रिव्यू देखें — फिर सेव बटन दबाकर सेव करें'
                      : 'Preview Date, Farmer Code, Name, FAT, SNF, Liters, Rate & Amount before clicking Save'}
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

            {/* Option 1: Separate Camera Capture, Gallery Picker, and Live Camera Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                data-testid="upload-slip-photo-btn"
                disabled={isScanningSlip}
                onClick={() => cameraFileInputRef.current?.click()}
                className="min-h-[46px] px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isScanningSlip ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{lang === 'hi' ? 'स्कैन हो रहा...' : 'Scanning...'}</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 shrink-0" />
                    <span>{lang === 'hi' ? 'कैमरा से फोटो खींचें' : 'Take Camera Photo'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="gallery-slip-photo-btn"
                disabled={isScanningSlip}
                onClick={() => galleryFileInputRef.current?.click()}
                className="min-h-[46px] px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-xs"
              >
                {isScanningSlip ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{lang === 'hi' ? 'स्कैन हो रहा...' : 'Scanning...'}</span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4 shrink-0" />
                    <span>{lang === 'hi' ? 'गैलरी से फोटो चुनें' : 'Pick from Gallery'}</span>
                  </>
                )}
              </button>

              {!isLiveCameraActive ? (
                <button
                  type="button"
                  data-testid="start-live-camera-btn"
                  disabled={isScanningSlip}
                  onClick={startLiveCamera}
                  className="min-h-[46px] px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Upload className="w-4 h-4 shrink-0" />
                  <span>{lang === 'hi' ? 'लाइव कैमरा चालू करें' : 'Open Live Camera'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopLiveCamera}
                  className="min-h-[46px] px-3 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5"
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
                    ? 'फोटो क्लिक करें और प्रिव्यू देखें'
                    : 'Capture Photo & Show Preview'}
                </button>
              </div>
            )}

            {/* ========================================================================== */}
            {/* REQUIREMENT 1, 2 & 3: PHOTO MILK ENTRY PREVIEW TABLE BEFORE SAVING         */}
            {/* Shows: तारीख, किसान कोड, नाम, फैट, SNF, लीटर, रेट, अमाउंट (for 1 or N rows)  */}
            {/* Marks duplicates of same animal in same date+shift as NOT savable!         */}
            {/* ========================================================================== */}
            {photoPreviewItems.length > 0 && (
              <div
                data-testid="photo-preview-section"
                className="bg-blue-50/80 border-2 border-blue-600 rounded-2xl p-3.5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 pb-2">
                  <div>
                    <h4 className="text-xs sm:text-sm font-extrabold text-blue-950">
                      {lang === 'hi'
                        ? `दूध खरीद प्रिव्यू (सेव करने से पहले जाँचें — कुल ${photoPreviewItems.length} एंट्री)`
                        : `Milk Entry Preview Before Saving (${photoPreviewItems.length} entries)`}
                    </h4>
                    <p className="text-[11px] text-blue-800">
                      {lang === 'hi'
                        ? 'नियम: एक किसान की एक शिफ्ट में अधिकतम 2 एंट्री (1 गाय + 1 भैंस) हो सकती हैं। पहले से मौजूद पशु एंट्री सेव नहीं होगी।'
                        : 'Rule: Max 2 entries per farmer per shift (1 Cow + 1 Buffalo). Existing same-animal entries are skipped.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoPreviewItems([]);
                      setPhotoPendingAutoFarmers([]);
                    }}
                    className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-bold rounded-lg"
                  >
                    {lang === 'hi' ? 'प्रिव्यू साफ करें' : 'Clear Preview'}
                  </button>
                </div>

                {/* Quick Single-Farmer & 10-11 Day Cycle Date Applier Bar (1-10, 11-20, 21-31) */}
                <div className="bg-white border border-blue-200 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-700">
                      {lang === 'hi' ? 'एक किसान चुनें:' : 'Farmer:'}
                    </span>
                    <select
                      data-testid="preview-apply-farmer-select"
                      value={photoQuickFarmerId}
                      onChange={(e) => handleApplyFarmerToPreview(e.target.value)}
                      className="h-8 px-2 text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg"
                    >
                      <option value="">
                        {lang === 'hi' ? '-- पर्ची अनुसार / किसान बदलें --' : '-- As Scanned / Change --'}
                      </option>
                      {activeFarmers.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.code} — {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-700">
                      {lang === 'hi' ? 'तारीख क्रम सेट करें:' : 'Set Cycle Dates:'}
                    </span>
                    <button
                      type="button"
                      data-testid="apply-cycle-21-31-dates-btn"
                      onClick={() => handleApplyCycleDatesToPreview(3)}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-extrabold rounded-lg shadow-2xs"
                    >
                      {lang === 'hi' ? '21 से 31 तारीख (10-11 एंट्री)' : '21 to 31 Dates'}
                    </button>
                    <button
                      type="button"
                      data-testid="apply-cycle-1-10-dates-btn"
                      onClick={() => handleApplyCycleDatesToPreview(1)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-lg border border-slate-300"
                    >
                      {lang === 'hi' ? '1 से 10 तारीख' : '1 to 10'}
                    </button>
                    <button
                      type="button"
                      data-testid="apply-cycle-11-20-dates-btn"
                      onClick={() => handleApplyCycleDatesToPreview(2)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-lg border border-slate-300"
                    >
                      {lang === 'hi' ? '11 से 20 तारीख' : '11 to 20'}
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-blue-200">
                  <table
                    data-testid="photo-entry-preview-table"
                    className="w-full text-xs border border-slate-300 border-collapse tabular-nums"
                  >
                    <thead>
                      <tr className="bg-blue-900 text-white">
                        <th className="py-2 px-1.5 sm:px-2 text-left font-bold border border-blue-800">
                          {lang === 'hi' ? 'तारीख / किसान' : 'Date / Farmer'}
                        </th>
                        <th className="py-2 px-1 sm:px-2 text-right font-bold border border-blue-800">
                          {lang === 'hi' ? 'लीटर' : 'Liters'}
                        </th>
                        <th className="py-2 px-1 sm:px-2 text-center font-bold border border-blue-800">
                          FAT / SNF
                        </th>
                        <th className="py-2 px-1.5 sm:px-2 text-right font-bold border border-blue-800">
                          {lang === 'hi' ? 'अमाउंट / रेट' : 'Amount / Rate'}
                        </th>
                        <th className="py-2 px-1 sm:px-2 text-center font-bold border border-blue-800">
                          {lang === 'hi' ? 'स्थिति' : 'Status'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {photoPreviewItems.map((item, idx) => {
                        const en = item.entry;
                        const animalLabel =
                          en.milkType === 'cow'
                            ? lang === 'hi'
                              ? 'गाय'
                              : 'Cow'
                            : lang === 'hi'
                            ? 'भैंस'
                            : 'Buffalo';
                        return (
                          <tr
                            key={en.id || idx}
                            data-testid={`photo-preview-row-${idx}`}
                            className={
                              item.isDuplicate
                                ? 'bg-red-50/80 text-slate-500 line-through'
                                : 'hover:bg-blue-50/40 text-slate-900'
                            }
                          >
                            <td className="py-1.5 px-1.5 sm:px-2 border border-slate-300">
                              <span className="font-bold text-slate-900 block leading-tight">
                                <span className="text-blue-900">{en.farmerCode}</span> — {en.farmerName}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-600 block leading-tight mt-0.5">
                                {formatDateDMY(en.date)}{' '}
                                <span className="px-1 py-0.2 rounded bg-slate-100 text-slate-800 font-bold">
                                  {en.shift === 'morning'
                                    ? lang === 'hi'
                                      ? 'सुबह'
                                      : 'Morning'
                                    : lang === 'hi'
                                    ? 'शाम'
                                    : 'Evening'}
                                </span>{' '}
                                · {animalLabel}
                              </span>
                            </td>
                            <td className="py-1.5 px-1 sm:px-2 text-right whitespace-nowrap font-extrabold text-slate-900 border border-slate-300">
                              {formatNumber(en.liters, 2)} L
                            </td>
                            <td className="py-1.5 px-1 sm:px-2 text-center whitespace-nowrap font-extrabold text-amber-900 border border-slate-300">
                              {formatNumber(en.fat, 1)} / {formatNumber(en.snf, 1)}
                            </td>
                            <td className="py-1.5 px-1.5 sm:px-2 text-right whitespace-nowrap border border-slate-300">
                              <span className="font-extrabold text-emerald-700 block leading-tight">
                                {formatWholeCurrency(en.totalAmount)}
                              </span>
                              <span className="text-[11px] text-blue-800 font-bold block leading-tight mt-0.5">
                                {formatCurrency(en.rate)}
                              </span>
                            </td>
                            <td className="py-1.5 px-1 sm:px-2 text-center border border-slate-300">
                              {item.isDuplicate ? (
                                <span
                                  data-testid={`photo-preview-duplicate-badge-${idx}`}
                                  className="inline-block px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-extrabold no-underline"
                                >
                                  {lang === 'hi' ? item.statusHi : item.statusEn}
                                </span>
                              ) : (
                                <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                                  {lang === 'hi' ? item.statusHi : item.statusEn}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Preview Summary & Primary Confirm Save Button */}
                {(() => {
                  const savable = photoPreviewItems.filter((p) => !p.isDuplicate);
                  const duplicateCount = photoPreviewItems.length - savable.length;
                  const totalPreviewLiters = round3(
                    savable.reduce((s, p) => s + p.entry.liters, 0)
                  );
                  const totalPreviewAmount = truncatePurchaseAmount(
                    savable.reduce((s, p) => s + truncatePurchaseAmount(p.entry.totalAmount), 0)
                  );
                  return (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                      <div className="text-xs font-bold text-slate-800 tabular-nums">
                        {lang === 'hi' ? (
                          <>
                            सेव होने योग्य: <span className="text-emerald-700">{savable.length} एंट्री</span>
                            {duplicateCount > 0 && (
                              <span className="text-red-600 ml-2">
                                (पहले से मौजूद/रोकी गई: {duplicateCount})
                              </span>
                            )}{' '}
                            · कुल लीटर: <span className="text-blue-900">{formatNumber(totalPreviewLiters, 3)} L</span> · कुल अमाउंट:{' '}
                            <span className="text-emerald-800">{formatWholeCurrency(totalPreviewAmount)}</span>
                          </>
                        ) : (
                          <>
                            Ready to Save: {savable.length} · Skipped Duplicates: {duplicateCount} · Total:{' '}
                            {formatNumber(totalPreviewLiters, 3)} L ({formatWholeCurrency(totalPreviewAmount)})
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        data-testid="confirm-photo-preview-save-btn"
                        disabled={savable.length === 0}
                        onClick={handleConfirmSavePhotoPreview}
                        className="min-h-[44px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-600 text-white text-xs sm:text-sm font-extrabold rounded-xl shadow-sm flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          {lang === 'hi'
                            ? `प्रिव्यू कन्फर्म करें और सेव करें (${savable.length} एंट्री)`
                            : `Confirm Preview & Save (${savable.length})`}
                        </span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Preview of uploaded image + 1-Tap / Multi-Entry Quick Staging from Photo (when photo is loaded) */}
            {cameraPreviewUrl && !isLiveCameraActive && (
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 space-y-2.5">
                <div className="text-center bg-white border border-slate-200 rounded-lg p-2">
                  <img
                    src={cameraPreviewUrl}
                    alt="Milk slip preview"
                    className="max-h-44 mx-auto rounded-lg object-contain"
                  />
                </div>

                {/* Quick 1-Tap / Multi-Row Entry right below the photo */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-emerald-950">
                    {lang === 'hi'
                      ? 'फोटो से एक या अधिक एंट्री का प्रिव्यू बनाएँ (किसान नाम/कोड, तारीख, शिफ्ट, लीटर व FAT):'
                      : 'Stage 1 or Multiple Entries from Photo for Preview (Farmer, Date, Shift, Liters & FAT):'}
                  </p>

                  {/* Row A: Farmer + Date + Shift */}
                  <div className="grid grid-cols-12 gap-1.5">
                    <div className="col-span-5">
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        {lang === 'hi' ? 'किसान (नाम / कोड)' : 'Farmer'}
                      </label>
                      <select
                        data-testid="photo-quick-farmer-select"
                        value={photoQuickFarmerId}
                        onChange={(e) => setPhotoQuickFarmerId(e.target.value)}
                        className="w-full h-9 px-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="">{lang === 'hi' ? 'किसान चुनें / ऑटो' : 'Auto'}</option>
                        {activeFarmers.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name} ({f.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        {lang === 'hi' ? 'तारीख' : 'Date'}
                      </label>
                      <input
                        data-testid="photo-quick-date-input"
                        type="date"
                        value={photoQuickDate}
                        onChange={(e) => setPhotoQuickDate(e.target.value)}
                        className="w-full h-9 px-2 text-xs font-bold bg-white border border-slate-300 rounded-lg tabular-nums"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        {lang === 'hi' ? 'शिफ्ट' : 'Shift'}
                      </label>
                      <select
                        data-testid="photo-quick-shift-select"
                        value={photoQuickShift}
                        onChange={(e) => setPhotoQuickShift(e.target.value as ShiftType)}
                        className="w-full h-9 px-2 text-xs font-bold bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="morning">{lang === 'hi' ? 'सुबह' : 'Morning'}</option>
                        <option value="evening">{lang === 'hi' ? 'शाम' : 'Evening'}</option>
                      </select>
                    </div>
                  </div>

                  {/* Row B: Liters + FAT + SNF + Add Another Row button */}
                  <div className="grid grid-cols-12 gap-1.5 items-end">
                    <div className="col-span-3">
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        {lang === 'hi' ? 'मात्रा (L)*' : 'Liters*'}
                      </label>
                      <input
                        data-testid="photo-quick-liters-input"
                        type="text"
                        inputMode="decimal"
                        placeholder="6.5"
                        value={photoQuickLiters}
                        onChange={(e) => setPhotoQuickLiters(e.target.value)}
                        className="w-full h-9 px-2 text-xs font-bold font-mono bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        FAT*
                      </label>
                      <input
                        data-testid="photo-quick-fat-input"
                        type="text"
                        inputMode="decimal"
                        placeholder="4.5"
                        value={photoQuickFat}
                        onChange={(e) => setPhotoQuickFat(e.target.value)}
                        className="w-full h-9 px-2 text-xs font-bold font-mono bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        SNF
                      </label>
                      <input
                        data-testid="photo-quick-snf-input"
                        type="text"
                        inputMode="decimal"
                        placeholder="8.5"
                        value={photoQuickSnf}
                        onChange={(e) => setPhotoQuickSnf(e.target.value)}
                        className="w-full h-9 px-2 text-xs font-bold font-mono bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="col-span-4">
                      <button
                        type="button"
                        data-testid="photo-add-staged-row-btn"
                        onClick={() => {
                          const qLiters = Number(photoQuickLiters);
                          const qFat = Number(photoQuickFat);
                          const qSnf = Number(photoQuickSnf) > 0 ? Number(photoQuickSnf) : 8.5;
                          if (
                            !Number.isFinite(qLiters) ||
                            qLiters <= 0 ||
                            !Number.isFinite(qFat) ||
                            qFat <= 0
                          ) {
                            setCameraError(
                              lang === 'hi'
                                ? 'कृपया पहले मात्रा (लीटर) और FAT भरें।'
                                : 'Please enter valid Liters and FAT first.'
                            );
                            return;
                          }
                          setCameraError(null);
                          const chosenFarmer =
                            state.farmers.find((f) => f.id === photoQuickFarmerId) ||
                            selectedFarmerObj ||
                            scheduledForShiftFarmers[0] ||
                            state.farmers[0];
                          const nextRows = [
                            ...photoStagedRows,
                            {
                              farmerCode: chosenFarmer?.code,
                              farmerName: chosenFarmer?.name,
                              date: photoQuickDate || date,
                              shift: photoQuickShift || shift,
                              liters: qLiters,
                              fat: qFat,
                              snf: qSnf,
                            },
                          ];
                          setPhotoStagedRows(nextRows);
                          setPhotoQuickLiters('');
                          setPhotoQuickFat('');
                          stageScannedRowsForPreview(nextRows, chosenFarmer?.id);
                        }}
                        className="w-full h-9 px-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg"
                      >
                        {lang === 'hi' ? '+ प्रिव्यू में जोड़ें' : '+ Add to Preview'}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="photo-quick-save-btn"
                    onClick={() => {
                      const qLiters = Number(photoQuickLiters);
                      const qFat = Number(photoQuickFat);
                      const qSnf = Number(photoQuickSnf) > 0 ? Number(photoQuickSnf) : 8.5;
                      const hasCurrentInput =
                        Number.isFinite(qLiters) &&
                        qLiters > 0 &&
                        Number.isFinite(qFat) &&
                        qFat > 0;

                      if (!hasCurrentInput && photoStagedRows.length === 0) {
                        setCameraError(
                          lang === 'hi'
                            ? 'कृपया फोटो देखकर दूध की मात्रा (लीटर) और FAT दर्ज करें।'
                            : 'Please enter valid Liters and FAT from the photo.'
                        );
                        return;
                      }

                      const chosenFarmer =
                        state.farmers.find((f) => f.id === photoQuickFarmerId) ||
                        selectedFarmerObj ||
                        scheduledForShiftFarmers[0] ||
                        state.farmers[0];

                      const rowsToPreview: ScannedSlipRawRow[] = [...photoStagedRows];
                      if (hasCurrentInput) {
                        rowsToPreview.push({
                          farmerCode: chosenFarmer?.code,
                          farmerName: chosenFarmer?.name,
                          date: photoQuickDate || date,
                          shift: photoQuickShift || shift,
                          liters: qLiters,
                          fat: qFat,
                          snf: qSnf,
                        });
                      }

                      stageScannedRowsForPreview(rowsToPreview, chosenFarmer?.id);
                    }}
                    className="w-full min-h-[40px] px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {lang === 'hi'
                      ? 'फोटो से प्रिव्यू दिखाएँ (तारीख, कोड, नाम, फैट, SNF, लीटर, रेट, अमाउंट)'
                      : 'Show Preview from Photo'}
                  </button>
                </div>
              </div>
            )}

            {/* ========================================================================== */}
            {/* SINGLE FARMER 21 TO 31 DATE (10-11 ENTRIES) PASSBOOK TABLE IN PHOTO MODAL  */}
            {/* ========================================================================== */}
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-extrabold text-indigo-950">
                    {lang === 'hi'
                      ? 'एक ही किसान की 21 से 31 तारीख (10-11 एंट्री) एक साथ भरें / फोटो से मिलाएँ:'
                      : 'Single Farmer 21 to 31 Date (10-11 Entries) Passbook Table:'}
                  </h4>
                  <p className="text-[11px] text-indigo-800">
                    {lang === 'hi'
                      ? 'किसान चुनें और 21 से 31 तारीख (या 1-10, 11-20) की सभी 10-11 एंट्री एक साथ प्रिव्यू करके सेव करें'
                      : 'Select farmer and enter/preview all 10-11 entries from 21st to 31st at once'}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="toggle-passbook-21-31-grid-btn"
                  onClick={() => setShowPassbook21To31Grid((prev) => !prev)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-2xs"
                >
                  {showPassbook21To31Grid
                    ? lang === 'hi'
                      ? '21-31 तालिका छुपाएँ'
                      : 'Hide 21-31 Table'
                    : lang === 'hi'
                    ? '21 से 31 तारीख (10-11 एंट्री) तालिका खोलें'
                    : 'Open 21-31 Passbook Table'}
                </button>
              </div>

              {showPassbook21To31Grid && (
                <div
                  data-testid="passbook-21-31-grid-section"
                  className="space-y-2.5 pt-2 border-t border-indigo-200"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        {lang === 'hi' ? 'किसान चुनें *' : 'Farmer *'}
                      </label>
                      <select
                        data-testid="passbook-grid-farmer-select"
                        value={photoQuickFarmerId}
                        onChange={(e) => setPhotoQuickFarmerId(e.target.value)}
                        className="w-full h-8 px-2 text-xs font-bold bg-white border border-slate-300 rounded-lg"
                      >
                        {activeFarmers.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.code} — {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        {lang === 'hi' ? 'महीना (YYYY-MM)' : 'Month'}
                      </label>
                      <input
                        data-testid="passbook-grid-month-input"
                        type="month"
                        value={passbookYearMonth}
                        onChange={(e) => setPassbookYearMonth(e.target.value)}
                        className="w-full h-8 px-2 text-xs font-bold bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        {lang === 'hi' ? 'अवधि (10-11 दिन)' : 'Period'}
                      </label>
                      <select
                        data-testid="passbook-grid-cycle-select"
                        value={passbookCycle}
                        onChange={(e) => setPassbookCycle(Number(e.target.value) as 1 | 2 | 3)}
                        className="w-full h-8 px-2 text-xs font-bold bg-white border border-slate-300 rounded-lg"
                      >
                        <option value={3}>{lang === 'hi' ? '21 से 31 तारीख (11 दिन)' : '21 to 31'}</option>
                        <option value={2}>{lang === 'hi' ? '11 से 20 तारीख (10 दिन)' : '11 to 20'}</option>
                        <option value={1}>{lang === 'hi' ? '1 से 10 तारीख (10 दिन)' : '1 to 10'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                        {lang === 'hi' ? 'शिफ्ट' : 'Shift'}
                      </label>
                      <select
                        data-testid="passbook-grid-shift-select"
                        value={passbookShift}
                        onChange={(e) => setPassbookShift(e.target.value as ShiftType)}
                        className="w-full h-8 px-2 text-xs font-bold bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="morning">{lang === 'hi' ? 'सुबह (Morning)' : 'Morning'}</option>
                        <option value="evening">{lang === 'hi' ? 'शाम (Evening)' : 'Evening'}</option>
                      </select>
                    </div>
                  </div>

                  {(() => {
                    const [yStr, mStr] = (passbookYearMonth || date.slice(0, 7)).split('-');
                    const y = Number(yStr) || 2026;
                    const m = Number(mStr) || 10;
                    const maxDayInMonth = new Date(y, m, 0).getDate() || 31;
                    const startD = passbookCycle === 1 ? 1 : passbookCycle === 2 ? 11 : 21;
                    const endD =
                      passbookCycle === 1 ? 10 : passbookCycle === 2 ? 20 : maxDayInMonth;
                    const daysList: number[] = [];
                    for (let d = startD; d <= endD; d++) {
                      daysList.push(d);
                    }

                    return (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto bg-white p-2 rounded-xl border border-indigo-200">
                          {daysList.map((d) => {
                            const rowVal = passbookDayInputs[d] || {
                              liters: '',
                              fat: '',
                              snf: '8.5',
                            };
                            const fullDateStr = `${String(y).padStart(4, '0')}-${String(m).padStart(
                              2,
                              '0'
                            )}-${String(d).padStart(2, '0')}`;
                            return (
                              <div
                                key={d}
                                className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs tabular-nums"
                              >
                                <span className="font-extrabold text-indigo-950 w-18 shrink-0">
                                  {d} {lang === 'hi' ? 'तारीख' : 'Date'}
                                  <span className="block text-[9px] text-slate-500 font-semibold">
                                    {formatDateDMY(fullDateStr)}
                                  </span>
                                </span>
                                <input
                                  data-testid={`passbook-day-${d}-liters`}
                                  type="text"
                                  inputMode="decimal"
                                  placeholder={lang === 'hi' ? 'लीटर' : 'Liters'}
                                  value={rowVal.liters}
                                  onChange={(e) =>
                                    setPassbookDayInputs((prev) => ({
                                      ...prev,
                                      [d]: { ...rowVal, liters: e.target.value },
                                    }))
                                  }
                                  className="w-full h-7 px-1.5 text-xs font-bold font-mono bg-white border border-slate-300 rounded"
                                />
                                <input
                                  data-testid={`passbook-day-${d}-fat`}
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="FAT"
                                  value={rowVal.fat}
                                  onChange={(e) =>
                                    setPassbookDayInputs((prev) => ({
                                      ...prev,
                                      [d]: { ...rowVal, fat: e.target.value },
                                    }))
                                  }
                                  className="w-full h-7 px-1.5 text-xs font-bold font-mono bg-white border border-slate-300 rounded"
                                />
                                <input
                                  data-testid={`passbook-day-${d}-snf`}
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="SNF"
                                  value={rowVal.snf}
                                  onChange={(e) =>
                                    setPassbookDayInputs((prev) => ({
                                      ...prev,
                                      [d]: { ...rowVal, snf: e.target.value },
                                    }))
                                  }
                                  className="w-16 h-7 px-1.5 text-xs font-bold font-mono bg-white border border-slate-300 rounded shrink-0"
                                />
                              </div>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          data-testid="stage-passbook-21-31-btn"
                          onClick={() => {
                            const chosenFarmer =
                              state.farmers.find((f) => f.id === photoQuickFarmerId) ||
                              selectedFarmerObj ||
                              scheduledForShiftFarmers[0] ||
                              state.farmers[0];
                            const builtRows: ScannedSlipRawRow[] = [];
                            for (const d of daysList) {
                              const rv = passbookDayInputs[d];
                              if (!rv) continue;
                              const lit = Number(rv.liters);
                              const fat = Number(rv.fat);
                              const snf = Number(rv.snf) > 0 ? Number(rv.snf) : 8.5;
                              if (
                                Number.isFinite(lit) &&
                                lit > 0 &&
                                Number.isFinite(fat) &&
                                fat > 0
                              ) {
                                const dStr = `${String(y).padStart(4, '0')}-${String(m).padStart(
                                  2,
                                  '0'
                                )}-${String(d).padStart(2, '0')}`;
                                builtRows.push({
                                  farmerCode: chosenFarmer?.code,
                                  farmerName: chosenFarmer?.name,
                                  date: dStr,
                                  shift: passbookShift,
                                  liters: lit,
                                  fat,
                                  snf,
                                });
                              }
                            }
                            if (builtRows.length === 0) {
                              setCameraError(
                                lang === 'hi'
                                  ? 'कृपया कम से कम एक तारीख का लीटर और FAT भरें।'
                                  : 'Please enter Liters and FAT for at least one date.'
                              );
                              return;
                            }
                            setCameraError(null);
                            stageScannedRowsForPreview(builtRows, chosenFarmer?.id);
                          }}
                          className="w-full min-h-[40px] px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-extrabold rounded-lg flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {lang === 'hi'
                            ? `${startD} से ${endD} तारीख की सभी एंट्री का प्रिव्यू दिखाएँ`
                            : `Preview All Entries (${startD} to ${endD})`}
                        </button>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Quick Written Slip Text / OCR Fallback Box (Supports 1 or Many Farmers + Multi-Date Morning/Evening) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <label
                htmlFor="camera-slip-text-input"
                className="block text-xs font-bold text-slate-800"
              >
                {lang === 'hi'
                  ? 'या एक/अधिक किसानों व 21 से 31 तारीख (सुबह/शाम) की पर्ची लिखें/पेस्ट करके प्रिव्यू देखें:'
                  : 'Or paste/type 1 or multiple farmers & 21-31 date (Morning/Evening) slip text to preview:'}
              </label>
              <p className="text-[11px] text-slate-500">
                {lang === 'hi'
                  ? 'उदाहरण: "किसान: रामलाल गुर्जर (101)" फिर 21 से 31 तारीख की लाइनें जैसे "21 5.5 4.5 8.5", "22 6.0 4.6 8.5" ... "31 6.5 4.8 8.6"'
                  : 'Ex: "Ramlal (101)" followed by lines "21 5.5 4.5 8.5" ... "31 6.5 4.8 8.6"'}
              </p>
              <textarea
                id="camera-slip-text-input"
                data-testid="camera-slip-text-input"
                rows={3}
                placeholder={'किसान: रामलाल गुर्जर (101)\n21 5.5 4.5 8.5\n22 6.0 4.6 8.5\n23 5.8 4.4 8.5'}
                value={slipManualText}
                onChange={(e) => setSlipManualText(e.target.value)}
                className="w-full p-2.5 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <button
                type="button"
                data-testid="camera-slip-text-save-btn"
                onClick={() => {
                  setCameraError(null);
                  const rows = parseMilkSlipTextToRows(slipManualText, date, shift);
                  stageScannedRowsForPreview(
                    rows,
                    photoQuickFarmerId || farmerId || scheduledForShiftFarmers[0]?.id || state.farmers[0]?.id
                  );
                }}
                className="w-full min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {lang === 'hi'
                  ? 'पर्ची से प्रिव्यू तैयार करें (तारीख, कोड, नाम, फैट, SNF, लीटर, रेट, अमाउंट देखें)'
                  : 'Preview Milk Entries from Slip'}
              </button>
            </div>

            {cameraError && (
              <div
                data-testid="camera-slip-error"
                className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs font-semibold text-amber-900 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
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
