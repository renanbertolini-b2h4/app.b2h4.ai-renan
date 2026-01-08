interface DocumentHeaderProps {
  title?: string
}

export default function DocumentHeader({ 
  title = "Imersão C-Level em IA Generativa" 
}: DocumentHeaderProps) {
  return (
    <header className="document-header bg-[#1e293b] py-4 px-8 flex flex-col justify-center relative print:py-2">
      <div className="flex items-center gap-4">
        <span className="font-bold text-sm text-white">B2H4</span>
        <span className="text-xs text-white">{title}</span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00D4D4]" />
    </header>
  )
}
