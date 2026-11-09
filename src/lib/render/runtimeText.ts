/** Battery level shown in the preview's status bar. */
export const HUD_BATTERY = 85;

/** Strings qlaunch sets at runtime, for text panes whose layout text is a dev placeholder. */
export const TEXT_MOCK: Record<string, string> = {
  'blyt/EntBtnLock.bflyt::T_00': 'Press the same button three times.',
  'blyt/EntBtnCenter.bflyt::T_00': 'Continue',
  'blyt/EntBtnCenterNtf.bflyt::T_00': 'Featured News',
  'blyt/FlcCntMain.bflyt::T_01': 'By Most Recently Played',
  'blyt/FlcBtnIconGame.bflyt::T_Suspend': 'Playing',
  'blyt/RdtBtnIconGame.bflyt::T_Suspend': 'Playing',
  // System Settings
  'set:L_Header>blyt/TextH1Ex.bflyt::T_00': 'System Settings',
  ...navLabels({
    L_Sup: 'Support',
    L_FlightMode: 'Flight Mode',
    L_Display: 'Screen Brightness',
    L_Sound: 'Bluetooth® Audio',
    L_Lock: 'Screen Lock',
    L_Child: 'Parental Controls',
    L_Internet: 'Internet',
    L_DataMng: 'Data Management',
    L_Player: 'Users',
    L_Mii: 'Mii',
    L_Amiibo: 'amiibo',
    L_Theme: 'Themes',
    L_Ntf: 'Notifications',
    L_Sleep: 'Sleep Mode',
    L_Controller: 'Controllers and Sensors',
    L_Tv: 'TV Output',
    L_Hardware: 'System',
  }),
  'L_CheckFlight>blyt/BtnListCheckText.bflyt::T_00': 'Flight Mode',
  'L_CheckFlight>blyt/BtnListCheckText.bflyt::T_CheckOff': 'Off',
  'L_CheckFlight>blyt/BtnListCheckText.bflyt::T_CheckOn': 'On',
  'L_AsideFlight>blyt/TextBtnListAside.bflyt::T_00':
    'All wireless communication, such as Wi-Fi and Bluetooth, will be switched off. Some types of wireless communication can still be switched on manually when the console is in flight mode.',

  // News
  'news:L_Header>blyt/TextH1Ntf.bflyt::T_00': 'News',
  'L_HeadPickUp>blyt/TextH2.bflyt::T_00': 'Pickup',
  'L_HeadLatest>blyt/TextH2.bflyt::T_00': 'Latest News',

  // User Page
  ...partLabels('blyt/BtnNav_Root.bflyt', 'T_00', {
    L_BtnAccount: 'Profile',
    L_BtnFrdList: 'Friend List',
    L_BtnTrend: 'Friend Activity',
    L_BtnInvitation: 'Invitations',
    L_BtnRecommend: 'Friend Suggestions',
    L_BtnFrdAdd: 'Add Friend',
    L_BtnSetting: 'User Settings',
  }),
  'blyt/MypMyStatus.bflyt::T_MyCode': 'Friend Code: SW-1234-5678-9012',
  'L_HeadLineLogList>blyt/TextH2.bflyt::T_00': 'Play Activity',
  'blyt/MypBtnGame.bflyt::T_Game_01': 'Played for 10 hours or more',
  'blyt/MypBtnPresence.bflyt::T_Online': 'Online',

  // Player Select
  'blyt/DBtmHeaderNml.bflyt::T_00': 'Select a user.',
};

/** label per part instance for one text pane of a shared layout. */
function partLabels(file: string, pane: string, labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(labels).map(([part, text]) => [`${part}>${file}::${pane}`, text]));
}

/** Settings navigation entries: label per BtnNav part instance. */
function navLabels(labels: Record<string, string>): Record<string, string> {
  return partLabels('blyt/BtnNav_Root.bflyt', 'T_00', labels);
}

/** The focused entry per screen: its focus panes are shown (cursor, active bar). */
export const FOCUSED_PART: Partial<Record<string, string>> = { set: 'L_FlightMode', user: 'L_BtnAccount' };
export const FOCUS_PANES = new Set(['N_BtnFocusKey', 'P_Active', 'P_BtnBase']);
