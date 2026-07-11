import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Contact {
  id: string;
  name: string;
  nickname: string | null;
  surname: string | null;
  job_title: string | null;
  company: string | null;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  tags: string[] | null;
  notes: string | null;
  contact_type: string | null;
  created_at: string;
  updated_at: string;
}

interface _SearchFilters {
  searchTerm: string;
  contactType: string | null;
  company: string | null;
  jobTitle: string | null;
  tag: string | null;
  dateFrom: string | null;
  sortField: string;
  sortDirection: string;
}

const PAGE_SIZE = 50;

function parseSortOption(sortBy: string): { field: string; direction: string } {
  switch (sortBy) {
    case 'name_desc':
      return { field: 'name', direction: 'desc' };
    case 'created_desc':
      return { field: 'created_at', direction: 'desc' };
    case 'created_asc':
      return { field: 'created_at', direction: 'asc' };
    case 'updated_desc':
      return { field: 'updated_at', direction: 'desc' };
    default:
      return { field: 'name', direction: 'asc' };
  }
}

export function useContactsSearch() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize state from URL
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('q') || '');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'all');
  const [filterCompany, setFilterCompany] = useState(searchParams.get('company') || '');
  const [filterJobTitle, setFilterJobTitle] = useState(searchParams.get('job') || '');
  const [filterTag, setFilterTag] = useState(searchParams.get('tag') || '');
  const [filterDateRange, setFilterDateRange] = useState(searchParams.get('date') || 'all');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'name_asc');
  const [page, setPage] = useState(Number(searchParams.get('p')) || 0);

  const debounceRef = useRef<NodeJS.Timeout>();

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (activeTab !== 'all') params.set('tab', activeTab);
    if (filterCompany) params.set('company', filterCompany);
    if (filterJobTitle) params.set('job', filterJobTitle);
    if (filterTag) params.set('tag', filterTag);
    if (filterDateRange !== 'all') params.set('date', filterDateRange);
    if (sortBy !== 'name_asc') params.set('sort', sortBy);
    if (page > 0) params.set('p', page.toString());

    setSearchParams(params, { replace: true });
  }, [
    debouncedSearch,
    activeTab,
    filterCompany,
    filterJobTitle,
    filterTag,
    filterDateRange,
    sortBy,
    page,
    setSearchParams,
  ]);

  // Debounce search input
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleTabChange = useCallback((v: string) => {
    setActiveTab(v);
    setPage(0);
  }, []);
  const handleCompanyChange = useCallback((v: string) => {
    setFilterCompany(v);
    setPage(0);
  }, []);
  const handleJobTitleChange = useCallback((v: string) => {
    setFilterJobTitle(v);
    setPage(0);
  }, []);
  const handleTagChange = useCallback((v: string) => {
    setFilterTag(v);
    setPage(0);
  }, []);
  const handleDateRangeChange = useCallback((v: string) => {
    setFilterDateRange(v);
    setPage(0);
  }, []);
  const handleSortChange = useCallback((v: string) => {
    setSortBy(v);
    setPage(0);
  }, []);

  const dateFrom = useMemo(() => {
    const now = new Date();
    switch (filterDateRange) {
      case 'today':
        return new Date(now.getTime() - 86400000).toISOString();
      case 'week':
        return new Date(now.getTime() - 7 * 86400000).toISOString();
      case 'month':
        return new Date(now.setMonth(now.getMonth() - 1)).toISOString();
      case 'quarter':
        return new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString();
      case 'year':
        return new Date(new Date().setMonth(new Date().getMonth() - 12)).toISOString();
      default:
        return null;
    }
  }, [filterDateRange]);

  const { field: sortField, direction: sortDirection } = parseSortOption(sortBy);

  const queryKey = [
    'contacts-search',
    debouncedSearch,
    activeTab,
    filterCompany,
    filterJobTitle,
    filterTag,
    dateFrom,
    sortField,
    sortDirection,
    page,
  ];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_contacts', {
        search_term: debouncedSearch || '',
        contact_type_filter: activeTab === 'all' ? null : activeTab,
        company_filter: filterCompany || null,
        job_title_filter: filterJobTitle || null,
        tag_filter: filterTag || null,
        date_from: dateFrom,
        sort_field: sortField,
        sort_direction: sortDirection,
        page_size: PAGE_SIZE,
        page_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return data as (Contact & { total_count: number })[];
    },
  });

  const contacts = useMemo(() => data ?? [], [data]);
  const totalCount = contacts.length > 0 ? Number(contacts[0].total_count) : 0;
  const hasMore = (page + 1) * PAGE_SIZE < totalCount;

  // Fetch counts by type (lightweight separate query)
  const { data: typeCounts } = useQuery({
    queryKey: ['contacts-type-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contacts_count_by_type');
      if (error) throw error;
      return (data as { contact_type: string; count: number }[]) ?? [];
    },
    staleTime: 30000, // Cache for 30s
  });

  const contactCountByType = useMemo(() => {
    const map: Record<string, number> = {};
    let total = 0;
    typeCounts?.forEach((row) => {
      map[row.contact_type] = Number(row.count);
      total += Number(row.count);
    });
    map['all'] = total;
    return map;
  }, [typeCounts]);

  // Unique values for filter dropdowns (from current results — lightweight)
  const uniqueCompanies = useMemo(
    () => [...new Set(contacts.map((c) => c.company).filter(Boolean))] as string[],
    [contacts]
  );
  const uniqueJobTitles = useMemo(
    () => [...new Set(contacts.map((c) => c.job_title).filter(Boolean))] as string[],
    [contacts]
  );
  const uniqueTags = useMemo(
    () => [...new Set(contacts.flatMap((c) => c.tags || []))] as string[],
    [contacts]
  );

  const activeFiltersCount = [
    filterCompany,
    filterJobTitle,
    filterTag,
    filterDateRange !== 'all' ? filterDateRange : '',
  ].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setFilterCompany('');
    setFilterJobTitle('');
    setFilterTag('');
    setFilterDateRange('all');
    setSortBy('name_asc');
    setPage(0);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setPage(0);
  }, []);

  return {
    // Data
    contacts,
    totalCount,
    loading: isLoading,
    error,
    hasMore,
    contactCountByType,
    uniqueCompanies,
    uniqueJobTitles,
    uniqueTags,

    // Search
    searchInput,
    debouncedSearch,
    handleSearchChange,
    clearSearch,

    // Filters
    activeTab,
    setActiveTab: handleTabChange,
    filterCompany,
    setFilterCompany: handleCompanyChange,
    filterJobTitle,
    setFilterJobTitle: handleJobTitleChange,
    filterTag,
    setFilterTag: handleTagChange,
    filterDateRange,
    setFilterDateRange: handleDateRangeChange,
    sortBy,
    setSortBy: handleSortChange,
    activeFiltersCount,
    clearFilters,

    // Pagination
    page,
    setPage,
    pageSize: PAGE_SIZE,
    loadMore: () => setPage((p) => p + 1),
    loadPrevious: () => setPage((p) => Math.max(0, p - 1)),

    // Actions
    refetch,
  };
}
