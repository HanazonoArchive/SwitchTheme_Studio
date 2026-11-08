import type { MockUser, MockGame } from '../types/simulation';
import type { PaneNode } from '../types/theme';

export const DEFAULT_MOCK_USERS: MockUser[] = [
  { id: 'user-1', name: 'User 1', avatarBg: '#e11d48', avatarIcon: '🍄' },
  { id: 'user-2', name: 'User 2', avatarBg: '#2563eb', avatarIcon: '⚔️' },
];

export const DEFAULT_MOCK_GAMES: MockGame[] = [
  {
    id: 'game-1',
    title: 'Pokémon Legends: Arceus',
    coverUrl: '/covers/pokemon-arceus.jpg',
    publisher: 'Nintendo / Game Freak',
  },
  {
    id: 'game-2',
    title: 'The Legend of Zelda: Tears of the Kingdom',
    coverUrl: '/covers/zelda-totk.jpg',
    publisher: 'Nintendo',
  },
  {
    id: 'game-3',
    title: 'Super Mario Odyssey',
    coverUrl: '/covers/mario-odyssey.jpg',
    publisher: 'Nintendo',
  },
  {
    id: 'game-4',
    title: 'The Legend of Zelda: Breath of the Wild',
    coverUrl: '/covers/zelda-botw.jpg',
    publisher: 'Nintendo',
  },
  {
    id: 'game-5',
    title: 'Mario Kart 8 Deluxe',
    coverUrl: '/covers/mario-kart-8.jpg',
    publisher: 'Nintendo',
  },
  {
    id: 'game-6',
    title: 'Animal Crossing: New Horizons',
    coverUrl: '/covers/animal-crossing.jpg',
    publisher: 'Nintendo',
  },
  {
    id: 'game-7',
    title: 'Super Smash Bros. Ultimate',
    coverUrl: '/covers/smash-ultimate.jpg',
    publisher: 'Nintendo',
  },
  {
    id: 'game-8',
    title: 'Super Mario 3D World + Bowser’s Fury',
    coverUrl: '/covers/mario-3d-world.jpg',
    publisher: 'Nintendo',
  },
  {
    id: 'game-9',
    title: 'Fire Emblem: Three Houses',
    coverUrl: '/covers/fire-emblem-three-houses.jpg',
    publisher: 'Nintendo / Intelligent Systems',
  },
  {
    id: 'game-10',
    title: 'Donkey Kong Country: Tropical Freeze',
    coverUrl: '/covers/donkey-kong.jpg',
    publisher: 'Nintendo / Retro Studios',
  },
];

export interface OemComponentDefinition {
  name: string;
  category: 'Icons & Art' | 'Header & HUD' | 'Navigation & Applets' | 'Containers & Text';
  targetFile: string;
  description: string;
  defaultPane: Omit<PaneNode, 'id'>;
}

// Official predetermined Switch OEM BFLYT components
export const SWITCH_OEM_COMPONENTS: OemComponentDefinition[] = [
  {
    name: 'P_IconGame',
    category: 'Icons & Art',
    targetFile: 'blyt/RdtBtnIconGame.bflyt',
    description: 'Game artwork card icon texture (256x384 portrait or 256x256 square)',
    defaultPane: {
      name: 'P_IconGame',
      type: 'picture',
      x: 0,
      y: 0,
      width: 256,
      height: 384,
      scaleX: 1,
      scaleY: 1,
      visible: true,
    },
  },
  {
    name: 'N_MyPage',
    category: 'Header & HUD',
    targetFile: 'blyt/RdtBase.bflyt',
    description: 'User profile avatar icons in the top navigation',
    defaultPane: {
      name: 'N_MyPage',
      type: 'group',
      x: -313,
      y: 300,
      width: 120,
      height: 60,
      scaleX: 0.9,
      scaleY: 0.9,
      visible: true,
    },
  },
  {
    name: 'L_Hud',
    category: 'Header & HUD',
    targetFile: 'blyt/RdtBase.bflyt',
    description: 'Status HUD bar containing Clock, Wi-Fi, and Battery',
    defaultPane: {
      name: 'L_Hud',
      type: 'group',
      x: 584,
      y: 300,
      width: 200,
      height: 40,
      scaleX: 1,
      scaleY: 1,
      visible: true,
    },
  },
  {
    name: 'N_System',
    category: 'Navigation & Applets',
    targetFile: 'blyt/RdtBase.bflyt',
    description: 'Row of circular system applets (Nintendo Online, News, eShop, Album, Settings, Sleep)',
    defaultPane: {
      name: 'N_System',
      type: 'group',
      x: 0,
      y: -219,
      width: 540,
      height: 60,
      scaleX: 0.7,
      scaleY: 0.7,
      visible: true,
    },
  },
  {
    name: 'N_Tip',
    category: 'Containers & Text',
    targetFile: 'blyt/RdtBtnIconGame.bflyt',
    description: 'Game title text and action prompt hint banner',
    defaultPane: {
      name: 'N_Tip',
      type: 'text',
      x: 0,
      y: 222,
      width: 400,
      height: 40,
      scaleX: 0.9,
      scaleY: 0.9,
      visible: true,
    },
  },
  {
    name: 'L_BtnFooter',
    category: 'Navigation & Applets',
    targetFile: 'blyt/RdtBase.bflyt',
    description: 'Bottom controller button prompt legend (A: Start, +: Options, Y: Change User)',
    defaultPane: {
      name: 'L_BtnFooter',
      type: 'group',
      x: 0,
      y: -300,
      width: 600,
      height: 40,
      scaleX: 1,
      scaleY: 1,
      visible: true,
    },
  },
];

// Clean 6 primary components for Switch Home Menu
export const RESIDENT_MENU_DEFAULT_PANES: PaneNode[] = [
  {
    id: 'pane-P_IconGame',
    name: 'P_IconGame',
    type: 'picture',
    x: 0,
    y: 0,
    width: 256,
    height: 384,
    scaleX: 1,
    scaleY: 1,
    visible: true,
  },
  {
    id: 'pane-N_MyPage',
    name: 'N_MyPage',
    type: 'group',
    x: -313,
    y: 300,
    width: 120,
    height: 60,
    scaleX: 0.9,
    scaleY: 0.9,
    visible: true,
  },
  {
    id: 'pane-L_Hud',
    name: 'L_Hud',
    type: 'group',
    x: 584,
    y: 300,
    width: 200,
    height: 40,
    scaleX: 1,
    scaleY: 1,
    visible: true,
  },
  {
    id: 'pane-N_System',
    name: 'N_System',
    type: 'group',
    x: 0,
    y: -219,
    width: 540,
    height: 60,
    scaleX: 0.7,
    scaleY: 0.7,
    visible: true,
  },
  {
    id: 'pane-N_Tip',
    name: 'N_Tip',
    type: 'text',
    x: 0,
    y: 222,
    width: 400,
    height: 40,
    scaleX: 0.9,
    scaleY: 0.9,
    visible: true,
  },
  {
    id: 'pane-L_BtnFooter',
    name: 'L_BtnFooter',
    type: 'group',
    x: 0,
    y: -300,
    width: 600,
    height: 40,
    scaleX: 1,
    scaleY: 1,
    visible: true,
  },
];
