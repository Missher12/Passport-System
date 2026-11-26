import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  Lock,
  RefreshCw,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import type { ToastItem } from '../../app/providers/AppContext';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  subtle?: boolean;
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function GlassCard({
  elevated = false,
  subtle = false,
  interactive = false,
  padding = 'md',
  className = '',
  children,
  ...rest
}: GlassCardProps) {
  const surfaceClass = elevated
    ? 'glass-surface-elevated'
    : subtle
      ? 'glass-surface-subtle'
      : 'glass-surface';
  const padClass =
    padding === 'none'
      ? ''
      : padding === 'sm'
        ? 'p-4'
        : padding === 'lg'
          ? 'p-6 sm:p-7'
          : 'p-5';
  return (
    <div
      className={`${surfaceClass} ${interactive ? 'glass-interactive' : ''} ${padClass} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function GlassButton({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: GlassButtonProps) {
  const sizeClass =
    size === 'sm'
      ? 'h-[34px] px-3 text-xs gap-1.5 rounded-[10px]'
      : size === 'lg'
        ? 'h-[46px] px-5 text-sm gap-2 rounded-[14px]'
        : 'h-[40px] px-4 text-sm gap-2 rounded-[12px]';

  const variantClass =
    variant === 'primary'
      ? 'bg-[#0071e3] text-white hover:bg-[#005bb8] shadow-[0_6px_18px_rgba(0,113,227,0.24)] border border-white/25'
      : variant === 'danger'
        ? 'bg-[#dc2626] text-white hover:bg-[#b91c1c] shadow-[0_6px_18px_rgba(220,38,38,0.22)] border border-white/20'
        : variant === 'ghost'
          ? 'bg-transparent text-slate-700 hover:bg-white/65 border border-transparent'
          : 'bg-white/75 text-slate-900 hover:bg-white/92 border border-slate-900/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_rgba(15,23,42,0.04)]';

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071e3] ${sizeClass} ${variantClass} ${className}`}
      {...rest}
    >
      {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  numeric?: boolean;
}

export function GlassInput({
  label,
  error,
  hint,
  numeric = false,
  id,
  className = '',
  ...rest
}: GlassInputProps) {
  const inputId = id || (label ? `input-${label.replace(/\s+/g, '-')}` : undefined);
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-slate-700">
          {label}
          {rest.required && <span className="text-red-600 ml-0.5">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={`glass-input h-[40px] px-3.5 text-sm text-slate-900 placeholder:text-slate-400 w-full ${numeric ? 'numeric-text' : ''} ${error ? 'border-red-500!' : ''} ${className}`}
        {...rest}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!error && hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export interface GlassSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

export function GlassSelect({
  label,
  error,
  options,
  id,
  className = '',
  ...rest
}: GlassSelectProps) {
  const selectId = id || (label ? `select-${label.replace(/\s+/g, '-')}` : undefined);
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-slate-700">
          {label}
          {rest.required && <span className="text-red-600 ml-0.5">*</span>}
        </label>
      )}
      <select
        id={selectId}
        className={`glass-input h-[40px] px-3 text-sm text-slate-900 w-full cursor-pointer ${error ? 'border-red-500!' : ''} ${className}`}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function GlassDatePicker({
  label,
  value,
  onChange,
  type = 'datetime-local',
  required,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: 'date' | 'datetime-local';
  required?: boolean;
}) {
  const normalized =
    type === 'datetime-local' && value.length >= 16
      ? value.slice(0, 16)
      : type === 'date' && value.length >= 10
        ? value.slice(0, 10)
        : value;

  return (
    <GlassInput
      label={label}
      type={type}
      numeric
      required={required}
      value={normalized}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function GlassTabs<T extends string>({
  tabs,
  value,
  onChange,
  className = '',
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center flex-wrap gap-1 p-1 rounded-[14px] bg-slate-900/[0.05] border border-white/70 backdrop-blur-md ${className}`}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`px-3.5 py-1.5 rounded-[10px] text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150 ${
              active
                ? 'bg-white/95 text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.08)]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/45'
            }`}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="ml-1.5 numeric-text text-xs text-slate-500">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function StatusIndicator({
  tone,
  label,
}: {
  tone: StatusTone;
  label: string;
}) {
  const styles: Record<StatusTone, { text: string; icon: React.ReactNode }> = {
    success: {
      text: 'text-[#15803d]',
      icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
    warning: {
      text: 'text-[#b45309]',
      icon: <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
    danger: {
      text: 'text-[#b91c1c]',
      icon: <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
    info: {
      text: 'text-[#0369a1]',
      icon: <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
    neutral: {
      text: 'text-slate-600',
      icon: <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />,
    },
  };
  const cfg = styles[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${cfg.text}`}>
      {cfg.icon}
      <span>{label}</span>
    </span>
  );
}

export function GlassBadge({
  label,
  color,
}: {
  label: string;
  color?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 whitespace-nowrap">
      {color && (
        <span
          className="w-2 h-2 rounded-sm shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-[26px] font-semibold tracking-tight text-slate-900 text-balance">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center flex-wrap gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-11 h-11 rounded-2xl bg-slate-900/[0.05] flex items-center justify-center text-slate-500 mb-3">
        <Info className="w-5 h-5" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-4" aria-busy="true" aria-label="数据加载中">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-11 rounded-xl bg-slate-900/[0.06] animate-pulse"
        />
      ))}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <GlassCard className="border-red-200/80">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-red-900">数据加载或操作异常</h3>
            <p className="text-sm text-red-700 mt-0.5">{message}</p>
          </div>
        </div>
        {onRetry && (
          <GlassButton variant="secondary" size="sm" onClick={onRetry}>
            重新加载
          </GlassButton>
        )}
      </div>
    </GlassCard>
  );
}

export function PermissionDeniedState({ moduleLabel }: { moduleLabel: string }) {
  return (
    <GlassCard className="max-w-xl mx-auto my-8">
      <div className="flex flex-col items-center text-center py-6">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center mb-3">
          <Lock className="w-6 h-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">当前角色暂无「{moduleLabel}」访问权限</h2>
        <p className="text-sm text-slate-600 mt-1.5">
          如需访问该模块，请联系系统管理员在「管理 → 角色权限」中为您授权，或通过右上角账户菜单切换其他演示角色体验。
        </p>
      </div>
    </GlassCard>
  );
}

export function OfflineBanner({ onReconnect }: { onReconnect?: () => void }) {
  return (
    <div
      role="alert"
      className="mb-4 px-4 py-3 rounded-2xl bg-red-600/10 border border-red-600/25 flex flex-wrap items-center justify-between gap-3 text-sm text-red-900"
    >
      <div className="flex items-center gap-2.5">
        <WifiOff className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
        <span>
          当前网络已断开（模拟断网保护已开启）：现场核销已自动锁定，恢复网络后将自动重新拉取服务端状态。
        </span>
      </div>
      {onReconnect && (
        <GlassButton size="sm" variant="secondary" onClick={onReconnect}>
          恢复网络连接
        </GlassButton>
      )}
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2.5 max-w-sm w-[calc(100vw-28px)] pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto glass-surface-elevated px-4 py-3 flex items-start gap-3"
        >
          {t.tone === 'success' && <CheckCircle2 className="w-4 h-4 text-[#15803d] shrink-0 mt-0.5" />}
          {t.tone === 'error' && <XCircle className="w-4 h-4 text-[#b91c1c] shrink-0 mt-0.5" />}
          {t.tone === 'warning' && <AlertCircle className="w-4 h-4 text-[#b45309] shrink-0 mt-0.5" />}
          {t.tone === 'info' && <Info className="w-4 h-4 text-[#0071e3] shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900">{t.title}</p>
            {t.detail && <p className="text-xs text-slate-600 mt-0.5">{t.detail}</p>}
          </div>
          <button
            type="button"
            aria-label="关闭通知"
            onClick={() => onDismiss(t.id)}
            className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
