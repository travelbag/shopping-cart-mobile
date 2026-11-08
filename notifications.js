import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";

const PROD_API_BASE = "https://api.littlekart.com";
let customerApiBase = PROD_API_BASE;

export function setCustomerApiBase(url) {
  customerApiBase = String(url || PROD_API_BASE).replace(/\/+$/, "");
}
const CHANNEL_ID = "default";
const TOKEN_KEY = "@lk/pushToken";
const PHONE_KEY = "@lk/customerPhone";
const AUTH_KEY = "@lk/customerAccessToken";
const HANDLED_KEY = "@lk/lastPushNavId";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function logPush(message, extra) {
  if (extra === undefined) {
    console.log(`[LittleKart push] ${message}`);
    return;
  }
  console.log(`[LittleKart push] ${message}`, extra);
}

function summarizePermissions(perm) {
  const ios = perm?.ios || {};
  return {
    status: perm?.status || "unknown",
    granted: Boolean(perm?.granted),
    canAskAgain: Boolean(perm?.canAskAgain),
    ios: {
      allowsAlert: ios?.allowsAlert ?? null,
      allowsBadge: ios?.allowsBadge ?? null,
      allowsSound: ios?.allowsSound ?? null,
      allowsCriticalAlerts: ios?.allowsCriticalAlerts ?? null,
      alertStyle: ios?.alertStyle ?? null,
      authorizationStatus: ios?.status ?? null,
    },
  };
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Orders and offers",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: "default",
  });
}

async function ensurePermission() {
  const current = await Notifications.getPermissionsAsync();
  logPush("permission status", current.status);
  logPush("permission details", summarizePermissions(current));
  if (current.status === "granted") return true;

  const asked = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  logPush("permission request result", asked.status);
  logPush("permission request details", summarizePermissions(asked));
  return asked.status === "granted";
}

async function fetchExpoPushToken() {
  if (!Device.isDevice) {
    logPush("token fetch skipped: simulator has no push token");
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    logPush("token fetch failed: missing EAS project id");
    return null;
  }

  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = result?.data;
    if (!token) {
      logPush("token fetch failed: empty token");
      return null;
    }
    const previous = await AsyncStorage.getItem(TOKEN_KEY);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    const tokenHint = `...${String(token).slice(-8)}`;
    if (previous && previous !== token) {
      logPush("push token changed; will re-register", `${Platform.OS} ${tokenHint}`);
    } else {
      logPush("token fetch success", `${Platform.OS} ${tokenHint}`);
    }
    return { token, changed: Boolean(previous && previous !== token) };
  } catch (error) {
    logPush("token fetch failed", String(error));
    return null;
  }
}

function cleanSessionToken(value) {
  let token = String(value || "").trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  return token;
}

async function postCustomer(path, body, accessToken) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${customerApiBase}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${text.slice(0, 180)}`);
  }
  logPush(`${path} success`);
}

export async function registerCustomerToken(customerPhone, accessToken) {
  const phone = String(customerPhone || "").trim();
  if (!phone) {
    logPush("register skipped: missing customerPhone");
    return;
  }

  const granted = await ensurePermission();
  if (!granted) {
    logPush("register skipped: notification permission denied");
    return;
  }

  const tokenResult = await fetchExpoPushToken();
  const token = tokenResult?.token ?? (await AsyncStorage.getItem(TOKEN_KEY));
  if (!token) {
    logPush("register skipped: no push token");
    return;
  }

  const previousPhone = await AsyncStorage.getItem(PHONE_KEY);
  if (previousPhone && previousPhone !== phone) {
    await unregisterCustomerToken(previousPhone, { switchingAccount: true });
    await AsyncStorage.removeItem(AUTH_KEY);
  }

  await AsyncStorage.setItem(PHONE_KEY, phone);
  if (accessToken) {
    await AsyncStorage.setItem(AUTH_KEY, accessToken);
  }

  const storedAuth = cleanSessionToken(
    accessToken || (await AsyncStorage.getItem(AUTH_KEY)) || ""
  );
  if (storedAuth) {
    await AsyncStorage.setItem(AUTH_KEY, storedAuth);
  }
  logPush(
    "register posting",
    storedAuth ? `session token attached ${customerApiBase}` : `no session token ${customerApiBase}`
  );
  try {
    await postCustomer(
      "/api/customers/register-token",
      {
        customerPhone: phone,
        pushToken: token,
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version ?? "unknown",
      },
      storedAuth
    );
  } catch (error) {
    logPush("register failed", String(error));
  }
}

export async function unregisterCustomerToken(customerPhone, options = {}) {
  const phone = String(
    customerPhone || (await AsyncStorage.getItem(PHONE_KEY)) || ""
  ).trim();
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const accessToken = (await AsyncStorage.getItem(AUTH_KEY)) || undefined;

  if (!phone || !token) {
    logPush("unregister skipped: missing phone or token");
  } else {
    try {
      await postCustomer(
        "/api/customers/unregister-token",
        { customerPhone: phone, pushToken: token },
        accessToken
      );
    } catch (error) {
      logPush("unregister failed", String(error));
    }
  }

  if (!options.switchingAccount) {
    await AsyncStorage.multiRemove([PHONE_KEY, AUTH_KEY]);
  }
}

let preparing = false;

export async function getCustomerPushRegistration() {
  const granted = await ensurePermission();
  if (!granted) return null;

  const tokenResult = await fetchExpoPushToken();
  const pushToken = tokenResult?.token ?? (await AsyncStorage.getItem(TOKEN_KEY));
  if (!pushToken) return null;

  return {
    pushToken,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? "unknown",
  };
}

export async function preparePushNotifications() {
  if (preparing) return null;
  preparing = true;
  try {
    await ensureAndroidChannel();
    const granted = await ensurePermission();
    if (!granted) return null;

    const tokenResult = await fetchExpoPushToken();
    const phone = await AsyncStorage.getItem(PHONE_KEY);
    if (phone && tokenResult?.token) {
      const accessToken = (await AsyncStorage.getItem(AUTH_KEY)) || undefined;
      await registerCustomerToken(phone, accessToken);
    }
    return tokenResult?.token ?? null;
  } catch (error) {
    logPush("setup failed", String(error));
    return null;
  } finally {
    preparing = false;
  }
}

export function addNotificationListeners({ onResponse, onReceived }) {
  const responseSub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      logPush("notification tapped");
      onResponse(response);
    }
  );
  const receivedSub = Notifications.addNotificationReceivedListener(
    (notification) => {
      logPush(
        "notification received",
        `${notification?.request?.content?.title ?? "(no title)"} [appState:${AppState.currentState}]`
      );
      onReceived?.(notification);
    }
  );
  const tokenSub = Notifications.addPushTokenListener(() => {
    preparePushNotifications().catch((error) => {
      logPush("token refresh failed", String(error));
    });
  });

  return () => {
    responseSub.remove();
    receivedSub.remove();
    tokenSub.remove();
  };
}

export function getLastNotificationResponse() {
  return Notifications.getLastNotificationResponseAsync();
}

export async function clearAppBadge() {
  try {
    await Notifications.setBadgeCountAsync(0);
    logPush("app badge cleared");
  } catch (error) {
    logPush("badge clear failed", String(error));
  }
}

function pathFromValue(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "littlekart.com" || url.hostname.endsWith(".littlekart.com")) {
      return `${url.pathname}${url.search}${url.hash}` || "/";
    }
  } catch (_) {
    return null;
  }
  return null;
}

export function parsePushPayload(response) {
  const request = response?.notification?.request;
  let data = request?.content?.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (_) {
      logPush("notification data invalid JSON");
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    logPush("notification data missing");
    return null;
  }

  const webPath =
    pathFromValue(data.webPath) ||
    pathFromValue(data.route) ||
    pathFromValue(data.deepLink);
  const route =
    webPath || (typeof data.route === "string" ? data.route.trim() : null);
  const deepLink = typeof data.deepLink === "string" ? data.deepLink.trim() : null;

  if (!route && !deepLink) {
    logPush("notification data missing route");
    return null;
  }

  return {
    id: request?.identifier ?? null,
    type: typeof data.type === "string" ? data.type : null,
    route,
    webPath,
    deepLink,
    campaignId: data.campaignId ?? null,
    orderId: data.orderId ?? null,
  };
}

export async function wasNotificationHandled(id) {
  if (!id) return false;
  return (await AsyncStorage.getItem(HANDLED_KEY)) === id;
}

export async function markNotificationHandled(id) {
  if (!id) return;
  await AsyncStorage.setItem(HANDLED_KEY, id);
}
