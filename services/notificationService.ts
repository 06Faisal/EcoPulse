/**
 * Notification Service — browser push notifications for EcoPulse.
 * Uses the Notifications API (no server required).
 */

const ICON = '/favicon.svg';
const DAILY_REMINDER_KEY = 'ecopulse_notification_hour';
let dailyTimerId: ReturnType<typeof setTimeout> | null = null;

// ─── Permission ──────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return await Notification.requestPermission();
}

export function getNotificationPermission(): NotificationPermission {
    if (!('Notification' in window)) return 'denied';
    return Notification.permission;
}

// ─── Send ────────────────────────────────────────────────────────────────────

export function sendNotification(title: string, body: string, tag?: string) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        new Notification(title, { body, icon: ICON, tag, badge: ICON });
    } catch {
        // Some browsers don't allow Notification from non-service-worker context
        if (navigator.serviceWorker?.controller) {
            navigator.serviceWorker.ready.then((reg) => {
                reg.showNotification(title, { body, icon: ICON, tag });
            }).catch(() => undefined);
        }
    }
}

// ─── Weekly goal nudge ───────────────────────────────────────────────────────

export function checkWeeklyGoalAndNotify(usedKg: number, goalKg: number) {
    if (!goalKg || Notification.permission !== 'granted') return;
    const pct = (usedKg / goalKg) * 100;

    const notifiedKey = `ecopulse_notified_week_${getWeekId()}`;
    const alreadyNotified = localStorage.getItem(notifiedKey);

    if (pct >= 100 && alreadyNotified !== 'over') {
        sendNotification(
            '⚠️ Weekly CO₂ budget exceeded!',
            `You've used ${usedKg.toFixed(1)} kg of your ${goalKg} kg weekly goal. Consider greener transport today.`,
            'weekly-goal-over'
        );
        localStorage.setItem(notifiedKey, 'over');
    } else if (pct >= 80 && !alreadyNotified) {
        sendNotification(
            '📊 EcoPulse: 80% of weekly goal reached',
            `${usedKg.toFixed(1)} kg used of ${goalKg} kg. You have ${(goalKg - usedKg).toFixed(1)} kg left this week.`,
            'weekly-goal-80'
        );
        localStorage.setItem(notifiedKey, '80');
    }
}

// ─── Daily reminder ──────────────────────────────────────────────────────────

export function scheduleDailyReminder(hour: number = 20) {
    localStorage.setItem(DAILY_REMINDER_KEY, String(hour));
    if (dailyTimerId) clearTimeout(dailyTimerId);
    fireAtHour(hour);
}

export function cancelDailyReminder() {
    if (dailyTimerId) clearTimeout(dailyTimerId);
    dailyTimerId = null;
    localStorage.removeItem(DAILY_REMINDER_KEY);
}

export function restoreDailyReminder() {
    const hour = localStorage.getItem(DAILY_REMINDER_KEY);
    if (hour && Notification.permission === 'granted') {
        fireAtHour(Number(hour));
    }
}

function fireAtHour(hour: number) {
    const now = new Date();
    const next = new Date();
    next.setHours(hour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const ms = next.getTime() - now.getTime();

    dailyTimerId = setTimeout(() => {
        sendNotification(
            '🌱 EcoPulse Daily Check-in',
            'Have you logged today\'s trips? Every journey counts toward your carbon goal!',
            'daily-reminder'
        );
        // Reschedule for next day
        dailyTimerId = setTimeout(() => fireAtHour(hour), 24 * 60 * 60 * 1000);
    }, ms);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeekId(): string {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Mon start
    const monday = new Date(now);
    monday.setDate(diff);
    return monday.toISOString().split('T')[0];
}
