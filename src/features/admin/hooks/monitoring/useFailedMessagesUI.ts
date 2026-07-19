import { useState, useMemo } from 'react';
import { useFailedMessages, FailedMessageRow, FailedMessageStatus } from '@/features/admin';
import { RootCause } from '@/lib/failureRootCause';

/** Hook: use Failed Messages UI. */
export function useFailedMessagesUI() {
  const [hours, setHours] = useState(24);
  const [statusFilter, setStatusFilter] = useState<FailedMessageStatus | 'all'>('all');
  const [errorCodeFilter, setErrorCodeFilter] = useState<string>('all');
  const [rootCauseFilter, setRootCauseFilter] = useState<RootCause | 'all'>('all');
  const [instanceFilter, setInstanceFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [selected, setSelected] = useState<FailedMessageRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkAbandon, setConfirmBulkAbandon] = useState(false);
  const [bulkReason, setBulkReason] = useState('');
  const [guidedReprocessOpen, setGuidedReprocessOpen] = useState(false);

  const fromIso = customFrom ? new Date(customFrom).toISOString() : null;
  const toIso = customTo ? new Date(customTo).toISOString() : null;
  const useCustomRange = !!(fromIso && toIso);

  const api = useFailedMessages({
    hours: useCustomRange ? undefined : hours,
    status: statusFilter === 'all' ? null : statusFilter,
    errorCode: errorCodeFilter === 'all' ? null : errorCodeFilter,
    rootCause: rootCauseFilter === 'all' ? null : rootCauseFilter,
    instance: instanceFilter === 'all' ? null : instanceFilter,
    search,
    from: useCustomRange ? fromIso : null,
    to: useCustomRange ? toIso : null,
    page,
    pageSize,
  });

  const sortedRows = useMemo(
    () => [...api.rows].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [api.rows],
  );

  const toggleAll = () => {
    if (sortedRows.length > 0 && sortedRows.every((r) => selectedIds.has(r.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedRows.map((r) => r.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return {
    hours, setHours,
    statusFilter, setStatusFilter,
    errorCodeFilter, setErrorCodeFilter,
    rootCauseFilter, setRootCauseFilter,
    instanceFilter, setInstanceFilter,
    searchInput, setSearchInput,
    search, setSearch,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    page, setPage,
    pageSize,
    selected, setSelected,
    selectedIds, setSelectedIds,
    confirmBulkAbandon, setConfirmBulkAbandon,
    bulkReason, setBulkReason,
    guidedReprocessOpen, setGuidedReprocessOpen,
    useCustomRange,
    api,
    sortedRows,
    toggleAll,
    toggleOne,
  };
}
