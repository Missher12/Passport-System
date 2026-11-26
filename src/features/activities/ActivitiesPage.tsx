import React, { useEffect, useState } from 'react';
import { Archive, Calendar, Edit3, PauseCircle, PlayCircle, Plus, Search } from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import { PageContainer } from '../../components/layout/PageContainer';
import {
  EmptyState,
  GlassButton,
  GlassCard,
  GlassDatePicker,
  GlassInput,
  GlassSelect,
  GlassTabs,
  PermissionDeniedState,
  StatusIndicator,
} from '../../components/glass/GlassPrimitives';
import { GlassDialog } from '../../components/glass/GlassOverlay';
import { getApiClient } from '../../services/api';
import { ASSET_PATHS } from '../../services/adapters/seedData';
import { formatDateDisplay, formatDateTimeDisplay } from '../../utils/stateMachines';
import type { Activity, ActivityStatus, ActivityTimeWindows, EntryLinkMode } from '../../types/domain';

const DEFAULT_WINDOWS: ActivityTimeWindows = {
  exhibitorRegisterStart: '2026-12-01T09:00',
  exhibitorRegisterEnd: '2026-12-20T23:59',
  avatarUploadStart: '2026-12-21T00:00',
  avatarUploadEnd: '2026-12-28T23:59',
  badgeClaimStart: '2026-12-30T09:00',
  badgeClaimEnd: '2027-01-03T18:00',
  giftSelfClaimStart: '2026-12-10T10:00',
  giftSelfClaimEnd: '2027-01-02T20:00',
  giftBackendIssueEnd: '2027-01-03T16:00',
  onsiteExtraStart: '2026-12-30T08:00',
  redemptionValidStart: '2027-01-01T08:00',
  redemptionValidEnd: '2027-01-03T20:00',
};

const STATUS_META: Record<ActivityStatus, { label: string; tone: 'success' | 'info' | 'warning' | 'neutral' }> = {
  active: { label: '进行中', tone: 'success' },
  draft: { label: '即将开始', tone: 'info' },
  paused: { label: '已暂停', tone: 'warning' },
  archived: { label: '已归档', tone: 'neutral' },
};

export function ActivitiesPage() {
  const {
    user,
    activities,
    activeActivityId,
    canAccessModule,
    selectActivity,
    refreshCore,
    pushToast,
    setHasUnsavedChanges,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<ActivityStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    code: '',
    name: '',
    coverUrl: ASSET_PATHS.coverGuangzhou,
    location: '',
    startAt: '2027-01-01T09:00',
    endAt: '2027-01-03T18:00',
    description: '',
    timezone: 'Asia/Shanghai',
    status: 'draft' as ActivityStatus,
    defaultEntryMode: 'B_UNIFIED' as EntryLinkMode,
    timeWindows: { ...DEFAULT_WINDOWS },
  });

  useEffect(() => {
    return () => setHasUnsavedChanges(false);
  }, [setHasUnsavedChanges]);

  if (!canAccessModule('activities')) {
    return (
      <PageContainer>
        <PermissionDeniedState moduleLabel="活动管理" />
      </PageContainer>
    );
  }

  const filtered = activities.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      code: `FF-${new Date().getFullYear()}${String(activities.length + 1).padStart(2, '0')}`,
      name: '',
      coverUrl: ASSET_PATHS.coverShanghai,
      location: '',
      startAt: '2027-01-01T09:00',
      endAt: '2027-01-03T18:00',
      description: '',
      timezone: 'Asia/Shanghai',
      status: 'active',
      defaultEntryMode: 'B_UNIFIED',
      timeWindows: { ...DEFAULT_WINDOWS },
    });
    setDialogOpen(true);
  };

  const openEdit = (act: Activity) => {
    setEditing(act);
    setForm({
      code: act.code,
      name: act.name,
      coverUrl: act.coverUrl,
      location: act.location,
      startAt: act.startAt.slice(0, 16),
      endAt: act.endAt.slice(0, 16),
      description: act.description,
      timezone: act.timezone,
      status: act.status,
      defaultEntryMode: act.defaultEntryMode,
      timeWindows: { ...act.timeWindows },
    });
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.name.trim() || !form.location.trim()) {
      pushToast({ tone: 'error', title: '请填写完整的活动名称和活动地点' });
      return;
    }
    setSaving(true);
    try {
      const api = getApiClient();
      if (editing) {
        await api.activities.update(
          editing.id,
          {
            ...form,
            memberCustomFields: editing.memberCustomFields,
          },
          user,
        );
        pushToast({ tone: 'success', title: `已更新活动「${form.name}」` });
      } else {
        const created = await api.activities.create(
          {
            ...form,
            memberCustomFields: [
              { id: 'field_role', label: '展位岗位', required: false, placeholder: '选填' },
            ],
          },
          user,
        );
        await selectActivity(created.id);
        pushToast({
          tone: 'success',
          title: `已创建活动「${created.name}」`,
          detail: '已自动初始化默认证件类别并切换为当前上下文（演示结果）',
        });
      }
      setHasUnsavedChanges(false);
      setDialogOpen(false);
      await refreshCore();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: '保存失败',
        detail: err instanceof Error ? err.message : '未知错误',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (act: Activity, nextStatus: ActivityStatus) => {
    if (!user) return;
    try {
      await getApiClient().activities.setStatus(act.id, nextStatus, user);
      await refreshCore();
      pushToast({
        tone: 'success',
        title: `活动「${act.name}」已设为${STATUS_META[nextStatus].label}`,
      });
    } catch (err) {
      pushToast({ tone: 'error', title: err instanceof Error ? err.message : '状态更新失败' });
    }
  };

  return (
    <PageContainer className="space-y-5">
      {/* Unified Filter & Create Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <GlassTabs
          value={statusFilter}
          onChange={setStatusFilter}
          tabs={[
            { id: 'all', label: '全部', count: activities.length },
            { id: 'active', label: '进行中', count: activities.filter((a) => a.status === 'active').length },
            { id: 'draft', label: '即将开始', count: activities.filter((a) => a.status === 'draft').length },
            { id: 'paused', label: '已暂停', count: activities.filter((a) => a.status === 'paused').length },
            { id: 'archived', label: '已归档', count: activities.filter((a) => a.status === 'archived').length },
          ]}
        />
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 sm:w-56 sm:flex-none">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索活动..."
              className="glass-input h-[38px] pl-9 pr-3 text-sm w-full"
            />
          </div>
          <GlassButton variant="primary" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            创建新活动
          </GlassButton>
        </div>
      </div>

      {/* Single-Row Horizontal Activity Cards */}
      {filtered.length === 0 ? (
        <GlassCard>
          <EmptyState
            title="暂无符合条件的活动"
            action={
              <GlassButton variant="primary" onClick={openCreate}>
                创建新活动
              </GlassButton>
            }
          />
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3.5">
          {filtered.map((act) => {
            const st = STATUS_META[act.status];
            const isCurrent = act.id === activeActivityId;
            return (
              <GlassCard
                key={act.id}
                padding="sm"
                className={`flex flex-col md:flex-row md:items-center gap-4 min-w-0 transition-shadow ${
                  isCurrent ? 'ring-2 ring-[#0071e3]/45' : ''
                }`}
              >
                {/* Left: Compact Cover Thumbnail */}
                <div className="relative w-full h-36 md:w-44 md:h-24 rounded-2xl overflow-hidden bg-slate-200 shrink-0">
                  <img
                    src={act.coverUrl}
                    alt={act.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent" />
                  <span className="absolute bottom-2 left-2.5 text-[11px] font-medium text-white/95 numeric-text">
                    {act.code}
                  </span>
                </div>

                {/* Middle: Key Meta & Compact Schedule */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-base font-semibold text-slate-900 truncate">{act.name}</h2>
                    <StatusIndicator tone={st.tone} label={st.label} />
                    <span className="text-xs text-slate-400">
                      {act.defaultEntryMode === 'A_INDEPENDENT' ? '独立链接' : '统一链接'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 date-number">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {formatDateDisplay(act.startAt)} ~ {formatDateDisplay(act.endAt)}
                    </span>
                    <span className="truncate">{act.location}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-slate-500 date-number">
                    <span>登记 {formatDateDisplay(act.timeWindows.exhibitorRegisterEnd).slice(5)}</span>
                    <span>头像 {formatDateDisplay(act.timeWindows.avatarUploadStart).slice(5)}</span>
                    <span>领证 {formatDateDisplay(act.timeWindows.badgeClaimStart).slice(5)}</span>
                    <span>赠票 {formatDateDisplay(act.timeWindows.giftSelfClaimEnd).slice(5)}</span>
                  </div>
                </div>

                {/* Right: Single-Row Action Strip */}
                <div className="flex flex-wrap md:flex-nowrap items-center justify-end gap-1.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-900/[0.06]">
                  <GlassButton
                    size="sm"
                    variant={isCurrent ? 'secondary' : 'primary'}
                    onClick={() => selectActivity(act.id)}
                  >
                    {isCurrent ? '当前活动' : '切换'}
                  </GlassButton>
                  <GlassButton size="sm" variant="secondary" onClick={() => openEdit(act)}>
                    <Edit3 className="w-3.5 h-3.5" />
                    编辑
                  </GlassButton>
                  {act.status === 'active' && (
                    <GlassButton
                      size="sm"
                      variant="ghost"
                      onClick={() => handleStatusChange(act, 'paused')}
                    >
                      <PauseCircle className="w-3.5 h-3.5" />
                      暂停
                    </GlassButton>
                  )}
                  {act.status === 'paused' && (
                    <GlassButton
                      size="sm"
                      variant="ghost"
                      onClick={() => handleStatusChange(act, 'active')}
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      恢复
                    </GlassButton>
                  )}
                  {act.status !== 'archived' && (
                    <GlassButton
                      size="sm"
                      variant="ghost"
                      onClick={() => handleStatusChange(act, 'archived')}
                    >
                      <Archive className="w-3.5 h-3.5" />
                      归档
                    </GlassButton>
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <GlassDialog
        open={dialogOpen}
        title={editing ? `编辑活动：${editing.name}` : '创建新活动'}
        onClose={() => {
          setHasUnsavedChanges(false);
          setDialogOpen(false);
        }}
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GlassInput
              label="活动名称"
              required
              value={form.name}
              onChange={(e) => {
                setHasUnsavedChanges(true);
                setForm({ ...form, name: e.target.value });
              }}
              placeholder="例如：2027 萤火虫成都站"
            />
            <GlassInput
              label="活动编码"
              numeric
              required
              value={form.code}
              onChange={(e) => {
                setHasUnsavedChanges(true);
                setForm({ ...form, code: e.target.value });
              }}
            />
            <GlassInput
              label="活动地点"
              required
              value={form.location}
              onChange={(e) => {
                setHasUnsavedChanges(true);
                setForm({ ...form, location: e.target.value });
              }}
              placeholder="例如：成都世纪城新国际会展中心"
            />
            <GlassSelect
              label="活动时区"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              options={[
                { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+8)' },
                { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (UTC+8)' },
                { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
                { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
              ]}
            />
            <GlassDatePicker
              label="活动开始日期和时间"
              required
              value={form.startAt}
              onChange={(v) => setForm({ ...form, startAt: v })}
            />
            <GlassDatePicker
              label="活动结束日期和时间"
              required
              value={form.endAt}
              onChange={(v) => setForm({ ...form, endAt: v })}
            />
            <GlassSelect
              label="默认展商入口链接模式"
              value={form.defaultEntryMode}
              onChange={(e) =>
                setForm({ ...form, defaultEntryMode: e.target.value as EntryLinkMode })
              }
              options={[
                { value: 'B_UNIFIED', label: '模式 B：活动统一链接 + 独立商务密码' },
                { value: 'A_INDEPENDENT', label: '模式 A：每展商独立链接 + 独立商务密码' },
              ]}
            />
            <GlassSelect
              label="活动封面"
              value={form.coverUrl}
              onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
              options={[
                { value: ASSET_PATHS.coverGuangzhou, label: '现代玻璃会展中庭（广州馆）' },
                { value: ASSET_PATHS.coverShanghai, label: '晨曦艺术展馆（上海馆）' },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-700">活动说明</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="glass-input p-3 text-sm text-slate-900"
              placeholder="简要说明本届展会规模与注意事项..."
            />
          </div>

          <div className="pt-4 border-t border-slate-900/[0.08] space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">业务时间窗口配置</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <GlassDatePicker
                label="展商资料登记开始时间"
                value={form.timeWindows.exhibitorRegisterStart}
                onChange={(v) =>
                  setForm({
                    ...form,
                    timeWindows: { ...form.timeWindows, exhibitorRegisterStart: v },
                  })
                }
              />
              <GlassDatePicker
                label="展商资料登记截止时间"
                value={form.timeWindows.exhibitorRegisterEnd}
                onChange={(v) =>
                  setForm({
                    ...form,
                    timeWindows: { ...form.timeWindows, exhibitorRegisterEnd: v },
                  })
                }
              />
              <GlassDatePicker
                label="证件头像补充开放时间"
                value={form.timeWindows.avatarUploadStart}
                onChange={(v) =>
                  setForm({
                    ...form,
                    timeWindows: { ...form.timeWindows, avatarUploadStart: v },
                  })
                }
              />
              <GlassDatePicker
                label="证件头像补充截止时间"
                value={form.timeWindows.avatarUploadEnd}
                onChange={(v) =>
                  setForm({
                    ...form,
                    timeWindows: { ...form.timeWindows, avatarUploadEnd: v },
                  })
                }
              />
              <GlassDatePicker
                label="证件领取开始时间"
                value={form.timeWindows.badgeClaimStart}
                onChange={(v) =>
                  setForm({
                    ...form,
                    timeWindows: { ...form.timeWindows, badgeClaimStart: v },
                  })
                }
              />
              <GlassDatePicker
                label="证件领取截止时间"
                value={form.timeWindows.badgeClaimEnd}
                onChange={(v) =>
                  setForm({
                    ...form,
                    timeWindows: { ...form.timeWindows, badgeClaimEnd: v },
                  })
                }
              />
              <GlassDatePicker
                label="自助赠票开放时间"
                value={form.timeWindows.giftSelfClaimStart}
                onChange={(v) =>
                  setForm({
                    ...form,
                    timeWindows: { ...form.timeWindows, giftSelfClaimStart: v },
                  })
                }
              />
              <GlassDatePicker
                label="自助赠票截止时间"
                value={form.timeWindows.giftSelfClaimEnd}
                onChange={(v) =>
                  setForm({
                    ...form,
                    timeWindows: { ...form.timeWindows, giftSelfClaimEnd: v },
                  })
                }
              />
              <GlassDatePicker
                label="后台赠票登记截止时间"
                value={form.timeWindows.giftBackendIssueEnd}
                onChange={(v) =>
                  setForm({
                    ...form,
                    timeWindows: { ...form.timeWindows, giftBackendIssueEnd: v },
                  })
                }
              />
              <GlassDatePicker
                label="现场加证开放时间"
                value={form.timeWindows.onsiteExtraStart}
                onChange={(v) =>
                  setForm({
                    ...form,
                    timeWindows: { ...form.timeWindows, onsiteExtraStart: v },
                  })
                }
              />
              <GlassDatePicker
                label="现场核销有效开始时间"
                value={form.timeWindows.redemptionValidStart}
                onChange={(v) =>
                  setForm({
                    ...form,
                    timeWindows: { ...form.timeWindows, redemptionValidStart: v },
                  })
                }
              />
              <GlassDatePicker
                label="现场核销有效截止时间"
                value={form.timeWindows.redemptionValidEnd}
                onChange={(v) =>
                  setForm({
                    ...form,
                    timeWindows: { ...form.timeWindows, redemptionValidEnd: v },
                  })
                }
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <GlassButton
              variant="secondary"
              onClick={() => {
                setHasUnsavedChanges(false);
                setDialogOpen(false);
              }}
            >
              取消
            </GlassButton>
            <GlassButton type="submit" variant="primary" loading={saving}>
              {editing ? '保存修改' : '确认创建活动'}
            </GlassButton>
          </div>
        </form>
      </GlassDialog>
    </PageContainer>
  );
}
