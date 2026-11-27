import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  Info,
  Lock,
  MoreHorizontal,
  RefreshCw,
  Search,
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
          : 'bg-white/78 text-slate-900 hover:bg-white/95 border border-slate-900/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_rgba(15,23,42,0.04)]';

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
  const generatedId = useId();
  const inputId = id || generatedId;
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

export interface GlassSelectOption {
  value: string;
  label: string;
  shortLabel?: string;
  sublabel?: string;
}

export interface GlassSelectProps {
  label?: string;
  error?: string;
  options: GlassSelectOption[];
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  onValueChange?: (value: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}

export function GlassSelect({
  label,
  error,
  options,
  value = '',
  onChange,
  onValueChange,
  id,
  className = '',
  placeholder = '请选择',
  required,
  disabled,
  searchable = false,
  searchPlaceholder = '搜索选项...',
  size = 'md',
  'aria-label': ariaLabel,
}: GlassSelectProps) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    openUp: boolean;
  } | null>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q)),
    );
  }, [options, searchable, search]);

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const preferredHeight = Math.min(280, (searchable ? 46 : 0) + Math.max(1, filteredOptions.length) * 38 + 16);
    const openUp = spaceBelow < Math.min(220, preferredHeight) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(280, openUp ? spaceAbove : spaceBelow));
    const panelWidth = Math.max(rect.width, 168);
    const clampedLeft = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - panelWidth - 8),
    );
    const top = openUp ? Math.max(8, rect.top - Math.min(preferredHeight, maxHeight) - 6) : rect.bottom + 6;
    setCoords({
      top,
      left: clampedLeft,
      width: panelWidth,
      maxHeight,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, filteredOptions.length]);

  useEffect(() => {
    if (!open) return;
    const idx = filteredOptions.findIndex((o) => o.value === value);
    setHighlightIndex(idx >= 0 ? idx : 0);
    if (searchable) {
      window.setTimeout(() => searchInputRef.current?.focus(), 20);
    }

    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onResizeOrScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) {
        return;
      }
      updatePosition();
    };
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('resize', onResizeOrScroll);
    window.addEventListener('scroll', onResizeOrScroll, true);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('resize', onResizeOrScroll);
      window.removeEventListener('scroll', onResizeOrScroll, true);
    };
  }, [open]);

  const commitValue = (nextVal: string) => {
    onValueChange?.(nextVal);
    onChange?.({ target: { value: nextVal } });
    setOpen(false);
    setSearch('');
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(filteredOptions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredOptions[highlightIndex];
      if (target) commitValue(target.value);
    }
  };

  const heightClass = size === 'sm' ? 'h-[36px] px-3 text-xs sm:text-sm' : 'h-[40px] px-3.5 text-sm';

  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-slate-700">
          {label}
          {required && <span className="text-red-600 ml-0.5">*</span>}
        </label>
      )}
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel || label || placeholder}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onKeyDown={handleKeyDown}
        className={`glass-input ${heightClass} w-full flex items-center justify-between gap-2 text-left text-slate-900 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed ${
          error ? 'border-red-500!' : ''
        } ${open ? 'bg-white/96 border-[#0071e3] ring-3 ring-[#0071e3]/15' : ''}`}
      >
        <span className={`truncate numeric-text ${selectedOption ? 'text-slate-900' : 'text-slate-400'}`}>
          {selectedOption ? (selectedOption.shortLabel || selectedOption.label) : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180 text-[#0071e3]' : ''
          }`}
          aria-hidden="true"
        />
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            onKeyDown={handleKeyDown}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
              zIndex: 260,
            }}
            className="glass-surface-elevated !bg-white/95 p-1.5 flex flex-col overflow-hidden"
          >
            {searchable && (
              <div className="p-1 pb-1.5 border-b border-slate-900/[0.06]">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setHighlightIndex(0);
                    }}
                    placeholder={searchPlaceholder}
                    className="glass-input h-[32px] pl-8 pr-2.5 text-xs w-full"
                  />
                </div>
              </div>
            )}
            <div className="overflow-y-auto flex-1 py-0.5 space-y-0.5">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-slate-400">无匹配选项</div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const selected = opt.value === value;
                  const highlighted = idx === highlightIndex;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setHighlightIndex(idx)}
                      onClick={() => commitValue(opt.value)}
                      className={`w-full px-2.5 py-2 rounded-[10px] text-left text-xs sm:text-sm flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        selected
                          ? 'bg-[#0071e3]/10 text-[#0071e3] font-medium'
                          : highlighted
                            ? 'bg-slate-900/[0.05] text-slate-900'
                            : 'text-slate-700 hover:bg-slate-900/[0.04]'
                      }`}
                    >
                      <span className="truncate numeric-text">
                        {opt.label}
                        {opt.sublabel && (
                          <span className="ml-1.5 text-xs text-slate-400">{opt.sublabel}</span>
                        )}
                      </span>
                      {selected && <Check className="w-3.5 h-3.5 shrink-0 text-[#0071e3]" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
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
  showCount = false,
  variant = 'default',
  className = '',
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (id: T) => void;
  showCount?: boolean;
  variant?: 'default' | 'embedded';
  className?: string;
}) {
  const isEmbedded = variant === 'embedded';
  return (
    <div
      role="tablist"
      className={
        isEmbedded
          ? `inline-flex items-center flex-wrap gap-1 ${className}`
          : `inline-flex items-center flex-wrap gap-1 p-1 rounded-[14px] bg-slate-900/[0.05] border border-white/70 backdrop-blur-md ${className}`
      }
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
            className={`px-3.5 py-1.5 rounded-[11px] text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150 ${
              active
                ? isEmbedded
                  ? 'bg-[#0071e3]/10 text-[#0071e3] font-semibold'
                  : 'bg-white/95 text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.08)]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-900/[0.04]'
            }`}
          >
            <span>{tab.label}</span>
            {showCount && typeof tab.count === 'number' && (
              <span className="ml-1.5 numeric-text text-xs text-slate-500">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function GlassToolbar({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`glass-surface px-3 py-2 sm:px-3.5 sm:py-2.5 flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Per-row, per-field masked sensitive display with explicit eye toggle.
 * Never reveals unrelated rows or fields; logs audit entry when unmasked.
 */
export function SensitiveFieldCell({
  maskedValue,
  rawValue,
  revealed,
  canReveal,
  fieldLabel,
  onToggle,
  numericClass = 'numeric-text',
}: {
  maskedValue: string;
  rawValue: string;
  revealed: boolean;
  canReveal: boolean;
  fieldLabel: string;
  onToggle: () => void;
  numericClass?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 max-w-full">
      <span className={`${numericClass} text-xs text-slate-700 truncate`}>
        {revealed ? rawValue : maskedValue}
      </span>
      {canReveal && (
        <button
          type="button"
          aria-label={revealed ? `隐藏${fieldLabel}` : `查看${fieldLabel}`}
          title={revealed ? `隐藏${fieldLabel}` : `查看${fieldLabel}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="w-6 h-6 rounded-md hover:bg-slate-900/[0.06] inline-flex items-center justify-center text-slate-400 hover:text-[#0071e3] cursor-pointer shrink-0 transition-colors"
        >
          {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      )}
    </span>
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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 text-balance">
          {title}
        </h1>
        {subtitle && <p className="text-xs sm:text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-11 h-11 rounded-2xl bg-slate-900/[0.05] flex items-center justify-center text-slate-500 mb-3">
        <Info className="w-5 h-5" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-md">{description}</p>}
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
        <h2 className="text-lg font-semibold text-slate-900">当前角色无「{moduleLabel}」权限</h2>
        <p className="text-sm text-slate-600 mt-1.5">
          请在「设置 → 角色权限」中配置访问授权。
        </p>
      </div>
    </GlassCard>
  );
}

export interface GlassActionMenuItem {
  label: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onClick: () => void;
}

export function GlassActionMenu({
  items,
  label = '更多操作',
}: {
  items: GlassActionMenuItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const visibleItems = items.filter(Boolean);

  const updatePosition = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 156;
    const estHeight = visibleItems.length * 36 + 12;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const openUp = spaceBelow < estHeight && rect.top > estHeight;
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    setMenuStyle({
      position: 'fixed',
      left,
      top: openUp ? Math.max(8, rect.top - estHeight - 6) : rect.bottom + 6,
      width: menuWidth,
      zIndex: 220,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, visibleItems.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReposition = () => setOpen(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open]);

  if (visibleItems.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
          open
            ? 'bg-slate-900/[0.08] text-slate-900'
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-900/[0.06]'
        }`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={menuStyle}
            onClick={(e) => e.stopPropagation()}
            className="bg-white/95 backdrop-blur-2xl border border-slate-900/[0.08] shadow-[0_14px_38px_rgba(15,23,42,0.14),0_2px_6px_rgba(15,23,42,0.06)] rounded-2xl p-1.5 space-y-0.5"
          >
            {visibleItems.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  item.tone === 'danger'
                    ? 'text-red-600 hover:bg-red-500/[0.08]'
                    : 'text-slate-700 hover:bg-slate-900/[0.05] hover:text-slate-900'
                }`}
              >
                {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

export function AllActivityReadonlyNotice({
  onSelectActivity,
}: {
  onSelectActivity?: () => void;
}) {
  return (
    <div className="px-4 py-2.5 rounded-2xl bg-white/55 border border-slate-900/[0.06] flex items-center justify-between gap-3 text-xs text-slate-600">
      <span className="inline-flex items-center gap-2 font-medium text-slate-700">
        <span className="w-1.5 h-1.5 rounded-full bg-[#0071e3] shrink-0" />
        全部活动 · 只读
      </span>
      {onSelectActivity && (
        <button
          type="button"
          onClick={onSelectActivity}
          className="text-xs font-medium text-[#0071e3] hover:text-[#005bb8] transition-colors cursor-pointer shrink-0"
        >
          切换活动
        </button>
      )}
    </div>
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
        <span>当前网络已断开，现场核销已锁定。</span>
      </div>
      {onReconnect && (
        <GlassButton size="sm" variant="secondary" onClick={onReconnect}>
          恢复网络
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
      className="fixed bottom-5 left-4 right-4 sm:left-auto sm:right-5 sm:w-[380px] z-[240] flex flex-col gap-2.5 pointer-events-none"
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
