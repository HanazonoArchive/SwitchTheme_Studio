import type { PaneKind } from '../nx/bflyt';

/**
 * What the console does with a pane beyond what layout.json says: values qlaunch overwrites at
 * runtime, properties that don't apply to a pane kind, and patches the installer skips. The
 * Inspector and the canvas show these as cautions so an edit that can't work isn't silent.
 * Each rule comes from a console screenshot or the installer's source (see engineering notes).
 */

export type NoteLevel = 'error' | 'warn' | 'info';
export interface PaneNote {
  level: NoteLevel;
  text: string;
  /** Inspector fields the note is about ('position.x', 'size', 'visible', 'alpha', 'text', ...). */
  fields?: string[];
}

export interface PaneContext {
  file: string;
  pane: string;
  kind: PaneKind | null;
  /** The pane is the RootPane of a part (expanded under a prt1 pane). */
  partRoot?: boolean;
  /** The pane is a slot qlaunch fills with another layout in code (N_Icon_xx). */
  codeSlot?: boolean;
  /** The pane's patch would be skipped (pane not in this firmware's layout). */
  missing?: boolean;
  /** The pane comes from a layout the installer doesn't let this screen patch (common.szs). */
  readOnly?: boolean;
}

const HUD_ROW = new Set(['N_Time', 'N_Signal', 'N_Margin_00', 'N_Margin_01', 'N_BatteryNum', 'N_Battery']);
const BALLOON_SIZED = new Set(['N_Size', 'N_Scissor', 'N_Offset', 'P_Reset', 'N_Scroll', 'T_Main', 'W_Fade', 'P_Color', 'P_Line']);
// Text qlaunch writes from its message files or live data.
const RUNTIME_TEXT = /^T_/;

export function paneNotes(c: PaneContext): PaneNote[] {
  const out: PaneNote[] = [];
  const f = c.file.replace(/^blyt\//, '').replace(/\.bflyt$/, '');
  if (c.missing) out.push({ level: 'error', text: `Not supported on this firmware: ${f} has no pane named ${c.pane}, so the installer skips this patch.` });
  if (c.readOnly) out.push({ level: 'error', text: 'Not editable here: this layout is shared by every screen (common.szs).' });
  if (c.partRoot)
    out.push({
      level: 'warn',
      text: "The console ignores a part's RootPane visibility, position, rotation and scale (the part pane in the parent layout replaces it). Edit the part itself.",
      fields: ['visible', 'position', 'rotation', 'scale'],
    });
  if (c.codeSlot) out.push({ level: 'info', text: 'Size has no effect here: qlaunch places another layout in this slot. Use Scale to resize what it shows.', fields: ['size'] });
  if (f === 'Hud' && HUD_ROW.has(c.pane))
    out.push({ level: 'warn', text: 'The console lays out the status row: its X is replaced at runtime. Moving it up or down (Y) and setting your own X (not 0) takes it out of the row, and then its position is kept.', fields: ['position.x'] });
  if (f === 'MypNav' && /^N_/.test(c.pane) && c.pane !== 'N_Root' && c.pane !== 'N_Btm')
    out.push({ level: 'warn', text: 'The User page menu is stacked by the console: this section’s Y is replaced at runtime.', fields: ['position.y'] });
  if ((f === 'RdtBalloon' || f === 'FlcBalloon') && BALLOON_SIZED.has(c.pane))
    out.push({ level: 'info', text: 'The console sizes the title balloon to the game’s title: width changes here are replaced.', fields: ['size'] });
  if (f === 'RdtBtnIconGame' && c.pane === 'N_Root')
    out.push({ level: 'info', text: 'Transparency of game icons is set by the console; a theme animation can’t fade them.', fields: ['alpha'] });
  if (f === 'FlcCntMain' && /^N_Btn|^L_Btn/.test(c.pane) && /Game|Icon/.test(c.pane))
    out.push({ level: 'info', text: 'All Software rows are placed by the console from the first row’s position.', fields: ['position'] });
  if (c.kind === 'txt1' && RUNTIME_TEXT.test(c.pane))
    out.push({ level: 'info', text: 'Text comes from the console (its language files or live data). Font colour, size and position apply; the words don’t.', fields: ['text'] });
  if (c.kind === 'pan1') out.push({ level: 'info', text: 'A null pane draws nothing itself: colours, corners and borders don’t apply. Its transform moves its children.', fields: ['style'] });
  return out;
}

/** Whether a field has a note at warn level or worse (canvas shows a caution while editing it). */
export const fieldNote = (notes: PaneNote[], field: string) => notes.find((n) => n.fields?.some((f) => field === f || field.startsWith(f + '.') || f.startsWith(field + '.')));
