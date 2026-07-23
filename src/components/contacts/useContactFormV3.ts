import { useState, useCallback, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { sanitizeText } from '@/lib/sanitize';
import { validatePhoneDetailed } from '@/lib/phoneUtils';
import { useContactDuplicateDetector } from './useContactDuplicateDetector';
import { useRetryOperation } from '@/hooks/useRetryAndErrorPrevention';
import { ConsentData } from './ContactConsentManager';
import { ContactForMerge } from './ContactMergeDialog';
import { ConflictInfo } from './ConflictResolutionDialog';
import { dbFrom, dbRpc } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { ContactV3FormData } from './ContactFormV3';

const EMPTY_FORM: ContactV3FormData = {
  name: '',
  phone: '',
  phone_numbers: [],
  email: '',
  company: '',
  tags: [],
  notes: '',
};

interface UseContactFormV3Options {
  workspaceId: string;
  initial?: Partial<ContactV3FormData>;
  mode?: 'create' | 'edit';
  onSaved: (contact: ContactV3FormData) => void;
  onCancel?: () => void;
}

/** use Contact Form V3 component for the contacts section. */
export function useContactFormV3({
  workspaceId,
  initial,
  mode = 'create',
  onSaved,
  onCancel,
}: UseContactFormV3Options) {
  const { toast } = useToast();
  const [form, setForm] = useState<ContactV3FormData>({ ...EMPTY_FORM, ...initial });
  const [tagInput, setTagInput] = useState('');
  const [dirty, setDirty] = useState(false);

  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);

  const [mergeTarget, setMergeTarget] = useState<ContactForMerge | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [loadingMergeTarget, setLoadingMergeTarget] = useState(false);

  const { withRetry, loading: retrying } = useRetryOperation(3, 500);
  const { hasDuplicates, duplicates, checking, checkDuplicates } = useContactDuplicateDetector({
    workspaceId,
    excludeId: form.id,
    debounceMs: 600,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (form.phone || form.email) {
        checkDuplicates(form.phone, form.email, form.name);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [form.phone, form.email, form.name, checkDuplicates]);

  const update = useCallback(
    <K extends keyof ContactV3FormData>(key: K, value: ContactV3FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
    },
    []
  );

  const addTag = useCallback(() => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      update('tags', [...form.tags, tag]);
      setTagInput('');
    }
  }, [tagInput, form.tags, update]);

  const removeTag = useCallback(
    (tag: string) => {
      update(
        'tags',
        form.tags.filter((t) => t !== tag)
      );
    },
    [form.tags, update]
  );

  const openMergeDialog = useCallback(
    async (duplicateId: string) => {
      setLoadingMergeTarget(true);
      try {
        const { data, error } = await dbFrom('contacts')
          .select(
            'id, name, phone, email, company, tags, channel_type, avatar_url, created_at, notes'
          )
          .eq('id', duplicateId)
          .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;
        if (error || !data) {
          toast({
            title: 'Erro ao carregar contato',
            description: 'Não foi possível carregar os dados do contato duplicado.',
            variant: 'destructive',
          });
          return;
        }
        setMergeTarget({
          id: data.id,
          name: data.name,
          phone: data.phone,
          email: data.email,
          company: data.company,
          tags: data.tags ?? [],
          channel: data.channel_type,
          avatar_url: data.avatar_url,
          created_at: data.created_at,
          notes: data.notes,
        });
        setMergeOpen(true);
      } finally {
        setLoadingMergeTarget(false);
      }
    },
    [toast]
  );

  const phoneValidation = useMemo(
    () => (form.phone ? validatePhoneDetailed(form.phone) : null),
    [form.phone]
  );

  const doSave = useCallback(
    async (forceOverwrite = false) => {
      if (!form.name.trim() && !form.phone.trim() && !form.email.trim()) {
        toast({ title: 'Preencha ao menos nome, telefone ou e-mail.', variant: 'destructive' });
        return;
      }

      if (form.phone && phoneValidation && !phoneValidation.valid) {
        toast({ title: `Telefone inválido: ${phoneValidation.error}`, variant: 'destructive' });
        return;
      }

      await withRetry(async () => {
        const payload = {
          name: sanitizeText(form.name),
          phone: form.phone || null,
          phone_numbers: form.phone_numbers,
          email: form.email?.toLowerCase().trim() || null,
          company: sanitizeText(form.company) || null,
          tags: form.tags,
          notes: form.notes || null,
          workspace_id: workspaceId,
          updated_at: new Date().toISOString(),
        };

        if (mode === 'edit' && form.id && !forceOverwrite) {
          const { data, error } = await dbRpc(RPC.updateContactVersioned, {
            p_contact_id: form.id,
            p_expected_version: form.version ?? 1,
            p_updates: payload,
          });

          if (error) throw error;

          const result = (data ?? {}) as Record<string, unknown>; // ignore-audit: narrows Supabase query result to local interface
          if (result?.error === 'CONFLICT') {
            setConflict(result as unknown as ConflictInfo); // ignore-audit: narrows Supabase query result to local interface
            setConflictOpen(true);
            return;
          }

          setForm((prev) => ({
            ...prev,
            version: (result?.version as number | undefined) ?? prev.version,
          }));
        } else if (mode === 'edit' && form.id && forceOverwrite) {
          const { error } = await dbFrom('contacts').update(payload).eq('id', form.id);
          if (error) throw error;
        } else {
          const { data, error } = await dbFrom('contacts')
            .insert({ ...payload, created_at: new Date().toISOString() })
            .select()
            .single();

          if (error) throw error;
          setForm((prev) => ({ ...prev, id: data.id, version: 1 }));
        }

        toast({
          title: mode === 'create' ? '✅ Contato criado!' : '✅ Contato salvo!',
          duration: 3_000,
        });
        setDirty(false);
        onSaved(form);
      }, 'Salvar contato');
    },
    [form, mode, workspaceId, withRetry, toast, onSaved, phoneValidation]
  );

  const handlePhoneBlur = useCallback(() => {
    if (!form.phone) return;
    const result = validatePhoneDetailed(form.phone);
    if (result.valid && result.normalized) {
      update('phone', result.normalized);
    }
  }, [form.phone, update]);

  const updateConsent = useCallback((updated: Partial<ConsentData>) => {
    setForm((prev) => ({ ...prev, consent: { ...prev.consent, ...updated } }));
  }, []);

  const handleMergeComplete = useCallback(() => {
    setMergeOpen(false);
    onSaved(form);
  }, [onSaved, form]);

  const handleConflictKeepMine = useCallback(() => {
    setConflictOpen(false);
    doSave(true);
  }, [doSave]);

  const handleConflictTakeTheirs = useCallback(() => {
    setConflictOpen(false);
    onCancel?.();
  }, [onCancel]);

  return {
    form,
    tagInput,
    setTagInput,
    dirty,
    conflict,
    conflictOpen,
    setConflictOpen,
    mergeTarget,
    setMergeTarget,
    mergeOpen,
    setMergeOpen,
    loadingMergeTarget,
    hasDuplicates,
    duplicates,
    checking,
    isSaving: retrying,
    phoneValidation,
    update,
    addTag,
    removeTag,
    openMergeDialog,
    doSave,
    handlePhoneBlur,
    updateConsent,
    handleMergeComplete,
    handleConflictKeepMine,
    handleConflictTakeTheirs,
  };
}
