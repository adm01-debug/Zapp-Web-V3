/* eslint-disable react-refresh/only-export-components */
import { motion } from 'framer-motion';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** INBOX_PERMISSIONS component. */
export const INBOX_PERMISSIONS = [
  {
    id: 'inbox.view_mine',
    label: 'Meus (Apenas as próprias)',
    description: 'O usuário vê apenas as conversas atribuídas a ele.',
  },
  {
    id: 'inbox.view_department',
    label: 'Departamento',
    description: 'O usuário vê todas as conversas do seu departamento.',
  },
  {
    id: 'inbox.view_all',
    label: 'Todos depts. (Empresa)',
    description: 'O usuário vê conversas de todos os departamentos da empresa.',
  },
];

/** CHANNEL_PERMISSIONS component. */
export const CHANNEL_PERMISSIONS = [
  { id: 'inbox.view_whatsapp', label: 'WhatsApp', icon: 'MessageSquare' },
  { id: 'inbox.view_instagram', label: 'Instagram', icon: 'Instagram' },
  { id: 'inbox.view_chat', label: 'Web Chat', icon: 'Globe' },
];

/** ROLES component. */
export const ROLES = [
  { id: 'admin', label: 'Administrador', color: 'text-destructive' },
  { id: 'manager', label: 'Gerente', color: 'text-warning' },
  { id: 'supervisor', label: 'Supervisor', color: 'text-info' },
  { id: 'agent', label: 'Agente', color: 'text-whatsapp' },
];

/** New Scope Form Props component. */
export interface NewScopeFormProps {
  newScope: { label: string; description: string; name: string };
  isSubmitting: boolean;
  onChangeScope: (scope: { label: string; description: string; name: string }) => void;
  onDiscard: () => void;
  onSubmit: () => void;
}

/** New Scope Form component. */
export function NewScopeForm({
  newScope,
  isSubmitting,
  onChangeScope,
  onDiscard,
  onSubmit,
}: NewScopeFormProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 rounded-xl border bg-background p-4 shadow-inner"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="scope-display-name">Nome de Exibição</Label>
          <Input
            id="scope-display-name"
            placeholder="Ex: Urgentes"
            value={newScope.label}
            onChange={(e) => onChangeScope({ ...newScope, label: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scope-slug">Identificador (slug)</Label>
          <Input
            id="scope-slug"
            placeholder="Ex: urgent_tickets"
            value={newScope.name}
            onChange={(e) => onChangeScope({ ...newScope, name: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="scope-description">Descrição</Label>
        <Input
          id="scope-description"
          placeholder="O que este escopo filtra?"
          value={newScope.description}
          onChange={(e) => onChangeScope({ ...newScope, description: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Descartar
        </Button>
        <Button size="sm" disabled={isSubmitting} onClick={onSubmit}>
          Criar Escopo
        </Button>
      </div>
    </motion.div>
  );
}
