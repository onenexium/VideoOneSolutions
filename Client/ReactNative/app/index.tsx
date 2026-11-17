import { Redirect } from "expo-router";

/**
 * The app opens on Home. (The sample's "select the scene of interest" picker is gone: this app has
 * one scene.) First launch, consent, forced update and maintenance are shown over Home by the root
 * layout, so they still come first.
 */
export default function Index() {
  return <Redirect href="/drama_channel" />;
}
