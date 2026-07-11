import React from 'react';
import {
  ArrowLeft, Save, Wand2, Eye, Clock, MessageSquare, Type,
  Image, FileText, Video, Music, X, CalendarClock, BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TalkXCampaign } from '@/hooks/useTalkX';
import { TalkXMessagePreview } from './TalkXMessagePreview';
import { TalkXContactSelector } from './TalkXContactSelector';
import { useCampaignEditor, VARIABLES, MESSAGE_TEMPLATES, MEDIA_TYPES } from './useCampaignEditor';

const MEDIA_ICONS = { image: Image, video: Video, document: FileText, audio: Music } as const;

interface Props {
  campaign: TalkXCampaign | null;
  onClose: () => void;
}

export function TalkXCampaignEditor({ campaign, onClose }: Props) {
  const ed = useCampaignEditor(campaign, onClose);

  return (
    <div className="h-full flex flex-col gap-4 md:gap-6 p-4 md:p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg md:text-xl font-bold font-display text-foreground truncate">{campaign ? 'Editar Campanha' : 'Nova Campanha Talk X'}</h2>
          <p className="text-xs md:text-sm text-muted-foreground">Configure mensagem, contatos e simulação</p>
        </div>
        <div className="flex items-center gap-2">
          {ed.estimatedTime && <Badge variant="outline" className="gap-1 hidden sm:flex"><Clock className="w-3 h-3" />{ed.estimatedTime}</Badge>}
          <Button onClick={ed.handleSave} disabled={!ed.name || !ed.messageTemplate || ed.saving} className="gap-2">
            {ed.saving ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Left Column */}
        <div className="space-y-4 md:space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" />Informações</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label htmlFor="name">Nome da campanha</Label><Input id="name" value={ed.name} onChange={(e) => ed.setName(e.target.value)} placeholder="Ex: Promoção Black Friday" /></div>
              <div>
                <Label htmlFor="connection">Conexão WhatsApp</Label>
                <Select value={ed.connectionId} onValueChange={ed.setConnectionId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {ed.connections?.map((conn) => <SelectItem key={conn.id} value={conn.id}>{conn.name} ({conn.phone_number || 'Sem número'})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Message Template */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Type className="w-4 h-4 text-primary" />Mensagem</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-1.5 items-center">
                {VARIABLES.map((v) => (
                  <Tooltip key={v.key}>
                    <TooltipTrigger asChild><Badge variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors text-xs" onClick={() => ed.insertVariable(v.key)}><Wand2 className="w-3 h-3 mr-1" />{v.label}</Badge></TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px]"><p className=" text-[10px] text-primary mb-0.5">{v.key}</p><p className="text-xs">{v.desc}</p></TooltipContent>
                  </Tooltip>
                ))}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-6 gap-1 text-xs text-muted-foreground"><BookOpen className="w-3 h-3" />Templates</Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    {MESSAGE_TEMPLATES.map((t) => (
                      <DropdownMenuItem key={t.name} onClick={() => ed.setMessageTemplate(t.template)} className="flex flex-col items-start gap-0.5">
                        <span className="font-medium text-xs">{t.name}</span><span className="text-[10px] text-muted-foreground line-clamp-1">{t.template}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Textarea value={ed.messageTemplate} onChange={(e) => ed.setMessageTemplate(e.target.value)} placeholder="{{saudacao}}, {{nome}}! Tudo bem? 😊" rows={5} className="resize-none  text-sm" />
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">{ed.messageTemplate.length} caracteres</span>
                <Button size="sm" variant="ghost" onClick={() => ed.setShowPreview(!ed.showPreview)} className="gap-1"><Eye className="w-3.5 h-3.5" />{ed.showPreview ? 'Ocultar' : 'Preview'}</Button>
              </div>
              {ed.showPreview && (
                <TalkXMessagePreview
                  messageTemplate={ed.messageTemplate}
                  contacts={ed.selectedContacts.length > 0 ? (ed.contacts || []).filter((c) => ed.selectedContacts.includes(c.id)) : ed.contacts || []}
                  mediaUrl={ed.hasMedia ? ed.mediaUrl : undefined}
                  mediaType={ed.hasMedia ? ed.mediaType : undefined}
                />
              )}
            </CardContent>
          </Card>

          {/* Media */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Image className="w-4 h-4 text-primary" />Mídia (opcional)</CardTitle>
                <Switch checked={ed.hasMedia} onCheckedChange={ed.toggleMedia} />
              </div>
            </CardHeader>
            {ed.hasMedia && (
              <CardContent className="space-y-4">
                <div>
                  <Label>Tipo de mídia</Label>
                  <div className="grid grid-cols-4 gap-2 mt-1.5">
                    {MEDIA_TYPES.map(({ value, label }) => {
                      const Icon = MEDIA_ICONS[value as keyof typeof MEDIA_ICONS];
                      return (
                        <button key={value} type="button" onClick={() => ed.setMediaType(value)}
                          className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs transition-all ${ed.mediaType === value ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30 text-muted-foreground'}`}>
                          <Icon className="w-4 h-4" />{label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label htmlFor="media-url">URL da mídia</Label>
                  <div className="relative">
                    <Input id="media-url" value={ed.mediaUrl} onChange={(e) => ed.setMediaUrl(e.target.value)} placeholder="https://exemplo.com/imagem.jpg" className="pr-8" />
                    {ed.mediaUrl && <button type="button" onClick={() => ed.setMediaUrl('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">A mídia será enviada junto com a mensagem de texto como legenda</p>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Timing */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-primary" />Simulação Humana</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex justify-between mb-3"><Label>Tempo digitando</Label><span className="text-xs  text-muted-foreground">{ed.typingDelay[0]}s – {ed.typingDelay[1]}s</span></div>
                <Slider value={ed.typingDelay} onValueChange={ed.setTypingDelay} min={0.5} max={10} step={0.5} />
                <p className="text-xs text-muted-foreground mt-1">Tempo que aparece "digitando..." para o contato</p>
              </div>
              <Separator />
              <div>
                <div className="flex justify-between mb-3"><Label>Intervalo entre envios</Label><span className="text-xs  text-muted-foreground">{ed.sendInterval[0]}s – {ed.sendInterval[1]}s</span></div>
                <Slider value={ed.sendInterval} onValueChange={ed.setSendInterval} min={3} max={60} step={1} />
                <p className="text-xs text-muted-foreground mt-1">Pausa aleatória entre cada mensagem enviada</p>
              </div>
              {ed.estimatedTime && (<><Separator /><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Tempo estimado total:</span><Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />{ed.estimatedTime}</Badge></div></>)}
            </CardContent>
          </Card>

          {/* Scheduling */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><CalendarClock className="w-4 h-4 text-primary" />Agendar envio</CardTitle>
                <Switch checked={ed.isScheduled} onCheckedChange={ed.toggleSchedule} />
              </div>
            </CardHeader>
            {ed.isScheduled && (
              <CardContent>
                <Label htmlFor="scheduled-at">Data e hora</Label>
                <Input id="scheduled-at" type="datetime-local" value={ed.scheduledAt} onChange={(e) => ed.setScheduledAt(e.target.value)} min={ed.minScheduledAt} className="mt-1.5" />
                <p className="text-xs text-muted-foreground mt-1">A campanha será iniciada automaticamente na data e hora programada</p>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Right Column */}
        <TalkXContactSelector
          campaign={campaign}
          contacts={ed.contacts || []}
          filteredContacts={ed.filteredContacts}
          selectedContacts={ed.selectedContacts}
          contactSearch={ed.contactSearch}
          setContactSearch={ed.setContactSearch}
          companyFilter={ed.companyFilter}
          setCompanyFilter={ed.setCompanyFilter}
          tagFilter={ed.tagFilter}
          setTagFilter={ed.setTagFilter}
          companies={ed.companies}
          tags={ed.tags}
          toggleContact={ed.toggleContact}
          selectAll={ed.selectAll}
          clearFilters={ed.clearFilters}
        />
      </div>
    </div>
  );
}
