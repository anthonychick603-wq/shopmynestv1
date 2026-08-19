import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError, type NestAddressBookEntry, type NestAddressBookWrite } from "@/src/api/nest";
import { colors, radius, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

// v1.0.92 (Build #11) — address book add/edit. Country defaults to US, state
// defaults to NH per project preference. Server enforces one-default-only.

export default function AddressEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

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
    if (!form.address_1?.trim() || !form.city?.trim() || !form.postcode?.trim()) {
      toast.error("Street, city, and ZIP are required");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && id) await nest.updateAddress(String(id), form);
      else await nest.createAddress(form);
      toast.success(isEdit ? "Address saved" : "Address added");
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
        <CartHeaderButton />
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md }}>
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
          <Field label="Phone" value={form.phone || ""} onChange={v => set("phone", v)} keyboard="phone-pad" />

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

function Field({ label, value, onChange, placeholder, keyboard }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: "default" | "number-pad" | "phone-pad" | "decimal-pad" }) {
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
});
