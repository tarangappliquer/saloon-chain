import { useState, useCallback, useRef } from 'react';
// @ts-ignore - tus-js-client ESM/CJS resolution
import { Upload } from 'tus-js-client';

export interface UseTusUploadOptions {
  endpoint: string;
  category: string;
  token?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function useTusResumableUpload(options: UseTusUploadOptions) {
  const uploadRef = useRef<Upload | null>(null);
  const [progress, setProgress] = useState(0);
  const [bytesUploaded, setBytesUploaded] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startUpload = useCallback(
    (file: File) => {
      if (uploadRef.current) {
        uploadRef.current.abort();
      }

      setProgress(0);
      setBytesUploaded(0);
      setBytesTotal(file.size);
      setIsUploading(true);
      setIsPaused(false);
      setIsSuccess(false);
      setError(null);

      const headers: Record<string, string> = {};
      if (options.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
      }

      const upload = new Upload(file, {
        endpoint: options.endpoint,
        retryDelays: [0, 1000, 3000, 5000],
        headers,
        metadata: {
          filename: file.name,
          filetype: file.type,
          category: options.category,
        },
        onProgress: (uploaded: number, total: number) => {
          setBytesUploaded(uploaded);
          setBytesTotal(total);
          if (total > 0) {
            const pct = Math.round((uploaded / total) * 100);
            setProgress(pct);
          }
        },
        onSuccess: () => {
          setProgress(100);
          setIsUploading(false);
          setIsPaused(false);
          setIsSuccess(true);
          if (options.onSuccess) options.onSuccess();
        },
        onError: (err: Error) => {
          setIsUploading(false);
          setIsPaused(false);
          setError(err);
          if (options.onError) options.onError(err);
        },
      });

      uploadRef.current = upload;
      upload.start();
    },
    [options]
  );

  const pauseUpload = useCallback(() => {
    if (uploadRef.current) {
      uploadRef.current.abort();
      setIsUploading(false);
      setIsPaused(true);
    }
  }, []);

  const resumeUpload = useCallback(() => {
    if (uploadRef.current) {
      setIsUploading(true);
      setIsPaused(false);
      uploadRef.current.start();
    }
  }, []);

  const cancelUpload = useCallback(() => {
    if (uploadRef.current) {
      uploadRef.current.abort();
      uploadRef.current = null;
    }
    setIsUploading(false);
    setIsPaused(false);
    setProgress(0);
    setBytesUploaded(0);
    setBytesTotal(0);
  }, []);

  return {
    isUploading,
    isPaused,
    isSuccess,
    error,
    progress,
    bytesUploaded,
    bytesTotal,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
  };
}
