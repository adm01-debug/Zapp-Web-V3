import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useContactsCRUD } from './useContactsCRUD';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { buildContactsCsv, buildExportFileName, EXPORT_DEFAULT_KEYS } from './contactExportFields';
import type { ContactViewMode } from './ContactViewSwitcher';
import type { FilterPreset } from './FilterPresets';

const log = getLogger('contactsExport');

/** use Contacts View State component for the contacts section. */
export function useContactsViewState() {
  const crud = useContactsCRUD();
  const {
    contacts: filteredContacts,
    searchInput,
    clearSearch,
    setActiveTab,
    setFilterCompany,
    setFilterJobTitle,
    setFilterTag,
    setFilterDateRange,
    selectedIds,
    setSelectedIds,
    setIsAddDialogOpen,
  } = crud;

  const [viewMode, setViewMode] = useState<ContactViewMode>(() => {
    return (localStorage.getItem('contacts-view-mode') as ContactViewMode) || 'grid';
  });
  const [highContrast, setHighContrast] = useState<boolean>(() => {
    return localStorage.getItem('contacts-high-contrast') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('contacts-view-mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('contacts-high-contrast', String(highContrast));
  }, [highContrast]);

  const [gridColumns, setGridColumns] = useState(4);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [groupByCompany, setGroupByCompany] = useState(false);
  const [isBulkTagOpen, setIsBulkTagOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [detailContact, setDetailContact] = useState<(typeof filteredContacts)[0] | null>(null);

  const handleApplyPreset = useCallback(
    (preset: FilterPreset) => {
      if (preset.filters.type) setActiveTab(preset.filters.type);
      if (preset.filters.company) setFilterCompany(preset.filters.company);
      if (preset.filters.jobTitle) setFilterJobTitle(preset.filters.jobTitle);
      if (preset.filters.tag) setFilterTag(preset.filters.tag);
      if (preset.filters.dateRange) setFilterDateRange(preset.filters.dateRange);
      toast.success(`Filtro "${preset.name}" aplicado`);
    },
    [setActiveTab, setFilterCompany, setFilterJobTitle, setFilterTag, setFilterDateRange]
  );

  const handleToggleSelect = useCallback(
    (id: string, selected: boolean) => {
      setSelectedIds((prev) => (selected ? [...prev, id] : prev.filter((i) => i !== id)));
    },
    [setSelectedIds]
  );

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.length === filteredContacts.length ? [] : filteredContacts.map((c) => c.id ?? '')
    );
  }, [filteredContacts, setSelectedIds]);

  const handleContactClick = useCallback(
    (id: string) => {
      const contact = filteredContacts.find((c) => c.id === id);
      if (contact) setDetailContact(contact);
    },
    [filteredContacts]
  );

  // CONTATOS-12: export client-side (não há RPC/edge de export no projeto —
  // grep rpc_export|contact_export em types.ts e migrations só encontra a
  // tabela contact_export_log). Melhorias desta iteração:
  //  1. seleção de campos (ContactExportDialog → handleExportCSV(fieldKeys))
  //  2. nome de arquivo com data+hora+contagem
  //  3. log em contact_export_log (mesma tabela usada pelo edge contacts-import
  //     como 'csv_import'). ⚠️ RLS: política auth_secure_189 é SELECT-only —
  //     sem INSERT o log falha silenciosamente (warn) até existir migration
  //     adicionando política de escrita.
  const handleExportCSV = useCallback(
    (fieldKeys: string[] = EXPORT_DEFAULT_KEYS) => {
      const csv = buildContactsCsv({ fields: fieldKeys, contacts: filteredContacts });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildExportFileName(filteredContacts.length);
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${filteredContacts.length} contatos exportados!`);

      void supabase.auth
        .getUser()
        .then(({ data }) =>
          supabase.from('contact_export_log').insert({
            user_id: data.user?.id ?? null,
            exported_by: data.user?.id ?? null,
            export_type: 'csv',
            row_count: filteredContacts.length,
            status: 'completed',
            filters: { exported_count: filteredContacts.length, fields: fieldKeys },
          })
        )
        .then(({ error: logError }) => {
          if (logError) log.warn('Failed to log contact export', logError.message);
        })
        .catch((err: unknown) => log.warn('Failed to log contact export', err));
    },
    [filteredContacts]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setIsAddDialogOpen(true);
      }
      if (e.key === 'Escape') {
        if (detailContact) {
          setDetailContact(null);
          return;
        }
        if (selectedIds.length > 0) {
          setSelectedIds([]);
        } else if (searchInput) {
          clearSearch();
        }
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === 'a' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        handleSelectAll();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    selectedIds.length,
    searchInput,
    clearSearch,
    setIsAddDialogOpen,
    setSelectedIds,
    handleSelectAll,
    detailContact,
  ]);

  return {
    crud,
    viewMode,
    setViewMode,
    highContrast,
    setHighContrast,
    gridColumns,
    setGridColumns,
    isImportOpen,
    setIsImportOpen,
    isMergeOpen,
    setIsMergeOpen,
    isCompareOpen,
    setIsCompareOpen,
    groupByCompany,
    setGroupByCompany,
    isBulkTagOpen,
    setIsBulkTagOpen,
    isExportOpen,
    setIsExportOpen,
    detailContact,
    setDetailContact,
    handleApplyPreset,
    handleToggleSelect,
    handleSelectAll,
    handleContactClick,
    handleExportCSV,
  };
}
