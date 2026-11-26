import React, { useEffect, useState } from 'react';
import { Calendar, IdCard, Search, Store, Ticket } from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import { GlassDialog } from '../glass/GlassOverlay';
import { getApiClient } from '../../services/api';
import type { Exhibitor, ExhibitorMember, GiftTicket } from '../../types/domain';

export function GlobalSearchModal() {
  const {
    globalSearchOpen,
    setGlobalSearchOpen,
    activeActivityId,
    activities,
    selectActivity,
    navigateAdmin,
  } = useApp();
  const [query, setQuery] = useState('');
  const [exhibitors, setExhibitors] = useState<Exhibitor[]>([]);
  const [members, setMembers] = useState<ExhibitorMember[]>([]);
  const [tickets, setTickets] = useState<GiftTicket[]>([]);

  useEffect(() => {
    if (!globalSearchOpen) return;
    const actId = activeActivityId === 'ALL' ? activities[0]?.id : activeActivityId;
    if (!actId) return;
    const api = getApiClient();
    Promise.all([
      api.exhibitors.list(actId, query),
      api.members.list(actId, { search: query }),
      api.tickets.listTickets(actId, { search: query }),
    ])
      .then(([ex, mem, gt]) => {
        setExhibitors(ex.slice(0, 5));
        setMembers(mem.slice(0, 5));
        setTickets(gt.slice(0, 5));
      })
      .catch(() => {});
  }, [globalSearchOpen, query, activeActivityId, activities]);

  const matchedActivities = activities.filter((a) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return a.name.toLowerCase().includes(q) || a.location.toLowerCase().includes(q);
  });

  return (
    <GlassDialog
      open={globalSearchOpen}
      title="全局检索"
      onClose={() => setGlobalSearchOpen(false)}
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入摊位号（如 A01）、姓名、人员编号或赠票号..."
            className="glass-input h-[42px] pl-10 pr-4 text-sm w-full"
          />
        </div>

        <div className="space-y-4 max-h-[55dvh] overflow-y-auto">
          {matchedActivities.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> 活动列表
              </p>
              {matchedActivities.map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={async () => {
                    await selectActivity(act.id);
                    setGlobalSearchOpen(false);
                    navigateAdmin('dashboard');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-900/[0.05] flex items-center justify-between text-sm cursor-pointer"
                >
                  <span className="font-medium text-slate-900">{act.name}</span>
                  <span className="text-xs text-slate-500">{act.location}</span>
                </button>
              ))}
            </div>
          )}

          {exhibitors.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5" /> 当前活动展商
              </p>
              {exhibitors.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => {
                    setGlobalSearchOpen(false);
                    navigateAdmin('exhibitors');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-900/[0.05] flex items-center justify-between text-sm cursor-pointer"
                >
                  <span className="font-medium text-slate-900">
                    <span className="numeric-text text-[#0071e3] mr-2">{ex.boothNumber}</span>
                    {ex.boothName}
                  </span>
                  <span className="text-xs text-slate-500">主联系人：{ex.primaryContactName}</span>
                </button>
              ))}
            </div>
          )}

          {members.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <IdCard className="w-3.5 h-3.5" /> 当前活动证件人员
              </p>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setGlobalSearchOpen(false);
                    navigateAdmin('certificates');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-900/[0.05] flex items-center justify-between text-sm cursor-pointer"
                >
                  <span className="font-medium text-slate-900">
                    <span className="numeric-text text-[#0071e3] mr-2">{m.memberCode}</span>
                    {m.name}
                  </span>
                  <span className="text-xs text-slate-500">{m.boothNumber} 展位</span>
                </button>
              ))}
            </div>
          )}

          {tickets.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5" /> 当前活动独立赠票
              </p>
              {tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setGlobalSearchOpen(false);
                    navigateAdmin('gifts');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-900/[0.05] flex items-center justify-between text-sm cursor-pointer"
                >
                  <span className="font-medium text-slate-900">
                    <span className="numeric-text text-[#0071e3] mr-2">{t.ticketCode}</span>
                    {t.name}
                  </span>
                  <span className="text-xs text-slate-500 date-number">{t.useDate}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </GlassDialog>
  );
}
