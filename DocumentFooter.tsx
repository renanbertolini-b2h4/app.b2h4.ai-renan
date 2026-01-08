interface DocumentFooterProps {
  date?: string
  location?: string
}

export default function DocumentFooter({ 
  date = "05 de Dezembro de 2025",
  location = "São Paulo, SP"
}: DocumentFooterProps) {
  return (
    <footer className="document-footer py-6 flex flex-col items-center justify-center gap-1 text-[#64748b] text-xs text-center print:py-4">
      <div>{date} • {location}</div>
    </footer>
  )
}
