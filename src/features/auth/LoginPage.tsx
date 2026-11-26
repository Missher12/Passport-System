import React, { useState } from 'react';
import { ExternalLink, KeyRound, ShieldCheck, Sparkles, Ticket } from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import { GlassButton, GlassCard, GlassInput } from '../../components/glass/GlassPrimitives';
import { SmartCaptchaModal } from '../../components/glass/GlassOverlay';
import { PageContainer } from '../../components/layout/PageContainer';
import { getApiClient } from '../../services/api';
import type { CaptchaChallenge } from '../../types/domain';

const DEMO_ACCOUNTS = [
  { username: 'admin', label: '系统管理员', name: '梁景行' },
  { username: 'act_manager', label: '活动管理员', name: '许清岚' },
  { username: 'badge_staff', label: '证件发放员', name: '赵若琳' },
  { username: 'gift_staff', label: '赠票管理员', name: '江明远' },
  { username: 'scanner_01', label: '现场核销员', name: '吴启帆' },
];

export function LoginPage() {
  const { loginUser, switchPortal, pushToast } = useApp();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('demo123456');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaChallenge, setCaptchaChallenge] = useState<CaptchaChallenge | null>(null);

  const attemptLogin = async (captchaToken?: string) => {
    setSubmitting(true);
    setError(null);
    try {
      if (!captchaToken) {
        const challenge = await getApiClient().captcha.assessRisk('login', `login:${username}`);
        if (challenge.required) {
          setCaptchaChallenge(challenge);
          setSubmitting(false);
          return;
        }
      }
      await loginUser(username, password, captchaToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '登录失败';
      setError(msg);
      pushToast({ tone: 'error', title: '登录未通过', detail: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh liquid-canvas flex items-center py-8">
      <PageContainer>
        <div className="w-full max-w-[460px] mx-auto space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0071e3] to-[#38bdf8] text-white flex items-center justify-center shadow-[0_10px_28px_rgba(0,113,227,0.28)] mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              萤火通行
            </h1>
            <p className="text-xs text-slate-500">活动证件与赠票管理系统 · 演示模式</p>
          </div>

        <GlassCard elevated padding="lg">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              attemptLogin();
            }}
            className="space-y-4"
          >
            <GlassInput
              label="员工账号"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入内部账号"
            />
            <GlassInput
              label="登录密码"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入登录密码"
            />

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            <GlassButton
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              className="w-full"
            >
              <ShieldCheck className="w-4 h-4" />
              登录管理后台
            </GlassButton>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-900/[0.07] space-y-2.5">
            <p className="text-xs font-medium text-slate-500">演示账号快捷填充</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => {
                    setUsername(acc.username);
                    setPassword('demo123456');
                    setError(null);
                  }}
                  className={`px-2.5 py-2 rounded-xl text-left text-xs border transition-colors cursor-pointer ${
                    username === acc.username
                      ? 'bg-[#0071e3]/10 border-[#0071e3]/35 text-[#0071e3]'
                      : 'bg-white/60 border-slate-900/[0.06] text-slate-700 hover:bg-white'
                  }`}
                >
                  <div className="font-semibold">{acc.label}</div>
                  <div className="text-[11px] opacity-75">{acc.name}</div>
                </button>
              ))}
            </div>
          </div>
        </GlassCard>

        <GlassCard padding="sm">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-600 font-medium">外部业务入口直达</span>
            <div className="flex items-center gap-2">
              <GlassButton size="sm" variant="secondary" onClick={() => switchPortal('exhibitor')}>
                <KeyRound className="w-3.5 h-3.5" />
                外部展商端
                <ExternalLink className="w-3 h-3" />
              </GlassButton>
              <GlassButton size="sm" variant="secondary" onClick={() => switchPortal('gift')}>
                <Ticket className="w-3.5 h-3.5" />
                外部赠票端
                <ExternalLink className="w-3 h-3" />
              </GlassButton>
            </div>
          </div>
        </GlassCard>
        </div>
      </PageContainer>

      <SmartCaptchaModal
        open={Boolean(captchaChallenge)}
        challenge={captchaChallenge}
        onClose={() => setCaptchaChallenge(null)}
        onVerified={(token) => {
          setCaptchaChallenge(null);
          attemptLogin(token);
        }}
      />
    </div>
  );
}
