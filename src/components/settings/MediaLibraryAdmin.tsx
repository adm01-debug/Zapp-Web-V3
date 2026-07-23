import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sticker, SmilePlus, Volume2, Package } from 'lucide-react';
import { MediaAdminPanel } from './media-library/MediaAdminPanel';

/** Media Library Admin component for the settings section. */
export function MediaLibraryAdmin() {
  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Biblioteca de Mídia</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie figurinhas, áudios meme e emojis customizados
          </p>
        </div>
      </div>
      <Tabs defaultValue="stickers" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="stickers" className="gap-1.5 text-sm">
            <Sticker className="h-4 w-4" />
            Figurinhas
          </TabsTrigger>
          <TabsTrigger value="audio_memes" className="gap-1.5 text-sm">
            <Volume2 className="h-4 w-4" />
            Áudios Meme
          </TabsTrigger>
          <TabsTrigger value="custom_emojis" className="gap-1.5 text-sm">
            <SmilePlus className="h-4 w-4" />
            Emojis
          </TabsTrigger>
        </TabsList>
        <TabsContent value="stickers">
          <MediaAdminPanel type="stickers" />
        </TabsContent>
        <TabsContent value="audio_memes">
          <MediaAdminPanel type="audio_memes" />
        </TabsContent>
        <TabsContent value="custom_emojis">
          <MediaAdminPanel type="custom_emojis" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
