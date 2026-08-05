import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ──────────────────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────────────────

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplateInput {
  name: string;
  subject: string;
  body: string;
  category: string;
}

// ──────────────────────────────────────────────────────────────────────────
// HOOK
// ──────────────────────────────────────────────────────────────────────────

/**
 * useEmailTemplates
 * Full CRUD hook for the zapp.email_templates table.
 */
export function useEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Fetch ──────────────────────────────────────────────────────────────
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbErr } = await supabase
        .from('email_templates')
        .select('*')
        .order('name', { ascending: true });

      if (!mountedRef.current) return;

      if (dbErr) {
        setError(dbErr.message);
        return;
      }

      setTemplates((data as EmailTemplate[]) ?? []);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // ── Create ─────────────────────────────────────────────────────────────
  const createTemplate = useCallback(
    async (input: EmailTemplateInput): Promise<{ error?: string }> => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const payload = {
          name: input.name.trim(),
          subject: input.subject.trim(),
          body: input.body,
          category: input.category,
          created_by: user?.id ?? null,
        };

        const { error: dbErr } = await supabase.from('email_templates').insert(payload);

        if (dbErr) return { error: dbErr.message };

        await fetchTemplates();
        return {};
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    [fetchTemplates]
  );

  // ── Update ─────────────────────────────────────────────────────────────
  const updateTemplate = useCallback(
    async (id: string, input: Partial<EmailTemplateInput>): Promise<{ error?: string }> => {
      try {
        const payload: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (input.name !== undefined) payload.name = input.name.trim();
        if (input.subject !== undefined) payload.subject = input.subject.trim();
        if (input.body !== undefined) payload.body = input.body;
        if (input.category !== undefined) payload.category = input.category;

        const { error: dbErr } = await supabase
          .from('email_templates')
          .update(payload)
          .eq('id', id);

        if (dbErr) return { error: dbErr.message };

        await fetchTemplates();
        return {};
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    [fetchTemplates]
  );

  // ── Delete ─────────────────────────────────────────────────────────────
  const deleteTemplate = useCallback(
    async (id: string): Promise<{ error?: string }> => {
      try {
        const { error: dbErr } = await supabase
          .from('email_templates')
          .delete()
          .eq('id', id);

        if (dbErr) return { error: dbErr.message };

        if (mountedRef.current) {
          setTemplates((prev) => prev.filter((t) => t.id !== id));
        }
        return {};
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    []
  );

  // ── Initial load ───────────────────────────────────────────────────────
  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    loading,
    error,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
