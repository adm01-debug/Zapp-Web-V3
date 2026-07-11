import { useState } from 'react';
import { useSkillBasedRouting } from '@/hooks/settings/useSkillBasedRouting';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Brain, Users, Star } from 'lucide-react';

const SKILL_SUGGESTIONS = [
  'Português', 'Inglês', 'Espanhol', 'Suporte Técnico', 'Vendas',
  'Financeiro', 'Cobrança', 'Onboarding', 'Premium', 'Reclamações'
];

export function SkillBasedRoutingSettings() {
  const [newSkill, setNewSkill] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [selectedQueue, setSelectedQueue] = useState<string>('');
  const [newQueueSkill, setNewQueueSkill] = useState('');
  const [newQueueMinLevel, setNewQueueMinLevel] = useState(1);

  const { profiles, queues, agentSkills, queueSkills, addSkill, removeSkill, addQueueRequirement, removeQueueRequirement } =
    useSkillBasedRouting(selectedProfile, selectedQueue);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          Roteamento por Habilidades
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure habilidades dos agentes e requisitos das filas para distribuição inteligente.
        </p>
      </div>

      {/* Agent Skills Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            Habilidades dos Agentes
          </CardTitle>
          <CardDescription>Atribua competências e níveis de proficiência a cada agente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedProfile} onValueChange={setSelectedProfile}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um agente" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedProfile && (
            <>
              <div className="flex flex-wrap gap-2">
                {agentSkills.map(skill => (
                  <Badge key={skill.id} variant="secondary" className="gap-1 py-1.5 px-3">
                    {skill.skill_name}
                    <span className="flex items-center gap-0.5 ml-1">
                      {Array.from({ length: skill.skill_level || 1 }).map((_, i) => (
                        <Star key={i} className="w-3 h-3 fill-primary text-primary" />
                      ))}
                    </span>
                    <button onClick={() => removeSkill.mutate(skill.id)} className="ml-1 hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Nome da skill (ex: Inglês)"
                  value={newSkill}
                  onChange={e => setNewSkill(e.target.value)}
                  list="skill-suggestions"
                />
                <datalist id="skill-suggestions">
                  {SKILL_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                </datalist>
                <Select defaultValue="3" onValueChange={() => {}}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map(l => (
                      <SelectItem key={l} value={String(l)}>Nível {l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => {
                    if (newSkill.trim()) {
                      addSkill.mutate({ profileId: selectedProfile, skillName: newSkill.trim(), level: 3 }, { onSuccess: () => setNewSkill('') });
                    }
                  }}
                  disabled={!newSkill.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Queue Requirements Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Requisitos das Filas
          </CardTitle>
          <CardDescription>Defina quais habilidades são necessárias para atender cada fila.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedQueue} onValueChange={setSelectedQueue}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma fila" />
            </SelectTrigger>
            <SelectContent>
              {queues.map(q => (
                <SelectItem key={q.id} value={q.id}>
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: q.color }} />
                    {q.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedQueue && (
            <>
              <div className="flex flex-wrap gap-2">
                {queueSkills.map(req => (
                  <Badge key={req.id} variant="outline" className="gap-1 py-1.5 px-3">
                    {req.skill_name} (min: {req.min_level})
                    <button onClick={() => removeQueueRequirement.mutate(req.id)} className="ml-1 hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Skill necessária"
                  value={newQueueSkill}
                  onChange={e => setNewQueueSkill(e.target.value)}
                  list="skill-suggestions"
                />
                <Select defaultValue="1" onValueChange={v => setNewQueueMinLevel(Number(v))}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map(l => (
                      <SelectItem key={l} value={String(l)}>Min: {l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => {
                    if (newQueueSkill.trim()) {
                      addQueueRequirement.mutate({ queueId: selectedQueue, skillName: newQueueSkill.trim(), minLevel: newQueueMinLevel }, { onSuccess: () => setNewQueueSkill('') });
                    }
                  }}
                  disabled={!newQueueSkill.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
