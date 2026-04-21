import { useEffect, type PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  TESTNET,
  initiaPrivyWalletConnector,
  injectStyles,
  InterwovenKitProvider,
} from '@initia/interwovenkit-react'
import interwovenKitStyles from '@initia/interwovenkit-react/styles.js'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { VEIL_CHAIN_ID, buildCustomChain } from './lib/initia.ts'
import { VEIL_MOVE_EXECUTE_JSON_TYPE_URL, veilProtoTypes } from './lib/veilChain.ts'

let stylesInjected = false

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const wagmiConfig = createConfig({
  connectors: [initiaPrivyWalletConnector],
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(),
  },
})

export function AppProviders({ children }: PropsWithChildren) {
  const customChain = buildCustomChain()

  useEffect(() => {
    if (!stylesInjected) {
      injectStyles(interwovenKitStyles)
      stylesInjected = true
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <InterwovenKitProvider
          {...TESTNET}
          customChain={customChain}
          defaultChainId={VEIL_CHAIN_ID}
          disableAnalytics
          protoTypes={veilProtoTypes}
          enableAutoSign={{
            [VEIL_CHAIN_ID]: [VEIL_MOVE_EXECUTE_JSON_TYPE_URL],
          }}
          theme="light"
        >
          {children}
        </InterwovenKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  )
}
