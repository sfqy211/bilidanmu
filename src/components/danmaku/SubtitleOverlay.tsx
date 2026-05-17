interface SubtitleOverlayProps {
  text: string;
  isSpeaking: boolean;
}

export function SubtitleOverlay({ text, isSpeaking }: SubtitleOverlayProps) {
  if (!text) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-4">
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 text-center transition-opacity duration-700 ${
          isSpeaking ? "opacity-95" : "opacity-0"
        } bg-black/75`}
      >
        <p className="text-base leading-relaxed text-white">{text}</p>
      </div>
    </div>
  );
}
