import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Fingerprint,
  Plus,
  Trash2,
  Smartphone,
  Key,
  Pencil,
  Clock,
  Shield,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Monitor,
} from 'lucide-react';
import { useWebAuthn } from '@/hooks/useWebAuthn';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { PasskeyDialogs } from './PasskeyDialogs';

const getDeviceIcon = (deviceType: string | null) => {
  if (deviceType === 'platform') return <Fingerprint className="h-5 w-5" />;
  if (deviceType === 'cross-platform') return <Key className="h-5 w-5" />;
  return <Smartphone className="h-5 w-5" />;
};

/** Passkeys Panel component for the security section. */
export function PasskeysPanel() {
  const {
    loading,
    passkeys,
    isSupported,
    isPlatformAuthenticatorAvailable,
    fetchPasskeys,
    registerPasskey,
    deletePasskey,
    renamePasskey,
  } = useWebAuthn();

  const [isPlatformAvailable, setIsPlatformAvailable] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [selectedPasskey, setSelectedPasskey] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [passkeyName, setPasskeyName] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    fetchPasskeys();
    isPlatformAuthenticatorAvailable()
      .then((available) => {
        if (mountedRef.current) {
          setIsPlatformAvailable(available);
        }
      })
      .catch(() => {});
  }, [fetchPasskeys, isPlatformAuthenticatorAvailable]);

  const handleRegister = async () => {
    const result = await registerPasskey(passkeyName || undefined);
    if (result.success) {
      setShowRegisterDialog(false);
      setPasskeyName('');
    }
  };

  const handleDelete = async () => {
    if (selectedPasskey) {
      await deletePasskey(selectedPasskey);
      setShowDeleteDialog(false);
      setSelectedPasskey(null);
    }
  };

  const handleRename = async () => {
    if (selectedPasskey && newName) {
      await renamePasskey(selectedPasskey, newName);
      setShowRenameDialog(false);
      setSelectedPasskey(null);
      setNewName('');
    }
  };

  const webauthnSupported = isSupported();

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Fingerprint className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Passkeys / WebAuthn</CardTitle>
                <CardDescription>
                  Login biométrico com Touch ID, Face ID ou Windows Hello
                </CardDescription>
              </div>
            </div>
            {webauthnSupported ? (
              <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                <CheckCircle className="mr-1 h-3 w-3" />
                Suportado
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-destructive/30 bg-destructive/10 text-destructive"
              >
                <AlertTriangle className="mr-1 h-3 w-3" />
                Não Suportado
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!webauthnSupported ? (
            <div className="flex items-center gap-3 rounded-lg bg-destructive/10 p-4">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <p className="font-medium text-destructive">WebAuthn não disponível</p>
                <p className="text-sm text-muted-foreground">
                  Seu navegador não suporta autenticação biométrica.
                </p>
              </div>
            </div>
          ) : !isPlatformAvailable ? (
            <div className="flex items-center gap-3 rounded-lg bg-warning/10 p-4">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <div>
                <p className="font-medium text-warning">
                  Autenticador de plataforma não disponível
                </p>
                <p className="text-sm text-muted-foreground">
                  Seu dispositivo não possui Touch ID, Face ID ou Windows Hello configurado.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg bg-success/10 p-4">
              <Shield className="h-5 w-5 text-success" />
              <div>
                <p className="font-medium text-success">Pronto para usar</p>
                <p className="text-sm text-muted-foreground">
                  Seu dispositivo suporta autenticação biométrica.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Passkeys List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Suas Passkeys</CardTitle>
              <CardDescription>
                {passkeys.length === 0
                  ? 'Nenhuma passkey cadastrada'
                  : `${passkeys.length} passkey${passkeys.length > 1 ? 's' : ''} cadastrada${passkeys.length > 1 ? 's' : ''}`}
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowRegisterDialog(true)}
              disabled={!webauthnSupported || loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Adicionar Passkey
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="popLayout">
            {passkeys.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-8 text-center"
              >
                <Fingerprint className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
                <p className="text-muted-foreground">
                  Adicione uma passkey para fazer login com biometria
                </p>
              </motion.div>
            ) : (
              <div className="space-y-3">
                {passkeys.map((passkey, index) => (
                  <motion.div
                    key={passkey.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="rounded-lg bg-primary/10 p-2">
                        {getDeviceIcon(passkey.device_type)}
                      </div>
                      <div>
                        <p className="font-medium">{passkey.friendly_name || 'Passkey'}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>
                            Criada{' '}
                            {formatDistanceToNow(new Date(passkey.created_at), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </span>
                          {passkey.last_used_at && (
                            <>
                              <span>•</span>
                              <span>
                                Usada{' '}
                                {formatDistanceToNow(new Date(passkey.last_used_at), {
                                  addSuffix: true,
                                  locale: ptBR,
                                })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        aria-label="Renomear chave"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedPasskey(passkey.id);
                          setNewName(passkey.friendly_name || '');
                          setShowRenameDialog(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        aria-label="Excluir chave"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setSelectedPasskey(passkey.id);
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="h-fit rounded-lg bg-info/10 p-2">
              <Monitor className="h-5 w-5 text-info" />
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">O que são Passkeys?</h4>
              <p className="text-sm text-muted-foreground">
                Passkeys são uma forma mais segura e conveniente de fazer login usando biometria ou
                PIN do dispositivo.
              </p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-success" />
                  Mais seguro que senhas tradicionais
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-success" />
                  Resistente a phishing
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-success" />
                  Login instantâneo com biometria
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <PasskeyDialogs
        showRegisterDialog={showRegisterDialog}
        setShowRegisterDialog={setShowRegisterDialog}
        showRenameDialog={showRenameDialog}
        setShowRenameDialog={setShowRenameDialog}
        showDeleteDialog={showDeleteDialog}
        setShowDeleteDialog={setShowDeleteDialog}
        passkeyName={passkeyName}
        setPasskeyName={setPasskeyName}
        newName={newName}
        setNewName={setNewName}
        loading={loading}
        onRegister={handleRegister}
        onRename={handleRename}
        onDelete={handleDelete}
      />
    </div>
  );
}
