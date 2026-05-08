import { Redirect } from "expo-router";

export default function PharmacyCheckout() {
  return <Redirect href="/pharmacy?checkout=1" />;
}
