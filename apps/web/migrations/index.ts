import * as migration_20260831_154311_initial from './20260831_154311_initial';

export const migrations = [
  {
    up: migration_20260831_154311_initial.up,
    down: migration_20260831_154311_initial.down,
    name: '20260831_154311_initial'
  },
];
