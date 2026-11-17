import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "@/services/api";
import {
  answerRecycledNumber,
  completeOnboarding,
  isNewPasswordOk,
  loginWithEmail,
  normalizeEmail,
  requestEmailCode,
  verifyEmail,
  getConsentNotice,
  needsOnboarding,
  normalizePhone,
  parseBirthDate,
  requestOtp,
  resolveDeviceLimit,
  verifyOtp,
  type LoginStep,
} from "@/services/authService";
import { getViewer } from "@/services/session";

const RESEND_SECONDS = 30;

type Screen =
  | { name: "phone" }
  | { name: "code"; phone: string }
  | { name: "deviceLimit"; ticket: string; devices: { id: string; model?: unknown; platform?: unknown }[] }
  | { name: "recycled"; ticket: string }
  | { name: "emailLogin" }
  | { name: "emailCode"; email: string }
  | { name: "onboarding" };

/** What to tell the viewer for an error; the API's own detail is written for them. */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.type.replace("urn:ott:error:", "")) {
      case "otp-invalid":
        return "That code is not right. Check it and try again.";
      case "credentials-invalid":
        return "Wrong email or password.";
      case "otp-too-soon":
      case "otp-rate-limited":
      case "login-locked":
        return error.message || "Too many tries. Please wait a while and try again.";
      case "age-below-minimum":
        return "You need to be older to use this app.";
      case "device-limit-ticket-invalid":
        return "That took too long. Please log in again.";
      default:
        return error.message || "Something went wrong. Please try again.";
    }
  }
  return "Cannot reach the server. Check your connection and try again.";
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>(() =>
    needsOnboarding(getViewer()) ? { name: "onboarding" } : { name: "phone" },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }, []);

  /** A login attempt ends in one of these; each has its own screen. */
  const follow = useCallback((step: LoginStep) => {
    if (step.kind === "deviceLimit") {
      setScreen({ name: "deviceLimit", ticket: step.ticket, devices: step.devices });
    } else if (step.kind === "recycledNumber") {
      setScreen({ name: "recycled", ticket: step.ticket });
    } else if (needsOnboarding(step.viewer)) {
      setScreen({ name: "onboarding" });
    } else {
      router.back();
    }
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={styles.close}
      >
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {screen.name === "phone" && (
          <PhoneStep
            busy={busy}
            onSubmit={(phone) =>
              run(async () => {
                await requestOtp(phone);
                setScreen({ name: "code", phone });
              })
            }
            onInvalid={() => setError("Enter a valid mobile number.")}
            onUseEmail={() => {
              setError(null);
              setScreen({ name: "emailLogin" });
            }}
          />
        )}
        {screen.name === "emailLogin" && (
          <EmailLoginStep
            busy={busy}
            onSubmit={(email, password) => run(async () => follow(await loginWithEmail(email, password)))}
            onCreate={(email) =>
              run(async () => {
                await requestEmailCode(email);
                setScreen({ name: "emailCode", email });
              })
            }
            onInvalid={setError}
            onUsePhone={() => {
              setError(null);
              setScreen({ name: "phone" });
            }}
          />
        )}
        {screen.name === "emailCode" && (
          <EmailCodeStep
            email={screen.email}
            busy={busy}
            onSubmit={(code, password) => run(async () => follow(await verifyEmail(screen.email, code, password)))}
            onInvalid={setError}
            onBack={() => setScreen({ name: "emailLogin" })}
          />
        )}
        {screen.name === "code" && (
          <CodeStep
            phone={screen.phone}
            busy={busy}
            onSubmit={(code) => run(async () => follow(await verifyOtp(screen.phone, code)))}
            onResend={() => run(async () => void (await requestOtp(screen.phone)))}
            onChangeNumber={() => setScreen({ name: "phone" })}
          />
        )}
        {screen.name === "deviceLimit" && (
          <>
            <Text style={styles.title}>Too many devices</Text>
            <Text style={styles.hint}>Sign one out to log in here.</Text>
            {screen.devices.map((device) => (
              <TouchableOpacity
                key={device.id}
                style={styles.row}
                disabled={busy}
                onPress={() =>
                  run(async () => follow(await resolveDeviceLimit(screen.ticket, device.id)))
                }
              >
                <Text style={styles.rowText}>
                  {String(device.model ?? device.platform ?? "Device")}
                </Text>
                <Text style={styles.rowAction}>Sign out</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
        {screen.name === "recycled" && (
          <>
            <Text style={styles.title}>Welcome back?</Text>
            <Text style={styles.hint}>
              This number has not been used here for a while. Have you used it with this app before?
            </Text>
            <Button
              label="Yes, that was me"
              busy={busy}
              onPress={() => run(async () => follow(await answerRecycledNumber(screen.ticket, true)))}
            />
            <Button
              label="No, this is a new start"
              secondary
              busy={busy}
              onPress={() => run(async () => follow(await answerRecycledNumber(screen.ticket, false)))}
            />
          </>
        )}
        {screen.name === "onboarding" && (
          <OnboardingStep
            busy={busy}
            onSubmit={(input) =>
              run(async () => {
                await completeOnboarding(input);
                router.back();
              })
            }
            onError={setError}
          />
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

function Button(props: { label: string; onPress: () => void; busy: boolean; secondary?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.button, props.secondary && styles.buttonSecondary, props.busy && styles.disabled]}
      disabled={props.busy}
      accessibilityRole="button"
      onPress={props.onPress}
    >
      {props.busy ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>{props.label}</Text>}
    </TouchableOpacity>
  );
}

function PhoneStep(props: {
  busy: boolean;
  onSubmit: (phone: string) => void;
  onInvalid: () => void;
  onUseEmail: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <>
      <Text style={styles.title}>Log in</Text>
      <Text style={styles.hint}>We will send a code to your mobile number.</Text>
      <View style={styles.phoneRow}>
        <Text style={styles.prefix}>+91</Text>
        <TextInput
          style={[styles.input, styles.phoneInput]}
          value={value}
          onChangeText={setValue}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="Mobile number"
          placeholderTextColor="#777"
          maxLength={16}
          accessibilityLabel="Mobile number"
        />
      </View>
      <Button
        label="Send code"
        busy={props.busy}
        onPress={() => {
          const phone = normalizePhone(value);
          if (phone) props.onSubmit(phone);
          else props.onInvalid();
        }}
      />
      <TouchableOpacity onPress={props.onUseEmail}>
        <Text style={styles.link}>Use email instead</Text>
      </TouchableOpacity>
    </>
  );
}

function EmailLoginStep(props: {
  busy: boolean;
  onSubmit: (email: string, password: string) => void;
  onCreate: (email: string) => void;
  onInvalid: (message: string) => void;
  onUsePhone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const checked = () => {
    const normalized = normalizeEmail(email);
    if (!normalized) props.onInvalid("Enter a valid email address.");
    return normalized;
  };
  return (
    <>
      <Text style={styles.title}>Log in with email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="Email"
        placeholderTextColor="#777"
        accessibilityLabel="Email"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        placeholder="Password"
        placeholderTextColor="#777"
        accessibilityLabel="Password"
      />
      <Button
        label="Log in"
        busy={props.busy}
        onPress={() => {
          const normalized = checked();
          if (!normalized) return;
          if (!password) return props.onInvalid("Enter your password.");
          props.onSubmit(normalized, password);
        }}
      />
      <TouchableOpacity
        onPress={() => {
          const normalized = checked();
          if (normalized) props.onCreate(normalized);
        }}
      >
        <Text style={styles.link}>Create an account or forgot your password</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={props.onUsePhone}>
        <Text style={styles.link}>Use phone instead</Text>
      </TouchableOpacity>
    </>
  );
}

function EmailCodeStep(props: {
  email: string;
  busy: boolean;
  onSubmit: (code: string, password: string) => void;
  onInvalid: (message: string) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  return (
    <>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.hint}>We sent a 6-digit code to {props.email}. Enter it and choose a password.</Text>
      <TextInput
        style={[styles.input, styles.codeInput]}
        value={code}
        onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
        placeholder="••••••"
        placeholderTextColor="#555"
        accessibilityLabel="6-digit code"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder="New password (10 or more characters)"
        placeholderTextColor="#777"
        accessibilityLabel="New password"
      />
      <Button
        label="Continue"
        busy={props.busy}
        onPress={() => {
          if (code.length !== 6) return props.onInvalid("Enter the 6-digit code.");
          if (!isNewPasswordOk(password)) return props.onInvalid("Choose a password of 10 to 128 characters.");
          props.onSubmit(code, password);
        }}
      />
      <TouchableOpacity onPress={props.onBack}>
        <Text style={styles.link}>Back</Text>
      </TouchableOpacity>
    </>
  );
}

function CodeStep(props: {
  phone: string;
  busy: boolean;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onChangeNumber: () => void;
}) {
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(RESEND_SECONDS);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  return (
    <>
      <Text style={styles.title}>Enter the code</Text>
      <Text style={styles.hint}>Sent to {props.phone}</Text>
      <TextInput
        style={[styles.input, styles.codeInput]}
        value={code}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, "").slice(0, 6);
          setCode(digits);
          if (digits.length === 6 && !props.busy) props.onSubmit(digits);
        }}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus
        placeholder="••••••"
        placeholderTextColor="#555"
        accessibilityLabel="6-digit code"
      />
      <Button label="Log in" busy={props.busy} onPress={() => code.length === 6 && props.onSubmit(code)} />
      <TouchableOpacity
        disabled={wait > 0 || props.busy}
        onPress={() => {
          setWait(RESEND_SECONDS);
          props.onResend();
        }}
      >
        <Text style={[styles.link, wait > 0 && styles.disabled]}>
          {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={props.onChangeNumber}>
        <Text style={styles.link}>Change number</Text>
      </TouchableOpacity>
    </>
  );
}

function OnboardingStep(props: {
  busy: boolean;
  onError: (message: string) => void;
  onSubmit: (input: {
    dateOfBirth: string;
    noticeId: string;
    recommendations: boolean;
    analytics: boolean;
    marketing: boolean;
  }) => void;
}) {
  const [dob, setDob] = useState("");
  const [recommendations, setRecommendations] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [notice, setNotice] = useState<{ id: string; url: string } | null>(null);
  const { onError } = props;

  useEffect(() => {
    getConsentNotice()
      .then((response) => setNotice({ id: response.notice.id, url: response.notice.url }))
      .catch((err) => onError(messageFor(err)));
  }, [onError]);

  return (
    <>
      <Text style={styles.title}>Almost there</Text>
      <Text style={styles.hint}>Your date of birth keeps content suitable for you.</Text>
      <TextInput
        style={styles.input}
        value={dob}
        onChangeText={setDob}
        placeholder="Date of birth (YYYY-MM-DD)"
        placeholderTextColor="#777"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        accessibilityLabel="Date of birth"
      />
      <Text style={styles.hint}>
        We use your details to run the app, play videos and support you. These are optional and off
        unless you turn them on.
      </Text>
      <Choice label="Recommendations from what I watch" value={recommendations} onChange={setRecommendations} />
      <Choice label="Help improve the app (analytics)" value={analytics} onChange={setAnalytics} />
      <Choice label="Offers and updates" value={marketing} onChange={setMarketing} />
      {notice && (
        <TouchableOpacity onPress={() => Linking.openURL(notice.url)}>
          <Text style={styles.link}>Read the privacy notice</Text>
        </TouchableOpacity>
      )}
      <Button
        label="Continue"
        busy={props.busy || !notice}
        onPress={() => {
          const dateOfBirth = parseBirthDate(dob);
          if (!dateOfBirth) return props.onError("Enter your date of birth as YYYY-MM-DD.");
          if (notice) props.onSubmit({ dateOfBirth, noticeId: notice.id, recommendations, analytics, marketing });
        }}
      />
    </>
  );
}

function Choice(props: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.choice}>
      <Text style={styles.rowText}>{props.label}</Text>
      <Switch value={props.value} onValueChange={props.onChange} accessibilityLabel={props.label} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  close: { alignSelf: "flex-end", padding: 16 },
  closeText: { color: "#FFFFFF", fontSize: 20 },
  body: { paddingHorizontal: 24, gap: 14 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "700" },
  hint: { color: "#B3B3B3", fontSize: 14, lineHeight: 20 },
  input: { backgroundColor: "#1A1A1A", color: "#FFFFFF", borderRadius: 10, paddingHorizontal: 14, height: 52, fontSize: 16 },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  prefix: { color: "#FFFFFF", fontSize: 16 },
  phoneInput: { flex: 1 },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: "center" },
  button: { backgroundColor: "#FFFFFF", borderRadius: 10, height: 52, alignItems: "center", justifyContent: "center" },
  buttonSecondary: { backgroundColor: "#CCCCCC" },
  buttonText: { color: "#000000", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  link: { color: "#FFFFFF", textAlign: "center", paddingVertical: 8, textDecorationLine: "underline" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1A1A1A", borderRadius: 10, padding: 16 },
  rowText: { color: "#FFFFFF", fontSize: 15, flex: 1 },
  rowAction: { color: "#FF6B6B", fontSize: 14 },
  choice: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  error: { color: "#FF6B6B", fontSize: 14 },
});
