import * as migration_20260831_154311_initial from './20260831_154311_initial';
import * as migration_20260831_161951_add_jobs from './20260831_161951_add_jobs';

export const migrations = [
  {
    up: migration_20260831_154311_initial.up,
    down: migration_20260831_154311_initial.down,
    name: '20260831_154311_initial',
  },
  {
    up: migration_20260831_161951_add_jobs.up,
    down: migration_20260831_161951_add_jobs.down,
    name: '20260831_161951_add_jobs'
  },
];
