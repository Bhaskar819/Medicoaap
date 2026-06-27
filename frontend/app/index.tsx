import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/src/auth";
import { colors } from "@/src/theme";

export default function Index() {
  const { session, ready } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  if (!session) return <Redirect href="/(auth)/login" />;
  if (session.user.role === "admin") return <Redirect href="/admin/dashboard" />;
  if (session.user.role === "clinic_owner") return <Redirect href="/clinic/dashboard" />;
  return <Redirect href="/(tabs)/home" />;
}
