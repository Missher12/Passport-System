import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import type { CredentialKind, DynamicQRToken } from '../../types/domain';
import { getApiClient } from '../../services/api';
import { StatusIndicator, type StatusTone } from '../glass/GlassPrimitives';

export function formatValidDateRange(dates: string[]): string {
  if (!dates || dates.length === 0) return '—';
  if (dates.length === 1) return dates[0];
  return `${dates[0]} 至 ${dates[dates.length - 1]}`;
}

export function GlassQRCode({
  value,
  size = 188,
  label = '电子凭证二维码',
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (!value) {
      setDataUrl('');
      return;
    }
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  return (
    <div
      className="inline-flex items-center justify-center p-3 rounded-2xl bg-white shadow-[0_4px_18px_rgba(15,23,42,0.08)] border border-slate-900/[0.06]"
      style={{ width: size + 24, height: size + 24 }}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={label}
          width={size}
          height={size}
          className="rounded-lg block"
        />
      ) : (
        <div
          style={{ width: size, height: size }}
          className="rounded-lg bg-slate-100 animate-pulse"
        />
      )}
    </div>
  );
}

export function ElectronicCredentialCard({
  credentialKind,
  credentialId,
  activityId,
  activityName,
  holderName,
  code,
  subtitle,
  validDateLabel,
  statusLabel,
  statusTone,
  avatarUrl,
  activeForQR,
  onTokenIssued,
}: {
  credentialKind: CredentialKind;
  credentialId: string;
  activityId: string;
  activityName: string;
  holderName: string;
  code: string;
  subtitle: string;
  validDateLabel: string;
  statusLabel: string;
  statusTone: StatusTone;
  avatarUrl?: string;
  activeForQR: boolean;
  onTokenIssued?: (token: DynamicQRToken) => void;
}) {
  const [tokenObj, setTokenObj] = useState<DynamicQRToken | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(30);
  const [refreshing, setRefreshing] = useState(false);

  const issueToken = useCallback(async () => {
    if (!activeForQR) return;
    setRefreshing(true);
    try {
      const next = await getApiClient().qr.issueDynamicToken(
        credentialKind,
        credentialId,
        activityId,
      );
      setTokenObj(next);
      setSecondsLeft(Math.max(1, Math.round((next.expiresAt - Date.now()) / 1000)));
      onTokenIssued?.(next);
    } finally {
      setRefreshing(false);
    }
  }, [activeForQR, credentialKind, credentialId, activityId, onTokenIssued]);

  useEffect(() => {
    if (!activeForQR) {
      setTokenObj(null);
      return;
    }
    issueToken();
  }, [activeForQR, issueToken]);

  useEffect(() => {
    if (!activeForQR || !tokenObj) return;
    const timer = window.setInterval(() => {
      const left = Math.ceil((tokenObj.expiresAt - Date.now()) / 1000);
      if (left <= 0) {
        issueToken();
      } else {
        setSecondsLeft(left);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeForQR, tokenObj, issueToken]);

  const ringClass = !activeForQR
    ? 'credential-halo-ring credential-halo-ring--inactive'
    : credentialKind === 'gift'
      ? 'credential-halo-ring credential-halo-ring--gift'
      : 'credential-halo-ring';

  return (
    <div className={`w-full max-w-[360px] mx-auto ${ringClass}`}>
      <div className="rounded-[23px] bg-white/92 backdrop-blur-xl p-5 space-y-4">
        {/* Card Top Strip */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-900/[0.07]">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-500 truncate">{activityName}</p>
            <p className="text-sm font-semibold text-slate-900 mt-0.5">
              {credentialKind === 'certificate' ? '电子工作证件' : '电子活动赠票'}
            </p>
          </div>
          <StatusIndicator tone={statusTone} label={statusLabel} />
        </div>

        {/* Mobile Business Card Profile */}
        <div className="flex items-center gap-3.5">
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 border border-slate-900/[0.08] shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`${holderName} 自拍照`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                待补拍
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="text-lg font-semibold text-slate-900 truncate">{holderName}</h3>
            <p className="text-sm font-semibold text-[#0071e3] order-number">{code}</p>
            <p className="text-xs text-slate-600 truncate">{subtitle}</p>
          </div>
        </div>

        <div className="grid grid-cols-[1.4fr_0.9fr] gap-2.5 px-3 py-2.5 rounded-xl bg-slate-900/[0.035] text-xs">
          <div className="min-w-0">
            <span className="text-slate-500 block">有效日期</span>
            <span className="text-slate-900 font-medium date-number mt-0.5 block leading-snug">
              {validDateLabel}
            </span>
          </div>
          <div className="min-w-0">
            <span className="text-slate-500 block">凭证类型</span>
            <span className="text-slate-900 font-medium mt-0.5 block leading-snug">
              {credentialKind === 'certificate' ? '展商 / 活动证件' : '一票一码赠票'}
            </span>
          </div>
        </div>

        {/* Dynamic 30s QR Code Area */}
        <div className="flex flex-col items-center pt-1">
          {activeForQR && tokenObj ? (
            <>
              <GlassQRCode
                value={tokenObj.token}
                size={176}
                label={`${holderName} 动态核验二维码`}
              />
              <div className="w-full mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 numeric-text">
                    动态码有效倒计时：<strong className="text-slate-900">{secondsLeft} 秒</strong>
                  </span>
                  <button
                    type="button"
                    onClick={issueToken}
                    disabled={refreshing}
                    className="inline-flex items-center gap-1 text-[#0071e3] hover:text-[#005bb8] font-medium cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                    立即刷新
                  </button>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-[#0071e3] transition-all duration-700"
                    style={{ width: `${Math.max(4, (secondsLeft / 30) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 text-center numeric-text break-all">
                  令牌：{tokenObj.token}
                </p>
              </div>
            </>
          ) : (
            <div className="w-full py-7 px-4 rounded-2xl bg-slate-900/[0.04] text-center space-y-2">
              <ShieldAlert className="w-7 h-7 text-amber-600 mx-auto" />
              <p className="text-sm font-medium text-slate-800">暂未生成动态二维码</p>
              <p className="text-xs text-slate-500">请先完成资料与自拍上传。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
