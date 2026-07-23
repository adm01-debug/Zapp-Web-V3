import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Cpu, ShieldCheck, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { MCP_SERVER_URL } from '../useConnections';

/** Connections Mcp Tab. */
export function ConnectionsMcpTab() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <Card className="border-purple-500/20 bg-purple-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-purple-500" /> MCP (Model Context Protocol) para Claude
          </CardTitle>
          <CardDescription>
            Permita que instâncias do Claude Desktop ou AI Gateway acessem dados do ZAPP Web
            diretamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 rounded-lg border border-purple-500/20 bg-background p-4">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 font-semibold text-purple-500">
                <ShieldCheck className="h-4 w-4" /> Endpoint do Servidor MCP
              </h4>
              <Badge variant="secondary">Experimental</Badge>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Este endpoint expõe ferramentas como `search_contacts`, `list_messages` e
              `send_whatsapp` diretamente para modelos de linguagem usando o protocolo MCP da
              Anthropic.
            </p>
            <div className="flex items-center gap-2">
              <Input
                aria-label="URL do servidor MCP"
                readOnly
                value={MCP_SERVER_URL}
                className="font-mono text-[10px]"
              />
              <Button aria-label="Abrir URL do servidor MCP" size="icon" variant="ghost">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="mcp-access-enabled">Habilitar Acesso MCP</Label>
              <Switch id="mcp-access-enabled" defaultChecked />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mcp-security-token">Token de Segurança MCP</Label>
              <div className="flex gap-2">
                <Input
                  id="mcp-security-token"
                  type="password"
                  placeholder="Clique em 'Regerar' para criar um token"
                  readOnly
                />
                <Button variant="outline">Regerar</Button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto whitespace-pre rounded border border-secondary/20 bg-muted p-3 font-mono text-[10px]">
            {`"mcpServers": {
  "zapp-web": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-http", "${MCP_SERVER_URL}"],
    "env": { "ZAPP_API_TOKEN": "SUA_CHAVE_AQUI" }
  }
}`}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
