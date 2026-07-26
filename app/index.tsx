import { Redirect } from "expo-router";

// The Nest — root redirect to the tab layout.
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
