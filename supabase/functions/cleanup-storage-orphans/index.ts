import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("cleanup-storage-orphans");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    log.info("Iniciando limpeza de arquivos órfãos nos buckets de mídia");

    const buckets = ["audio-messages", "whatsapp-media"];
    const results: Record<string, any> = {};
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const bucketName of buckets) {
      log.info(`Processando bucket: ${bucketName}`);
      
      // List files in the bucket
      const { data: files, error: listError } = await supabase.storage.from(bucketName).list('', {
        limit: 1000,
        sortBy: { column: 'created_at', order: 'asc' },
      });

      if (listError) {
        log.error(`Erro ao listar bucket ${bucketName}`, listError);
        continue;
      }

      const filesToDelete = files
        ?.filter(f => new Date(f.created_at) < oneDayAgo)
        .map(f => f.name) || [];

      if (filesToDelete.length > 0) {
        log.info(`Deletando ${filesToDelete.length} arquivos antigos de ${bucketName}`);
        const { data, error: deleteError } = await supabase.storage.from(bucketName).remove(filesToDelete);
        
        if (deleteError) {
          log.error(`Erro ao deletar arquivos de ${bucketName}`, deleteError);
          results[bucketName] = { error: deleteError.message };
        } else {
          results[bucketName] = { deleted: data?.length || 0 };
          
          // Log to audit table
          await supabase.from("storage_cleanup_logs").insert({
            bucket_id: bucketName,
            files_deleted: data?.length || 0,
            status: "success"
          });
        }
      } else {
        log.info(`Nenhum arquivo antigo encontrado em ${bucketName}`);
        results[bucketName] = { deleted: 0 };
      }
    }

    return jsonResponse({ success: true, results }, 200, req);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log.error("Erro fatal na limpeza", { error: msg });
    return errorResponse(msg, 500, req);
  }
});
