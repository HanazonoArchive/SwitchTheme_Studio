import React from 'react';
import { Image, Layers, Sliders, Code2 } from 'lucide-react';

export type RailTab = 'media' | 'panes' | 'mock' | 'json';

interface LeftRailProps {
  activeTab: RailTab;
  onSelectTab: (tab: RailTab) => void;
}

export const LeftRail: React.FC<LeftRailProps> = ({ activeTab, onSelectTab }) => {
  const tabs = [
    { id: 'media' as const, label: 'Media', icon: Image },
    { id: 'panes' as const, label: 'Panes', icon: Layers },
    { id: 'mock' as const, label: 'Mock OS', icon: Sliders },
    { id: 'json' as const, label: 'JSON', icon: Code2 },
  ];

  return (
    <nav className="w-16 bg-[#0c0e12] border-r border-[#1b1f28] flex flex-col items-center py-3 gap-2 shrink-0 select-none">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-1 transition ${
              isActive
                ? 'bg-[#10b981]/10 text-[#10b981]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#13161d]'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

