import React, { useEffect } from 'react';
import { BookOpen, Keyboard, LifeBuoy, ShieldAlert, Shapes, X } from 'lucide-react';
import { Legend } from './Viewport';
import { Note } from '../../components/Note';

/**
 * Help: how to use the studio, what to do when a theme breaks the console (black screen, Home
 * menu crash), keyboard shortcuts, what outlines mean, and the disclaimer.
 */

import { INJECTOR_URL, ISSUES_URL, REPO_URL, type HelpTab } from './help';

const TABS: { id: HelpTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'start', label: 'Getting started', Icon: BookOpen },
  { id: 'trouble', label: 'If something goes wrong', Icon: LifeBuoy },
  { id: 'keys', label: 'Shortcuts', Icon: Keyboard },
  { id: 'outlines', label: 'Outlines', Icon: Shapes },
  { id: 'legal', label: 'Disclaimer', Icon: ShieldAlert },
];

const H: React.FC<{ children: React.ReactNode }> = ({ children }) => <h3 className="text-[13px] font-semibold text-[var(--text)] mt-4 mb-1.5 first:mt-0">{children}</h3>;
const P: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-[12.5px] text-[var(--text-2)] leading-relaxed mb-2">{children}</p>;
const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => <code className="font-mono text-[11.5px] px-1 py-0.5 rounded bg-[var(--panel-2)] border border-[var(--border)] text-[var(--text)] break-all">{children}</code>;
const Callout: React.FC<{ tone: 'warn' | 'danger' | 'info'; title?: string; children: React.ReactNode }> = ({ tone, title, children }) => (
  <Note tone={tone === 'danger' ? 'error' : tone} title={title ?? (tone === 'danger' ? 'Important' : tone === 'warn' ? 'Caution' : 'Tip')} className="my-2">
    {children}
  </Note>
);

const KEYS: [string, string][] = [
  ['V', 'Select tool'],
  ['M', 'Measure tool (drag A → B; Alt: no snapping, Shift: 45° steps, Esc: clear)'],
  ['Click', 'Select (a component as a whole)'],
  ['Double-click', 'Go one level deeper into a component'],
  ['Alt + click', 'Select the exact layer under the cursor'],
  ['Ctrl/Shift + click', 'Add or remove a layer from the selection'],
  ['Ctrl + drag, or drag on empty canvas', 'Selection box'],
  ['Right-click', 'Layer menu: every layer under the cursor, hide, lock, visible in theme, tags…'],
  ['Drag', 'Move (snaps to edges, centres and equal spacing; Alt: free; Shift: one axis)'],
  ['Handles', 'Resize a layer, scale a component (Shift: keep proportions)'],
  ['Round knob', 'Rotate (Shift: 15° steps)'],
  ['Arrow keys', 'Nudge the selection 1 px (Shift: 10 px)'],
  ['Enter / Shift+Enter', 'Select first child / parent'],
  ['Esc', 'Clear the measurement, leave Layer view, or deselect'],
  ['Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y', 'Undo / redo'],
  ['Space + drag, middle mouse', 'Pan'],
  ['Wheel, Ctrl + wheel', 'Zoom around the cursor'],
  ['Shift+R', 'Show or hide the rulers'],
  ['Number fields', 'Drag the label to scrub, wheel while focused, ↑/↓ (Shift ×10), hold the arrows'],
];

export const HelpDialog: React.FC<{ tab: HelpTab; onTab: (t: HelpTab) => void; onClose: () => void }> = ({ tab, onTab, onClose }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopImmediatePropagation(), onClose());
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Help" className="w-[820px] max-w-full h-[600px] max-h-full flex rounded-xl overflow-hidden bg-[var(--panel)] border border-[var(--border)] shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
        <nav className="w-[200px] shrink-0 bg-[var(--bg)] border-r border-[var(--border)] p-2 flex flex-col gap-0.5">
          <div className="px-2 py-2 text-[13px] font-semibold">Help</div>
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => onTab(id)} className={`h-8 px-2 rounded-md flex items-center gap-2 text-[12.5px] text-left ${tab === id ? 'bg-[var(--panel-2)] text-[var(--text)]' : 'text-[var(--text-2)] hover:bg-[var(--hover)]'}`}>
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="px-2 py-1 text-[12px] text-[var(--accent)] hover:underline">
            GitHub repository
          </a>
          <a href={ISSUES_URL} target="_blank" rel="noreferrer" className="px-2 py-1 text-[12px] text-[var(--accent)] hover:underline">
            Report a problem
          </a>
        </nav>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="h-11 px-4 flex items-center justify-between border-b border-[var(--border)] shrink-0">
            <span className="text-[13px] font-semibold">{TABS.find((t) => t.id === tab)?.label}</span>
            <button className="ui-icon-btn" onClick={onClose} title="Close (Esc)">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 select-text">
            {tab === 'start' && (
              <>
                <Callout tone="warn">SwitchTheme Studio is experimental. The preview is built to match the console, but it can be wrong. Test every theme on your console before you share it.</Callout>
                <H>1. Open or start a theme</H>
                <P>Open an .nxtheme (or a folder's .zip), or start a new one from the start page. Your work is saved in this browser as you go and listed under Recent.</P>
                <H>2. Pick a screen and edit</H>
                <P>Screens are on the left. Click a layer on the canvas or in Layers; drag to move, use the handles to resize, the round knob to rotate. Game icons, applet buttons and settings rows are components: they move and scale as one. Double-click to go inside, or use Layer view (the grid button on a component in Layers, or right-click) to see every layer of a component side by side and pick the one you want.</P>
                <H>3. Check the cautions</H>
                <P>Some values are replaced by the console at runtime (the status bar row, the User page menu, title balloons…). The Inspector and the drag readout say so, and the patch is still written. Red notes mean the patch can't work on this firmware.</P>
                <H>4. Export</H>
                <P>Export .nxtheme and install it with NXThemes Installer on your console. Load your console's own .szs files (Panes tab) for the most exact preview; they stay in this browser and are never uploaded or exported.</P>
              </>
            )}
            {tab === 'trouble' && (
              <>
                <Callout tone="danger">
                  <b>Black screen, the Home menu crashes on boot, or error screens after installing a theme?</b> Your console is not broken. Themes only change files on the SD card, and only while running custom firmware. Removing the theme's files fixes it.
                </Callout>
                <H>Remove the theme from the SD card</H>
                <P>Turn the console off. Put the SD card in a computer (or use Hekate's USB tools / TegraExplorer), then in </P>
                <P>
                  <Code>SD:/atmosphere/contents/</Code> (on Atmosphère 0.9.4 and older: <Code>SD:/atmosphere/titles/</Code>)
                </P>
                <P>delete the folder of the screen that broke:</P>
                <ul className="list-disc pl-5 mb-2 space-y-1 text-[12.5px] text-[var(--text-2)]">
                  <li>
                    <Code>0100000000001000</Code> — Home menu, lock screen, All Software, Settings, News (qlaunch)
                  </li>
                  <li>
                    <Code>0100000000001013</Code> — User page
                  </li>
                  <li>
                    <Code>0100000000001007</Code> — Player select
                  </li>
                  <li>
                    <Code>0100000000000811</Code> — custom system font (only if you installed one)
                  </li>
                </ul>
                <P>
                  If you only want to remove the theme and keep other mods for that title, delete just its <Code>romfs/lyt</Code> folder (for example <Code>0100000000001000/romfs/lyt</Code>). Then boot again: the console uses its own layout.
                </P>
                <H>Or uninstall from the console</H>
                <P>If the Home menu still opens, NXThemes Installer can remove the installed theme from its menu.</P>
                <H>After a system update</H>
                <P>Every firmware update can break installed themes (lock screen themes most often). Before updating, uninstall themes or be ready to delete the folders above. Afterwards, update NXThemes Installer, let it download its patches for the new firmware, run "Extract home menu" again, and reinstall themes one at a time to find a broken one.</P>
                <H>Something in the theme doesn't look like the preview</H>
                <P>Open the Layout tab's compatibility list and the Inspector's notes for the pane. If a pane is missing in your firmware's layout, the installer skips it. If the problem remains, please report it with the .nxtheme and your firmware version.</P>
                <H>The studio itself</H>
                <P>If the canvas is blank, your browser may have WebGL turned off (hardware acceleration). Turn it on in the browser's settings, update the browser, or try another one (current Chrome, Edge, Firefox or Safari). Your themes are kept in this browser's storage; clearing site data removes them, so export what you want to keep.</P>
                <Callout tone="info">
                  Still stuck? <a className="underline" href={ISSUES_URL} target="_blank" rel="noreferrer">Open an issue</a> with your firmware version, the installer version and what you see. Never attach your console's .szs files or other system files.
                </Callout>
              </>
            )}
            {tab === 'keys' && (
              <table className="w-full text-[12.5px]">
                <tbody>
                  {KEYS.map(([k, v]) => (
                    <tr key={k} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-1.5 pr-4 align-top whitespace-nowrap text-[var(--text)] font-medium">{k}</td>
                      <td className="py-1.5 text-[var(--text-2)]">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'outlines' && (
              <>
                <P>Outline colours say what a layer is; the line says its state. The same colours are used in Layers (component icons, the changed dot, struck-through names for layers hidden in the theme).</P>
                <Legend />
              </>
            )}
            {tab === 'legal' && (
              <>
                <Callout tone="warn">
                  <b>Experimental software.</b> This project is still a work in progress. Features may change, and the preview may not match your console exactly.
                </Callout>
                <H>Caution</H>
                <ul className="list-disc pl-5 mb-2 space-y-1 text-[12.5px] text-[var(--text-2)]">
                  <li>Custom themes need custom firmware. Running custom firmware may void your warranty, and going online with a modified console can get it banned. You do this at your own risk.</li>
                  <li>Keep a NAND backup of your console and know how to remove a theme (see "If something goes wrong") before installing one.</li>
                  <li>Test themes one at a time, especially after a system update.</li>
                </ul>
                <H>Disclaimer</H>
                <P>SwitchTheme Studio is an unofficial fan project. It is not affiliated with, endorsed or sponsored by Nintendo. Nintendo Switch is a trademark of Nintendo.</P>
                <P>The software is provided "as is", without warranty of any kind. The authors are not responsible for any damage, data loss, bans or other consequences of using it or the themes made with it.</P>
                <P>The studio doesn't ship Nintendo's files. Layout data from your own console stays in your browser and is never put into exported themes. Don't share your console's .szs files or other system files. Themes you make are yours; respect the rights of any artwork you put in them.</P>
                <P>
                  Built on the theme format and research of{' '}
                  <a className="text-[var(--accent)] hover:underline" href={INJECTOR_URL} target="_blank" rel="noreferrer">
                    SwitchThemeInjector by exelix11
                  </a>
                  .
                </P>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

