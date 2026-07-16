import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, Search, X, Building2, Tag } from 'lucide-react';
import { TalkXRecipientsList } from './TalkXRecipientsList';
import { TalkXCampaign } from '@/hooks/useTalkX';

interface ContactItem {
  id: string;
  name: string;
  nickname: string | null;
  phone: string;
  company: string | null;
  avatar_url: string | null;
  tags: string[] | null;
}

interface Props {
  campaign: TalkXCampaign | null;
  contacts: ContactItem[];
  filteredContacts: ContactItem[];
  selectedContacts: string[];
  contactSearch: string;
  setContactSearch: (v: string) => void;
  companyFilter: string;
  setCompanyFilter: (v: string) => void;
  tagFilter: string;
  setTagFilter: (v: string) => void;
  companies: string[];
  tags: string[];
  toggleContact: (id: string) => void;
  selectAll: () => void;
  clearFilters: () => void;
}

export const TalkXContactSelector: React.FC<Props> = ({
  campaign,
  contacts,
  filteredContacts,
  selectedContacts,
  contactSearch,
  setContactSearch,
  companyFilter,
  setCompanyFilter,
  tagFilter,
  setTagFilter,
  companies,
  tags,
  toggleContact,
  selectAll,
  clearFilters,
}) => {
  return (
    <Card className="flex h-fit max-h-[calc(100vh-200px)] flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-primary" />
            Contatos
            <Badge variant="secondary" className="text-[10px]">
              {selectedContacts.length}/{contacts.length}
            </Badge>
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={selectAll} className="shrink-0 text-xs">
            {filteredContacts.length > 0 &&
            filteredContacts.every((c) => selectedContacts.includes(c.id))
              ? 'Desmarcar'
              : 'Todos'}
          </Button>
        </div>
        {!campaign && (
          <div className="mt-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar contatos por nome, telefone ou empresa"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Buscar por nome, telefone, empresa..."
                className="h-9 pl-9 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {companies.length > 0 && (
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="h-7 w-auto min-w-[100px] max-w-[160px] text-[11px]">
                    <Building2 className="mr-1 h-3 w-3 shrink-0" />
                    <SelectValue placeholder="Empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas empresas</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {tags.length > 0 && (
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger className="h-7 w-auto min-w-[80px] max-w-[140px] text-[11px]">
                    <Tag className="mr-1 h-3 w-3 shrink-0" />
                    <SelectValue placeholder="Tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas tags</SelectItem>
                    {tags.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(companyFilter !== 'all' || tagFilter !== 'all') && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] text-muted-foreground"
                  onClick={clearFilters}
                >
                  <X className="mr-1 h-3 w-3" />
                  Limpar
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {filteredContacts.length} contatos filtrados • {selectedContacts.length} selecionados
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto">
        {campaign ? (
          <TalkXRecipientsList campaignId={campaign.id} />
        ) : (
          <div className="space-y-0.5">
            {filteredContacts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {contactSearch ? 'Nenhum contato encontrado' : 'Nenhum contato disponível'}
              </p>
            ) : (
              filteredContacts.map((contact) => {
                const isSelected = selectedContacts.includes(contact.id);
                return (
                  <label
                    key={contact.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl p-2.5 transition-all ${isSelected ? 'border border-primary/20 bg-primary/10' : 'border border-transparent hover:bg-muted/50'}`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleContact(contact.id)}
                    />
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {contact.avatar_url ? (
                        <img
                          src={contact.avatar_url}
                          alt=""
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        (contact.name || '?')[0].toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {contact.name}
                        {contact.nickname && (
                          <span className="ml-1 font-normal text-muted-foreground">
                            ({contact.nickname})
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {contact.phone}
                        {contact.company && ` · ${contact.company}`}
                      </p>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
