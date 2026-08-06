import { useState, useCallback } from 'react';
import { useTus } from 'use-tus';

export interface UseTusUploadOptions {
  endpoint: string;
  category: string;
  token?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useTusResumableUpload(options: UseTusUploadOptions) {
  const { upload, setUpload } = useTus();
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startUpload = useCallback(
    (file: File) => {
      setProgress(0);
      setIsUploading(true);
      setIsSuccess(false);
      setError(null);

      const headers: Record<string, string> = {};
      if (options.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
      }

      setUpload(file, {
        endpoint: options.endpoint,
        retryDelays: [0, 1000, 3000, 5000],
        headers,
        metadata: {
          filename: file.name,
          filetype: file.type,
          category: options.category,
        },
        onProgress: (bytesUploaded: number, bytesTotal: number) => {
          if (bytesTotal > 0) {
            const pct = Math.round((bytesUploaded / bytesTotal) * 100);
            setProgress(pct);
          }
        },
        onSuccess: () => {
          setProgress(100);
          setIsUploading(false);
          setIsSuccess(true);
          if (options.onSuccess) options.onSuccess();
        },
        onError: (err: Error) => {
          setIsUploading(false);
          setError(err);
          if (options.onError) options.onError(err);
        },
      });
    },
    [options, setUpload]
  );

  return {
    upload,
    isUploading,
    isSuccess,
    error,
    progress,
    startUpload,
  };
}
