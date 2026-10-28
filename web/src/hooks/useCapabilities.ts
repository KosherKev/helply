import { api } from '../api'
import type { Capabilities } from '../types'
import { useAsync } from './useAsync'

export const useCapabilities = () => useAsync(() => api<Capabilities>('/v1/config'), [])
