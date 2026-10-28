import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

export interface ExportSectionProps {
  onExportData: () => Promise<void>;
  onExportSuccess: (message: string) => void;
}

export function ExportSection({
  onExportData,
  onExportSuccess,
}: ExportSectionProps) {
  const [isPreparing, setIsPreparing] = useState(false);

  const handleClick = async () => {
    if (isPreparing) return;
    setIsPreparing(true);
    try {
      await onExportData();
      onExportSuccess("we'll email you a link when it's ready");
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={isPreparing}
        className="kimo-btn kimo-btn-sm kimo-btn-secondary"
      >
        {isPreparing ? (
          <>
            <Loader2
              size={14}
              strokeWidth={1.5}
              className="animate-spin"
              aria-hidden="true"
            />
            <span>preparing…</span>
          </>
        ) : (
          <>
            <Download size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>download my data</span>
          </>
        )}
      </button>
    </div>
  );
}
