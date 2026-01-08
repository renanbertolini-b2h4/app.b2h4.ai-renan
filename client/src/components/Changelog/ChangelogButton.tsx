import { Bell } from 'lucide-react';

interface ChangelogButtonProps {
  unreadCount: number;
  onClick: () => void;
}

export function ChangelogButton({ unreadCount, onClick }: ChangelogButtonProps) {
  return (
    <button
      onClick={onClick}
      className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      title="Novidades do sistema"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center animate-pulse">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
