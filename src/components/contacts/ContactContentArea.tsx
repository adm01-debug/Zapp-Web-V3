// @ts-nocheck
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ContactEmptyState } from './ContactEmptyState';
import { ContactCard } from './ContactCard';
import { ContactListItem } from './ContactListItem';
import { ContactGroupedList } from './ContactGroupedList';
import { ContactsTable } from './ContactsTable';
import { ContactsTableVirtual } from './ContactsTableVirtual';
import { ContactKanbanView } from './ContactKanbanView';
import { ContactMapView } from './ContactMapView';
import { ContactAnalyticsDashboard } from './ContactAnalyticsDashboard';
import { ContactsSkeleton } from './ContactsSkeleton';
import type { ContactViewMode } from './ContactViewSwitcher';
import DuplicateContactsPanel from './DuplicateContactsPanel';
import ContactRecycleBin from './ContactRecycleBin';

const GRID_COLUMNS_CLASS: Record<number, string> = {
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6',
};

import type { Contact } from './types';
import type { CRMBatchResult } from '@/hooks/useExternalContact360Batch';

interface ContactContentAreaProps {
  loading: boolean;
  contacts: Contact[];
  viewMode: ContactViewMode;
  activeTab?: string;
  gridColumns: number;
  groupByCompany: boolean;
  selectedIds: string[];
  search: string;
  activeFiltersCount: number;
  onToggleSelect: (id: string, selected: boolean) => void;
  onContactClick: (id: string) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  onSelectIds: (ids: string[]) => void;
  onAddContact: () => void;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
  onImport: () => void;
  getCRMData: (phone: string) => CRMBatchResult | null;
  workspaceId?: string;
  onRefresh?: () => void;
}

export function ContactContentArea({
  loading, contacts, viewMode, activeTab, gridColumns, groupByCompany,
  selectedIds, search, activeFiltersCount,
  onToggleSelect, onContactClick, onEdit, onDelete, onSelectIds,
  onAddContact, onClearSearch, onClearFilters, onImport, getCRMData,
  workspaceId, onRefresh,
}: ContactContentAreaProps) {
  if (activeTab === 'duplicates') {
    return (
      <Card className="border-warning/20">
        <CardContent className="p-6">
          <DuplicateContactsPanel 
            workspaceId={workspaceId || 'wpp2'} 
            onMergeComplete={onRefresh} 
          />
        </CardContent>
      </Card>
    );
  }

  if (activeTab === 'trash') {
    return (
      <Card className="border-destructive/20">
        <CardContent className="p-6">
          <ContactRecycleBin 
            workspaceId={workspaceId || 'wpp2'} 
            onRestored={onRefresh} 
          />
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return <ContactsSkeleton viewMode={viewMode} gridColumns={gridColumns} />;
  }

  if (contacts.length === 0) {
    return (
      <Card><CardContent className="p-0">
        <ContactEmptyState
          type={search ? 'no-results' : activeFiltersCount > 0 ? 'filtered-empty' : 'no-contacts'}
          searchQuery={search}
          activeFilters={activeFiltersCount}
          onAddContact={onAddContact}
          onClearSearch={search ? onClearSearch : undefined}
          onClearFilters={activeFiltersCount > 0 ? onClearFilters : undefined}
          onImport={onImport}
        />
      </CardContent></Card>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className={cn("grid gap-4", GRID_COLUMNS_CLASS[gridColumns] || GRID_COLUMNS_CLASS[4])}>
        {contacts.map((contact, index) => (
          <ContactCard
            key={contact.id} contact={contact}
            isSelected={selectedIds.includes(contact.id)}
            onToggleSelect={onToggleSelect}
            onOpenChat={onContactClick}
            onEdit={onEdit} onDelete={onDelete} index={index}
            companyLogo={getCRMData(contact.phone)?.logo_url}
            companyName={getCRMData(contact.phone)?.company_name}
            searchQuery={search}
          />
        ))}
      </div>
    );
  }

  if (viewMode === 'list') {
    if (groupByCompany) {
      return (
        <ContactGroupedList
          contacts={contacts} selectedIds={selectedIds}
          onToggleSelect={onToggleSelect} onOpenChat={onContactClick}
          onEdit={onEdit} onDelete={onDelete}
          getCRMData={getCRMData} searchQuery={search}
        />
      );
    }
    return (
      <div className="space-y-2">
        {contacts.map((contact, index) => (
          <ContactListItem
            key={contact.id} contact={contact}
            isSelected={selectedIds.includes(contact.id)}
            onToggleSelect={onToggleSelect}
            onOpenChat={onContactClick}
            onEdit={onEdit} onDelete={onDelete} index={index}
            companyLogo={getCRMData(contact.phone)?.logo_url}
            companyName={getCRMData(contact.phone)?.company_name}
            searchQuery={search}
          />
        ))}
      </div>
    );
  }

  if (viewMode === 'kanban') return <ContactKanbanView contacts={contacts} onContactClick={onContactClick} />;
  if (viewMode === 'map') return <ContactMapView contacts={contacts} onContactClick={onContactClick} />;
  if (viewMode === 'analytics') return <ContactAnalyticsDashboard contacts={contacts} />;

  return (
    <Card className="border-border/30 shadow-sm overflow-hidden bg-card">
      <CardContent className="p-0">
        {contacts.length > 50 ? (
          <ContactsTableVirtual
            contacts={contacts}
            selectedIds={selectedIds}
            onSelectIds={onSelectIds}
            onOpenChat={onContactClick}
            onEdit={onEdit}
            onDelete={onDelete}
            getCRMData={getCRMData}
            searchQuery={search}
          />
        ) : (
          <ContactsTable
            contacts={contacts}
            selectedIds={selectedIds}
            onSelectIds={onSelectIds}
            onOpenChat={onContactClick}
            onEdit={onEdit}
            onDelete={onDelete}
            getCRMData={getCRMData}
            searchQuery={search}
          />
        )}
      </CardContent>
    </Card>
  );
}
