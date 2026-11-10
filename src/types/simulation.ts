export interface MockUser {
  id: string;
  name: string;
  /** Profile picture: one of the built-in pictures (/avatars/*.svg) or an uploaded image. */
  avatarUrl: string;
}

export interface MockGame {
  id: string;
  title: string;
  coverUrl: string;
  publisher: string;
  badge?: string;
}

export interface MockSystemState {
  time: string;
  users: MockUser[];
  games: MockGame[];
  selectedGameIndex: number;
  /** The first game is suspended ("Playing" badge, Resume on the lock screen). Default true. */
  gameSuspended?: boolean;
  /** A game is suspended while the lock screen shows. Default false (the HOME button shows). */
  lockGameSuspended?: boolean;
  /**
   * Lock screen in its centred state (LockMainIn: no status bar, news column or Continue button).
   * Derived for the lock screen: centred when nothing is suspended.
   */
  lockCentred?: boolean;
  isDarkTheme: boolean;
  wireframeMode: boolean;
  canvasZoom: number;
}

