import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Globe, Link, Save } from 'lucide-react';
import { motion } from 'framer-motion';

export function ConnectionsIntegrationsTab() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="grid gap-6 md:grid-cols-2"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" /> Bitrix24
            </CardTitle>
            <Badge variant="outline">Pendente</Badge>
          </div>
          <CardDescription>Sincronização bidirecional de Leads e Negócios</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bitrix24-webhook-url">Webhook URL (Inbound)</Label>
            <Input
              id="bitrix24-webhook-url"
              placeholder="https://sua-empresa.bitrix24.com.br/rest/1/abc..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bitrix24-access-token">Access Token / Key</Label>
            <Input
              id="bitrix24-access-token"
              type="password"
              placeholder="Digite o token de acesso"
            />
          </div>
          <Button className="w-full gap-2">
            <Save className="h-4 w-4" /> Salvar Integração Bitrix
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Link className="h-5 w-5 text-orange-500" /> n8n (Workflows)
            </CardTitle>
            <Badge variant="outline">Pendente</Badge>
          </div>
          <CardDescription>Dispare automações complexas via webhooks do n8n</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="n8n-production-url">URL de Produção</Label>
            <Input id="n8n-production-url" placeholder="https://n8n.sua-vps.com/webhook/..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="n8n-auth-header">Auth Header (API Key)</Label>
            <Input id="n8n-auth-header" type="password" placeholder="Header X-N8N-API-KEY" />
          </div>
          <Button className="w-full gap-2" variant="secondary">
            <Save className="h-4 w-4" /> Conectar n8n
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
