import type { GameVaultApi } from './index'

declare global {
  interface Window {
    api: GameVaultApi
  }
}
