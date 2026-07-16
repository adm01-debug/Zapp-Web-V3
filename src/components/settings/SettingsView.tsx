import { NPSDashboard } from '@/components/nps/NPSDashboard';
import { FollowUpSequences } from '@/components/settings/FollowUpSequences';
import { QuickRepliesManager } from '@/features/inbox';
import { StickerManager } from '@/features/inbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  MessageSquare,
  Bell,
  Palette,
  Save,
  RefreshCw,
  Loader2,
  Keyboard,
  Volume2,
  ArrowRight,
  Package,
  Globe,
  TrendingUp,
  Settings,
  Tags,
  MessageSquareHeart,
  Bot,
  Brain,
  Users,
  ShieldAlert,
} from 'lucide-react';
import { AIAutoTagsConfig } from '@/components/settings/AIAutoTagsConfig';
import { AIProvidersManager } from '@/components/settings/AIProvidersManager';
import { CSATAutoConfig } from '@/components/settings/CSATAutoConfig';
import { ChatbotL1Config } from '@/components/settings/ChatbotL1Config';
import { SkillBasedRoutingSettings } from '@/components/settings/SkillBasedRoutingSettings';
import { SoundCustomizationPanel } from '@/components/settings/SoundCustomizationPanel';
import { ElevenLabsDialogue } from '@/components/voice/ElevenLabsDialogue';
import { ElevenLabsVoiceDesign } from '@/components/voice/ElevenLabsVoiceDesign';
import { MediaLibraryAdmin } from '@/components/settings/MediaLibraryAdmin';
import { NotificationSettingsPanel } from '@/components/notifications/NotificationSettingsPanel';
import { KeyboardShortcutsSettings } from '@/components/settings/KeyboardShortcutsSettings';
import { GlobalSettingsSection } from '@/components/settings/GlobalSettingsSection';
import { IntegrationKeysSection } from '@/components/settings/IntegrationKeysSection';
import { ScheduleSettings } from '@/components/settings/ScheduleSettings';
import { MessagesSettings } from '@/components/settings/MessagesSettings';
import { AutomationSettings } from '@/components/settings/AutomationSettings';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { SLASettings } from '@/components/settings/SLASettings';
import { PageTemplate } from '@/components/layout/PageTemplate';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useOnboarding } from '@/hooks/useOnboarding';
import { toast } from 'sonner';

export function SettingsView() {
  const { settings, isLoading, isSaving, updateSettings, saveSettings, toggleWorkDay } =
    useUserSettings();
  const { resetOnboarding } = useOnboarding();

  const handleResetOnboarding = () => {
    resetOnboarding();
    toast.success('Tour de onboarding reiniciado! Volte ao Dashboard para iniciar o tour.');
  };

  return (
    <PageTemplate
      title="Configurações"
      subtitle="Configure o comportamento da plataforma"
      icon={<Settings className="h-5 w-5" />}
      actions={
        <Button
          onClick={saveSettings}
          disabled={isSaving || isLoading}
          className="bg-whatsapp text-primary-foreground hover:bg-whatsapp-dark"
        >
          {isSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Salvar Alterações
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-4">
          {/* Skeleton tabs bar */}
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 flex-shrink-0 rounded-md" />
            ))}
          </div>
          {/* Skeleton form fields matching settings layout */}
          <div className="space-y-5 rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-5 w-48" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`field-${i}`} className="space-y-2">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <Skeleton className="h-9 w-28 rounded-md" />
              <Skeleton className="h-9 w-20 rounded-md" />
            </div>
          </div>
          <div className="space-y-5 rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-5 w-36" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={`toggle-${i}`} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-11 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <Tabs defaultValue="schedule" className="space-y-4">
          {/* Scrollable tabs with fade edges and scroll indicators */}
          <div className="group relative">
            <div
              className="scrollbar-none -mx-1 overflow-x-auto scroll-smooth px-1"
              id="settings-tabs-scroll"
            >
              <TabsList className="inline-flex w-max gap-1 bg-muted/50 p-1">
                <TabsTrigger value="schedule" className="gap-2 whitespace-nowrap">
                  <Clock className="h-4 w-4" />
                  Horário
                </TabsTrigger>
                <TabsTrigger value="messages" className="gap-2 whitespace-nowrap">
                  <MessageSquare className="h-4 w-4" />
                  Mensagens
                </TabsTrigger>
                <TabsTrigger value="automation" className="gap-2 whitespace-nowrap">
                  <RefreshCw className="h-4 w-4" />
                  Automação
                </TabsTrigger>
                <TabsTrigger value="notifications" className="gap-2 whitespace-nowrap">
                  <Bell className="h-4 w-4" />
                  Notificações
                </TabsTrigger>
                <TabsTrigger value="appearance" className="gap-2 whitespace-nowrap">
                  <Palette className="h-4 w-4" />
                  Aparência
                </TabsTrigger>
                <TabsTrigger value="shortcuts" className="gap-2 whitespace-nowrap">
                  <Keyboard className="h-4 w-4" />
                  Atalhos
                </TabsTrigger>
                <TabsTrigger value="sounds" className="gap-2 whitespace-nowrap">
                  <Volume2 className="h-4 w-4" />
                  Sons
                </TabsTrigger>
                <TabsTrigger value="global" className="gap-2 whitespace-nowrap">
                  <Globe className="h-4 w-4" />
                  Global
                </TabsTrigger>
                <TabsTrigger value="followup" className="gap-2 whitespace-nowrap">
                  <ArrowRight className="h-4 w-4" />
                  Follow-up
                </TabsTrigger>
                <TabsTrigger value="media" className="gap-2 whitespace-nowrap">
                  <Package className="h-4 w-4" />
                  Mídia
                </TabsTrigger>
                <TabsTrigger value="nps" className="gap-2 whitespace-nowrap">
                  <TrendingUp className="h-4 w-4" />
                  NPS
                </TabsTrigger>
                <TabsTrigger value="ai-tags" className="gap-2 whitespace-nowrap">
                  <Tags className="h-4 w-4" />
                  Tags IA
                </TabsTrigger>
                <TabsTrigger value="csat" className="gap-2 whitespace-nowrap">
                  <MessageSquareHeart className="h-4 w-4" />
                  CSAT
                </TabsTrigger>
                <TabsTrigger value="chatbot-l1" className="gap-2 whitespace-nowrap">
                  <Bot className="h-4 w-4" />
                  Chatbot L1
                </TabsTrigger>
                <TabsTrigger value="routing" className="gap-2 whitespace-nowrap">
                  <Users className="h-4 w-4" />
                  Roteamento
                </TabsTrigger>
                <TabsTrigger value="sla" className="gap-2 whitespace-nowrap">
                  <ShieldAlert className="h-4 w-4" />
                  SLA
                </TabsTrigger>
                <TabsTrigger value="ai-providers" className="gap-2 whitespace-nowrap">
                  <Brain className="h-4 w-4" />
                  Gestão IA
                </TabsTrigger>
              </TabsList>
            </div>
            {/* Fade edges — left and right */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-card to-transparent opacity-0 transition-opacity" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent" />
            {/* Scroll hint text */}
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1">
              <span className="animate-pulse text-[9px] text-muted-foreground/40">›</span>
            </div>
          </div>

          <TabsContent value="schedule">
            <ScheduleSettings
              settings={settings}
              updateSettings={updateSettings}
              toggleWorkDay={toggleWorkDay}
            />
          </TabsContent>

          <TabsContent value="messages">
            <div className="space-y-6">
              <MessagesSettings settings={settings} updateSettings={updateSettings} />
              <QuickRepliesManager compact={false} />
            </div>
          </TabsContent>

          <TabsContent value="automation">
            <AutomationSettings settings={settings} updateSettings={updateSettings} />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationSettingsPanel />
          </TabsContent>

          <TabsContent value="appearance">
            <AppearanceSettings
              settings={settings}
              updateSettings={updateSettings}
              onResetOnboarding={handleResetOnboarding}
            />
          </TabsContent>

          <TabsContent value="shortcuts">
            <KeyboardShortcutsSettings />
          </TabsContent>

          <TabsContent value="sounds">
            <div className="space-y-6">
              <SoundCustomizationPanel />
              <ElevenLabsDialogue />
              <ElevenLabsVoiceDesign />
            </div>
          </TabsContent>

          <TabsContent value="global">
            <div className="space-y-6">
              <GlobalSettingsSection />
              <IntegrationKeysSection />
            </div>
          </TabsContent>

          <TabsContent value="followup">
            <FollowUpSequences />
          </TabsContent>

          <TabsContent value="media">
            <div className="space-y-6">
              <MediaLibraryAdmin />
              <StickerManager mode="manager" />
            </div>
          </TabsContent>

          <TabsContent value="nps">
            <NPSDashboard />
          </TabsContent>

          <TabsContent value="ai-tags">
            <AIAutoTagsConfig />
          </TabsContent>

          <TabsContent value="csat">
            <CSATAutoConfig />
          </TabsContent>

          <TabsContent value="chatbot-l1">
            <ChatbotL1Config />
          </TabsContent>

          <TabsContent value="routing">
            <SkillBasedRoutingSettings />
          </TabsContent>

          <TabsContent value="sla">
            <SLASettings settings={settings} updateSettings={updateSettings} />
          </TabsContent>

          <TabsContent value="ai-providers">
            <AIProvidersManager />
          </TabsContent>
        </Tabs>
      )}
    </PageTemplate>
  );
}
