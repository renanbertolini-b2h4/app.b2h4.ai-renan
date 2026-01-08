import { X } from 'lucide-react';
import { ChangelogEntryItem } from './ChangelogEntryItem';
import type { ChangelogGroup } from '../../types/changelog';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupedEntries: ChangelogGroup[];
  currentVersion: string;
}

export function ChangelogModal({ isOpen, onClose, groupedEntries, currentVersion }: ChangelogModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col border border-gray-700">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span>📢</span> Novidades
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Versão {currentVersion}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {groupedEntries.map(group => (
            <div key={group.key}>
              <h3 className="text-sm font-medium text-cyan-400 mb-3 flex items-center gap-2">
                <span>🆕</span> {group.label}
              </h3>
              <div className="space-y-3">
                {group.entries.map(entry => (
                  <ChangelogEntryItem key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-700 bg-gray-800/50">
          <button
            onClick={onClose}
            className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors font-medium"
          >
            Entendi!
          </button>
        </div>
      </div>
    </div>
  );
}
