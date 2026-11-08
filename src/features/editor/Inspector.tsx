import React from 'react';
import { AlignLeft, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, Check } from 'lucide-react';
import type { PaneNode, ThemeScreen } from '../../types/theme';

interface InspectorProps {
  activeScreen: ThemeScreen | null;
  selectedPane: PaneNode | null;
  onUpdatePane: (paneId: string, updates: Partial<PaneNode>) => void;
  onDeletePane: (paneId: string) => void;
}

interface NumberFieldProps {
  label: string;
  value: number;
  step?: number;
  onChange: (val: number) => void;
}

const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  step = 1,
  onChange,
}) => {
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? step : -step;
    const nextVal = Number((value + delta).toFixed(2));
    onChange(nextVal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Number((value + step).toFixed(2)));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Number((value - step).toFixed(2)));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  return (
    <div
      onWheel={handleWheel}
      className="flex items-center justify-between bg-[#0c0e12] border border-[#232936] hover:border-slate-600 focus-within:border-[#10b981] rounded-lg px-2.5 py-1 transition group"
    >
      <span className="text-[10px] font-mono text-slate-500 font-bold select-none">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        className="w-full bg-transparent text-right font-mono text-white text-xs outline-none px-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {/* Sleek styled Up/Down stepper arrows */}
      <div className="flex flex-col -mr-1 pl-1 border-l border-[#1e2330]">
        <button
          type="button"
          onClick={() => onChange(Number((value + step).toFixed(2)))}
          className="text-slate-500 hover:text-[#10b981] p-0.5 rounded transition"
          title={`Increase ${label}`}
        >
          <ChevronUp className="w-3 h-3 stroke-[3]" />
        </button>
        <button
          type="button"
          onClick={() => onChange(Number((value - step).toFixed(2)))}
          className="text-slate-500 hover:text-[#10b981] p-0.5 rounded transition"
          title={`Decrease ${label}`}
        >
          <ChevronDown className="w-3 h-3 stroke-[3]" />
        </button>
      </div>
    </div>
  );
};

export const Inspector: React.FC<InspectorProps> = ({
  activeScreen,
  selectedPane,
  onUpdatePane,
  onDeletePane,
}) => {
  if (!activeScreen) {
    return (
      <aside className="w-80 bg-[#101319] border-l border-[#1b1f28] flex flex-col shrink-0 select-none text-xs" />
    );
  }

  return (
    <aside className="w-80 bg-[#101319] border-l border-[#1b1f28] flex flex-col shrink-0 select-none text-xs">
      {/* Inspector Header */}
      <div className="h-10 px-4 border-b border-[#1b1f28] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlignLeft className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Inspector
          </span>
        </div>
        {selectedPane && (
          <span className="text-[10px] font-mono text-slate-500">{selectedPane.type}</span>
        )}
      </div>

      {/* Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedPane ? (
          <div className="space-y-4">
            {/* Component Header & Actions */}
            <div className="bg-[#141720] rounded-lg p-3 border border-[#202532] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-white truncate max-w-[180px]">
                  {selectedPane.name}
                </span>
                <button
                  onClick={() => onDeletePane(selectedPane.id)}
                  className="text-slate-500 hover:text-red-400 p-1 transition"
                  title="Delete component"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[#1e2330]">
                <span className="text-slate-400 text-[11px] flex items-center gap-1.5">
                  {selectedPane.visible ? (
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                  )}
                  Visibility
                </span>
                <button
                  type="button"
                  onClick={() => onUpdatePane(selectedPane.id, { visible: !selectedPane.visible })}
                  className={`w-4 h-4 rounded flex items-center justify-center transition border ${
                    selectedPane.visible
                      ? 'bg-[#10b981] border-[#10b981] text-[#0c0e12]'
                      : 'bg-[#0c0e12] border-[#252c3c] hover:border-slate-500 text-transparent'
                  }`}
                  title={selectedPane.visible ? 'Hide component' : 'Show component'}
                >
                  <Check className="w-3 h-3 stroke-[3.5]" />
                </button>
              </div>
            </div>

            {/* Position with Wheel & Styled Stepper Buttons */}
            <div className="bg-[#141720] rounded-lg p-3 border border-[#202532] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Position (BFLYT)
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Origin: Center</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="X"
                  value={selectedPane.x}
                  step={1}
                  onChange={(val) => onUpdatePane(selectedPane.id, { x: val })}
                />
                <NumberField
                  label="Y"
                  value={selectedPane.y}
                  step={1}
                  onChange={(val) => onUpdatePane(selectedPane.id, { y: val })}
                />
              </div>
            </div>

            {/* Dimensions with Wheel & Styled Stepper Buttons */}
            <div className="bg-[#141720] rounded-lg p-3 border border-[#202532] space-y-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Dimensions
              </span>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="W"
                  value={selectedPane.width}
                  step={2}
                  onChange={(val) => onUpdatePane(selectedPane.id, { width: val })}
                />
                <NumberField
                  label="H"
                  value={selectedPane.height}
                  step={2}
                  onChange={(val) => onUpdatePane(selectedPane.id, { height: val })}
                />
              </div>
            </div>

            {/* Scale with Wheel & Styled Stepper Buttons */}
            <div className="bg-[#141720] rounded-lg p-3 border border-[#202532] space-y-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Scale
              </span>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="SX"
                  value={selectedPane.scaleX}
                  step={0.05}
                  onChange={(val) => onUpdatePane(selectedPane.id, { scaleX: val })}
                />
                <NumberField
                  label="SY"
                  value={selectedPane.scaleY}
                  step={0.05}
                  onChange={(val) => onUpdatePane(selectedPane.id, { scaleY: val })}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <span className="text-sm font-medium text-slate-300 mb-1">No selection</span>
            <span className="text-xs text-slate-500 max-w-[200px]">
              Select a component on screen or in the Panes tab to adjust its properties
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};
