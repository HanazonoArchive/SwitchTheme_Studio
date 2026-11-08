import React, { useState } from 'react';
import { X, Search, Plus, Box } from 'lucide-react';
import { SWITCH_OEM_COMPONENTS, type OemComponentDefinition } from '../../constants/switchPanes';

interface AddComponentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectComponent: (component: OemComponentDefinition) => void;
}

export const AddComponentModal: React.FC<AddComponentModalProps> = ({
  isOpen,
  onClose,
  onSelectComponent,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  if (!isOpen) return null;

  const categories = ['all', 'Icons & Art', 'Header & HUD', 'Navigation & Applets', 'Containers & Text'];

  const filteredComponents = SWITCH_OEM_COMPONENTS.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase()) ||
      c.targetFile.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || c.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-xl bg-[#101319] border border-[#202532] rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs text-slate-300 max-h-[85vh]">
        {/* Modal Header */}
        <div className="h-12 px-5 border-b border-[#1b1f28] flex items-center justify-between bg-[#0c0e12]">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-[#10b981]" />
            <span className="font-semibold text-sm text-white">Add Switch BFLYT Component</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar & Categories */}
        <div className="p-4 border-b border-[#1b1f28] bg-[#0c0e12] space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search components (e.g. P_IconGame, N_MyPage, L_Hud)..."
              className="w-full bg-[#141720] border border-[#232936] rounded-lg pl-9 pr-3 py-2 text-white placeholder-slate-500 outline-none focus:border-[#10b981] text-xs"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-[#10b981] text-[#0c0e12] font-semibold'
                    : 'bg-[#141720] hover:bg-[#1a1f29] text-slate-400 hover:text-slate-200 border border-[#202532]'
                }`}
              >
                {cat === 'all' ? 'All Panes' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Component List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredComponents.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              No components found matching &ldquo;{search}&rdquo;
            </div>
          ) : (
            filteredComponents.map((component) => (
              <div
                key={component.name}
                onClick={() => {
                  onSelectComponent(component);
                  onClose();
                }}
                className="group p-3 rounded-lg bg-[#141720] hover:bg-[#181d28] border border-[#202532] hover:border-[#10b981]/50 cursor-pointer transition flex items-center justify-between"
              >
                <div className="space-y-1 max-w-[80%]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-white group-hover:text-[#10b981] transition">
                      {component.name}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#0c0e12] text-slate-400 border border-[#232936] font-mono">
                      {component.targetFile}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-1">{component.description}</p>
                  <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500 pt-0.5">
                    <span>
                      Pos: ({component.defaultPane.x}, {component.defaultPane.y})
                    </span>
                    <span>
                      Size: {component.defaultPane.width}×{component.defaultPane.height}
                    </span>
                    <span>
                      Scale: {component.defaultPane.scaleX}×{component.defaultPane.scaleY}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="px-3 py-1.5 rounded bg-[#13161d] group-hover:bg-[#10b981] text-slate-300 group-hover:text-[#0c0e12] border border-[#202532] group-hover:border-transparent font-medium flex items-center gap-1.5 transition text-xs shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Add</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="h-11 px-5 border-t border-[#1b1f28] flex items-center justify-between bg-[#0c0e12] text-[11px] text-slate-500">
          <span>Official Nintendo Switch BFLYT Schema</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded hover:bg-[#161a22] text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
