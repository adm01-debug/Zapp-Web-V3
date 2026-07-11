import { motion } from 'framer-motion';
import { ContactFormV3 } from '@/components/contacts/ContactFormV3';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, Copy, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { Contact } from './useContactsCRUD';

interface ContactDialogsProps {
  workspaceId: string;
  // Add dialog
  isAddDialogOpen: boolean;
  setIsAddDialogOpen: (open: boolean) => void;
  onContactSaved: () => void;
  // Edit dialog
  isEditDialogOpen: boolean;
  setIsEditDialogOpen: (open: boolean) => void;
  editingContact: Contact | null;
  // Success dialog
  showSuccess: { name: string; protocol: string } | null;
  setShowSuccess: (val: { name: string; protocol: string } | null) => void;
  // Delete dialog
  deleteTarget: Contact | null;
  setDeleteTarget: (val: Contact | null) => void;
  handleDeleteContact: (id: string) => void;
}

export function ContactDialogs({
  workspaceId,
  isAddDialogOpen, setIsAddDialogOpen, onContactSaved,
  isEditDialogOpen, setIsEditDialogOpen, editingContact,
  showSuccess, setShowSuccess,
  deleteTarget, setDeleteTarget, handleDeleteContact,
}: ContactDialogsProps) {
  
  const handleSaved = () => {
    setIsAddDialogOpen(false);
    setIsEditDialogOpen(false);
    onContactSaved();
  };

  return (
    <>
      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Adicionar Contato
            </DialogTitle>
          </DialogHeader>
          <ContactFormV3
            workspaceId={workspaceId}
            mode="create"
            onSaved={handleSaved}
            onCancel={() => setIsAddDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Contato</DialogTitle>
          </DialogHeader>
          {editingContact && (
            <ContactFormV3
              workspaceId={workspaceId}
              mode="edit"
              initial={{
                id: editingContact.id,
                name: editingContact.name,
                phone: editingContact.phone,
                email: editingContact.email || '',
                company: editingContact.company || '',
                tags: editingContact.tags ?? [],
              }}
              onSaved={handleSaved}
              onCancel={() => setIsEditDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={!!showSuccess} onOpenChange={() => setShowSuccess(null)}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="flex flex-col items-center gap-3">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                <CheckCircle2 className="w-16 h-16 text-success" />
              </motion.div>
              Contato Adicionado!
            </DialogTitle>
            <DialogDescription className="text-center space-y-3 pt-2">
              <p><strong>{showSuccess?.name}</strong> foi adicionado com sucesso.</p>
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Protocolo</p>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-sm font-semibold text-foreground">{showSuccess?.protocol}</code>
                  <Button
                    aria-label="Copiar protocolo"
                    variant="ghost" size="icon" className="w-6 h-6"
                    onClick={() => {
                      navigator.clipboard.writeText(showSuccess?.protocol || '');
                      toast.success('Protocolo copiado!');
                    }}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setShowSuccess(null)} className="w-full bg-whatsapp hover:bg-whatsapp-dark">
            Continuar
          </Button>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDeleteContact(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
