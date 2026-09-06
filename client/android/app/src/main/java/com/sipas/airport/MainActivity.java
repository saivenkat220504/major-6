package com.sipas.airport;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.Manifest;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int REQUEST_NOTIFICATION_PERMISSION = 102;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Create notification channels natively before any FCM message arrives
        createNotificationChannels();

        // Pre-emptively request runtime permissions
        requestRequiredPermissions();
    }

    /**
     * Creates all notification channels the server may target.
     * IMPORTANT: Android caches channel settings on first creation.
     * Both v2 (legacy) and v3 (current server target) are created
     * with IMPORTANCE_HIGH + strong vibration to guarantee delivery.
     *
     * Server currently sends to: flight_alerts_v3
     * Vibration pattern: [wait, vibrate, pause, vibrate, pause, vibrate] ms
     */
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        // Strong vibration pattern: 500ms on, 300ms off, repeated 3 times
        long[] vibrationPattern = new long[]{0, 500, 300, 500, 300, 500};

        AudioAttributes audioAttr = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        // ── Channel v3 (CURRENT — server sends here) ──────────────────────────
        NotificationChannel channelV3 = new NotificationChannel(
            "flight_alerts_v3",
            "Flight & Baggage Alerts",
            NotificationManager.IMPORTANCE_HIGH
        );
        channelV3.setDescription("Real-time flight delay, gate change and baggage arrival alerts");
        channelV3.enableVibration(true);
        channelV3.setVibrationPattern(vibrationPattern);
        channelV3.enableLights(true);
        channelV3.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, audioAttr);
        manager.createNotificationChannel(channelV3);

        // ── Channel v2 (LEGACY — kept for backward compatibility) ─────────────
        NotificationChannel channelV2 = new NotificationChannel(
            "flight_alerts_v2",
            "Flight Alerts (Legacy)",
            NotificationManager.IMPORTANCE_HIGH
        );
        channelV2.setDescription("Legacy flight alert channel");
        channelV2.enableVibration(true);
        channelV2.setVibrationPattern(vibrationPattern);
        channelV2.enableLights(true);
        channelV2.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, audioAttr);
        manager.createNotificationChannel(channelV2);
    }

    /**
     * Request all required runtime permissions on launch.
     * POST_NOTIFICATIONS is mandatory on Android 13+ (API 33+).
     */
    private void requestRequiredPermissions() {
        java.util.List<String> needed = new java.util.ArrayList<>();

        String[] perms;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms = new String[]{
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.CAMERA,
                Manifest.permission.POST_NOTIFICATIONS
            };
        } else {
            perms = new String[]{
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.CAMERA
            };
        }

        for (String perm : perms) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needed.add(perm);
            }
        }

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), REQUEST_NOTIFICATION_PERMISSION);
        }
    }
}
