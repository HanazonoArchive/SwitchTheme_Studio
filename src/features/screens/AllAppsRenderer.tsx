import React from 'react';
import type { MockSystemState } from '../../types/simulation';

interface AllAppsRendererProps {
  mockState: MockSystemState;
}

export const AllAppsRenderer: React.FC<AllAppsRendererProps> = ({ mockState }) => {
  return (
    <div className="relative w-full h-full p-12 flex flex-col justify-between text-white pointer-events-auto">
      <div className="flex items-center justify-between pb-4 border-b border-white/20">
        <h2 className="text-xl font-bold">All Software</h2>
        <span className="text-xs text-white/70">Sort: By Most Recently Played</span>
      </div>
      <div className="grid grid-cols-6 gap-4 py-4 flex-1">
        {mockState.games.concat(mockState.games).slice(0, 12).map((g, i) => (
          <div key={i} className="aspect-square rounded-lg overflow-hidden border border-white/20 shadow hover:scale-105 transition">
            <img src={g.coverUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
      <div className="text-xs text-white/70 flex justify-between">
        <span>(B) Back</span>
        <span>(A) Start</span>
      </div>
    </div>
  );
};

