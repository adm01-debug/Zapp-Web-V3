/* eslint-disable react-refresh/only-export-components */
import { memo } from 'react';
import { FileText, ImageIcon, Lock, Music, Shield, Link2, Video } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { TeamMessage } from '@/hooks/useTeamChat';

/** format Time component for the team chat section. */
export function formatTime(dateStr: string) {
  return format(new Date(dateStr), 'HH:mm');
}

/** format Date Sep component for the team chat section. */
export function formatDateSep(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Hoje';
  if (isYesterday(d)) return 'Ontem';
  return format(d, "d 'de' MMMM", { locale: ptBR });
}

/** Media Content component for the team chat section. */
export const MediaContent = memo(function MediaContent({ msg }: { msg: TeamMessage }) {
  if (!msg.media_url) return null;
  switch (msg.media_type) {
    case 'image':
    case 'sticker':
    case 'emoji':
      return (
        <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
          <img
            src={msg.media_url}
            alt={
              msg.media_type === 'sticker' || msg.media_type === 'emoji'
                ? 'Figurinha'
                : 'Imagem da mensagem'
            }
            className={cn(
              'max-h-48 rounded-lg object-contain',
              msg.media_type === 'sticker' || msg.media_type === 'emoji'
                ? 'h-24 w-24'
                : 'max-w-full'
            )}
          />
        </a>
      );
    case 'video':
      return <video src={msg.media_url} controls className="max-h-48 max-w-full rounded-lg" />;
    case 'audio':
    case 'audio_meme':
      return <audio src={msg.media_url} controls className="max-w-full" />;
    case 'document':
      return (
        <a
          href={msg.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-muted/30 p-2 transition-colors hover:bg-muted/50"
        >
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm text-foreground underline">
            {msg.content || 'Documento'}
          </span>
        </a>
      );
    default:
      return null;
  }
});

/** Media Type Icon component for the team chat section. */
export const MediaTypeIcon = memo(function MediaTypeIcon({ type }: { type: string | null }) {
  switch (type) {
    case 'image':
      return <ImageIcon className="h-3 w-3" />;
    case 'video':
      return <Video className="h-3 w-3" />;
    case 'audio':
    case 'audio_meme':
      return <Music className="h-3 w-3" />;
    case 'document':
      return <FileText className="h-3 w-3" />;
    default:
      return null;
  }
});

/** Locked Dept View component for the team chat section. */
export function LockedDeptView() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Lock className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-lg font-bold">Conteúdo Protegido</h3>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">
        As mensagens deste departamento são privadas e restritas aos seus membros.
      </p>
      <div className="flex w-full max-w-[280px] flex-col gap-3">
        <div className="rounded-xl border border-border/50 bg-card p-3 text-left shadow-sm">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
            <Shield className="h-3 w-3 text-primary" /> Solicitar Acesso
          </p>
          <p className="text-[11px] leading-normal text-muted-foreground">
            Contate o administrador do sistema para que ele associe seu perfil a este departamento.
          </p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-3 text-left shadow-sm">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
            <Link2 className="h-3 w-3 text-primary" /> Entrar via Código
          </p>
          <p className="text-[11px] leading-normal text-muted-foreground">
            Se você recebeu um código de convite, utilize-o para entrar automaticamente através do
            link oficial.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Locked Input Footer component for the team chat section. */
export function LockedInputFooter() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 border-t border-border bg-muted/30 p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
        <Lock className="h-5 w-5 text-destructive" />
      </div>
      <p className="text-sm font-semibold text-foreground">Acesso Restrito ao Departamento</p>
      <p className="mb-4 max-w-xs text-xs text-muted-foreground">
        Você não faz parte deste departamento e não tem permissão para visualizar ou enviar
        mensagens.
      </p>
      <div className="max-w-xs rounded-xl border border-primary/10 bg-primary/5 p-4">
        <p className="mb-1 text-xs font-medium text-primary">Como obter acesso?</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Solicite ao administrador da sua conta ou ao gestor do departamento que inclua você via
          painel de membros ou enviando um código de convite.
        </p>
      </div>
    </div>
  );
}
