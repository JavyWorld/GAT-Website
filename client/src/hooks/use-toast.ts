import React, { useState, useCallback } from "react";

export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  variant?: "default" | "destructive";
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastOptions[]>([]);

  const toast = useCallback((options: ToastOptions) => {
    const id = options.id ?? crypto.randomUUID();
    setToasts((current) => [...current, { ...options, id }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return { toast, dismiss, toasts };
}
