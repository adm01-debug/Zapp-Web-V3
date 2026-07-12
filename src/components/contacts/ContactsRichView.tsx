/**
 * ContactsRichView.tsx — ZAPP WEB
 *
 * Tela rica de Contatos: KPIs + Aniversários + Abas por tipo + Toolbar
 * (Filtros, Filtros Salvos, Agrupar) + ContentArea com 6 visualizações
 * (Grid / Lista / Tabela / Pipeline / Mapa / Analytics).
 *
 * Orquestra: `useContactsViewState` + subcomponentes extraídos
 * (`ContactsRichHeader`, `ContactsRichTabs`, `ContactsBulkActionBar`,
 * `ContactsShortcutHelp`) + hook `useContactsKeyboardShortcuts`.
 */
import React, { useMemo, useState, useCallback } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ACTIVE_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';

import { useContactsViewState } from './useContactsViewState';
import { ContactToolbar } from './ContactToolbar';
import { ContactContentArea } from './ContactContentArea';
import { ContactDialogs } from './ContactDialogs';
import { ContactImportDialog } from './ContactImportDialog';
import { ContactQuickView } from './ContactQuickView';
import { ContactsRichHeader } from './ContactsRichHeader';
import { ContactsRichTabs } from './ContactsRichTabs';
import { ContactsBulkActionBar } from './ContactsBulkActionBar';
import { ContactsShortcutHelp } from './ContactsShortcutHelp';
import { useContactsKeyboardShortcuts } from './useContactsKeyboardShortcuts';
import type { Contact } from './types';

interface ContactsRichViewProps {
  /** Mantido por compatibilidade com a rota; não usado internamente. */
  instanceName?: string;
  onOpenChat?: (remoteJid: string, contactName: string) => void;
}

export const ContactsRichView: React.FC<ContactsRichViewProps> = ({ onOpenChat }) => {
  const state = useContactsViewState();
  const { crud, highContrast, setHighContrast } = state;

  const {
    contacts,
    totalCount,
    loading,
    contactCountByType,
    uniqueCompanies,
    uniqueJobTitles,
    uniqueTags,
    searchInput,
    handleSearchChange,
    clearSearch,
    activeTab,
    setActiveTab,
    filterCompany,
    setFilterCompany,
    filterJobTitle,
    setFilterJobTitle,
    filterTag,
    setFilterTag,
    filterDateRange,
    setFilterDateRange,
    sortBy,
    setSortBy,
    activeFiltersCount,
    clearFilters,
    showFilters,
    setShowFilters,
    selectedIds,
    openContactChat,
    isAddDialogOpen,
    setIsAddDialogOpen,
    isEditDialogOpen,
    setIsEditDialogOpen,
    editingContact,
    handleEditContact: _handleEditContact,
    openEditDialog,
    showSuccess,
    setShowSuccess,
    deleteTarget,
    setDeleteTarget,
    handleDeleteContact,
  } = crud;

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [quickViewContact, setQuickViewContact] = useState<Contact | null>(null);

  useContactsKeyboardShortcuts({
    setIsAddDialogOpen,
    setViewMode: state.setViewMode,
    setShowShortcutHelp,
    onCloseShortcutHelp: () => setShowShortcutHelp(false),
  });

  // Stub de CRM batch
  const getCRMData = (_phone: string) => null;

  const contactsForContent: Contact[] = useMemo(() => (contacts as Contact[]) ?? [], [contacts]);

  const handleContactClick = useCallback(
    (contactId: string) => {
      const contact = contactsForContent.find((c) => c.id === contactId);
      if (contact) setQuickViewContact(contact);
    },
    [contactsForContent]
  );

  const contactsForStats = useMemo(
    () => contactsForContent.map((c) => ({ created_at: c.created_at })),
    [contactsForContent]
  );

  const contactsForBirthday = useMemo(
    () =>
      contactsForContent.map((c) => ({
        id: c.id,
        name: c.name,
        avatar_url: c.avatar_url,
        birthday: null as string | null,
      })),
    [contactsForContent]
  );

  const handleDeleteMany = useCallback(
    (ids: string[]) => {
      ids.forEach((id) => handleDeleteContact(id));
    },
    [handleDeleteContact]
  );

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-y-auto bg-background transition-all duration-300',
        highContrast && 'high-contrast-mode'
      )}
    >
      <div className="mx-auto w-full max-w-[1600px] space-y-4 px-4 py-4 lg:px-6">
        <ContactsRichHeader
          totalCount={totalCount}
          contactCountByType={contactCountByType}
          uniqueCompanies={uniqueCompanies as string[]}
          contactsForStats={contactsForStats}
          contactsForBirthday={contactsForBirthday}
          highContrast={highContrast}
          onToggleHighContrast={() => setHighContrast(!highContrast)}
          onOpenShortcuts={() => setShowShortcutHelp(true)}
          onOpenImport={() => setIsImportOpen(true)}
          onOpenAdd={() => setIsAddDialogOpen(true)}
          onBirthdayContactClick={openContactChat}
        />

        <ContactsRichTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          totalCount={totalCount}
          contactCountByType={contactCountByType}
        />

        <ContactToolbar
          searchInput={searchInput}
          onSearchChange={handleSearchChange}
          sortBy={sortBy}
          setSortBy={setSortBy}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          activeFiltersCount={activeFiltersCount}
          clearFilters={clearFilters}
          activeTab={activeTab}
          filterCompany={filterCompany}
          setFilterCompany={setFilterCompany}
          filterJobTitle={filterJobTitle}
          setFilterJobTitle={setFilterJobTitle}
          filterTag={filterTag}
          setFilterTag={setFilterTag}
          filterDateRange={filterDateRange}
          setFilterDateRange={setFilterDateRange}
          uniqueCompanies={uniqueCompanies as string[]}
          uniqueJobTitles={uniqueJobTitles as string[]}
          uniqueTags={uniqueTags as string[]}
          onApplyPreset={state.handleApplyPreset}
          groupByCompany={state.groupByCompany}
          setGroupByCompany={state.setGroupByCompany}
          selectedIds={selectedIds}
          onBulkTag={() => state.setIsBulkTagOpen(true)}
          onCompare={() => state.setIsCompareOpen(true)}
          onMerge={() => state.setIsMergeOpen(true)}
          viewMode={state.viewMode}
          setViewMode={state.setViewMode}
          gridColumns={state.gridColumns}
          setGridColumns={state.setGridColumns}
          totalCount={totalCount}
        />

        <LayoutGroup>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="relative"
          >
            <ContactContentArea
              loading={loading}
              contacts={contactsForContent}
              viewMode={state.viewMode}
              activeTab={activeTab}
              gridColumns={state.gridColumns}
              groupByCompany={state.groupByCompany}
              selectedIds={selectedIds}
              search={searchInput}
              activeFiltersCount={activeFiltersCount}
              onToggleSelect={state.handleToggleSelect}
              onContactClick={handleContactClick}
              onEdit={(c) => openEditDialog(c)}
              onDelete={(c) => setDeleteTarget(c)}
              onSelectIds={crud.setSelectedIds}
              onAddContact={() => setIsAddDialogOpen(true)}
              onClearSearch={clearSearch}
              onClearFilters={clearFilters}
              onImport={() => setIsImportOpen(true)}
              getCRMData={getCRMData}
              workspaceId={ACTIVE_WHATSAPP_INSTANCE}
              onRefresh={() => crud.refetch()}
            />

            <ContactsBulkActionBar
              selectedIds={selectedIds}
              onBulkTag={() => state.setIsBulkTagOpen(true)}
              onMerge={() => state.setIsMergeOpen(true)}
              onExportCSV={() => state.handleExportCSV()}
              onDeleteMany={handleDeleteMany}
              onClear={() => crud.setSelectedIds([])}
            />
          </motion.div>
        </LayoutGroup>
      </div>

      <ContactsShortcutHelp open={showShortcutHelp} onClose={() => setShowShortcutHelp(false)} />

      <ContactDialogs
        workspaceId={ACTIVE_WHATSAPP_INSTANCE}
        isAddDialogOpen={isAddDialogOpen}
        setIsAddDialogOpen={setIsAddDialogOpen}
        onContactSaved={() => crud.refetch()}
        isEditDialogOpen={isEditDialogOpen}
        setIsEditDialogOpen={setIsEditDialogOpen}
        editingContact={editingContact}
        showSuccess={showSuccess}
        setShowSuccess={setShowSuccess}
        deleteTarget={deleteTarget}
        setDeleteTarget={setDeleteTarget}
        handleDeleteContact={handleDeleteContact}
      />

      <ContactImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        workspaceId={ACTIVE_WHATSAPP_INSTANCE}
        onImportComplete={() => crud.refetch()}
      />

      <ContactQuickView
        contact={quickViewContact}
        isOpen={!!quickViewContact}
        onClose={() => setQuickViewContact(null)}
        onEdit={(c) => {
          setQuickViewContact(null);
          openEditDialog(c);
        }}
        onDelete={(c) => {
          setQuickViewContact(null);
          setDeleteTarget(c);
        }}
        onOpenChat={(phone) => {
          setQuickViewContact(null);
          // FIX B7: honrar override do consumidor da view quando disponível.
          if (onOpenChat) onOpenChat(phone, quickViewContact?.name ?? '');
          else openContactChat(phone);
        }}
      />
    </div>
  );
};

export default ContactsRichView;
