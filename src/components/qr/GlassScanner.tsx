import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import {
  Camera,
  CameraOff,
  Flashlight,
  ImageUp,
  RefreshCw,
  ScanLine,
  WifiOff,
} from 'lucide-react';
import { GlassButton } from '../glass/GlassPrimitives';

export type ScannerStatus =
  | 'initializing'
  | 'scanning'
  | 'permission_denied'
  | 'no_camera'
  | 'stopped'
  | 'error';

export interface GlassScannerProps {
  offline?: boolean;
  lockedReason?: string;
  busy?: boolean;
  onDetected: (code: string) => void;
  onScanError?: (message: string) => void;
}

export function GlassScanner({
  offline = false,
  lockedReason,
  busy = false,
  onDetected,
  onScanError,
}: GlassScannerProps) {
  const isBlocked = offline || Boolean(lockedReason);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastDecodedRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const blockedRef = useRef(isBlocked);
  const busyRef = useRef(busy);
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    blockedRef.current = isBlocked;
    busyRef.current = busy;
    onDetectedRef.current = onDetected;
  }, [isBlocked, busy, onDetected]);

  const [status, setStatus] = useState<ScannerStatus>('initializing');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceIndex, setActiveDeviceIndex] = useState(0);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);

  const stopStream = useCallback(() => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      controlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const emitCode = useCallback((raw: string) => {
    if (blockedRef.current || busyRef.current) return;
    const cleaned = raw.trim();
    if (!cleaned) return;
    const now = Date.now();
    if (
      lastDecodedRef.current.value === cleaned &&
      now - lastDecodedRef.current.at < 2200
    ) {
      return;
    }
    lastDecodedRef.current = { value: cleaned, at: now };
    setFlashSuccess(true);
    window.setTimeout(() => setFlashSuccess(false), 600);
    onDetectedRef.current(cleaned);
  }, []);

  const startCamera = useCallback(
    async (opts?: { deviceId?: string; facing?: 'environment' | 'user' }) => {
      stopStream();
      setStatus('initializing');
      setStatusMessage('');

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setStatus('no_camera');
        setStatusMessage('当前浏览器不支持摄像头访问');
        return;
      }

      const targetFacing = opts?.facing ?? facingMode;
      const videoConstraint: MediaTrackConstraints = opts?.deviceId
        ? { deviceId: { exact: opts.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: { ideal: targetFacing }, width: { ideal: 1280 }, height: { ideal: 720 } };

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraint,
          audio: false,
        });
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
          setTorchSupported(Boolean(caps.torch));
        } else {
          setTorchSupported(false);
        }

        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
          setDevices(videoInputs);
          const currentId = track?.getSettings?.().deviceId;
          if (currentId) {
            const idx = videoInputs.findIndex((d) => d.deviceId === currentId);
            if (idx >= 0) setActiveDeviceIndex(idx);
          }
        } catch {
          // Ignore enumeration error
        }

        if (!readerRef.current) {
          readerRef.current = new BrowserQRCodeReader(undefined, {
            delayBetweenScanAttempts: 220,
            delayBetweenScanSuccess: 1500,
          });
        }

        const video = videoRef.current;
        if (video) {
          controlsRef.current = await readerRef.current.decodeFromStream(
            stream,
            video,
            (result) => {
              if (result) {
                const text = result.getText();
                if (text) emitCode(text);
              }
            },
          );
        }

        setStatus('scanning');
      } catch (err) {
        stopStream();
        const name = err instanceof DOMException ? err.name : '';
        if (
          name === 'NotAllowedError' ||
          name === 'PermissionDeniedError' ||
          name === 'SecurityError'
        ) {
          setStatus('permission_denied');
          setStatusMessage('请在浏览器允许摄像头权限后重试');
        } else if (
          name === 'NotFoundError' ||
          name === 'DevicesNotFoundError' ||
          name === 'OverconstrainedError'
        ) {
          setStatus('no_camera');
          setStatusMessage('未检测到摄像头，可使用下方输入或图片识码');
        } else {
          setStatus('error');
          setStatusMessage('摄像头启动失败');
        }
      }
    },
    [facingMode, emitCode, stopStream],
  );

  useEffect(() => {
    startCamera();
    return () => {
      stopStream();
    };
  }, []);

  const handleSwitchCamera = () => {
    if (devices.length > 1) {
      const nextIdx = (activeDeviceIndex + 1) % devices.length;
      setActiveDeviceIndex(nextIdx);
      startCamera({ deviceId: devices[nextIdx].deviceId });
    } else {
      const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
      setFacingMode(nextFacing);
      startCamera({ facing: nextFacing });
    }
  };

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) {
      onScanError?.('当前设备不支持手电筒');
      return;
    }
    try {
      const next = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      onScanError?.('手电筒开启失败');
    }
  };

  const handleImageFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (isBlocked) {
      onScanError?.(lockedReason || '当前已断网');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      if (!readerRef.current) {
        readerRef.current = new BrowserQRCodeReader();
      }
      const result = await readerRef.current.decodeFromImageUrl(objectUrl);
      const text = result.getText();
      if (text) {
        emitCode(text);
      } else {
        onScanError?.('未识别到二维码');
      }
    } catch {
      onScanError?.('二维码识别失败');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <div className="space-y-3 min-w-0">
      {/* Optical Camera Viewfinder */}
      <div
        className={`relative w-full aspect-[4/3] sm:aspect-[16/10] rounded-2xl overflow-hidden bg-slate-950 border transition-colors ${
          flashSuccess ? 'border-emerald-400 ring-2 ring-emerald-400/50' : 'border-slate-900/15'
        }`}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${status === 'scanning' ? 'opacity-100' : 'opacity-0'}`}
        />

        {/* Four-Corner Scanning Reticle & Animated Laser Sweep */}
        {status === 'scanning' && !isBlocked && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-52 h-52 sm:w-56 sm:h-56">
              <span className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-[#38bdf8] rounded-tl-xl" />
              <span className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-[#38bdf8] rounded-tr-xl" />
              <span className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-[#38bdf8] rounded-bl-xl" />
              <span className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-[#38bdf8] rounded-br-xl" />
              <div className="absolute inset-2 overflow-hidden">
                <div className="scanner-laser-line w-full h-0.5 bg-gradient-to-r from-transparent via-[#38bdf8] to-transparent shadow-[0_0_12px_#38bdf8]" />
              </div>
            </div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-slate-950/65 backdrop-blur-md text-white/95 text-xs flex items-center gap-1.5 whitespace-nowrap">
              <ScanLine className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span>对准二维码自动识别</span>
            </div>
          </div>
        )}

        {/* Offline or Activity Scope Lock Overlay */}
        {isBlocked && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white space-y-2">
            {offline ? (
              <>
                <WifiOff className="w-8 h-8 text-red-400" />
                <p className="text-sm font-semibold">网络已断开</p>
              </>
            ) : (
              <>
                <ScanLine className="w-8 h-8 text-[#38bdf8]" />
                <p className="text-sm font-semibold">{lockedReason}</p>
              </>
            )}
          </div>
        )}

        {/* Standby / Fallback States with Subtle Reticle */}
        {!isBlocked && status !== 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white/90 space-y-3 bg-gradient-to-b from-slate-900 to-slate-950">
            <div className="relative w-44 h-44 flex flex-col items-center justify-center p-4">
              <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-[#38bdf8]/45 rounded-tl-xl" />
              <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#38bdf8]/45 rounded-tr-xl" />
              <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#38bdf8]/45 rounded-bl-xl" />
              <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-[#38bdf8]/45 rounded-br-xl" />
              {status === 'initializing' ? (
                <RefreshCw className="w-7 h-7 text-[#38bdf8] animate-spin" />
              ) : (
                <CameraOff className="w-7 h-7 text-slate-300" />
              )}
              <p className="text-xs font-medium mt-2.5 text-white">
                {status === 'initializing'
                  ? '正在开启摄像头...'
                  : status === 'permission_denied'
                    ? '未获得摄像头权限'
                    : status === 'no_camera'
                      ? '未检测到摄像头'
                      : status === 'stopped'
                        ? '摄像头已暂停'
                        : '摄像头启动失败'}
              </p>
            </div>
            {statusMessage && <p className="text-xs text-slate-400">{statusMessage}</p>}
            {status !== 'initializing' && (
              <GlassButton size="sm" variant="primary" onClick={() => startCamera()}>
                <Camera className="w-3.5 h-3.5" />
                开启摄像头
              </GlassButton>
            )}
          </div>
        )}
      </div>

      {/* Camera Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <GlassButton
            size="sm"
            variant="secondary"
            onClick={() => {
              if (status === 'scanning') {
                stopStream();
                setStatus('stopped');
                setStatusMessage('');
              } else {
                startCamera();
              }
            }}
          >
            {status === 'scanning' ? (
              <>
                <CameraOff className="w-3.5 h-3.5" />
                关闭镜头
              </>
            ) : (
              <>
                <Camera className="w-3.5 h-3.5" />
                开启镜头
              </>
            )}
          </GlassButton>

          <GlassButton
            size="sm"
            variant="secondary"
            disabled={status !== 'scanning'}
            onClick={handleSwitchCamera}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            切换镜头
          </GlassButton>

          <GlassButton
            size="sm"
            variant={torchOn ? 'primary' : 'secondary'}
            disabled={status !== 'scanning' || !torchSupported}
            onClick={handleToggleTorch}
            title={torchSupported ? '切换手电筒' : '当前设备不支持手电筒'}
          >
            <Flashlight className="w-3.5 h-3.5" />
            手电筒
          </GlassButton>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageFileScan}
          />
          <GlassButton
            size="sm"
            variant="ghost"
            disabled={isBlocked || busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageUp className="w-3.5 h-3.5" />
            图片识码
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
