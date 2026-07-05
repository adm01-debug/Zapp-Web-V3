interface WhisperAudioPlayerProps {
  audioUrl: string;
  className?: string;
}

export function WhisperAudioPlayer({ audioUrl, className }: WhisperAudioPlayerProps) {
  return (
    <audio
      controls
      src={audioUrl}
      className={className ?? 'h-8 max-w-full'}
      preload="metadata"
    />
  );
}
