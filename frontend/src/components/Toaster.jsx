import React, { useEffect, useState } from "react";
import { CheckCircle, XCircle, Info } from "lucide-react";
import { subscribe } from "../utils/toast";

const TOAST_LIMIT = 4;
const AUTO_DISMISS_MS = 3500;
const EXIT_ANIMATION_MS = 200;

const toastStyles = {
  success: {
    icon: CheckCircle,
    color: "text-green-600",
    border: "border-green-200",
  },
  error: {
    icon: XCircle,
    color: "text-red-600",
    border: "border-red-200",
  },
  info: {
    icon: Info,
    color: "text-blue-600",
    border: "border-blue-200",
  },
};

const createToast = ({ type, message }) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type,
  message,
  visible: false,
});

export default function Toaster() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const removeToast = (id) => {
      setToasts((current) =>
        current.map((toast) =>
          toast.id === id ? { ...toast, visible: false } : toast
        )
      );

      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, EXIT_ANIMATION_MS);
    };

    const unsubscribe = subscribe((payload) => {
      const nextToast = createToast(payload);

      setToasts((current) => [nextToast, ...current].slice(0, TOAST_LIMIT));

      window.requestAnimationFrame(() => {
        setToasts((current) =>
          current.map((toast) =>
            toast.id === nextToast.id ? { ...toast, visible: true } : toast
          )
        );
      });

      window.setTimeout(() => {
        removeToast(nextToast.id);
      }, AUTO_DISMISS_MS);
    });

    return unsubscribe;
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex max-w-sm flex-col gap-3">
      {toasts.map((toast) => {
        const styles = toastStyles[toast.type] || toastStyles.info;
        const Icon = styles.icon;

        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 rounded-full border bg-white px-4 py-3 shadow-lg transition duration-200 ease-out ${
              styles.border
            } ${
              toast.visible
                ? "translate-y-0 opacity-100"
                : "translate-y-3 opacity-0"
            }`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${styles.color}`} />
            <span className="text-sm font-medium text-gray-900">
              {toast.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
