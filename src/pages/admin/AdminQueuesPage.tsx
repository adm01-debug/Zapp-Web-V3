import { useState } from 'react';
import { toast } from 'sonner';
import { useAdminQueues, type Queue, type DistAlgo } from '@/hooks/admin/useAdminQueues';
import { QueueEditDialog } from './queues/QueueEditDialog';
import { QueueCard } from './queues/QueueCard';
import { QueueMembersDialog } from './queues/QueueMembersDialog';

const NOT_IMPLEMENTED = 'Ação indisponível nesta versão. Em breve.';

/** Admin Queues Page. */
export default function AdminQueuesPage() {
  const {
    queues,
    members,
    skills,
    profiles,
    departments,
    channels,
    channelQueues,
    loading,
    save,
    remove,
  } = useAdminQueues();

  const [editing, setEditing] = useState<Partial<Queue> | null>(null);
  const [memberDialog, setMemberDialog] = useState<Queue | null>(null);
  const [newSkill, setNewSkill] = useState<{ name: string; level: number }>({
    name: '',
    level: 1,
  });
  const [newMemberId, setNewMemberId] = useState('');
  const [newChannelId, setNewChannelId] = useState('');

  const notImplemented = () => toast.info(NOT_IMPLEMENTED);

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Filas de Atendimento</h1>
          <p className="text-muted-foreground">
            Capacidade, status, distribuição e vínculo a canais de atendimento.
          </p>
        </div>
        <QueueEditDialog
          open={!!editing}
          editing={editing}
          queues={queues}
          departments={departments}
          onNew={() =>
            setEditing({
              is_active: true,
              color: '#3B82F6',
              priority: 0,
              max_wait_time_minutes: 30,
              status: 'active' as Queue['status'],
              distribution_algorithm: 'least_busy' as DistAlgo,
            })
          }
          onClose={() => setEditing(null)}
          onChange={(q) => setEditing(q)}
          onSave={() => {
            void save(editing as Queue | null).then((ok) => {
              if (ok) setEditing(null);
            });
          }}
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid gap-4">
          {queues.map((q) => (
            <QueueCard
              key={q.id}
              queue={q}
              members={members}
              skills={skills}
              channelQueues={channelQueues}
              channels={channels}
              onTogglePause={notImplemented}
              onEdit={setEditing}
              onRemove={(id) => void remove(id)}
              onMembers={setMemberDialog}
            />
          ))}
          {queues.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">Nenhuma fila criada.</p>
          )}
        </div>
      )}

      <QueueMembersDialog
        memberDialog={memberDialog}
        members={members}
        profiles={profiles}
        channels={channels}
        channelQueues={channelQueues}
        skills={skills}
        newMemberId={newMemberId}
        setNewMemberId={setNewMemberId}
        newChannelId={newChannelId}
        setNewChannelId={setNewChannelId}
        newSkill={newSkill}
        setNewSkill={setNewSkill}
        onClose={() => setMemberDialog(null)}
        onAddMember={notImplemented}
        onRemoveMember={notImplemented}
        onLinkChannel={notImplemented}
        onUnlinkChannel={notImplemented}
        onAddSkill={notImplemented}
        onRemoveSkill={notImplemented}
      />
    </div>
  );
}
