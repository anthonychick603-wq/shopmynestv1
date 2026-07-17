import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { initStripe, useStripe } from '@stripe/stripe-react-native';
import { Button, EmptyState, Field, Loading, Screen } from '../components/UI';
import { APP_NAME, MERCHANT_IDENTIFIER } from '../config';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { api } from '../lib/api';
import { money } from '../lib/format';
import {
  clearCheckoutSession,
  clearPendingCheckout,
  loadCheckoutSession,
  loadPendingCheckout,
  saveCheckoutSession,
  savePendingCheckout,
} from '../lib/storage';
import { colors, radii, spacing } from '../theme';

const emptyAddress = {
  first_name: '',
  last_name: '',
  address_1: '',
  address_2: '',
  city: '',
  state: '',
  postcode: '',
  country: 'US',
  email: '',
  phone: '',
};

const PAYABLE_INTENT_STATUSES = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]);

function newCheckoutToken() {
  return `android_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function readableStatus(status) {
  return String(status || 'processing').replace(/_/g, ' ');
}

function checkoutErrorMessage(err, fallback = 'Checkout could not be completed.') {
  const message = String(err?.message || '');
  const code = String(err?.code || '');
  if (code === 'stripe_tax_calculation_warning' || /taxes have not been calculated/i.test(message)) {
    return 'The website tax connector blocked checkout. Install MyNest Mobile App Bridge 1.1.0, then retry. In Stripe Tax Sandbox mode, the bridge safely falls back to WooCommerce tax tables instead of stopping the order.';
  }
  return message || fallback;
}

export default function CheckoutScreen({ navigation }) {
  const { token, user } = useAuth();
  const { items, clearCart } = useCart();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [address, setAddress] = useState({ ...emptyAddress, email: user?.email || '' });
  const [quote, setQuote] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [paying, setPaying] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [checkoutSessionLoaded, setCheckoutSessionLoaded] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(null);
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [error, setError] = useState('');
  const checkoutTokenRef = useRef(newCheckoutToken());
  const recoveryAttemptedRef = useRef(null);

  const checkoutItems = useMemo(() => items.map((item) => ({
    product_id: item.product.id,
    quantity: item.quantity,
  })), [items]);
  const cartKey = useMemo(() => JSON.stringify(checkoutItems), [checkoutItems]);

  useEffect(() => {
    let active = true;

    async function restoreCheckoutSession() {
      if (!token || !user?.id || !checkoutItems.length) {
        if (active) setCheckoutSessionLoaded(true);
        return;
      }

      setCheckoutSessionLoaded(false);
      const saved = await loadCheckoutSession();
      if (!active) return;

      const matchesCurrentCart = saved
        && String(saved.user_id) === String(user.id)
        && saved.cart_key === cartKey;
      const next = matchesCurrentCart ? saved : {
        user_id: user.id,
        cart_key: cartKey,
        checkout_token: newCheckoutToken(),
        created_at: new Date().toISOString(),
      };

      checkoutTokenRef.current = next.checkout_token;
      if (!matchesCurrentCart) await saveCheckoutSession(next);
      if (active) setCheckoutSessionLoaded(true);
    }

    void restoreCheckoutSession();
    return () => { active = false; };
  }, [cartKey, checkoutItems.length, token, user?.id]);

  useEffect(() => {
    let active = true;
    setPendingLoaded(false);
    loadPendingCheckout()
      .then((saved) => {
        if (!active) return;
        const belongsToUser = saved && String(saved.user_id) === String(user?.id || '');
        setPendingCheckout(belongsToUser ? saved : null);
      })
      .finally(() => {
        if (active) setPendingLoaded(true);
      });
    return () => { active = false; };
  }, [token, user?.id]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    api.getAddresses(token)
      .then((saved) => {
        if (!active) return;
        const shipping = saved?.shipping || saved?.billing || saved;
        if (shipping && typeof shipping === 'object') {
          setAddress((current) => ({
            ...current,
            ...shipping,
            country: shipping.country || current.country || 'US',
            email: shipping.email || current.email || user?.email || '',
          }));
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [token, user?.email]);

  const replaceCheckoutToken = useCallback(async () => {
    if (!user?.id) return;
    const next = {
      user_id: user.id,
      cart_key: cartKey,
      checkout_token: newCheckoutToken(),
      created_at: new Date().toISOString(),
    };
    checkoutTokenRef.current = next.checkout_token;
    await saveCheckoutSession(next);
  }, [cartKey, user?.id]);

  const finishSuccessfulOrder = useCallback(async (orderId, savedAddress) => {
    await Promise.all([clearPendingCheckout(), clearCheckoutSession()]);
    setPendingCheckout(null);
    if (savedAddress && token) {
      void api.saveAddresses({ billing: savedAddress, shipping: savedAddress }, token).catch(() => {});
    }
    clearCart();
    navigation.replace('OrderSuccess', { orderId });
  }, [clearCart, navigation, token]);

  const finishPendingPayment = useCallback(async (pending, showAlert = true) => {
    if (!token || !pending || checkingPayment) return false;

    setCheckingPayment(true);
    setError('');
    try {
      const completed = await api.completeCheckout({
        order_id: pending.order_id,
        payment_intent_id: pending.payment_intent_id,
      }, token);

      if (!completed?.ok) {
        const paymentStatus = String(completed?.payment_status || 'unknown');

        if (PAYABLE_INTENT_STATUSES.has(paymentStatus)) {
          await clearPendingCheckout();
          setPendingCheckout(null);
          recoveryAttemptedRef.current = null;
          const message = 'The previous payment was not completed and no completed charge was found. You can safely retry payment for the same order.';
          setError(message);
          if (showAlert) Alert.alert('Payment not completed', message);
          return false;
        }

        if (paymentStatus === 'canceled') {
          await clearPendingCheckout();
          setPendingCheckout(null);
          recoveryAttemptedRef.current = null;
          await replaceCheckoutToken();
          const message = 'The previous payment attempt was canceled and no completed charge was found. You can safely start a new payment attempt.';
          setError(message);
          if (showAlert) Alert.alert('Payment canceled', message);
          return false;
        }

        const message = `Your payment is ${readableStatus(paymentStatus)}. Do not submit another payment. Check the status again in a moment.`;
        setError(message);
        if (showAlert) Alert.alert('Payment still being verified', message);
        return false;
      }

      await finishSuccessfulOrder(completed.order_id || pending.order_id, pending.address);
      return true;
    } catch (err) {
      const message = `${err.message || 'The payment status could not be verified.'} Do not submit another payment. Use “Check payment status” to try again.`;
      setError(message);
      if (showAlert) Alert.alert('Payment verification interrupted', message);
      return false;
    } finally {
      setCheckingPayment(false);
    }
  }, [checkingPayment, finishSuccessfulOrder, replaceCheckoutToken, token]);

  useEffect(() => {
    if (!pendingLoaded || !pendingCheckout || !token) return;
    const recoveryKey = `${pendingCheckout.user_id}:${pendingCheckout.order_id}`;
    if (recoveryAttemptedRef.current === recoveryKey) return;
    recoveryAttemptedRef.current = recoveryKey;
    void finishPendingPayment(pendingCheckout, false);
  }, [finishPendingPayment, pendingCheckout, pendingLoaded, token]);

  const loadQuote = useCallback(async () => {
    if (!token || !checkoutItems.length || pendingCheckout || !checkoutSessionLoaded) return;
    setLoadingQuote(true);
    try {
      const result = await api.quoteCheckout(checkoutItems, null, token);
      setQuote(result);
      setError('');
    } catch (err) {
      setQuote(null);
      setError(checkoutErrorMessage(err, 'Could not calculate checkout totals.'));
    } finally {
      setLoadingQuote(false);
    }
  }, [checkoutItems, checkoutSessionLoaded, pendingCheckout, token]);

  useEffect(() => {
    if (pendingLoaded) void loadQuote();
  }, [loadQuote, pendingLoaded]);

  function setField(key, value) {
    setAddress((current) => ({ ...current, [key]: value }));
  }

  function validate() {
    const required = ['first_name', 'last_name', 'address_1', 'city', 'state', 'postcode', 'country', 'email'];
    const missing = required.filter((key) => !String(address[key] || '').trim());
    if (missing.length) {
      Alert.alert('Shipping address incomplete', 'Complete your name, street, city, state, ZIP code, country, and email.');
      return false;
    }
    if (!String(address.email).includes('@')) {
      Alert.alert('Email needed', 'Enter a valid email address for your receipt and order updates.');
      return false;
    }
    return true;
  }

  async function pay() {
    if (!token) {
      navigation.push('Auth', { mode: 'login', returnTo: 'Checkout' });
      return;
    }
    if (pendingCheckout) {
      await finishPendingPayment(pendingCheckout);
      return;
    }
    if (!items.length || !quote || !validate() || paying || checkingPayment || !checkoutSessionLoaded) return;

    setPaying(true);
    setError('');
    try {
      const normalizedAddress = {
        ...address,
        first_name: String(address.first_name || '').trim(),
        last_name: String(address.last_name || '').trim(),
        address_1: String(address.address_1 || '').trim(),
        address_2: String(address.address_2 || '').trim(),
        city: String(address.city || '').trim(),
        state: String(address.state || '').trim().toUpperCase(),
        postcode: String(address.postcode || '').trim(),
        country: String(address.country || 'US').trim().toUpperCase(),
        email: String(address.email || '').trim().toLowerCase(),
        phone: String(address.phone || '').trim(),
      };

      // Refresh the quote with the completed shipping address immediately
      // before creating the order. This prevents an expired quote and gives the
      // website the best available address data for tax and shipping totals.
      const freshQuote = await api.quoteCheckout(checkoutItems, normalizedAddress, token);
      setQuote(freshQuote);

      const intent = await api.createPaymentIntent({
        quote_token: freshQuote.quote_token,
        checkout_token: checkoutTokenRef.current,
        billing: normalizedAddress,
        shipping: normalizedAddress,
      }, token);

      if (!intent?.publishable_key || !intent?.client_secret || !intent?.order_id || !intent?.payment_intent_id) {
        throw new Error('Stripe checkout is not fully configured on the website.');
      }

      let currentPaymentStatus = '';
      try {
        const existing = await api.completeCheckout({
          order_id: intent.order_id,
          payment_intent_id: intent.payment_intent_id,
        }, token);
        if (existing?.ok) {
          await finishSuccessfulOrder(existing.order_id || intent.order_id, normalizedAddress);
          return;
        }
        currentPaymentStatus = String(existing?.payment_status || '');
      } catch {
        // Continue to PaymentSheet. The same persisted checkout token prevents
        // another order from being created if this is a resumed attempt.
      }

      if (currentPaymentStatus === 'canceled') {
        await replaceCheckoutToken();
        throw new Error('The previous payment attempt expired. Tap the payment button again to start a new secure attempt.');
      }

      if (currentPaymentStatus && !PAYABLE_INTENT_STATUSES.has(currentPaymentStatus)) {
        const pending = {
          user_id: user.id,
          order_id: intent.order_id,
          payment_intent_id: intent.payment_intent_id,
          checkout_token: checkoutTokenRef.current,
          cart_key: cartKey,
          address: normalizedAddress,
          created_at: new Date().toISOString(),
        };
        await savePendingCheckout(pending);
        setPendingCheckout(pending);
        recoveryAttemptedRef.current = `${pending.user_id}:${pending.order_id}`;
        setError(`Your payment is ${readableStatus(currentPaymentStatus)}. MyNest will keep checking it without creating another charge.`);
        return;
      }

      await initStripe({
        publishableKey: intent.publishable_key,
        merchantIdentifier: MERCHANT_IDENTIFIER,
        urlScheme: 'thenest',
      });

      const isTest = String(intent.publishable_key).startsWith('pk_test_');
      const initResult = await initPaymentSheet({
        merchantDisplayName: APP_NAME,
        paymentIntentClientSecret: intent.client_secret,
        returnURL: 'thenest://stripe-redirect',
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: {
          name: `${normalizedAddress.first_name} ${normalizedAddress.last_name}`.trim(),
          email: normalizedAddress.email,
          phone: normalizedAddress.phone,
          address: {
            line1: normalizedAddress.address_1,
            line2: normalizedAddress.address_2,
            city: normalizedAddress.city,
            state: normalizedAddress.state,
            postalCode: normalizedAddress.postcode,
            country: normalizedAddress.country,
          },
        },
        googlePay: {
          merchantCountryCode: 'US',
          testEnv: isTest,
          currencyCode: String(intent.currency || 'usd').toUpperCase(),
        },
        style: 'automatic',
      });
      if (initResult.error) throw new Error(initResult.error.message);

      const paymentResult = await presentPaymentSheet();
      if (paymentResult.error) {
        if (paymentResult.error.code === 'Canceled') return;
        throw new Error(paymentResult.error.message);
      }

      const pending = {
        user_id: user.id,
        order_id: intent.order_id,
        payment_intent_id: intent.payment_intent_id,
        checkout_token: checkoutTokenRef.current,
        cart_key: cartKey,
        address: normalizedAddress,
        created_at: new Date().toISOString(),
      };
      await savePendingCheckout(pending);
      setPendingCheckout(pending);
      recoveryAttemptedRef.current = `${pending.user_id}:${pending.order_id}`;

      await finishPendingPayment(pending);
    } catch (err) {
      const message = checkoutErrorMessage(err);
      setError(message);
      Alert.alert('Checkout error', message);
    } finally {
      setPaying(false);
    }
  }

  if (!token) {
    return (
      <Screen scroll contentContainerStyle={styles.content}>
        <View style={styles.signInCard}>
          <Text style={styles.title}>Sign in to check out</Text>
          <Text style={styles.subtitle}>Your cart will stay saved while you sign in or create an account.</Text>
          <Button title="Sign in" onPress={() => navigation.push('Auth', { mode: 'login', returnTo: 'Checkout' })} />
          <Button title="Create account" variant="outline" onPress={() => navigation.push('Auth', { mode: 'register', returnTo: 'Checkout' })} style={{ marginTop: 10 }} />
        </View>
      </Screen>
    );
  }

  if (!pendingLoaded) return <Loading label="Checking checkout status…" />;

  if (pendingCheckout) {
    return (
      <Screen scroll contentContainerStyle={styles.content}>
        <View style={styles.pendingCard}>
          <Text style={styles.pendingEyebrow}>ORDER #{pendingCheckout.order_id}</Text>
          <Text style={styles.title}>Finishing your payment</Text>
          <Text style={styles.subtitle}>The secure payment step was completed. MyNest is verifying the payment and finalizing your order. Do not submit another payment.</Text>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button
            title={checkingPayment ? 'Checking payment…' : 'Check payment status'}
            icon="refresh-outline"
            onPress={() => finishPendingPayment(pendingCheckout)}
            loading={checkingPayment}
          />
          <Button title="View my orders" variant="outline" onPress={() => navigation.push('BuyerOrders')} style={{ marginTop: 10 }} />
        </View>
      </Screen>
    );
  }

  if (!checkoutSessionLoaded) return <Loading label="Preparing secure checkout…" />;

  if (!items.length) {
    return (
      <Screen>
        <EmptyState icon="bag-outline" title="Your cart is empty" message="Add an item before opening checkout." action="Browse the shop" onAction={() => navigation.resetToTab('Shop')} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll contentContainerStyle={styles.content}>
        <Text style={styles.title}>Shipping address</Text>
        <Text style={styles.subtitle}>Your card details stay inside Stripe’s secure native payment sheet.</Text>
        <View style={styles.nameRow}>
          <Field label="First name" value={address.first_name} onChangeText={(v) => setField('first_name', v)} containerStyle={styles.halfField} autoComplete="given-name" />
          <Field label="Last name" value={address.last_name} onChangeText={(v) => setField('last_name', v)} containerStyle={styles.halfField} autoComplete="family-name" />
        </View>
        <Field label="Street address" value={address.address_1} onChangeText={(v) => setField('address_1', v)} autoComplete="street-address" />
        <Field label="Apartment, suite, etc. (optional)" value={address.address_2} onChangeText={(v) => setField('address_2', v)} />
        <Field label="City" value={address.city} onChangeText={(v) => setField('city', v)} autoComplete="postal-address-locality" />
        <View style={styles.nameRow}>
          <Field label="State" value={address.state} onChangeText={(v) => setField('state', v.toUpperCase())} autoCapitalize="characters" maxLength={2} containerStyle={styles.halfField} />
          <Field label="ZIP code" value={address.postcode} onChangeText={(v) => setField('postcode', v)} keyboardType="number-pad" autoComplete="postal-code" containerStyle={styles.halfField} />
        </View>
        <Field label="Country code" value={address.country} onChangeText={(v) => setField('country', v.toUpperCase())} autoCapitalize="characters" maxLength={2} />
        <Field label="Email" value={address.email} onChangeText={(v) => setField('email', v)} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <Field label="Phone (optional)" value={address.phone} onChangeText={(v) => setField('phone', v)} keyboardType="phone-pad" autoComplete="tel" />

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order summary</Text>
          <View style={styles.row}><Text style={styles.label}>Items</Text><Text style={styles.value}>{money(quote?.subtotal || 0, quote?.currency)}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Shipping</Text><Text style={styles.value}>{loadingQuote ? 'Calculating…' : money(quote?.shipping || 0, quote?.currency)}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Tax</Text><Text style={styles.value}>{quote?.tax_estimated ? 'Finalized before payment' : money(quote?.tax || 0, quote?.currency)}</Text></View>
          <View style={[styles.row, styles.totalRow]}><Text style={styles.totalLabel}>Estimated total</Text><Text style={styles.totalValue}>{money(quote?.total || 0, quote?.currency)}</Text></View>
        </View>
        {error ? (
          <View style={styles.errorWrap}>
            <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
            {!quote ? <Button title="Recalculate total" variant="outline" onPress={loadQuote} loading={loadingQuote} /> : null}
          </View>
        ) : null}
        <Button title={paying ? 'Opening secure payment…' : 'Continue to secure payment'} icon="lock-closed-outline" onPress={pay} loading={paying} disabled={loadingQuote || !quote || checkingPayment || !checkoutSessionLoaded} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 52 },
  title: { color: colors.text, fontSize: 27, fontWeight: '900' },
  subtitle: { color: colors.muted, lineHeight: 21, marginTop: 6, marginBottom: spacing.xl },
  nameRow: { flexDirection: 'row', gap: spacing.md },
  halfField: { flex: 1, minWidth: 0 },
  signInCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.xl, marginTop: spacing.xl },
  pendingCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.xl, marginTop: spacing.xl },
  pendingEyebrow: { color: colors.primary, fontWeight: '900', fontSize: 12, letterSpacing: 0.7, marginBottom: spacing.sm },
  summaryCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg, marginVertical: spacing.lg },
  summaryTitle: { color: colors.text, fontWeight: '900', fontSize: 19, marginBottom: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, gap: spacing.md },
  label: { color: colors.muted },
  value: { color: colors.text, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginBottom: 0 },
  totalLabel: { color: colors.text, fontWeight: '900', fontSize: 18 },
  totalValue: { color: colors.primary, fontWeight: '900', fontSize: 23 },
  errorWrap: { marginBottom: spacing.md },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm, lineHeight: 20 },
});
