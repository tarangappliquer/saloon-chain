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

// Colors/spacing come from the `--swal2-*` variables set on `.swal2-popup` in globals.css
// (SweetAlert2's own theming hooks), so buttonsStyling stays on and we get its default button
// padding/border-radius for free. `confirm-button-danger` just swaps the confirm button's
// variables to the destructive palette for the two-choice "danger" variant.
const getSwalThemeClasses = (danger: boolean) => (danger ? { confirmButton: 'confirm-button-danger' } : undefined);

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
      allowOutsideClick: !loading,
      allowEscapeKey: !loading,
      showLoaderOnConfirm: true,
      preConfirm: async () => {
        try {
          await onConfirm();
        } catch {
          // If onConfirm throws, caller handles error
          return false;
        }
      },
    }).then((result) => {
      if (result.isDismissed || result.dismiss === Swal.DismissReason.cancel) {
        onClose();
      }
    });
    return () => {
      if (MySwal.isVisible()) {
        MySwal.close();
      }
    };
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
