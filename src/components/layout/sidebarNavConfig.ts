import {
  MessageSquare,
  User,
  UsersRound,
  BarChart3,
  Phone,
  Link2,
  Megaphone,
  Bot,
  Kanban,
  Wallet,
  Package,
  CreditCard,
  Tag,
  Brain,
  Workflow,
  Plug,
  Activity,
  PhoneCall,
  Calendar,
  CalendarClock,
  FileText,
  Inbox,
  Bell,
  FileBarChart,
  ClipboardList,
  AlertTriangle,
  Gauge,
  Mic,
  Trophy,
  Target,
  TrendingDown,
  Tags,
  Cpu,
  ShieldCheck,
  Shield,
  UserCog,
  Palette,
  BookOpen,
  Settings,
  Compass,
  LayoutDashboard,
  Lock,
  Mail,
  HardDrive,
  Building2,
  RefreshCw,
  Pause,
  Landmark,
  HeartPulse,
  BarChartHorizontal,
  ScrollText,
  Code2,
  Webhook,
  BrainCircuit,
  Search,
} from 'lucide-react';
import type { NavItemConfig } from './SidebarNavItem';

// ── Primary (always visible, ≤8 items) ────────────────────
/** primary Nav component for the layout section. */
export const primaryNav: readonly NavItemConfig[] = [
  { id: 'inbox', icon: MessageSquare, label: 'Chat' },
  { id: 'team-chat', icon: UsersRound, label: 'Teams' },
  { id: 'email-chat', icon: Mail, label: 'Email' },
  { id: 'contacts', icon: User, label: 'Contatos' },
  { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
  { id: 'pipeline', icon: Kanban, label: 'Pipeline' },
  { id: 'campaigns', icon: Megaphone, label: 'Campanhas' },
  { id: 'settings', icon: Settings, label: 'Configurações' },
] as const;

// ── Sales & CRM ───────────────────────────────────────────
/** sales Nav component for the layout section. */
export const salesNav: readonly NavItemConfig[] = [
  { id: 'crm360', icon: Building2, label: 'CRM 360°' },
  { id: 'wallet', icon: Wallet, label: 'Carteira' },
  { id: 'catalog', icon: Package, label: 'Catálogo' },
  { id: 'payments', icon: CreditCard, label: 'Pagamentos' },
  { id: 'tags', icon: Tag, label: 'Etiquetas' },
  { id: 'queues', icon: LayoutDashboard, label: 'Filas' },
  { id: 'schedule', icon: CalendarClock, label: 'Agendamentos' },
  { id: 'groups', icon: UsersRound, label: 'Grupos' },
] as const;

// ── Automation & AI ───────────────────────────────────────
/** automation Nav component for the layout section. */
export const automationNav: readonly NavItemConfig[] = [
  { id: 'chatbot', icon: Bot, label: 'Chatbot' },
  { id: 'automations', icon: RefreshCw, label: 'Automações' },
  { id: 'wa-flows', icon: Workflow, label: 'WhatsApp Flows' },
  { id: 'knowledge', icon: Brain, label: 'Base de Conhecimento' },
  { id: 'churn', icon: TrendingDown, label: 'Previsão Churn' },
  { id: 'ticket-classifier', icon: Tags, label: 'Classificador IA' },
  { id: 'campaigns', icon: Megaphone, label: 'Campanhas Clássicas' },
  { id: 'wa-templates', icon: FileText, label: 'Templates WA' },
] as const;

// ── Analytics (consolidated — was 12 items, now single group) ──
/** analytics Nav component for the layout section. */
export const analyticsNav: readonly NavItemConfig[] = [
  { id: 'reports', icon: FileBarChart, label: 'Relatórios' },
  { id: 'warroom', icon: AlertTriangle, label: 'War Room' },
  { id: 'sentiment', icon: HeartPulse, label: 'Sentimento' },
  { id: 'nps', icon: Gauge, label: 'NPS' },
  { id: 'sla', icon: Target, label: 'SLA' },
  { id: 'achievements', icon: Trophy, label: 'Conquistas' },
] as const;

// ── Connections & Integrations ────────────────────────────
/** connections Nav component for the layout section. */
export const connectionsNav: readonly NavItemConfig[] = [
  { id: 'connections', icon: Plug, label: 'Conexões & Integrações' },
  { id: 'omni-inbox', icon: Inbox, label: 'Omnichannel' },
  { id: 'voip', icon: PhoneCall, label: 'VoIP' },
  { id: 'meta-capi', icon: Activity, label: 'Meta CAPI' },
  { id: 'google-calendar', icon: Calendar, label: 'Calendário' },
] as const;

// ── System & Admin ────────────────────────────────────────
/** system Nav component for the layout section. */
export const systemNav: readonly NavItemConfig[] = [
  { id: 'agents-system', icon: Phone, label: 'TEAMS' },
  { id: 'agents-ops', icon: UsersRound, label: 'Atendentes Online', requiredRoles: ['supervisor'] },
  { id: 'security', icon: Shield, label: 'Segurança' },
  { id: 'privacy', icon: ShieldCheck, label: 'LGPD' },
  { id: 'admin', icon: UserCog, label: 'Admin' },
  { id: 'admin-connections', icon: Link2, label: 'BD Externo', requiredRoles: ['admin'] },
  { id: 'themes', icon: Palette, label: 'Skins' },
  { id: 'docs', icon: BookOpen, label: 'Documentação' },
] as const;

// ── Advanced / Admin-only (accessible via Admin view or ⌘K search) ──
/** advanced Nav component for the layout section. */
export const advancedNav: readonly NavItemConfig[] = [
  { id: 'audit-logs', icon: ScrollText, label: 'Auditoria' },
  { id: 'auto-export', icon: ClipboardList, label: 'Export Auto' },
  { id: 'transcriptions', icon: Mic, label: 'Transcrições' },
  { id: 'diagnostics', icon: Compass, label: 'Diagnóstico' },
  { id: 'performance', icon: Cpu, label: 'Performance' },
  { id: 'telemetry', icon: BarChartHorizontal, label: 'Telemetria BD' },
  { id: 'failed-messages', icon: AlertTriangle, label: 'DLQ — Falhas envio', requiredRoles: ['admin'] },
  { id: 'failed-auth-messages', icon: ShieldCheck, label: 'Falhas de Autenticação', requiredRoles: ['admin'] },
  { id: 'webhook-events', icon: Webhook, label: 'Webhook Events' },
  { id: 'webhook-overview', icon: BarChart3, label: 'Overview Webhook', requiredRoles: ['admin'] },
  { id: 'ai-usage', icon: BrainCircuit, label: 'Consumo IA' },
  { id: 'public-api', icon: Code2, label: 'API Pública' },
  { id: 'email-webhook', icon: Webhook, label: 'Email Webhook' },
  { id: 'media-migration', icon: HardDrive, label: 'Migração Mídia' },
  { id: 'sicoob-bridge', icon: Landmark, label: 'Sicoob Bridge' },
  { id: 'evolution-monitor', icon: Activity, label: 'Monitor Evolution' },
  { id: 'evolution-api-logs', icon: Activity, label: 'Logs Evolution API', requiredRoles: ['admin'] },
  { id: 'alert-history', icon: Bell, label: 'Histórico de Alertas', requiredRoles: ['admin'] },
  { id: 'webhook-secret', icon: ShieldCheck, label: 'Webhook Secret' },
  { id: 'instance-pauses', icon: Pause, label: 'Pausas de Instância' },
  { id: 'search-insights', icon: Search, label: 'Search Insights', requiredRoles: ['admin'] },
  { id: 'realtime-monitor', icon: Activity, label: 'Monitor em Tempo Real', requiredRoles: ['supervisor'] },
  { id: 'dispatch-errors-history', icon: ScrollText, label: 'Histórico Erros Dispatch', requiredRoles: ['supervisor'] },
  { id: 'inbox-sync-status', icon: Activity, label: 'Status do Inbox', requiredRoles: ['supervisor'] },
  { id: 'evo-api-health', icon: HeartPulse, label: 'Evo API Health', requiredRoles: ['admin'] },
  { id: 'bridge-status', icon: Activity, label: 'Bridge Status', requiredRoles: ['admin', 'supervisor'] },
  { id: 'email-status', icon: Mail, label: 'Status Email', requiredRoles: ['admin'] },
  { id: 'email-audit', icon: ScrollText, label: 'Auditoria Email', requiredRoles: ['admin'] },
] as const;

// ── Backward-compat re-exports ────────────────────────────
/** communication Nav component for the layout section. */
export const communicationNav = automationNav;

// ── Group definitions for collapsible sidebar (≤5 groups) ──
/** sidebar Groups component for the layout section. */
export const sidebarGroups = [
  { label: 'Vendas & CRM', icon: Kanban, items: salesNav },
  { label: 'Robôs & IA', icon: Bot, items: automationNav },
  { label: 'Análise', icon: BarChart3, items: analyticsNav },
  { label: 'Canais', icon: Plug, items: connectionsNav },
  { label: 'Sistema', icon: Lock, items: systemNav },
] as const;
