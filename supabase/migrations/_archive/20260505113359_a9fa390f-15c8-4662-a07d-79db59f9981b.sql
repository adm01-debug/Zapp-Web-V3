-- 1. Atualizar team_conversations para suportar roteamento
ALTER TABLE public.team_conversations 
ADD COLUMN IF NOT EXISTS routing_status TEXT DEFAULT 'pending' CHECK (routing_status IN ('pending', 'queued', 'assigned', 'closed')),
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;

-- 2. Atualizar profiles para controle de disponibilidade
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS online_status TEXT DEFAULT 'offline' CHECK (online_status IN ('online', 'busy', 'offline')),
ADD COLUMN IF NOT EXISTS current_load INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT now();

-- 3. Criar tabela de filas de roteamento
CREATE TABLE IF NOT EXISTS public.routing_queues (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    department_id UUID REFERENCES public.departments(id),
    name TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Criar tabela de regras de roteamento
CREATE TABLE IF NOT EXISTS public.routing_rules (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('load_balanced', 'round_robin', 'priority')),
    conditions JSONB DEFAULT '{}', -- Ex: {"start_time": "08:00", "end_time": "18:00", "days": [1,2,3,4,5]}
    department_id UUID REFERENCES public.departments(id),
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Habilitar RLS
ALTER TABLE public.routing_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Routing queues are viewable by authenticated users" ON public.routing_queues FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Routing rules are viewable by authenticated users" ON public.routing_rules FOR SELECT USING (auth.role() = 'authenticated');

-- 6. Função para calcular carga dos agentes
CREATE OR REPLACE FUNCTION public.calculate_agent_load(agent_id UUID)
RETURNS INTEGER AS $$
DECLARE
    active_chats INTEGER;
BEGIN
    SELECT count(*) INTO active_chats
    FROM public.team_conversations
    WHERE assigned_to = agent_id 
    AND routing_status = 'assigned';
    
    RETURN active_chats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Função de roteamento automático (Simples: Menor Carga)
CREATE OR REPLACE FUNCTION public.route_conversation()
RETURNS TRIGGER AS $$
DECLARE
    best_agent_id UUID;
    rule_record RECORD;
    is_within_hours BOOLEAN := true;
BEGIN
    -- Verificar se existe regra ativa para o departamento
    SELECT * INTO rule_record 
    FROM public.routing_rules 
    WHERE (department_id = NEW.department_id OR department_id IS NULL)
    AND is_active = true
    ORDER BY priority DESC LIMIT 1;

    -- Se houver regra, validar horário (exemplo simplificado)
    IF rule_record IS NOT NULL AND rule_record.conditions ? 'start_time' THEN
        -- Aqui entraria lógica complexa de timezone/horário
        -- Por ora, seguimos com roteamento direto se ativo
    END IF;

    -- Encontrar agente disponível com menor carga no departamento
    SELECT p.id INTO best_agent_id
    FROM public.profiles p
    WHERE (p.department_id = NEW.department_id OR NEW.department_id IS NULL)
    AND p.online_status = 'online'
    AND p.current_load < COALESCE(p.max_chats, 10)
    ORDER BY p.current_load ASC, p.last_seen DESC
    LIMIT 1;

    IF best_agent_id IS NOT NULL THEN
        NEW.assigned_to := best_agent_id;
        NEW.assigned_at := now();
        NEW.routing_status := 'assigned';
        
        -- Atualizar carga do agente
        UPDATE public.profiles 
        SET current_load = current_load + 1 
        WHERE id = best_agent_id;
    ELSE
        NEW.routing_status := 'queued';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Trigger para novas conversas
DROP TRIGGER IF EXISTS tr_auto_route_conversation ON public.team_conversations;
CREATE TRIGGER tr_auto_route_conversation
BEFORE INSERT ON public.team_conversations
FOR EACH ROW
EXECUTE FUNCTION public.route_conversation();
