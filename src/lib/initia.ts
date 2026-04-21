import type { ComponentProps } from 'react'
import { InterwovenKitProvider, TESTNET } from '@initia/interwovenkit-react'

export const VEIL_CHAIN_ID = import.meta.env.INITIA_DEFAULT_CHAIN_ID || TESTNET.defaultChainId
export const VEIL_CHAIN_NAME = import.meta.env.VEIL_CHAIN_NAME || VEIL_CHAIN_ID
export const VEIL_CHAIN_PRETTY_NAME =
  import.meta.env.VEIL_CHAIN_PRETTY_NAME || 'Veil Signal Arena'
export const VEIL_NETWORK = 'testnet' as const
export const VEIL_REGISTRY_URL = import.meta.env.VEIL_REGISTRY_URL || TESTNET.registryUrl
export const VEIL_REST_URL = import.meta.env.VEIL_REST_URL || ''
export const VEIL_RPC_URL = import.meta.env.VEIL_RPC_URL || ''
export const VEIL_INDEXER_URL = import.meta.env.VEIL_INDEXER_URL || ''
export const VEIL_JSON_RPC_URL = import.meta.env.VEIL_JSON_RPC_URL || ''
export const VEIL_FEE_DENOM =
  import.meta.env.VEIL_FEE_DENOM ||
  (VEIL_CHAIN_ID === TESTNET.defaultChainId ? 'uinit' : 'umin')
export const VEIL_MODULE_ADDRESS = import.meta.env.VEIL_MODULE_ADDRESS || ''
export const VEIL_MODULE_NAME = import.meta.env.VEIL_MODULE_NAME || 'signal_arena'

const DEFAULT_EXPLORER_TX_BASE =
  VEIL_CHAIN_ID === TESTNET.defaultChainId
    ? `https://scan.testnet.initia.xyz/${VEIL_CHAIN_ID}/txs`
    : ''

export const VEIL_EXPLORER_TX_BASE =
  import.meta.env.INITIA_EXPLORER_TX_BASE || DEFAULT_EXPLORER_TX_BASE

type CustomChain = NonNullable<ComponentProps<typeof InterwovenKitProvider>['customChain']>

export function buildCustomChain(): CustomChain | undefined {
  if (!VEIL_RPC_URL || !VEIL_REST_URL || !VEIL_INDEXER_URL) {
    return undefined
  }

  return {
    chain_id: VEIL_CHAIN_ID,
    chain_name: VEIL_CHAIN_NAME,
    pretty_name: VEIL_CHAIN_PRETTY_NAME,
    network_type: VEIL_NETWORK,
    bech32_prefix: 'init',
    fees: {
      fee_tokens: [
        {
          denom: VEIL_FEE_DENOM,
          fixed_min_gas_price: 0.015,
          low_gas_price: 0.015,
          average_gas_price: 0.025,
          high_gas_price: 0.04,
        },
      ],
    },
    apis: {
      rpc: [{ address: VEIL_RPC_URL }],
      rest: [{ address: VEIL_REST_URL }],
      indexer: [{ address: VEIL_INDEXER_URL }],
      ...(VEIL_JSON_RPC_URL
        ? {
            'json-rpc': [{ address: VEIL_JSON_RPC_URL }],
          }
        : {}),
    },
    metadata: {
      minitia: {
        type: 'minimove',
      },
    },
  } as CustomChain
}

export function buildExplorerTxUrl(txHash: string) {
  if (!VEIL_EXPLORER_TX_BASE) {
    return null
  }

  return VEIL_EXPLORER_TX_BASE.endsWith('/')
    ? `${VEIL_EXPLORER_TX_BASE}${txHash}`
    : `${VEIL_EXPLORER_TX_BASE}/${txHash}`
}
