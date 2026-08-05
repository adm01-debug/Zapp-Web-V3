/**
 * useEmailTemplates.ts — Templates de e-mail (EMAIL-09)
 *
 * CRUD em email_templates (view zapp.email_templates — SELECT/INSERT/UPDATE/
 * DELETE para authenticated; tabela física em public com RLS).
 *
 * Colunas (types.ts): id, name, subject, body, category, created_by,
 * created_at, updated_at. O hook injeta created_by = auth user id no insert.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';

const log = getLogger('EmailTemplates');

/** Template de e-mail (linha de email_templates). */
export interface EmailTemplate {
  id: string;
  name: string | null;
  subject: string | null;
  body: string | null;
  category: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Campos de escrita de um template. */
export interface EmailTemplateInput {
  name: string;
  subject?: string;
  body: string;
  category?: string;
}

const EMAIL_TEMPLATES_KEY = ['email-templates'] as const;

/** CRUD de templates de e-mail (EMAIL-09). */
export function useEmailTemplates() {
  const queryClient = useQueryClient();

  const {
    data: templates = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: EMAIL_TEMPLATES_KEY,
    queryFn: async () => {
      const { data, error } = await safeClient.from<EmailTemplate>('email_templates', (q) =>
        q.select('*').order('updated_at', { ascending: false })
      );
      if (error) {
        log.warn('email_templates load error', error);
        return [] as EmailTemplate[];
      }
      return (data ?? []) as EmailTemplate[];
    },
    staleTime: 30_000,
  });

  /** Cria um template. */
  const createTemplate = useCallback(
    async (input: EmailTemplateInput): Promise<{ id: string | null; error: string | null }> => {
      let userId: string | null = null;
      try {
        const { data } = await supabase.auth.getUser();
        userId = data?.user?.id ?? null;
      } catch {
        userId = null;
      }
      const { error, data: inserted } = await safeClient.single<{ id: string }>(
        'email_templates',
        (q) =>
          q
            .insert({
              name: input.name,
              subject: input.subject ?? null,
              body: input.body,
              category: input.category ?? null,
              created_by: userId,
            })
            .select('id')
      );
      if (error) {
        log.error('email_templates insert error', error);
        return { id: null, error: error.message };
      }
      await queryClient.invalidateQueries({ queryKey: EMAIL_TEMPLATES_KEY });
      return { id: inserted?.id ?? null, error: null };
    },
    [queryClient]
  );

  /** Atualiza um template existente. */
  const updateTemplate = useCallback(
    async (id: string, input: EmailTemplateInput): Promise<{ error: string | null }> => {
      const { error } = await safeClient.from('email_templates', (q) =>
        q
          .update({
            name: input.name,
            subject: input.subject ?? null,
            body: input.body,
            category: input.category ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
      );
      if (error) {
        log.error('email_templates update error', error);
        return { error: error.message };
      }
      await queryClient.invalidateQueries({ queryKey: EMAIL_TEMPLATES_KEY });
      return { error: null };
    },
    [queryClient]
  );

  /** Remove um template. */
  const removeTemplate = useCallback(
    async (id: string): Promise<{ error: string | null }> => {
      const { error } = await safeClient.from('email_templates', (q) => q.delete().eq('id', id));
      if (error) {
        log.error('email_templates delete error', error);
        return { error: error.message };
      }
      await queryClient.invalidateQueries({ queryKey: EMAIL_TEMPLATES_KEY });
      return { error: null };
    },
    [queryClient]
  );

  /** Salva (cria ou atualiza) um template. */
  const saveTemplate = useCallback(
    async (id: string | null, input: EmailTemplateInput) => {
      if (id) return updateTemplate(id, input);
      return createTemplate(input);
    },
    [createTemplate, updateTemplate]
  );

  return {
    templates,
    isLoading,
    refetch,
    createTemplate,
    updateTemplate,
    removeTemplate,
    saveTemplate,
  };
}
