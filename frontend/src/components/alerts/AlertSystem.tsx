import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";

export type AlertTone = "success" | "error" | "warning" | "info";

const toneStyle: Record<AlertTone, { accent: string; icon: typeof Info; label: string; soft: string; dark: string }> = {
  success: { accent: "bg-emerald-500", icon: CheckCircle2, label: "Completed", soft: "bg-emerald-50 text-emerald-950", dark: "text-emerald-300" },
  error: { accent: "bg-[#ff4f70]", icon: ShieldAlert, label: "Action needed", soft: "bg-rose-50 text-rose-950", dark: "text-rose-300" },
  warning: { accent: "bg-amber-400", icon: AlertTriangle, label: "Check this", soft: "bg-amber-50 text-amber-950", dark: "text-amber-300" },
  info: { accent: "bg-[#3155ff]", icon: Info, label: "Heads up", soft: "bg-[#eef0ff] text-[#17255f]", dark: "text-[#9eacff]" },
};

interface AlertBannerProps {
  tone: AlertTone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  appearance?: "light" | "dark";
  className?: string;
}

export function AlertBanner({ tone, title, children, action, onDismiss, appearance = "light", className = "" }: AlertBannerProps) {
  const style = toneStyle[tone];
  const Icon = style.icon;
  const dark = appearance === "dark";

  return (
    <section
      role={tone === "error" ? "alert" : "status"}
      className={`relative overflow-hidden rounded-[18px] border p-4 shadow-sm ${dark ? "border-white/10 bg-white/[0.055] text-white" : `border-black/10 ${style.soft}`} ${className}`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${style.accent}`} />
      <div className="flex items-start gap-3 pl-1">
        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${dark ? "bg-white/10" : "bg-white/70"}`}>
          <Icon className={`h-4 w-4 ${dark ? style.dark : "text-current"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.17em] opacity-55">{title || style.label}</p>
          <div className="mt-1 text-xs font-semibold leading-5 opacity-85">{children}</div>
          {action && <div className="mt-3">{action}</div>}
        </div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="grid h-8 w-8 shrink-0 place-items-center rounded-full opacity-45 transition hover:bg-black/10 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current" aria-label="Dismiss alert">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </section>
  );
}

interface ToastInput {
  tone: AlertTone;
  title?: string;
  message: string;
  duration?: number;
}

interface Toast extends ToastInput { id: number }
interface AlertContextValue { notify: (toast: ToastInput) => number; dismiss: (id: number) => void }

const AlertContext = createContext<AlertContextValue | null>(null);

export function AlertProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const notify = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-3), { ...toast, id }]);
    if (toast.duration !== 0) {
      const timer = window.setTimeout(() => dismiss(id), toast.duration ?? 4500);
      timers.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
  }, []);

  return (
    <AlertContext.Provider value={{ notify, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:bottom-auto sm:left-auto sm:right-5 sm:top-5 sm:w-[360px]" aria-live="polite" aria-label="Notifications">
        {toasts.map((toast) => {
          const style = toneStyle[toast.tone];
          const Icon = style.icon;
          return (
            <article key={toast.id} role={toast.tone === "error" ? "alert" : "status"} className="pointer-events-auto relative w-full overflow-hidden rounded-[18px] border border-white/10 bg-[#151515] p-4 text-white shadow-[0_18px_55px_rgba(0,0,0,.28)] animate-fadeIn">
              <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${style.accent}`} />
              <div className="flex items-start gap-3 pl-1">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10"><Icon className={`h-4 w-4 ${style.dark}`} /></span>
                <div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[0.17em] text-white/35">{toast.title || style.label}</p><p className="mt-1 text-xs font-semibold leading-5 text-white/80">{toast.message}</p></div>
                <button type="button" onClick={() => dismiss(toast.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/35 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Dismiss notification"><X className="h-3.5 w-3.5" /></button>
              </div>
            </article>
          );
        })}
      </div>
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useAlerts must be used within AlertProvider");
  return context;
}
