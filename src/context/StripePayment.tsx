// Native Stripe PaymentSheet wiring. Wraps the app in <StripeProvider> and
// exposes the publishable key + a setter so the checkout flow can populate it
// from the `create-intent` response (the backend `/health` endpoint does not
// return the key, so we learn it lazily on the first checkout attempt).
import React, { createContext, useCallback, useContext, useState } from "react";
import { StripeProvider } from "@stripe/stripe-react-native";

// TODO: Replace with the real Apple merchant ID registered in App Store Connect
// before Apple Pay will work in production (currently a placeholder).
export const STRIPE_MERCHANT_ID = "merchant.com.shopmynest.app";

// Must match the `scheme` in app.json so return-URL redirects (3DS/wallets) work.
export const STRIPE_URL_SCHEME = "thenest";

type StripeKeyContextValue = {
  publishableKey: string;
  setPublishableKey: (key: string) => void;
};

const StripeKeyContext = createContext<StripeKeyContextValue | null>(null);

export function StripePaymentProvider({ children }: { children: React.ReactNode }) {
  const [publishableKey, setKey] = useState("");
  const setPublishableKey = useCallback((key: string) => {
    setKey((cur) => (cur === key ? cur : key));
  }, []);

  return (
    <StripeKeyContext.Provider value={{ publishableKey, setPublishableKey }}>
      <StripeProvider
        publishableKey={publishableKey}
        merchantIdentifier={STRIPE_MERCHANT_ID}
        urlScheme={STRIPE_URL_SCHEME}
      >
        <>{children}</>
      </StripeProvider>
    </StripeKeyContext.Provider>
  );
}

export function useStripeKey(): StripeKeyContextValue {
  const ctx = useContext(StripeKeyContext);
  if (!ctx) throw new Error("useStripeKey must be used within StripePaymentProvider");
  return ctx;
}
