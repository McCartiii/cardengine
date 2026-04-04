import React, { useState } from "react";
import { View, StyleSheet, SafeAreaView } from "react-native";
import { CollectionTab } from "./tabs/CollectionTab";
import { ScannerTab } from "./tabs/ScannerTab";
import { DeckAdvisorTab } from "./tabs/DeckAdvisorTab";
import { MapTab } from "./tabs/MapTab";
import { ProfileTab } from "./tabs/ProfileTab";
import { TabBar, type TabItem } from "../components/ui/TabBar";
import { colors } from "../theme";

const t = colors.light;

type Tab = "collection" | "scanner" | "decks" | "map" | "profile";

const tabs: TabItem[] = [
  { key: "collection", label: "Collection", icon: "albums-outline", iconActive: "albums" },
  { key: "scanner", label: "Scan", icon: "camera-outline", iconActive: "camera" },
  { key: "decks", label: "Decks", icon: "layers-outline", iconActive: "layers" },
  { key: "map", label: "Map", icon: "map-outline", iconActive: "map" },
  { key: "profile", label: "Profile", icon: "person-outline", iconActive: "person" },
];

export function MainApp() {
  const [activeTab, setActiveTab] = useState<Tab>("collection");

  const renderTab = () => {
    switch (activeTab) {
      case "collection":
        return <CollectionTab />;
      case "scanner":
        return <ScannerTab />;
      case "decks":
        return <DeckAdvisorTab />;
      case "map":
        return <MapTab />;
      case "profile":
        return <ProfileTab />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>{renderTab()}</View>
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabPress={(key) => setActiveTab(key as Tab)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
  },
  content: {
    flex: 1,
  },
});
