package dev.nuwngc.botctl;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.NumberFormat;
import java.util.Locale;

/**
 * Cu 15 phut (gioi han toi thieu cua Android) hoi may chu xem co tien vao / giao dich chua khop / lenh nap cho duyet khong,
 * co viec moi thi bao bang thong bao. Chay duoc ca khi app dang tat.
 */
public class WatchJob extends JobService {
    private static final int JOB_ID = 4201;
    private static final String CHANNEL = "money";

    static void schedule(Context ctx, boolean on) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        if (!on) {
            js.cancel(JOB_ID);
            return;
        }
        JobInfo info = new JobInfo.Builder(JOB_ID, new ComponentName(ctx, WatchJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true)
                .build();
        js.schedule(info);
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    check();
                } catch (Exception ignored) {
                    // thua mot lan, 15 phut sau thu lai
                }
                jobFinished(params, false);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    private static String money(long n) {
        return NumberFormat.getInstance(new Locale("vi", "VN")).format(n);
    }

    private void check() throws Exception {
        SecureStore store = new SecureStore(this);
        if (!store.flag("watch")) return;
        ApiClient api = new ApiClient(store);
        if (!api.hasCredentials()) return;

        long after = store.plainLong("watch_after", -1);
        ApiClient.Result r = api.call("GET", "/admin/app/alerts?after=" + Math.max(after, 0), null, true);
        if (r.status != 200) return;
        JSONObject j = new JSONObject(r.text);
        long maxId = j.optLong("maxId", 0);

        if (after < 0) { // lan dau chi ghi nho moc, khong bao nhung gi da co tu truoc
            store.putPlainLong("watch_after", maxId);
            store.putPlainLong("watch_pending", j.optLong("pendingDeposits", 0));
            return;
        }

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Tiền vào và giao dịch", NotificationManager.IMPORTANCE_DEFAULT));

        JSONArray ev = j.optJSONArray("events");
        int id = (int) (System.currentTimeMillis() % 1000000);
        if (ev != null) {
            for (int i = 0; i < ev.length(); i++) {
                JSONObject e = ev.getJSONObject(i);
                long amount = e.optLong("amount", 0);
                String who = e.isNull("username") ? "" : e.optString("username", "");
                if ("credited".equals(e.optString("status"))) {
                    notify(nm, id++, "+" + money(amount) + " coin tự động", who.isEmpty() ? "Đã cộng vào ví" : "Đã cộng cho " + who);
                } else if ("unmatched".equals(e.optString("status"))) {
                    notify(nm, id++, "Tiền vào chưa khớp: " + money(amount) + "đ", e.optString("content", ""));
                }
            }
        }
        long pending = j.optLong("pendingDeposits", 0);
        if (pending > 0 && pending != store.plainLong("watch_pending", 0)) {
            notify(nm, id++, pending + " lệnh nạp đang chờ duyệt", "Mở botctl để xác nhận");
        }
        store.putPlainLong("watch_pending", pending);
        store.putPlainLong("watch_after", maxId);
    }

    private void notify(NotificationManager nm, int id, String title, String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        nm.notify(id, n);
    }
}
