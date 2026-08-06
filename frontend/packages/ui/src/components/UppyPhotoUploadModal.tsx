import { useEffect, useState } from 'react';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import ImageEditor from '@uppy/image-editor';
import { DashboardModal } from '@uppy/react';

import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';
import '@uppy/image-editor/css/style.min.css';

export interface UppyPhotoUploadModalProps {
  open: boolean;
  onClose: () => void;
  apiBase: string;
  token?: string;
  category?: string;
  onSuccess?: () => void;
}

export function UppyPhotoUploadModal({
  open,
  onClose,
  apiBase,
  token,
  category = 'profile-photos',
  onSuccess,
}: UppyPhotoUploadModalProps) {
  const [uppy] = useState(() => {
    const instance = new Uppy({
      id: 'profile-photo-uppy',
      autoProceed: false,
      restrictions: {
        maxFileSize: 5 * 1024 * 1024,
        maxNumberOfFiles: 1,
        allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp'],
      },
    })
      .use(Tus, {
        endpoint: `${apiBase}/api/files/tus`,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .use(ImageEditor, {
        quality: 0.9,
      });

    instance.on('upload-success', () => {
      onSuccess?.();
    });

    return instance;
  });

  useEffect(() => {
    if (uppy) {
      const tusPlugin = uppy.getPlugin('Tus');
      if (tusPlugin) {
        tusPlugin.setOptions({
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      }
    }
  }, [uppy, token]);

  useEffect(() => {
    if (uppy) {
      uppy.setMeta({ category });
    }
  }, [uppy, category]);

  return (
    <DashboardModal
      uppy={uppy}
      open={open}
      onRequestClose={onClose}
      plugins={['ImageEditor']}
      closeAfterFinish
      showProgressDetails
      theme="dark"
    />
  );
}
