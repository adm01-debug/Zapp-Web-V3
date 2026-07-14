import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Database, Plus, Settings, Save, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface ConnectionsExternalDbTabProps {
  editOpen: boolean;
  draftUrl: string;
  setDraftUrl: (v: string) => void;
  draftKey: string;
  setDraftKey: (v: string) => void;
  testing: boolean;
  saving: boolean;
  saveError: string | null;
  isAdmin: boolean | null;
  openEditor: () => void;
  cancelEdit: () => void;
  testConnection: (url: string, key: string) => void;
  saveCredentials: () => void;
  externalUrl: string;
  externalKey: string;
}

export function ConnectionsExternalDbTab({
  editOpen,
  draftUrl,
  setDraftUrl,
  draftKey,
  setDraftKey,
  testing,
  saving,
  saveError,
  isAdmin,
  openEditor,
  cancelEdit,
  testConnection,
  saveCredentials,
  externalUrl,
  externalKey,
}: ConnectionsExternalDbTabProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="overflow-hidden border-border/40 bg-card/40 shadow-xl shadow-primary/5 backdrop-blur-xl transition-all duration-500 hover:border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" /> SUPABASE SELF HOSTED
              </CardTitle>
              <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                Configurado
              </Badge>
            </div>
            <CardDescription>
              Conecta ao banco VPS que armazena mensagens e contatos WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="supabase-instance-url">URL da Instância</Label>
              <Input
                id="supabase-instance-url"
                value={editOpen ? draftUrl : externalUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                readOnly={!editOpen}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supabase-anon-key">Chave Anon (Public)</Label>
              <Input
                id="supabase-anon-key"
                type={editOpen ? 'text' : 'password'}
                value={
                  editOpen
                    ? draftKey
                    : externalKey
                      ? '•'.repeat(Math.min(externalKey.length, 32))
                      : ''
                }
                onChange={(e) => setDraftKey(e.target.value)}
                readOnly={!editOpen}
                placeholder={editOpen ? 'eyJhbGciOi...' : ''}
                className="font-mono text-xs"
              />
            </div>
            {editOpen && (
              <p className="text-[11px] text-muted-foreground">
                Editando inline. Após salvar, atualize também os secrets{' '}
                <code>VITE_EXTERNAL_SUPABASE_URL/KEY</code> e republique para o runtime usar.
              </p>
            )}
            {isAdmin === false && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Você não está autenticado como admin. As políticas de segurança bloqueiam a
                  escrita em <code>system_connections</code> para não-admins.
                </span>
              </div>
            )}
            {saveError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1 break-all">
                  <strong className="mb-1 block">Falha ao salvar:</strong>
                  {saveError}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={() =>
                  testConnection(
                    editOpen ? draftUrl : externalUrl,
                    editOpen ? draftKey : externalKey
                  )
                }
                disabled={testing}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}{' '}
                Testar Conexão
              </Button>
              {!editOpen ? (
                <Button size="sm" className="flex-1 gap-2" onClick={openEditor}>
                  <Settings className="h-4 w-4" /> Editar Credenciais
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    onClick={cancelEdit}
                    disabled={saving}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={saveCredentials}
                    disabled={saving || isAdmin === false}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}{' '}
                    Salvar
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed border-secondary/40 bg-secondary/5">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Adicionar Novo Banco</CardTitle>
            <CardDescription>Conecte outro projeto Supabase ou PostgreSQL externo</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-8">
            <Button variant="secondary">Configurar Novo Supabase</Button>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
