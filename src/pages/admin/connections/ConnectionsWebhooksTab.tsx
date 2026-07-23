import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Webhook, Plus, Settings, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

/** Connections Webhooks Tab. */
export function ConnectionsWebhooksTab() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-emerald-500" /> Webhooks Inter-App
          </CardTitle>
          <CardDescription>
            Permita que outros sistemas criados no Lovable se conectem ao ZAPP Web
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-secondary/20">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">
                    Nome do App
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    Eventos
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">CRM-Integrator-App</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Badge variant="secondary" className="text-[10px]">
                        messages
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        contacts
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600">
                      Ativo
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        aria-label="Configurações da conexão"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        aria-label="Excluir conexão"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <Button className="mt-4 gap-2" variant="outline">
            <Plus className="h-4 w-4" /> Gerar Novo Webhook de Entrada
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
