import type { Address } from './utils/types';

import React, { useEffect } from 'react';

import { ApolloProvider } from '@apollo/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRoot } from 'react-dom/client';
import { Provider as ReduxProvider } from 'react-redux';
import { parseAbiItem } from 'viem';
import { hardhat } from 'viem/chains';
import { usePublicClient, WagmiProvider } from 'wagmi';

import { ThemeProvider } from '@/components/ThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { store } from '@/store';
import { execute } from '@/subgraphs/execute';

import App from './App';
import config, { CHAIN_ID } from './config';
import {
  nounsAuctionHouseAddress,
  useReadNounsAuctionHouseAuction,
  useWatchNounsAuctionHouseAuctionBidEvent,
  useWatchNounsAuctionHouseAuctionCreatedEvent,
  useWatchNounsAuctionHouseAuctionExtendedEvent,
  useWatchNounsAuctionHouseAuctionSettledEvent,
} from './contracts';
import { useAppDispatch, useAppSelector } from './hooks';
import { LanguageProvider } from './i18n/LanguageProvider';
import reportWebVitals from './reportWebVitals';
import {
  appendBid,
  reduxSafeAuction,
  reduxSafeBid,
  reduxSafeNewAuction,
  setActiveAuction,
  setAuctionExtended,
  setAuctionSettled,
  setFullAuction,
} from './state/slices/auction';
import { setLastAuctionNounId, setOnDisplayAuctionNounId } from './state/slices/onDisplayAuction';
import { addPastAuctions } from './state/slices/pastAuctions';
import { nounPath } from './utils/history';
import { config as wagmiConfig, defaultChain } from './wagmi';
import { clientFactory, latestAuctionsQuery } from './wrappers/subgraph';

const queryClient = new QueryClient();

const client = clientFactory(config.app.subgraphApiUri);

const ChainSubscriber: React.FC = () => {
  const dispatch = useAppDispatch();
  const publicClient = usePublicClient();
  const chainId = defaultChain.id;

  // Fetch the current auction
  const { data: currentAuction } = useReadNounsAuctionHouseAuction();
  useEffect(() => {
    if (currentAuction) {
      dispatch(setFullAuction(reduxSafeAuction(currentAuction)));
      dispatch(setLastAuctionNounId(Number(currentAuction.nounId)));
    }
  }, [currentAuction, dispatch]);

  // Fetch the previous 24 hours of bids
  useEffect(() => {
    if (CHAIN_ID === hardhat.id) {
      return;
    }
    (async () => {
      const latestBlock = await publicClient.getBlock();
      const fromBlock = latestBlock.number > 7200n ? latestBlock.number - 7200n : 0n;

      const logs = await publicClient.getLogs({
        address: nounsAuctionHouseAddress[chainId],
        event: parseAbiItem(
          'event AuctionBid(uint256 indexed nounId, address sender, uint256 value, bool extended)',
        ),
        fromBlock,
        toBlock: latestBlock.number,
      });

      for (const {
        args: { extended, nounId, sender, value },
        blockNumber,
        transactionHash,
        transactionIndex,
      } of logs) {
        const block = await publicClient.getBlock({
          blockNumber: blockNumber ?? undefined,
        });
        const timestamp = block.timestamp;

        dispatch(
          appendBid(
            reduxSafeBid({
              nounId: Number(nounId),
              sender: sender as Address,
              value: Number(value),
              extended: !!extended,
              transactionHash: transactionHash ?? '',
              transactionIndex: transactionIndex ?? 0,
              timestamp,
            }),
          ),
        );
      }
    })();
  }, [chainId, dispatch, publicClient]);

  // Watch for new bids
  useWatchNounsAuctionHouseAuctionBidEvent({
    onLogs: async logs => {
      for (const {
        args: { extended, nounId, sender, value },
        blockNumber,
        transactionHash,
        transactionIndex,
      } of logs) {
        const block = await publicClient.getBlock({
          blockNumber: blockNumber ?? undefined,
        });
        const timestamp = block.timestamp;

        dispatch(
          appendBid(
            reduxSafeBid({
              nounId: Number(nounId),
              sender: sender as Address,
              value: Number(value),
              extended: !!extended,
              transactionHash: transactionHash ?? '',
              transactionIndex: transactionIndex ?? 0,
              timestamp,
            }),
          ),
        );
      }
    },
  });

  // Watch for new auction creation events
  useWatchNounsAuctionHouseAuctionCreatedEvent({
    onLogs: logs => {
      for (const log of logs) {
        const { startTime, endTime, nounId } = log.args;
        dispatch(
          setActiveAuction(
            reduxSafeNewAuction({
              nounId: Number(nounId),
              startTime: Number(startTime),
              endTime: Number(endTime),
              settled: false,
            }),
          ),
        );
        const nounIdNumber = Number(nounId);
        window.location.href = nounPath(nounIdNumber);
        dispatch(setOnDisplayAuctionNounId(nounIdNumber));
        dispatch(setLastAuctionNounId(nounIdNumber));
      }
    },
  });

  // Watch for new auction extended events
  useWatchNounsAuctionHouseAuctionExtendedEvent({
    onLogs: logs => {
      for (const log of logs) {
        const { endTime, nounId } = log.args;
        dispatch(
          setAuctionExtended({
            nounId: Number(nounId),
            endTime: Number(endTime),
          }),
        );
      }
    },
  });

  // Watch for auction settlement events
  useWatchNounsAuctionHouseAuctionSettledEvent({
    onLogs: logs => {
      for (const log of logs) {
        const { amount, winner, nounId } = log.args;
        dispatch(
          setAuctionSettled({
            nounId: Number(nounId),
            amount: Number(amount),
            winner: winner as Address,
          }),
        );
      }
    },
  });

  return <></>;
};

const PastAuctions: React.FC = () => {
  const latestAuctionId = useAppSelector(state => state.onDisplayAuction.lastAuctionNounId);

  const { data: auctions } = useQuery({
    queryKey: ['latestAuctions'],
    queryFn: async () =>
      await Promise.all([
        execute(latestAuctionsQuery, { first: 1000 }),
        execute(latestAuctionsQuery, { first: 1000, skip: 1000 }),
      ]).then(([page1, page2]) => [...page1.auctions, ...page2.auctions]),
  });

  const dispatch = useAppDispatch();

  useEffect(() => {
    if (auctions) {
      dispatch(addPastAuctions({ auctions }));
    }
  }, [auctions, latestAuctionId, dispatch]);

  return <></>;
};

createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light">
    <TooltipProvider delayDuration={0}>
      <ReduxProvider store={store}>
        <React.StrictMode>
          <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
              {import.meta.env.VITE_ENABLE_TANSTACK_QUERY_DEVTOOLS && (
                <ReactQueryDevtools initialIsOpen={false} />
              )}
              <ChainSubscriber />
              <ApolloProvider client={client}>
                <PastAuctions />
                <LanguageProvider>
                  <App />
                </LanguageProvider>
              </ApolloProvider>
            </QueryClientProvider>
          </WagmiProvider>
        </React.StrictMode>
      </ReduxProvider>
    </TooltipProvider>
  </ThemeProvider>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example, reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
