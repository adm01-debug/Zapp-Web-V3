import { useCallback, useEffect, useRef, useState } from 'react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { emailSaveDraft, emailDeleteDraft } from './gmail/gmailApi';
import { getLogger } from '@/lib/logger';

const log = getLogger('useEmailDraft');
const AUTO_SAVE_DELAY_MS = 30_000;

export interface DraftState {
  id?: string;
  email_draft_id?: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string;
  isDirty: boolean;
  lastSaved?: Date;
}

export function useEmailDraft(accountId: string | null, threadId?: string) {
  const [draft, setDraft] = useState<DraftState>({
    to: [],
    cc: [],
    subject: '',
    bodyHtml: '',
    isDirty: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (state: DraftState) => {
      if (!accountId || !state.isDirty) return;
      setIsSaving(true);

      try {
        const payload = {
          account_id: accountId,
          thread_id_ref: threadId ?? null,
          to_emails: state.to,
          cc_emails: state.cc,
          subject: state.subject,
          body_html: state.bodyHtml,
          last_saved_at: new Date().toISOString(),
        };

        let localId = state.id;

        if (localId) {
          await safeClient.from('email_drafts', (q) => q.update(payload).eq('id', localId));
        } else {
          const result = await safeClient.single<{ id: string }>('email_drafts', (q) =>
            q.insert(payload).select('id')
          );
          localId = result.data?.id;
        }

        const emailResult = await emailSaveDraft({
          accountId,
          draftId: state.email_draft_id,
          to: state.to,
          cc: state.cc,
          subject: state.subject,
          bodyHtml: state.bodyHtml,
          threadId,
        });

        setDraft((prev) => ({
          ...prev,
          id: localId,
          email_draft_id: (emailResult as { draftId?: string })?.draftId,
          isDirty: false,
          lastSaved: new Date(),
        }));
      } catch (err) {
        log.error('Email draft save error', err);
      } finally {
        setIsSaving(false);
      }
    },
    [accountId, threadId]
  );

  const update = useCallback(
    (patch: Partial<Omit<DraftState, 'isDirty'>>) => {
      setDraft((prev) => ({ ...prev, ...patch, isDirty: true }));

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setDraft((current) => {
          save(current);
          return current;
        });
      }, AUTO_SAVE_DELAY_MS);
    },
    [save]
  );

  const discard = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (draft.id) {
      await safeClient.from('email_drafts', (q) => q.delete().eq('id', draft.id));
    }
    if (accountId && draft.email_draft_id) {
      await emailDeleteDraft(accountId, draft.email_draft_id);
    }

    setDraft({ to: [], cc: [], subject: '', bodyHtml: '', isDirty: false });
  }, [accountId, draft]);

  const saveNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    save(draft);
  }, [draft, save]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return { draft, update, save: saveNow, discard, isSaving };
}
