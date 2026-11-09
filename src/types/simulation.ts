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
  isDarkTheme: boolean;
  wireframeMode: boolean;
  canvasZoom: number;
}

