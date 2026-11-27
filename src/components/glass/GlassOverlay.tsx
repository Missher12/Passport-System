import React, { useEffect, useRef, useState } from 'react';
import { Camera, ShieldCheck, Upload, X } from 'lucide-react';
import { GlassButton, GlassInput } from './GlassPrimitives';
import { getApiClient } from '../../services/api';
import type { CaptchaChallenge } from '../../types/domain';

export function GlassDialog({
  open,
  title,
  subtitle,
  onClose,
  maxWidthClass = 'max-w-2xl',
  footer,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  maxWidthClass?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`glass-surface-elevated w-full ${maxWidthClass} max-h-[90dvh] flex flex-col overflow-hidden`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-900/[0.07]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="关闭弹窗"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-900/[0.06] flex items-center justify-center text-slate-500 hover:text-slate-900 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-6 py-3.5 border-t border-slate-900/[0.07] bg-white/40 flex items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function GlassDrawer({
  open,
  title,
  subtitle,
  onClose,
  widthClass = 'max-w-xl',
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  widthClass?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[150] flex justify-end bg-slate-900/25 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`glass-surface-elevated h-full w-full ${widthClass} rounded-none sm:rounded-l-[26px] flex flex-col overflow-hidden`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-900/[0.07]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="关闭抽屉"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-900/[0.06] flex items-center justify-center text-slate-500 hover:text-slate-900 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

export function GlassUpload({
  value,
  onChange,
  label = '本人正面自拍照',
  helperText = '支持摄像头拍摄或相册上传',
}: {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  helperText?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  useEffect(() => stopCamera, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await getApiClient().files.uploadImage(file, 'avatar');
      onChange(res.url);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('当前浏览器不支持摄像头访问，请通过相册上传照片。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setCameraOpen(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setCameraError('未获得摄像头权限或未检测到摄像头，请通过相册上传照片。');
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const size = Math.min(video.videoWidth || 480, video.videoHeight || 480);
      const sx = ((video.videoWidth || 480) - size) / 2;
      const sy = ((video.videoHeight || 480) - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, 480, 480);
      onChange(canvas.toDataURL('image/jpeg', 0.88));
    }
    stopCamera();
  };

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <div className="glass-surface-subtle p-4 flex flex-col sm:flex-row items-center gap-4">
        <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-900/[0.06] border border-white/80 shrink-0 flex items-center justify-center">
          {value ? (
            <img
              src={value}
              alt="自拍照预览"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <Camera className="w-7 h-7 text-slate-400" aria-hidden="true" />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-2 text-center sm:text-left">
          <p className="text-xs text-slate-600">{helperText}</p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <GlassButton
              size="sm"
              variant="primary"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" />
              {value ? '替换照片' : '相册上传'}
            </GlassButton>
            <GlassButton size="sm" variant="secondary" onClick={startCamera}>
              <Camera className="w-3.5 h-3.5" />
              摄像头拍摄
            </GlassButton>
          </div>
          {cameraError && <p className="text-xs text-amber-700">{cameraError}</p>}
        </div>
      </div>

      {cameraOpen && (
        <div className="glass-surface-subtle p-4 space-y-3">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-w-xs mx-auto aspect-square object-cover rounded-2xl bg-slate-900"
          />
          <div className="flex items-center justify-center gap-2.5">
            <GlassButton size="sm" variant="primary" onClick={captureFrame}>
              拍摄并采用
            </GlassButton>
            <GlassButton size="sm" variant="secondary" onClick={stopCamera}>
              取消拍摄
            </GlassButton>
          </div>
        </div>
      )}
    </div>
  );
}

export function SmartCaptchaModal({
  open,
  challenge,
  onClose,
  onVerified,
}: {
  open: boolean;
  challenge: CaptchaChallenge | null;
  onClose: () => void;
  onVerified: (token: string) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await getApiClient().captcha.verifyChallenge(challenge.challengeId, answer);
      if (res.passed && res.token) {
        setAnswer('');
        onVerified(res.token);
      } else {
        setError(res.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassDialog
      open={open && Boolean(challenge)}
      title="人机安全校验"
      onClose={onClose}
      maxWidthClass="max-w-md"
    >
      {challenge && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="glass-surface-subtle p-4 flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-[#0071e3] shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-900">{challenge.prompt}</p>
              <p className="text-xs text-slate-500 mt-0.5 numeric-text">
                风控风险评估分：{challenge.riskScore} / 100
              </p>
            </div>
          </div>
          <GlassInput
            label="请输入验证结果"
            numeric
            required
            placeholder="输入数字答案"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            error={error ?? undefined}
          />
          <div className="flex justify-end gap-2">
            <GlassButton variant="secondary" onClick={onClose}>
              取消
            </GlassButton>
            <GlassButton type="submit" variant="primary" loading={submitting}>
              确认验证
            </GlassButton>
          </div>
        </form>
      )}
    </GlassDialog>
  );
}
