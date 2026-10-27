import { Redirect } from "expo-router";
import * as WebBrowser from "expo-web-browser";

// Sign-in providers send the browser back to this URL. signInWithProvider reads the
// code from it directly; if the app also opens the link (Android), just move on.
// On web this hands the URL back to the window that started sign-in.
WebBrowser.maybeCompleteAuthSession();

export default function AuthCallback() {
  return <Redirect href="/" />;
}
