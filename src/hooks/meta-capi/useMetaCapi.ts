// @ts-nocheck
/**
 * useMetaCapi — Wave 3 blueprint (2026-07-06)
 * Extração da camada de dados do MetaCAPIView (componente ficou 100% UI).
 * Padrão-referência para as demais extrações: comportamento byte-idêntico,
 * componente nunca importa supabase.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from '@/hooks/use-toast';

export interface CAPIEvent {
  id: string;
  event_name: string;
  event_time: string;
  contact_id: string | null;
  pixel_id: string | null;
  action_source: string;
  custom_data: Json;
  sent_to_meta: boolean;
  created_at: string;
}

export function useMetaCapi() {
  const [events, setEvents] = useState<CAPIEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [pixelId, setPixelId] = useState('');
  const [autoTrack, setAutoTrack] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('meta_capi_events')
      .select('*')
      .order('event_time', { ascending: false })
      .limit(100);
    if (!mountedRef.current) return;
    if (error) {
      setLoading(false);
      return;
    }
    if (data) setEvents(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    let cancelled = false;
    const loadConfig = async () => {
      const { data } = await supabase
        .from('global_settings')
        .select('key, value')
        .in('key', ['meta_pixel_id', 'meta_capi_auto_track']);
      if (cancelled) return;
      if (data) {
        const pixel = data.find((d) => d.key === 'meta_pixel_id');
        const auto = data.find((d) => d.key === 'meta_capi_auto_track');
        if (pixel?.value) setPixelId(pixel.value);
        if (auto?.value) setAutoTrack(auto.value === 'true');
      }
    };
    loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveConfig = useCallback(async () => {
    const upsert = async (key: string, value: string) => {
      const { data: existing } = await supabase
        .from('global_settings')
        .select('id')
        .eq('key', key)
        .maybeSingle();
      if (existing) {
        await supabase.from('global_settings').update({ value }).eq('key', key);
      } else {
        await supabase.from('global_settings').insert({ key, value });
      }
    };
    await upsert('meta_pixel_id', pixelId);
    await upsert('meta_capi_auto_track', String(autoTrack));
    toast({ title: 'Configurações salvas!' });
  }, [pixelId, autoTrack]);

  const sendTestEvent = useCallback(
    async (eventName: string) => {
      const { error: insertErr } = await supabase.from('meta_capi_events').insert({
        event_name: eventName,
        pixel_id: pixelId || null,
        action_source: 'chat',
        custom_data: { test: true, value: 0 },
      });
      if (insertErr) {
        toast({ title: 'Erro', description: insertErr.message, variant: 'destructive' });
        return;
      }
      toast({ title: `Evento "${eventName}" registrado!` });
      fetchEvents();
    },
    [pixelId, fetchEvents]
  );

  return {
    events,
    loading,
    pixelId,
    setPixelId,
    autoTrack,
    setAutoTrack,
    fetchEvents,
    saveConfig,
    sendTestEvent,
  };
}
