import { configureStore } from '@reduxjs/toolkit';
import { combineReducers } from 'redux';
import { createLogger } from 'redux-logger';

import account from '@/state/slices/account';
import application from '@/state/slices/application';
import auction from '@/state/slices/auction';
import candidates from '@/state/slices/candidates';
import logs from '@/state/slices/logs';
import onDisplayAuction from '@/state/slices/onDisplayAuction';
import pastAuctions from '@/state/slices/pastAuctions';

const createRootReducer = () =>
  combineReducers({
    account,
    application,
    auction,
    candidates,
    logs,
    pastAuctions,
    onDisplayAuction,
  });
const loggerMiddleware = createLogger();

export const store = configureStore({
  reducer: createRootReducer(),
  middleware: getDefaultMiddleware => {
    const middleware = getDefaultMiddleware({
      serializableCheck: false,
    });
    // Enable logger in development and when explicitly enabled
    if (
      import.meta.env.MODE !== 'production' &&
      import.meta.env.VITE_ENABLE_REDUX_LOGGER === 'true'
    ) {
      return middleware.concat(loggerMiddleware);
    }
    return middleware;
  },
  devTools: import.meta.env.MODE !== 'production',
  preloadedState: undefined,
});

export type RootState = ReturnType<ReturnType<typeof createRootReducer>>;
export type AppDispatch = typeof store.dispatch;
