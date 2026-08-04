import { useState } from 'react';
import { useAdminQueues, type Queue, type DistAlgo } from '@/hooks/admin/useAdminQueues';
import { QueueEditDialog } from './queues/QueueEditDialog';
import { QueueCard } from './queues/QueueCard';
import { QueueMembersDialog } from './queues/QueueMembersDialog';

// FILAS-04: routing rules de fila (zapp.queue_routing_rules) ainda não têm
// consumidor front/edge — a feature só existe no nível canal
// (ChannelRoutingRules/useChannelRoutingRules → channel_routing_rules).
// TODO: criar seção "Regras de Roteamento" por fila aqui na AdminQueuesPage
// quando existir consumidor (edge/backend) para queue_routing_rules.

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
    toggleQueuePause,
    addQueueMember,
    removeQueueMember,
    linkChannelToQueue,
    unlinkChannelFromQueue,
    addQueueSkill,
    removeQueueSkill,
  } = useAdminQueues();

  const [editing, setEditing] = useState<Partial<Queue> | null>(null);
  const [memberDialog, setMemberDialog] = useState<Queue | null>(null);
  const [newSkill, setNewSkill] = useState<{ name: string; level: number }>({
    name: '',
    level: 1,
  });
  const [newMemberId, setNewMemberId] = useState('');
  const [newChannelId, setNewChannelId] = useState('');

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
              color: 'bg-primary',
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
              onTogglePause={(q) => void toggleQueuePause(q)}
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
        onAddMember={() => {
          if (memberDialog) {
            void addQueueMember(memberDialog.id, newMemberId).then((ok) => {
              if (ok) setNewMemberId('');
            });
          }
        }}
        onRemoveMember={(id) => void removeQueueMember(id)}
        onLinkChannel={() => {
          if (memberDialog) {
            void linkChannelToQueue(memberDialog.id, newChannelId).then((ok) => {
              if (ok) setNewChannelId('');
            });
          }
        }}
        onUnlinkChannel={(channelId) => {
          if (memberDialog) void unlinkChannelFromQueue(memberDialog.id, channelId);
        }}
        onAddSkill={() => {
          if (memberDialog) {
            void addQueueSkill(memberDialog.id, newSkill.name.trim(), newSkill.level).then(
              (ok) => {
                if (ok) setNewSkill({ name: '', level: 1 });
              }
            );
          }
        }}
        onRemoveSkill={(id) => void removeQueueSkill(id)}
      />
    </div>
  );
}
