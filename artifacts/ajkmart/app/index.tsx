import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { ActivityIndicator, View } from "react-native";
import Colors from "@/constants/colors";
import { hasSeenOnboarding } from "./onboarding";
import React, { useEffect, useState } from "react";

const C = Colors.light;

export default function RootIndex() {
  const { isLoading } = useAuth();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState(false);

  useEffect(() => {
    hasSeenOnboarding()
      .then(seen => {
        setHasOnboarded(seen);
        setOnboardingChecked(true);
      })
      .catch(() => {
        setHasOnboarded(false);
        setOnboardingChecked(true);
      });
  }, []);

  if (isLoading || !onboardingChecked) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.background }}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  if (!hasOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}
