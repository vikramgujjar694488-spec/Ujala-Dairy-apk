import React, { useState } from 'react';
import { AlertTriangle, Check, Copy, MessageSquare, Share2, X } from 'lucide-react';
import { Language } from '../types/dairy';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'हाँ, पुष्टि करें',
  cancelLabel = 'रद्द करें',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                variant === 'danger' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-900">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="बंद करें"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-slate-600 leading-relaxed whitespace-pre-line">{message}</p>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[44px] px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors ${
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

interface WhatsAppPreviewModalProps {
  open: boolean;
  title: string;
  phone?: string;
  message: string;
  lang: Language;
  onClose: () => void;
}

export const WhatsAppPreviewModal: React.FC<WhatsAppPreviewModalProps> = ({
  open,
  title,
  phone = '',
  message,
  lang,
  onClose,
}) => {
  const [editablePhone, setEditablePhone] = useState(phone);
  const [editableMsg, setEditableMsg] = useState(message);
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    setEditablePhone(phone);
    setEditableMsg(message);
    setCopied(false);
  }, [phone, message, open]);

  if (!open) return null;

  const cleanPhone = editablePhone.replace(/\D/g, '');
  const formattedPhone =
    cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone.length > 0 ? cleanPhone : '';
  const waUrl = formattedPhone
    ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(editableMsg)}`
    : `https://wa.me/?text=${encodeURIComponent(editableMsg)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editableMsg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wa-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 id="wa-modal-title" className="text-base font-bold text-slate-900">
                {title}
              </h3>
              <p className="text-xs text-slate-500">
                {lang === 'hi'
                  ? 'WhatsApp पर भेजने से पहले संदेश का पूर्वावलोकन (Preview) जाँचें'
                  : 'Preview message before opening WhatsApp'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="बंद करें"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {lang === 'hi' ? 'किसान का WhatsApp मोबाइल नंबर' : 'Farmer WhatsApp Mobile Number'}
            </label>
            <input
              type="tel"
              value={editablePhone}
              onChange={(e) => setEditablePhone(e.target.value)}
              placeholder="9876543210"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {lang === 'hi' ? 'संदेश Preview (आवश्यकतानुसार संपादित करें)' : 'Message Preview'}
            </label>
            <textarea
              rows={9}
              value={editableMsg}
              onChange={(e) => setEditableMsg(e.target.value)}
              className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
            />
          </div>

          <p className="text-xs text-slate-500">
            {lang === 'hi'
              ? 'नोट: यह ऐप आपकी अनुमति के बिना अपने-आप मैसेज नहीं भेजता है। नीचे बटन दबाने पर WhatsApp खुलेगा जहाँ से आप "Send" दबा सकते हैं।'
              : 'Note: This app never sends messages automatically without your action. Clicking below opens WhatsApp for you to confirm sending.'}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1.5"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {copied
              ? lang === 'hi'
                ? 'कॉपी हो गया!'
                : 'Copied!'
              : lang === 'hi'
              ? 'मैसेज कॉपी करें'
              : 'Copy Text'}
          </button>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-1.5"
          >
            <Share2 className="w-4 h-4" />
            {lang === 'hi' ? 'WhatsApp खोलें और भेजें' : 'Open WhatsApp to Send'}
          </a>
        </div>
      </div>
    </div>
  );
};
