/**
 * ContactCompanyField — campo de empresa do form de contato com sugestões do
 * cadastro local zapp.companies (CONTATOS-14).
 *
 * Não quebra o contrato do form: o valor continua uma string livre
 * (contacts.company). O usuário pode (a) selecionar uma empresa cadastrada
 * (vínculo pelo nome) ou (b) digitar um nome novo — comportamento original.
 * O link "Gerenciar empresas..." abre o CRUD local (CompaniesManagerDialog).
 */
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command';
import { Building2, Settings2 } from 'lucide-react';
import { useCompanies } from '@/hooks/contacts/useCompanies';
import { CompaniesManagerDialog } from './CompaniesManagerDialog';

interface ContactCompanyFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/** Contact Company Field component for the contacts section. */
export function ContactCompanyField({ value, onChange }: ContactCompanyFieldProps) {
  const { companies, loading, loadError } = useCompanies();
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? companies.filter((c) => c.name.toLowerCase().includes(q)) : companies;
    return list.slice(0, 8);
  }, [companies, value]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Input
            id="company"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Nome da empresa"
            maxLength={300}
            autoComplete="organization"
          />
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          sideOffset={4}
        >
          <Command>
            <CommandList className="max-h-[260px]">
              {loading ? (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  Carregando empresas...
                </div>
              ) : loadError ? (
                <div className="px-3 py-4 text-xs text-destructive">{loadError}</div>
              ) : suggestions.length === 0 ? (
                <CommandEmpty>
                  Nenhuma empresa cadastrada — digite para usar nome livre.
                </CommandEmpty>
              ) : (
                <CommandGroup heading="Empresas cadastradas">
                  {suggestions.map((company) => (
                    <CommandItem
                      key={company.id}
                      value={company.name}
                      onSelect={() => {
                        onChange(company.name);
                        setOpen(false);
                      }}
                      className="cursor-pointer gap-2"
                    >
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{company.name}</span>
                      {company.cnpj && (
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {company.cnpj}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandSeparator />
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  setManageOpen(true);
                }}
                className="cursor-pointer gap-2"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Gerenciar empresas...
              </CommandItem>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <CompaniesManagerDialog open={manageOpen} onOpenChange={setManageOpen} />
    </>
  );
}

export default ContactCompanyField;
