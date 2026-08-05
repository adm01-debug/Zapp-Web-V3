/**
 * CompaniesManagerDialog — gestão de empresas locais (zapp.companies),
 * CONTATOS-14. Lista/cria/edita/exclui via useCompanies. Como a RLS atual só
 * permite SELECT (auth_secure_166), escritas exibem aviso claro — leitura
 * continua funcional para o vínculo no form de contato.
 */
import { useState, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Plus, Pencil, Trash2, Building2, ShieldAlert, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCompanies, COMPANIES_RLS_HINT,
  type Company,
} from '@/hooks/contacts/useCompanies';

interface CompaniesManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompaniesChanged?: () => void;
}

interface CompanyDraft {
  name: string;
  cnpj: string;
  segment: string;
}

const EMPTY_DRAFT: CompanyDraft = { name: '', cnpj: '', segment: '' };

/** Companies Manager Dialog component for the contacts section. */
export function CompaniesManagerDialog({
  open,
  onOpenChange,
  onCompaniesChanged,
}: CompaniesManagerDialogProps) {
  const { companies, loading, loadError, refresh, createCompany, updateCompany, deleteCompany } =
    useCompanies();

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<CompanyDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CompanyDraft>(EMPTY_DRAFT);
  const [rlsHintVisible, setRlsHintVisible] = useState(false);

  const afterMutation = useCallback(
    (result: { error: string | null; rlsBlocked: boolean }, successMsg: string) => {
      if (result.error) {
        if (result.rlsBlocked) {
          setRlsHintVisible(true);
          toast.error('Sem permissão de escrita: RLS só permite SELECT em zapp.companies.');
        } else {
          toast.error(result.error);
        }
        return false;
      }
      toast.success(successMsg);
      onCompaniesChanged?.();
      return true;
    },
    [onCompaniesChanged]
  );

  const handleCreate = useCallback(async () => {
    if (!draft.name.trim()) {
      toast.error('Informe o nome da empresa.');
      return;
    }
    setSaving(true);
    const result = await createCompany({ name: draft.name, cnpj: draft.cnpj, segment: draft.segment });
    setSaving(false);
    if (afterMutation(result, `Empresa "${draft.name.trim()}" criada!`)) {
      setDraft(EMPTY_DRAFT);
      setCreating(false);
    }
  }, [draft, createCompany, afterMutation]);

  const startEdit = useCallback((company: Company) => {
    setEditingId(company.id);
    setEditDraft({ name: company.name, cnpj: company.cnpj ?? '', segment: company.segment ?? '' });
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingId) return;
    if (!editDraft.name.trim()) {
      toast.error('O nome da empresa não pode ficar vazio.');
      return;
    }
    setSaving(true);
    const result = await updateCompany(editingId, {
      name: editDraft.name,
      cnpj: editDraft.cnpj,
      segment: editDraft.segment,
    });
    setSaving(false);
    if (afterMutation(result, 'Empresa atualizada!')) {
      setEditingId(null);
    }
  }, [editingId, editDraft, updateCompany, afterMutation]);

  const handleDelete = useCallback(
    async (company: Company) => {
      setSaving(true);
      const result = await deleteCompany(company.id);
      setSaving(false);
      afterMutation(result, `Empresa "${company.name}" excluída.`);
    },
    [deleteCompany, afterMutation]
  );

  const renderForm = (
    values: CompanyDraft,
    onChange: (d: CompanyDraft) => void,
    submitLabel: string,
    onSubmit: () => void,
    onCancel: () => void
  ) => (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1.5">
        <Label htmlFor="comp-name">Nome *</Label>
        <Input
          id="comp-name"
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
          placeholder="Razão social / nome da empresa"
          maxLength={300}
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="comp-cnpj">CNPJ</Label>
          <Input
            id="comp-cnpj"
            value={values.cnpj}
            onChange={(e) => onChange({ ...values, cnpj: e.target.value })}
            placeholder="00.000.000/0000-00"
            maxLength={20}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="comp-segment">Segmento</Label>
          <Input
            id="comp-segment"
            value={values.segment}
            onChange={(e) => onChange({ ...values, segment: e.target.value })}
            placeholder="Ex.: Varejo, Indústria"
            maxLength={120}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Empresas
          </DialogTitle>
          <DialogDescription>
            Empresas locais (zapp.companies) para vínculo com contatos.
          </DialogDescription>
        </DialogHeader>

        {rlsHintVisible && (
          <Alert variant="destructive" className="mb-2">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Escrita bloqueada pela RLS</AlertTitle>
            <AlertDescription className="text-xs">{COMPANIES_RLS_HINT}</AlertDescription>
          </Alert>
        )}

        {creating &&
          renderForm(
            draft,
            setDraft,
            'Criar empresa',
            handleCreate,
            () => { setCreating(false); setDraft(EMPTY_DRAFT); }
          )}

        <ScrollArea className="max-h-[45vh] pr-3">
          {loading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : loadError ? (
            <Alert variant="destructive">
              <AlertTitle>Falha ao carregar empresas</AlertTitle>
              <AlertDescription className="text-xs">{loadError}</AlertDescription>
            </Alert>
          ) : companies.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma empresa cadastrada.
            </p>
          ) : (
            <ul className="divide-y">
              {companies.map((company) => (
                <li key={company.id} className="flex items-start justify-between gap-3 py-2.5">
                  {editingId === company.id ? (
                    <div className="flex-1">
                      {renderForm(
                        editDraft,
                        setEditDraft,
                        'Salvar',
                        handleSaveEdit,
                        () => setEditingId(null)
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-sm font-medium">{company.name}</span>
                        {company.cnpj && (
                          <p className="mt-0.5 text-xs text-muted-foreground">CNPJ: {company.cnpj}</p>
                        )}
                        {company.segment && (
                          <p className="text-xs text-muted-foreground">Segmento: {company.segment}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Editar empresa"
                          onClick={() => startEdit(company)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:text-destructive"
                          title="Excluir empresa"
                          onClick={() => handleDelete(company)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => { setCreating(true); setRlsHintVisible(false); }}>
            <Plus className="h-4 w-4" />
            Nova empresa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CompaniesManagerDialog;
