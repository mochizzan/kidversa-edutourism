import type { ProgramService } from './types'
import { idbProgramService } from './idb/programs'

export const programService: ProgramService = idbProgramService
