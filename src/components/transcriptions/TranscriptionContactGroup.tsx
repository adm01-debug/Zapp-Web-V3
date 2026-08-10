import { useState } from 'react';
import { resolvePublicMediaUrl } from '@/lib/useMediaUrl';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Calendar, Clock, FileText, Play, Volume2 } from 'lucide-react';
import { format, formatDistanceToNow, startOfDay, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TranscriptionRecord {
  id: string;
  content: string;
  transcription: string;
  media_url: string | null;
  created_at: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string;
  contact_avatar: string | null;
}

interface TranscriptionContactGroupProps {
  contact: { id: string; name: string; phone: string; avatar: string | null };
  transcriptions: TranscriptionRecord[];
  isExpanded: boolean;
  onToggle: () => void;
  index: number;
}

function groupByDate(items: TranscriptionRecord[]) {
  const groups: Record<string, TranscriptionRecord[]> = {};
  items.forEach((item) => {
    const key = startOfDay(new Date(item.created_at)).toISOString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
    .map(([dateKey, items]) => ({ date: new Date(dateKey), items }));
}

function formatDateLabel(date: Date) {
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, "d 'de' MMMM", { locale: ptBR });
}

/** Transcription Contact Group component for the transcriptions section. */
export function TranscriptionContactGroup({
  contact,
  transcriptions,
  isExpanded,
  onToggle,
  index,
}: TranscriptionContactGroupProps) {
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const dateGroups = groupByDate(transcriptions);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <Card className="border border-border/50 bg-card/80 backdrop-blur-sm transition-colors hover:border-primary/30">
          <CollapsibleTrigger className="w-full">
            <CardHeader className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={contact.avatar || undefined} alt={contact.name} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {contact.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <CardTitle className="text-base font-medium">{contact.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{contact.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="gap-1">
                    <FileText className="h-3 w-3" />
                    {transcriptions.length} transcrições
                  </Badge>
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  </motion.div>
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              {dateGroups.map(({ date, items }) => (
                <div key={date.toISOString()} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span className="font-medium">{formatDateLabel(date)}</span>
                  </div>
                  <div className="space-y-2 border-l-2 border-border/50 pl-4">
                    {items.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-2 rounded-lg bg-muted/30 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>
                              {format(new Date(item.created_at), 'HH:mm', { locale: ptBR })}
                            </span>
                            <span className="text-muted-foreground/50">•</span>
                            <span>
                              {formatDistanceToNow(new Date(item.created_at), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </span>
                          </div>
                          {resolvePublicMediaUrl({ mediaUrl: item.media_url }) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs"
                              onClick={() =>
                                setPlayingAudio(playingAudio === item.id ? null : item.id)
                              }
                            >
                              {playingAudio === item.id ? (
                                <>
                                  <Volume2 className="h-3 w-3" />
                                  Pausar
                                </>
                              ) : (
                                <>
                                  <Play className="h-3 w-3" />
                                  Ouvir
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                        <p className="text-sm italic leading-relaxed text-foreground/90">
                          "{item.transcription}"
                        </p>
                        {playingAudio === item.id &&
                          resolvePublicMediaUrl({ mediaUrl: item.media_url }) && (
                            <audio
                              src={resolvePublicMediaUrl({ mediaUrl: item.media_url }) ?? ''}
                              autoPlay
                              onEnded={() => setPlayingAudio(null)}
                              className="hidden"
                            />
                          )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </motion.div>
  );
}
