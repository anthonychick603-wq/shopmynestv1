import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { Loading } from '../components/UI';
import HomeScreen from '../screens/HomeScreen';
import ShopScreen from '../screens/ShopScreen';
import CartScreen from '../screens/CartScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import AccountScreen from '../screens/AccountScreen';
import ProductScreen from '../screens/ProductScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import OrderSuccessScreen from '../screens/OrderSuccessScreen';
import AuthScreen from '../screens/AuthScreen';
import ProfileScreen from '../screens/ProfileScreen';
import BuyerOrdersScreen from '../screens/BuyerOrdersScreen';
import MessagesScreen from '../screens/MessagesScreen';
import ConversationScreen from '../screens/ConversationScreen';
import SellerApplicationScreen from '../screens/SellerApplicationScreen';
import SellerDashboardScreen from '../screens/SellerDashboardScreen';
import SellerProductsScreen from '../screens/SellerProductsScreen';
import ProductEditorScreen from '../screens/ProductEditorScreen';
import SellerOrdersScreen from '../screens/SellerOrdersScreen';
import SellerOrderDetailScreen from '../screens/SellerOrderDetailScreen';
import SellerEarningsScreen from '../screens/SellerEarningsScreen';
import SellerProfileScreen from '../screens/SellerProfileScreen';
import ShippingProfileScreen from '../screens/ShippingProfileScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import DisputesScreen from '../screens/DisputesScreen';
import DisputeDetailScreen from '../screens/DisputeDetailScreen';
import NewDisputeScreen from '../screens/NewDisputeScreen';
import OffersScreen from '../screens/OffersScreen';
import MakeOfferScreen from '../screens/MakeOfferScreen';
import BundleBuilderScreen from '../screens/BundleBuilderScreen';
import BoostScreen from '../screens/BoostScreen';
import { colors, spacing } from '../theme';

const tabConfig = {
  Home: { icon: 'home-outline', activeIcon: 'home', component: HomeScreen },
  Shop: { icon: 'search-outline', activeIcon: 'search', component: ShopScreen },
  Cart: { icon: 'bag-outline', activeIcon: 'bag', component: CartScreen },
  Notifications: { icon: 'notifications-outline', activeIcon: 'notifications', component: NotificationsScreen },
  Account: { icon: 'person-outline', activeIcon: 'person', component: AccountScreen },
};

const stackConfig = {
  Product: { title: 'Product', component: ProductScreen },
  Checkout: { title: 'Checkout', component: CheckoutScreen },
  OrderSuccess: { title: 'Order complete', component: OrderSuccessScreen },
  Auth: { title: 'Account', component: AuthScreen },
  Profile: { title: 'Profile & addresses', component: ProfileScreen },
  BuyerOrders: { title: 'My orders', component: BuyerOrdersScreen },
  Messages: { title: 'Messages', component: MessagesScreen },
  Conversation: { title: (route) => route.user?.store_name || route.user?.display_name || 'Conversation', component: ConversationScreen },
  SellerApplication: { title: 'Become a seller', component: SellerApplicationScreen },
  SellerDashboard: { title: 'Seller dashboard', component: SellerDashboardScreen },
  SellerProducts: { title: 'Seller products', component: SellerProductsScreen },
  ProductEditor: { title: (route) => route.product?.id ? 'Edit product' : 'New product', component: ProductEditorScreen },
  SellerOrders: { title: 'Seller orders', component: SellerOrdersScreen },
  SellerOrderDetail: { title: (route) => `Order #${route.order?.number || ''}`, component: SellerOrderDetailScreen },
  SellerEarnings: { title: 'Earnings & payouts', component: SellerEarningsScreen },
  SellerProfile: { title: 'Shop profile', component: SellerProfileScreen },
  ShippingProfile: { title: 'Shipping settings', component: ShippingProfileScreen },
  Favorites: { title: 'Favorites', component: FavoritesScreen },
  Disputes: { title: 'Buyer protection', component: DisputesScreen },
  DisputeDetail: { title: 'Dispute', component: DisputeDetailScreen },
  NewDispute: { title: 'Open a dispute', component: NewDisputeScreen },
  Offers: { title: 'Offers & bundles', component: OffersScreen },
  MakeOffer: { title: 'Make an offer', component: MakeOfferScreen },
  BundleBuilder: { title: 'Bundle builder', component: BundleBuilderScreen },
  Boost: { title: 'Boost listing', component: BoostScreen },
};

export default function AppNavigator() {
  const insets = useSafeAreaInsets();
  const { booting } = useAuth();
  const { itemCount } = useCart();
  const [activeTab, setActiveTab] = useState('Home');
  const [stack, setStack] = useState([]);

  const navigation = useMemo(() => ({
    push(name, params = {}) {
      setStack((current) => [...current, { key: `${name}-${Date.now()}-${Math.random()}`, name, params }]);
    },
    replace(name, params = {}) {
      setStack((current) => {
        const next = { key: `${name}-${Date.now()}-${Math.random()}`, name, params };
        return current.length ? [...current.slice(0, -1), next] : [next];
      });
    },
    goBack() {
      setStack((current) => current.slice(0, -1));
    },
    switchTab(name) {
      if (!tabConfig[name]) return;
      setStack([]);
      setActiveTab(name);
    },
    resetToTab(name) {
      if (!tabConfig[name]) return;
      setStack([]);
      setActiveTab(name);
    },
  }), []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length) {
        setStack((current) => current.slice(0, -1));
        return true;
      }
      if (activeTab !== 'Home') {
        setActiveTab('Home');
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [activeTab, stack.length]);

  if (booting) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Loading label="Opening The Nest…" />
      </View>
    );
  }

  const topRoute = stack[stack.length - 1];
  if (topRoute) {
    const config = stackConfig[topRoute.name];
    const ScreenComponent = config?.component;
    const title = typeof config?.title === 'function' ? config.title(topRoute.params) : config?.title;
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.stackHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={navigation.goBack} style={styles.backButton} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </Pressable>
          <Text numberOfLines={1} style={styles.stackTitle}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={{ flex: 1, paddingBottom: insets.bottom }}>
          {ScreenComponent ? <ScreenComponent navigation={navigation} route={topRoute.params} /> : null}
        </View>
      </View>
    );
  }

  const ActiveScreen = tabConfig[activeTab].component;
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.tabContent}><ActiveScreen navigation={navigation} route={{}} /></View>
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {Object.entries(tabConfig).map(([name, item]) => {
          const active = activeTab === name;
          const badge = name === 'Cart' ? itemCount : 0;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={name}
              onPress={() => navigation.switchTab(name)}
              style={styles.tabButton}
            >
              <View>
                <Ionicons name={active ? item.activeIcon : item.icon} size={24} color={active ? colors.primary : colors.muted} />
                {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text></View> : null}
              </View>
              <Text style={[styles.tabLabel, active && styles.activeLabel]}>{name === 'Notifications' ? 'Alerts' : name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  tabContent: { flex: 1 },
  bottomBar: { minHeight: 68, paddingTop: 8, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around' },
  tabButton: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', marginTop: 4 },
  activeLabel: { color: colors.primary },
  badge: { position: 'absolute', right: -11, top: -7, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.onDanger, fontWeight: '900', fontSize: 9 },
  stackHeader: { height: 58, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.sm },
  backButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  stackTitle: { flex: 1, textAlign: 'center', color: colors.text, fontWeight: '900', fontSize: 17 },
  headerSpacer: { width: 46 },
});
