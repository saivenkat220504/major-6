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
    private static final String CHANNEL_ID = "flight_alerts_v2";
    private static final int REQUEST_NOTIFICATION_PERMISSION = 102;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Create the high-importance notification channel natively so it is
        // ready before any FCM message arrives (even before JS initialises).
        createFlightAlertChannel();

        // Pre-emptively request runtime permissions
        requestRequiredPermissions();
    }

    /**
     * Create the 'flight_alerts_v2' notification channel with IMPORTANCE_HIGH.
     * Android only honours the importance / sound / vibration settings when the
     * channel is FIRST created — the new channel ID ensures we bypass any
     * previously-cached silent channel.
     */
    private void createFlightAlertChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Flight Alerts",
                NotificationManager.IMPORTANCE_HIGH   // Shows heads-up banner, plays sound, vibrates
            );
            channel.setDescription("Real-time gate and terminal change alerts for your flight");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 300, 200, 300}); // Off/On/Off/On ms
            channel.enableLights(true);

            // Attach default notification sound using AudioAttributes
            AudioAttributes audioAttr = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            channel.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, audioAttr);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
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
