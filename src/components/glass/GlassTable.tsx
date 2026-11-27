import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from 'lucide-react';
import { EmptyState, GlassButton, LoadingState } from './GlassPrimitives';

export interface GlassTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function GlassTable<T extends { id: string }>({
  rows,
  columns,
  loading = false,
  searchable = true,
  searchPlaceholder = '搜索关键词...',
  searchValue,
  onSearchChange,
  filterSlot,
  headerActions,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  batchActions,
  onExportCsv,
  exportLabel = '导出 CSV',
  emptyTitle = '暂无数据',
  emptyDescription = '当前没有符合条件的记录',
  emptyAction,
  pageSize = 10,
}: {
  rows: T[];
  columns: GlassTableColumn<T>[];
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  filterSlot?: React.ReactNode;
  headerActions?: React.ReactNode;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  batchActions?: React.ReactNode;
  onExportCsv?: () => void;
  exportLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  pageSize?: number;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, columns, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, safePage, pageSize]);

  const allOnPageSelected =
    selectable &&
    pagedRows.length > 0 &&
    pagedRows.every((r) => selectedIds.includes(r.id));

  const toggleAllOnPage = () => {
    if (!onSelectionChange) return;
    if (allOnPageSelected) {
      const pageIdSet = new Set(pagedRows.map((r) => r.id));
      onSelectionChange(selectedIds.filter((id) => !pageIdSet.has(id)));
    } else {
      const merged = new Set([...selectedIds, ...pagedRows.map((r) => r.id)]);
      onSelectionChange(Array.from(merged));
    }
  };

  const toggleRow = (id: string) => {
    if (!onSelectionChange) return;
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="glass-surface w-full min-w-0 overflow-hidden">
      {(searchable || filterSlot || headerActions || onExportCsv || (selectedIds.length > 0 && batchActions)) && (
        <div className="p-4 border-b border-slate-900/[0.06] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
            {searchable && onSearchChange && (
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchValue ?? ''}
                  onChange={(e) => {
                    onSearchChange(e.target.value);
                    setPage(1);
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="glass-input h-[36px] pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 w-full"
                />
              </div>
            )}
            {filterSlot}
          </div>
          <div className="flex items-center flex-wrap gap-2 shrink-0">
            {selectedIds.length > 0 && batchActions && (
              <div className="flex items-center gap-2 mr-1">
                <span className="text-xs text-slate-600 numeric-text">
                  已选 {selectedIds.length} 项
                </span>
                {batchActions}
              </div>
            )}
            {onExportCsv && (
              <GlassButton size="sm" variant="secondary" onClick={onExportCsv}>
                <Download className="w-3.5 h-3.5" />
                {exportLabel}
              </GlassButton>
            )}
            {headerActions}
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-4">
          <LoadingState rows={5} />
        </div>
      ) : pagedRows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <>
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-900/[0.07] bg-white/40">
                  {selectable && (
                    <th className="py-3 pl-4 pr-2 w-10">
                      <input
                        type="checkbox"
                        aria-label="全选当前页"
                        checked={allOnPageSelected}
                        onChange={toggleAllOnPage}
                        className="w-4 h-4 rounded accent-[#0071e3] cursor-pointer"
                      />
                    </th>
                  )}
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`py-3 px-4 text-xs font-semibold text-slate-600 whitespace-nowrap ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                      } ${col.className ?? ''}`}
                    >
                      {col.sortable && col.sortValue ? (
                        <button
                          type="button"
                          onClick={() => handleSort(col.key)}
                          className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                        >
                          <span>{col.header}</span>
                          {sortKey !== col.key ? (
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          ) : sortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-[#0071e3]" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-[#0071e3]" />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/[0.05]">
                {pagedRows.map((row) => {
                  const checked = selectedIds.includes(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors hover:bg-white/60 ${checked ? 'bg-[#0071e3]/[0.05]' : ''}`}
                    >
                      {selectable && (
                        <td className="py-3 pl-4 pr-2">
                          <input
                            type="checkbox"
                            aria-label={`选择行 ${row.id}`}
                            checked={checked}
                            onChange={() => toggleRow(row.id)}
                            className="w-4 h-4 rounded accent-[#0071e3] cursor-pointer"
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={`py-3 px-4 text-sm text-slate-800 ${
                            col.align === 'right'
                              ? 'text-right'
                              : col.align === 'center'
                                ? 'text-center'
                                : 'text-left'
                          } ${col.className ?? ''}`}
                        >
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-slate-900/[0.06] bg-white/30 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <span className="numeric-text">
              共 {sortedRows.length} 条记录 · 第 {safePage} / {totalPages} 页
            </span>
            <div className="flex items-center gap-1.5">
              <GlassButton
                size="sm"
                variant="secondary"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </GlassButton>
              <GlassButton
                size="sm"
                variant="secondary"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </GlassButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
