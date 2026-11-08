import React from 'react';
import type { MockSystemState } from '../../types/simulation';

interface LockscreenRendererProps {
  mockState: MockSystemState;
}

export const LockscreenRenderer: React.FC<LockscreenRendererProps> = ({ mockState }) => {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center text-white pointer-events-auto">
      <div className="text-center space-y-4">
        <span className="text-xs uppercase tracking-widest text-white/60">Press the same button 3 times</span>
        <div className="text-8xl font-light tracking-tight font-mono drop-shadow-2xl">
          {mockState.time}
        </div>
        <p className="text-sm font-medium text-white/70">Nintendo Switch</p>
      </div>
    </div>
  );
};

