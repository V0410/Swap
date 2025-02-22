import { NextPage } from 'next'
import { SwapWidget } from '@reservoir0x/relay-kit-ui'
import { Layout } from 'components/Layout'
import {
  useDynamicContext,
  useDynamicEvents,
  useDynamicModals,
  useSwitchWallet,
  useUserWallets,
  Wallet
} from '@dynamic-labs/sdk-react-core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { isEthereumWallet } from '@dynamic-labs/ethereum'
import { isSolanaWallet } from '@dynamic-labs/solana'
import { adaptSolanaWallet } from '@reservoir0x/relay-solana-wallet-adapter'
import {
  AdaptedWallet,
  adaptViemWallet,
  RelayChain
} from '@reservoir0x/relay-sdk'
import { useWalletFilter } from 'context/walletFilter'
import { LinkedWallet } from '@reservoir0x/relay-kit-ui'
import { adaptBitcoinWallet } from '@reservoir0x/relay-bitcoin-wallet-adapter'
import { isBitcoinWallet } from '@dynamic-labs/bitcoin'
import { convertToLinkedWallet } from 'utils/dynamic'

const SwapWidgetPage: NextPage = () => {
  useDynamicEvents('walletAdded', (newWallet) => {
    if (linkWalletPromise) {
      linkWalletPromise?.resolve(convertToLinkedWallet(newWallet))
      setLinkWalletPromise(undefined)
    }
  })
  const { setWalletFilter } = useWalletFilter()
  const { setShowAuthFlow, primaryWallet } = useDynamicContext()
  const _switchWallet = useSwitchWallet()
  const { setShowLinkNewWalletModal } = useDynamicModals()
  const userWallets = useUserWallets()
  const wallets = useRef<Wallet<any>[]>()
  const switchWallet = useRef<(walletId: string) => Promise<void>>()
  const [wallet, setWallet] = useState<AdaptedWallet | undefined>()
  const [linkWalletPromise, setLinkWalletPromise] = useState<
    | {
        resolve: (value: LinkedWallet) => void
        reject: () => void
        params: { chain?: RelayChain; direction: 'to' | 'from' }
      }
    | undefined
  >()

  const linkedWallets = useMemo(() => {
    const _wallets = userWallets.reduce((linkedWallets, wallet) => {
      linkedWallets.push(convertToLinkedWallet(wallet))
      return linkedWallets
    }, [] as LinkedWallet[])
    wallets.current = userWallets
    return _wallets
  }, [userWallets])

  useEffect(() => {
    switchWallet.current = _switchWallet
  }, [_switchWallet])

  useEffect(() => {
    const adaptWallet = async () => {
      try {
        if (primaryWallet !== null) {
          let adaptedWallet: AdaptedWallet | undefined
          if (isSolanaWallet(primaryWallet)) {
            const connection = await primaryWallet.getConnection()
            const signer = await primaryWallet.getSigner()

            adaptedWallet = adaptSolanaWallet(
              primaryWallet.address,
              792703809,
              connection,
              signer.signAndSendTransaction
            )
          } else if (isEthereumWallet(primaryWallet)) {
            const walletClient = await primaryWallet.getWalletClient()
            adaptedWallet = adaptViemWallet(walletClient)
          } else if (isBitcoinWallet(primaryWallet)) {
            const wallet = convertToLinkedWallet(primaryWallet)
            adaptedWallet = adaptBitcoinWallet(
              wallet.address,
              async (_address, _psbt, dynamicParams) => {
                try {
                  // Request the wallet to sign the PSBT
                  const response = await primaryWallet.signPsbt(dynamicParams)

                  if (!response) {
                    throw 'Missing psbt response'
                  }
                  return response.signedPsbt
                } catch (e) {
                  throw e
                }
              }
            )
          }
          setWallet(adaptedWallet)
        } else {
          setWallet(undefined)
        }
      } catch (e) {
        setWallet(undefined)
      }
    }
    adaptWallet()
  }, [primaryWallet, primaryWallet?.address])

  return (
    <Layout
      styles={{
        backgroundColor: 'black',
        backgroundImage: 'url(/background.webp)',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        height: '90vh',
        display: 'flex'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          paddingTop: 50,
        }}
      >
        <SwapWidget
          defaultFromToken={{
            chainId: 792703809,
            address: '11111111111111111111111111111111',
            decimals: 9,
            name: 'sol',
            symbol: 'SOL',
            logoURI: 'https://assets.relay.link/icons/currencies/sol.png'
          }}
          defaultToToken={{
            chainId: 33139,
            address: '0x0000000000000000000000000000000000000000',
            decimals: 18,
            name: 'APE',
            symbol: 'APE',
            logoURI: 'https://assets.relay.link/icons/currencies/ape.png'
          }}
          wallet={wallet}
          multiWalletSupportEnabled={true}
          linkedWallets={linkedWallets}
          onLinkNewWallet={({ chain, direction }) => {
            if (linkWalletPromise) {
              linkWalletPromise.reject()
              setLinkWalletPromise(undefined)
            }
            if (chain?.vmType === 'evm') {
              setWalletFilter('EVM')
            } else if (chain?.id === 792703809) {
              setWalletFilter('SOL')
            } else if (chain?.id === 8253038) {
              setWalletFilter('BTC')
            } else {
              setWalletFilter(undefined)
            }
            const promise = new Promise<LinkedWallet>((resolve, reject) => {
              setLinkWalletPromise({
                resolve,
                reject,
                params: {
                  chain,
                  direction
                }
              })
            })
            setShowLinkNewWalletModal(true)
            return promise
          }}
          onSetPrimaryWallet={async (address: string) => {
            //In some cases there's a race condition between connecting the wallet and having it available to switch to so we need to poll for it
            const maxAttempts = 20
            let attemptCount = 0
            const timer = setInterval(async () => {
              attemptCount++
              const newPrimaryWallet = wallets.current?.find(
                (wallet) =>
                  wallet.address === address ||
                  wallet.additionalAddresses.find(
                    (_address) => _address.address === address
                  )
              )
              if (attemptCount >= maxAttempts) {
                clearInterval(timer)
                return
              }
              if (!newPrimaryWallet || !switchWallet.current) {
                return
              }
              try {
                await switchWallet.current(newPrimaryWallet?.id)
                clearInterval(timer)
              } catch (e) {}
            }, 200)
          }}
          onConnectWallet={() => {
            setShowAuthFlow(true)
          }}
          onAnalyticEvent={(eventName, data) => {
            console.log('Analytic Event', eventName, data)
          }}
          onFromTokenChange={(token) =>
            console.log('From token changed to: ', token)
          }
          onToTokenChange={(token) =>
            console.log('To token changed to: ', token)
          }
          onSwapError={(e, data) => {
            console.log('onSwapError Triggered', e, data)
          }}
          onSwapSuccess={(data) => {
            console.log('onSwapSuccess Triggered', data)
          }}
        />
      </div>
    </Layout>
  )
}

export default SwapWidgetPage
