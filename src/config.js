import Constants from 'expo-constants';

const configuredSite = Constants.expoConfig?.extra?.siteUrl || 'https://shopmynest.com';

export const SITE_URL = String(configuredSite).replace(/\/+$/, '');
export const API_NAMESPACES = {
  marketplace: '/wp-json/the-nest/v1',
  operations: '/wp-json/nest-ops/v1',
  checkout: '/wp-json/nest-native/v1',
  labels: '/wp-json/nest-labels/v1',
  shipping: '/wp-json/nest-shipping/v1',
  trust: '/wp-json/nest-trust/v1',
};

export const APP_NAME = 'The Nest';
export const MERCHANT_IDENTIFIER = 'merchant.com.thenest.marketplace';
