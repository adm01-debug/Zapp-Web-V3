import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const denied = requireServiceRoleOrCron(req);
  if (denied) return denied;

  const log = new Logger("cleanup-storage-orphans");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    log.info("Iniciando limpeza de arquivos órfãos nos buckets de mídia");

    const buckets = ["audio-messages", "whatsapp-media"];
    const results: Record<string, unknown> = {};
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

      const candidateFiles = files
        ?.filter(f => new Date(f.created_at) < oneDayAgo)
        .map(f => f.name) || [];

      // F11 security fix: only delete files with no active reference in evolution_messages.
      // Query by storage path suffix (not full URL) so custom domains, CDN rewrites, and URL encoding
      // differences don't cause false-orphan classifications.
      const referencedNames = new Set<string>();
      if (candidateFiles.length > 0) {
        const bucketPathSegment = `/${bucketName}/`;
        const { data: refRows, error: refError } = await supabase
          .from("evolution_messages")
          .select("media_url")
          .like("media_url", `%${bucketPathSegment}%`)
          .limit(10_000);
        if (refError) {
          log.error(`Erro ao consultar referências em ${bucketName}`, { error: refError.message });
          results[bucketName] = { error: "reference_lookup_failed" };
          continue;
        }
        if (refRows && refRows.length >= 10_000) {
          log.warn(`Referência lookup atingiu limite de 10k para ${bucketName} — pulando deleção para evitar falsos órfãos`);
          results[bucketName] = { skipped: "reference_limit_reached" };
          continue;
        }
        if (refRows) {
          const candidateSet = new Set(candidateFiles);
          for (const row of refRows) {
            if (row.media_url) {
              const parts = (row.media_url as string).split(bucketPathSegment);
              if (parts.length > 1) {
                // Take only the first path segment (filename) to ignore query strings
                const fileName = parts[parts.length - 1].split('?')[0].split('#')[0];
                if (candidateSet.has(fileName)) referencedNames.add(fileName);
              }
            }
          }
        }
      }

      const filesToDelete = candidateFiles.filter(name => !referencedNames.has(name));
      log.info(`Ref check: ${candidateFiles.length} candidates → ${filesToDelete.length} safe to delete`);

      if (filesToDelete.length > 0) {
        log.info(`Deletando ${filesToDelete.length} arquivos órfãos de ${bucketName} (${candidateFiles.length - filesToDelete.length} referenciados ignorados)`);
        const { data, error: deleteError } = await supabase.storage.from(bucketName).remove(filesToDelete);

        if (deleteError) {
          log.error(`Erro ao deletar arquivos de ${bucketName}`, { error: deleteError.message });
          results[bucketName] = { error: "delete_failed" };
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
        log.info(`Nenhum arquivo para deletar em ${bucketName}`);
        results[bucketName] = { deleted: 0 };
      }
    }

    return jsonResponse({ success: true, results }, 200, req);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    log.error("Erro fatal na limpeza", { error: msg });
    return errorResponse("Internal server error", 500, req);
  }
});
