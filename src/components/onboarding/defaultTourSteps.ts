import type { TourStep } from './tourContext';
import { getLogger } from '@/lib/logger';

const log = getLogger('defaultTourSteps');

/**
 * Filtra steps cujo seletor NÃO existe no DOM (E70.2).
 *
 * Step ausente é PULADO com aviso — o tour nunca quebra por um seletor
 * removido/renomeado na UI; ele progride apenas pelos steps disponíveis,
 * preservando a ordem original. SSR-safe: sem `document`, retorna os steps
 * intactos (não há DOM para validar).
 */
export function filterAvailableSteps(
  steps: TourStep[],
  doc: Document | null | undefined = typeof document === 'undefined' ? null : document
): TourStep[] {
  if (!doc) return steps;
  const available: TourStep[] = [];
  const missing: string[] = [];
  for (const step of steps) {
    try {
      if (doc.querySelector(step.target)) {
        available.push(step);
      } else {
        missing.push(step.id);
      }
    } catch {
      // Seletor com sintaxe inválida é tratado como ausente (nunca quebra o tour).
      missing.push(step.id);
    }
  }
  if (missing.length > 0) {
    log.warn(
      `Tour: ${missing.length} passo(s) ignorado(s) — seletor não encontrado no DOM: ${missing.join(', ')}`
    );
  }
  return available;
}

/** DEFAULT_ONBOARDING_STEPS component for the onboarding section. */
export const DEFAULT_ONBOARDING_STEPS: TourStep[] = [
  {
    id: 'inbox',
    target: '[data-tour="inbox"]',
    title: 'Inbox de Conversas',
    description:
      'Aqui você encontra todas as suas conversas em tempo real. Veja mensagens não lidas, responda clientes e gerencie seus atendimentos.',
    position: 'right',
  },
  {
    id: 'contacts',
    target: '[data-tour="contacts"]',
    title: 'Gestão de Contatos',
    description:
      'Acesse sua base de contatos, adicione novas informações e visualize o histórico completo de cada cliente.',
    position: 'right',
  },
  {
    id: 'dashboard',
    target: '[data-tour="dashboard"]',
    title: 'Dashboard & Métricas',
    description:
      'Acompanhe suas metas, visualize estatísticas de atendimento e monitore seu desempenho em tempo real.',
    position: 'right',
  },
  {
    id: 'queues',
    target: '[data-tour="queues"]',
    title: 'Filas de Atendimento',
    description:
      'Organize seus atendimentos em filas por departamento ou prioridade para melhor distribuição.',
    position: 'right',
  },
  {
    id: 'notifications',
    target: '[data-tour="notifications"]',
    title: 'Central de Notificações',
    description:
      'Receba alertas importantes sobre SLAs, metas alcançadas e atualizações do sistema.',
    position: 'right',
  },
  {
    id: 'theme',
    target: '[data-tour="theme"]',
    title: 'Personalização',
    description:
      'Alterne entre tema claro e escuro conforme sua preferência. Sua experiência, suas regras!',
    position: 'right',
  },
];
