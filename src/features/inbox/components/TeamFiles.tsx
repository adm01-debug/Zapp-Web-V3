import { memo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { File, Download, Trash2, Loader2, UploadCloud, EyeOff, Search as SearchIcon, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface TeamFilesProps {
  contactId: string;
}

interface WhisperFile {
  id: string;
  contact_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  sender_id: string | null;
  created_at: string;
}

export const TeamFiles = memo(function TeamFiles({ contactId }: TeamFilesProps) {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['team-files', contactId],
    queryFn: async () => {
      const { data } = await safeClient.from<WhisperFile>(
        'whisper_files',
        q => q.select('*').eq('contact_id', contactId).order('created_at', { ascending: false })
      );
      return data ?? [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setIsUploading(true);
      const fileExt = file.name.split('.').pop();
      const filePath = `team-files/${contactId}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('whatsapp-media')
        .getPublicUrl(filePath);

      const { data: { user } } = await supabase.auth.getUser();
      const { error: dbError } = await safeClient.from('whisper_files', q => q.insert({
        contact_id: contactId,
        file_name: file.name,
        file_url: publicUrl,
        file_size: file.size,
        file_type: file.type,
        sender_id: user?.id,
      }));

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-files', contactId] });
      toast({ title: 'Arquivo enviado', description: 'O documento interno foi salvo com sucesso.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
    },
    onSettled: () => setIsUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await safeClient.from('whisper_files', q => q.delete().eq('id', id));
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-files', contactId] });
      toast({ title: 'Arquivo removido' });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredFiles = files.filter(file => {
    const fileName = file.file_name || '';
    const fileType = file.file_type || '';
    const matchesSearch = fileName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' ||
      (typeFilter === 'image' && fileType.startsWith('image/')) ||
      (typeFilter === 'pdf' && fileType === 'application/pdf') ||
      (typeFilter === 'doc' && (fileType.includes('word') || fileType.includes('document'))) ||
      (typeFilter === 'other' && !fileType.startsWith('image/') && fileType !== 'application/pdf' && !fileType.includes('word'));
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-warning-foreground uppercase tracking-widest flex items-center gap-2">
            <EyeOff className="w-3 h-3" />
            Documentos da Equipe
          </h4>
          <label className="cursor-pointer">
            <Input type="file" className="hidden" onChange={handleFileChange} disabled={isUploading} />
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1.5 border-warning text-warning-foreground hover:bg-warning" disabled={isUploading}>
              {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <UploadCloud className="w-3 h-3" />}
              Novo Arquivo
            </Button>
          </label>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-warning-foreground" />
            <Input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar arquivos..."
              className="pl-7 h-8 text-[11px] bg-warning/30 border-warning focus-visible:ring-amber-200"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="h-8 text-[10px] bg-warning/30 border-warning rounded-md px-2 text-warning-foreground outline-none focus:ring-1 focus:ring-amber-200"
          >
            <option value="all">Todos</option>
            <option value="image">Imagens</option>
            <option value="pdf">PDFs</option>
            <option value="doc">Docs</option>
            <option value="other">Outros</option>
          </select>
        </div>
      </div>

      <div className="space-y-2 min-h-[100px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-warning-foreground" /></div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center opacity-40 grayscale">
            <File className="w-8 h-8 mb-2" />
            <p className="text-[10px]">
              {searchTerm || typeFilter !== 'all' ? 'Nenhum arquivo corresponde aos filtros.' : 'Nenhum arquivo interno compartilhado.'}
            </p>
          </div>
        ) : (
          filteredFiles.map((file) => (
            <div key={file.id} className="flex items-center gap-3 p-2 rounded-xl bg-warning/50 border border-warning hover:bg-warning/50 transition-colors group">
              <div className="w-8 h-8 rounded-lg bg-warning flex items-center justify-center shrink-0">
                <File className="w-4 h-4 text-warning-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-warning-foreground truncate" title={file.file_name}>{file.file_name}</p>
                <p className="text-[9px] text-warning-foreground/60  uppercase">
                  {formatSize(file.file_size || 0)} • {format(new Date(file.created_at), 'dd MMM HH:mm', { locale: ptBR })}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {file.file_type?.startsWith('image/') && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-warning-foreground hover:bg-warning">
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl border-warning">
                      <DialogHeader>
                        <DialogTitle className="text-sm font-bold text-warning-foreground">{file.file_name}</DialogTitle>
                      </DialogHeader>
                      <div className="flex items-center justify-center p-2 bg-warning/20 rounded-xl overflow-hidden min-h-[300px]">
                        <img
                          src={file.file_url}
                          alt={file.file_name}
                          className="max-w-full max-h-[70vh] object-contain shadow-lg rounded-lg"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-8 text-[11px] gap-2 border-warning text-warning-foreground" asChild>
                          <a href={file.file_url} download={file.file_name} target="_blank" rel="noreferrer">
                            <Download className="w-3.5 h-3.5" />
                            Baixar Original
                          </a>
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7 text-warning-foreground hover:bg-warning" asChild>
                  <a href={file.file_url} download={file.file_name} target="_blank" rel="noreferrer">
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => deleteMutation.mutate(file.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
