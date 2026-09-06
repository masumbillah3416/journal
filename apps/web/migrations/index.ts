import * as migration_20260831_154311_initial from './20260831_154311_initial'
import * as migration_20260831_161951_add_jobs from './20260831_161951_add_jobs'
import * as migration_20260905_202028_add_otp_session_hash from './20260905_202028_add_otp_session_hash'
import * as migration_20260905_230601_add_sign_in_attempts from './20260905_230601_add_sign_in_attempts'
import * as migration_20260906_004937_add_session_expiry from './20260906_004937_add_session_expiry'

export const migrations = [
  {
    up: migration_20260831_154311_initial.up,
    down: migration_20260831_154311_initial.down,
    name: '20260831_154311_initial',
  },
  {
    up: migration_20260831_161951_add_jobs.up,
    down: migration_20260831_161951_add_jobs.down,
    name: '20260831_161951_add_jobs',
  },
  {
    up: migration_20260905_202028_add_otp_session_hash.up,
    down: migration_20260905_202028_add_otp_session_hash.down,
    name: '20260905_202028_add_otp_session_hash',
  },
  {
    up: migration_20260905_230601_add_sign_in_attempts.up,
    down: migration_20260905_230601_add_sign_in_attempts.down,
    name: '20260905_230601_add_sign_in_attempts',
  },
  {
    up: migration_20260906_004937_add_session_expiry.up,
    down: migration_20260906_004937_add_session_expiry.down,
    name: '20260906_004937_add_session_expiry',
  },
]
