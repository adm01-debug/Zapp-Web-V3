import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tag, Filter, SortAsc, X,
  GitCompareArrows, Merge, LayoutList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContactViewSwitcher, type ContactViewMode } from './ContactViewSwitcher';
import { FilterPresets, type FilterPreset } from './FilterPresets';
import { ContactSearchWithSuggestions } from './ContactSearchWithSuggestions';
import { ContactAdvancedFilters } from './ContactAdvancedFilters';

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nome (A-Z)' },
  { value: 'name_desc', label: 'Nome (Z-A)' },
  { value: 'created_desc', label: 'Mais recentes' },
  { value: 'created_asc', label: 'Mais antigos' },
  { value: 'updated_desc', label: 'Atualizado recentemente' },
];

interface ContactToolbarProps {
  searchInput: string;
  onSearchChange: (val: string) => void;
  sortBy: string;
  setSortBy: (val: string) => void;
  showFilters: boolean;
  setShowFilters: (val: boolean) => void;
  activeFiltersCount: number;
  clearFilters: () => void;
  activeTab: string;
  filterCompany: string;
  setFilterCompany: (val: string) => void;
  filterJobTitle: string;
  setFilterJobTitle: (val: string) => void;
  filterTag: string;
  setFilterTag: (val: string) => void;
  filterDateRange: string;
  setFilterDateRange: (val: string) => void;
  uniqueCompanies: string[];
  uniqueJobTitles: string[];
  uniqueTags: string[];
  onApplyPreset: (preset: FilterPreset) => void;
  groupByCompany: boolean;
  setGroupByCompany: (val: boolean) => void;
  selectedIds: string[];
  onBulkTag: () => void;
  onCompare: () => void;
  onMerge: () => void;
  viewMode: ContactViewMode;
  setViewMode: (mode: ContactViewMode) => void;
  gridColumns: number;
  setGridColumns: (cols: number) => void;
  totalCount: number;
}

/** Contact Toolbar component for the contacts section. */
export function ContactToolbar({
  searchInput, onSearchChange, sortBy, setSortBy,
  showFilters, setShowFilters, activeFiltersCount, clearFilters,
  activeTab, filterCompany, setFilterCompany, filterJobTitle, setFilterJobTitle,
  filterTag, setFilterTag, filterDateRange, setFilterDateRange,
  uniqueCompanies, uniqueJobTitles, uniqueTags,
  onApplyPreset, groupByCompany, setGroupByCompany,
  selectedIds, onBulkTag, onCompare, onMerge,
  viewMode, setViewMode, gridColumns, setGridColumns, totalCount,
}: ContactToolbarProps) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap bg-muted/30 p-2 rounded-xl border border-border/50 backdrop-blur-sm">
        <ContactSearchWithSuggestions
          value={searchInput}
          onChange={onSearchChange}
          uniqueCompanies={uniqueCompanies}
          uniqueTags={uniqueTags}
          totalCount={totalCount}
        />

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px] h-10 bg-background/50 border border-border/50 shadow-sm hover:bg-background transition-all">
              <SortAsc className="w-4 h-4 mr-2 text-primary/70" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={showFilters ? "default" : "outline"}
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "h-10 bg-background/50 border border-border/50 shadow-sm hover:bg-background transition-all",
              showFilters && "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            aria-expanded={showFilters}
          >
            <Filter className={cn("w-4 h-4 mr-2", !showFilters && "text-primary/70")} />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-2 bg-primary-foreground/20 text-xs text-inherit">{activeFiltersCount}</Badge>
            )}
          </Button>

          <FilterPresets
            currentFilters={{ type: activeTab, company: filterCompany, jobTitle: filterJobTitle, tag: filterTag, dateRange: filterDateRange }}
            onApplyPreset={onApplyPreset}
          />

          <Button
            variant={groupByCompany ? "default" : "outline"}
            size="sm"
            onClick={() => setGroupByCompany(!groupByCompany)}
            className="h-10 gap-1.5"
          >
            <LayoutList className="w-4 h-4" />
            Agrupar
          </Button>
        </div>

        {selectedIds.length >= 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={onBulkTag}>
              <Tag className="w-4 h-4" />
              Tags ({selectedIds.length})
            </Button>
            {selectedIds.length >= 2 && (
              <>
                <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={onCompare}>
                  <GitCompareArrows className="w-4 h-4" />
                  Comparar
                </Button>
                <Button variant="outline" size="sm" className="h-10 gap-1.5 border-primary/30 text-primary" onClick={onMerge}>
                  <Merge className="w-4 h-4" />
                  Mesclar
                </Button>
              </>
            )}
          </div>
        )}

        <div className="ml-auto">
          <ContactViewSwitcher
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            gridColumns={gridColumns}
            onGridColumnsChange={setGridColumns}
          />
        </div>
      </div>

      {/* Active Filter Chips */}
      <AnimatePresence>
        {activeFiltersCount > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex flex-wrap items-center gap-2 px-1"
          >
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1">Filtros ativos:</span>
            
            {filterCompany && (
              <Badge variant="outline" className="pl-2 pr-1 h-7 gap-1 bg-primary/5 border-primary/20 text-primary animate-in fade-in slide-in-from-left-2">
                Empresa: {filterCompany}
                <Button aria-label="Limpar filtro de empresa" variant="ghost" size="icon" className="h-4 w-4 rounded-full hover:bg-primary/20" onClick={() => setFilterCompany('')}>
                  <X className="w-3 h-3" />
                </Button>
              </Badge>
            )}

            {filterJobTitle && (
              <Badge variant="outline" className="pl-2 pr-1 h-7 gap-1 bg-primary/5 border-primary/20 text-primary animate-in fade-in slide-in-from-left-2">
                Cargo: {filterJobTitle}
                <Button aria-label="Limpar filtro de cargo" variant="ghost" size="icon" className="h-4 w-4 rounded-full hover:bg-primary/20" onClick={() => setFilterJobTitle('')}>
                  <X className="w-3 h-3" />
                </Button>
              </Badge>
            )}

            {filterTag && (
              <Badge variant="outline" className="pl-2 pr-1 h-7 gap-1 bg-primary/5 border-primary/20 text-primary animate-in fade-in slide-in-from-left-2">
                Tag: {filterTag}
                <Button aria-label="Limpar filtro de etiqueta" variant="ghost" size="icon" className="h-4 w-4 rounded-full hover:bg-primary/20" onClick={() => setFilterTag('')}>
                  <X className="w-3 h-3" />
                </Button>
              </Badge>
            )}

            {filterDateRange !== 'all' && (
              <Badge variant="outline" className="pl-2 pr-1 h-7 gap-1 bg-primary/5 border-primary/20 text-primary animate-in fade-in slide-in-from-left-2">
                Período: {filterDateRange}
                <Button aria-label="Limpar filtro de período" variant="ghost" size="icon" className="h-4 w-4 rounded-full hover:bg-primary/20" onClick={() => setFilterDateRange('all')}>
                  <X className="w-3 h-3" />
                </Button>
              </Badge>
            )}

            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-[10px] uppercase font-bold tracking-tight text-muted-foreground hover:text-destructive transition-colors px-2">
              Limpar tudo
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Advanced Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div 
            id="contact-filters-panel" 
            role="region" 
            aria-label="Painel de filtros avançados"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <ContactAdvancedFilters
              filterCompany={filterCompany} setFilterCompany={setFilterCompany}
              filterJobTitle={filterJobTitle} setFilterJobTitle={setFilterJobTitle}
              filterTag={filterTag} setFilterTag={setFilterTag}
              filterDateRange={filterDateRange} setFilterDateRange={setFilterDateRange}
              uniqueCompanies={uniqueCompanies} uniqueJobTitles={uniqueJobTitles} uniqueTags={uniqueTags}
              onClearFilters={clearFilters} activeFiltersCount={activeFiltersCount}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}