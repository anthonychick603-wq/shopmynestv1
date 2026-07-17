import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'the_nest_session_v2';
const CART_KEY = 'the_nest_cart_v2';
const CHECKOUT_SESSION_KEY = 'the_nest_checkout_session_v1';
const PENDING_CHECKOUT_KEY = 'the_nest_pending_checkout_v1';

export async function loadSession() {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});
      return null;
    }
  } catch {
    return null;
  }
}

export async function saveSession(session) {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export async function clearSession() {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function loadCart() {
  try {
    const raw = await AsyncStorage.getItem(CART_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      await AsyncStorage.removeItem(CART_KEY).catch(() => {});
      return [];
    }
  } catch {
    return [];
  }
}

export async function saveCart(items) {
  try {
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export async function loadCheckoutSession() {
  try {
    const raw = await AsyncStorage.getItem(CHECKOUT_SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.checkout_token || !parsed?.user_id || !parsed?.cart_key) {
        await AsyncStorage.removeItem(CHECKOUT_SESSION_KEY).catch(() => {});
        return null;
      }
      return parsed;
    } catch {
      await AsyncStorage.removeItem(CHECKOUT_SESSION_KEY).catch(() => {});
      return null;
    }
  } catch {
    return null;
  }
}

export async function saveCheckoutSession(checkoutSession) {
  try {
    await AsyncStorage.setItem(CHECKOUT_SESSION_KEY, JSON.stringify(checkoutSession));
    return true;
  } catch {
    return false;
  }
}

export async function clearCheckoutSession() {
  try {
    await AsyncStorage.removeItem(CHECKOUT_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function loadPendingCheckout() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.order_id || !parsed?.payment_intent_id || !parsed?.user_id) {
        await AsyncStorage.removeItem(PENDING_CHECKOUT_KEY).catch(() => {});
        return null;
      }
      return parsed;
    } catch {
      await AsyncStorage.removeItem(PENDING_CHECKOUT_KEY).catch(() => {});
      return null;
    }
  } catch {
    return null;
  }
}

export async function savePendingCheckout(checkout) {
  try {
    await AsyncStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(checkout));
    return true;
  } catch {
    return false;
  }
}

export async function clearPendingCheckout() {
  try {
    await AsyncStorage.removeItem(PENDING_CHECKOUT_KEY);
    return true;
  } catch {
    return false;
  }
}
