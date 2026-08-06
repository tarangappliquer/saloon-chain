import { Pause, Play, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from './Button';

export interface TusUploadControlProps {
  fileName?: string;
  isUploading: boolean;
  isPaused: boolean;
  isSuccess: boolean;
  error?: Error | null;
  progress: number;
  bytesUploaded: number;
  bytesTotal: number;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export function TusUploadControl({
  fileName,
  isUploading,
  isPaused,
  isSuccess,
  error,
  progress,
  bytesUploaded,
  bytesTotal,
  onPause,
  onResume,
  onCancel,
}: TusUploadControlProps) {
  // Automatically hide progress control once upload is complete (or when inactive)
  if (!isUploading && !isPaused && !error) {
    return null;
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {isSuccess ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          ) : error ? (
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          ) : (
            <span className="flex h-2.5 w-2.5 rounded-full bg-primary animate-ping shrink-0" />
          )}
          <span className="truncate text-xs font-semibold text-foreground">
            {fileName || 'Resumable Upload'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isUploading && (
            <Button variant="outline" size="sm" type="button" onClick={onPause} className="h-7 px-2 text-xs">
              <Pause className="h-3.5 w-3.5 mr-1" />
              Pause
            </Button>
          )}

          {isPaused && (
            <Button variant="outline" size="sm" type="button" onClick={onResume} className="h-7 px-2 text-xs">
              <Play className="h-3.5 w-3.5 mr-1" />
              Resume
            </Button>
          )}

          {(isUploading || isPaused) && (
            <Button variant="ghost" size="sm" type="button" onClick={onCancel} className="h-7 w-7 p-0 text-muted-foreground">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {isSuccess
              ? 'Upload complete'
              : isPaused
              ? 'Paused'
              : error
              ? 'Upload failed'
              : `${formatSize(bytesUploaded)} of ${formatSize(bytesTotal)}`}
          </span>
          <span className="font-bold text-foreground">{progress}%</span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all duration-300 ${
              isSuccess
                ? 'bg-emerald-500'
                : error
                ? 'bg-red-500'
                : isPaused
                ? 'bg-amber-500'
                : 'bg-primary'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500 font-medium">{error.message}</p>}
    </div>
  );
}
