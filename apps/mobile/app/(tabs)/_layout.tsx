import { Tabs } from "expo-router";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { color } from "@/design/tokens";
import { TabBar } from "@/ui";

export default function TabLayout() {
  usePushNotifications();

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="collection" />
      <Tabs.Screen name="decks" />
    </Tabs>
  );
}
