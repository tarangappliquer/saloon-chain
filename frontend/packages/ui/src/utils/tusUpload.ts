// @ts-ignore - tus-js-client ESM/CJS resolution
import { Upload } from 'tus-js-client';

export interface TusUploadOptions {
  endpoint: string;
  file: File;
  category: string;
  token?: string;
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
}

export function uploadWithTus(options: TusUploadOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    const upload = new Upload(options.file, {
      endpoint: options.endpoint,
      retryDelays: [0, 1000, 3000, 5000],
      headers,
      metadata: {
        filename: options.file.name,
        filetype: options.file.type,
        category: options.category,
      },
      onError: (error: Error) => {
        reject(error);
      },
      onProgress: (bytesUploaded: number, bytesTotal: number) => {
        if (options.onProgress) {
          options.onProgress(bytesUploaded, bytesTotal);
        }
      },
      onSuccess: () => {
        resolve(upload.url || '');
      },
    });

    upload.start();
  });
}
