import { handleCors, errorEnvelope, jsonResponse, Logger, readJsonBodyOrEmpty } from "../_shared/validation.ts";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const denied = requireServiceRoleOrCron(req);
  if (denied) return denied;

  // Contrato cleanup-storage-orphans@v1 (G4): cron/GET sem body → {} aceito.
  const parsed = parseOrReject('cleanup-storage-orphans', CONTRACT_SCHEMAS['cleanup-storage-orphans'], req, await readJsonBodyOrEmpty(req), {
    extraHeaders: getCorsHeaders(req),
  });
  if (parsed.ok === false) return parsed.response;

  const log = new Logger("cleanup-storage-orphans");
  const supabase = createZappAdminClient();

  try {
    log.info("Iniciando limpeza de arquivos órfãos nos buckets de mídia");

    const buckets = ["audio-messages", "whatsapp-media"];
    const results: Record<string, unknown> = {};
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Bug fix (2026-08-09 — E-45): list('') retornava apenas diretórios raiz do bucket,
    // não os arquivos dentro dos subdiretórios. A função deletava 0 arquivos em toda execução.
    // Fix: iterar os prefixes conhecidos de cada bucket com paginação completa.
    const BUCKET_PREFIXES: Record<string, string[]> = {
      'whatsapp-media': ['image', 'video', 'document', 'sticker'],
      'audio-messages': ['audio'],
    };

    for (const bucketName of buckets) {
      log.info(`Processando bucket: ${bucketName}`);

      const allFiles: Array<{ name: string; created_at: string }> = [];
      const prefixes = BUCKET_PREFIXES[bucketName] ?? [''];
      let listFailed = false;

      for (const prefix of prefixes) {
        let offset = 0;
        while (true) {
          const { data: files, error: listError } = await supabase.storage.from(bucketName).list(prefix, {
            limit: 1000,
            offset,
            sortBy: { column: 'created_at', order: 'asc' },
          });

          if (listError) {
            log.error(`Erro ao listar ${bucketName}/${prefix} (offset=${offset})`, listError as unknown as Record<string, unknown>);
            listFailed = true;
            break;
          }

          const items = Array.isArray(files) ? files : [];
          for (const f of items) {
            if (typeof f === 'object' && f !== null && typeof f.created_at === 'string' && typeof f.name === 'string') {
              // Path completo incluindo subdiretório: ex "image/3EB0...jpg"
              allFiles.push({ name: `${prefix}/${f.name}`, created_at: f.created_at });
            }
          }

          if (items.length < 1000) break; // Última página deste prefix
          offset += 1000;
        }
        if (listFailed) break;
      }

      if (listFailed) {
        results[bucketName] = { error: 'list_failed' };
        continue;
      }

      log.info(`${bucketName}: ${allFiles.length} arquivos totais nos subdiretórios`);

      const candidateFiles = allFiles
        .filter(f => new Date(f.created_at) < oneDayAgo)
        .map(f => f.name);

      // F11 security fix: only delete files with no active reference in evolution_messages.
      // Query by storage path suffix (not full URL) so custom domains, CDN rewrites, and URL encoding
      // differences don't cause false-orphan classifications.
      // Paginate to handle arbitrarily large message tables without skipping cleanup permanently.
      const referencedNames = new Set<string>();
      if (candidateFiles.length > 0) {
        const bucketPathSegment = `/${bucketName}/`;
        const candidateSet = new Set(candidateFiles);
        const PAGE_SIZE = 1000;
        let page = 0;
        let lookupFailed = false;

        while (true) {
          const { data: refRows, error: refError } = await supabase
            .from("evolution_messages")
            .select("media_url")
            .like("media_url", `%${bucketPathSegment}%`)
            .order('id')
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

          if (refError) {
            log.error(`Erro ao consultar referências em ${bucketName} (página ${page})`, { error: refError.message });
            lookupFailed = true;
            break;
          }

          const refRowArray = Array.isArray(refRows) ? refRows : [];
          for (const row of refRowArray) {
            if (typeof row === 'object' && row !== null) {
              const rowObj = row as Record<string, unknown>;
              const mediaUrl = rowObj.media_url;
              if (typeof mediaUrl === 'string') {
                const parts = mediaUrl.split(bucketPathSegment);
                if (parts.length > 1) {
                  // Take only the first path segment (filename) to ignore query strings
                  const fileName = parts[parts.length - 1].split('?')[0].split('#')[0];
                  if (candidateSet.has(fileName)) referencedNames.add(fileName);
                }
              }
            }
          }

          if (refRowArray.length < PAGE_SIZE) break;
          page++;
        }

        if (lookupFailed) {
          results[bucketName] = { error: "reference_lookup_failed" };
          continue;
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
          const deletedCount = Array.isArray(data) ? data.length : 0;
          results[bucketName] = { deleted: deletedCount };

          // Log to audit table
          await supabase.from("storage_cleanup_logs").insert({
            bucket_id: bucketName,
            files_deleted: deletedCount,
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
    return errorEnvelope('internal_error', "Internal server error", 500, req);
  }
});
