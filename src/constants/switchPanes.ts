import type { MockUser, MockGame } from '../types/simulation';

export const DEFAULT_MOCK_USERS: MockUser[] = [
  { id: 'user-1', name: 'User 1', avatarUrl: '/avatars/octopus.svg' },
  { id: 'user-2', name: 'User 2', avatarUrl: '/avatars/knight.svg' },
];

/** Built-in profile pictures: our own drawings in the console's style (character on a coloured backdrop). */
export const BUILTIN_AVATARS = ['octopus', 'knight', 'fox', 'cat', 'frog', 'robot', 'bird', 'bear'].map((n) => `/avatars/${n}.svg`);

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
