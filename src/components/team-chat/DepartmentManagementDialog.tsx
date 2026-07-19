import { useState } from 'react';
import { useDepartmentManagement } from '@/hooks/team-chat/useDepartmentManagement';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DepartmentMembersView } from './department-management/DepartmentMembersView';
import { DepartmentInvitesView } from './department-management/DepartmentInvitesView';
import { DepartmentWhatsAppView } from './department-management/DepartmentWhatsAppView';
import { DepartmentAuditView } from './department-management/DepartmentAuditView';

interface Department {
  id: string;
  name: string;
}

interface Props {
  department: Department;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type View = 'members' | 'audit' | 'invites' | 'whatsapp';

const VIEWS: { key: View; label: string }[] = [
  { key: 'members', label: 'Membros' },
  { key: 'invites', label: 'Convites' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'audit', label: 'Auditoria' },
];

/** Department Management Dialog component for the team chat section. */
export function DepartmentManagementDialog({
  department: initialDepartment,
  open,
  onOpenChange,
}: Props) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('members');

  const {
    department,
    allProfiles,
    auditLogs,
    invitations,
    createInviteMutation,
    deleteInviteMutation,
    updateWhatsappMutation,
    manageMemberMutation,
    whatsappMode,
    setWhatsappMode,
    whatsappApiKey,
    setWhatsappApiKey,
    whatsappInstanceId,
    setWhatsappInstanceId,
  } = useDepartmentManagement(initialDepartment, open, view);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2">
              Gerenciar Departamento: {department.name}
            </DialogTitle>
            <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
              {VIEWS.map(({ key, label }) => (
                <Button
                  key={key}
                  variant={view === key ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setView(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 flex-col overflow-hidden">
          {view === 'members' && (
            <DepartmentMembersView
              departmentId={department.id}
              allProfiles={allProfiles}
              search={search}
              onSearchChange={setSearch}
              manageMemberMutation={manageMemberMutation}
            />
          )}
          {view === 'invites' && (
            <DepartmentInvitesView
              invitations={invitations}
              createInviteMutation={createInviteMutation}
              deleteInviteMutation={deleteInviteMutation}
            />
          )}
          {view === 'whatsapp' && (
            <DepartmentWhatsAppView
              whatsappMode={whatsappMode}
              setWhatsappMode={setWhatsappMode}
              whatsappApiKey={whatsappApiKey}
              setWhatsappApiKey={setWhatsappApiKey}
              whatsappInstanceId={whatsappInstanceId}
              setWhatsappInstanceId={setWhatsappInstanceId}
              updateWhatsappMutation={updateWhatsappMutation}
            />
          )}
          {view === 'audit' && (
            <DepartmentAuditView auditLogs={auditLogs} departmentName={department.name} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
