import React from 'react';
import {
  Users, Truck, UserCheck, Wrench, Star, Handshake, MoreHorizontal, Gift, Package,
} from 'lucide-react';

interface TypeConfig {
  label: string;
  icon: string;
  iconNode: React.ReactNode;
  gradient: string;
  dotBg: string;
  badgeClass: string;
}

/** CONTACT_TYPE_CONFIG component for the contacts section. */
export const CONTACT_TYPE_CONFIG: Record<string, TypeConfig> = {
  cliente: {
    label: 'Cliente',
    icon: '👤',
    iconNode: <Users className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(217_91%_60%)] to-[hsl(217_91%_45%)]',
    dotBg: 'bg-[hsl(217_91%_60%)]',
    badgeClass: 'border-[hsl(217_91%_60%)]/30 text-[hsl(217_91%_60%)] bg-[hsl(217_91%_60%)]/8',
  },
  fornecedor: {
    label: 'Fornecedor',
    icon: '🚛',
    iconNode: <Truck className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(270_60%_60%)] to-[hsl(270_60%_45%)]',
    dotBg: 'bg-[hsl(270_60%_60%)]',
    badgeClass: 'border-[hsl(270_60%_60%)]/30 text-[hsl(270_60%_60%)] bg-[hsl(270_60%_60%)]/8',
  },
  colaborador: {
    label: 'Colaborador',
    icon: '✓',
    iconNode: <UserCheck className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(142_71%_45%)] to-[hsl(142_71%_35%)]',
    dotBg: 'bg-[hsl(142_71%_45%)]',
    badgeClass: 'border-[hsl(142_71%_45%)]/30 text-[hsl(142_71%_45%)] bg-[hsl(142_71%_45%)]/8',
  },
  prestador_servico: {
    label: 'Prestador',
    icon: '🔧',
    iconNode: <Wrench className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(38_92%_50%)] to-[hsl(38_92%_40%)]',
    dotBg: 'bg-[hsl(38_92%_50%)]',
    badgeClass: 'border-[hsl(38_92%_50%)]/30 text-[hsl(38_92%_50%)] bg-[hsl(38_92%_50%)]/8',
  },
  lead: {
    label: 'Lead',
    icon: '⭐',
    iconNode: <Star className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(48_96%_53%)] to-[hsl(48_96%_40%)]',
    dotBg: 'bg-[hsl(48_96%_53%)]',
    badgeClass: 'border-[hsl(48_96%_53%)]/30 text-[hsl(48_96%_53%)] bg-[hsl(48_96%_53%)]/8',
  },
  parceiro: {
    label: 'Parceiro',
    icon: '🤝',
    iconNode: <Handshake className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(0_72%_51%)] to-[hsl(0_72%_40%)]',
    dotBg: 'bg-[hsl(0_72%_51%)]',
    badgeClass: 'border-[hsl(0_72%_51%)]/30 text-[hsl(0_72%_51%)] bg-[hsl(0_72%_51%)]/8',
  },
  sicoob_gifts: {
    label: 'Sicoob Gifts',
    icon: '🎁',
    iconNode: <Gift className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(199_89%_48%)] to-[hsl(199_89%_38%)]',
    dotBg: 'bg-[hsl(199_89%_48%)]',
    badgeClass: 'border-[hsl(199_89%_48%)]/30 text-[hsl(199_89%_48%)] bg-[hsl(199_89%_48%)]/8',
  },
  transportadora: {
    label: 'Transportadora',
    icon: '📦',
    iconNode: <Package className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(199_89%_48%)] to-[hsl(199_89%_38%)]',
    dotBg: 'bg-[hsl(199_89%_48%)]',
    badgeClass: 'border-[hsl(199_89%_48%)]/30 text-[hsl(199_89%_48%)] bg-[hsl(199_89%_48%)]/8',
  },
  outros: {
    label: 'Outros',
    icon: '…',
    iconNode: <MoreHorizontal className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(0_0%_45%)] to-[hsl(0_0%_35%)]',
    dotBg: 'bg-[hsl(0_0%_45%)]',
    badgeClass: 'border-[hsl(0_0%_45%)]/30 text-[hsl(0_0%_45%)] bg-[hsl(0_0%_45%)]/8',
  },
};
