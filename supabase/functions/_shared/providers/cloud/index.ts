/**
 * providers/cloud/index.ts — Barrel do provider WhatsApp Cloud (Meta)
 * E68/E-P2 do Plano de Desacoplamento 100 Etapas (Runbook Troca de Provider).
 *
 * Espelho do padrão de evolution/index.ts: o barrel re-exporta client.ts,
 * que expõe a factory `createCloudClient(config)` + singleton `getCloudClient()`
 * e os tipos (CloudClient, CloudClientConfig, CloudClientResponse...).
 * Uso: import { getCloudClient } from '../providers/cloud/index.ts';
 */
export * from './client.ts';
