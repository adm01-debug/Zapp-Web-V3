# Fix #3 light-mode contrast validation — 12 locations (commit 499b7b8e5)

Token check: --destructive = hsl(0 72% 42%) = #B81E1E  |  --destructive-foreground (old, removed) = #FFFFFF

 # file                                   bg (composite, light)    fg       ratio(WCAG)  ratio(g2.2)  BEFORE white verdict
--------------------------------------------------------------------------------------------------------------------------
 1 ConnectionsStats.tsx                   #FFFFFF                  #B81E1E  6.48         6.53         1.00         PASS
    └ stat value 'Ações necessárias' (text)
 2 ConnectionsView.tsx                    #FFFFFF                  #B81E1E  6.48         6.53         1.00         PASS
    └ stat value 'Ações necessárias' (text)
 3 connectionCardHelpers.ts               #F8E8E8                  #B81E1E  5.46         5.53         1.19         PASS
    └ status chip 'Desconectado' (text) — bg-destructive/10
 4 connectionCardHelpers.ts               #F8E8E8                  #B81E1E  5.46         5.53         1.19         PASS
    └ status chip 'Desconectando...' (text) — bg-destructive/10
 5 DegradedQuickActions.tsx               #F6E7E7                  #B81E1E  5.40         5.47         1.20         PASS
    └ latency chip >=800ms (text) — bg-destructive/10 over li bg-background/40
 6 ConnectionCard.tsx                     #F4DDDD                  #B81E1E  5.01         5.09         1.29         PASS
    └ Smartphone icon (needsAction) — bg-destructive/15 circle
 7 ConnectionCard.tsx                     #F9EDED                  #B81E1E  5.66         5.73         1.14         PASS
    └ AlertTriangle icon (severe) — bg-destructive/8 banner
 8 ConnectionCard.tsx                     #F9EDED                  #B81E1E  5.66         5.73         1.14         PASS
    └ warning reason text (severe) — bg-destructive/8 banner
 9 WhatsAppConnectionStatus.tsx           #EFE8EB                  #B81E1E  5.37         5.45         1.21         PASS
    └ Badge count 'n/total' + AlertCircle icon — bg-destructive/5 over header bg-muted/40
10 AuditLogPanel.tsx                      #F7F7FA                  #B81E1E  6.06         6.12         1.07         PASS
    └ old_values strikethrough text — bg-muted/10 detail row
11 ContactConsentManager.tsx              #F9F9FB                  #B81E1E  6.16         6.22         1.05         PASS
    └ 'Revogado em:' text (container transparent)
12 SLASettings.tsx                        #FFFFFF                  #B81E1E  6.48         6.53         1.00         PASS
    └ ShieldAlert icon in Label
--------------------------------------------------------------------------------------------------------------------------
PASS count: 12/12  @ WCAG AA 4.5:1

Note: BEFORE column = contrast of the OLD color (white text-destructive-foreground) on the same bg;
1.0-1.3:1 = invisible white-on-light — the exact bug Fix #3 removes.
Icons (h-3.5..h-5) additionally satisfy WCAG 1.4.11 non-text 3:1 with wide margin.
