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
  /**
   * Lock screen in its centred state (LockMainIn: no status bar, news column or Continue button).
   * Default false: the state with the status bar and news column (LockMainOut).
   */
  lockCentred?: boolean;
  isDarkTheme: boolean;
  wireframeMode: boolean;
  canvasZoom: number;
}

