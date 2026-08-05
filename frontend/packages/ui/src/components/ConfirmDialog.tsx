import { useEffect, type ReactNode } from 'react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';

export const MySwal = withReactContent(Swal);

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: ReactNode;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}

export interface ConfirmSwalOptions {
  title: ReactNode;
  text?: ReactNode;
  confirmButtonText?: string;
  cancelButtonText?: string;
  icon?: 'warning' | 'error' | 'success' | 'info' | 'question';
  danger?: boolean;
}

const getSwalThemeClasses = (danger: boolean) => ({
  popup: '!rounded-2xl !border !border-border !bg-card !text-card-foreground !shadow-lift !p-6 !font-sans !max-w-md',
  title: '!text-lg !font-bold !text-foreground !pt-1',
  htmlContainer: '!text-xs !text-muted-foreground !mt-2',
  actions: '!flex !items-center !justify-end !gap-3 !w-full !mt-5 !pt-4 !p-2 !border-t !border-border/60',
  confirmButton: danger
    ? '!px-4 !py-2 !rounded-lg !bg-destructive hover:!opacity-90 !text-destructive-foreground !font-semibold !text-xs !transition-all !cursor-pointer !border-0 !shadow-sm'
    : '!px-4 !py-2 !rounded-lg !bg-primary hover:!opacity-90 !text-primary-foreground !font-semibold !text-xs !transition-all !cursor-pointer !border-0 !shadow-sm',
  cancelButton:
    '!px-4 !py-2 !rounded-lg !bg-secondary hover:!bg-accent !text-secondary-foreground !font-semibold !text-xs !transition-all !cursor-pointer !border !border-border !shadow-sm',
});

export async function showConfirmSwal({
  title,
  text,
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
  icon = 'warning',
  danger = true,
}: ConfirmSwalOptions): Promise<boolean> {
  const result = await MySwal.fire({
    title: title as any,
    html: text as any,
    icon,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
    customClass: getSwalThemeClasses(danger),
    buttonsStyling: false,
  });

  return result.isConfirmed;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onClose,
  children,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) {
      if (MySwal.isVisible()) {
        MySwal.close();
      }
      return;
    }

    MySwal.fire({
      title: title as any,
      html: (children ?? description) as any,
      icon: variant === 'danger' ? 'warning' : 'info',
      showCancelButton: true,
      confirmButtonText: confirmLabel,
      cancelButtonText: cancelLabel,
      reverseButtons: true,
      customClass: getSwalThemeClasses(variant === 'danger'),
      buttonsStyling: false,
      allowOutsideClick: !loading,
      allowEscapeKey: !loading,
      showLoaderOnConfirm: true,
      preConfirm: async () => {
        try {
          await onConfirm();
        } catch (err) {
          // If onConfirm throws, caller handles error
          return false;
        }
      },
    }).then((result) => {
      if (result.isDismissed || result.dismiss === Swal.DismissReason.cancel) {
        onClose();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && MySwal.isVisible()) {
      if (loading) {
        MySwal.showLoading();
      } else {
        MySwal.hideLoading();
      }
    }
  }, [isOpen, loading]);

  return null;
}
