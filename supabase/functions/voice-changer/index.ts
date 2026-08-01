import { handleCors, errorResponse, getCorsHeaders, Logger, requireEnv } from "../_shared/validation.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const VOICE_PRESETS: Record<string, { voiceId: string; label: string; isCloned?: boolean }> = {
  // Masculinas
  'grave':      { voiceId: 'JBFqnCBsd6RMkjVDRZzb', label: 'George (Grave)' },
  'roger':      { voiceId: 'CwhRBWXzGAHq8TQ4Fs17', label: 'Roger (Narrador)' },
  'animado':    { voiceId: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam (Animado)' },
  'misterioso': { voiceId: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel (Misterioso)' },
  'brian':      { voiceId: 'nPczCjzI2devNBz1zQrb', label: 'Brian' },
  'bill':       { voiceId: 'pqHfZKP75CvOlQylNhV4', label: 'Bill' },
  'eric':       { voiceId: 'cjVigY5qzO86Huf0OWal', label: 'Eric' },
  'will':       { voiceId: 'bIHbv24MWmeRgasZH58o', label: 'Will' },
  'callum':     { voiceId: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum' },
  'charlie':    { voiceId: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie' },
  // Femininas
  'feminina':   { voiceId: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah' },
  'laura':      { voiceId: 'FGY2WhTYpPnrIDTdsKH5', label: 'Laura' },
  'alice':      { voiceId: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Alice' },
  'matilda':    { voiceId: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda' },
  'jessica':    { voiceId: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica' },
  'lily':       { voiceId: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily' },
  // Neutras/Especiais
  'river':      { voiceId: 'SAz9YHcvj6GT2YYXdXww', label: 'River' },
  'robo':       { voiceId: 'iP95p4xoKVk53GoZ742B', label: 'Chris (Robô)' },
  'glitch':     { voiceId: 'kPtEHAvRnjUJFv7SK9WI', label: 'Glitch' },
  // Temáticas
  'santa':      { voiceId: 'MDLAMJ0jxkpYkjXbmG4t', label: 'Papai Noel' },
  'mrs_claus':  { voiceId: 'SAhdygBsjizE9aIj39dz', label: 'Mamãe Noel' },
  'elf':        { voiceId: 'e79twtVS2278lVZZQiAD', label: 'Elfo' },
  'reindeer':   { voiceId: 'h6u4tPKmcPlxUdZOaVpH', label: 'Rena' },
  // Infantis
  'crianca_f':  { voiceId: '21m00Tcm4TlvDq8ikWAM', label: 'Criança (Menina)' },
  'crianca_m':  { voiceId: 'AZnzlk1XhkKW9D2mID8L', label: 'Criança (Menino)' },
  // Idosos
  'idoso':      { voiceId: 'N2lVS1w4EtoT3dr4eOWO', label: 'Idoso (Vovô)' },
  'idosa':      { voiceId: 'XrExE9yKIg1WjnnlVkGX', label: 'Idosa (Vovó)' },
  // Cloned Placeholder (Exemplo para bloqueio)
  'cloned_sample': { voiceId: 'cloned_id_123', label: 'Celebridade X', isCloned: true },
};

const MAX_RETRIES = 3;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("voice-changer");

  try {
    const supabaseClient = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY')
    );

    let audioData: Blob | null = null;
    let voicePreset = 'grave';
    let taskId: string | null = null;
    let authorized = false;

    // Check if it's a multipart form or JSON (for queue processing)
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      audioData = formData.get('audio') as Blob | null;
      voicePreset = formData.get('voice_preset') as string || 'grave';
      taskId = formData.get('task_id') as string | null;
      authorized = formData.get('authorized') === 'true';
    } else if (contentType.includes('application/json')) {
      const json = await req.json();
      taskId = json.task_id;
      authorized = json.authorized || false;
    }

    // If we have a taskId but no audio, try to fetch from queue/storage
    if (taskId && !audioData) {
      const { data: task, error: taskError } = await supabaseClient
        .from('voice_conversion_queue')
        .select('*')
        .eq('id', taskId)
        .single();

      if (taskError || !task) return errorResponse('Task not found', 404, req);
      
      voicePreset = task.voice_preset;
      // Fetch audio from storage if input_audio_url is a path
      if (task.input_audio_url && task.input_audio_url.startsWith('http')) {
        const resp = await fetch(task.input_audio_url);
        audioData = await resp.blob();
      } else if (task.input_audio_url) {
        const { data: file, error: fileErr } = await supabaseClient.storage
          .from('audio-memes')
          .download(task.input_audio_url);
        if (fileErr) return errorResponse(`Storage error: ${fileErr.message}`, 500, req);
        audioData = file;
      }
    }

    if (!audioData) {
      return errorResponse('Audio data is required', 400, req);
    }

    const preset = VOICE_PRESETS[voicePreset];
    if (!preset) {
      return errorResponse(`Invalid voice preset: ${voicePreset}`, 400, req);
    }

    // Validation for cloned voices
    if (preset.isCloned && !authorized) {
      return errorResponse('Permissão necessária para usar esta voz clonada.', 403, req);
    }

    const startTime = Date.now();
    const telemetryData: any = {
      task_id: taskId,
      input_size_bytes: audioData.size,
      metadata: { preset: voicePreset, is_retry: false }
    };

    try {
      if (taskId) {
        // Use the DB function to "claim" the task and ensure order
        const { data: claimData, error: claimErr } = await supabaseClient.rpc('claim_next_voice_task', { p_user_id: (await supabaseClient.auth.getUser()).data.user?.id || taskId });
        
        if (claimErr) log.error("Error claiming task", { claimErr });
        
        // If we couldn't claim it (maybe another is processing), and this was a direct request for this taskId
        // we should either wait or inform the user it's queued.
        // For simplicity, we'll proceed if we have a taskId and it's not 'processing' by another.
        
        const { data: task } = await supabaseClient
          .from('voice_conversion_queue')
          .select('attempts, status')
          .eq('id', taskId)
          .single();
        
        if (task?.status === 'processing' && !telemetryData.metadata.is_retry) {
           // Someone else is already on it
           return new Response(JSON.stringify({ status: 'queued', message: 'Another conversion is in progress. This task is queued.' }), {
             status: 202,
             headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
           });
        }

        const currentAttempts = (task?.attempts || 0) + 1;
        telemetryData.metadata.is_retry = currentAttempts > 1;
        telemetryData.metadata.attempt = currentAttempts;

        await supabaseClient
          .from('voice_conversion_queue')
          .update({ 
            status: 'processing', 
            last_attempt_at: new Date().toISOString(),
            attempts: currentAttempts 
          })
          .eq('id', taskId);
      }

      const elevenlabsKey = requireEnv('ELEVENLABS_API_KEY');
      const apiFormData = new FormData();
      apiFormData.append('audio', audioData);
      apiFormData.append('model_id', 'eleven_multilingual_sts_v2');
      apiFormData.append('voice_settings', JSON.stringify({
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      }));

      const stsResponse = await fetch(
        `https://api.elevenlabs.io/v1/speech-to-speech/${preset.voiceId}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': elevenlabsKey },
          body: apiFormData,
        }
      );

      telemetryData.status_code = stsResponse.status;
      telemetryData.response_time_ms = Date.now() - startTime;

      if (!stsResponse.ok) {
        const errText = await stsResponse.text();
        telemetryData.error_type = stsResponse.status.toString();
        telemetryData.metadata.raw_error = errText.substring(0, 500);
        
        if (taskId) {
          const isRetryable = stsResponse.status >= 500 || stsResponse.status === 429;
          await supabaseClient
            .from('voice_conversion_queue')
            .update({ 
              status: 'failed', 
              error_message: `ElevenLabs Error: ${stsResponse.status} - ${errText.substring(0, 100)}` 
            })
            .eq('id', taskId);
          
          if (isRetryable) {
            log.info("Task failed with retryable error", { taskId, status: stsResponse.status });
          }
        }
        
        return errorResponse(`STS Failed: ${stsResponse.status}`, stsResponse.status === 429 ? 429 : 502, req);
      }

      const audioBuffer = await stsResponse.arrayBuffer();

      if (taskId) {
        // Optionally upload result to storage
        const outputPath = `voice-changer/results/${taskId}.mp3`;
        const { error: uploadErr } = await supabaseClient.storage
          .from('audio-memes')
          .upload(outputPath, audioBuffer, { contentType: 'audio/mpeg', upsert: true });

        const { data: urlData } = supabaseClient.storage.from('audio-memes').getPublicUrl(outputPath);

        await supabaseClient
          .from('voice_conversion_queue')
          .update({ 
            status: 'completed', 
            output_audio_url: urlData.publicUrl 
          })
          .eq('id', taskId);
      }

      await supabaseClient.from('sts_telemetry').insert(telemetryData);

      return new Response(audioBuffer, {
        status: 200,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'audio/mpeg',
        },
      });

    } catch (innerErr: any) {
      telemetryData.error_type = 'EXCEPTION';
      telemetryData.metadata.error = innerErr.message;
      await supabaseClient.from('sts_telemetry').insert(telemetryData);
      
      if (taskId) {
        await supabaseClient
          .from('voice_conversion_queue')
          .update({ status: 'failed', error_message: innerErr.message })
          .eq('id', taskId);
      }
      throw innerErr;
    }
  } catch (err: any) {
    log.error("Global Voice Changer Error", { error: err.message });
    return errorResponse(err.message || 'Internal Error', 500, req);
  }
});
