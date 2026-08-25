import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError, type NestAddressBookEntry, type NestAddressBookWrite } from "@/src/api/nest";
import { colors, radius, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { useAuth } from "@/src/context/AuthContext";
import { toUser } from "@/src/api/adapters";

// v1.0.92 (Build #11) — address book add/edit. Country defaults to US, state
// defaults to NH per project preference. Server enforces one-default-only.

export default function AddressEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // v1.0.161 — Account contact section, hydrated from useAuth().user and
  // persisted via PATCH /auth/me alongside the address save. Lets the buyer
  // fix everything the plugin v3.13.32 buyer_contact_incomplete gate needs
  // from a single screen.
  const { user, updateUser } = useAuth();
  const [accountEmail, setAccountEmail] = useState<string>(user?.email || "");
  const [accountPhone, setAccountPhone] = useState<string>(user?.phone || "");
  useEffect(() => {
    // Keep local state in sync if useAuth refreshes while the screen is open.
    if (user?.email && !accountEmail) setAccountEmail(user.email);
    if (user?.phone && !accountPhone) setAccountPhone(user.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, user?.phone]);

  const [form, setForm] = useState<NestAddressBookWrite>({
    label: "",
    first_name: "",
    last_name: "",
    company: "",
    address_1: "",
    address_2: "",
    city: "",
    state: "NH",
    postcode: "",
    country: "US",
    phone: "",
    is_default: false,
  });

  useEffect(() => {
    if (!isEdit || !id) return;
    (async () => {
      try {
        const list = await nest.listAddressBook();
        const a = (list.items || []).find(x => x.id === String(id));
        if (a) setForm(hydrateForm(a));
        else toast.error("Address not found");
      } catch (e) {
        toast.error(e instanceof ApiError ? e.friendly : "Load failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit]);

  const set = <K extends keyof NestAddressBookWrite>(k: K, v: NestAddressBookWrite[K]) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    // v1.0.161 — Validate contact fields alongside the address so the buyer
    // gets one error at a time, matching the plugin's rules.
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail.trim());
    if (!emailOk) {
      toast.error("Enter a valid email address");
      return;
    }
    const phoneDigits = accountPhone.replace(/\D+/g, "");
    if (phoneDigits.length < 10) {
      toast.error("Enter a phone number with at least 10 digits");
      return;
    }
    if (!form.address_1?.trim() || !form.city?.trim() || !form.postcode?.trim()) {
      toast.error("Street, city, and ZIP are required");
      return;
    }
    // v1.0.168 — Ensure the shipping address itself carries a phone number,
    // not just the account. USPS labels print the recipient-phone off the
    // address (not off billing_phone), so a missing address.phone shows up
    // as "unknown recipient phone" on the carrier side. Default to the
    // account phone the user just typed above when the field is blank.
    const addrPhoneDigits = String(form.phone || "").replace(/\D+/g, "");
    if (addrPhoneDigits.length < 10) {
      // Copy account phone into the address so the record is complete
      // (accountPhone was already validated to be ≥ 10 digits above).
      form.phone = accountPhone;
    }
    setSaving(true);
    try {
      // Only PATCH /auth/me when a value actually changed. `undefined` fields
      // are dropped by JSON.stringify, so an unchanged email or phone doesn't
      // trip email_exists / invalid_phone unnecessarily.
      const accountPayload: Record<string, string> = {};
      if (accountEmail.trim() !== (user?.email || "")) accountPayload.email = accountEmail.trim();
      if (accountPhone !== (user?.phone || "")) accountPayload.phone = accountPhone;
      if (Object.keys(accountPayload).length > 0) {
        const updatedRaw = await nest.updateMe(accountPayload);
        updateUser(toUser(updatedRaw));
      }
      if (isEdit && id) await nest.updateAddress(String(id), form);
      else await nest.createAddress(form);
      toast.success(isEdit ? "Contact and address saved" : "Contact and address added");
      safeBack(router, "/me/addresses");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/me/addresses"); }} style={styles.iconBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? "Edit address" : "New address"}</Text>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md }}>
          {/* v1.0.161 — Account contact section: what the plugin v3.13.32
              buyer_contact_incomplete gate reads from user_email and
              billing_phone user meta. Sits at the top so it's the first
              thing a buyer sees when routed here from a blocked checkout. */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account contact</Text>
            <Text style={styles.sectionHint}>ShopMyNest emails order receipts here, and carriers use the phone if a shipment needs attention. Both are required to check out.</Text>
            <Field label="Email" value={accountEmail} onChange={setAccountEmail} keyboard="email-address" autoCapitalize="none" />
            <Field label="Phone" value={accountPhone} onChange={setAccountPhone} keyboard="phone-pad" />
          </View>
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Shipping address</Text>
          <Field label="Label (optional)" value={form.label || ""} onChange={v => set("label", v)} placeholder="Home" />
          <Row>
            <Field label="First name" value={form.first_name || ""} onChange={v => set("first_name", v)} />
            <Field label="Last name" value={form.last_name || ""} onChange={v => set("last_name", v)} />
          </Row>
          <Field label="Company (optional)" value={form.company || ""} onChange={v => set("company", v)} />
          <Field label="Street" value={form.address_1 || ""} onChange={v => set("address_1", v)} />
          <Field label="Apt / suite" value={form.address_2 || ""} onChange={v => set("address_2", v)} />
          <Field label="City" value={form.city || ""} onChange={v => set("city", v)} />
          <Row>
            <Field label="State" value={form.state || ""} onChange={v => set("state", v)} />
            <Field label="ZIP" value={form.postcode || ""} onChange={v => set("postcode", v)} keyboard="number-pad" />
          </Row>
          <Field label="Country" value={form.country || ""} onChange={v => set("country", v.toUpperCase())} placeholder="US" />
          <Field label="Phone*" value={form.phone || ""} onChange={v => set("phone", v)} keyboard="phone-pad" />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Set as default</Text>
              <Text style={styles.hint}>Used automatically during checkout.</Text>
            </View>
            <Switch value={!!form.is_default} onValueChange={v => set("is_default", v)} trackColor={{ true: colors.brand, false: colors.border }} />
          </View>

          <Button title={isEdit ? "Save changes" : "Add address"} onPress={() => { haptics.press(); save(); }} loading={saving} style={{ marginTop: spacing.lg }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function hydrateForm(a: NestAddressBookEntry): NestAddressBookWrite {
  return {
    label: a.label, first_name: a.first_name, last_name: a.last_name, company: a.company,
    address_1: a.address_1, address_2: a.address_2, city: a.city, state: a.state,
    postcode: a.postcode, country: a.country, phone: a.phone, is_default: a.is_default,
  };
}

function Row({ children }: { children: React.ReactNode }) { return <View style={styles.row}>{children}</View>; }

function Field({ label, value, onChange, placeholder, keyboard, autoCapitalize }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: "default" | "number-pad" | "phone-pad" | "decimal-pad" | "email-address"; autoCapitalize?: "none" | "sentences" | "words" | "characters" }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.onSurfaceMuted}
        style={styles.input}
        keyboardType={keyboard || "default"}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCapitalize === "none" ? false : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  iconBtn: { padding: spacing.xs, borderRadius: radius.pill },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { color: colors.onSurface, fontWeight: "600", marginTop: spacing.md, marginBottom: 6 },
  hint: { color: colors.onSurfaceMuted, marginTop: 2 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, color: colors.onSurface, backgroundColor: colors.surface },
  row: { flexDirection: "row", gap: spacing.sm },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, paddingVertical: spacing.sm },
  // v1.0.161 — Account contact section styling.
  section: { marginBottom: spacing.md },
  sectionTitle: { color: colors.onSurface, fontWeight: "700", fontSize: 15, marginTop: spacing.sm, marginBottom: 2 },
  sectionHint: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 16, marginBottom: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
});
