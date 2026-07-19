import { Sparkles, Check, X, Send, Tag, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAutomationSuggestions } from "@/hooks/useAutomationManagement";
import { cn } from "@/lib/utils";

interface AutomationSuggestionsBarProps {
  remoteJid: string | null;
  onUseSuggestion: (text: string) => void;
  onSendNow?: (text: string) => Promise<void> | void;
}

/** Automation Suggestions Bar component for the chat section. */
export function AutomationSuggestionsBar({
  remoteJid,
  onUseSuggestion,
  onSendNow,
}: AutomationSuggestionsBarProps) {
  const { suggestions, accept, dismiss, applyRecommendedTag } =
    useAutomationSuggestions(remoteJid);

  if (!suggestions.length) return null;

  return (
    <div className="px-3 pt-2 space-y-2">
      {suggestions.map((s) => (
        <Card
          key={s.id}
          className={cn(
            "p-3 border-border/10 bg-background flex items-start gap-3",
          )}
        >
          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant="secondary" className="text-[10px] uppercase">
                Automação
              </Badge>
              {s.rule_name && (
                <span className="text-xs text-muted-foreground truncate">
                  {s.rule_name}
                </span>
              )}
              {s.kb_sources.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] gap-1"
                  title={`Fontes: ${s.kb_sources.join(", ")}`}
                >
                  <BookOpen className="h-3 w-3" />
                  {s.kb_sources.length} fonte
                  {s.kb_sources.length > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <p className="text-sm text-foreground leading-snug whitespace-pre-wrap">
              {s.suggestion_text}
            </p>

            {s.recommended_tag && (
              <div className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded-md bg-accent/40 border border-accent">
                <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">
                  Tag sugerida:
                </span>
                <Badge variant="default" className="text-[10px]">
                  {s.recommended_tag}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs ml-auto"
                  onClick={() => applyRecommendedTag(s.id)}
                  title="Aplicar tag ao contato"
                >
                  Aplicar
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2 mt-2">
              <Button
                size="sm"
                variant="default"
                className="h-7"
                onClick={() => {
                  onUseSuggestion(s.suggestion_text ?? "");
                  accept(s.id);
                }}
              >
                <Check className="h-3.5 w-3.5 mr-1" /> Usar
              </Button>
              {onSendNow && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7"
                  onClick={async () => {
                    try {
                      await onSendNow(s.suggestion_text ?? "");
                      accept(s.id);
                    } catch {
                      // onSendNow handles its own error toasts
                    }
                  }}
                >
                  <Send className="h-3.5 w-3.5 mr-1" /> Enviar
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => dismiss(s.id)}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Descartar
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
