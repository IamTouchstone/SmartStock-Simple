// services/alertsService.ts
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AlertType = 'LOW_STOCK' | 'EXPIRING_3_MONTHS' | 'EXPIRED' | 'MARKET_DAY';
export type SnoozeOption = 'DISMISS' | '30MIN' | '2HRS' | '3HRS' | '4HRS' | '24HRS';

const DISMISSED_KEY = 'smartstock_dismissed_alerts';
const SNOOZED_KEY = 'smartstock_snoozed_alerts';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Ask for permission once - call from _layout or Dashboard
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

async function getDismissed(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function getSnoozed(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ✅ Dashboard should call this to hide dismissed / snoozed alerts
export async function isAlertHidden(alertId: string): Promise<boolean> {
  const dismissed = await getDismissed();
  if (dismissed.includes(alertId)) return true;
  const snoozed = await getSnoozed();
  const until = snoozed[alertId];
  if (until && Date.now() < until) return true;
  return false;
}

export async function filterVisibleAlerts<T extends { id: string }>(alerts: T[]): Promise<T[]> {
  const dismissed = await getDismissed();
  const snoozed = await getSnoozed();
  const now = Date.now();
  return alerts.filter(a => {
    if (dismissed.includes(a.id)) return false;
    const until = snoozed[a.id];
    if (until && now < until) return false;
    return true;
  });
}

export async function snoozeAlert(alertId: string, option: SnoozeOption) {
  if (option === 'DISMISS') {
    const dismissed = await getDismissed();
    if (!dismissed.includes(alertId)) {
      dismissed.push(alertId);
      await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
    }
    return;
  }
  const mins: Record<string, number> = {
    '30MIN': 30,
    '2HRS': 120,
    '3HRS': 180,
    '4HRS': 240,
    '24HRS': 1440,
  };
  const minutes = mins[option] || 30;
  const until = Date.now() + minutes * 60000;
  const snoozed = await getSnoozed();
  snoozed[alertId] = until;
  await AsyncStorage.setItem(SNOOZED_KEY, JSON.stringify(snoozed));

  try {
    await Notifications.requestPermissionsAsync();
    await Notifications.scheduleNotificationAsync({
      content: { title: 'SmartStock Reminder', body: 'Your snoozed alert is back!' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: minutes * 60 },
    });
  } catch (e) {
    console.log('Notification schedule failed', e);
  }
}

// Clear all - useful for testing / logout
export async function clearAllSnoozedAlerts() {
  await AsyncStorage.removeItem(DISMISSED_KEY);
  await AsyncStorage.removeItem(SNOOZED_KEY);
}

export async function scheduleMarketDayReminder(marketDay: string) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const target = days.indexOf(marketDay);
  if (target === -1) return;
  try {
    await Notifications.requestPermissionsAsync();
    // Expo WEEKLY weekday: 1 = Sunday ... 7 = Saturday
    const weekday = target === 0 ? 1 : target + 1;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Market Day Tomorrow!', body: 'Tomorrow is Market Day. Check your low stock & expired items.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour: 18, minute: 0 },
    });
  } catch (e) {
    console.log('Market reminder failed', e);
  }
}