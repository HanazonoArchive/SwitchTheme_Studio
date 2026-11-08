export interface MockUser {
  id: string;
  name: string;
  avatarBg: string;
  avatarIcon: string;
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
  battery: number;
  isCharging: boolean;
  wifiStrength: number; // 0..3
  users: MockUser[];
  games: MockGame[];
  selectedGameIndex: number;
  isDarkTheme: boolean;
  wireframeMode: boolean;
  canvasZoom: number;
}

