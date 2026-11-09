import React, { useRef, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import type { MockUser } from '../../types/simulation';
import { BUILTIN_AVATARS } from '../../constants/switchPanes';

/**
 * The console's user accounts for the preview: names and profile pictures. They show on the
 * Home account buttons, the "Playing" badge, the User Page and Player Select.
 */

const MAX_USERS = 8;

interface Props {
  users: MockUser[];
  onChange: (users: MockUser[]) => void;
}

export const UsersEditor: React.FC<Props> = ({ users, onChange }) => {
  const [picking, setPicking] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (id: string, patch: Partial<MockUser>) => onChange(users.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  const add = () => {
    const used = new Set(users.map((u) => u.avatarUrl));
    const pic = BUILTIN_AVATARS.find((a) => !used.has(a)) ?? BUILTIN_AVATARS[users.length % BUILTIN_AVATARS.length];
    onChange([...users, { id: `user-${Date.now()}`, name: `User ${users.length + 1}`, avatarUrl: pic }]);
  };

  const upload = (file: File | undefined) => {
    if (!file || !picking) return;
    const id = picking;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') update(id, { avatarUrl: reader.result });
      setPicking(null);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-[var(--panel-2)] rounded-lg p-3 border border-[var(--border)] space-y-2">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ''))} />
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[var(--text-2)]">Users ({users.length})</span>
        <button onClick={add} disabled={users.length >= MAX_USERS} className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1 disabled:opacity-40 disabled:no-underline">
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>
      {users.map((u) => (
        <div key={u.id}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPicking(picking === u.id ? null : u.id)}
              className={`w-8 h-8 rounded-full overflow-hidden shrink-0 border-2 ${picking === u.id ? 'border-[var(--accent)]' : 'border-white/80'}`}
              title="Change picture"
            >
              <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
            </button>
            <input className="ui-input flex-1 min-w-0" value={u.name} maxLength={10} onChange={(e) => update(u.id, { name: e.target.value })} />
            <button
              onClick={() => onChange(users.filter((x) => x.id !== u.id))}
              disabled={users.length <= 1}
              className="text-[var(--text-3)] hover:text-red-400 p-0.5 disabled:opacity-30"
              title="Remove user"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          {picking === u.id && (
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {BUILTIN_AVATARS.map((a) => (
                <button
                  key={a}
                  onClick={() => (update(u.id, { avatarUrl: a }), setPicking(null))}
                  className={`aspect-square rounded-full overflow-hidden border-2 ${u.avatarUrl === a ? 'border-[var(--accent)]' : 'border-transparent hover:border-[var(--text-3)]'}`}
                >
                  <img src={a} alt="" className="w-full h-full" />
                </button>
              ))}
              <button onClick={() => fileRef.current?.click()} className="aspect-square rounded-full border border-dashed border-[var(--text-3)] flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)]" title="Use your own picture">
                <Upload className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
