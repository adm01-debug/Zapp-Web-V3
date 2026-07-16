import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, Volume1 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AudioVolumeControlProps {
  volume: number; // 0..1
  onChange: (v: number) => void;
  /** When inside a "sent" bubble, use the inverted color set. */
  isSent?: boolean;
  /** Size of the trigger button. */
  size?: 'sm' | 'md';
}

/**
 * Compact volume control for in-bubble audio players.
 * Click the icon to open a vertical slider; click to mute/unmute.
 */
export function AudioVolumeControl({
  volume,
  onChange,
  isSent = false,
  size = 'md',
}: AudioVolumeControlProps) {
  const [open, setOpen] = useState(false);
  const [lastVolume, setLastVolume] = useState(volume > 0 ? volume : 1);

  const Icon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const dim = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';
  const iconDim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  const handleToggleMute = () => {
    if (volume === 0) {
      onChange(lastVolume || 1);
    } else {
      setLastVolume(volume);
      onChange(0);
    }
  };

  return (
    <div className="relative">
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            dim,
            isSent
              ? 'text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground'
              : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
          )}
          onClick={() => setOpen((o) => !o)}
          onDoubleClick={handleToggleMute}
          title={`Volume ${Math.round(volume * 100)}% (clique duplo para silenciar)`}
          aria-label="Controle de volume"
        >
          <Icon className={iconDim} />
        </Button>
      </motion.div>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2',
                'flex flex-col items-center gap-2 rounded-xl border px-2 py-3 shadow-lg',
                'border-border bg-popover'
              )}
            >
              <span className="text-[10px] font-medium tabular-nums text-foreground">
                {Math.round(volume * 100)}%
              </span>
              <div className="flex h-24 w-6 items-center justify-center">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(volume * 100)}
                  onChange={(e) => onChange(Number(e.target.value) / 100)}
                  aria-label="Volume"
                  className={cn(
                    'cursor-pointer appearance-none',
                    // rotate to make it vertical, sized to the popover height
                    'h-1.5 w-24 -rotate-90 rounded-full bg-muted',
                    // thumb (webkit + moz)
                    '[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow',
                    '[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-primary'
                  )}
                  style={{
                    background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${Math.round(volume * 100)}%, hsl(var(--muted)) ${Math.round(volume * 100)}%, hsl(var(--muted)) 100%)`,
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleToggleMute}
                className="text-muted-foreground transition-colors hover:text-foreground"
                title={volume === 0 ? 'Tirar mudo' : 'Silenciar'}
                aria-label={volume === 0 ? 'Tirar mudo' : 'Silenciar'}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
