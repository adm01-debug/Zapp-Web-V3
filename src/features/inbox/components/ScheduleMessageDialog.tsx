import { useState } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar, Clock, Paperclip } from 'lucide-react';
import { format, addDays, setHours, setMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';

interface ScheduleMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchedule: (message: string, scheduledAt: Date, attachment?: File) => void | Promise<unknown>;
}

/** Schedule Message Dialog component. */
export function ScheduleMessageDialog({
  open,
  onOpenChange,
  onSchedule,
}: ScheduleMessageDialogProps) {
  const [message, setMessage] = useState('');
  const [date, setDate] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [time, setTime] = useState('09:00');
  const [attachment, setAttachment] = useState<File | null>(null);

  const quickSchedules = [
    { label: 'Amanhã 9h', getDate: () => setMinutes(setHours(addDays(new Date(), 1), 9), 0) },
    { label: 'Amanhã 14h', getDate: () => setMinutes(setHours(addDays(new Date(), 1), 14), 0) },
    { label: 'Em 2 dias', getDate: () => setMinutes(setHours(addDays(new Date(), 2), 9), 0) },
    { label: 'Em 1 semana', getDate: () => setMinutes(setHours(addDays(new Date(), 7), 9), 0) },
  ];

  const handleSchedule = async () => {
    if (!message.trim()) {
      toast({
        title: 'Mensagem vazia',
        description: 'Digite uma mensagem para agendar',
        variant: 'destructive',
      });
      return;
    }
    const [hours, minutes] = time.split(':').map(Number);
    // Parse date as LOCAL midnight to avoid UTC offset shifting the day (e.g. UTC-3 turns
    // 2026-08-01T00:00:00Z into 2026-07-31T21:00 local — one day early).
    const [y, mo, d] = date.split('-').map(Number);
    const scheduledDate = new Date(y, mo - 1, d, hours, minutes);

    if (scheduledDate <= new Date()) {
      toast({
        title: 'Data inválida',
        description: 'A data de agendamento deve ser no futuro',
        variant: 'destructive',
      });
      return;
    }

    // CAMPANHAS-09: aguarda o INSERT resolver ANTES do toast de sucesso —
    // antes, o sucesso era exibido mesmo com 403 (RLS) e o dialog fechava.
    // Falha é sinalizada pelo hook (toast destrutivo com causa real) — aqui
    // só impedimos que a rejeição vire unhandled rejection; o dialog fica aberto.
    try {
      await onSchedule(message, scheduledDate, attachment || undefined);
    } catch {
      return;
    }
    toast({
      title: 'Mensagem agendada!',
      description: `Será enviada em ${format(scheduledDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    });

    onOpenChange(false);
    setMessage('');
    setAttachment(null);
  };

  const handleQuickSchedule = (getDate: () => Date) => {
    const scheduledDate = getDate();
    setDate(format(scheduledDate, 'yyyy-MM-dd'));
    setTime(format(scheduledDate, 'HH:mm'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-whatsapp" />
            Agendar Mensagem
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Quick Schedule Buttons */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Atalhos rápidos</Label>
            <div className="flex flex-wrap gap-2">
              {quickSchedules.map((schedule) => (
                <motion.button
                  key={schedule.label}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleQuickSchedule(schedule.getDate)}
                  className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/80"
                >
                  {schedule.label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date" className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Data
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time" className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Hora
              </Label>
              <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Mensagem</Label>
            <Textarea
              id="message"
              placeholder="Digite a mensagem que será enviada..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>

          {/* Attachment */}
          <div className="space-y-2">
            <Label>Anexo (opcional)</Label>
            {attachment ? (
              <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="max-w-[200px] truncate text-sm">{attachment.name}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setAttachment(null)}>
                  Remover
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <Paperclip className="mr-2 h-4 w-4" />
                Anexar arquivo
              </Button>
            )}
            <input
              id="file-upload"
              type="file"
              className="hidden"
              onChange={(e) => setAttachment(e.target.files?.[0] || null)}
            />
          </div>

          {/* Preview */}
          {date && time && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground">
                A mensagem será enviada em{' '}
                <span className="font-medium text-foreground">
                  {format(
                    setMinutes(
                      setHours(new Date(date), parseInt(time.split(':')[0])),
                      parseInt(time.split(':')[1])
                    ),
                    "EEEE, dd 'de' MMMM 'às' HH:mm",
                    { locale: ptBR }
                  )}
                </span>
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={handleSchedule}
                disabled={!message.trim()}
                className="bg-whatsapp hover:bg-whatsapp-dark"
              >
                <Clock className="mr-2 h-4 w-4" />
                Agendar
              </Button>
            </motion.div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
